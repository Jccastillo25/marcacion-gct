'use client'

import React, { useState, useEffect } from 'react'
import { X, Clock, AlertCircle, FileText, Camera, CheckCircle2, XCircle } from 'lucide-react'
import { DigitalClock } from './DigitalClock'
import { EmployeeStatusBadge } from './EmployeeStatusBadge'
import { createClient } from '@/lib/supabase/client'
import { getNicaISODate, getNicaRange } from '@/lib/date-utils'
import { registerAbsence } from '../../../app/actions/attendance'
import { useGlobalContext } from '@/context/GlobalContext'

interface Props {
  employee: any | null
  isOpen: boolean
  onClose: () => void
}

type Toast = { type: 'success' | 'error'; message: string }

const ACTION_LABELS: Record<string, string> = {
  CLOCK_IN:    'Entrada registrada',
  CLOCK_OUT:   'Salida registrada',
  START_BREAK: 'Descanso iniciado',
  END_BREAK:   'Regreso registrado',
}

const STATUS_AFTER_ACTION: Record<string, string> = {
  CLOCK_IN:    'active',
  CLOCK_OUT:   'offline',
  START_BREAK: 'on_break',
  END_BREAK:   'active',
}

export const ActionDrawer = ({ employee, isOpen, onClose }: Props) => {
  const [notes, setNotes]                 = useState('')
  const [incidentType, setIncidentType]   = useState('nota')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [toast, setToast]                 = useState<Toast | null>(null)
  const [localStatus, setLocalStatus]     = useState<string>(employee?.current_status ?? 'offline')
  const [hasHadBreak, setHasHadBreak]     = useState(false)
  const supabase = createClient()
  const { userPermissions } = useGlobalContext()

  // Sincroniza cuando el prop cambia (realtime del padre)
  useEffect(() => {
    if (employee?.current_status) setLocalStatus(employee.current_status)
  }, [employee?.current_status])

  // Al abrir el drawer, verificar si el empleado ya usó su descanso hoy
  useEffect(() => {
    if (!isOpen || !employee) return
    if (employee.current_status === 'on_break') { setHasHadBreak(true); return }
    const nicaToday = getNicaISODate()
    const { start: dayStart } = getNicaRange(nicaToday)
    supabase
      .from('employee_status_logs')
      .select('id')
      .eq('employee_id', employee.id)
      .gte('start_time', dayStart)
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setHasHadBreak(true) })
  }, [isOpen, employee?.id])

  // Resetear descanso cuando el empleado hace una nueva entrada
  useEffect(() => {
    if (localStatus === 'offline') setHasHadBreak(false)
  }, [localStatus])

  if (!employee) return null

  // ── Estado de botones ────────────────────────────────────────────────────────
  const canClockIn    = !['active', 'on_break'].includes(localStatus)
  const canClockOut   = ['active', 'on_break'].includes(localStatus)
  const canStartBreak = localStatus === 'active' && !hasHadBreak
  const canEndBreak   = localStatus === 'on_break'

  // ── Feedback visual ──────────────────────────────────────────────────────────
  function showToast(type: Toast['type'], message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Marcación de asistencia ──────────────────────────────────────────────────
  const handleAction = async (action: 'CLOCK_IN' | 'CLOCK_OUT' | 'START_BREAK' | 'END_BREAK') => {
    setLoadingAction(action)
    try {
      const { data, error } = await supabase.rpc('rpc_mark_attendance_action', {
        p_company_id: employee.company_id,
        p_employee_id: employee.id,
        p_action: action,
        p_source: 'MONITOR',
        p_notes: notes || undefined,
      })

      if (error) throw error

      // El RPC retorna un array con un objeto {success, message}
      const result = Array.isArray(data) ? data[0] : data
      if (result && !result.success) {
        showToast('error', result.message || 'No se pudo completar la acción')
        return
      }

      setLocalStatus(STATUS_AFTER_ACTION[action])
      if (action === 'START_BREAK' || action === 'END_BREAK') setHasHadBreak(true)
      showToast('success', ACTION_LABELS[action] || 'Acción completada')
      setNotes('')
    } catch (err: any) {
      showToast('error', err.message || 'Error al conectar con el servidor')
    } finally {
      setLoadingAction(null)
    }
  }

  // ── Guardar nota / incidencia ────────────────────────────────────────────────
  const handleSaveNote = async () => {
    if (!notes.trim()) return
    setLoadingAction('NOTE')

    try {
      // Ausencia justificada: llama server action
      if (incidentType === 'ausencia') {
        const res = await registerAbsence(employee.id, 'permission', notes)
        if (res.error) throw new Error(res.error)
        showToast('success', 'Ausencia registrada correctamente')
        setNotes('')
        setLoadingAction(null)
        return
      }

      // Otros tipos: guarda en audit_logs
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('audit_logs').insert({
        company_id: employee.company_id,
        table_name: 'employees',
        action: 'NOTE',
        record_id: employee.id,
        user_id: userData.user?.id,
        performed_by_profile_id: userData.user?.id,
        source: 'MONITOR',
        details: {
          note: notes,
          incident_type: incidentType,
          employee_name: `${employee.first_name} ${employee.last_name}`,
        },
        created_at: new Date().toISOString(),
      })

      if (error) throw error
      showToast('success', 'Nota guardada correctamente')
      setNotes('')
    } catch (err: any) {
      showToast('error', err.message || 'Error al guardar la nota')
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ background: 'rgba(15,23,42,0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'var(--bg-app)', borderLeft: '1px solid var(--border-soft)' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-full flex-col">

          {/* Header */}
          <div className="flex items-center justify-between border-b p-6" style={{ borderColor: 'var(--border-soft)' }}>
            <div>
              <p className="section-label">Panel de Acción</p>
              <h2 className="mt-1 text-xl font-black tracking-tight" style={{ color: 'var(--text-strong)' }}>
                {employee.first_name} {employee.last_name}
              </h2>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-light)' }}>
                {employee.employee_code || employee.job_positions?.name || ''}
              </p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 transition-colors" style={{ color: 'var(--text-light)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-strong)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-light)' }}
            >
              <X size={22} />
            </button>
          </div>

          {/* Toast */}
          {toast && (
            <div
              className="mx-4 mt-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all"
              style={{
                background: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: toast.type === 'success' ? '#10b981' : '#ef4444',
              }}
            >
              {toast.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {toast.message}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Estado y reloj */}
            <div className="flex items-center justify-between rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)' }}>
              <div className="space-y-1">
                <p className="section-label">Estado Actual</p>
                <EmployeeStatusBadge status={localStatus} className="scale-110 origin-left" />
              </div>
              <div className="text-right">
                <p className="section-label">Hora Servidor</p>
                <DigitalClock className="text-xl font-black tracking-tight" style={{ color: 'var(--text-strong)' }} />
              </div>
            </div>

            {/* Botones de marcación - Solo visible con permiso */}
            {userPermissions['can_manage_attendance'] ? (
              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  label="Entrada"
                  icon="▶"
                  colorClass="bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                  onClick={() => handleAction('CLOCK_IN')}
                  loading={loadingAction === 'CLOCK_IN'}
                  disabled={!canClockIn || loadingAction !== null}
                />
                <ActionButton
                  label="Descanso"
                  icon="☕"
                  colorClass="bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                  onClick={() => handleAction('START_BREAK')}
                  loading={loadingAction === 'START_BREAK'}
                  disabled={!canStartBreak || loadingAction !== null}
                />
                <ActionButton
                  label="Reanudar"
                  icon="↩"
                  colorClass="bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20"
                  onClick={() => handleAction('END_BREAK')}
                  loading={loadingAction === 'END_BREAK'}
                  disabled={!canEndBreak || loadingAction !== null}
                />
                <ActionButton
                  label="Salida"
                  icon="⏹"
                  colorClass="bg-slate-700 hover:bg-slate-600 border border-slate-600"
                  onClick={() => handleAction('CLOCK_OUT')}
                  loading={loadingAction === 'CLOCK_OUT'}
                  disabled={!canClockOut || loadingAction !== null}
                />
              </div>
            ) : (
              <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)' }}>
                <AlertCircle size={16} style={{ color: 'var(--danger)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                  No tienes permisos para marcar asistencia
                </p>
              </div>
            )}

            {/* Separador - Solo si tiene permiso para gestionar asistencia */}
            {userPermissions['can_manage_attendance'] && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border-soft)' }} />
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={13} style={{ color: 'var(--primary)' }} />
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Incidencias / Notas</span>
                </div>
                <div className="flex-1 h-px" style={{ background: 'var(--border-soft)' }} />
              </div>
            )}

            {/* Formulario de incidencia - Solo si tiene permiso para gestionar asistencia */}
            {userPermissions['can_manage_attendance'] && (
              <div className="space-y-3">
                <select
                  value={incidentType}
                  onChange={e => setIncidentType(e.target.value)}
                  className="input-dark h-11 w-full px-4 text-sm"
                >
                  <option value="nota">Nota de Supervisión</option>
                  <option value="permiso">Permiso Especial</option>
                  <option value="ausencia">Ausencia Justificada</option>
                  <option value="justificante">Carga de Justificante</option>
                </select>

                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Escribe el motivo o nota aquí..."
                  rows={4}
                  className="input-dark w-full p-4 text-sm resize-none"
                />

                <div className="flex gap-2">
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed p-3.5 text-[11px] font-black uppercase tracking-widest transition"
                    style={{ borderColor: 'var(--border-soft)', color: 'var(--text-light)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.color = 'var(--text-light)' }}
                  >
                    <Camera size={15} /> Foto
                  </button>
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed p-3.5 text-[11px] font-black uppercase tracking-widest transition"
                    style={{ borderColor: 'var(--border-soft)', color: 'var(--text-light)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.color = 'var(--text-light)' }}
                  >
                    <FileText size={15} /> PDF
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-5 flex gap-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-app)' }}>
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
            >
              Cerrar
            </button>
            {userPermissions['can_manage_attendance'] && (
              <button
                disabled={loadingAction !== null || !notes.trim()}
                onClick={handleSaveNote}
                className="flex-1 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-40"
                style={{ background: 'var(--primary)', boxShadow: '0 0 20px var(--primary-soft)' }}
              >
                {loadingAction === 'NOTE' ? '...' : 'Guardar Nota'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Botón de acción ───────────────────────────────────────────────────────────
function ActionButton({
  label, icon, colorClass, onClick, disabled, loading,
}: {
  label: string; icon: string; colorClass: string
  onClick: () => void; disabled: boolean; loading: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[88px] flex-col items-center justify-center gap-2 rounded-2xl text-white transition-all active:scale-95 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed ${colorClass}`}
    >
      {loading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <span className="text-xl leading-none">{icon}</span>
      )}
      <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
    </button>
  )
}
