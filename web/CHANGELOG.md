# Changelog

Todos los cambios significativos en este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/) y el proyecto sigue [Semantic Versioning](https://semver.org/).

---

## [0.5.0] — 2026-05-11

### Security — Sprint 2 (Supabase Security Hardening)

#### 🔴 Crítico resuelto
- **`consolidated_attendance_view`**: Recreada con `security_invoker = true`. Antes ejecutaba con privilegios del owner (`postgres`), bypasseando RLS de las tablas subyacentes. La función dependiente `get_consolidated_attendance()` también fue recreada con `search_path` correcto.
- **`employee_pins` RLS**: Eliminada política `"Admins can manage pins"` con `USING (true)` que permitía a cualquier usuario autenticado gestionar PINs de cualquier empresa. Reemplazada por 4 políticas granulares (SELECT/INSERT/UPDATE/DELETE) acotadas a `company_id` + `role IN (owner, admin)`.

#### 🟡 Medio resuelto
- **`generate_employee_pin` / `reveal_employee_pin`**: `search_path` actualizado a `public, extensions, pg_catalog` para referenciar pgcrypto en su nuevo schema. `REVOKE EXECUTE FROM anon` aplicado.
- **`create_company_with_owner`**: `REVOKE EXECUTE FROM anon` aplicado. Mantiene EXECUTE para `authenticated` (requerido para onboarding).

#### 🟢 Bajo resuelto
- **`pgcrypto`**: Movido de schema `public` a schema `extensions` (`ALTER EXTENSION pgcrypto SET SCHEMA extensions`).
- **REVOKE anon masivo**: Revocado EXECUTE de `anon` en 19 funciones internas (PIN, membresías, helpers, audit log, RPCs de supervisor). Funciones del kiosk (`rpc_mark_attendance_action`, `verify_employee_pin`, `kiosk_clock_event`) mantienen acceso `anon` intencionalmente (flujo sin autenticación).

### Added — Módulo Solicitudes de Ausencia
- Tablas `leave_types` y `leave_requests` con RLS correcta (miembros ven, admins gestionan, empleados crean sus propias).
- 5 tipos de ausencia sembrados por defecto: Vacaciones, Enfermedad, Asuntos Personales, Maternidad/Paternidad, Duelo.
- Constraint UNIQUE `(company_id, name)` en `leave_types`.
- Server Actions en `web/app/actions/leaves.ts` con `requirePermission()` en cada acción.
- Tipos TypeScript en `web/src/types/leave.ts`.

---

## [0.4.0] — 2026-05-08

### Security — Sprint 1 (Supabase Security Hardening)

- **`anon` revocado** en 11 funciones sensibles: `generate_employee_pin`, `reveal_employee_pin`, `rotate_employee_pin`, `get_active_employee_pin_ciphertext`, `write_audit_log`, `create_company_with_owner`, `rpc_monitor_mark_attendance`, `rpc_validate_supervision`, `rpc_create_absence_with_attachment`, `handle_employee_kill_switch`, `handle_new_user`.
- **`contract_templates` RLS** habilitado. Sin `company_id` — authenticated puede SELECT, service_role gestiona todo.
- **`search_path` fijo** en 13 RPCs: `rpc_mark_attendance_action`, `rpc_monitor_mark_attendance`, `rpc_kiosk_mark_attendance`, `get_weekly_attendance_counts`, `get_monthly_top_delays`, `get_consolidated_attendance`, `log_attendance_change`, `handle_inss_grace_period`, `check_profile_ssot_integrity`, `rpc_validate_supervision`, `rpc_create_absence_with_attachment`, `handle_new_user`, `handle_employee_kill_switch`.

### Fixed — Bugs críticos (Sprint 1)
- **Kiosk**: Eliminada query sin `company_id` en `KioskPage` que devolvía branches de todas las empresas. Kiosk ahora requiere `device_code` provisionado en localStorage.
- **Kiosk Actions**: `requirePermission('can_manage_kiosks')` añadido a `registerKioskDevice`, `updateKioskDevice`, `deleteKioskDevice`, `getKioskDevices`.
- **Monitor ActionDrawer**: Guards de permiso `can_manage_attendance` en todos los botones de acción.
- **Monitor EmployeeCard**: Guards de permiso en `handleNotify()` y `handleStartBreak()` antes de llamadas RPC.
- **Reports**: `requirePermission('can_view_reports')` en página de reportes; `.eq('company_id', companyId)` añadido a queries de incidents.
- **Dashboard**: `requirePermission('can_view_kpis_attendance')` guard.

### Added — Reportes Avanzados (Sprint 1)
- Filtros de rango de fechas + sucursal en reportes.
- Botones de export Excel (xlsx) y PDF (jspdf).
- Vista "Resumen Mensual" con export por empleado.

---

## [0.3.0] — 2026-04-11

### Added
- **Global Design System**: Implemented the "Premium Dark Theme" system-wide using the `.app-surface` utility class.
- **Glassmorphism UI**: High-contrast, completely borderless aesthetics with layered translucency.

### Changed
- **UX Unification - Phase 1**: Modernized the user interface and data tables of key modules:
  - `/leave`: "Permisos y Ausencias" transformed to dark theme.
  - `/organization`: "Empresas y Sucursales" unified under new layout.
  - `/employees`: "Directorio de Empleados" refactored including `employee-table-row`.
  - `/security`: "Administración de Accesos" converted to standard `app-surface` components.

---

## [0.2.2] — 2026-04-11

### Fixed

#### 📊 Data Visibility & Dashboards
- **Issue**: Organizational counters (companies, branches) and the employee directory were showing 0 rows for Owners/Admins without explicit employee records.
- **Root Cause**: Overly restrictive RLS policies and an infinite recursion bug in the `company_memberships` table.
- **Solution**: 
  - Implemented `SECURITY DEFINER` helper functions (`is_member_of`, `is_company_admin`) to bypass RLS recursion safely.
  - Refactored RLS policies for `companies`, `branches`, `employees`, and `contracts` to use these helpers.
  - Verified that all organizational entities are now correctly visible to authorized users.

#### 🛡️ Security Stability
- **Fix**: Eliminated `infinite recursion` errors in the database that were causing PostgREST 500 errors.
- **Sanitization**: Removed redundant and conflicting RLS policies on the `employees` and `company_memberships` tables.

---

## [0.2.1] — 2026-04-11


---

## [0.2.0] — 2026-03-26

### Added

#### 🚀 Performance Optimization (Database & API)
- **Database Indices**: Added 9 new indices to `attendance_logs`, `employees`, and `employee_status_logs` to optimize common search patterns.
- **SQL Functions (RPC)**:
  - `get_weekly_attendance_counts`: Aggregates attendance data on the server for the dashboard.
  - `get_monthly_top_delays`: Calculates top employee delays on the server.
- **Improved Realtime**: Optimized `useAttendanceRealtime` hook to reduce memory leaks and unnecessary refetches.

### Changed

#### ⚡ Code & UI Enhancements
- **Kiosk Logic**: Refactored `verifyKioskPin` to use a single query with JOIN, and parallelized operations in `processKioskEvent`.
- **Dashboard**: Replaced client-side processing of thousands of records with efficient server-side RPC calls.
- **Monitor**: Memoized Supabase client creation and implemented a single global timer for all monitoring cards.
- **Utilities**: Optimized `generateUniquePin` to use a single database query instead of a loop.

---

## [0.1.0] — 2026-03-24

### Fixed

#### 🐛 Employee Code Auto-Generation
- **Issue**: Creating employees in "Altas Rápidas" failed with `null value in column "employee_code" violates not-null constraint`
- **Solution**: Implemented auto-generation of unique employee codes using UUID format
- **Format**: `EMP-` + 8 random uppercase characters (e.g., `EMP-A7F2B9C1`)
- **Modified**: `app/actions/employees.ts`
- **Commit**: `b61bfdc`
- **Related Documentation**:
  - `DEBUG_SESSION_REPORT.md` — Detailed technical analysis
  - `EMPLOYEE_CODE_FIX.md` — Implementation details

#### 🔐 RLS Policy Consolidation
- **Issue**: Two conflicting INSERT policies on `employees` table caused "infinite recursion" error
  - Old policy referenced `employees` table (circular dependency)
  - New policy properly used `company_memberships` lookup table
- **Solution**: Verified old policy was removed, consolidating to single correct policy
- **Impact**: Eliminated circular RLS logic, improved authorization model
- **Migration**: Already applied in `db/migrations/20260324_fix_rls_recursion.sql`

### Changed

- Updated `README.md` with recent changes and fix documentation
- Added references to debug session reports in documentation

### Security

- Improved Row-Level Security policies to eliminate circular dependencies
- RLS policies now properly use lookup table pattern (`company_memberships`) for authorization checks

---

## Implementation Timeline

```
2026-03-24 10:30 — Identified RLS recursion error
2026-03-24 11:45 — Diagnosed old vs. new RLS policies conflict
2026-03-24 12:15 — Applied employee_code auto-generation fix
2026-03-24 13:00 — Verified fix in UI (employee creation working)
2026-03-24 13:30 — Created comprehensive documentation
2026-03-24 14:00 — Ready for GitHub push
```

---

## How to Review These Changes

### For Code Review
1. Review commit `b61bfdc` — Focus on `app/actions/employees.ts`
2. Check that `employee_code` is generated before insertion
3. Verify format matches business requirements (`EMP-XXXXXXXX`)

### For Database Review
1. Verify no old RLS policies remain on `employees` table:
   ```sql
   SELECT policyname FROM pg_policies
   WHERE tablename = 'employees' AND cmd = 'INSERT';
   ```
2. Confirm only one INSERT policy exists: "Managers can insert employees in their company"

### For Testing
1. Navigate to **Altas Rápidas** → **Empleados**
2. Create a test employee
3. Verify:
   - ✅ Employee created successfully
   - ✅ `employee_code` field populated (format: `EMP-XXXXXXXX`)
   - ✅ No RLS or constraint errors

---

## Known Issues & Limitations

### Current
- None known at this time

### Future Considerations
- Consider making `employee_code` format configurable
- Add database DEFAULT value for `employee_code` as alternative approach
- Implement RLS policy testing in CI/CD pipeline

---

## Related Documentation

- `DEBUG_SESSION_REPORT.md` — Complete debug session analysis
- `EMPLOYEE_CODE_FIX.md` — Technical details of the fix
- `ROOT_CAUSE_IDENTIFIED.md` — Root cause analysis
- `BUG_RESOLUTION_SUMMARY.md` — Summary of all fixes
- `DIAGNOSTIC_QUERIES.sql` — Useful queries for debugging

---

## Contributors

- **Julio Castillo** — Bug fix implementation and documentation
- **Claude (AI Assistant)** — Debugging, analysis, and documentation generation

---

## Notes for Future Development

1. **RLS Policy Best Practices**
   - Never use circular subqueries in RLS policies
   - Use lookup tables (`company_memberships`) for authorization
   - Keep SELECT policies simple without complex logic

2. **Employee Code Format**
   - Current: UUID-based (e.g., `EMP-A7F2B9C1`)
   - Future: Consider sequential format if needed

3. **Documentation**
   - Keep `DEBUG_SESSION_REPORT.md` for reference
   - Update this `CHANGELOG.md` with each significant change
   - Add RLS policy documentation to architecture docs

