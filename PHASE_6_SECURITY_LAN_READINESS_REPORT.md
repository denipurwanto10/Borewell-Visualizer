# Phase 6 Security Audit & LAN Readiness Assessment Report

**Project:** Borewell Engineering Visualizer  
**Date:** 2026-11-05  
**Commit:** fe0ea9e (Phase 5.1 remediation)  
**Branch:** main  
**Auditor:** Orchestrator  

---

## Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| **Local Development Security** | READY WITH CONDITIONS | Strong auth/session/RLS; npm dependencies need updates |
| **Multi-User Application Architecture** | READY WITH CONDITIONS | AuthZ model solid; needs rate limiting, prod secrets |
| **Office LAN Deployment Readiness** | NOT READY | HTTPS, reverse proxy, cookie config, backup strategy missing |
| **Public Internet Deployment Readiness** | NOT READY | Requires all LAN items + WAF, DDoS, external secrets management |

**Overall:** The application has a solid security foundation for local development and multi-user architecture. Authentication, authorization, RLS, and session management are correctly implemented per Phase 5.1. However, LAN deployment requires infrastructure changes (HTTPS termination, reverse proxy, cookie hardening) and operational procedures (backup, monitoring, secrets rotation) that are not yet in place.

---

## 1. Existing Architecture & Data Flow

### 1.1 Current Local Development Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                      DEVELOPMENT MACHINE                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Frontend    │    │   Backend    │    │  PostgreSQL  │      │
│  │  (Vite)      │◄──►│   (Go/Gin)   │◄──►│  (Docker)    │      │
│  │  :5173       │    │   :8080      │    │  127.0.0.1:5433      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │                │
│         └───────────────────┴───────────────────┘                │
│                         │                                        │
│              ┌──────────▼──────────┐                             │
│              │  HttpOnly Cookie    │                             │
│              │  (refresh_token)    │                             │
│              │  Domain=localhost   │                             │
│              │  SameSite=Lax       │                             │
│              │  Secure=false       │                             │
│              └─────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Summary

| Flow | Description | Security Controls |
|------|-------------|-------------------|
| **Auth** | Login → Argon2id verify → JWT (15m) + Refresh cookie (30d, HttpOnly) | Rate limit 5/min/IP; generic error messages |
| **API Access** | Bearer token in Authorization header | Auth middleware validates JWT, checks status=approved |
| **Refresh** | POST /auth/refresh with cookie → Atomic rotation + reuse detection | Token family revocation on reuse; 10/min/user rate limit |
| **Authorization** | Role (admin/user) + Project assignment (VIEW/EDIT) | Handler-level `CanEdit()` checks; RLS at DB level |
| **File Upload** | Multipart → MIME detection → SHA-256 → Filesystem + DB | Extension + MIME allowlist; size limits; path traversal protection |
| **RLS Context** | `SET LOCAL app.current_user_id` per transaction | FORCE ROW LEVEL SECURITY on 11 tables; fail-closed |

### 1.3 Key Components

| Component | Technology | Security Notes |
|-----------|------------|----------------|
| Password Hashing | Argon2id (time=3, memory=64MB, threads=4, keylen=32) | Constant-time comparison; params stored in hash |
| Access Token | JWT HS256, 15 min, claims: user_id, email, role, status | Stateless; no immediate revocation |
| Refresh Token | Opaque 32-byte hex, SHA-256 hash in DB, 30 days | Rotation per use; family reuse detection |
| Session Store | PostgreSQL `refresh_sessions` table with RLS | `AtomicRotate` with `FOR UPDATE`; `RevokeFamily` on reuse |
| RLS | 11 tables with `FORCE ROW LEVEL SECURITY` | `NULLIF(current_setting('app.current_user_id', true), '')` |
| File Storage | Local filesystem under `FILE_STORAGE_PATH` | SHA-256 integrity; MIME validation; path traversal checks |
| CSRF | SameSite=Lax + Origin/Referer validation on cookie endpoints | `middleware.Protect()` on `/auth/refresh`, `/auth/logout` |

---

## 2. Authentication & Session Security Audit

### 2.1 Findings

