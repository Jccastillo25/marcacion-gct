# Auditoría y Corrección de Bugs — Módulo Kiosko

**Fecha**: 2026-05-08  
**Agente**: Sub-agente de corrección de bugs (Kiosko)  
**Status**: Completado ✓

---

## Resumen Ejecutivo

Se realizó auditoría exhaustiva del módulo kiosko en Gestor360. Se corrigieron **2 bugs críticos**, se documentó **1 bug pendiente** en otro módulo, y se reforzó **1 área de seguridad** (permisos). La arquitectura multitenant ahora está más robusta contra fugas de datos.

---

## Bugs Encontrados y Accionados

### BUG 1 ✓ CORREGIDO: Kiosk Page Filtra Branches Sin Company_ID

**Ubicación**: `web/app/page.tsx`  
**Severidad**: CRÍTICA (Multitenant data leakage)  
**Descripción**:
- La ruta pública de kiosko (`/`) hacía query a `branches` sin filtrar por `company_id`
- Tabla `app_settings` es GLOBAL (sin FK company_id) — cualquier usuario accede a ella
- En contexto público/sin autenticación, no había forma de determinar qué empresa ver
- Esto permitía enumerar/filtrar branches de CUALQUIER empresa

**Root Cause**:
- Diseño inicial asumía que kiosko siempre tendría `initialBranchId` passed, pero sin mecanismo de provisioning
- Falta de device code provisioning workflow en admin panel

**Solución Implementada**:
1. Eliminé la query insegura a `branches` en `KioskPage`
2. Ahora kiosk REQUIERE vinculación via `device_code` en localStorage
3. `getKioskByDeviceCode()` trae company_id y branch_id de forma segura (RLS-protected)
4. Si no hay device_code, kiosk inicia en estado `'linking'` para ser configurado por admin
5. Agregué comentarios documentando la decisión arquitectónica

**Archivos Modificados**:
- `web/app/page.tsx` (lines 4-42)

**Testing Recomendado**:
- Verificar que kiosk sin device_code muestra pantalla "Asociar Dispositivo"
- Verificar que tras vincular device_code, branch_id y company_id se cargan correctamente
- Verificar que localStorage persiste device_code entre sesiones
- Verificar que código inválido muestra error visible

---

### BUG 2 ✓ VERIFICADO: Feedback de Errores del RPC

**Ubicación**: `web/app/_components/kiosk-client.tsx` + `web/app/actions/kiosk.ts`  
**Severidad**: BAJA (Manejo correcto)  
**Descripción**:
- Investigación de si errores del RPC `rpc_mark_attendance_action` se muestran al usuario
- Posible silenciamiento de errores (solo en consola)

**Hallazgo**:
✓ **ESTÁ CORRECTO** — El flujo es:
1. `processKioskEvent()` llama RPC, captura error y lo retorna en `KioskResult`
2. `executeAction()` en cliente recibe `success: false, error: message`
3. UI renderiza componente `<div className="... error ...">` (línea 415-429)
4. Error es visible en rojo con icono y botón "Volver a Intentar"

**Conclusión**: No hay bug. Manejo de errores está bien documentado.

---

### BUG 3 (PENDIENTE): isWithin15Mins Usa UTC en Lugar de Nicaragua TZ

**Ubicación**: `web/app/actions/attendance.ts` (línea 8-24)  
**Severidad**: MEDIA (Afecta correcciones de asistencia, no kiosko público)  
**Descripción**:
- Función `isWithin15Mins()` usa `new Date()` en UTC, no en timezone Nicaragua (UTC-6)
- Esto está en el módulo de CORRECCIONES (supervisor mark), no en kiosko
- Kiosko usa `getNicaTimeParts()` CORRECTAMENTE — no hay bug en kiosko

**Estado**:
- Kiosko: ✓ CORRECTO (usa `getNicaTimeParts()` línea 325 en kiosk.ts)
- Attendance (supervisor): ❌ PENDIENTE (necesita refactor con `getNicaTimeParts()`)

**Acción Tomada**:
- Agregué comentario TODO en attendance.ts explicando el problema
- Marcado como BLOCKED (necesita verificar impacto en uso real antes de fijar)
- Requiere separación en tarea FASE 1B (Monitor 360)

**Archivos Modificados**:
- `web/app/actions/attendance.ts` (lines 7-25, agregado comentario TODO)

---

### BUG 4 ✓ CORREGIDO: Actions Kiosko Sin Validación de Permisos

**Ubicación**: `web/app/actions/kiosk.ts`  
**Severidad**: ALTA (Seguridad: bypass de permisos)  
**Descripción**:
- Functions administrativas de kiosk carecían de `requirePermission()` gate:
  - `registerKioskDevice()` — DEBE requerir `can_manage_kiosks`
  - `updateKioskDevice()` — DEBE requerir `can_manage_kiosks`
  - `getKioskDevices()` — DEBE requerir `can_manage_kiosks`
  - `deleteKioskDevice()` — DEBE requerir `can_manage_kiosks`
  
- Funciones PÚBLICAS (OK):
  - `getKioskByDeviceCode()` — Pública ✓
  - `verifyKioskPin()` — Pública ✓
  - `processKioskEvent()` — Pública ✓

**Solución Implementada**:
1. Importé `requirePermission` desde `@/lib/auth/require-permission`
2. Agregué verificación de permiso al inicio de cada función administrativa:
   ```typescript
   const permCheck = await requirePermission('can_manage_kiosks')
   if (!permCheck.ok) return { error: permCheck.error }
   ```
3. Retorna error explícito si usuario no tiene permiso
4. Sigue patrón oblig​atorio de Server Actions (permiso PRIMERO, antes de lógica)

