# FULLSTACK_ROADMAP.md
# Borewell Engineering Visualizer v2.0.0 — Full Stack Migration Roadmap

**Status**: FS0 Complete — Ready for FS1
**Date**: 2026-11-03
**Total Phases**: FS0–FS8 (9 phases)
**Estimated Duration**: 8–12 weeks (part-time) / 4–6 weeks (full-time)

---

## 1. PHASE OVERVIEW

| Phase | Name | Focus | Depends On | Status |
|-------|------|-------|------------|--------|
| **FS0** | Architecture Audit & Planning | Audit, docs, decisions | — | ✅ **DONE** |
| **FS1** | Backend & PostgreSQL Foundation | Go + Gin + DB + Migrations | FS0 | ⏳ Next |
| **FS2** | Authentication & Admin Approval | Auth, JWT, Admin UI | FS1 | 🔄 Planned |
| **FS3** | Project & Well API | CRUD, ownership, pagination | FS2 | 🔄 Planned |
| **FS4** | Engineering Module APIs | Designer, Geology, Monitoring | FS3 | 🔄 Planned |
| **FS5** | Documentation & Reports | Photos, Docs, File storage, PDF | FS4 | 🔄 Planned |
| **FS6** | Backup, Restore & Data Mgmt | ZIP backup, merge, health, integrity | FS5 | 🔄 Planned |
| **FS7** | Legacy Data Migration | Browser → PostgreSQL import | FS6 | 🔄 Planned |
| **FS8** | Security, E2E & Final QA | Pen-test, E2E, regression, build | FS7 | 🔄 Planned |

---

## 2. DETAILED PHASE BREAKDOWN

### FS1 — Backend & PostgreSQL Foundation (Week 1–2)

**Goal**: Running Go backend with PostgreSQL, migrations, health endpoint, Docker.

#### Deliverables
- [ ] `backend/` scaffold with modular structure
- [ ] `internal/config` — Viper env config (`.env.example`)
- [ ] `internal/database` — pgxpool, connection pool, health check
- [ ] `internal/middleware` — RequestID, slog logger, recovery, CORS, timeout
- [ ] `migrations/001–008` — Goose SQL up/down (see `DATABASE_SCHEMA_DESIGN.md`)
- [ ] `cmd/migrate` — Migration runner (up/down/status)
- [ ] `cmd/server` — Gin server, graceful shutdown, `/health` endpoint
- [ ] `Dockerfile` + `docker-compose.yml` (PostgreSQL 16, optional pgAdmin)
- [ ] `README.md` — Build, run, test instructions

#### Quality Gates
- [ ] `go build ./...` succeeds
- [ ] `go test ./...` passes (unit tests for config, database)
- [ ] `goose -dir migrations postgres "$DSN" up` succeeds
- [ ] `curl http://localhost:8080/health` returns `{"status":"ok"}`
- [ ] Docker Compose: `docker compose up -d` → PostgreSQL ready

#### Risks
- Go version compatibility (use 1.22+)
- pgx v5 API differences from v4
- Migration ordering with FKs

---

### FS2 — Authentication & Admin Approval (Week 2–3)

**Goal**: Complete auth system with registration, login, JWT, refresh cookies, admin approval.

#### Deliverables
- [ ] `internal/auth` — Argon2id, JWT (HS256, 15min), refresh token (opaque, 30d, SHA-256 hash)
- [ ] `internal/middleware/auth` — JWT validation, context injection
- [ ] `internal/handler/auth` — Register, Login, Logout, Refresh, Me
- [ ] `internal/handler/admin` — Pending users, Approve, Reject, Suspend
- [ ] `cmd/bootstrap-admin` — CLI: `go run cmd/bootstrap-admin/main.go --email admin@local --password`
- [ ] Frontend: `/login`, `/register`, `/pending`, `/rejected`, `/admin/approval`
- [ ] Frontend: Auth context, protected routes, token refresh interceptor
- [ ] Frontend: HttpOnly cookie handling (Vite proxy)

