# Gestor360 Context Skill

## Propósito

Esta skill contiene TODO lo que un agente necesita saber para trabajar correctamente en el codebase de **Gestor360** sin cometer errores de arquitectura. **DEBE ser leída ANTES de hacer cualquier cambio** al repositorio `marcacion-grupo-ct`.

Gestor360 es un sistema multitenant de gestión de RRHH y asistencia para Grupo CT. Todos los agentes deben seguir estas convenciones exactamente para mantener la integridad del codebase.

---

## Stack Tecnológico

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Next.js | 16 | Framework + App Router |
| React | 19 | UI |
| TypeScript | 5 | Type safety |
| Tailwind CSS | v4 | Styling |
| Supabase | - | PostgreSQL + Auth + Realtime + Storage |

### Estructura de Directorios

```
web/
├── app/                          # Next.js App Router
│   ├── actions/                  # Server Actions (un archivo por dominio)
│   ├── (protected)/              # Rutas autenticadas
│   ├── api/v1/                   # REST API
│   └── globals.css               # CSS variables globales
├── src/
│   ├── components/               # React components
│   ├── lib/                       # Utilidades (Supabase, shift-resolver, etc)
│   ├── hooks/                     # Custom hooks (realtime, state, etc)
│   └── types/                     # TypeScript types
└── supabase/
    ├── functions/                # Edge Functions
    └── permissions-manifest.json  # SSOT de permisos
```

---

## 1. SSOT de Permisos (Critical Path)

### Definición de Permisos

- **Fuente de verdad**: `web/src/types/security.ts` → interfaz `UserPermissions`
- **Sincronización**: `web/supabase/permissions-manifest.json`
- **Visualización**: `web/src/components/ui/PermissionsMatrix.tsx`

### Permisos Disponibles

```typescript
// Recordar: Todos los agentes DEBEN conocer estos permisos
can_view_kpis_talent              // Ver KPIs de talento
can_view_kpis_attendance          // Ver KPIs de asistencia
can_view_kpis_financial           // Ver KPIs financiero
can_view_kpis_hardware            // Ver KPIs de hardware
can_manage_kiosks                 // Gestionar kioscos
can_view_employees                // Ver empleados
can_manage_employees              // Crear/editar empleados
can_view_contracts                // Ver contratos
can_manage_contracts              // Gestionar contratos
can_view_shift_templates          // Ver templates de turnos
can_manage_shift_templates        // Crear/editar templates
can_manage_schedules              // Asignar horarios
can_view_attendance               // Ver asistencia
can_manage_attendance             // Marcar/corregir asistencia
can_approve_corrections           // Aprobar correcciones
can_manage_leaves                 // Gestionar licencias
can_view_reports                  // Ver reportes
can_view_payroll                  // Ver nómina
can_manage_payroll                // Gestionar nómina
can_view_salary                   // Ver salarios
can_manage_company                // Gestionar configuración empresa
can_manage_settings               // Gestionar ajustes
can_manage_users                  // Crear/editar usuarios
can_manage_roles                  // Asignar roles
can_view_audit_logs               // Ver logs de auditoría
can_impersonate                   // Suplantación de usuarios
```

### Regla Dura #1: Verificación de Permisos

**NUNCA agregar un botón, checkbox, sección o funcionalidad SIN verificar el permiso correspondiente.**

---

## 2. Server Actions Pattern

### Ubicación y Estructura

- **Directorio**: `web/app/actions/`
- **Formato**: Un archivo `.ts` por dominio (ej: `attendance.ts`, `employees.ts`)

### Plantilla Obligatoria

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/security'

type ActionState = { error: string } | null