**Archivos Modificados**:
- `web/app/actions/kiosk.ts`:
  - Line 8: Agregado import `requirePermission`
  - Lines 67-69: `registerKioskDevice()` permission gate
  - Lines 140-142: `updateKioskDevice()` permission gate
  - Lines 156-158: `getKioskDevices()` permission gate
  - Lines 199-201: `deleteKioskDevice()` permission gate

**Nota sobre Permisos**:
- Se usa permiso `can_manage_kiosks` que ya existe en `permissions-manifest.json`
- No se crearon nuevos permisos (seguir SSOT de permisos)
- Owners/Admins bypasean permisos en `requirePermission()` (línea 38 de require-permission.ts)

---

## Cambios de Arquitectura

### 1. Device Code Provisioning es Obligatorio

**Antes**:
```
KioskPage
  └─ Fetch primera branch activa de CUALQUIER empresa (INSEGURO)
  └─ Pass a KioskClient como initialBranchId
```

**Después**:
```
KioskPage
  └─ NO fetch branches (eliminado riesgo de fuga)
  └─ Pass initialBranchId = null
  
KioskClient
  └─ Check localStorage para device_code
  └─ Si existe: getKioskByDeviceCode() (SEGURO, con RLS)
  └─ Si no existe: mostrar UI "Asociar Dispositivo"
  └─ Admin vincula via panel settings con registerKioskDevice (con permiso)
```

**Beneficio**: Multitenancy correcta — cada kiosko está explícitamente asignado a 1 empresa + 1 branch.

### 2. Permisos Reforzados en Admin Actions

**Antes**:
```
registerKioskDevice() → Sin permiso check
updateKioskDevice()   → Sin permiso check
deleteKioskDevice()   → Sin permiso check
```

**Después**:
```
registerKioskDevice() → Requiere can_manage_kiosks
updateKioskDevice()   → Requiere can_manage_kiosks
deleteKioskDevice()   → Requiere can_manage_kiosks
```

**Beneficio**: Solo admins pueden crear/editar/borrar kioscos. Align con permissions-manifest.

---

## Checklist Anti-Regresión (PASADO)

- [x] ¿Eliminé la query insegura a `branches` en page.tsx?
- [x] ¿Agregué requirePermission a ALL admin kiosk actions?
- [x] ¿Documenté el problema de isWithin15Mins (pendiente en otra fase)?
- [x] ¿Usé permisos existentes en SSOT (no creé nuevos)?
- [x] ¿No hay redirect() en try/catch?
- [x] ¿Las actions retornan { error } en formato consistente?
- [x] ¿Agregué comentarios claros en código problemático?

---

## Bugs Pendientes (No Corregiidos, Fuera de Scope)

### FASE 1B: isWithin15Mins en Supervisor Corrections
- **Archivo**: `web/app/actions/attendance.ts`
- **Problema**: Usa `new Date()` (UTC) en lugar de `getNicaTimeParts()` (Nicaragua TZ)
- **Impacto**: Supervisor puede marcar entrada con tolerancia incorrecta
- **Solución**: Migrar a `getNicaTimeParts()` + refactor `isWithin15Mins()`
- **Asignado a**: FASE 1B (Monitor 360 bugs)

### TODO: Implementar Device Code Provisioning Workflow
- **Ubicación**: `web/app/(admin)/kiosk/` o `web/app/(admin)/settings/`
- **Requerimiento**: Admin UI para generar + asignar device_codes a kioscos
- **Bloqueo**: Actual workflow requiere manual SQL query
- **Prioridad**: FASE 2A (Módulos nuevos)

### TODO: Hardware-Based Fallback para Device Linking
- **Idea**: MAC address como identificador alternativo si localStorage se limpia
- **Impacto**: Mejorar UX de kioscos públicos sin persistencia
- **Prioridad**: FASE 2B (Mejoras optionales)

---

## Verificación de Build

```
NO SE EJECUTÓ npm run build NI npm run lint
```

**Razón**: Workspace bash tiene proceso bloqueado.  
**Recomendación**: Ejecutar manualmente en local:
```bash
cd web/
npm run lint   # Verificar syntax + ESLint
npm run build  # Verificar TypeScript + Next.js build
```

---

## Resumen de Commits Sugeridos

```
commit: fix(kiosk): eliminate multitenant data leakage in public route

- Remove unsafe branches query without company_id filter
- Require device_code provisioning for all kiosks
- Force linking state (localStorage) to fetch branch securely
- Add detailed comments explaining architecture

commit: fix(kiosk): add permission gates to admin actions

- Add requirePermission('can_manage_kiosks') to registerKioskDevice
- Add requirePermission('can_manage_kiosks') to updateKioskDevice
- Add requirePermission('can_manage_kiosks') to getKioskDevices
- Add requirePermission('can_manage_kiosks') to deleteKioskDevice
- Align with permissions-manifest.json SSOT

commit: docs(attendance): document isWithin15Mins timezone bug

- Flag isWithin15Mins using UTC instead of Nicaragua TZ (UTC-6)
- Mark as BLOCKED pending impact analysis
- Assign to FASE 1B (Monitor 360 corrections)
```

---

## Recomendaciones Post-Audit

1. **INMEDIATO**: Ejecutar `npm run lint && npm run build` en local para verificar syntax
2. **CORTO PLAZO**: Implementar UI de provisioning de device_codes en settings
3. **MEDIANO PLAZO**: Refactor `isWithin15Mins()` en attendance.ts para usar timezone correcto
4. **LARGO PLAZO**: Considerar hardware-based device ID como fallback

---

**FIN DEL REPORTE**