#### Quality Gates
- [ ] Register → pending → admin approve → login → access token + refresh cookie
- [ ] Refresh rotates token, old revoked
- [ ] Logout revokes session, clears cookie
- [ ] Expired access token → auto-refresh → new access token
- [ ] Pending/rejected/suspended users blocked at middleware
- [ ] Bootstrap admin creates first admin, fails if admin exists
- [ ] Rate limiting on auth endpoints (5/min login)
- [ ] All auth tests pass

#### Security Requirements
- [ ] Argon2id params: time=3, memory=64MB, threads=4, keyLen=32
- [ ] JWT secret from env (32+ chars)
- [ ] Refresh token: crypto/rand 32 bytes, SHA-256 stored
- [ ] Cookies: HttpOnly, SameSite=Lax, Secure=false (localhost), Path=/
- [ ] No password/token in logs
- [ ] Generic error messages (no user enumeration)

---

### FS3 — Project & Well API (Week 3–4)

**Goal**: Full CRUD for projects/wells with ownership verification, pagination, filtering.

#### Deliverables
- [ ] `internal/repository/project`, `well` — SQL queries with ownership JOINs
- [ ] `internal/service/project`, `well` — Business logic, validation
- [ ] `internal/handler/project`, `well` — REST endpoints (see `API_SPECIFICATION.md`)
- [ ] `internal/middleware/ownership` — Reusable ownership verification
- [ ] Frontend: Replace `projectStorage.js` calls with API client
- [ ] Frontend: `ProjectsPage`, `ProjectDetailPage` use API
- [ ] Frontend: Pagination, search, filter, sort via query params

#### Quality Gates
- [ ] User A cannot read/modify User B's projects (test with 2 users)
- [ ] Pagination works (page, page_size, total)
- [ ] Filter by status, search by name/code/client
- [ ] Sort by all columns asc/desc
- [ ] Archive/restore/duplicate work
- [ ] Well CRUD scoped to project
- [ ] Duplicate well copies all module data
- [ ] All project/well tests pass

#### Ownership Verification (Critical)
```go
// Every query MUST include ownership check
func (r *ProjectRepo) GetByID(ctx context.Context, id, userID uuid.UUID) (*Project, error) {
    return r.db.QueryRow(ctx, `
        SELECT * FROM projects WHERE id = $1 AND owner_id = $2
    `, id, userID)
}
```

---

### FS4 — Engineering Module APIs (Week 4–5)

**Goal**: Migrate Designer, Geology, Monitoring to backend APIs.

#### Deliverables
- [ ] `internal/repository/designer`, `geology`, `monitoring` — JSONB upserts
- [ ] `internal/handler/designer`, `geology`, `monitoring` — PUT (full state), GET, DELETE
- [ ] Frontend: `DesignerPage`, `GeologyPage`, `MonitoringPage` → API
- [ ] Frontend: Autosave → debounced PUT to API (1.5s)
- [ ] Frontend: Validation runs client-side first, server-side re-validates
- [ ] Frontend: CSV import/export for monitoring/geology via API

#### Quality Gates
- [ ] Designer: CRUD components, undo/redo (client-side), autosave → API
- [ ] Geology: CRUD layers, validation (overlaps, gaps), autosave → API
- [ ] Monitoring: CRUD measurements, statistics, hydrograph data via API
- [ ] CSV import/export works via API endpoints
- [ ] All module data isolated per well (ownership via well → project → user)
- [ ] Legacy data in localStorage still works (dual-write during transition)

#### Dual-Write Strategy (Transition Period)
```javascript
// Frontend: saveDesigner() writes to BOTH localStorage AND API
const saveDesigner = async (data) => {
  await saveToLocalStorage(data);  // Immediate, for offline
  await api.put(`/wells/${wellId}/designer`, data);  // Background
};
```
**Cutover**: After FS4 verified, switch primary to API, keep localStorage as backup.

---

### FS5 — Documentation & Reports (Week 5–6)

**Goal**: File upload/download, photo/document management, PDF report generation.

