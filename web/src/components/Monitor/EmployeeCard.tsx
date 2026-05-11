'use client'

import React, { useState, useEffect } from 'react'
import { AlertTriangle, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useGlobalContext } from '@/context/GlobalContext'

export interface Employee {
  id: string
  first_name: string
  last_name: string
  current_status: string
  last_status_change: string
  photo_url?: string | null
  job_positions?: { id: string; name: string; level: number; parent_id: string | null } | null
  company_id: string
  employee_code?: string
  late_minutes?: number
  shift_hours?: number
  break_minutes?: number
}

interface Props {
  employee: Employee
  onOpenDrawer: (employee: Employee) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = ['#0d7ff2','#7c3aed','#059669','#d97706','#0891b2','#be185d','#65a30d','#dc2626']

function getAvatarColor(first: string, last: string): string {
  const hash = [...`${first}${last}`].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function getInitials(first: string, last: string): string {
  return (((first || '').trim()[0] ?? '') + ((last || '').trim()[0] ?? '')).toUpperCase() || '??'
}

function padTwo(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${padTwo(h)}:${padTwo(m)}:${padTwo(s)}`
  return `${padTwo(m)}:${padTwo(s)}`
}

function formatExcess(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `+${h}:${padTwo(m)}:${padTwo(s)}`
  return `+${padTwo(m)}:${padTwo(s)}`
}

// ── Componente ────────────────────────────────────────────────────────────────

export const EmployeeCard = ({ employee, onOpenDrawer }: Props) => {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [notifying, setNotifying] = useState(false)
  const supabase = createClient()
  const { userPermissions } = useGlobalContext()

  const shiftMs  = (employee.shift_hours   ?? 8)  * 3_600_000
  const breakMs  = (employee.break_minutes ?? 60) * 60_000
  const breakMin = employee.break_minutes ?? 60

  useEffect(() => {
    const tick = () => setElapsedMs(Date.now() - new Date(employee.last_status_change).getTime())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [employee.last_status_change])

  const isActive   = employee.current_status === 'active'
  const isBreak    = employee.current_status === 'on_break'
  const isOffline  = employee.current_status === 'offline'
  const isAbsent   = employee.current_status === 'absent'

  const breakExceeded = isBreak && elapsedMs > breakMs
  const overtime      = isActive && elapsedMs > shiftMs
  const breakProgress = isBreak ? Math.min(100, Math.round((elapsedMs / breakMs) * 100)) : 0
  const shiftProgress = isActive ? Math.min(100, Math.round((elapsedMs / shiftMs) * 100)) : 0

  const avatarColor = getAvatarColor(employee.first_name, employee.last_name)
  const initials    = getInitials(employee.first_name, employee.last_name)

  // ── Colores y estilos según estado ──────────────────────────────────────────
  let cardBorder = '1px solid rgba(255,255,255,0.07)'
  let dotColor   = '#64748b'
  let timerColor = '#94a3b8'
  let badgeEl: React.ReactNode = null

  if (breakExceeded) {
    cardBorder = '1.5px solid #ef4444'
    dotColor   = '#ef4444'
    timerColor = '#ef4444'
    badgeEl = <span style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444450', borderRadius: 99, padding: '2px 10px', fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>ALERTA</span>
  } else if (isBreak) {
    dotColor   = '#f59e0b'
    timerColor = '#f59e0b'
    badgeEl = <span style={{ background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40', borderRadius: 99, padding: '2px 10px', fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>EN DESCANSO</span>
  } else if (overtime) {
    dotColor   = '#a78bfa'
    timerColor = '#a78bfa'
    badgeEl = <span style={{ background: '#a78bfa20', color: '#a78bfa', border: '1px solid #a78bfa40', borderRadius: 99, padding: '2px 10px', fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>EXTRA</span>
  } else if (isActive) {
    dotColor   = '#10b981'
    timerColor = '#10b981'
  } else if (isAbsent) {
    dotColor   = '#f43f5e'
    cardBorder = '1px solid rgba(244,63,94,0.2)'
  }

  async function handleNotify() {
    if (!userPermissions['can_manage_attendance']) {
      console.warn('No tienes permiso para marcar asistencia')
      return
    }
    setNotifying(true)
    await supabase.rpc('rpc_mark_attendance_action', {
      p_company_id: employee.company_id,
      p_employee_id: employee.id,
      p_action: 'END_BREAK',
      p_source: 'MONITOR',
      p_notes: 'Notificación de regreso — descanso excedido'
    })
    setNotifying(false)
  }

  async function handleStartBreak() {
    if (!userPermissions['can_manage_attendance']) {
      console.warn('No tienes permiso para marcar asistencia')
      return
    }
    await supabase.rpc('rpc_mark_attendance_action', {
      p_company_id: employee.company_id,
      p_employee_id: employee.id,
      p_action: 'START_BREAK',
      p_source: 'MONITOR',
      p_notes: 'Descanso iniciado desde Monitor'
    })
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: cardBorder,
        borderRadius: 20,
        padding: '18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'box-shadow 0.2s, transform 0.2s',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={() => onOpenDrawer(employee)}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '' }}
    >
      {/* Glow superior */}
      {(isActive || isBreak) && (
        <div style={{ position: 'absolute', top: -30, right: -20, width: 80, height: 80, borderRadius: '50%', background: isBreak ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.10)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      )}

      {/* ── Fila superior: Avatar + Info + Badge ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Avatar circular */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: employee.photo_url ? 'transparent' : avatarColor + '28',
            border: `2px solid ${dotColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {employee.photo_url ? (
              <img src={employee.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <span style={{ color: avatarColor, fontWeight: 900, fontSize: 16, userSelect: 'none' }}>{initials}</span>
            )}
          </div>
          {/* Dot de estado */}
          <div style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 12, height: 12, borderRadius: '50%',
            background: dotColor,
            border: '2px solid var(--bg-surface)',
            boxShadow: `0 0 6px ${dotColor}80`,
          }} />
        </div>

        {/* Nombre + cargo + ID */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
            {employee.first_name} {employee.last_name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {employee.job_positions?.name || 'Operativo'}
          </div>
          {employee.employee_code && (
            <div style={{ fontSize: 9, color: 'var(--text-light)', fontFamily: 'monospace', marginTop: 1 }}>
              ID·{employee.employee_code}
            </div>
          )}
        </div>

        {/* Badge de estado */}
        {badgeEl}
      </div>

      {/* ── Temporizador central ── */}
      {(isActive || isBreak) && (
        <div style={{ textAlign: 'center' }}>
          {breakExceeded ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <AlertTriangle size={13} />
                TIEMPO EXCEDIDO ({formatExcess(elapsedMs - breakMs)})
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: timerColor, fontFamily: 'monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {formatTimer(elapsedMs)}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: overtime ? 26 : 32, fontWeight: 900, color: timerColor, fontFamily: 'monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {formatTimer(elapsedMs)}
            </div>
          )}
          {employee.late_minutes && employee.late_minutes > 0 && isActive && !overtime && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#f97316', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              ⚠ {employee.late_minutes} min tarde
            </div>
          )}
        </div>
      )}

      {/* ── Offline / Ausente ── */}
      {(isOffline || isAbsent) && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {isAbsent ? 'AUSENTE' : 'FUERA DE TURNO'}
        </div>
      )}

      {/* ── Progreso de descanso ── */}
      {isBreak && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Progreso de Descanso</span>
            <span style={{ color: breakExceeded ? '#ef4444' : '#f59e0b' }}>{breakProgress}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${breakProgress}%`, background: breakExceeded ? 'linear-gradient(90deg,#ef4444,#dc2626)' : 'linear-gradient(90deg,#f59e0b,#f97316)', transition: 'width 1s linear' }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-light)', textAlign: 'right' }}>
            Límite {padTwo(Math.floor(breakMin / 60))}:{padTwo(breakMin % 60)} min
          </div>
        </div>
      )}

      {/* ── Progreso de jornada (activo) ── */}
      {isActive && !overtime && shiftProgress > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Progreso de Jornada</span>
            <span style={{ color: '#10b981' }}>{shiftProgress}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${shiftProgress}%`, background: 'linear-gradient(90deg,#10b981,#34d399)', transition: 'width 1s linear' }} />
          </div>
        </div>
      )}

      {/* ── Botones de acción rápida ── */}
      <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
        {breakExceeded ? (
          <>
            {userPermissions['can_manage_attendance'] ? (
              <>
                <button
                  onClick={handleNotify}
                  disabled={notifying}
                  style={{ flex: 1, height: 36, borderRadius: 12, border: '1.5px solid #ef4444', background: 'transparent', color: '#ef4444', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: notifying ? 0.6 : 1 }}
                >
                  <Bell size={13} />
                  NOTIFICAR
                </button>
                <button
                  onClick={() => onOpenDrawer(employee)}
                  style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
                >
                  ···
                </button>
              </>
            ) : (
              <button
                onClick={() => onOpenDrawer(employee)}
                style={{ flex: 1, height: 36, borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
              >
                Panel Acción
              </button>
            )}
          </>
        ) : isOffline ? (
          <button
            onClick={() => onOpenDrawer(employee)}
            style={{ flex: 1, height: 36, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#0891b2,#0d7ff2)', color: '#fff', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: userPermissions['can_manage_attendance'] ? 1 : 0.5 }}
            disabled={!userPermissions['can_manage_attendance']}
          >
            ▶ Registrar Entrada
          </button>
        ) : isActive ? (
          <>
            {userPermissions['can_manage_attendance'] ? (
              <>
                <button
                  onClick={handleStartBreak}
                  style={{ flex: 1, height: 36, borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' } as React.CSSProperties}
                >
                  ☕ Iniciar Descanso
                </button>
                <button
                  onClick={() => onOpenDrawer(employee)}
                  style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
                >
                  ···
                </button>
              </>
            ) : (
              <button
                onClick={() => onOpenDrawer(employee)}
                style={{ flex: 1, height: 36, borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.08)', color: '#10b981', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
              >
                Ver Detalles
              </button>
            )}
          </>
        ) : isBreak ? (
          <button
            onClick={() => onOpenDrawer(employee)}
            style={{ flex: 1, height: 36, borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)', background: 'transparent', color: '#f59e0b', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            Panel de Acción
          </button>
        ) : (
          <button
            onClick={() => onOpenDrawer(employee)}
            style={{ flex: 1, height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            Acciones Rápidas
          </button>
        )}
      </div>
    </div>
  )
}
