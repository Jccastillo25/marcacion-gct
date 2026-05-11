'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveShift } from '@/lib/shift-resolver'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNicaTimeParts } from '@/lib/date-utils'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { KioskDevice, EventType, KioskResult } from '../types/kiosk'

export async function getKioskByDeviceCode(code: string): Promise<{ data: KioskDevice | null; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('kiosk_devices')
    .select(`
      id,
      branch_id,
      device_code,
      name,
      location,
      notes,
      is_active,
      branches!inner (
        name,
        companies!inner (
          display_name
        )
      )
    `)
    .eq('device_code', code.toLowerCase())
    .single()

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      return { data: null, error: 'Código de dispositivo no encontrado.' }
    }
    return { data: null, error: error?.message || 'Error desconocido' }
  }

  const branch = data.branches as any
  const company = branch.companies as any

  return {
    data: {
      id: data.id,
      branch_id: data.branch_id,
      device_code: data.device_code,
      branch_name: branch.name,
      company_name: company.display_name,
      logo_url: null,
      name: data.name,
      location: data.location,
      notes: data.notes,
      is_active: data.is_active
    },
    error: null
  }
}

export async function registerKioskDevice(
  branchId: string,
  name: string,
  location?: string,
  notes?: string
) {
  // Require kiosk management permission
  const permCheck = await requirePermission('can_manage_kiosks')
  if (!permCheck.ok) return { error: permCheck.error }

  const supabase = await createClient()

  // 1. Fetch branch and company info for code generation
  const { data: branch, error: branchErr } = await supabase
    .from('branches')
    .select('name, code, companies(slug, display_name)')
    .eq('id', branchId)
    .single()

  if (branchErr || !branch) return { error: 'No se pudo obtener la información de la sucursal.' }

  const company = branch.companies as any
  const companyPart = (company.slug || company.display_name.split(' ')[0]).toLowerCase().substring(0, 5)
  const branchPart = (branch.code || branch.name.split(' ')[0]).toLowerCase().substring(0, 5)

  // 2. Count existing kiosks for this branch to get the sequence
  // We use a small retry loop (max 3) in case of rare race condition collisions
  let finalDeviceCode = ''
  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    const { count, error: countErr } = await supabase
      .from('kiosk_devices')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)

    if (countErr) return { error: 'No se pudo generar el código secuencial.' }

    const sequence = String((count || 0) + 1 + attempts).padStart(2, '0')
    const deviceCode = `${companyPart}-${branchPart}-ki-${sequence}`

    // 3. Insert the new device
    const { error } = await supabase
      .from('kiosk_devices')
      .insert({
        branch_id: branchId,
        device_code: deviceCode,
        name,
        location: location || null,
        notes: notes || null,
        is_active: true
      })

    if (!error) {
      finalDeviceCode = deviceCode
      break
    }

    // If it's a unique constraint violation (code 23505), increment and retry
    if (error.code === '23505') {
      attempts++
      continue
    }

    return { error: error.message }
  }

  if (!finalDeviceCode) return { error: 'No se pudo generar un código de dispositivo único después de varios intentos.' }
  
  revalidatePath('/kiosk/devices')
  return { success: true, deviceCode: finalDeviceCode }
}

export async function updateKioskDevice(
  id: string,
  data: {
    name?: string
    location?: string
    notes?: string
    is_active?: boolean
  }
) {
  // Require kiosk management permission
  const permCheck = await requirePermission('can_manage_kiosks')
  if (!permCheck.ok) return { error: permCheck.error }

  const supabase = await createClient()

  const { error } = await supabase
    .from('kiosk_devices')
    .update(data)
    .eq('id', id)

  if (error) return { error: error.message }
  
  revalidatePath('/kiosk/devices')
  return { success: true }
}