#### Deliverables
- [ ] `internal/repository/file`, `photo`, `document` — File metadata + storage
- [ ] `internal/handler/upload` — Multipart, validation, filesystem save, `files` row
- [ ] `internal/handler/photo`, `document` — CRUD metadata, link to `files`
- [ ] `internal/handler/files` — `GET /files/{id}` with ownership check, streaming
- [ ] Filesystem: `./data/files/{photos,documents}/{uuid}.{ext}`
- [ ] Frontend: `DocumentationPage` → API upload/download
- [ ] Frontend: Drag-drop upload, progress, preview (via `/files/{id}`)
- [ ] Frontend: ReportBuilder → API (or keep client-side PDF)
- [ ] Frontend: Migration of legacy base64/IndexedDB files to filesystem

#### Quality Gates
- [ ] Upload: MIME validation, size limits (photo 10MB, doc 20MB)
- [ ] Download: Ownership verified, streaming, range requests
- [ ] Photos/Docs: CRUD metadata, categories, search, filter, sort
- [ ] Grid/List view, pagination
- [ ] Legacy migration: base64 → filesystem, IndexedDB → filesystem
- [ ] Checksum verification on upload/download
- [ ] PDF generation works (client-side or server-side)

#### File Storage Security
- [ ] Path traversal prevented (UUID filenames, no user input in path)
- [ ] MIME type verified via `http.DetectContentType`
- [ ] Extension allowlist matches MIME
- [ ] Files outside web root (`./data/files/`)
- [ ] No direct file serving (always via handler with auth)

---

### FS6 — Backup, Restore & Data Management (Week 6–7)

**Goal**: Full backup/restore via API, storage health, data integrity.

#### Deliverables
- [ ] `internal/handler/backup` — Create ZIP stream, restore with safety backup
- [ ] `internal/service/backup` — Manifest creation, validation, merge logic
- [ ] `internal/handler/export` — Partial exports (projects, well, CSV)
- [ ] `internal/handler/import` — Partial imports with validation
- [ ] `internal/handler/health` — DB size, file count, disk usage
- [ ] `internal/handler/integrity` — Constraint checks, orphan detection, repair preview
- [ ] Frontend: `DataManagementPage` → all API endpoints
- [ ] Frontend: Backup preview, restore mode (replace/merge), progress
- [ ] Frontend: Integrity check results with repair actions

#### Quality Gates
- [ ] Full backup ZIP contains: manifest + all JSON + file references
- [ ] Restore replace: wipes user data, restores exactly
- [ ] Restore merge: detects conflicts (project_code, well_code), shows preview
- [ ] Safety backup created before restore, auto-rollback on failure
- [ ] Export/import: projects (JSON), well (JSON), monitoring (CSV), geology (CSV)
- [ ] Storage health: DB size, file count, disk usage
- [ ] Integrity check: duplicate IDs, orphaned files, broken refs, invalid values
- [ ] Repair preview shows action, destructiveness, confirmation

#### Backup Format Compatibility
- Maintain `manifest.json` schema v1
- Include `storageManifest.indexedDB` for file references
- Version field for future migrations

---

### FS7 — Legacy Data Migration (Week 7–8)

**Goal**: User-triggered import from browser storage to PostgreSQL.

#### Deliverables
- [ ] `internal/handler/migration` — Preview + Import endpoints
- [ ] `internal/service/migration` — Transactional import, conflict resolution
- [ ] Frontend: `MigrationWizard` in `DataManagementPage`
- [ ] Frontend: localStorage/IndexedDB scanner
- [ ] Frontend: Preview with conflict warnings
- [ ] Frontend: Progress, result, verification links

#### Quality Gates
- [ ] Preview shows exact counts: projects, wells, photos, docs, files
- [ ] Import: transactional per project, full rollback on error
- [ ] Conflict resolution: skip/rename/overwrite
- [ ] Files: base64/IndexedDB → filesystem with checksums
- [ ] Idempotent: re-import same data → no duplicates
- [ ] Browser storage NEVER deleted automatically
- [ ] Activity log entry for migration
- [ ] Test with: empty, small, large, corrupted legacy data

