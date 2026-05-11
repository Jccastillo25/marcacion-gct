'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import {
  CreateLeaveRequestInput,
  LeaveRequest,
  LeaveType,
  LeaveRequestFilters,
} from '@/src/types/leave'

type ActionState = { error: string } | null

/**
 * Get all leave types for a company
 * Visible to all authenticated users in the company
 */
export async function getLeaveTypes(): Promise<LeaveType[] | null> {
  const { companyId, error: permError } = await requirePermission('can_view_attendance')
  if (permError) return null

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('getLeaveTypes error:', error)
    return null
  }

  return data
}

/**
 * Create a new leave request
 * The authenticated user creates a request for themselves (or admin can create for others)
 */
export async function createLeaveRequest(
  input: CreateLeaveRequestInput
): Promise<ActionState> {
  const { companyId, error: permError } = await requirePermission('can_view_attendance')
  if (permError) return { error: permError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) return { error: 'Usuario no autenticado' }

  // Verify that the employee requesting is either the target employee or an admin
  const { data: adminData } = await supabase
    .from('company_memberships')
    .select('role')
    .eq('company_id', companyId)
    .eq('profile_id', user.id)
    .single()

  const isAdmin = adminData?.role === 'admin' || adminData?.role === 'owner'

  if (!isAdmin) {
    // Non-admin can only create for themselves
    const { data: targetEmp } = await supabase
      .from('employees')
      .select('id, email')
      .eq('company_id', companyId)
      .eq('email', user.email)
      .single()

    if (!targetEmp || targetEmp.id !== input.employee_id) {
      return { error: 'No puedes crear solicitudes para otros empleados' }
    }
  }

  // Validate date range
  const startDate = new Date(input.start_date)
  const endDate = new Date(input.end_date)

  if (startDate > endDate) {
    return { error: 'La fecha de inicio no puede ser posterior a la de finalización' }
  }

  if (startDate < new Date()) {
    return { error: 'No puedes crear solicitudes para fechas pasadas' }
  }

  // Calculate days requested
  const daysRequested = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  try {
    const { error: insertError } = await supabase
      .from('leave_requests')
      .insert({
        company_id: companyId,
        employee_id: input.employee_id,
        leave_type_id: input.leave_type_id,
        start_date: input.start_date,
        end_date: input.end_date,
        days_requested: daysRequested,
        reason: input.reason || null,
        status: 'pending',
      })

    if (insertError) {
      console.error('createLeaveRequest insert error:', insertError)
      return { error: insertError.message }
    }

    revalidatePath('/leave')
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear solicitud'
    return { error: message }
  }
}

/**
 * Get all leave requests for a company (admin only)
 */
export async function getLeaveRequests(
  filters?: LeaveRequestFilters
): Promise<LeaveRequest[] | null> {
  const { companyId, error: permError } = await requirePermission('can_view_attendance')
  if (permError) return null

  const supabase = await createClient()

  let query = supabase
    .from('leave_requests')
    .select(
      `id, company_id, employee_id, leave_type_id, start_date, end_date,
       days_requested, reason, status, approved_by, approved_at, rejection_reason,
       created_at, updated_at,
       employees(id, first_name, last_name, email),
       leave_types(id, name, color)`
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status)
    } else {
      query = query.eq('status', filters.status)
    }
  }

  if (filters?.employee_id) {
    query = query.eq('employee_id', filters.employee_id)
  }

  if (filters?.leave_type_id) {
    query = query.eq('leave_type_id', filters.leave_type_id)
  }

  if (filters?.date_from) {
    query = query.gte('start_date', filters.date_from)
  }

  if (filters?.date_to) {
    query = query.lte('end_date', filters.date_to)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)
  }

  const { data, error } = await query

  if (error) {
    console.error('getLeaveRequests error:', error)
    return null
  }

  return data as LeaveRequest[]
}

/**
 * Get my own leave requests (any authenticated user)
 */
export async function getMyLeaveRequests(): Promise<LeaveRequest[] | null> {
  const { companyId, error: permError } = await requirePermission('can_view_attendance')
  if (permError) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) return null

  // Get employee ID from email
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('email', user.email)
    .single()

  if (!employee) return null

  const { data, error } = await supabase
    .from('leave_requests')
    .select(
      `id, company_id, employee_id, leave_type_id, start_date, end_date,
       days_requested, reason, status, approved_by, approved_at, rejection_reason,
       created_at, updated_at,
       employees(id, first_name, last_name, email),
       leave_types(id, name, color)`
    )
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getMyLeaveRequests error:', error)
    return null
  }

  return data as LeaveRequest[]
}

/**
 * Approve a leave request (admin only)
 */
export async function approveLeaveRequest(id: string): Promise<ActionState> {
  const { companyId, error: permError } = await requirePermission('can_manage_leaves')
  if (permError) return { error: permError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return { error: 'Usuario no autenticado' }

  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('approveLeaveRequest error:', error)
      return { error: error.message }
    }

    revalidatePath('/leave')
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al aprobar solicitud'
    return { error: message }
  }
}

/**
 * Reject a leave request (admin only)
 */
export async function rejectLeaveRequest(id: string, reason?: string): Promise<ActionState> {
  const { companyId, error: permError } = await requirePermission('can_manage_leaves')
  if (permError) return { error: permError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) return { error: 'Usuario no autenticado' }

  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'rejected',
        approved_by: user.id,
        rejection_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('rejectLeaveRequest error:', error)
      return { error: error.message }
    }

    revalidatePath('/leave')
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al rechazar solicitud'
    return { error: message }
  }
}

/**
 * Cancel a leave request (employee can cancel their own, admin can cancel any)
 */
export async function cancelLeaveRequest(id: string): Promise<ActionState> {
  const { companyId, error: permError } = await requirePermission('can_view_attendance')
  if (permError) return { error: permError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) return { error: 'Usuario no autenticado' }

  try {
    // Get the leave request to check ownership
    const { data: leaveReq } = await supabase
      .from('leave_requests')
      .select('employee_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (!leaveReq) return { error: 'Solicitud no encontrada' }

    // Check if user is the owner or an admin
    const { data: adminData } = await supabase
      .from('company_memberships')
      .select('role')
      .eq('company_id', companyId)
      .eq('profile_id', user.id)
      .single()

    const isAdmin = adminData?.role === 'admin' || adminData?.role === 'owner'

    if (!isAdmin) {
      // Non-admin can only cancel their own
      const { data: targetEmp } = await supabase
        .from('employees')
        .select('id')
        .eq('company_id', companyId)
        .eq('email', user.email)
        .single()

      if (!targetEmp || targetEmp.id !== leaveReq.employee_id) {
        return { error: 'No puedes cancelar esta solicitud' }
      }
    }

    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('cancelLeaveRequest error:', error)
      return { error: error.message }
    }

    revalidatePath('/leave')
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al cancelar solicitud'
    return { error: message }
  }
}