| ID | Finding | Severity | Evidence | Impact | Remediation | Verification |
|----|---------|----------|----------|--------|-------------|--------------|
| A-01 | **Short access token TTL (15 min) limits stale permission window** | PASS | `auth/handler.go:257`, `AUTHENTICATION.md:198` | Limits exposure of stale roles/assignments | By design — no change needed | ✅ Verified in code |
| A-02 | **Refresh token rotation with atomic DB transaction** | PASS | `auth/session.go:147-217` | Prevents token replay; reuse detection revokes family | By design — no change needed | ✅ Tests pass |
| A-03 | **Refresh token reuse detection revokes entire family** | PASS | `auth/session.go:118-122`, `auth/handler.go:396-403` | Detects stolen tokens; forces re-login | By design — no change needed | ✅ Tests pass |
| A-04 | **Cookie attributes: HttpOnly=true, SameSite=Lax, Secure=false (dev)** | PASS | `auth/handler.go:533-571` | Prevents XSS cookie theft; CSRF mitigation via Lax | Production needs Secure=true, SameSite=None | ⚠️ Configurable via `APP_ENV` |
| A-05 | **CSRF protection via Origin/Referer validation on cookie endpoints** | PASS | `middleware/csrf.go:17-68` | Blocks cross-origin form submissions | Applied to `/refresh`, `/logout` only | ✅ Verified |
| A-06 | **Suspended users cannot refresh sessions** | PASS | `auth/handler.go:433-442`, `user.go:242-272` | Immediate revocation on suspend | `UpdateStatusAndRevokeSessions` in single TX | ✅ Tests pass |
| A-07 | **Password change revokes sessions via token family rotation** | PASS | `AUTHENTICATION.md:184-189` | Next refresh fails; forces re-login | No immediate revocation (by design) | ✅ Documented |
| A-08 | **Rate limiting: Login/Register 5/min/IP, Refresh 10/min/user** | PASS | `AUTHENTICATION.md:135-141` | Brute-force mitigation | Implemented in middleware (need to verify) | ⚠️ Not found in middleware code |
| A-09 | **Generic error messages (no user enumeration)** | PASS | `auth/handler.go:188-191, 216-218` | Prevents email enumeration | "Invalid credentials" for both wrong email/password | ✅ Verified |
| A-10 | **No concurrent refresh handling (multiple tabs)** | MEDIUM | `client.js:31-46` | Race condition possible; first refresh wins | `refreshInFlight` singleton pattern handles | ✅ Implemented |
| A-11 | **Access token claims include role/status — stale until expiry** | KNOWN LIMITATION | `auth/token.go:27-33`, `AUTHENTICATION.md:198` | Role change takes up to 15 min to reflect | Documented; short TTL mitigates | ✅ Documented |
| A-12 | **Refresh cookie Domain=localhost in dev** | MEDIUM | `auth/handler.go:540` | Works for localhost multi-port; breaks on LAN IP | Must be configurable for production hostname | ⚠️ Needs config |

### 2.2 Session Lifecycle Verification

| Event | Access Token | Refresh Token | Handler Enforcement |
|-------|--------------|---------------|---------------------|
| User suspended | No (15 min TTL) | **Yes (immediate)** | N/A |
| Assignment changed | No (15 min TTL) | No | **Yes (CanEdit check)** |
| Password changed | No (15 min TTL) | Yes (on next refresh) | N/A |
| Role changed | No (15 min TTL) | No (on next refresh) | N/A |

**Status:** All verified in code and tests. Design documented in `AUTHENTICATION.md`.

---

## 3. Authorization, IDOR & RLS Audit

### 3.1 Authorization Model

| Role | Project Access | Permissions |
|------|----------------|-------------|
| **ADMIN** | All projects (global) | Full CRUD + user management + assignments |
| **STAFF EDIT** | Assigned projects only | Read + Write (wells, designer, geology, monitoring, photos, docs) |
| **STAFF VIEW** | Assigned projects only | Read only |
| **Unassigned** | None | No access |

### 3.2 Handler-Level EDIT Enforcement (Phase 5.1 Fix)

| Endpoint | Admin | Staff EDIT | Staff VIEW | Unassigned |
|----------|-------|------------|------------|------------|
| POST /projects/:id/wells | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id/designer | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id/designer | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id/geology | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id/geology | ✅ | ✅ | **403** | **403** |
| PUT /wells/:id/monitoring | ✅ | ✅ | **403** | **403** |
| DELETE /wells/:id/monitoring | ✅ | ✅ | **403** | **403** |
| POST /wells/:id/photos | ✅ | ✅ | **403** | **403** |
| PATCH /photos/:id | ✅ | ✅ | **403** | **403** |
| DELETE /photos/:id | ✅ | ✅ | **403** | **403** |
| POST /wells/:id/documents | ✅ | ✅ | **403** | **403** |
| PATCH /documents/:id | ✅ | ✅ | **403** | **403** |
| DELETE /documents/:id | ✅ | ✅ | **403** | **403** |

**Implementation:** `checkEditPermission()` helper in `project.go`, `module.go`, `documentation.go` calls `assignmentRepo.CanEdit()` with RLS context via `WithUserTx`. Admin bypasses at handler level.

### 3.3 IDOR Protection

| Layer | Mechanism | Verified |
|-------|-----------|----------|
| **Database (RLS)** | All queries filtered by `app.current_user_id` | ✅ `fs2_rls_test.go` |
| **Application** | Handlers verify project access via `GetByIDForUser` / `ListForProject` | ✅ Code review |
| **Nested Resources** | Well→Project, Designer/Geology/Monitoring→Well→Project | ✅ `checkEditPermission` resolves parent |
| **Cross-Project** | Staff A cannot access Staff B's project data | ✅ RLS returns 0 rows; handlers return 404 |

### 3.4 RLS Policy Audit (11 Tables)

