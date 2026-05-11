'use client'

import { useGlobalContext } from '@/components/context/GlobalContext'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface ExportButtonsProps {
  data: Record<string, unknown>[]
  filename: string
  columns: { key: string; label: string }[]
}

export function ExportButtons({ data, filename, columns }: ExportButtonsProps) {
  const { userPermissions } = useGlobalContext()
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  // Verifica permiso antes de renderizar
  if (!userPermissions['can_view_reports']) {
    return null
  }

  const exportToExcel = async () => {
    setIsGeneratingExcel(true)
    try {
      // Importa dinámicamente xlsx
      const XLSX = await import('xlsx')

      // Prepara datos para exportación
      const exportData = data.map((row) => {
        const newRow: Record<string, unknown> = {}
        columns.forEach((col) => {
          newRow[col.label] = row[col.key]
        })
        return newRow
      })

      // Crea workbook
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Datos')

      // Descarga
      XLSX.writeFile(wb, `${filename}_${new Date().getTime()}.xlsx`)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Error al exportar a Excel. Verifica la consola.')
    } finally {
      setIsGeneratingExcel(false)
    }
  }

  const exportToPdf = async () => {
    setIsGeneratingPdf(true)
    try {
      // Importa dinámicamente jspdf
      const { jsPDF } = await import('jspdf')
      const autoTable = await import('jspdf-autotable')

      const doc = new jsPDF()

      // Prepara datos
      const tableData = data.map((row) =>
        columns.map((col) => {
          const value = row[col.key]
          return value !== null && value !== undefined ? String(value) : '—'
        })
      )

      const tableColumns = columns.map((col) => col.label)

      // Agrega tabla al PDF
      autoTable(doc, {
        head: [tableColumns],
        body: tableData,
        startY: 20,
        styles: {
          fontSize: 9,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
      })

      // Descarga
      doc.save(`${filename}_${new Date().getTime()}.pdf`)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      alert('Error al exportar a PDF. Verifica la consola.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={exportToExcel}
        disabled={isGeneratingExcel || data.length === 0}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-black uppercase tracking-widest transition focus:outline-none ${
          data.length === 0
            ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/50'
            : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:-translate-y-0.5 active:translate-y-0'
        }`}
      >
        {isGeneratingExcel ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Exportar Excel</span>
      </button>

      <button
        onClick={exportToPdf}
        disabled={isGeneratingPdf || data.length === 0}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-black uppercase tracking-widest transition focus:outline-none ${
          data.length === 0
            ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/50'
            : 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 hover:-translate-y-0.5 active:translate-y-0'
        }`}
      >
        {isGeneratingPdf ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Exportar PDF</span>
      </button>
    </div>
  )
}
