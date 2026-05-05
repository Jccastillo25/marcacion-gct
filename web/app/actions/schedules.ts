'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { resolveShift, resolveShiftInMemory, type ResolvedShift } from '@/lib/shift-resolver'
import { requirePermission } from '@/lib/auth/require-permission'

export type ActionState = { error: string } | { success: boolean; data?: any } | null

// --- SHIFT TEMPLATES (The new standard for inheritance) ---

export async function createShiftTemplate(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_shift_templates')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const lunch_duration = parseInt(formData.get('lunch_duration') as string, 10)
  const company_id = formData.get('company_id') as string
  
  const branch_id = formData.get('branch_id') as string
  const late_entry_tolerance = parseInt(formData.get('late_entry_tolerance') as string, 10) || 15
  const early_exit_tolerance = parseInt(formData.get('early_exit_tolerance') as string, 10) || 15
  
  const days_config_str = formData.get('days_config') as string
  let days_config = []
  
  try {
    if (days_config_str) {
      days_config = JSON.parse(days_config_str)
    }
  } catch (e) {
    return { error: 'Configuración de días inválida.' }
  }

  // Validación de Séptimo Día (Backend)
  const activeDays = days_config.filter((d: any) => d.isActive && !d.isSeventhDay).length
  const restingDays = days_config.filter((d: any) => d.isSeventhDay).length

  if (restingDays < 1 || activeDays > 6) {
    return { error: 'Por ley laboral, es obligatorio asignar al menos 1 día de descanso (Séptimo Día) por cada 6 días trabajados.' }
  }

  // Extraer un start/end time base para retrocompatibilidad
  const firstActive = days_config.find((d: any) => d.isActive && !d.isSeventhDay)
  const start_time = firstActive ? firstActive.startTime : null
  const end_time = firstActive ? firstActive.endTime : null

  // Validación de duración en el primer día activo
  if (start_time && end_time) {
    const [sh, sm] = start_time.split(':').map(Number)
    const [eh, em] = end_time.split(':').map(Number)
    let startMinutes = sh * 60 + sm
    let endMinutes = eh * 60 + em
    if (endMinutes <= startMinutes) endMinutes += 1440
    const totalShiftMinutes = endMinutes - startMinutes

    if (!isNaN(lunch_duration) && lunch_duration >= totalShiftMinutes) {
      return { error: `La pausa no puede ser mayor o igual a la duración total del turno.` }
    }
  }

  const { error } = await supabase.from('shift_templates').insert({
    name,
    start_time,
    end_time,
    company_id,
    branch_id: branch_id || null,
    lunch_duration: isNaN(lunch_duration) ? 0 : lunch_duration,
    late_entry_tolerance,
    early_exit_tolerance,
    days_config,
    is_active: true,
  })

  if (error) return { error: error.message }
  revalidatePath('/schedules/global-planning')
  return { success: true }
}

