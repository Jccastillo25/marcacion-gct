'use client'

import { useTransition } from 'react'
import { approveTimeCorrection, rejectTimeCorrection } from '../../../actions/attendance'

export function CorrectionActionButtons({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition()

  if (status !== 'pending') return null

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approveTimeCorrection(id)
      if (res?.error) alert(res.error)
    })
  }

  const handleReject = () => {
    const reason = prompt('Motivo del rechazo (opcional):') ?? undefined
    startTransition(async () => {
      const res = await rejectTimeCorrection(id, reason)
      if (res?.error) alert(res.error)
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="rounded-full px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-full px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
      >
        Rechazar
      </button>
    </div>
  )
}
