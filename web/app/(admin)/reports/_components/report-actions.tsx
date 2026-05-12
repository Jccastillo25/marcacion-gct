'use client'

import { Printer, Download, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useGlobalContext } from '@/context/GlobalContext'
import { useState } from 'react'

interface ReportActionsProps {
  data?: any[]
  summary?: { total: number; punctual: number; late: number }
  filters: {
    date?: string;
    start?: string;
    end?: string;
    branch?: string;
    company_id?: string;
    type?: string;
  }
  canExport?: boolean
}

export function ReportActions({ data, summary, filters, canExport = false }: ReportActionsProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const { userPermissions } = useGlobalContext()
  const supabase = createClient()

  // Verify user has permission to view reports
  if (!userPermissions['can_view_reports']) {
    return null
  }

  const generateProfessionalPDF = async () => {
    if (!canExport) return

    setIsGenerating(true)
    try {
      // 1. Call the Supabase Edge Function
      const { data: response, error } = await supabase.functions.invoke('generate-report', {
        body: {
          start: filters.start || filters.date,
          end: filters.end || filters.date,
          branch_id: filters.branch,
          company_id: filters.company_id,
          type: filters.type || 'attendance'
        }
      })

      if (error) throw error

      // 2. Validate we received a PDF, not a JSON error body
      if (response instanceof ArrayBuffer && response.byteLength < 10) {
        throw new Error('Respuesta vacía del servidor.')
      }
      // If the edge function returned a JSON error, response will be an object
      if (response && typeof response === 'object' && !(response instanceof ArrayBuffer) && !ArrayBuffer.isView(response)) {
        const errMsg = (response as any)?.error || 'Error desconocido del servidor.'
        throw new Error(errMsg)
      }

      const blob = new Blob([response], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = filters.start && filters.end
        ? `${filters.start}_${filters.end}`
        : filters.date || filters.start || 'reporte'
      a.download = `Reporte_Gestor360_${filters.type || 'asistencia'}_${suffix}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Error al generar el reporte profesional. Verifique la consola para más detalles.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={handlePrint}
        className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 text-[11px] font-black uppercase tracking-widest text-slate-300 transition hover:bg-slate-700 focus:outline-none"
      >
        <Printer className="w-4 h-4" />
        <span className="hidden sm:inline">Imprimir</span>
      </button>

      <button
        onClick={generateProfessionalPDF}
        disabled={!canExport || isGenerating}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-black uppercase tracking-widest transition focus:outline-none ${
          !canExport 
            ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/50' 
            : 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 hover:-translate-y-0.5 active:translate-y-0'
        }`}
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 animate-spin border-white" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Descargar Reporte Legal</span>
      </button>
    </div>
  )
}
