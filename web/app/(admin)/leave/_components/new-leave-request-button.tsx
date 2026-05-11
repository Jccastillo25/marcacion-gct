'use client'

import { useState } from 'react'
import { NewLeaveRequestModal } from './new-leave-request-modal'

export function NewLeaveRequestButton() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
      >
        + Nueva Solicitud
      </button>

      {showModal && <NewLeaveRequestModal onClose={() => setShowModal(false)} />}
    </>
  )
}
