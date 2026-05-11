'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'

// Time utilities
/**
 * TODO (BUG): isWithin15Mins uses UTC Date.now() instead of Nicaragua timezone (UTC-6)
 * This may cause incorrect shift time comparisons for attendance corrections.
 * SOLUTION: Use getNicaTimeParts() from @/lib/date-utils instead
 * IMPACT: Attendance corrections may allow/block at wrong times due to timezone mismatch
 * BLOCKED: This is only called from mark_attendance_action (supervisor corrections)
 *          Need to verify actual business impact first before fixing
 */
const isWithin15Mins = (targetTimeStr: string) => {
  // targetTimeStr is like "07:30"
  const now = new Date()
  const [hours, minutes] = targetTimeStr.split(':').map(Number)

  const targetTime = new Date()
  targetTime.setHours(hours, minutes, 0, 0)

  const diffMins = (targetTime.getTime() - now.getTime()) / 60000

  // They can clock in up to 15 mins early.
  // It's safe to clock in if we are at most 15 mins before the shift starts.
  // Example: Shift = 07:30. Now = 07:15. Diff = +15 mins -> allow.
  // Now = 07:10. Diff = +20 mins -> block.
  // Now = 07:45. Diff = -15 mins -> allow (late).
  return diffMins <= 15
}

// Check Hierarchy Authorization
async function isAuthorizedToMark(supabase: any, targetEmployeeId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // Find if user is linked to an employee profile via email
  const { data: actingEmployee } = await supabase
    .from('employees')
    .select('id, email, job_position_id, job_positions(id, level, parent_id)')
    .eq('email', user.email)
    .single()
  
  // If not found, assume it's a super-admin who can bypass
  if (!actingEmployee) return true

  // Get target employee level
  const { data: targetEmployee } = await supabase
    .from('employees')
    .select('id, job_position_id, job_positions(id, level, parent_id)')
    .eq('id', targetEmployeeId)
    .single()
  
  if (!targetEmployee) return false

  const actingLevel = actingEmployee.job_positions?.level || 999
  const targetLevel = targetEmployee.job_positions?.level || 999

  // Lower number means higher hierarchy (Lvl 1 > Lvl 2)
  // Allowed if acting level is numerically smaller, OR it's a direct parent
  return actingLevel <= targetLevel || targetEmployee.job_positions?.parent_id === actingEmployee.job_positions?.id
}

export async function markEntry(employeeId: string, shiftTemplateId: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_attendance')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  // 1. Validate authorization
  // const authorized = await isAuthorizedToMark(supabase, employeeId)
  // if (!authorized) return { error: 'No tienes los permisos jerárquicos para marcar a este colaborador.' }

  // 2. Fetch Shift details from templates
  const { data: shift } = await supabase.from('shift_templates').select('id, name, start_time, end_time, lunch_duration, late_entry_tolerance, early_exit_tolerance').eq('id', shiftTemplateId).single()
  if (!shift) return { error: 'Turno no encontrado.' }

  // 3. Time Validation (max 15 mins early)
  if (!isWithin15Mins(shift.start_time)) {
    return { error: 'Aún no es la hora de entrada. Puedes registrar entrada hasta 15 minutos antes del turno.' }
  }

  const now = new Date()
  
  // 4. Calculate delay
  const targetTime = new Date()
  const [sH, sM] = shift.start_time.split(':').map(Number)
  targetTime.setHours(sH, sM, 0, 0)
  
  const status = now.getTime() > targetTime.getTime() + (5 * 60000) ? 'late' : 'on_time'

  // 5. Insert Attendance Log
  const { error: attErr } = await supabase.from('attendance_logs').insert({
    employee_id: employeeId,
    clock_in: now.toISOString(),
    shift_template_id: shiftTemplateId,
    status
  })

  if (attErr) return { error: attErr.message }

  // 6. Update Employee Status
  await supabase
    .from('employees')
    .update({ 
      current_status: 'active',
      last_status_change: now.toISOString()
    })
    .eq('id', employeeId)

  revalidatePath('/monitor')
  return { success: true }
}

