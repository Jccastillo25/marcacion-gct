# Guía de Migración — Gestor360 (2026-05-08)

Este documento proporciona instrucciones paso a paso para ejecutar las migraciones pendientes en Supabase.

---

## Resumen de Migraciones Pendientes

### Migración: Leave Requests System

**Archivo**: `web/db/migrations/20260508_leave_requests_system.sql`

**Contenido**:
- Tabla `leave_types` (tipos de permisos configurables)
- Tabla `leave_requests` (solicitudes de empleados)
- RLS policies completo
- 5 tipos de permisos por defecto

**Impacto**: Nueva funcionalidad de Gestión de Solicitudes (Módulo FASE 2B)

---

## Prerequisitos

1. **Acceso a Supabase Dashboard**
   - URL: https://app.supabase.com
   - Proyecto: Gestor360
   - Role: Owner o Admin

2. **SQL Editor disponible**
   - Opción 1: Supabase Dashboard → SQL Editor (recomendado para desarrollo)
   - Opción 2: Supabase CLI local (para CI/CD)
   - Opción 3: psql CLI directo (para administradores avanzados)

3. **Backup actual**
   - Recomendado: Realizar backup de la base de datos antes de ejecutar migraciones
   - Supabase realiza backups automáticos, pero manual es más seguro

---

## Método 1: Supabase Dashboard (Recomendado)

### Paso 1: Acceder al SQL Editor

1. Inicia sesión en https://app.supabase.com
2. Selecciona el proyecto Gestor360
3. Ve a **SQL Editor** (menú lateral izquierdo)
4. Click en **+ New Query**

### Paso 2: Copiar la Migración

1. Abre `web/db/migrations/20260508_leave_requests_system.sql` en tu editor local
2. Copia TODO el contenido SQL
3. Pega en la ventana de SQL Editor de Supabase

### Paso 3: Ejecutar la Migración

1. Click en **Run** (botón en la parte superior derecha)
2. Espera a que se complete (sin errores)
3. Verifica que no hay mensajes de error en rojo

**Tiempo esperado**: 5-10 segundos

### Paso 4: Verificar Creación de Tablas

En el SQL Editor, ejecuta estas queries para verificar:

```sql
-- Verificar que las tablas existen
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('leave_types', 'leave_requests')
ORDER BY tablename;
```

**Resultado esperado**:
```
leave_requests
leave_types
```

### Paso 5: Verificar RLS Habilitado

```sql
-- Verificar que RLS está activado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('leave_types', 'leave_requests')
ORDER BY tablename;
```

**Resultado esperado**:
```
leave_requests | t
leave_types    | t
```

(La columna `rowsecurity` debe ser `t` = true)

### Paso 6: Verificar Datos Iniciales

```sql
-- Verificar que se insertaron 5 tipos de permisos por empresa
SELECT 
  company_id,
  name,
  is_active,
  max_days_per_year,
  color
FROM leave_types
ORDER BY company_id, name;
```

**Resultado esperado**:
- 5 tipos de permisos por cada empresa activa
- Vacaciones (verde), Enfermedad (rojo), Asuntos Personales (amarillo), Maternidad (púrpura), Duelo (azul)

---

## Método 2: Supabase CLI (Avanzado)

### Prerequisitos

```bash
# Instalar Supabase CLI
npm install -g supabase

# Verificar instalación
supabase --version
```

### Pasos

```bash
# 1. Navegar al directorio del proyecto
cd web

# 2. Configurar credenciales (si no está configurado)
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 3. Ejecutar migración
supabase db push --file ./db/migrations/20260508_leave_requests_system.sql

# 4. Verificar estado
supabase db pull
```

---

## Método 3: psql CLI (Para Administradores)

### Prerequisitos

```bash
# Instalar psql (PostgreSQL client)
# macOS: brew install postgresql
# Windows: Descargar desde https://www.postgresql.org/download/windows/
# Linux: apt-get install postgresql-client

# Obtener credenciales desde Supabase Dashboard
# Settings → Database → Connection string (PostgreSQL)
```

### Pasos

```bash
# 1. Copiar el archivo SQL
cp web/db/migrations/20260508_leave_requests_system.sql /tmp/migration.sql

# 2. Conectar y ejecutar
psql "postgresql://user:password@host:port/postgres" -f /tmp/migration.sql

# 3. Verificar tablas
psql "postgresql://user:password@host:port/postgres" -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('leave_types', 'leave_requests')"
```

---

## Validación Post-Migración

### Checklist de Verificación

- [ ] Tabla `leave_types` existe
- [ ] Tabla `leave_requests` existe
- [ ] RLS habilitado en ambas tablas
- [ ] 5 tipos de permisos por empresa
- [ ] Políticas RLS visibles en Supabase Dashboard

### Query de Diagnóstico Completo

Ejecuta en SQL Editor de Supabase:

