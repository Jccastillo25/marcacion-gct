# 🛡️ SECURITY MAP - Gestor360 Administrative Module

Este documento detalla la arquitectura de seguridad y el control de acceso del módulo administrativo, basado en el principio de **Single Source of Truth (SSOT)** y la política de **Deny by Default**.

## 1. Arquitectura de Permisos

El sistema utiliza un modelo de Control de Acceso Basado en Atributos (ABAC) simplificado, donde cada usuario tiene una matriz de permisos vinculada a su perfil y a una empresa específica.

### Jerarquía de Roles
1. **OWNER**: Acceso total e ilimitado. Puede editar campos SSOT protegidos.
2. **ADMIN**: Gestión operativa. Sujeto a restricciones SSOT (no puede editar campos que vienen de RRHH).

## 2. Manifiesto de Recursos (`permissions-manifest.json`)

Todas las rutas dentro de `app/(admin)/` DEBEN estar registradas en el manifiesto para ser accesibles. Si una ruta no existe en el manifiesto, el sistema denegará el acceso por defecto.

| Recurso ID | Ruta | Descripción |
| :--- | :--- | :--- |
| `admin_dashboard` | `/dashboard` | Centro de Control / KPIs |
| `security_users` | `/security/users` | Gestión de usuarios y permisos |
| `employee_list` | `/employees` | Listado maestro de colaboradores |
| `employee_create` | `/employees/new` | Hiring Wizard (Alta de personal) |
| `contract_management` | `/contracts` | Listado y gestión de contratos legales |
| `contract_create_edit`| `/contracts/new` | Motor de generación de contratos |
| `attendance_monitoring`| `/attendance` | Monitoreo de marcaciones y KPIs en vivo |
| `kiosk_management` | `/kiosk` | Registro y control de dispositivos físicos |
| `reports_generation` | `/reports` | Generador de reportes Excel / PDF |

## 3. Matriz de KPIs (Centro de Control)

Los permisos de visualización en el Dashboard son granulares:

- `can_view_kpis_talent`: Estadísticas de personal y distribución.
- `can_view_kpis_attendance`: Métricas de puntualidad, asistencia y actividad en tiempo real.
- `can_view_kpis_financial`: Costos de nómina y horas extras.
- `can_view_kpis_hardware`: Estado de salud de los Kioskos de marcación.

## 4. Política de "Deny by Default"

Cualquier nuevo módulo o componente sensible debe implementar la validación de permiso antes del renderizado o ejecución:

```typescript
const { can_view_kpis_financial } = permissions;
if (!can_view_kpis_financial) return <AccessDenied />;
```

## 5. Auditoría de Credenciales

- Las contraseñas NUNCA se almacenan en texto plano.
- Se utiliza Hashing irreversibles (Bcrypt/Argon2) gestionado por Supabase Auth.
- El administrador solo puede "Sobrescribir" la clave, nunca recuperarla.

## 6. Integridad de Datos en Cliente

Para evitar errores de tipado o inyección de metadatos en el cliente, el sistema aplica un filtrado estricto en el servidor (`AdminShell`) antes de pasar los permisos al `AdminShellClient`:

- Se eliminan campos no booleanos (`profile_id`, `company_id`, `timestamps`).
- Se garantiza el tipado `Record<string, boolean>`.
- Esto previene fallos en el proceso de build (Vercel) y asegura que el componente de interfaz solo reciba flags de permisos procesables.

## 7. Seguridad de Base de Datos (RLS Recursion Control)

Para garantizar la integridad y el rendimiento del sistema, se ha implementado una arquitectura de Row-Level Security (RLS) que evita la recursión infinita mediante el uso de funciones con `SECURITY DEFINER`.

### Mecanismo de Prevención de Recursión
Cuando una política RLS en la tabla `A` consulta la tabla `B`, y la tabla `B` tiene una política que consulta de nuevo la tabla `A`, se produce un error 500 (Recursión Infinita). Para evitarlo, utilizamos funciones que operan con privilegios elevados (saltando el RLS) pero con lógica estricta:

