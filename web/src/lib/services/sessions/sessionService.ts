import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

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

interface DeviceInfo {
  userAgent: string;
  ip: string;
  acceptLanguage: string;
}

interface SessionCreateParams {
  userId: string;
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
  status?: "ACTIVE" | "PENDING_TRANSFER";
}

interface SessionResponse {
  id: number;
  userId: string;
  deviceId: string;
  deviceName: string;
  status: string;
  expiresAt: string;
  token?: string;
}

/**
 * Genera un fingerprint SHA256 basado en device info
 */
export function generateFingerprint(deviceInfo: DeviceInfo): string {
  const data = [
    deviceInfo.userAgent,
    deviceInfo.ip,
    deviceInfo.acceptLanguage,
  ].join("|");

  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Genera un nuevo device ID (UUID)
 */
export function generateDeviceId(): string {
  return uuidv4();
}

/**
 * Obtiene la configuraci├│n de sistema
 */
export async function getSystemConfig() {
  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("key, value, type");

    if (error) throw error;

    const config: Record<string, any> = {};
    data?.forEach((item) => {
      if (item.type === "int") {
        config[item.key] = parseInt(item.value);
      } else if (item.type === "bool") {
        config[item.key] = item.value === "true";
      } else {
        config[item.key] = item.value;
      }
    });

    return {
      inactivityTimeoutMinutes: config.inactivity_timeout_minutes || 30,
      maxSessionDurationMinutes: config.max_session_duration_minutes || 480,
      transferAlertTimeoutSeconds: config.transfer_alert_timeout_seconds || 60,
      allowMultipleSessions: config.allow_multiple_sessions || false,
      require2faNewDevice: config.require_2fa_new_device || false,
    };
  } catch (error) {
    console.error("Error fetching system config:", error);
    // Retornar valores por defecto si falla
    return {
      inactivityTimeoutMinutes: 30,
      maxSessionDurationMinutes: 480,
      transferAlertTimeoutSeconds: 60,
      allowMultipleSessions: false,
      require2faNewDevice: false,
    };
  }
}

/**
 * Obtiene sesiones activas de un usuario (excluyendo un dispositivo)
 */
export async function getActiveSessions(
  userId: string,
  excludeDeviceId?: string
) {
  try {
    let query = supabase
      .from("sessions")
      .select(
        "id, device_id, device_name, ip_address, last_activity, expires_at, status"
      )
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .gt("expires_at", new Date().toISOString());

    if (excludeDeviceId) {
      query = query.neq("device_id", excludeDeviceId);
    }

    const { data, error } = await query.order("last_activity", {
      ascending: false,
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching active sessions:", error);
    return [];
  }
}

/**
 * Crea una nueva sesi├│n
 */
export async function createSession(
  params: SessionCreateParams
): Promise<SessionResponse | null> {
  try {
    const config = await getSystemConfig();
    const expiresAt = new Date(
      Date.now() + config.maxSessionDurationMinutes * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        user_id: params.userId,
        device_id: params.deviceId,
        device_name: params.deviceName,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        fingerprint: params.fingerprint,
        status: params.status || "ACTIVE",
        expires_at: expiresAt,
        last_activity: new Date().toISOString(),
      })
      .select();

    if (error) throw error;

    // Crear o actualizar dispositivo
    await createOrUpdateDevice(params.userId, params.deviceId, {
      fingerprint: params.fingerprint,
      deviceName: params.deviceName,
      userAgent: params.userAgent,
    });

    if (data && data.length > 0) {
      return {
        id: data[0].id,
        userId: data[0].user_id,
        deviceId: data[0].device_id,
        deviceName: data[0].device_name,
        status: data[0].status,
        expiresAt: data[0].expires_at,
      };
    }

    return null;
  } catch (error) {
    console.error("Error creating session:", error);
    throw error;
  }
}

/**
 * Crea o actualiza un dispositivo
 */
export async function createOrUpdateDevice(
  userId: string,
  deviceId: string,
  details: {
    fingerprint: string;
    deviceName: string;
    userAgent: string;
  }
) {
  try {
    // Intentar actualizar primero
    const { data: existing } = await supabase
      .from("devices")
      .select("id")
      .eq("id", deviceId)
      .single();

    if (existing) {
      // Actualizar dispositivo existente
      const { error } = await supabase
        .from("devices")
        .update({
          fingerprint: details.fingerprint,
          device_name: details.deviceName,
          user_agent: details.userAgent,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deviceId);

      if (error) throw error;
    } else {
      // Crear nuevo dispositivo
      const { error } = await supabase.from("devices").insert({
        id: deviceId,
        user_id: userId,
        fingerprint: details.fingerprint,
        device_name: details.deviceName,
        user_agent: details.userAgent,
        last_seen: new Date().toISOString(),
      });

      if (error) throw error;
    }
  } catch (error) {
    console.error("Error creating/updating device:", error);
    // No throw aqu├¡ porque no es cr├¡tico si falla
  }
}

/**
 * Actualiza el estado de una sesi├│n
 */
export async function updateSessionStatus(
  sessionId: number,
  status: "ACTIVE" | "TRANSFERRED" | "REVOKED" | "EXPIRED" | "PENDING_TRANSFER"
) {
  try {
    const { error } = await supabase
      .from("sessions")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error updating session status:", error);
    throw error;
  }
}

/**
 * Obtiene una sesi├│n por ID
 */
export async function getSessionById(
  sessionId: number
): Promise<SessionResponse | null> {
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error && error.code === "PGRST116") {
      // Registro no encontrado
      return null;
    }

    if (error) throw error;

    return data
      ? {
          id: data.id,
          userId: data.user_id,
          deviceId: data.device_id,
          deviceName: data.device_name,
          status: data.status,
          expiresAt: data.expires_at,
        }
      : null;
  } catch (error) {
    console.error("Error getting session:", error);
    throw error;
  }
}

/**
 * Registra un evento en auditor├¡a
 */
export async function auditLog(
  userId: string,
  action: string,
  details: {
    sessionId?: number;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action,
      resource_type: "SESSION",
      resource_id: details.deviceId || null,
      ip_address: details.ipAddress || null,
      user_agent: details.userAgent || null,
      details: JSON.stringify(details.metadata || {}),
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
  } catch (error) {
    console.error("Error logging audit event:", error);
    // No throw aqu├¡ porque es no-cr├¡tico
  }
}

/**
 * Limpia sesiones expiradas
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("cleanup_expired_sessions");

    if (error) throw error;
    return data?.[0]?.cleaned_count || 0;
  } catch (error) {
    console.error("Error cleaning up expired sessions:", error);
    return 0;
  }
}

/**
 * Valida si un dispositivo es nuevo comparando fingerprint
 */
export async function isNewDevice(
  userId: string,
  deviceId: string,
  fingerprint: string
): Promise<boolean> {
  try {
    // Si el device_id no existe, es nuevo
    const { data: device } = await supabase
      .from("devices")
      .select("id, fingerprint")
      .eq("id", deviceId)
      .single();

    if (!device) {
      return true;
    }

    // Si el fingerprint cambi├│, es posiblemente un nuevo dispositivo
    return device.fingerprint !== fingerprint;
  } catch (error) {
    console.error("Error checking if device is new:", error);
    // Asumir que es nuevo si hay error
    return true;
  }
}