#### Migration Verification Checklist
- [ ] Project count matches
- [ ] Well count matches
- [ ] All module data present (designer, geology, monitoring)
- [ ] All photos/documents accessible
- [ ] File checksums match
- [ ] Ownership correct (single user)
- [ ] No FK violations

---

### FS8 — Security, E2E & Final QA (Week 8–9)

**Goal**: Production-ready security, full test coverage, verified builds.

#### Deliverables
- [ ] Security audit checklist (see below)
- [ ] E2E tests: 2 users, full workflows
- [ ] Integration tests: API + DB
- [ ] Frontend build: `npm run build` → `dist/`
- [ ] Backend build: `go build -o bin/server ./cmd/server`
- [ ] Docker: Multi-stage build, production compose
- [ ] Documentation: `DEPLOYMENT.md`, `API.md`, `MIGRATION_GUIDE.md`

#### Security Audit Checklist
| Category | Checks |
|----------|--------|
| **Auth** | Argon2id params, JWT expiry, refresh rotation, logout revocation, rate limits |
| **Authorization** | Ownership on ALL queries, no UUID trust, admin scope explicit |
| **Input Validation** | Struct tags, JSONB constraints, file MIME/size, SQL params only |
| **File Upload** | Path traversal, MIME verification, extension allowlist, filesystem isolation |
| **CORS** | Strict origin allowlist, credentials=true only for allowed origins |
| **Headers** | CSP, HSTS, X-Frame-Options, Referrer-Policy (production) |
| **Secrets** | No secrets in code, env only, `.env.example` without values |
| **Logging** | No passwords/tokens, request IDs, structured JSON |
| **Dependencies** | `go mod verify`, `npm audit`, update vulnerable deps |

#### E2E Test Scenarios (2 Users: Alice + Bob)
- [ ] Alice registers → admin approves → login → create project → add well → all modules
- [ ] Bob registers → admin approves → login → create project (different data)
- [ ] Alice cannot see Bob's projects/wells/modules
- [ ] Alice cannot modify Bob's data via API (403)
- [ ] Admin approval dashboard works
- [ ] Backup/restore Alice's data only
- [ ] Legacy migration for Alice only
- [ ] Session refresh, logout, re-login
- [ ] File upload/download with ownership

#### Regression Tests (All Phases)
- [ ] Run all existing frontend tests (`node tests/*.mjs`)
- [ ] Backend unit tests: `go test ./internal/...`
- [ ] Backend integration tests: `go test ./internal/... -tags=integration`
- [ ] API contract tests: response shapes match `API_SPECIFICATION.md`
- [ ] Performance: 100 projects, 500 wells, 10k measurements — queries < 100ms

---

## 3. CROSS-PHASE CONCERNS

### 3.1 Testing Strategy
| Phase | Unit Tests | Integration Tests | E2E Tests |
|-------|------------|-------------------|-----------|
| FS1 | Config, DB, Middleware | Migration up/down | — |
| FS2 | Auth logic, Token gen | Login/Register flow | Login → Access protected |
| FS3 | Repo queries, Service | CRUD + ownership | Multi-user isolation |
| FS4 | Validation, JSONB | Module CRUD | Designer/Geology/Monitoring flows |
| FS5 | File handling, Upload | Upload/Download | Photo/Document management |
| FS6 | Backup manifest, Merge | Backup/Restore | Full disaster recovery |
| FS7 | Mapping, Conflict res | Import transaction | Legacy → Full stack |
| FS8 | — | — | Full regression suite |

### 3.2 Git Workflow (No Commits Until FS8)
- All changes local, uncommitted per rules
- Use `git stash` / worktrees for parallel experiments
- Final commit only after FS8 quality gate passes

### 3.3 Feature Flags (Frontend)
```javascript
// src/config/features.js
export const FEATURES = {
  USE_API_PROJECTS: false,      // FS3
  USE_API_WELLS: false,         // FS3
  USE_API_DESIGNER: false,      // FS4
  USE_API_GEOLOGY: false,       // FS4
  USE_API_MONITORING: false,    // FS4
  USE_API_DOCS: false,          // FS5
  USE_API_BACKUP: false,        // FS6
};
```
Flip to `true` after each phase verified.

