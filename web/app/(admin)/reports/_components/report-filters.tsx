'use client'

import { useGlobalContext } from '@/context/GlobalContext'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ReportFilters {
  dateFrom: string
  dateTo: string
  branchId: string | null
}

interface Branch {
  id: string
  name: string
}

interface ReportFiltersProps {
  onFilterChange: (filters: ReportFilters) => void
  initialFilters?: Partial<ReportFilters>
}

export function ReportFilters({ onFilterChange, initialFilters }: ReportFiltersProps) {
  const { userPermissions, companyId } = useGlobalContext()
  const supabase = createClient()
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || '')
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || '')
  const [branchId, setBranchId] = useState<string | null>(initialFilters?.branchId || null)
  const [branches, setBranches] = useState<Branch[]>([])

  if (!userPermissions['can_view_reports']) {
    return null
  }

  useEffect(() => {
    if (!companyId) return

    async function fetchBranches() {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name')

      setBranches((data as Branch[]) || [])
    }

    fetchBranches()
  }, [companyId, supabase])

  const handleApplyFilters = () => {
    onFilterChange({
      dateFrom,
      dateTo,
      branchId: branchId === 'null' ? null : branchId,
    })
  }

  return (
    <div className="app-surface p-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Fecha Inicial
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Fecha Final
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Sucursal
            </label>
            <select
              value={branchId === null ? 'null' : branchId}
              onChange={(e) => setBranchId(e.target.value === 'null' ? null : e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="null">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            onClick={handleApplyFilters}
            className="h-10 rounded-xl bg-blue-500 px-6 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600 hover:-translate-y-0.5 active:translate-y-0"
          >
            Aplicar Filtros
          </button>
        </div>
      </div>
    </div>
  )
}
