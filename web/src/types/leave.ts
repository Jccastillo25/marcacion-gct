/**
 * Leave Management Types
 * Tipos para el sistema de solicitudes de permisos y vacaciones
 */

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveType {
  id: string
  company_id: string
  name: string
  description?: string
  color: string
  requires_approval: boolean
  max_days_per_year: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LeaveRequest {
  id: string
  company_id: string
  employee_id: string
  leave_type_id: string

  start_date: string // ISO date
  end_date: string   // ISO date
  days_requested: number
  reason?: string

  status: LeaveStatus

  approved_by?: string
  approved_at?: string
  rejection_reason?: string

  created_at: string
  updated_at: string

  // JOINs (populated by server)
  employees?: {
    id: string
    first_name: string
    last_name: string
    email: string
  }
  leave_types?: {
    id: string
    name: string
    color: string
  }
  approver?: {
    id: string
    email: string
  }
}

export interface LeaveRequestWithRelations extends LeaveRequest {
  employees: {
    id: string
    first_name: string
    last_name: string
    email: string
  }
  leave_types: {
    id: string
    name: string
    color: string
  }
}

export interface CreateLeaveRequestInput {
  employee_id: string
  leave_type_id: string
  start_date: string // YYYY-MM-DD
  end_date: string   // YYYY-MM-DD
  reason?: string
}

export interface LeaveRequestFilters {
  status?: LeaveStatus | LeaveStatus[]
  employee_id?: string
  leave_type_id?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}