export async function getKioskDevices() {
  // Require kiosk management permission
  const permCheck = await requirePermission('can_manage_kiosks')
  if (!permCheck.ok) return { data: null, error: permCheck.error }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('kiosk_devices')
    .select(`
      id,
      device_code,
      name,
      location,
      notes,
      is_active,
      last_seen,
      created_at,
      branches (
        name,
        companies (
          display_name
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }

  const formattedData = data.map((d: any) => ({
    ...d,
    branch_name: d.branches?.name,
    company_name: d.branches?.companies?.display_name
  }))

  return { data: formattedData, error: null }
}

export async function deleteKioskDevice(id: string) {
  // Require kiosk management permission
  const permCheck = await requirePermission('can_manage_kiosks')
  if (!permCheck.ok) return { error: permCheck.error }

  const supabase = await createClient()

  const { error } = await supabase
    .from('kiosk_devices')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  
  revalidatePath('/kiosk/devices')
  return { success: true }
}

export async function verifyKioskPin(pin: string, branchId: string): Promise<{ success: boolean; employeeName?: string; error?: string }> {
  // Use admin client to ensure we can read employee and shift data even from a public kiosk
  const supabase = createAdminClient()

  // Single query: fetch the employee by PIN with their branch info included.
  // We fetch both branch_id and the branch name in one shot so we never need a second query.
  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select('id, first_name, last_name, company_id, branch_id, is_active, employee_code, employee_shifts(is_active), branches(name)')
    .eq('employee_code', pin)
    .maybeSingle()

  if (empErr) {
    console.error('Kiosk PIN verification DB error:', empErr.message)
    return { success: false, error: 'Error técnico al validar PIN. Por favor, intente de nuevo.' }
  }

  if (!employee) {
    return { success: false, error: 'PIN incorrecto o empleado no encontrado.' }
  }

  // Check if the employee belongs to this branch
  if (employee.branch_id !== branchId) {
    const branchName = (employee.branches as any)?.name || 'otra sucursal'
    return { success: false, error: `PIN correcto pero el empleado está asignado a: ${branchName}.` }
  }

  if (!employee.is_active) {
    return { success: false, reason: 'El empleado está inactivo.' } as any
  }

  if (!employee.employee_code) {
    return { success: false, error: 'El empleado no tiene un PIN configurado.' }
  }

  return {
    success: true,
    employeeName: `${employee.first_name} ${employee.last_name}`
  }
}

/**
 * getTodayShift - Resolves the correct shift using a 4-level hierarchy
 */
async function getTodayShift(
  supabase: any,
  employeeId: string,
  companyId: string,
  branchId: string,
  jobPositionId: string | null
) {
  const resolved = await resolveShift(supabase, employeeId, new Date(), {
    companyId,
    branchId,
    jobPositionId
  })

  if (!resolved) return null

  // Resolving specific daily schedule based on Weekly Matrix (days_config)
  const todayDow = new Date().getDay()
  let dailyStartTime = resolved.start_time
  let isSeventhDay = false

  if (resolved.days_config && Array.isArray(resolved.days_config)) {
    const dayConfig = resolved.days_config.find((d: any) => d.dayOfWeek === todayDow)
    if (dayConfig) {
      if (dayConfig.isSeventhDay || !dayConfig.isActive) {
        isSeventhDay = true
        dailyStartTime = '00:00' // Placeholder effectively
      } else {
        dailyStartTime = dayConfig.startTime
      }
    }
  }

  return {
    shift_template_id: resolved.shift_template_id,
    shift_id: resolved.shift_id,
    start_time: dailyStartTime,
    late_entry_tolerance: resolved.late_entry_tolerance,
    early_exit_tolerance: resolved.early_exit_tolerance,
    lunch_duration: resolved.lunch_duration,
    is_seventh_day: isSeventhDay,
    days_config: resolved.days_config
  }
}

const RPC_ACTION_MAP: Record<EventType, string> = {
  clock_in:    'CLOCK_IN',
  clock_out:   'CLOCK_OUT',
  start_break: 'START_BREAK',
  end_break:   'END_BREAK',
}

export async function processKioskEvent(branchId: string, pin: string, eventType: EventType): Promise<KioskResult> {
  const supabase = createAdminClient()

  // 1. Resolve employee by PIN + branch
  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, is_active, employee_code, company_id, branch_id, job_position_id, current_status,
      job_positions!left(default_break_mins)
    `)
    .eq('employee_code', pin)
    .eq('branch_id', branchId)
    .maybeSingle()

  if (empErr || !employee || !employee.is_active) {
    return { success: false, error: 'PIN incorrecto o empleado no encontrado en esta sucursal.' }
  }

  const now = new Date()
  const nowISO = now.toISOString()

  // 2. Tardiness calculation (clock_in only)
  let tardinessMinutes = 0
  let resolvedShift: Awaited<ReturnType<typeof getTodayShift>> | null = null

  if (eventType === 'clock_in' || eventType === 'clock_out') {
    resolvedShift = await getTodayShift(supabase, employee.id, employee.company_id, employee.branch_id, employee.job_position_id)
  }

  if (eventType === 'clock_in' && resolvedShift && !resolvedShift.is_seventh_day && resolvedShift.start_time) {
    const { hour, minute } = getNicaTimeParts()
    const currentTotalMins = hour * 60 + minute
    const [shiftHours, shiftMins] = resolvedShift.start_time.split(':').map(Number)
    const shiftTotalMins = shiftHours * 60 + shiftMins
    const tolerance = resolvedShift.late_entry_tolerance || 0
    if (currentTotalMins > shiftTotalMins + tolerance) {
      tardinessMinutes = currentTotalMins - shiftTotalMins
    }
  }

  // 3. Delegate to RPC (handles audit, company_id, state validation, employee_status_logs for breaks)
  const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_mark_attendance_action', {
    p_company_id:  employee.company_id,
    p_employee_id: employee.id,
    p_action:      RPC_ACTION_MAP[eventType],
    p_source:      'KIOSK',
    p_executed_by: null,
    p_notes:       null,
    p_timestamp:   nowISO,
  })

  if (rpcErr) {
    return { success: false, error: `Error técnico: ${rpcErr.message}` }
  }

  const rpc = Array.isArray(rpcData) ? rpcData[0] : rpcData
  if (!rpc?.success) {
    return { success: false, error: rpc?.message || 'No se pudo procesar la marcación.' }
  }

  // 4. Post-processing: persist tardiness status
  if (eventType === 'clock_in' && tardinessMinutes > 0 && rpc.attendance_log_id) {
    await supabase
      .from('attendance_logs')
      .update({ status: 'late' })
      .eq('id', rpc.attendance_log_id)
  }

  // 5. Post-processing: persist payroll flags on clock_out
  if (eventType === 'clock_out' && rpc.attendance_log_id && resolvedShift) {
    const { data: closedLog } = await supabase
      .from('attendance_logs')
      .select('clock_in, clock_out')
      .eq('id', rpc.attendance_log_id)
      .single()

    if (closedLog?.clock_in && closedLog?.clock_out) {
      const { calculatePayableHours } = await import('@/lib/payroll-engine')
      const payrollFlags = calculatePayableHours(
        new Date(closedLog.clock_in),
        new Date(closedLog.clock_out),
        {
          lunch_duration:       resolvedShift.lunch_duration || 0,
          late_entry_tolerance: resolvedShift.late_entry_tolerance || 15,
          early_exit_tolerance: resolvedShift.early_exit_tolerance || 15,
          days_config:          resolvedShift.days_config || [],
        },
        now.getDay()
      )
      await supabase
        .from('attendance_logs')
        .update({
          is_late:                payrollFlags.is_late,
          minutes_deducted:       payrollFlags.minutes_deducted,
          overtime_minutes:       payrollFlags.overtime_minutes,
          is_seventh_day_overtime: payrollFlags.is_seventh_day_overtime,
        })
        .eq('id', rpc.attendance_log_id)
    }
  }

  // 6. Post-processing: fix break duration (RPC hardcodes 60 min)
  if (eventType === 'start_break') {
    const breakMins = (employee.job_positions as any)?.default_break_mins ?? 60
    if (breakMins !== 60) {
      const endTimeScheduled = new Date(now.getTime() + breakMins * 60000)
      const { data: breakLog } = await supabase
        .from('employee_status_logs')
        .select('id')
        .eq('employee_id', employee.id)
        .is('end_time_actual', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (breakLog) {
        await supabase
          .from('employee_status_logs')
          .update({ end_time_scheduled: endTimeScheduled.toISOString() })
          .eq('id', breakLog.id)
      }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/attendance')
  revalidatePath('/monitor')

  return {
    success: true,
    employee_name: `${employee.first_name} ${employee.last_name}`,
    employee_code: employee.employee_code,
    event_type: eventType,
    tardiness_minutes: tardinessMinutes,
    overtime_minutes: 0,
  }
}
