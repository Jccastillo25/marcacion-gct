'use client'

import { useTransition } from 'react'
import { approveLeaveRequest, rejectLeaveRequest } from '../../actions/attendance'

export function LeaveActionButtons({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition()

  if (status !== 'pending') return null

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approveLeaveRequest(id)
      if (res?.error) alert(res.error)
    })
  }

  const handleReject = () => {
    const reason = prompt('Motivo del rechazo (opcional):') ?? undefined
    startTransition(async () => {
      const res = await rejectLeaveRequest(id, reason)
      if (res?.error) alert(res.error)
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
      >
        Rechazar
      </button>
    </div>
  )
}
