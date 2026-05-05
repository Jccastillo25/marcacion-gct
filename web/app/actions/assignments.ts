'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'

export type ActionState = { error: string } | { success: boolean; data?: any } | null

/**
 * Realiza una asignación masiva de turnos globales para una posición y múltiples días.
 * Si shiftTemplateId es null, borra las asignaciones para esos días.
 */
export async function upsertGlobalSchedules(
  jobPositionId: string,
  daysOfWeek: number[],
  shiftTemplateId: string | null,
  companyId: string
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_schedules')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  try {
    if (!shiftTemplateId) {
      // DELETE BATCH
      const { error } = await supabase
        .from('global_schedules')
        .delete()
        .eq('company_id', companyId)
        .eq('job_position_id', jobPositionId)
        .in('day_of_week', daysOfWeek)
      
      if (error) throw error
    } else {
      // UPSERT BATCH
      const upserts = daysOfWeek.map(day => ({
        company_id: companyId,
        job_position_id: jobPositionId,
        day_of_week: day,
        shift_template_id: shiftTemplateId,
        updated_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('global_schedules')
        .upsert(upserts, { onConflict: 'company_id,job_position_id,day_of_week' })
      
      if (error) throw error
    }

    revalidatePath('/schedules/global-planning')
    return { success: true }
  } catch (error: any) {
    console.error('Error in upsertGlobalSchedules:', error)
    return { error: error.message || 'Error desconocido en la asignación masiva' }
  }
}
