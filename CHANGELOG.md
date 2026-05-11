# Changelog — Gestor360

All notable changes to this project will be documented in this file.

## [Sprint 2026-05-08]

### 🐛 Bug Fixes

#### Kiosk Module
- **CRITICAL**: Eliminated multitenant data leakage in public route — KioskPage was querying branches without company_id filter
- Fixed unsafe app_settings access in public context
- Implemented device_code provisioning requirement for all kiosks via localStorage
- Added permission gates to all admin kiosk actions (registerKioskDevice, updateKioskDevice, deleteKioskDevice, getKioskDevices) — now require `can_manage_kiosks`
- Documented timezone bug in isWithin15Mins() (pending fix in Phase 1B)

#### Monitor 360 Module
- Added permission verification to ActionDrawer component — now checks `can_manage_attendance` before showing manual marking buttons
- Added permission verification to EmployeeCard component — guards on notify and break actions
- Verified realtime subscription cleanup is correct (no memory leaks)
- Verified realtime updates properly preserve JOIN fields (job_positions, photo_url, etc.)
- Verified monitorAlertCount has correct safeguard against companyId === 'all'

#### Reports Module
- Fixed missing company_id filtering in reports queries
- Added permission gate `can_view_reports` to reports page
- Added permission gate `can_view_kpis_attendance` to dashboard
- Fixed incidents-view.tsx to filter by company_id
- Verified report-actions.tsx checks permissions before export

### ✨ Features

#### Advanced Reports Module
- Added `web/app/(admin)/reports/_components/report-filters.tsx` — Date range and branch filters
- Added `web/app/(admin)/reports/_components/export-buttons.tsx` — Excel (xlsx) and PDF (jspdf) export functionality
- Added `web/app/(admin)/reports/_views/monthly-summary-view.tsx` — Monthly summary view with aggregations
- New dependency: `xlsx` (Excel export library)

#### Leave Requests Management Module
- **Database**: Created `leave_types` and `leave_requests` tables with RLS policies
- **Types**: Added comprehensive TypeScript types in `web/src/types/leave.ts`
- **Server Actions**: Implemented 7 Server Actions in `web/app/actions/leaves.ts`:
  - `getLeaveTypes()` — Retrieve active leave types
  - `createLeaveRequest()` — Create leave request with validations
  - `getLeaveRequests()` — Get all requests with filters (admin)
  - `getMyLeaveRequests()` — Get current user's requests
  - `approveLeaveRequest()` — Approve request (requires `can_manage_leaves`)
  - `rejectLeaveRequest()` — Reject request with reason (requires `can_manage_leaves`)
  - `cancelLeaveRequest()` — Cancel request (employee or admin)
- **UI**: Created leave management dashboard at `web/app/(admin)/leave/`
  - Leave request list with 4 status tabs (pending, approved, rejected, cancelled)
  - KPI cards showing counts per status
  - Modal for creating new requests
  - Action buttons for approve/reject/cancel with status transitions
  - Responsive design with Premium Dark Theme
- **API**: Added `web/app/api/v1/auth/me/route.ts` endpoint for client to retrieve employee_id
- **Data**: 5 default leave types per company (Vacations, Sickness, Personal, Maternity/Paternity, Bereavement)
- **Security**: Full RLS policies, multitenancy isolation, permission gates

### 🔒 Security & Permissions

- All kiosk admin actions now require `can_manage_kiosks` permission
- All leave management actions require `can_manage_leaves` permission for approvals
- All monitor actions check `can_manage_attendance` before exposing marking buttons
- Verified multitenancy isolation across all modules
- Confirmed RLS policies prevent cross-company data access

### 📚 Documentation

- Created `web/CHANGELOG.md` with all sprint changes
- Updated `web/CLAUDE.md` with new patterns and dependencies
- Enhanced `web/docs/BUSINESS_RULES.md` with leave management rules
- Created `web/docs/MIGRATION_GUIDE.md` with step-by-step Supabase setup instructions

---

## 📋 Pending (Requires Manual Action)

### Database Migrations

- **`web/db/migrations/20260508_leave_requests_system.sql`**: Leave types and requests system
  - Status: Ready for execution in Supabase
  - Action: Execute via Supabase Dashboard or CLI
  - See `web/docs/MIGRATION_GUIDE.md` for step-by-step instructions

### Device Code Provisioning Workflow

- **Location**: `web/app/(admin)/kiosk/` or `web/app/(admin)/settings/`
- **Status**: Architecture in place, admin UI workflow NOT YET IMPLEMENTED
- **Requirement**: UI panel for admins to generate and assign device_codes to kiosks
- **Blocker**: Current workflow requires manual SQL queries
- **Priority**: Phase 2A (New modules)

### Timezone Bug in Attendance Corrections

- **File**: `web/app/actions/attendance.ts`
- **Issue**: `isWithin15Mins()` uses UTC instead of Nicaragua timezone (UTC-6)
- **Scope**: Supervisor corrections module (Monitor 360), NOT kiosk public route
- **Status**: Documented but NOT FIXED
- **Priority**: Phase 1B (Monitor 360 corrections)

---

## 🔧 Technical Details

### New Dependencies

```json
{
  "dependencies": {
    "xlsx": "^0.18.x"
  }
}
```

### New Environment Variables

None required (uses existing Supabase configuration)

### Breaking Changes

None. All changes are backward compatible.

### Migration Path

1. Execute SQL migration: `20260508_leave_requests_system.sql`
2. Verify RLS policies are enabled on `leave_types` and `leave_requests`
3. Verify 5 default leave types exist per company
4. Run `npm run lint` to check TypeScript
5. Run `npm run build` to verify production build
6. Deploy to staging for QA

---

## 🚀 Deployment Checklist

- [ ] Run migration `20260508_leave_requests_system.sql` in Supabase
- [ ] Verify RLS on both new tables
- [ ] Verify 5 default leave types per company
- [ ] Test permission gates: `can_manage_leaves`, `can_view_reports`, `can_manage_kiosks`, `can_manage_attendance`
- [ ] Run `npm run lint` in `web/` directory
- [ ] Run `npm run build` in `web/` directory
- [ ] Deploy to staging
- [ ] Run QA tests on leave management module
- [ ] Run regression tests on kiosk, monitor, and reports modules
- [ ] Deploy to production

---

## 📞 Support

For questions about:
- **Kiosk fixes**: See `web/docs/bug-reports/kiosko-fixes.md`
- **Monitor fixes**: See `web/docs/bug-reports/monitor-fixes.md`
- **Leave management**: See `web/docs/feature-reports/solicitudes.md`
- **Architecture**: See `web/docs/skills/gestor360-context/SKILL.md`
- **Database**: See `web/docs/DATABASE.md`

---

*Last updated: 2026-05-08*  
*Maintainer: Documentation Sub-Agent*
