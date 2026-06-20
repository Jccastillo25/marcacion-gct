import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {
  generateFingerprint,
  generateDeviceId,
  getSystemConfig,
  getActiveSessions,
  createSession,
  auditLog,
  isNewDevice,
} from "@/lib/services/sessions/sessionService";

let _client: SupabaseClient | null = null;
const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    if (!_client) {
      _client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    }
    return Reflect.get(_client, prop);
  },
});

interface LoginRequest {
  email: string;
  password: string;
  device_id?: string;
}

/**
 * POST /api/v1/auth/login
 * Autentica el usuario y maneja transferencia de sesiones
 */
export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const { email, password, device_id } = body;

    // Validar entrada
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    // ========================================
    // 1. VALIDAR CREDENCIALES
    // ========================================
    const { data: signInData, error: signInError } = await supabase.auth
      .signInWithPassword({
        email,
        password,
      });

    if (signInError || !signInData.user) {
      await auditLog(
        email, // Usar email como identificador temporal
        "LOGIN_FAILED",
        {
          ipAddress: request.headers.get("x-forwarded-for") || "",
          userAgent: request.headers.get("user-agent") || "",
        }
      );

      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const user = signInData.user;
    const userId = user.id;

    // ========================================
    // 2. DETECTAR DISPOSITIVO
    // ========================================
    const deviceInfo = {
      userAgent: request.headers.get("user-agent") || "unknown",
      ip: request.headers.get("x-forwarded-for") || "127.0.0.1",
      acceptLanguage: request.headers.get("accept-language") || "en",
    };

    const fingerprint = generateFingerprint(deviceInfo);
    const newDeviceId = device_id || generateDeviceId();
    const ipAddress = deviceInfo.ip;

    // ========================================
    // 3. VERIFICAR SI ES DISPOSITIVO NUEVO
    // ========================================
    const isNew = await isNewDevice(userId, newDeviceId, fingerprint);

    // ========================================
    // 4. BUSCAR SESIONES ACTIVAS EN OTROS DISPOSITIVOS
    // ========================================
    const activeSessions = await getActiveSessions(
      userId,
      newDeviceId // Excluir el dispositivo actual
    );

    const config = await getSystemConfig();

    // ========================================
    // 5. SI HAY SESIÓN ACTIVA EN OTRO DISPOSITIVO: TRANSFERENCIA REQUERIDA
    // ========================================
    if (activeSessions.length > 0 && !config.allowMultipleSessions) {
      const previousSession = activeSessions[0];

      // Crear sesión TENTATIVA
      const pendingSession = await createSession({
        userId,
        deviceId: newDeviceId,
        deviceName: generateDeviceName(deviceInfo),
        ipAddress,
        userAgent: deviceInfo.userAgent,
        fingerprint,
        status: "PENDING_TRANSFER",
      });

      if (pendingSession) {
        // Registrar evento de transferencia iniciada
        await auditLog(userId, "TRANSFER_INITIATED", {
          sessionId: pendingSession.id,
          deviceId: newDeviceId,
          ipAddress,
          userAgent: deviceInfo.userAgent,
          metadata: {
            previousDevice: previousSession.device_name,
            previousDeviceId: previousSession.device_id,
          },
        });

        // Retornar respuesta de conflicto
        return NextResponse.json(
          {
            error: "TRANSFER_PENDING",
            session_id: pendingSession.id,
            previous_device: {
              name: previousSession.device_name,
              ip: previousSession.ip_address,
              last_login: previousSession.last_activity,
            },
            retry_after: config.transferAlertTimeoutSeconds,
          },
          { status: 409 }
        );
      }
    }

    // ========================================
    // 6. SIN SESIÓN ACTIVA: CREAR DIRECTAMENTE
    // ========================================
    const sessionExpiresAt = new Date(
      Date.now() + config.maxSessionDurationMinutes * 60 * 1000
    );

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
    }

    const token = jwt.sign(
      {
        id: userId,
        email: user.email,
        aud: "authenticated",
      },
      jwtSecret,
      { expiresIn: "8h" }
    );

    const newSession = await createSession({
      userId,
      deviceId: newDeviceId,
      deviceName: generateDeviceName(deviceInfo),
      ipAddress,
      userAgent: deviceInfo.userAgent,
      fingerprint,
      status: "ACTIVE",
    });

    if (!newSession) {
      return NextResponse.json(
        { error: "Error al crear sesión" },
        { status: 500 }
      );
    }

    // Registrar login
    await auditLog(userId, "LOGIN", {
      sessionId: newSession.id,
      deviceId: newDeviceId,
      ipAddress,
      userAgent: deviceInfo.userAgent,
      metadata: {
        isNewDevice: isNew,
      },
    });

    // ========================================
    // 7. RETORNAR RESPUESTA EXITOSA
    // ========================================
    return NextResponse.json(
      {
        token,
        user: {
          id: userId,
          email: user.email,
        },
        session: {
          id: newSession.id,
          device_id: newDeviceId,
          expires_at: sessionExpiresAt.toISOString(),
        },
        config: {
          inactivity_timeout_minutes:
            config.inactivityTimeoutMinutes,
          max_session_duration_minutes:
            config.maxSessionDurationMinutes,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * Genera un nombre amigable para el dispositivo
 */
function generateDeviceName(deviceInfo: {
  userAgent: string;
  ip: string;
}): string {
  const ua = deviceInfo.userAgent;

  if (ua.includes("Chrome")) {
    if (ua.includes("Windows")) return "Chrome en Windows";
    if (ua.includes("Mac")) return "Chrome en macOS";
    if (ua.includes("Linux")) return "Chrome en Linux";
    return "Chrome";
  } else if (ua.includes("Firefox")) {
    return "Firefox";
  } else if (ua.includes("Safari")) {
    return "Safari en macOS";
  } else if (ua.includes("Edge")) {
    return "Edge";
  }

  return "Dispositivo desconocido";
}