- **`is_member_of(target_company_id)`**: Verifica si el usuario autenticado (`auth.uid()`) tiene una membresía activa en la empresa indicada. Se usa para filtrar `companies`, `branches`, `employees` y `contracts`.
- **`is_company_admin(target_company_id)`**: Variante restringida a roles `owner` o `admin`. Se usa para la gestión de membresías y seguridad.

### Aplicación de Políticas
- **Directorio**: Los colaboradores solo son visibles para usuarios con membresía en la misma `company_id`.
- **Membresías**: Un usuario puede ver su propia membresía por UID, pero solo los Admins/Owners pueden ver el listado completo de la empresa.

## 8. Hardening de Base de Datos (2026-05-08 / 2026-05-11)

Se aplicaron dos sprints de correcciones derivadas del Supabase Security Advisor:

### 8.1 Funciones con acceso `anon` revocado

Las siguientes funciones SECURITY DEFINER **no deben ser accesibles sin autenticación**. Se aplicó `REVOKE EXECUTE FROM anon`:

| Función | Motivo |
|---------|--------|
| `generate_employee_pin` / `reveal_employee_pin` / `rotate_employee_pin` / `get_active_employee_pin_ciphertext` | PIN management — solo admin/rrhh |
| `create_company_with_owner` | Onboarding — solo authenticated |
| `is_member_of` / `is_company_admin` / `is_company_member` / `has_company_role` / `is_employee_user` | Helpers internos de RLS |
| `my_companies` / `get_user_companies` / `my_role_in_company` | Contexto de sesión autenticada |
| `handle_new_user` / `handle_employee_kill_switch` | Triggers internos de Auth |
| `rpc_monitor_mark_attendance` / `rpc_kiosk_mark_attendance` / `rpc_validate_supervision` / `rpc_create_absence_with_attachment` | RPCs de supervisor/admin |
| `write_audit_log` | Solo llamado desde funciones internas |

**Funciones que MANTIENEN acceso `anon` intencionalmente** (flujo kiosk sin login):
- `rpc_mark_attendance_action` — marcación desde dispositivo kiosk
- `verify_employee_pin` — validación PIN en kiosk
- `kiosk_clock_event` — evento de entrada/salida en kiosk

### 8.2 Vista `consolidated_attendance_view`

Recreada con `WITH (security_invoker = true)`. Antes ejecutaba con privilegios del owner (`postgres`), efectivamente bypasseando el RLS de las tablas subyacentes. Ahora aplica los permisos del usuario que consulta.

La función dependiente `get_consolidated_attendance(uuid, date, date, uuid)` fue recreada con `search_path = public` correcto.

### 8.3 `employee_pins` RLS

Eliminada la política catch-all `"Admins can manage pins"` con `USING (true)` que permitía a cualquier usuario `authenticated` gestionar PINs de cualquier empresa. Reemplazada por 4 políticas granulares:

- `employee_pins_select_admin` — SELECT acotado a `company_id` + role owner/admin
- `employee_pins_insert_admin` — INSERT acotado a `company_id` + role owner/admin
- `employee_pins_update_admin` — UPDATE acotado a `company_id` + role owner/admin
- `employee_pins_delete_admin` — DELETE acotado a `company_id` + role owner/admin (nueva)

### 8.4 `pgcrypto` en schema `extensions`

Movido de schema `public` a `extensions` (`ALTER EXTENSION pgcrypto SET SCHEMA extensions`). Las funciones `generate_employee_pin` y `reveal_employee_pin` fueron actualizadas con `search_path = public, extensions, pg_catalog` para seguir accediendo a `digest()`, `pgp_sym_encrypt()` y `pgp_sym_decrypt()`.

### 8.5 Pendiente manual (Dashboard Supabase)
- Activar **Leaked Password Protection** en: Auth → Password Security → "Leaked password protection"

---
*Última Actualización: 2026-05-11 — Sprint 2 Security Hardening completado*
