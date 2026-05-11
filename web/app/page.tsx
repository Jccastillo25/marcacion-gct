import { createClient } from '@/lib/supabase/server'
import { KioskClient } from './_components/kiosk-client'

/**
 * KIOSK PUBLIC ROUTE — No authentication required
 *
 * BUG FIX (2026-05-08):
 * - app_settings is a GLOBAL table (no company_id filter)
 * - branches table REQUIRES filtering by company_id for multitenant isolation
 * - Since this route is public and unauthenticated, we CANNOT determine company_id server-side
 *
 * SOLUTION:
 * - We DO NOT fetch branches here (risk of data leakage across tenants)
 * - Instead, kiosk MUST be linked via device_code stored in localStorage
 * - getKioskByDeviceCode() retrieves branch_id AND company_id correctly
 * - If no device_code exists, kiosk starts in 'linking' state to be configured
 *
 * TODO: Implement device code provisioning workflow in admin panel
 * TODO: Consider hardware-based unique ID (MAC address) as fallback for linking
 */
export default async function KioskPage() {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['logo_url', 'kiosk_bg_url', 'company_name', 'kiosk_custom_message'])

  const settings = Object.fromEntries(
    (rows ?? []).map((r) => [r.key, r.value as string | null])
  )

  return (
    <KioskClient
      initialLogoUrl={settings.logo_url ?? null}
      initialKioskBgUrl={settings.kiosk_bg_url ?? null}
      initialCompanyName={settings.company_name ?? 'Gestor360'}
      initialCustomMessage={settings.kiosk_custom_message ?? 'Gracias por su puntualidad'}
      initialBranchId={null}
    />
  )
}
