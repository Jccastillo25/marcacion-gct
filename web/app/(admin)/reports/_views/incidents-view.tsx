'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportActions } from '../_components/report-actions'
import { IntegrityScanner } from '../_components/integrity-scanner'
import { getNicaISODate, getNicaRange, formatInNica } from '@/lib/date-utils'

interface IncidentsViewProps {
  companyId?: string
  start?: string
  end?: string
  employee?: string
}

export function IncidentsView({ companyId = '', start, end, employee }: IncidentsViewProps) {
  const [incidents, setIncidents] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [canExport, setCanExport] = useState(false)
  const supabase = createClient()

  const filterStart = start || getNicaISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  const filterEnd   = end   || getNicaISODate()

  async function fetchData() {
    setLoading(true)

    // We use consolidated view to see tardiness as well
    let query = supabase
      .from('consolidated_attendance_view')
      .select('*')
      .eq('company_id', companyId)
      .gt('late_minutes', 0)
      .gte('attendance_date', filterStart)
      .lte('attendance_date', filterEnd)

    if (employee && employee !== 'all') {
      query = query.eq('employee_id', employee)
    }

    const { data: recordsData } = await query
    const { data: empData } = await supabase.from('employees').select('id, first_name, last_name').eq('company_id', companyId).order('first_name')

    setIncidents(recordsData || [])
    setEmployees(empData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [start, end, employee])

  const statsByEmployee = incidents?.reduce((acc: any, curr: any) => {
    const id = curr.employee_id
    if (!acc[id]) {
      acc[id] = { name: curr.full_name, count: 0, totalMinutes: 0 }
    }
    acc[id].count += 1
    acc[id].totalMinutes += curr.late_minutes
    return acc
  }, {})

  const sortedStats = Object.values(statsByEmployee || {}).sort((a: any, b: any) => b.totalMinutes - a.totalMinutes)

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4 app-surface p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hub de Reportes</p>
          <h1 className="mt-2 text-3xl font-black text-white tracking-tight">Tardanzas y Ausencias</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Análisis acumulativo de retrasos bajo el motor Gestor360.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <ReportActions 
            canExport={canExport}
            filters={{ start: filterStart, end: filterEnd, type: 'incidents' }}
          />
        </div>
      </div>

      <div className="max-w-xl">
        <IntegrityScanner
          companyId={companyId}
          start={filterStart}
          end={filterEnd}
          onValidated={setCanExport}
        />
      </div>

      <div className="app-surface p-6 print:hidden">
        <form className="grid gap-4 sm:grid-cols-4">
          <input type="hidden" name="type" value="incidents" />
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Desde</label>
            <input type="date" name="start" defaultValue={filterStart} className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Hasta</label>
            <input type="date" name="end" defaultValue={filterEnd} className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Empleado</label>
            <select name="employee" defaultValue={employee || 'all'} className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
              <option value="all">Todos</option>
              {employees?.map(e => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="h-10 w-full rounded-xl bg-blue-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600 hover:-translate-y-0.5 active:translate-y-0">
              Cargar Reporte
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center app-surface">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Ranking */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-black text-white px-2 tracking-tight">Top de Retrasos</h2>
            <div className="app-surface p-4 space-y-3">
              {sortedStats.map((s: any, i) => (
                <div key={s.name} className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[10px] font-black text-white">{i + 1}</span>
                    <span className="text-[11px] font-bold text-slate-300 truncate max-w-[120px]">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-amber-500">{s.totalMinutes} min</p>
                    <p className="text-[10px] font-medium text-slate-500">{s.count} incidencia(s)</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-black text-white px-2 tracking-tight">Detalle de Incidencias</h2>
            <div className="app-surface overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Empleado</th>
                    <th className="px-6 py-4 text-right">Tardanza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {incidents.map((inc: any) => (
                    <tr key={inc.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4 text-slate-300 font-medium">
                        {formatInNica(inc.clock_in, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{inc.full_name}</p>
                        <p className="text-[10px] font-mono text-slate-500 uppercase">{inc.employee_code}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-block rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-[11px] font-black text-amber-500">
                          +{inc.late_minutes} min
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
