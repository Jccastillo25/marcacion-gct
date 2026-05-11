# Cambios Pendientes en Base de Datos

## Descripción General
Este documento registra los cambios que necesitan aplicarse a la base de datos de Supabase para completar las nuevas funcionalidades.

---

## FASE 2B: Sistema de Solicitudes de Permisos/Vacaciones

### Estado: LISTO PARA MIGRAR

**Archivo de migración**: `web/db/migrations/20260508_leave_requests_system.sql`

**Cambios**:

#### 1. Nueva tabla: `leave_types`
Tipos de permisos configurables por empresa (Vacaciones, Enfermedad, Asuntos Personales, etc.)

```sql
CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  requires_approval BOOLEAN DEFAULT true,
  max_days_per_year INT DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, name)
)
```

**Índices**:
- `idx_leave_types_company_id`
- `idx_leave_types_is_active`

#### 2. Nueva tabla: `leave_requests`
Solicitudes de permisos/vacaciones de empleados

```sql
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested NUMERIC(5, 2) DEFAULT 1,
  reason TEXT,
  
  status TEXT DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (employee_id, leave_type_id, start_date, end_date) WHERE status = 'pending'
)
```

**Índices**:
- `idx_leave_requests_company_id`
- `idx_leave_requests_employee_id`
- `idx_leave_requests_status`
- `idx_leave_requests_date_range` (start_date, end_date)
- `idx_leave_requests_created_at`

#### 3. Row-Level Security (RLS)

**Políticas para `leave_types`**:
- `Users can view leave_types in their company` — SELECT (is_member_of)
- `Admins can manage leave_types` — ALL (is_company_admin)

**Políticas para `leave_requests`**:
- `Users can view leave_requests in their company` — SELECT (is_member_of)
- `Employees can create their own leave_requests` — INSERT (own requests only)
- `Admins can approve/reject leave_requests` — UPDATE (is_company_admin)

#### 4. Datos de Inicialización

Se insertan 5 tipos de permisos por defecto en cada empresa activa:
- Vacaciones (verde, #10b981, 15 días/año)
- Enfermedad (rojo, #ef4444, 30 días/año)
- Asuntos Personales (amarillo, #f59e0b, 3 días/año)
- Maternidad/Paternidad (púrpura, #8b5cf6, 30 días/año)
- Duelo (azul, #6366f1, 3 días/año)

---

## Permisos Requeridos

El permiso `can_manage_leaves` ya existe en:
- `web/src/types/security.ts`
- `web/supabase/permissions-manifest.json`

**Roles que lo tienen**:
- `admin` — Gestión completa de solicitudes
- `owner` — Gestión completa de solicitudes
- `rrhh` — Gestión completa de solicitudes

---

## Archivos Creados/Modificados

### Nuevos archivos:

1. **`web/db/migrations/20260508_leave_requests_system.sql`**
   - Migración SQL con todas las tablas y políticas

2. **`web/src/types/leave.ts`**
   - Tipos TypeScript para LeaveType, LeaveRequest, etc.

3. **`web/app/actions/leaves.ts`**
   - Server Actions:
     - `getLeaveTypes()` — Obtiene tipos activos
     - `createLeaveRequest()` — Crear solicitud propia
     - `getLeaveRequests()` — Obtener todas (admin)
     - `getMyLeaveRequests()` — Obtener las propias
     - `approveLeaveRequest()` — Aprobar (admin)
     - `rejectLeaveRequest()` — Rechazar (admin)
     - `cancelLeaveRequest()` — Cancelar

4. **`web/app/(admin)/leave/_components/new-leave-request-button.tsx`**
   - Botón para abrir modal de nueva solicitud

5. **`web/app/(admin)/leave/_components/new-leave-request-modal.tsx`**
   - Modal para crear nueva solicitud

6. **`web/app/api/v1/auth/me/route.ts`**
   - Endpoint para obtener employee_id del usuario actual

### Archivos modificados:

1. **`web/app/(admin)/leave/page.tsx`**
   - Mejorada UI con nuevo botón
   - Añadido contador de canceladas
   - Integración con RequirePermission
   - Cálculo de isOwnRequest

2. **`web/app/(admin)/leave/actions-client.tsx`**
   - Mejorado con modal de rechazo
   - Soporte para cancelación
   - Permisos granulares (canManageLeaves, isOwnRequest)

3. **`web/app/actions/attendance.ts`**
   - Ya contiene `approveLeaveRequest()` y `rejectLeaveRequest()` funcionales
   - Se mantienen para retrocompatibilidad

---

## Pasos para Aplicar Cambios

### 1. Ejecutar Migración
```bash
cd web
# Usar Supabase CLI o dashboard para ejecutar la migración
# SQL contents are in db/migrations/20260508_leave_requests_system.sql
```

### 2. Verificar RLS
```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('leave_types', 'leave_requests');
```

### 3. Verificar Datos Iniciales
```sql
SELECT company_id, name, is_active, max_days_per_year 
FROM leave_types 
ORDER BY company_id, name;
```

### 4. Test de Permisos
```sql
-- Verificar que RLS está activado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('leave_types', 'leave_requests');
```

---

## Business Rules

1. **Creación**: Solo empleados pueden crear solicitudes para sí mismos; admins pueden crear para otros
2. **Aprobación**: Requiere permiso `can_manage_leaves`
3. **Cancelación**: Empleados pueden cancelar las propias; admins pueden cancelar cualquiera
4. **Vigencia**: No se pueden crear solicitudes para fechas pasadas
5. **Duplicados**: No se pueden crear dos solicitudes pendientes con mismo tipo y rango de fechas

---

## Documentación Asociada

- **DATABASE.md**: Necesita actualización con schema de leave_types y leave_requests
- **BUSINESS_RULES.md**: Necesita sección sobre reglas de solicitudes de permisos
- **SECURITY_MAP.md**: Necesita documentación de RLS policies para leave_*

---

## Notas Importantes

- Las tablas tienen RLS habilitado por defecto
- Usa `is_member_of()` y `is_company_admin()` SECURITY DEFINER helpers
- Todas las queries DEBEN filtrar por `company_id`
- Las políticas de INSERT requieren validación de empleado actual
- Los datos iniciales se insertan con `ON CONFLICT ... DO NOTHING` para idempotencia

---

*Documento creado: 2026-05-08*
*Estado: Listo para Supabase*
