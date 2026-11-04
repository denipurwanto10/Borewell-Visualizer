# Phase 5.1 Remediation Report — Critical Authorization & Data Integrity

**Date:** 2026-11-04  
**Commit:** ad1cc02 (Phase 5 test commit)  
**Branch:** main

---

## Executive Summary

All critical and high-priority findings from `ADMIN_STAFF_REGRESSION_REPORT.md` have been resolved and validated through automated tests.

| Blocker | Status | Verification |
|---------|--------|--------------|
| **A — VIEW/EDIT enforcement** | **PASS** | All write handlers enforce EDIT permission; tests pass |
| **B — User cascade delete** | **PASS** | Migration applied; FKs changed to RESTRICT; tests pass |
| **Optimistic locking** | **PASS** | Version check added to UpsertDesigner/Geology/Monitoring; returns 409 |
| **Session revocation docs** | **PASS** | Documented in `backend/AUTHENTICATION.md` |

---

## 1. Blocker A — VIEW/EDIT Permission Enforcement

### Root Cause
The assignment repository provided `CanEdit()` method but write handlers only verified project access (via RLS), not EDIT permission. Staff with VIEW permission could perform write operations.

### Files Changed

| File | Changes |
|------|---------|
| `backend/internal/handler/project.go` | Added `assignmentRepo` to `WellHandler`; `checkEditPermission()` helper; EDIT checks in `CreateWell`, `UpdateWell`, `DeleteWell` |
| `backend/internal/handler/module.go` | Added `projectRepo`, `assignmentRepo`, `wellRepo` to `ModuleHandler`; `checkEditPermission()` helper; EDIT checks in `UpsertDesigner`, `DeleteDesigner`, `UpsertGeology`, `DeleteGeology`, `UpsertMonitoring`, `DeleteMonitoring` |
| `backend/internal/handler/documentation.go` | Added `projectRepo`, `assignmentRepo`, `wellRepo` to `DocumentationHandler`; `checkEditPermission()` helper; EDIT checks in `UploadPhoto`, `UpdatePhoto`, `DeletePhoto`, `UploadDocument`, `UpdateDocument`, `DeleteDocument` |
| `backend/internal/handler/handler.go` | Pass `assignmentRepo` to `WellHandler`, `ModuleHandler`, `DocumentationHandler` |
| `backend/internal/repository/assignment.go` | Updated `EffectivePermission` and `CanEdit` to use `WithUserTx` for RLS context; added transactional `effectivePermissionTx` |

### Authorization Coverage Matrix

| Endpoint | Admin | Staff (EDIT) | Staff (VIEW) | Unassigned |
|----------|-------|--------------|--------------|------------|
| POST /projects/:id/wells | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id/designer | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id/designer | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id/geology | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id/geology | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id/monitoring | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id/monitoring | ✅ | ✅ | **403** | **403** |
| POST /wells/:id/photos, POST /projects/:id/photos | ✅ | ✅ | **403** | **403** |
| PATCH /photos/:id | ✅ | ✅ | **403** | **403** |
| DELETE /photos/:id | ✅ | ✅ | **403** | **403** |
| POST /wells/:id/documents, POST /projects/:id/documents | ✅ | ✅ | **403** | **403** |
| PATCH /documents/:id | ✅ | ✅ | **403** | **403** |
| DELETE /documents/:id | ✅ | ✅ | **403** | **403** |

### Test Results
- All existing backend tests pass (fs3, fs2_security, fs2_rls, fs2_refresh, fs2_admin)
- Authorization regression tests pass (admin global access, staff read-only, staff edit write, cross-project blocked)

---

## 2. Blocker B — User Cascade Delete Protection

### Root Cause
Foreign keys on `projects.owner_id`, `project_assignments.user_id`, `files.owner_id`, `refresh_sessions.user_id` used `ON DELETE CASCADE`. Deleting a user would cascade and delete their projects, wells, and all related data.

### Migration Applied
`backend/migrations/20261104210000_fix_user_cascade_delete.sql`

### FK Changes

| Table | Column | Before | After |
|-------|--------|--------|-------|
| projects | owner_id | ON DELETE CASCADE | ON DELETE RESTRICT |
| project_assignments | user_id | ON DELETE CASCADE | ON DELETE RESTRICT |
| files | owner_id | ON DELETE CASCADE | ON DELETE RESTRICT |
| refresh_sessions | user_id | ON DELETE CASCADE | ON DELETE RESTRICT |

### Behavior
- Attempting to delete a user who owns projects or has assignments now returns a PostgreSQL foreign key violation error (23503)
- Admin can still suspend/unsuspend users (status change, not deletion)
- No DELETE user endpoint exists in admin API — only suspend/unsuspend
- Historical data and audit trails preserved

### Test Results
- All backend tests pass
- Verified: deleting user with projects fails with FK error
- Verified: suspend/unsuspend works correctly
- Verified: refresh sessions revoked on suspend

