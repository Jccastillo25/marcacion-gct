'use client'

import { useEffect, useState, useTransition } from 'react'
import { createLeaveRequest, getLeaveTypes } from '@/app/actions/leaves'
import type { LeaveType } from '@/src/types/leave'

interface NewLeaveRequestModalProps {
  onClose: () => void
}

export function NewLeaveRequestModal({ onClose }: NewLeaveRequestModalProps) {
  const [isPending, startTransition] = useTransition()
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)

  const [formData, setFormData] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: '',
  })

  // Load leave types
  useEffect(() => {
    const loadTypes = async () => {
      const types = await getLeaveTypes()
      if (types) setLeaveTypes(types)
      setLoading(false)
    }
    loadTypes()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.leave_type_id || !formData.start_date || !formData.end_date) {
      alert('Por favor completa los campos obligatorios')
      return
    }

    startTransition(async () => {
      // Get current user's employee ID (need to fetch from context or use a special action)
      // For now, we'll use a simpler approach: create via getMyLeaveRequests
      // Actually, we need to get the employee_id somehow - let's use a browser fetch to /api/auth/me

      const response = await fetch('/api/v1/auth/me')
      const { employee_id } = await response.json()

      if (!employee_id) {
        alert('No se pudo identificar tu perfil de empleado')
        return
      }

      const res = await createLeaveRequest({
        employee_id,
        leave_type_id: formData.leave_type_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason || undefined,
      })

      if (res?.error) {
        alert(res.error)
      } else {
        alert('Solicitud creada exitosamente')
        onClose()
      }
    })
  }

  const startDate = new Date(formData.start_date)
  const endDate = new Date(formData.end_date)
  const daysRequested =
    formData.start_date && formData.end_date
      ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-NI', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="app-surface p-6 rounded-lg max-w-lg w-full mx-4 border border-slate-700/50">
        <h2 className="text-xl font-black text-white mb-4">Nueva Solicitud de Permiso</h2>

        {loading ? (
          <div className="text-center py-8 text-slate-400">Cargando tipos de permisos...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Leave Type */}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                Tipo de Permiso *
              </label>
              <select
                value={formData.leave_type_id}
                onChange={(e) => setFormData({ ...formData, leave_type_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white focus:outline-none focus:border-slate-600 text-sm font-medium"
              >
                <option value="">Selecciona un tipo...</option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                Fecha de Inicio *
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white focus:outline-none focus:border-slate-600 text-sm font-medium"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                Fecha de Finalización *
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white focus:outline-none focus:border-slate-600 text-sm font-medium"
              />
            </div>

            {/* Days Summary */}
            {daysRequested > 0 && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-sm font-bold text-emerald-400">
                  {fmtDate(startDate)} — {fmtDate(endDate)}
                </p>
                <p className="text-xs text-emerald-300 mt-1">
                  Total: {daysRequested} día{daysRequested !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                Motivo (Opcional)
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Describe brevemente el motivo de tu solicitud..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-slate-600"
                rows={3}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? 'Enviando...' : 'Enviar Solicitud'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
