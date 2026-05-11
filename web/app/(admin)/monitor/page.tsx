'use client'

import { useState } from 'react'
import { MonitorGrid } from '@/components/Monitor/MonitorGrid'
import { ActionDrawer } from '@/components/Monitor/ActionDrawer'
import { useGlobalContext } from '@/context/GlobalContext'
import { AlertCircle } from 'lucide-react'
import type { Employee } from '@/components/Monitor/EmployeeCard'

import { InssAlertWidget } from '@/components/ui/InssAlertWidget'

export default function MonitorPage() {
  const { companyId, isLoading: isContextLoading, userRole, userPermissions } = useGlobalContext()
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [isDrawerOpen, setIsDrawerOpen]         = useState(false)

  const handleOpenDrawer = (employee: Employee) => {
    setSelectedEmployee(employee)
    setIsDrawerOpen(true)
  }

  const isAdminOrRRHH = ['admin', 'owner', 'rrhh'].includes(userRole?.toLowerCase() || '')

  if (isContextLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4"
          style={{ borderColor: 'var(--border-soft)', borderTopColor: 'var(--primary)' }}
        />
      </div>
    )
  }

  if (!companyId || companyId === 'all') {
    return (
      <div
        className="flex flex-col items-center justify-center p-20 rounded-2xl"
        style={{ border: '1px solid var(--border-soft)', background: 'var(--bg-surface)' }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full border"
          style={{ background: 'var(--primary-softer)', borderColor: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <AlertCircle size={40} />
        </div>
        <h2 className="mt-6 text-xl font-black tracking-tight" style={{ color: 'var(--text-strong)' }}>
          Selecciona una empresa
        </h2>
        <p className="mt-2 max-w-xs text-center text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Para ver el Monitor Operativo 360°, selecciona una empresa específica desde el selector en la barra superior.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* ── Encabezado ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between px-1">
        <div>
          <p className="section-label mb-1">Control de Operaciones</p>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--text-strong)' }}>
            Monitor Operativo{' '}
            <span style={{ color: 'var(--primary)' }}>360°</span>
          </h1>
          <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            Supervisión omnicanal sincronizada con Kioskos y Tablets.
          </p>
        </div>

        {/* Indicador en vivo */}
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-2 border self-start md:self-auto"
          style={{
            background: 'rgba(16,185,129,0.08)',
            borderColor: 'rgba(16,185,129,0.2)',
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: 'var(--success)' }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--success)' }} />
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--success)' }}>
            Servidor en Línea
          </span>
        </div>
      </div>

      {/* ── Alertas de Cumplimiento (Solo Admin/RRHH) ── */}
      {isAdminOrRRHH && <InssAlertWidget companyId={companyId} />}

      {/* ── Grid principal ── */}
      <MonitorGrid
        companyId={companyId}
        onOpenActionDrawer={handleOpenDrawer}
      />

      {/* ── Drawer de acciones ── */}
      <ActionDrawer
        employee={selectedEmployee}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  )
}
