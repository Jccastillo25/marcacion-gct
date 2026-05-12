import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { AttendanceView } from './_views/attendance-view'
import { HoursView } from './_views/hours-view'
import { IncidentsView } from './_views/incidents-view'
import { MonthlySummaryView } from './_views/monthly-summary-view'

interface ReportsHubProps {
  searchParams: Promise<{
    type?: string
    start?: string
    end?: string
    date?: string
    branch?: string
    employee?: string
  }>
}

const TABS = [
  { id: 'hours', label: 'Horas Trabajadas', default: true },
  { id: 'attendance', label: 'Asistencia Diaria' },
  { id: 'incidents', label: 'Tardanzas y Ausencias' },
  { id: 'monthly-summary', label: 'Resumen Mensual' },
]

export default async function ReportsHubPage({ searchParams }: ReportsHubProps) {
  const params = await searchParams
  const activeTab = params.type || 'hours'

  // Verify permission to view reports
  const permResult = await requirePermission('can_view_reports')
  if (!permResult.ok) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <p className="font-bold">Acceso denegado</p>
          <p className="text-sm mt-2">{permResult.error}</p>
        </div>
      </div>
    )
  }
  const companyId = permResult.companyId

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-700/50 pb-4 md:flex-row md:items-end md:justify-between px-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Centro de Reportes y Nómina</h1>
          <p className="mt-1 text-sm text-slate-400">
            Hub unificado para exportación de datos y cálculos horariales.
          </p>
        </div>

        <nav className="flex space-x-2 shrink-0 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                href={`/reports?type=${tab.id}&start=${params.start || ''}&end=${params.end || ''}&date=${params.date || ''}&branch=${params.branch || ''}`}
                className={`rounded-full px-5 py-2 text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="w-full">
        {activeTab === 'hours' && (
          <HoursView companyId={companyId} start={params.start} end={params.end} branch={params.branch} />
        )}
        {activeTab === 'attendance' && (
          <AttendanceView companyId={companyId} date={params.date} branch={params.branch} />
        )}
        {activeTab === 'incidents' && (
          <IncidentsView companyId={companyId} start={params.start} end={params.end} employee={params.employee} />
        )}
        {activeTab === 'monthly-summary' && (
          <MonthlySummaryView companyId={companyId} />
        )}
      </div>
    </div>
  )
}
