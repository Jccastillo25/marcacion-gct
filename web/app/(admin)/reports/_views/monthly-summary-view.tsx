'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ExportButtons } from '../_components/export-buttons'

interface MonthlySummaryViewProps {
  companyId: string
}

interface MonthlySummaryRecord {
  employee_id: string
  full_name: string
  employee_code: string
  branch_name: string
  days_worked: number
  total_hours: number
  tardiness_incidents: number
  absences: number
}

export function MonthlySummaryView({ companyId }: MonthlySummaryViewProps) {
  const [records, setRecords] = useState<MonthlySummaryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => {
    const today = new Date()
    return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0')
  })
  const supabase = useRef(createClient()).current

  useEffect(() => {
    if (!companyId || !month) return

    let cancelled = false

    async function fetchData() {
      setLoading(true)

      // Parse year/month
      const [year, monthNum] = month.split('-').map(Number)
      const startDate = new Date(year, monthNum - 1, 1)
      const endDate = new Date(year, monthNum, 0)

      const startISO = startDate.toISOString().split('T')[0]
      const endISO = endDate.toISOString().split('T')[0]

      // Fetch consolidated view with filtering
      const { data: attendanceData } = await supabase
        .from('consolidated_attendance_view')
        .select('*')
        .eq('company_id', companyId)
        .gte('attendance_date', startISO)
        .lte('attendance_date', endISO)

      if (cancelled) return

      // Aggregate by employee
      interface EmployeeAgg {
        employee_id: string
        full_name: string
        employee_code: string
        branch_name: string
        days_worked: number
        total_hours: number
        tardiness_incidents: number
        absences: number
        daysSet: Set<string>
      }
      const empMap: Record<string, EmployeeAgg> = {}

      attendanceData?.forEach((record) => {
        const empId = record.employee_id
        if (!empMap[empId]) {
          empMap[empId] = {
            employee_id: empId,
            full_name: record.full_name,
            employee_code: record.employee_code,
            branch_name: record.branch_name || 'N/A',
            days_worked: 0,
            total_hours: 0,
            tardiness_incidents: 0,
            absences: 0,
            daysSet: new Set<string>(),
          }
        }

        empMap[empId].daysSet.add(record.attendance_date)
        empMap[empId].total_hours += record.net_hours || 0
        if (record.late_minutes && record.late_minutes > 0) {
          empMap[empId].tardiness_incidents += 1
        }
      })

      // Finalize data
      const finalRecords: MonthlySummaryRecord[] = Object.values(empMap).map((emp) => ({
        employee_id: emp.employee_id,
        full_name: emp.full_name,
        employee_code: emp.employee_code,
        branch_name: emp.branch_name,
        days_worked: emp.daysSet.size,
        total_hours: parseFloat(emp.total_hours.toFixed(2)),
        tardiness_incidents: emp.tardiness_incidents,
        absences: emp.absences,
      }))

      setRecords(finalRecords.sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setLoading(false)
    }

    fetchData()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, month])

  const exportColumns = [
    { key: 'employee_code', label: 'Código' },
    { key: 'full_name', label: 'Empleado' },
    { key: 'branch_name', label: 'Sucursal' },
    { key: 'days_worked', label: 'Días Laborados' },
    { key: 'total_hours', label: 'Horas Totales' },
    { key: 'tardiness_incidents', label: 'Tardanzas' },
    { key: 'absences', label: 'Ausencias' },
  ]

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4 app-surface p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Hub de Reportes
          </p>
          <h1 className="mt-2 text-3xl font-black text-white tracking-tight">
            Resumen Mensual por Empleado
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Consolidado de desempeño mensual: horas trabajadas, tardanzas y ausencias.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <ExportButtons
            data={records}
            filename="Resumen_Mensual"
            columns={exportColumns}
          />
        </div>
      </div>

      <div className="app-surface p-6 print:hidden">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Mes y Año
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button className="h-10 rounded-xl bg-blue-500 px-6 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600 hover:-translate-y-0.5 active:translate-y-0">
            Cargar
          </button>
        </div>
      </div>

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
                <th className="px-6 py-4 text-center">Días Laborados</th>
                <th className="px-6 py-4 text-right">Horas Totales</th>
                <th className="px-6 py-4 text-center">Tardanzas</th>
                <th className="px-6 py-4 text-center">Ausencias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {records.length > 0 ? (
                records.map((emp) => (
                  <tr key={emp.employee_id} className="hover:bg-slate-800/50 transition">
                    <td className="px-6 py-4">
                      <p className="font-bold text-white">{emp.full_name}</p>
                      <p className="text-[10px] font-mono text-slate-500 uppercase">{emp.employee_code}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{emp.branch_name}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-block rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-black text-blue-400 border border-blue-500/20">
                        {emp.days_worked}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-lg font-black text-white">{emp.total_hours}</span>
                      <span className="ml-1 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block rounded-lg px-2 py-1 text-[11px] font-black border ${
                          emp.tardiness_incidents > 0
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {emp.tardiness_incidents}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block rounded-lg px-2 py-1 text-[11px] font-black border ${
                          emp.absences > 0
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {emp.absences}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm font-medium">
                    No hay datos para este período.
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