---

## 3. Optimistic Locking for Concurrent Upserts

### Scope
Applied to three module upsert endpoints where concurrent edits can cause silent data loss:
- `PUT /wells/:id/designer` (DesignerState)
- `PUT /wells/:id/geology` (GeologyLog)
- `PUT /wells/:id/monitoring` (MonitoringData)

### Implementation

| Function | New Record | Existing Record |
|----------|------------|-----------------|
| `UpsertDesigner` | Version must be 1 | Version must match current; increments on update |
| `UpsertGeology` | Version must be 1 | Version must match current; increments on update |
| `UpsertMonitoring` | Version must be 1 | Version must match current; increments on update |

### Error Response
- HTTP 409 Conflict
- Body: `{"type":"conflict","title":"Conflict","status":409,"detail":"Record was modified by another user. Please refresh and try again."}`

### Rationale
- Designer, Geology, Monitoring are collaborative editing surfaces
- Version field already existed in schema and API contracts
- Other tables (projects, wells, photos, documents) use simpler CRUD without version field — optimistic locking not applied there

---

## 4. Session Revocation Documentation

### Documented in
`backend/AUTHENTICATION.md` — new "Session Revocation Behavior" section

### Covered Scenarios
| Event | Access Token | Refresh Token | Handler Enforcement |
|-------|--------------|---------------|---------------------|
| User suspended | No (15 min TTL) | **Immediate** | N/A |
| Assignment changed | No (15 min TTL) | No | **Yes (CanEdit check)** |
| Password changed | No (15 min TTL) | On next refresh | N/A |
| Role changed | No (15 min TTL) | On next refresh | N/A |

### Key Design Decisions
- Short access token TTL (15 min) limits stale permission exposure
- Immediate refresh token revocation on suspend prevents new token issuance
- Handler-level permission checks ensure assignment changes take effect immediately for writes
- RLS policies enforce read isolation at database level
- No immediate JWT invalidation (stateless by design) — documented as known limitation

---

## 5. Regression & Security Validation

### Test Suite Results

| Test Suite | Status | Notes |
|------------|--------|-------|
| Frontend Vitest (76 tests) | **PASS** | All tests pass |
| Backend unit tests (3 packages) | **PASS** | Auth, repository |
| Backend integration tests (fs2) | **PASS** | Security, RLS, refresh, admin |
| Backend integration tests (fs3) | **PASS** | Project, well, module CRUD |
| RLS isolation tests | **PASS** | All 11 tables protected, fail-closed |
| IDOR tests | **PASS** | Cross-project blocked |
| Concurrent update tests | **PASS** | Version conflict returns 409 |
| Frontend production build | **PASS** | Build succeeds |
| `go vet ./...` | **PASS** | No issues |

### Security Properties Verified

| Property | Status |
|----------|--------|
| ADMIN global access | ✅ |
| STAFF VIEW read-only | ✅ |
| STAFF EDIT write to assigned | ✅ |
| Unassigned STAFF denied | ✅ |
| Cross-project IDOR blocked | ✅ |
| RLS fail-closed (11 tables) | ✅ |
| No infinite RLS recursion | ✅ |
| User deletion blocked by FK | ✅ |
| Session revocation on suspend | ✅ |
| Login/refresh/logout intact | ✅ |

---

## 6. Remaining Limitations & Risks

| Item | Status | Rationale |
|------|--------|-----------|
| JWT access token not immediately revoked on permission change | **KNOWN LIMITATION** | 15 min TTL by design; documented |
| Frontend nav shows all items regardless of role | **DEFERRED** | Backend enforcement is authoritative; UI-only issue |
| No conflict UI for localStorage/server sync | **DEFERRED** | Out of scope for Phase 5; tracked separately |
| No DELETE user endpoint | **BY DESIGN** | Only suspend/unsuspend; preserves audit trail |

---

## 7. Phase 6 Readiness Decision

**DECISION: READY FOR PHASE 6**

All blockers resolved and tested. No critical or high-severity issues remain.

### Checklist

- [x] Blocker A resolved and tested
- [x] Blocker B resolved and tested
- [x] Optimistic locking implemented and tested
- [x] Session revocation documented
- [x] All regression tests pass
- [x] Build and `go vet` pass
- [x] No new critical/high security issues
- [x] Remediation report complete

---

## 8. Git Checkpoint

Ready for commit with message:

```
fix(auth): enforce project edit permissions and protect project data
```

Files to stage:
- `backend/internal/handler/project.go`
- `backend/internal/handler/module.go`
- `backend/internal/handler/documentation.go`
- `backend/internal/handler/handler.go`
- `backend/internal/repository/assignment.go`
- `backend/internal/repository/module.go`
- `backend/migrations/20261104210000_fix_user_cascade_delete.sql`
- `backend/AUTHENTICATION.md`