'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ReportActions } from '../_components/report-actions'
import { IntegrityScanner } from '../_components/integrity-scanner'
import { ExportButtons } from '../_components/export-buttons'
import { ReportFilters } from '../_components/report-filters'
import { getNicaISODate, getNicaRange } from '@/lib/date-utils'
import type { ReportFilters as ReportFiltersType } from '../_components/report-filters'

interface AttendanceViewProps {
  companyId: string
  date?: string
  branch?: string
}

interface AttendanceRecord {
  id: string
  clock_in: string
  clock_out: string | null
  status: string
  source_origin: string
  company_id: string
  employees: {
    first_name: string
    last_name: string
    employee_code: string
    branch_id: string
    branches: { name: string } | null
  } | null
}

export function AttendanceView({ companyId, date, branch }: AttendanceViewProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [canExport, setCanExport] = useState(false)
  const [filters, setFilters] = useState<ReportFiltersType>({
    dateFrom: date || getNicaISODate(),
    dateTo: date || getNicaISODate(),
    branchId: branch || null,
  })
  const supabase = useRef(createClient()).current

  useEffect(() => {
    if (!companyId) return

    let cancelled = false

    async function fetchData() {
      setLoading(true)

      let query = supabase
        .from('attendance_logs')
        .select('id, clock_in, clock_out, status, source_origin, company_id, employees(first_name, last_name, employee_code, branch_id, branches(name))')
        .eq('company_id', companyId)
        .gte('clock_in', filters.dateFrom)
        .lte('clock_in', filters.dateTo)
        .order('clock_in', { ascending: true })

      if (filters.branchId && filters.branchId !== 'all') {
        query = query.eq('employees.branch_id', filters.branchId)
      }

      const [{ data: recordsData }, { data: branchesData }] = await Promise.all([
        query,
        supabase.from('branches').select('id, name').eq('company_id', companyId).order('name'),
      ])

      if (cancelled) return

      setRecords((recordsData as AttendanceRecord[]) || [])
      setBranches((branchesData as Array<{ id: string; name: string }>) || [])
      setLoading(false)
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [companyId, filters, supabase])

  const punctual = records.filter((r) => r.status === 'on_time').length
  const late = records.filter((r) => r.status === 'late').length

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4 app-surface p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hub de Reportes</p>
          <h1 className="mt-2 text-3xl font-black text-white tracking-tight">Historico de Cierres (Asistencia Diaria)</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Analisis de asistencia y jornadas registradas.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <ReportActions
            canExport={canExport}
            filters={{ date: filters.dateFrom, branch: branch || 'all', type: 'attendance' }}
          />
        </div>
      </div>

      <div className="max-w-xl">
        <IntegrityScanner
          companyId={companyId}
          start={filters.dateFrom}
          end={filters.dateTo}
          branchId={branch}
          onValidated={setCanExport}
        />
      </div>

      <ReportFilters
        onFilterChange={setFilters}
        initialFilters={{
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          branchId: filters.branchId,
        }}
      />

      {!loading && records.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3 px-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[11px] font-black text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {punctual} Puntuales
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-[11px] font-black text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {late} Con Retraso
            </span>
          </div>
          <div className="print:hidden">
            <ExportButtons
              data={records.map((r) => ({
                employee_name: r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : 'N/A',
                employee_code: r.employees?.employee_code || '',
                branch: r.employees?.branches?.name || 'N/A',
                clock_in: new Date(r.clock_in).toLocaleString('es-NI'),
                clock_out: r.clock_out ? new Date(r.clock_out).toLocaleString('es-NI') : 'N/A',
                status: r.status === 'late' ? 'RETRASO' : 'PUNTUAL',
                source: r.source_origin || 'KIOSK',
              }))}
              filename="Asistencia_Diaria"
              columns={[
                { key: 'employee_name', label: 'Empleado' },
                { key: 'employee_code', label: 'Codigo' },
                { key: 'branch', label: 'Sucursal' },
                { key: 'clock_in', label: 'Entrada' },
                { key: 'clock_out', label: 'Salida' },
                { key: 'status', label: 'Estado' },
                { key: 'source', label: 'Origen' },
              ]}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center app-surface">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="app-surface overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Sucursal</th>
                <th className="px-6 py-4">Entrada</th>
                <th className="px-6 py-4">Salida</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {records.length > 0 ? (
                records.map((r) => {
                  const emp = r.employees
                  const inTime = new Date(r.clock_in).toLocaleTimeString('es-NI', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                  const outTime = r.clock_out
                    ? new Date(r.clock_out).toLocaleTimeString('es-NI', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'N/A'
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white">
                          {emp ? `${emp.first_name} ${emp.last_name}` : 'N/A'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 uppercase">{emp?.employee_code || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{emp?.branches?.name || 'N/A'}</td>
                      <td className="px-6 py-4 font-mono text-white">{inTime}</td>
                      <td className="px-6 py-4 font-mono text-slate-400">{outTime}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] font-black tracking-widest uppercase ${
                            r.status === 'late' ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {r.status === 'late' ? 'RETRASO' : 'PUNTUAL'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">
                        {r.source_origin || 'KIOSK'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm font-medium">
                    No hay datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