export async function myAction(input: InputType): Promise<ActionState> {
  // 1. SIEMPRE llamar requirePermission() PRIMERO
  const { companyId, error: permError } = await requirePermission('can_manage_xxx')
  if (permError) return { error: permError }

  try {
    const supabase = await createClient()
    
    // 2. SIEMPRE filtrar por companyId
    const result = await supabase
      .from('table_name')
      .insert({ company_id: companyId, ...data })
      .single()

    // 3. Revalidar rutas afectadas
    revalidatePath('/dashboard')
    
    return null // Éxito
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
  
  // 4. NUNCA hacer esto:
  // redirect('/path') ❌ Lanzará excepción dentro de try/catch
  // Retornar la ruta en el estado y dejar que el cliente llame router.push()
}
```

### Reglas Críticas

| Regla | Detalle |
|-------|---------|
| `requirePermission()` | DEBE ser el primer código ejecutado |
| `createClient()` | Siempre usar desde `@/lib/supabase/server` |
| Filtro `company_id` | TODA query debe filtrar por este campo |
| `revalidatePath()` | Después de TODA mutación |
| No `redirect()` en try/catch | Retornar ruta y dejar que el cliente navegue |

---

## 3. Multitenancy (Obligatorio)

### Principios

- **Aislamiento**: Cada usuario pertenece a una o más empresas
- **Tabla**: `company_memberships` vincula usuarios a empresas con roles
- **Roles**: `owner`, `admin`, `rrhh`, `supervisor`, `viewer`
- **Bypass**: `owner` y `admin` bypasean permisos granulares en `requirePermission()`

### En Client-Side

```typescript
import { useGlobalContext } from '@/components/context/GlobalContext'

function MyComponent() {
  const { companyId, userPermissions } = useGlobalContext()
  
  // companyId está siempre disponible en componentes protegidos
  // userPermissions es Record<string, boolean>
  
  return (
    {userPermissions['can_manage_attendance'] && (
      <button onClick={() => markAttendance(companyId)}>
        Marcar Asistencia
      </button>
    )}
  )
}
```

### En Server Actions

```typescript
const { companyId, error } = await requirePermission('can_manage_attendance')
if (error) return { error }

// Usar companyId en todas las queries
const result = await supabase
  .from('attendance_logs')
  .insert({ company_id: companyId, ... })
```

---

## 4. Patrón de Permisos en Componentes Cliente

### Componentes Protegidos

Todas las páginas dentro de `app/(protected)/` reciben automáticamente:

```typescript
interface AdminShellClientProps {
  userPermissions: Record<string, boolean>
  companyId: string
  // ... otros props
}
```

### Uso Correcto

```tsx
export default function AttendancePage() {
  const { userPermissions } = useGlobalContext()
  
  // Condicional basado en permiso
  if (!userPermissions['can_view_attendance']) {
    return <AccessDenied />
  }

  return (
    <>
      {userPermissions['can_manage_attendance'] && (
        <button>Marcar Asistencia</button>
      )}
    </>
  )
}
```

### Regla: No exponer `profile_id`

- NUNCA pasar `profile_id` o metadata interna a componentes cliente
- El servidor filtra qué datos llegan al cliente
- Los permisos son binarios: tiene o no tiene

---

## 5. Jerarquía de Turnos (NUNCA Inline)

### Orden de Resolución

```
Override → Manual → Global → Branch
```

### Funciones Permitidas

- `resolveShift()` — Async, con DB lookup
- `resolveShiftInMemory()` — Sync, con datos en memoria

### Uso Correcto

```typescript
import { resolveShift, resolveShiftInMemory } from '@/lib/shift-resolver'

// En Server Component (async)
const shift = await resolveShift(employeeId, date, companyId)

// En Client Component (memory)
const shift = resolveShiftInMemory(employeeId, date, scheduleData)
```

### Prohibido

```typescript
// ❌ NUNCA hacer inline
const shift = manualShift || globalShift || branchShift
```

---

## 6. Realtime (Monitor Module)

### Suscripciones

- **Ubicación**: `useAttendanceRealtime()` o en componentes con `useEffect`
- **Patrón**: Supabase `onInsert`, `onUpdate`, `onDelete`

### Plantilla Obligatoria

```typescript
useEffect(() => {
  const supabase = createBrowserClient()
  
  const channel = supabase
    .channel(`attendance:${companyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance_logs' },
      (payload) => {
        // Mergear con estado sin sobreescribir JOIN fields
        updateState(current => ({
          ...current,
          items: current.items.map(item =>
            item.id === payload.new.id 
              ? { ...item, ...payload.new } // Preservar fields existentes
              : item
          )
        }))
      }
    )
    .subscribe()
  
  // SIEMPRE cleanup
  return () => {
    supabase.removeChannel(channel)
  }
}, [companyId])
```

### Reglas Críticas

| Regla | Detalle |
|-------|---------|
| Cleanup | `supabase.removeChannel()` en return del useEffect |
| Mergear | Preservar campos JOIN, no sobreescribir con objetos parciales |
| Memoria | Usar `useMemo` si el cálculo es costoso |

---

## 7. Kiosk (Ruta Pública)

### Características

- **Ruta**: `/` — **Sin autenticación**
- **Entrada**: `branch_id` y `company_id` son obligatorios
- **Búsqueda PIN**: Single query con JOIN via `verifyKioskPin()`
- **Marcación**: RPC `rpc_mark_attendance_action`

### Marcación SIEMPRE via RPC

```typescript
// ✅ CORRECTO
const { data, error } = await supabase.rpc('rpc_mark_attendance_action', {
  employee_id: employeeId,
  company_id: companyId,
  action_type: 'clock_in',
  location_ip: clientIp
})

// ❌ PROHIBIDO
await supabase.from('attendance_logs').insert({ ... })
```

---

## 8. Styling (Premium Dark Theme)

### CSS Variables

Definidas en `app/globals.css`:

```css
:root {
  --bg-app: #0f0f0f;
  --bg-surface: #1a1a1a;
  --primary: #6366f1;
  --text-strong: #ffffff;
  --text-muted: #a1a1a1;
  --border-soft: #2a2a2a;
}
```

### Tailwind v4

```tsx
// ✅ CORRECTO - Usar clases de Tailwind
<div className="bg-[var(--bg-surface)] text-[var(--text-strong)] rounded-lg p-4">
  ...
</div>

// ✅ Usar utility .app-surface para contenedores
<div className="app-surface">
  ...
</div>

// ❌ PROHIBIDO - Colores hardcoded
<div className="bg-gray-900">...</div>
```

### Características

- **Tema**: Premium Dark con glassmorfismo
- **NO agregar**: Suposiciones light-mode
- **Responsive**: Tailwind v4 para layout

---

## 9. RPCs Clave (Referencia)

| RPC | Uso | Dónde |
|-----|-----|-------|
| `rpc_mark_attendance_action` | Clock-in/out kiosk con validación | Kiosk pública |
| `rpc_monitor_mark_attendance` | Marcación manual desde Monitor | Supervisor |
| `get_weekly_attendance_counts` | Agregación para dashboard | Dashboard |
| `get_monthly_top_delays` | Top delays para dashboard | Dashboard |
| `create_company_with_owner` | Setup multitenant inicial | Setup |

---

## 10. Checklist Anti-Regresión

**TODO agente DEBE verificar esto ANTES de terminar:**

- [ ] ¿Cada nuevo Server Action tiene `requirePermission()` al inicio?
- [ ] ¿Cada nuevo botón/sección UI verifica el permiso en `userPermissions`?
- [ ] ¿Todas las queries DB filtran por `company_id`?
- [ ] ¿Los realtime useEffects tienen cleanup con `removeChannel()`?
- [ ] ¿No se usa `redirect()` dentro de try/catch?
- [ ] ¿No se escribe directamente a `attendance_logs`?
- [ ] ¿El styling usa variables CSS en lugar de colores hardcoded?
- [ ] ¿Se ejecutó `npm run lint` sin errores?
- [ ] ¿Se ejecutó `npm run build` sin errores?

---

## Comandos CLI

Ejecutar desde `web/`:

```bash
npm run dev      # Servidor desarrollo (Next.js + Turbopack) → http://localhost:3000
npm run build    # Build producción
npm run lint     # ESLint check
```

---

## Referencias Adicionales

Documentación detallada en `web/docs/`:

- **DATABASE.md** — Schema completo, columnas, RLS policies
- **BUSINESS_RULES.md** — Lógica de negocio de asistencia y turnos
- **SECURITY_MAP.md** — Políticas RLS y modelo de autorización
- **SSOT_LOGIC.md** — Enfoque de governanza de seguridad
- **REPOSITORY_MAP.md** — Overview de estructura de archivos
- **CLAUDE.md** — Instrucciones generales del proyecto

---

## Recordatorio Final

**Esta skill debe ser leída ANTES de cualquier cambio al codebase.**

Si un agente no sigue estas convenciones, el codebase puede romperse. La multitenancy, los permisos y las RLS policies son interdependientes. Todos los agentes son responsables de mantener la integridad arquitectónica.
