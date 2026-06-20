import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ValidatedSession {
  userId: string;
  sessionId: number;
  deviceId: string;
  expiresAt: string;
  lastActivity: string;
}

/**
 * Valida una sesión a partir del JWT token
 */
export async function validateSession(
  token: string
): Promise<{ valid: boolean; session?: ValidatedSession; error?: string }> {
  try {
    // Decodificar JWT
    let decoded: any;
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return { valid: false, error: "Error de configuración del servidor" };
    }
    try {
      decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    } catch (error) {
      return { valid: false, error: "Token inválido o expirado" };
    }

    const userId = decoded.id;

    // Obtener sesión activa del usuario
    const { data: sessions, error } = await supabase
      .from("sessions")
      .select("id, device_id, expires_at, last_activity, status")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .order("last_activity", { ascending: false });

    if (error) {
      console.error("Error validating session:", error);
      return { valid: false, error: "Error al validar sesión" };
    }

    if (!sessions || sessions.length === 0) {
      return { valid: false, error: "No hay sesión activa" };
    }

    const session = sessions[0];

    // Verificar si la sesión ha expirado
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return { valid: false, error: "Sesión expirada" };
    }

    return {
      valid: true,
      session: {
        userId,
        sessionId: session.id,
        deviceId: session.device_id,
        expiresAt: session.expires_at,
        lastActivity: session.last_activity,
      },
    };
  } catch (error) {
    console.error("Unexpected error in validateSession:", error);
    return { valid: false, error: "Error inesperado" };
  }
}

/**
 * Actualiza la última actividad de una sesión
 */
export async function updateSessionActivity(
  sessionId: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("sessions")
      .update({
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      console.error("Error updating session activity:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Unexpected error in updateSessionActivity:", error);
    return false;
  }
}

/**
 * Verifica si una sesión ha sido inactiva demasiado tiempo
 */
export async function checkSessionInactivity(
  sessionId: number,
  timeoutMinutes: number
): Promise<{ isInactive: boolean; minutesInactive: number }> {
  try {
    const { data: session, error } = await supabase
      .from("sessions")
      .select("last_activity")
      .eq("id", sessionId)
      .single();

    if (error || !session) {
      return { isInactive: true, minutesInactive: timeoutMinutes + 1 };
    }

    const lastActivity = new Date(session.last_activity);
    const now = new Date();
    const minutesInactive =
      (now.getTime() - lastActivity.getTime()) / (1000 * 60);

    return {
      isInactive: minutesInactive > timeoutMinutes,
      minutesInactive: Math.floor(minutesInactive),
    };
  } catch (error) {
    console.error("Error checking session inactivity:", error);
    return { isInactive: true, minutesInactive: Infinity };
  }
}

/**
 * Expira una sesión manualmente
 */
export async function expireSession(
  sessionId: number,
  reason: string = "unknown"
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("sessions")
      .update({
        status: "EXPIRED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      console.error("Error expiring session:", error);
      return false;
    }

    // Log del evento
    // await auditLog(...) aquí si lo necesitas

    return true;
  } catch (error) {
    console.error("Unexpected error in expireSession:", error);
    return false;
  }
}

/**
 * Obtiene toda la información de una sesión
 */
export async function getSessionDetails(sessionId: number) {
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error) {
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error getting session details:", error);
    return null;
  }
}
