'use client'

import { useState, useTransition } from 'react'
import { approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest } from '@/app/actions/leaves'

interface LeaveActionButtonsProps {
  id: string
  status: string
  canManageLeaves?: boolean
  isOwnRequest?: boolean
}

export function LeaveActionButtons({
  id,
  status,
  canManageLeaves = false,
  isOwnRequest = false,
}: LeaveActionButtonsProps) {
  const [isPending, startTransition] = useTransition()
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = () => {
    if (!window.confirm('¿Estás seguro de que deseas aprobar esta solicitud?')) return

    startTransition(async () => {
      const res = await approveLeaveRequest(id)
      if (res?.error) alert(res.error)
    })
  }

  const handleRejectSubmit = () => {
    startTransition(async () => {
      const res = await rejectLeaveRequest(id, rejectReason || undefined)
      if (res?.error) {
        alert(res.error)
      } else {
        setShowRejectModal(false)
        setRejectReason('')
      }
    })
  }

  const handleCancel = () => {
    if (!window.confirm('¿Estás seguro de que deseas cancelar esta solicitud?')) return

    startTransition(async () => {
      const res = await cancelLeaveRequest(id)
      if (res?.error) alert(res.error)
    })
  }

  // Pending: show approve/reject/cancel
  if (status === 'pending') {
    return (
      <>
        <div className="flex gap-2">
          {canManageLeaves && (
            <>
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                Aprobar
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={isPending}
                className="rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Rechazar
              </button>
            </>
          )}
          {isOwnRequest && (
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="app-surface p-6 rounded-lg max-w-sm w-full mx-4 border border-slate-700/50">
              <h3 className="text-base font-black text-white mb-4">Motivo del rechazo</h3>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explica el motivo del rechazo (opcional)..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 text-sm font-medium mb-4 focus:outline-none focus:border-slate-600"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowRejectModal(false)}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Rechazando...' : 'Rechazar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return null
}
