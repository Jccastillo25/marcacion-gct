'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'

export type JobActionState = { error: string } | null

export async function createJobPosition(
  _prevState: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const perm = await requirePermission('can_manage_employees')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const company_id = formData.get('company_id') as string
  const level = parseFloat(formData.get('level') as string)
  const parent_id = formData.get('parent_id') as string || null
  const default_break_mins = parseInt(formData.get('default_break_mins') as string)
  const icon_name = formData.get('icon_name') as string || 'Briefcase'

  if (!name || !company_id) {
    return { error: 'Nombre y empresa son requeridos.' }
  }

  const { error } = await supabase.from('job_positions').insert({
    name,
    company_id,
    level: isNaN(level) ? 1 : level,
    parent_id: parent_id === 'none' ? null : parent_id,
    default_break_mins: isNaN(default_break_mins) ? 60 : default_break_mins,
    icon_name
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/employees/groups')
  redirect('/employees/groups')
}

export async function deleteJobPosition(id: string) {
  const perm = await requirePermission('can_manage_employees')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { error } = await supabase.from('job_positions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/employees/groups')
  return {}
}

export async function startEmployeeBreak(employeeId: string, breakMins: number = 60): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_attendance')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const startTime = new Date()
  const endTimeScheduled = new Date(startTime.getTime() + breakMins * 60000)

  // 1. Insert the log
  await supabase.from('employee_status_logs').insert({
    employee_id: employeeId,
    start_time: startTime.toISOString(),
    end_time_scheduled: endTimeScheduled.toISOString(),
  })

  // 2. Update employee status
  await supabase
    .from('employees')
    .update({ 
      current_status: 'on_break',
      last_status_change: startTime.toISOString()
    })
    .eq('id', employeeId)

  revalidatePath('/monitor')
  return { success: true }
}

export async function endEmployeeBreak(
  employeeId: string,
  logId: string,
  isCompleteOverride: boolean
): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_attendance')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Update the log
  await supabase
    .from('employee_status_logs')
    .update({ 
      end_time_actual: new Date().toISOString(),
      is_complete_override: isCompleteOverride,
      authorized_by: user?.id
    })
    .eq('id', logId)

  // 2. Update employee status
  await supabase
    .from('employees')
    .update({ 
      current_status: 'active',
      last_status_change: new Date().toISOString()
    })
    .eq('id', employeeId)

  revalidatePath('/monitor')
  return { success: true }
}