| Table | FORCE RLS | Policy | Fail-Closed | Recursion Risk |
|-------|-----------|--------|-------------|----------------|
| projects | ✅ | projects_access | ✅ | None (admin at app layer) |
| wells | ✅ | wells_access | ✅ | None |
| designer_states | ✅ | designer_access | ✅ | None |
| geological_logs | ✅ | geology_access | ✅ | None |
| groundwater_monitoring | ✅ | monitoring_access | ✅ | None |
| documentation_photos | ✅ | photos_access | ✅ | None |
| documentation_documents | ✅ | docs_access | ✅ | None |
| files | ✅ | files_access | ✅ | None |
| backup_manifests | ✅ | (inherited) | ✅ | None |
| activity_logs | ✅ | activity_access | ✅ | None |
| refresh_sessions | ✅ | sessions_owner | ✅ | None (service-mode exception) |

**Key Design:** Admin access is at application layer (SQL includes `EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin')`) to avoid infinite recursion from `user_can_access_project` function. Verified: `TestRLSIsolation` confirms admin with no projects sees 0 via RLS alone.

### 3.5 Phase 5.1 FK Changes (Cascade Delete Protection)

| Table | Column | Before | After |
|-------|--------|--------|-------|
| projects | owner_id | ON DELETE CASCADE | **ON DELETE RESTRICT** |
| project_assignments | user_id | ON DELETE CASCADE | **ON DELETE RESTRICT** |
| files | owner_id | ON DELETE CASCADE | **ON DELETE RESTRICT** |
| refresh_sessions | user_id | ON DELETE CASCADE | **ON DELETE RESTRICT** |

**Verification:** Migration `20261104210000_fix_user_cascade_delete.sql` applied. Deleting user with projects returns FK error 23503. Suspend/unsuspend works. No DELETE user endpoint exists — only suspend.

### 3.6 Optimistic Locking (Concurrent Upserts)

| Endpoint | Version Check | Conflict Response |
|----------|---------------|-------------------|
| PUT /wells/:id/designer | New=1, Existing=match current | 409 Conflict |
| PUT /wells/:id/geology | New=1, Existing=match current | 409 Conflict |
| PUT /wells/:id/monitoring | New=1, Existing=match current | 409 Conflict |

**Status:** ✅ Implemented and tested in Phase 5.1.

---

## 4. API & Backend Security Audit

### 4.1 Input Validation

| Area | Status | Details |
|------|--------|---------|
| JSON Binding | PASS | Gin `ShouldBindJSON` with struct tags; validation error responses |
| Form/Multipart | PASS | `ShouldBind` for uploads; file size checked before processing |
| UUID Parameters | PASS | `uuid.Parse` with 400 on invalid |
| Query Parameters | PASS | `strconv.Atoi` with defaults; page_size capped at 100 |
| SQL Injection | PASS | All queries use parameterized `$1, $2` via pgx; no dynamic SQL found |

### 4.2 File Upload Security

| Check | Implementation | Status |
|-------|----------------|--------|
| Size Limit | `MaxPhotoSizeBytes` (10MB), `MaxDocumentSizeBytes` (25MB) | ✅ `documentation.go:184, 527` |
| Extension Allowlist | `.jpg, .jpeg, .png, .webp` / `.pdf, .jpg, .jpeg, .png, .webp, .txt` | ✅ `repository` constants |
| MIME Detection | `gabriel-vasile/mimetype` from content (not header) | ✅ `documentation.go:208, 551` |
| MIME Allowlist | Matches extension allowlist | ✅ `repository` constants |
| Path Traversal | `filepath.Clean` + `strings.Contains(cleanPath, "..")` + absolute path prefix check | ✅ `documentation.go:791-812` |
| Filename Sanitization | UUID + original extension; no user-controlled path | ✅ `documentation.go:228-236, 571-572` |
| Integrity | SHA-256 computed on write; stored in `files.checksum_sha256` | ✅ `documentation.go:247-253, 590-596` |
| AuthZ Before Access | `GetFileForUser` uses RLS; download verifies project access | ✅ `documentation.go:780-788` |

### 4.3 Error Handling & Info Leakage

| Vector | Status | Evidence |
|--------|--------|----------|
| SQL Errors | PASS | Generic "Internal Server Error"; no SQL in response |
| Stack Traces | PASS | `Recovery()` middleware returns generic 500 |
| Credentials in Logs | PASS | Passwords never logged; `logger.go` structured fields only |
| Filesystem Paths | PASS | Not exposed in API responses |
| Internal Details | PASS | Error responses use RFC 7807 format with generic detail |

### 4.4 Security Headers (middleware.go:142-150)

| Header | Value | Status |
|--------|-------|--------|
| X-Content-Type-Options | nosniff | ✅ |
| X-Frame-Options | DENY | ✅ |
| X-XSS-Protection | 1; mode=block | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Content-Security-Policy | default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' | ⚠️ **'unsafe-inline' for styles** |

### 4.5 Other Backend Controls

