import { createClient } from '@/lib/supabase/server'
import { LeaveActionButtons } from './actions-client'
import { NewLeaveRequestButton } from './_components/new-leave-request-button'

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pendiente',  cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  approved: { label: 'Aprobado',   cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  rejected: { label: 'Rechazado',  cls: 'bg-red-500/10 text-red-400 border border-red-500/20' },
  cancelled:{ label: 'Cancelado',  cls: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' },
}

export default async function LeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get counts by status
  const [
    { count: pending },
    { count: approved },
    { count: rejected },
    { count: cancelled },
  ] = await Promise.all([
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
  ])

  // Get requests with joins
  const { data: requests } = await supabase
    .from('leave_requests')
    .select('id, status, start_date, end_date, days_requested, reason, employee_id, employees(id, first_name, last_name), leave_types(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  const stats = [
    { label: 'Pendientes',     value: pending   ?? 0 },
    { label: 'Aprobadas',      value: approved  ?? 0 },
    { label: 'Rechazadas',     value: rejected  ?? 0 },
    { label: 'Canceladas',     value: cancelled ?? 0 },
  ]

  // Get user's current employee ID for permission checks
  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('id')
    .eq('email', user?.email)
    .single()

  return (
    <section className="space-y-6">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">
              Operación
            </p>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Permisos y ausencias
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Control de solicitudes, tipos de permiso, aprobaciones y estado del equipo.
            </p>
          </div>
          <NewLeaveRequestButton />
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="app-surface p-5 relative overflow-hidden group hover:border-slate-500 transition-all">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-2">{s.label}</p>
              <p className="text-3xl font-black text-white tracking-tight">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabla de solicitudes */}
        <div className="app-surface overflow-hidden">
          <div className="border-b border-slate-700/50 px-6 py-5 flex items-center justify-between">
            <h2 className="text-base font-black text-white tracking-tight uppercase">
              Solicitudes recientes
            </h2>
          </div>

          {requests && requests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 border-b border-slate-700/50">
                  <tr className="text-left">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Empleado</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Fechas</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Días</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-300">
                  {requests.map((req) => {
                    const emp = req.employees as unknown as { id: string; first_name: string; last_name: string } | null
                    const lt  = req.leave_types as unknown as { name: string } | null
                    const sc  = statusConfig[req.status] ?? { label: req.status, cls: 'bg-slate-100 text-slate-500' }
                    const fmtDate = (d: string) =>
                      new Date(d).toLocaleDateString('es-NI', { day: 'numeric', month: 'short', year: 'numeric' })
                    const isOwnRequest = emp?.id === currentEmployee?.id
                    return (
                      <tr key={req.id} className="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 last:border-0">
                        <td className="px-6 py-4 font-bold text-white">
                          {emp ? `${emp.first_name} ${emp.last_name}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-medium">{lt?.name ?? '—'}</td>
                        <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                          {fmtDate(req.start_date)} – {fmtDate(req.end_date)}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400">
                          {Number(req.days_requested)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${sc.cls}`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 max-w-xs truncate text-xs">
                          {req.reason}
                        </td>
                        <td className="px-6 py-4">
                          <LeaveActionButtons
                            id={req.id}
                            status={req.status}
                            canManageLeaves={true}
                            isOwnRequest={isOwnRequest}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-bold text-slate-500">
                No hay solicitudes de permiso registradas.
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Las solicitudes aparecerán aquí cuando los empleados las envíen.
              </p>
            </div>
          )}
        </div>

      </section>
  )
}
