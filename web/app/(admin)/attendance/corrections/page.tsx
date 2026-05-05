import { createClient } from '@/lib/supabase/server'
import { CorrectionActionButtons } from './actions-client'

type TimeCorrection = {
  id: string
  reason: string
  status: string
  correction_type: string
  original_recorded_at: string
  proposed_recorded_at: string
  created_at: string
  rejection_reason: string | null
  employees: { first_name: string; last_name: string; employee_code: string } | null
  time_records: { recorded_at: string; event_type: string } | null
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprobada',   cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rechazada',  cls: 'bg-red-100   text-red-700'   },
}

const correctionTypeLabel: Record<string, string> = {
  adjust_time:        'Ajuste de hora',
  change_event_type:  'Cambio de tipo',
  delete:             'Eliminación',
  add:                'Agregar marcación',
}

const eventTypeLabel: Record<string, string> = {
  clock_in:  'Entrada',
  clock_out: 'Salida',
  break_start: 'Inicio descanso',
  break_end:   'Fin descanso',
}

export default async function CorrectionsPage() {
  const supabase = await createClient()

  const { data: rawCorrections } = await supabase
    .from('time_corrections')
    .select(
      'id, reason, status, correction_type, original_recorded_at, proposed_recorded_at, rejection_reason, created_at, ' +
      'employees(first_name, last_name, employee_code), ' +
      'time_records(recorded_at, event_type)'
    )
    .order('created_at', { ascending: false })
    .limit(50)

  const corrections = rawCorrections as unknown as TimeCorrection[] | null

  const pending  = corrections?.filter((c) => c.status === 'pending').length  ?? 0
  const approved = corrections?.filter((c) => c.status === 'approved').length ?? 0
  const rejected = corrections?.filter((c) => c.status === 'rejected').length ?? 0
  const total    = corrections?.length ?? 0

  const stats = [
    { label: 'Total',      value: total },
    { label: 'Pendientes', value: pending },
    { label: 'Aprobadas',  value: approved },
    { label: 'Rechazadas', value: rejected },
  ]

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-NI', {
      timeZone: 'America/Managua',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <section className="space-y-6">

      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Asistencia</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Correcciones</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Solicitudes de ajuste de marcaciones y cambios manuales enviados por supervisores.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Solicitudes de corrección ({total})
          </h2>
        </div>

        {corrections && corrections.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Empleado</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Marcación original</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Propuesta</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Motivo</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Solicitado</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {corrections.map((c) => {
                  const emp = c.employees
                  const rec = c.time_records
                  const st  = statusConfig[c.status] ?? { label: c.status, cls: 'bg-slate-100 text-slate-600' }
                  const ctLabel = correctionTypeLabel[c.correction_type] ?? c.correction_type
                  const etLabel = rec ? (eventTypeLabel[rec.event_type] ?? rec.event_type) : null
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">
                          {emp ? `${emp.first_name} ${emp.last_name}` : '—'}
                        </p>
                        {emp?.employee_code && (
                          <p className="text-xs font-mono text-slate-400">{emp.employee_code}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                          {ctLabel}
                        </span>
                        {etLabel && (
                          <p className="mt-1 text-xs text-slate-400">{etLabel}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {fmt(c.original_recorded_at)}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {fmt(c.proposed_recorded_at)}
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs">
                        <p className="truncate">{c.reason}</p>
                        {c.rejection_reason && (
                          <p className="mt-1 text-xs text-red-500 truncate">Rechazo: {c.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {fmt(c.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <CorrectionActionButtons id={c.id} status={c.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-500">No hay solicitudes de corrección registradas.</p>
            <p className="mt-1 text-xs text-slate-400">
              Las correcciones aparecerán aquí cuando los supervisores envíen ajustes de marcación.
            </p>
          </div>
        )}
      </div>

    </section>
  )
}