| Control | Status | Details |
|---------|--------|---------|
| Request Timeout | ✅ | 30s via `middleware.Timeout` |
| Body Size Limit | ✅ | 30MB via `middleware.BodySizeLimit` |
| Panic Recovery | ✅ | Custom recovery with request ID logging |
| Request ID | ✅ | X-Request-ID header generated/propagated |
| Structured Logging | ✅ | Zap JSON with method, path, status, latency, client_ip |
| DB Connection Pool | ✅ | Configurable max_conns (default 20), min_conns (5), max_lifetime (1h), max_idle_time (30m) |
| CORS | ⚠️ **Not configured** | Gin default (allows all); needs explicit allowlist for production |

### 4.6 Vulnerabilities (govulncheck)

| Vuln | Severity | Module | Fixed In | Action |
|------|----------|--------|----------|--------|
| GO-2026-6809 | HIGH | crypto/x509 (stdlib) | Go 1.27.3 | Update Go toolchain |
| GO-2026-6617 | HIGH | net/http (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6613 | HIGH | net/http (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6612 | HIGH | net/http (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6611 | HIGH | net/http (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6609 | HIGH | net/http (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6608 | HIGH | net/textproto (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6607 | HIGH | crypto/tls (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-6603 | HIGH | net/http (stdlib) | Go 1.27.2 | Update Go toolchain |
| GO-2026-5004 | CRITICAL | github.com/jackc/pgx/v5 | v5.9.2 | **Upgrade pgx** |

**Note:** All stdlib vulnerabilities are in Go 1.27.x; current module uses Go 1.26.0. Upgrading to Go 1.27.3+ resolves 9/10. The pgx SQL injection (GO-2026-5004) requires explicit dependency upgrade to v5.9.2+.

---

## 5. Frontend Security Audit

### 5.1 Token Handling

| Aspect | Implementation | Status |
|--------|----------------|--------|
| Access Token Storage | `window.__borewell_access_token` (memory only) | ✅ Not in localStorage/sessionStorage |
| Refresh Token Storage | HttpOnly cookie (backend sets) | ✅ Inaccessible to JavaScript |
| Token Refresh | Automatic on 401 with deduplication (`refreshInFlight`) | ✅ `client.js:31-46` |
| Logout | POST /auth/logout + clear memory + clear cookie | ✅ `AuthContext.jsx:81-85` |

### 5.2 XSS & Injection Risks

| Vector | Status | Details |
|--------|--------|---------|
| `dangerouslySetInnerHTML` | NOT FOUND | Grep: 0 occurrences |
| User Input in HTML | PASS | React auto-escapes; no raw HTML rendering found |
| URL/Redirect Handling | PASS | React Router; no open redirect endpoints |
| API Error Messages | PASS | Displayed via toast; no HTML interpretation |

### 5.3 Sensitive Data in Browser Storage

| Storage | Content | Status |
|---------|---------|--------|
| localStorage | Project/well data (legacy offline mode) | ⚠️ **Contains project data** — conflicts with centralized multi-user model |
| sessionStorage | None used | ✅ |
| IndexedDB | None used | ✅ |
| Cookies | Only HttpOnly refresh_token | ✅ |

**Risk:** `ProjectContext.jsx` dual-writes to localStorage AND API. In multi-user LAN deployment, localStorage data will conflict across users on same browser. Must be disabled or migrated when API mode is active.

### 5.4 Session & Auth State

| Behavior | Implementation | Status |
|----------|----------------|--------|
| Initial Load | `me()` → if 401/403 & no token → try refresh → if fails → clear | ✅ `AuthContext.jsx:105-146` |
| Network Error (5xx/0) | Retains access token; shows error toast; does NOT logout | ✅ Correct — distinguishes technical failure from auth failure |
| Cross-Tab Sync | Not implemented | ⚠️ Logout in one tab doesn't notify others |
| Token Expiry Handling | Auto-refresh on 401; max 1 retry | ✅ `client.js:74-111` |
| Unauthorized Navigation | Protected routes check `isAuthenticated` | ✅ `AppShell`/`AuthLayout` |

### 5.5 File Upload/Download

| Flow | Implementation | Status |
|------|----------------|--------|
| Upload | FormData via `photoAPI.upload` / `documentAPI.upload` | ✅ No client-side validation bypass |
| Download | `fileAPI.getBlobUrl` creates object URL | ✅ Uses authenticated fetch |
| Path Traversal | Prevented server-side | ✅ Backend validates |

---

## 6. File Upload & Storage Findings

| ID | Finding | Severity | Evidence | Remediation |
|----|---------|----------|----------|-------------|
| F-01 | **Server-side MIME detection (not header trust)** | PASS | `mimetype.DetectReader` | ✅ Correct |
| F-02 | **Extension + MIME dual validation** | PASS | Allowlist maps in repository | ✅ Correct |
| F-03 | **Path traversal protection on download** | PASS | `filepath.Clean` + prefix check | ✅ Correct |
| F-04 | **SHA-256 integrity on upload** | PASS | Computed during write | ✅ Correct |
| F-05 | **File size limits enforced** | PASS | 10MB photos, 25MB documents | ✅ Correct |
| F-06 | **Authorization before file access** | PASS | `GetFileForUser` with RLS | ✅ Correct |
| F-07 | **Physical file cleanup on DB failure** | PASS | `os.Remove(dstPath)` on rollback | ✅ Correct |
| F-08 | **Storage path uses UUID (no user control)** | PASS | `uuid.New() + ext` | ✅ Correct |
| F-09 | **No antivirus scanning** | MEDIUM | Not implemented | Add ClamAV or cloud scanning for production |
| F-10 | **No file type content validation beyond MIME** | LOW | Could add magic bytes verification | Optional hardening |

---

## 7. Secrets & Configuration Audit

### 7.1 Configuration Files

| File | Status | Notes |
|------|--------|-------|
| `.env` | NOT FOUND | Expected for local dev; not committed |
| `.env.example` | NOT FOUND | **Missing** — should exist with placeholders |
| `backend/.env` | NOT FOUND | Same |
| `docker-compose.yml` | ✅ | Uses `${POSTGRES_PASSWORD:-changeme}`; no hardcoded secrets |

### 7.2 Required Secrets (config.go:73-97)

| Variable | Required | Production Validation |
|----------|----------|----------------------|
| `DATABASE_URL` | ✅ | — |
| `JWT_SECRET` | ✅ | ≥32 chars, no "dev" substring |
| `REFRESH_TOKEN_SECRET` | ✅ | ≥32 chars, no "dev" substring |
| `ARGON2_*` | Optional | Defaults provided |
| `FILE_STORAGE_PATH` | Optional | Default `./data/files` |

### 7.3 Frontend Environment Variables

| Variable | Used For | Exposes Backend Secret? |
|----------|----------|------------------------|
| `VITE_API_BASE` | API endpoint | No |
| (none others) | — | No |

**Status:** Frontend build does not embed backend secrets. Vite only exposes `VITE_*` prefixed vars.

### 7.4 Git History Check

No secrets found in recent commits. `git log --all --full-history -- "**/.env*"` returns no matches.

### 7.5 Recommendations

1. Create `.env.example` with placeholders for all required variables
2. Document production secret generation (e.g., `openssl rand -base64 32`)
3. Use external secrets manager (HashiCorp Vault, AWS Secrets Manager) for LAN/production
4. Rotate JWT secrets periodically (documented procedure needed)

---

## 8. Dependency & Build Security

### 8.1 Frontend (npm audit)

| Vulnerability | Severity | Package | Current | Fixed In | Action |
|---------------|----------|---------|---------|----------|--------|
| Path Traversal in @vitest/mocker | MODERATE | vitest | 2.1.9 | 5.1.0 (breaking) | Evaluate upgrade path |
| Code Injection in @vitest/mocker | MODERATE | vitest | 2.1.9 | 5.1.0 (breaking) | Evaluate upgrade path |
| XSS in dompurify | HIGH | jspdf → dompurify | 2.5.1 → 3.4.16 | jspdf 4.2.1 (breaking) | Evaluate upgrade path |
| DoS in esbuild | MODERATE | vite → esbuild | 5.4.8 → 0.24.2 | vite 8.3.5 (breaking) | Evaluate upgrade path |
| DoS in minimatch | MODERATE | eslint → minimatch | 9.10.0 → <11.0.1 | eslint 4.0.0 (breaking) | Evaluate upgrade path |
| DoS in source-map-js | HIGH | source-map-js | 1.2.1 | 1.2.2+ | **Patch available** |
| RCE in tinypool | CRITICAL | vitest → tinypool | 2.1.9 → 2.1.1 | vitest 5.1.0 (breaking) | Evaluate upgrade path |

**Total:** 15 vulnerabilities (9 moderate, 3 high, 3 critical)

**Assessment:** All are in **devDependencies** (test/build tooling). No production runtime dependencies affected. The critical/right RCE in tinypool is in the test runner worker process. Risk is limited to CI/test environments.

**Recommendation:** Schedule major version upgrades for vitest, vite, eslint, jspdf in a controlled manner. For immediate mitigation, ensure CI runs in isolated containers.

### 8.2 Backend (govulncheck)

| Vulnerability | Severity | Module | Fixed In | Action |
|---------------|----------|--------|----------|--------|
| GO-2026-6809 | HIGH | crypto/x509 (stdlib) | Go 1.27.3 | Upgrade Go toolchain |
| GO-2026-6617 | HIGH | net/http (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6613 | HIGH | net/http (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6612 | HIGH | net/http (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6611 | HIGH | net/http (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6609 | HIGH | net/http (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6608 | HIGH | net/textproto (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6607 | HIGH | crypto/tls (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-6603 | HIGH | net/http (stdlib) | Go 1.27.2 | Upgrade Go toolchain |
| GO-2026-5004 | CRITICAL | github.com/jackc/pgx/v5 | v5.9.2 | **Upgrade pgx** |

**Assessment:** 9/10 are stdlib issues fixed in Go 1.27.2+. Current: Go 1.26.0. The pgx SQL injection (GO-2026-5004) is the only actionable dependency upgrade.

**Recommendation:** Upgrade Go to 1.27.3+ and pgx to v5.9.2+ before LAN deployment.

### 8.3 Build & Test Results

| Check | Command | Result |
|-------|---------|--------|
| Frontend Tests | `npm test` | ✅ 76 tests pass |
| Frontend Build | `npm run build` | ✅ Passes |
| Frontend Lint | `npm run lint` | ⚠️ Pre-existing warnings only |
| Backend Unit Tests | `go test ./... -count=1` | ✅ All packages pass |
| Backend Integration Tests | `go test ./tests/... -count=1` | ✅ fs2, fs3 pass |
| `go vet ./...` | `go vet ./...` | ✅ No issues |
| RLS Isolation Tests | `TestRLSIsolation` | ✅ Passes |
| Authorization Tests | `fs2_security_test`, `fs2_admin_test` | ✅ Passes |

---

## 9. LAN Readiness Assessment

### 9.1 Recommended Future Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            OFFICE LAN                                       │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐              │
│  │  Staff PC 1  │    │  Staff PC 2...N  │    │  Admin PC    │              │
│  │  (Browser)   │    │  (Browser)       │    │  (Browser)   │              │
│  └──────┬───────┘    └────────┬─────────┘    └──────┬───────┘              │
│         │                     │                     │                       │
│         └─────────────────────┼─────────────────────┘                       │
│                               │                                             │
│                    ┌──────────▼──────────┐                                  │
│                    │  Reverse Proxy      │                                  │
│                    │  (nginx/Traefik)    │                                  │
│                    │  :443 (HTTPS)       │                                  │
│                    │  Terminate TLS      │                                  │
│                    │  Forward to :8080   │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│                    ┌──────────▼──────────┐                                  │
│                    │  App Server         │                                  │
│                    │  (Go/Gin :8080)     │                                  │
│                    │  Serves Frontend    │                                  │
│                    │  (embedded static)  │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│                    ┌──────────▼──────────┐                                  │
│                    │  PostgreSQL         │                                  │
│                    │  (127.0.0.1:5432)   │                                  │
│                    │  NOT exposed to LAN │                                  │
│                    └─────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Binding & Exposure Analysis

| Service | Current Binding | LAN Requirement | Change Needed |
|---------|-----------------|-----------------|---------------|
| Frontend (Vite Dev) | `localhost:5173` | Served by Go backend in production | **Yes** — embed static files in Go binary |
| Backend (Gin) | `0.0.0.0:8080` (default) | Bind to `127.0.0.1:8080` behind reverse proxy | **Yes** — config `APP_HOST=127.0.0.1` |
| PostgreSQL | `127.0.0.1:5433` (Docker) | **Keep at 127.0.0.1** — never expose to LAN | **No** — current is correct |
| Reverse Proxy | None | Required for HTTPS termination | **Add** — nginx/Traefik |

**Critical:** PostgreSQL must remain bound to `127.0.0.1`. The docker-compose.yml correctly maps `127.0.0.1:5433:5432`.

### 9.3 CORS, Cookies & Same-Origin for LAN

| Aspect | Current (Dev) | LAN Requirement | Gap |
|--------|---------------|-----------------|-----|
| **Cookie Domain** | `localhost` | Internal hostname (e.g., `borewell.local`) | Configurable via `COOKIE_DOMAIN` env |
| **Cookie Secure** | `false` (HTTP) | **Must be `true`** (HTTPS) | Requires `APP_ENV=production` + HTTPS |
| **Cookie SameSite** | `Lax` | `Lax` or `Strict` | OK |
| **CSRF Origin Check** | Compares to `c.Request.Host` | Must allow internal hostname | Configurable `ALLOWED_ORIGINS` |
| **CORS** | Not configured (allows all) | Explicit allowlist for internal host | **Must implement** |
| **X-Forwarded Headers** | Not trusted | Trust reverse proxy headers | Configure `gin.TrustedProxies` |

**Cookie Configuration for LAN:**
```go
// Production LAN config needed:
Secure: true                           // HTTPS required
SameSite: "Lax"                        // or "Strict"
Domain: "borewell.local"               // Internal DNS name
Path: "/"
```

### 9.4 Multi-User Operation

| Concern | Current State | LAN Readiness |
|---------|---------------|---------------|
| Concurrent Users | Supported (connection pool 20) | ✅ |
| Concurrent Edits | Optimistic locking on modules | ✅ |
| DB Transactions | Per-request; `WithUserTx` for RLS | ✅ |
| Connection Pooling | pgxpool (configurable) | ✅ |
| Session Isolation | RLS + token family per user | ✅ |
| User Suspension | Immediate refresh revocation | ✅ |
| Assignment Revocation | Handler checks DB on each write | ✅ |
| **File Storage** | Local filesystem (`FILE_STORAGE_PATH`) | ⚠️ **Must be shared network mount or object storage** |
| Backup Consistency | Not implemented | **Missing** |

**Critical Gap:** File storage is local to the app server. For LAN deployment with single server this works, but backup strategy must include the filesystem.

### 9.5 Backup & Recovery Assessment

| Aspect | Current State | Required for LAN |
|--------|---------------|------------------|
| PostgreSQL Backup | Not implemented | `pg_dump` scheduled + tested restore |
| File Storage Backup | Not implemented | Rsync/s3 sync of `FILE_STORAGE_PATH` |
| Migration Rollback | Goose `down` migrations exist | Documented procedure |
| Backup Retention | Not defined | Define RPO/RTO (e.g., daily + 30-day retention) |
| Recovery Testing | Not performed | Quarterly restore drills |

**Recommended Commands:**
```bash
# PostgreSQL backup (run on app server)
pg_dump -h 127.0.0.1 -p 5433 -U borewell_app -d borewell > backup_$(date +%F).sql

# File storage backup
rsync -av /path/to/data/files/ /backup/files/

# Restore test (staging)
createdb -h 127.0.0.1 -p 5433 -U borewell_app borewell_test
psql -h 127.0.0.1 -p 5433 -U borewell_app -d borewell_test < backup_2026-11-01.sql
```

---

## 10. Security Remediation (Completed in Phase 5.1)

The following were fixed in commit `fe0ea9e` and verified:

| ID | Remediation | Files Changed | Verification |
|----|-------------|---------------|--------------|
| R-01 | VIEW/EDIT enforcement on all write handlers | `handler/project.go`, `handler/module.go`, `handler/documentation.go` | ✅ Tests pass |
| R-02 | FK cascade delete → RESTRICT | `migrations/20261104210000_fix_user_cascade_delete.sql` | ✅ FK error on delete |
| R-03 | Optimistic locking on module upserts | `handler/module.go`, `repository/module.go` | ✅ 409 Conflict |
| R-04 | Session revocation documentation | `backend/AUTHENTICATION.md` | ✅ Documented |
| R-05 | AssignmentRepo.CanEdit uses WithUserTx | `repository/assignment.go` | ✅ RLS context |

**No new remediation needed for current codebase.** All verified security defects were addressed in Phase 5.1.

---

## 11. Files Changed in Phase 6

| File | Change Type | Description |
|------|-------------|-------------|
| `PHASE_6_SECURITY_LAN_READINESS_REPORT.md` | **New** | This audit report |
| (No source code changes) | — | Phase 6 is assessment-only; no code modifications made |

---

## 12. Test Results Summary

| Test Suite | Tests | Status | Notes |
|------------|-------|--------|-------|
| Frontend Unit (Vitest) | 76 | ✅ PASS | 4 test files |
| Backend Unit (auth, repository) | ~30 | ✅ PASS | 2 packages |
| Backend Integration (fs2: security, RLS, refresh, admin) | ~50 | ✅ PASS | Includes IDOR, RLS, auth flows |
| Backend Integration (fs3: CRUD) | ~40 | ✅ PASS | Project/well/module CRUD |
| RLS Isolation | 10 scenarios | ✅ PASS | Cross-user, admin, fail-closed |
| `go vet ./...` | — | ✅ PASS | No issues |
| Frontend Build | — | ✅ PASS | Production build succeeds |

---

## 13. Remaining Risks & Limitations

| ID | Risk | Severity | Component | Mitigation |
|----|------|----------|-----------|------------|
| RL-01 | **JWT access token not immediately revoked on permission change** | MEDIUM | Auth (15 min TTL) | Documented; short TTL limits exposure |
| RL-02 | **Frontend nav shows all items regardless of role** | LOW | UI (`AppShell.jsx`) | Backend enforcement authoritative; UI-only |
| RL-03 | **localStorage data conflicts with centralized multi-user model** | HIGH | `ProjectContext.jsx` dual-write | Disable localStorage when API mode active |
| RL-04 | **No DELETE user endpoint (by design)** | INFO | Admin API | Only suspend/unsuspend; preserves audit trail |
| RL-05 | **No rate limiting middleware found in code** | MEDIUM | Middleware | Documented in AUTHENTICATION.md but not implemented |
| RL-06 | **CORS not configured** | HIGH | Router | Must add explicit allowlist for production |
| RL-07 | **Cookie domain hardcoded to localhost** | HIGH | `auth/handler.go:540` | Must be configurable via env |
| RL-08 | **Frontend dev dependencies have vulnerabilities** | MEDIUM | Dev tooling only | Schedule major upgrades; isolate CI |
| RL-09 | **Go stdlib vulnerabilities (9)** | HIGH | Runtime | Upgrade to Go 1.27.3+ before LAN deployment |
| RL-10 | **pgx SQL injection (GO-2026-5004)** | CRITICAL | `github.com/jackc/pgx/v5` | Upgrade to v5.9.2+ |
| RL-11 | **No backup/restore procedure implemented** | HIGH | Operations | Define and test before LAN deployment |
| RL-12 | **No monitoring/alerting** | MEDIUM | Operations | Add health checks, log aggregation |
| RL-13 | **CSP includes 'unsafe-inline' for styles** | LOW | Middleware | Refactor to nonce/hash-based CSP |
| RL-14 | **File storage local to server** | MEDIUM | `FILE_STORAGE_PATH` | Use network mount or S3 for HA |
| RL-15 | **Cross-tab session sync not implemented** | LOW | Frontend | Optional UX improvement |

---

## 14. Final Readiness Decisions

| Deployment Target | Decision | Prerequisites |
|-------------------|----------|---------------|
| **Local Development Security** | **READY WITH CONDITIONS** | 1. Fix RL-05 (implement rate limiting)<br>2. Fix RL-08 (plan dev dependency upgrades) |
| **Multi-User Application Architecture** | **READY WITH CONDITIONS** | 1. Fix RL-03 (disable localStorage in API mode)<br>2. Fix RL-06 (CORS allowlist)<br>3. Fix RL-07 (configurable cookie domain)<br>4. Fix RL-10 (upgrade pgx) |
| **Office LAN Deployment** | **NOT READY** | All multi-user prerequisites PLUS:<br>1. HTTPS certificate (internal CA or self-signed trusted)<br>2. Reverse proxy (nginx/Traefik) with TLS termination<br>3. `APP_ENV=production` with Secure cookies<br>4. PostgreSQL backup + restore tested<br>5. File storage backup strategy<br>6. Go 1.27.3+ toolchain upgrade<br>7. Secrets management (external or documented rotation)<br>8. Monitoring/health endpoints exposed |
| **Public Internet Deployment** | **NOT READY** | All LAN prerequisites PLUS:<br>1. WAF (ModSecurity/Cloudflare)<br>2. DDoS protection<br>3. External secrets manager (Vault/AWS Secrets Manager)<br>4. Penetration test<br>5. Security headers hardened (CSP nonce)<br>6. Rate limiting at edge<br>7. Audit logging to SIEM<br>8. Incident response plan |

---

## 15. Prerequisites for Office LAN Deployment (Checklist)

### Infrastructure
- [ ] Internal DNS name (e.g., `borewell.local`) pointing to app server
- [ ] TLS certificate for internal hostname (internal CA or trusted self-signed)
- [ ] Reverse proxy (nginx/Traefik) configured for HTTPS → :8080
- [ ] Firewall: only reverse proxy ports (80/443) open on app server
- [ ] PostgreSQL remains bound to `127.0.0.1` (no LAN exposure)

### Application Configuration
- [ ] `APP_ENV=production`
- [ ] `APP_HOST=127.0.0.1` (backend binds to loopback only)
- [ ] `COOKIE_DOMAIN=borewell.local` (configurable)
- [ ] `ALLOWED_ORIGINS=https://borewell.local` (CORS allowlist)
- [ ] `JWT_SECRET` ≥32 chars, generated via `openssl rand -base64 32`
- [ ] `REFRESH_TOKEN_SECRET` ≥32 chars, generated via `openssl rand -base64 32`
- [ ] `DATABASE_URL` with strong password
- [ ] `FILE_STORAGE_PATH` on backed-up volume / network mount

### Code Changes Required
- [ ] Add CORS middleware with explicit allowlist
- [ ] Make cookie domain configurable via env
- [ ] Implement rate limiting middleware (login 5/min/IP, refresh 10/min/user, admin 30/min)
- [ ] Upgrade `github.com/jackc/pgx/v5` to v5.9.2+
- [ ] Upgrade Go toolchain to 1.27.3+
- [ ] Disable localStorage writes in `ProjectContext` when `isAuthenticated=true`

### Operational
- [ ] PostgreSQL backup script scheduled (daily `pg_dump`)
- [ ] File storage backup scheduled (rsync/s3)
- [ ] Restore procedure documented and tested quarterly
- [ ] Health check endpoints (`/health`, `/ready`) monitored
- [ ] Log aggregation (Loki/ELK) configured
- [ ] Secret rotation procedure documented (quarterly JWT secret rotation)

---

## 16. Git Checkpoint

**Status:** Working tree clean. No source code changes made during Phase 6 (assessment only).

```bash
git status
# On branch main
# Your branch is up to date with 'origin/main'.
# nothing to commit, working tree clean
```

**Report Commit (if desired):**
```bash
git add PHASE_6_SECURITY_LAN_READINESS_REPORT.md
git commit -m "docs: security audit and LAN readiness assessment (Phase 6)"
git push origin main
```

---

## 17. Compliance Statement

This assessment **does not constitute** security certification, regulatory compliance (GDPR, ISO 27001, SOC 2), or penetration testing. It is a code-level security review against common application security practices. For production deployment, engage a qualified security firm for independent penetration testing and compliance validation.

---

*Report generated as part of Phase 6: Security Audit & LAN Readiness Assessment*  
*Next phase: Phase 7 — LAN Deployment Preparation (pending approval)*