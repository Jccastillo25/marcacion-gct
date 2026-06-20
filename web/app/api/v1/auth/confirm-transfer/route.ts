import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {
  getSessionById,
  updateSessionStatus,
  getActiveSessions,
  auditLog,
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

interface ConfirmTransferRequest {
  session_id: number;
  action: "accept" | "reject";
}

/**
 * POST /api/v1/auth/confirm-transfer
 * Confirma la transferencia de sesión desde el dispositivo anterior
 */
export async function POST(request: NextRequest) {
  try {
    // Validar autenticación
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let decoded: any;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
    }

    try {
      decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    } catch {
      return NextResponse.json(
        { error: "Token inválido" },
        { status: 401 }
      );
    }

    const userId = decoded.id;
    const body: ConfirmTransferRequest = await request.json();
    const { session_id, action } = body;

    if (!session_id || !["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "session_id y action son requeridos" },
        { status: 400 }
      );
    }

    // ========================================
    // 1. OBTENER SESIÓN PENDIENTE
    // ========================================
    const pendingSession = await getSessionById(session_id);

    if (!pendingSession) {
      return NextResponse.json(
        { error: "Sesión no encontrada" },
        { status: 404 }
      );
    }

    if (pendingSession.userId !== userId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    if (pendingSession.status !== "PENDING_TRANSFER") {
      return NextResponse.json(
        { error: "Sesión no está en estado PENDING_TRANSFER" },
        { status: 400 }
      );
    }

    // ========================================
    // 2. PROCESAR SEGÚN ACTION
    // ========================================
    if (action === "accept") {
      // Marcar sesión anterior como TRANSFERRED
      const activeSessions = await getActiveSessions(
        userId,
        pendingSession.deviceId
      );

      if (activeSessions.length > 0) {
        for (const session of activeSessions) {
          await updateSessionStatus(session.id, "TRANSFERRED");
        }

        // Registrar en auditoría
        await auditLog(userId, "TRANSFER_ACCEPTED", {
          sessionId: session_id,
          deviceId: pendingSession.deviceId,
          metadata: {
            transferredSessions: activeSessions.map((s) => s.id),
          },
        });
      }

      // Activar sesión nueva
      await updateSessionStatus(session_id, "ACTIVE");

      // Generar nuevo token
      const newToken = jwt.sign(
        {
          id: userId,
          aud: "authenticated",
        },
        jwtSecret,
        { expiresIn: "8h" }
      );

      return NextResponse.json(
        {
          status: "transferred",
          token: newToken,
          session_id,
        },
        { status: 200 }
      );
    } else if (action === "reject") {
      // Rechazar transferencia
      await updateSessionStatus(session_id, "REVOKED");

      // Registrar en auditoría
      await auditLog(userId, "TRANSFER_REJECTED", {
        sessionId: session_id,
        deviceId: pendingSession.deviceId,
      });

      return NextResponse.json(
        {
          status: "rejected",
          message: "Transferencia rechazada",
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Confirm transfer error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