export async function updateShiftTemplate(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_shift_templates')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const lunch_duration = parseInt(formData.get('lunch_duration') as string, 10)
  const company_id = formData.get('company_id') as string
  const branch_id = formData.get('branch_id') as string
  const late_entry_tolerance = parseInt(formData.get('late_entry_tolerance') as string, 10) || 15
  const early_exit_tolerance = parseInt(formData.get('early_exit_tolerance') as string, 10) || 15
  const days_config_str = formData.get('days_config') as string
  
  let days_config = []
  try {
    if (days_config_str) {
      days_config = JSON.parse(days_config_str)
    }
  } catch (e) {
    return { error: 'Configuración de días inválida.' }
  }

  // Validación de Séptimo Día
  const activeDays = days_config.filter((d: any) => d.isActive && !d.isSeventhDay).length
  const restingDays = days_config.filter((d: any) => d.isSeventhDay).length

  if (restingDays < 1 || activeDays > 6) {
    return { error: 'Por ley laboral, es obligatorio asignar al menos 1 día de descanso (Séptimo Día) por cada 6 días trabajados.' }
  }

  const firstActive = days_config.find((d: any) => d.isActive && !d.isSeventhDay)
  const start_time = firstActive ? firstActive.startTime : null
  const end_time = firstActive ? firstActive.endTime : null

  const { error } = await supabase
    .from('shift_templates')
    .update({
      name,
      start_time,
      end_time,
      company_id,
      branch_id: branch_id || null,
      lunch_duration: isNaN(lunch_duration) ? 0 : lunch_duration,
      late_entry_tolerance,
      early_exit_tolerance,
      days_config,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/schedules/global-planning')
  return { success: true }
}

// --- GLOBAL SCHEDULES (Level 3 Hierarchy) ---

export async function updateAssignmentShift(
  assignmentId: string,
  shiftTemplateId: string | null
) {
  const perm = await requirePermission('can_manage_schedules')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from('employee_assignments')
    .update({
      shift_template_id: shiftTemplateId,
      updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)

  if (error) return { error: error.message }

  revalidatePath('/schedules/global-planning')
  return { success: true }
}

// Bulk update assignments
export async function bulkUpdateAssignmentsShift(
  assignmentIds: string[],
  shiftTemplateId: string | null
) {
  const perm = await requirePermission('can_manage_schedules')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from('employee_assignments')
    .update({
      shift_template_id: shiftTemplateId,
      updated_at: new Date().toISOString()
    })
    .in('id', assignmentIds)

  if (error) return { error: error.message }

  revalidatePath('/schedules/global-planning')
  return { success: true }
}

// --- BRANCH DEFAULT SHIFTS (Level 4 Hierarchy) ---

export async function upsertBranchDefaultShift(
  branchId: string,
  dayOfWeek: number,
  shiftTemplateId: string | null,
  companyId: string
) {
  const perm = await requirePermission('can_manage_schedules')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  if (!shiftTemplateId) {
    const { error } = await supabase
      .from('branch_default_shifts')
      .delete()
      .eq('branch_id', branchId)
      .eq('day_of_week', dayOfWeek)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('branch_default_shifts')
      .upsert({
        branch_id: branchId,
        day_of_week: dayOfWeek,
        shift_template_id: shiftTemplateId,
        company_id: companyId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,branch_id,day_of_week' })
    if (error) return { error: error.message }
  }

  revalidatePath('/schedules/global-planning')
  return { success: true }
}

// --- SHIFT OVERRIDES (Level 1 Hierarchy) ---

export async function createShiftOverride(
  employeeId: string,
  date: string,
  shiftTemplateId: string,
  reason: string,
  companyId: string
) {
  const perm = await requirePermission('can_manage_schedules')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const { error } = await supabase.from('employee_shift_overrides').insert({
    employee_id: employeeId,
    scheduled_date: date,
    shift_template_id: shiftTemplateId,
    reason,
    company_id: companyId
  })

  if (error) return { error: error.message }
  revalidatePath('/schedules/overrides')
  return { success: true }
}

// --- LEGACY SHIFTS (Levels 2) ---

export async function createShift(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_shift_templates')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const start_time = formData.get('start_time') as string
  const end_time = formData.get('end_time') as string
  const break_minutes = parseInt(formData.get('break_minutes') as string, 10)
  const tolerance_in = parseInt(formData.get('tolerance_in') as string, 10)
  const tolerance_out = parseInt(formData.get('tolerance_out') as string, 10)

  const days_of_week = formData.getAll('days_of_week').map(Number)

  const { error } = await supabase.from('shifts').insert({
    name,
    start_time,
    end_time,
    break_minutes: isNaN(break_minutes) ? 0 : break_minutes,
    tolerance_in: isNaN(tolerance_in) ? 0 : tolerance_in,
    tolerance_out: isNaN(tolerance_out) ? 0 : tolerance_out,
    days_of_week: days_of_week.length > 0 ? days_of_week : [1, 2, 3, 4, 5],
    is_active: true,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/schedules')
  redirect('/schedules')
}

export async function updateShift(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_shift_templates')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const start_time = formData.get('start_time') as string
  const end_time = formData.get('end_time') as string
  const break_minutes = parseInt(formData.get('break_minutes') as string, 10)
  const tolerance_in = parseInt(formData.get('tolerance_in') as string, 10)
  const tolerance_out = parseInt(formData.get('tolerance_out') as string, 10)
  const is_active = formData.get('is_active') === 'on'

  const days_of_week = formData.getAll('days_of_week').map(Number)

  const { error } = await supabase
    .from('shifts')
    .update({
      name,
      start_time,
      end_time,
      break_minutes: isNaN(break_minutes) ? 0 : break_minutes,
      tolerance_in: isNaN(tolerance_in) ? 0 : tolerance_in,
      tolerance_out: isNaN(tolerance_out) ? 0 : tolerance_out,
      days_of_week: days_of_week.length > 0 ? days_of_week : [1, 2, 3, 4, 5],
      is_active,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/schedules')
  redirect('/schedules')
}

export async function deleteShift(id: string): Promise<{ error?: string }> {
  const perm = await requirePermission('can_manage_shift_templates')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedules')
  return {}
}

export async function assignShift(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_schedules')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const employee_id = formData.get('employee_id') as string
  const shift_template_id = formData.get('shift_template_id') as string
  const start_date = formData.get('start_date') as string

  if (!employee_id || !shift_template_id) {
    return { error: 'Empleado y turno son requeridos.' }
  }

  // Desactivar asignaciones previas para este empleado
  const { error: deactivateError } = await supabase
    .from('employee_shifts')
    .update({ is_active: false })
    .eq('employee_id', employee_id)

  if (deactivateError) {
    return { error: 'No se pudieron desactivar los turnos anteriores.' }
  }

  // Insertar nueva asignación
  const { error } = await supabase.from('employee_shifts').insert({
    employee_id,
    shift_template_id,
    start_date: start_date || new Date().toISOString().split('T')[0],
    is_active: true,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/schedules/assignments')
  redirect('/schedules/assignments')
}

// --- PERSONNEL MATRIX (Phase 2) ---

export async function getResolvedPersonnelSchedule(
  companyId: string,
  branchId?: string,
  startDateStr?: string,
  daysCount = 7
) {
  const supabase = await createClient()
  
  // 1. Fetch Employees
  let query = supabase
    .from('employees')
    .select('id, first_name, last_name, employee_code, branch_id')
    .eq('is_active', true)
  
  if (branchId && branchId !== 'all') {
    query = query.eq('branch_id', branchId)
  }

  const { data: employees, error: empError } = await query.order('first_name')
  if (empError) return { error: empError.message }
  if (!employees.length) return { success: true, data: { employees: [], dates: [], grid: {} } }

  // 2. Prepare Date Range
  const start = startDateStr ? new Date(startDateStr) : new Date()
  const dates: Date[] = []
  const dateStrings: string[] = []
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(start)
    d.setHours(12, 0, 0, 0) // Neutral time
    d.setDate(d.getDate() + i)
    dates.push(d)
    dateStrings.push(d.toISOString().split('T')[0])
  }

  // 3. BULK FETCH ALL LEVELS
  const { data: assignments } = await supabase
    .from('employee_assignments')
    .select('employee_id, job_position_id, shift_template_id')
    .eq('company_id', companyId)
    .eq('is_active', true)

  const assignmentMap = new Map()
  assignments?.forEach(a => assignmentMap.set(a.employee_id, a))
  
  const employeeIds = employees.map(e => e.id)
  
  const [
    { data: overridesData },
    // manuals and globals are now mostly replaced by assignments in Level 3
    { data: branchesData }
  ] = await Promise.all([
    // Level 1: Overrides
    supabase.from('employee_shift_overrides')
      .select('employee_id, scheduled_date, shift_templates(*)')
      .in('employee_id', employeeIds)
      .in('scheduled_date', dateStrings),
    
    // Level 4: Branch Defaults
    supabase.from('branch_default_shifts')
      .select('branch_id, day_of_week, shift_templates(*)')
      .eq('company_id', companyId)
  ])

  // 4. PREPARE MAPS
  const overridesMap = new Map()
  overridesData?.forEach(o => overridesMap.set(`${o.employee_id}_${o.scheduled_date}`, o))
  
  const branchesMap = new Map()
  branchesData?.forEach(b => branchesMap.set(`${b.branch_id}_${b.day_of_week}`, b))

  // 5. RESOLVE IN-MEMORY
  const grid: Record<string, any | null> = {}
  
  employees.forEach(emp => {
    const ass = assignmentMap.get(emp.id)
    dates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0]
      const dow = date.getDay()
      
      let resolved = null

      // Level 1: Override
      const override = overridesMap.get(`${emp.id}_${dateStr}`)
      if (override) {
        resolved = override.shift_templates
      } 
      // Level 3: Assignment (New Source of Truth)
      else if (ass?.shift_template_id) {
         // Resolve template in memory using internal config if it's a template
         // For now, we assume level 3 is the template
         // We might need to fetch the template details to resolve properly
      }
      // Level 4: Branch Default
      else if (emp.branch_id) {
        const branchShift = branchesMap.get(`${emp.branch_id}_${dow}`)
        if (branchShift) resolved = branchShift.shift_templates
      }

      grid[`${emp.id}_${dateStr}`] = resolved ? {
        shift_template_id: resolved.id,
        shift_id: resolved.id, // Compatibility
        name: resolved.name,
        start_time: resolved.start_time,
        end_time: resolved.end_time,
        color_code: resolved.color_code,
        source_level: override ? 1 : (ass ? 3 : 4),
        source_name: override ? 'Cambio Manual' : (ass ? 'Asignación Personal' : 'Por Sucursal')
      } : null
    })
  })

  return {
    success: true,
    data: {
      employees,
      dates: dateStrings,
      grid
    }
  }
}

export async function getGlobalPlanningData(
  companyId: string,
  branchId?: string
) {
  const supabase = await createClient()

  // 1. Fetch Assignments (joining Employee and Position)
  let query = supabase
    .from('employee_assignments')
    .select(`
      id,
      is_active,
      shift_template_id,
      employee:employees (
        id,
        first_name,
        last_name,
        employee_code
      ),
      position:job_positions (
        id,
        name
      )
    `)
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (branchId && branchId !== 'all') {
    query = query.eq('branch_id', branchId)
  }

  const { data: assignments, error: assError } = await query

  if (assError) return { error: assError.message }

  // 2. Fetch Templates
  const { data: templates } = await supabase
    .from('shift_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)

  return {
    success: true,
    data: {
      assignments: (assignments || []).map(ass => ({
        ...ass,
        employee: Array.isArray(ass.employee) ? ass.employee[0] : ass.employee,
        position: Array.isArray(ass.position) ? ass.position[0] : ass.position
      })) as any,
      templates: templates || []
    }
  }
}

export async function pinShift(
  employeeId: string,
  date: string,
  shiftTemplateId: string,
  companyId: string
) {
  const supabase = await createClient()

  const { error } = await supabase.from('employee_shift_overrides').upsert({
    employee_id: employeeId,
    scheduled_date: date,
    shift_template_id: shiftTemplateId,
    company_id: companyId,
    reason: 'Fijado desde Matriz de Diagnóstico',
    updated_at: new Date().toISOString()
  }, { onConflict: 'employee_id,scheduled_date' })

  if (error) return { error: error.message }
  
  revalidatePath('/schedules/assignments/matrix')
  return { success: true }
}