---

## 4. TIMELINE ESTIMATE

| Phase | Duration (Full-time) | Duration (Part-time) | Key Milestone |
|-------|---------------------|---------------------|---------------|
| FS1 | 5 days | 1.5 weeks | Backend running, DB migrated |
| FS2 | 4 days | 1 week | Auth + Admin UI working |
| FS3 | 4 days | 1 week | Project/Well API + FE connected |
| FS4 | 5 days | 1.5 weeks | Engineering modules on API |
| FS5 | 4 days | 1 week | Files + Docs on API |
| FS6 | 4 days | 1 week | Backup/Restore + Health |
| FS7 | 3 days | 1 week | Legacy import wizard |
| FS8 | 5 days | 1.5 weeks | Security audit + E2E + Build |
| **Total** | **~34 days** | **~9.5 weeks** | **Production Ready** |

---

## 5. GO/NO-GO CRITERIA PER PHASE

| Phase | Must Pass Before Next Phase |
|-------|----------------------------|
| FS1 | `go build`, `goose up`, `/health` OK, Docker Compose up |
| FS2 | Register→Approve→Login→Refresh→Logout cycle, 2 users isolated |
| FS3 | User A CRUD projects/wells, User B cannot access, pagination works |
| FS4 | Designer/Geology/Monitoring autosave to API, validation works |
| FS5 | Upload photo/doc → download → verify checksum, ownership enforced |
| FS6 | Full backup → restore replace → verify; merge with conflicts shown |
| FS7 | Legacy preview → import → verify counts + checksums, browser data intact |
| FS8 | Security audit clean, E2E 2-user scenarios pass, builds succeed |

---

## 6. RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Go/pgx learning curve | Medium | High | Start FS1 early, pair with experienced Go dev |
| JSONB query performance | Low | Medium | Add GIN indexes on JSONB fields if needed |
| File upload memory | Low | High | Stream to disk, never buffer full file |
| Migration data loss | Low | Critical | Transaction per project, safety backup, browser data preserved |
| Auth bypass | Low | Critical | All authorization in middleware, test with 2 users |
| CORS/cookie issues | Medium | Medium | Vite proxy, SameSite=Lax, test cross-origin |
| IndexedDB migration | Medium | Medium | Chunked reads, progress UI, fallback to base64 |
| PDF generation break | Low | Medium | Keep client-side as fallback, test every phase |
| Scope creep | High | Medium | Strict phase gates, no new features until FS8 |

---

## 7. DECISION LOG (Roadmap)

| ID | Decision | Phase |
|----|----------|-------|
| R001 | Go + Gin + pgx + Goose | FS1 |
| R002 | Argon2id + JWT(15m) + HttpOnly Refresh(30d) | FS2 |
| R003 | Ownership verified in every repository query | FS3 |
| R004 | PUT full-state for modules (matches autosave) | FS4 |
| R005 | Files on filesystem, metadata in DB | FS5 |
| R006 | Backup as ZIP stream, merge with conflict detection | FS6 |
| R007 | User-triggered legacy import, never auto | FS7 |
| R008 | Security audit + 2-user E2E before done | FS8 |
| R009 | No commits until FS8 complete | All |
| R010 | Dual-write during transition, cutover after verify | FS3–FS6 |

---

## 8. NEXT ACTIONS (Immediate)

1. **Review FS0 documents** with stakeholders
2. **Approve** → Begin FS1
3. **FS1 Kickoff**: Scaffold `backend/`, create `go.mod`, first migration

---

**FS0 Status**: ✅ **COMPLETE** — All 5 planning documents created:
- `FULLSTACK_ARCHITECTURE.md`
- `DATABASE_SCHEMA_DESIGN.md`
- `API_SPECIFICATION.md`
- `DATA_MIGRATION_PLAN.md`
- `FULLSTACK_ROADMAP.md`

**Awaiting approval to proceed to FS1.**