export async function markExit(employeeId: string, isEarly: boolean, notes?: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_attendance')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const now = new Date()

  // 1. Find today's open attendance log
  const { data: openLog } = await supabase
    .from('attendance_logs')
    .select('id, clock_in, shift_template_id')
    .eq('employee_id', employeeId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .single()

  if (openLog) {
    let calcFlags = {}

    // 2. Fetch Shift details for engine
    if (openLog.shift_template_id) {
      const { data: st } = await supabase
        .from('shift_templates')
        .select('lunch_duration, late_entry_tolerance, early_exit_tolerance, days_config')
        .eq('id', openLog.shift_template_id)
        .single()
      
      if (st) {
        const { calculatePayableHours } = await import('@/lib/payroll-engine')
        const clockInDate = new Date(openLog.clock_in)
        const clockOutDate = now
        const todayDow = now.getDay()
        
        const payrollFlags = calculatePayableHours(
          clockInDate,
          clockOutDate,
          {
            lunch_duration: st.lunch_duration || 0,
            late_entry_tolerance: st.late_entry_tolerance || 15,
            early_exit_tolerance: st.early_exit_tolerance || 15,
            days_config: st.days_config || []
          },
          todayDow
        )

        calcFlags = {
          is_late: payrollFlags.is_late,
          minutes_deducted: payrollFlags.minutes_deducted,
          overtime_minutes: payrollFlags.overtime_minutes,
          is_seventh_day_overtime: payrollFlags.is_seventh_day_overtime
        }
      }
    }

    await supabase
      .from('attendance_logs')
      .update({ 
        clock_out: now.toISOString(),
        notes: isEarly ? `Salida Anticipada: ${notes || ''}` : notes,
        ...calcFlags
      })
      .eq('id', openLog.id)
  }

  // 3. Update Employee Status
  await supabase
    .from('employees')
    .update({ 
      current_status: 'offline',
      last_status_change: now.toISOString()
    })
    .eq('id', employeeId)

  revalidatePath('/monitor')
  return { success: true }
}

export async function registerAbsence(employeeId: string, reason: string, notes: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_attendance')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date()

  // Insert absence log
  const { error } = await supabase.from('absence_logs').insert({
    employee_id: employeeId,
    start_date: now.toISOString().split('T')[0],
    end_date: now.toISOString().split('T')[0], // Assuming 1 day default
    reason,
    notes,
    approved_by: user?.id
  })

  if (error) return { error: error.message }

  // Update employee status
  await supabase
    .from('employees')
    .update({ 
      current_status: 'absent',
      last_status_change: now.toISOString()
    })
    .eq('id', employeeId)

  revalidatePath('/monitor')
  return { success: true }
}

export async function endAbsence(employeeId: string): Promise<{ success?: boolean, error?: string }> {
  const supabase = await createClient()
  const now = new Date()

  // Update employee status
  await supabase
    .from('employees')
    .update({ 
      current_status: 'offline',
      last_status_change: now.toISOString()
    })
    .eq('id', employeeId)

  revalidatePath('/monitor')
  return { success: true }
}

export async function updateAttendanceLog(
  id: string,
  data: { clock_in?: string, clock_out?: string, status?: string }
): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_approve_corrections')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from('attendance_logs')
    .update(data)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/attendance/records')
  revalidatePath('/reports/attendance')
  return { success: true }
}

export async function deleteAttendanceLog(id: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_approve_corrections')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from('attendance_logs')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/attendance/records')
  revalidatePath('/reports/attendance')
  return { success: true }
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

export async function approveLeaveRequest(id: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_leaves')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'approved', approved_by: user?.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/leave')
  return { success: true }
}

export async function rejectLeaveRequest(id: string, reason?: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_manage_leaves')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('leave_requests')
    .update({
      status: 'rejected',
      approved_by: user?.id,
      rejection_reason: reason || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/leave')
  return { success: true }
}

// ─── Time Corrections ─────────────────────────────────────────────────────────

export async function approveTimeCorrection(id: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_approve_corrections')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('time_corrections')
    .update({ status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/attendance/corrections')
  return { success: true }
}

export async function rejectTimeCorrection(id: string, reason?: string): Promise<{ success?: boolean, error?: string }> {
  const perm = await requirePermission('can_approve_corrections')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('time_corrections')
    .update({
      status: 'rejected',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || null
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/attendance/corrections')
  return { success: true }
}
