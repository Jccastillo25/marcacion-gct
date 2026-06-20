import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSystemConfig } from "@/lib/services/sessions/sessionService";

/**
 * GET /api/v1/config/session
 * Obtiene la configuración de sesiones para inicializar timers en el cliente
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const config = await getSystemConfig();

    return NextResponse.json(
      {
        inactivity_timeout_minutes: config.inactivityTimeoutMinutes,
        max_session_duration_minutes: config.maxSessionDurationMinutes,
        transfer_alert_timeout_seconds: config.transferAlertTimeoutSeconds,
        allow_multiple_sessions: config.allowMultipleSessions,
        require_2fa_new_device: config.require2faNewDevice,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching session config:", error);
    return NextResponse.json(
      { error: "Error al obtener configuración" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/config/session (solo para Owner)
 * Pendiente de implementación con auth y persistencia.
 */
export async function PATCH(_request: NextRequest) {
  return NextResponse.json(
    { error: "No implementado" },
    { status: 501 }
  );
}