```sql
-- Verificación completa de migración
WITH table_check AS (
  SELECT 
    'leave_types' AS table_name,
    EXISTS(SELECT 1 FROM pg_tables WHERE tablename='leave_types') AS exists
  UNION ALL
  SELECT 
    'leave_requests' AS table_name,
    EXISTS(SELECT 1 FROM pg_tables WHERE tablename='leave_requests') AS exists
),
rls_check AS (
  SELECT 
    tablename,
    rowsecurity
  FROM pg_tables 
  WHERE tablename IN ('leave_types', 'leave_requests')
),
data_check AS (
  SELECT 
    'leave_types' AS table_name,
    COUNT(*) AS row_count
  FROM leave_types
  WHERE is_active = true
  UNION ALL
  SELECT 
    'leave_requests' AS table_name,
    COUNT(*) AS row_count
  FROM leave_requests
)
SELECT 
  'Tables' AS check_type,
  string_agg(CASE WHEN exists THEN '✓' ELSE '✗' END, ', ') AS status
FROM table_check
UNION ALL
SELECT 
  'RLS Enabled' AS check_type,
  string_agg(CASE WHEN rowsecurity THEN '✓' ELSE '✗' END, ', ') AS status
FROM rls_check
UNION ALL
SELECT 
  'Data Rows' AS check_type,
  string_agg(table_name || ': ' || row_count::text, ', ') AS status
FROM data_check;
```

---

## Rollback (En Caso de Error)

Si necesitas revertir la migración, ejecuta:

```sql
-- ADVERTENCIA: Esto eliminará todas las tablas y datos
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;
```

**IMPORTANTE**: Supabase mantiene backups automáticos. Si necesitas restaurar la DB completa, contacta a Supabase Support.

---

## Próximos Pasos Post-Migración

1. **Compilar y lintear código**
   ```bash
   cd web
   npm run lint    # Verificar sintaxis
   npm run build   # Compilar TypeScript
   ```

2. **Deploy a Staging**
   - Hacer push a rama `staging` o `develop`
   - CI/CD ejecutará `lint` y `build`
   - Deploy automático a ambiente de staging

3. **QA Testing**
   - Empleado: Crear solicitud de permiso
   - Empleado: Ver propias solicitudes
   - Empleado: Cancelar solicitud
   - Admin: Ver todas las solicitudes
   - Admin: Aprobar solicitud
   - Admin: Rechazar con motivo
   - Validar responsive en mobile

4. **Production Deployment**
   - Pasar control QA
   - Code review de cambios
   - Merge a `main`
   - Deploy a producción

---

## Troubleshooting

### Error: "table already exists"

Si recibes este error, significa que la tabla ya fue creada. Verifica el estado actual:

```sql
-- Opción 1: Ver estructura actual
\d leave_types
\d leave_requests

-- Opción 2: Eliminar y recrear
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;

-- Luego ejecutar migración nuevamente
```

### Error: "permission denied"

Verifica que tu usuario de Supabase tiene permisos de DDL (Data Definition Language):

```sql
-- Verificar rol actual
SELECT current_user;

-- Dar permisos si es necesario (owner only)
GRANT ALL ON SCHEMA public TO "postgres";
```

### RLS Policy Error

Si las políticas RLS no funcionan, verifica que las funciones helper existen:

```sql
-- Verificar función is_member_of
SELECT proname FROM pg_proc WHERE proname = 'is_member_of';

-- Verificar función is_company_admin
SELECT proname FROM pg_proc WHERE proname = 'is_company_admin';
```

Si faltan, contacta a DBA — necesitan ejecutarse primero.

### Datos Iniciales No Insertados

Si la tabla `leave_types` está vacía, ejecuta manualmente:

```sql
INSERT INTO leave_types (company_id, name, description, color, requires_approval, max_days_per_year)
SELECT
  id,
  type,
  desc,
  color,
  requires_approval,
  max_days
FROM (
  SELECT id FROM companies WHERE is_active = true
) companies,
LATERAL (
  VALUES
    ('Vacaciones', 'Período de descanso anual', '#10b981', true, 15),
    ('Enfermedad', 'Licencia por enfermedad', '#ef4444', true, 30),
    ('Asuntos Personales', 'Permiso para asuntos personales', '#f59e0b', true, 3),
    ('Maternidad/Paternidad', 'Licencia por nacimiento', '#8b5cf6', true, 30),
    ('Duelo', 'Licencia por fallecimiento de familiar', '#6366f1', true, 3)
) AS types(type, desc, color, requires_approval, max_days)
ON CONFLICT (company_id, name) DO NOTHING;
```

---

## Documentación Relacionada

- **CHANGELOG.md** — Resumen de cambios en este sprint
- **BUSINESS_RULES.md** — Reglas de negocio de solicitudes
- **DATABASE.md** — Esquema de bases de datos
- **feature-reports/solicitudes.md** — Reporte técnico completo

---

## Soporte

Para preguntas o problemas:

1. **Verificar logs** de Supabase Dashboard → Logs
2. **Ejecutar diagnóstico** con queries de este documento
3. **Revisar CHANGELOG.md** para cambios asociados
4. **Contactar** a julio6castillo@gmail.com con detalles del error

---

*Guía creada: 2026-05-08*  
*Válida para migración: 20260508_leave_requests_system.sql*
