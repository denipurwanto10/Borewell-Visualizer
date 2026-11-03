# FULLSTACK_ARCHITECTURE.md
# Borewell Engineering Visualizer v2.0.0 — Full Stack Migration Architecture

**Status**: FS0 Audit Complete
**Date**: 2026-11-03
**Frontend Stack**: React 18 + Vite 5 + JavaScript/JSX
**Target Backend Stack**: Go 1.22+ + Gin + PostgreSQL 16 + pgx/v5
**Authentication**: Argon2id + JWT (access) + HttpOnly Cookie (refresh)

---

## 1. CURRENT FRONTEND ARCHITECTURE AUDIT

### 1.1 Directory Structure
```
src/
├── main.jsx                    # Entry point, ProjectProvider wrapper
├── App.jsx                     # Root component, routing, global state (model/well/activity)
├── context/
│   └── ProjectContext.jsx      # React Context for project/well CRUD + storage bridge
├── components/                 # 19 page/components
│   ├── Primitives.jsx          # Button, Field, Toast, Confirm, Tabs, Stat, Card, Badge
│   ├── DashboardPage.jsx       # Stats, recent projects/wells, quick actions
│   ├── ProjectsPage.jsx        # Project CRUD, table, pagination, search, filter
│   ├── ProjectDetailPage.jsx   # Project detail + well management
│   ├── VisualizationPage.jsx   # Legacy pipe visualization (Canvas)
│   ├── DesignerPage.jsx        # Advanced Well Designer (Phase 3)
│   ├── DesignerCanvas.jsx      # Canvas rendering for Designer
│   ├── ComponentToolbar.jsx    # Component palette
│   ├── PropertiesPanel.jsx     # Component property editor
│   ├── CanvasControls.jsx      # Zoom/pan/export PNG
│   ├── DesignerValidationPanel.jsx
│   ├── DataPage.jsx            # Well data form (legacy model)
│   ├── GeologyPage.jsx         # Geological Log (Phase 4)
│   ├── GeologyLogCanvas.jsx    # Canvas for geology log
│   ├── MonitoringPage.jsx      # Groundwater Monitoring (Phase 5)
│   ├── MonitoringHydrographCanvas.jsx
│   ├── DocumentationPage.jsx   # Photo/Doc gallery (Phase 6)
│   ├── DocsPage.jsx            # Activity documentation (legacy borehole images)
│   ├── ReportBuilderPage.jsx   # Report Builder + PDF (Phase 6)
│   ├── DataManagementPage.jsx  # Backup/Restore/Import/Export/Health/Integrity (Phase 7)
│   └── Diagram.jsx             # Legacy diagram component
├── designer/                   # Phase 3 — Designer domain
│   ├── model.js                # Component types, defaults, create/normalize
│   ├── geometry.js             # Layout calculations
│   ├── renderers.js            # Canvas renderers per component type
│   ├── history.js              # Undo/redo stack (max 50)
│   ├── validation.js           # Overlap, diameter, depth validation
│   ├── adapter.js              # Designer ↔ Legacy model conversion
│   └── adapter.test.js
├── geology/                    # Phase 4 — Geology domain
│   ├── model.js                # Layer types, materials, create/normalize
│   ├── geometry.js
│   └── validation.js           # Overlap, gap, bounds validation
├── monitoring/                 # Phase 5 — Monitoring domain
│   ├── model.js                # Measurement, methods, reference points
│   ├── statistics.js           # Min/max/avg, change, elevation
│   ├── validation.js
│   └── export.js               # CSV import/export
├── documentation/              # Phase 6 — Documentation domain
│   └── model.js                # Photo/Document records, categories, normalize
├── storage/                    # Storage abstraction layer (localStorage + IndexedDB)
│   ├── projectStorage.js       # Projects, wells, migration from legacy keys
│   ├── documentationStorage.js # Photos, documents, IndexedDB for large files
│   ├── backupStorage.js        # ZIP backup/restore, safety backup, merge
│   ├── integrityStorage.js     # Data integrity checks, repair preview
│   └── healthStorage.js        # Storage quota monitoring
├── models/
│   └── project.js              # Project/Well validation, status enums
├── pdf.js                      # PDF generation (jsPDF) — 1200+ lines
├── hooks.js                    # readImageFile helper
├── model.js                    # Legacy model constants (EMPTY_MODEL, INITIAL_WELL)
└── styles.css                  # Complete design system (~1200 lines)
```

### 1.2 Key Architectural Patterns

| Pattern | Implementation |
|---------|----------------|
| **State Management** | React Context (`ProjectContext`) + local component state (`useState`) |
| **Data Persistence** | localStorage (structured JSON) + IndexedDB (binary files >2MB) |
| **Migration** | Automatic on app load (`initializeStorage()` in `projectStorage.js`) |
| **Autosave** | 1.5s debounce per module (Designer, Geology, Monitoring, Docs) |
| **Validation** | Domain-specific validators returning `{code, message, severity, details}` |
| **Undo/Redo** | History stack (max 50) in Designer only |
| **File Storage** | Base64 in localStorage (<2MB) → IndexedDB (photos/documents stores) |
| **PDF Generation** | Client-side jsPDF with Canvas-to-image fallback |
| **Backup Format** | ZIP (manifest.json + localStorage JSON files + assets/ folder) |

### 1.3 Navigation & Routing
- **Single Page App** with hash-based navigation (`#project/{id}`)
- **13 Navigation Items** in sidebar: Dashboard, Projects, Visualisasi, Desain, Data, Docs, Documentation, Geology, Monitoring, Reports, Data Management, Settings (disabled)
- **Mobile**: Bottom tab bar (4 tabs) + drawer menu

### 1.4 Entry Points & Bootstrap
1. `main.jsx` → `ProjectProvider` → `App`
2. `ProjectContext` `initializeStorage()` runs migration from legacy keys:
   - `wellData` (original)
   - `visualisasi-pipa-sumur-bor:v2` (v2 format)
3. Creates default project "Proyek Default (Migrasi)" if legacy data exists
4. Loads active project/well into context state

---

## 2. DATA MODELS (Current Frontend)

### 2.1 Project (`src/models/project.js`)
```javascript
{
  id: "proj-{timestamp}-{random}",
  projectCode: string (required, unique),
  projectName: string (required),
  clientName: string (required),
  contractorName: string,
  location: string,
  province: string (Indonesia provinces),
  district: string,
  village: string,
  latitude: string (-90 to 90),
  longitude: string (-180 to 180),
  description: string,
  startDate: string (ISO date),
  endDate: string (ISO date),
  status: "planning" | "in_progress" | "completed" | "on_hold" | "archived",
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp,
  archivedAt: ISO timestamp | null,
  wells: string[] // array of well IDs
}
```

### 2.2 Well (`src/models/project.js`)
```javascript
{
  id: "well-{timestamp}-{random}",
  projectId: string (FK → Project.id),
  wellCode: string (required, unique per project),
  wellName: string (required),
  wellType: "production" | "monitoring" | "exploration" | "test" | "other",
  location: string,
  latitude: string,
  longitude: string,
  plannedDepth: string (numeric),
  actualDepth: string (numeric),
  drillingDate: string (ISO date),
  completionDate: string (ISO date),
  status: "planned" | "drilling" | "completed" | "on_hold" | "abandoned",
  description: string,
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp,
  // Legacy well data fields (stored in well storage):
  companyName, shallowWellNumber, address, province, city, district, village,
  elevation, boreholeDate, wellNumber, piezoDistance, pumpType, pumpPosition,
  boreholeImages: { borehole1-5: dataUrl }
}
```

### 2.3 Well Data Storage Key: `borewell-well-{wellId}:v1`
```javascript
{
  well: { ...wellRecord, ...legacyFields },
  model: {
    pipes: [{ id, start, end, depth, diameter }],
    screens: [{ id, depth, size }],
    ground: number | null,
    mat: number | null,
    openHole: { start, end, size } | null,
    geologicalLog: { version, layers: [...] },      // Phase 4
    groundwaterMonitoring: { version, measurements: [...] }, // Phase 5
    designer: { version, components: [...], config: {...} }  // Phase 3
  },
  activity: { doc1-doc6: [{ id, name, dataUrl, createdAt }] } // Legacy docs
}
```

### 2.4 Designer Components (`src/designer/model.js`)
```javascript
{
  id: "comp-{timestamp}-{random}",
  type: "surface_casing" | "production_casing" | "blank_casing" | 
        "screen_pipe" | "open_hole" | "gravel_pack" | "cement_grouting" |
        "well_cap" | "submersible_pump" | "pump_position" | "water_level_marker",
  name: string,
  startDepth: number,
  endDepth: number (interval types) | 0 (marker types),
  length: number (computed),
  outerDiameter: number | null,
  innerDiameter: number | null,
  material: string,
  color: string (hex),
  description: string,
  visible: boolean,
  zOrder: number
}
```

### 2.5 Geological Layers (`src/geology/model.js`)
```javascript
{
  id: "geo-{timestamp}-{random}",
  name: string,
  material: "topsoil" | "clay" | "siltyClay" | "silt" | "sandySilt" | 
            "fineSand" | "mediumSand" | "coarseSand" | "gravel" | "sandyGravel" |
            "sandstone" | "limestone" | "shale" | "mudstone" | "granite" | 
            "basalt" | "conglomerate" | "weatheredRock" | "fracturedRock" | 
            "fillMaterial" | "unknownMaterial",
  startDepth: number,
  endDepth: number,
  description: string,
  formation: string,
  notes: string,
  color: string (hex),
  pattern: string
}
```

### 2.6 Groundwater Measurements (`src/monitoring/model.js`)
```javascript
{
  id: "mon-{timestamp}-{random}",
  measuredAt: ISO timestamp,
  waterLevelDepth: number,
  referencePoint: "top_of_casing" | "ground_level" | "custom",
  referenceElevation: number | null,
  method: "electric_water_level_meter" | "manual_water_level_meter" | 
          "pressure_transducer" | "automatic_data_logger" | "other",
  status: "valid" | "invalid",
  notes: string,
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp
}
```

### 2.7 Documentation (Photos/Documents) (`src/documentation/model.js`)
```javascript
// Photo
{
  id: "photo-{timestamp}-{random}",
  version: 1,
  projectId: string,
  wellId: string,
  name: string,
  category: "site_condition" | "drilling_process" | "drilling_equipment" |
            "well_construction" | "casing_installation" | "pump_installation" |
            "groundwater_measurement" | "geological_sample" | "completion" | "other",
  description: string,
  documentedAt: ISO timestamp,
  fileRef: string (dataUrl or "indexeddb:photo:{id}"),
  fileName: string,
  fileType: "image/jpeg" | "image/png" | "image/webp",
  fileSize: number,
  width: number,
  height: number,
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp
}

// Document
{
  id: "doc-{timestamp}-{random}",
  version: 1,
  projectId: string,
  wellId: string (empty for project-level),
  title: string,
  category: "permit" | "contract" | "technical_spec" | "test_result" |
            "daily_report" | "as_built" | "certification" | "correspondence" |
            "manual" | "other",
  description: string,
  documentDate: ISO timestamp,
  fileRef: string,
  fileName: string,
  fileType: "application/pdf" | "image/*" | "text/plain",
  fileSize: number,
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp
}
```

### 2.8 Backup Manifest (`src/storage/backupStorage.js`)
```javascript
{
  format: "borewell-engineering-backup",
  version: 1,
  createdAt: ISO timestamp,
  appVersion: string,
  projects: Project[],
  wells: [{ well, model, activity }],
  documentation: {
    project: [{ projectId, photos[], documents[] }],
    well: [{ wellId, photos[], documents[] }]
  },
  storageManifest: {
    localStorage: string[],
    indexedDB: [{ id, store, fileName, fileSize }]
  }
}
```

---

## 3. STORAGE KEYS INVENTORY

| Key Pattern | Purpose | Contains |
|-------------|---------|----------|
| `borewell-projects:v1` | Project list + active IDs | `{ projects[], activeProjectId, activeWellId }` |
| `borewell-project-{id}:v1` | Individual project record | Project object |
| `borewell-well-{id}:v1` | Well data (well + model + activity) | Complete well state |
| `borewell-project-docs:v1` | Project-level documentation | `{ [projectId]: { photos[], documents[] } }` |
| `borewell-well-docs-{wellId}:v1` | Well-level documentation | `{ photos[], documents[] }` |
| `borewell-migration:v1` | Migration flag | `"completed"` |
| `borewell-safety-backup:v1` | Pre-restore safety backup | Full manifest (localStorage only) |
| `borewell-backup-history:v1` | Local backup history | Array of { filename, size, createdAt, counts } |
| `wellData` (legacy) | Original v1 storage | Legacy well object |
| `visualisasi-pipa-sumur-bor:v2` (legacy) | v2 format | Legacy well + model + activity |
| `*.backup` (legacy) | Migration backups | Copies of legacy keys |

**IndexedDB**: `BorewellDocsDB` v1
- Store `photos`: `{ id, dataUrl, fileName, fileType, fileSize, createdAt }`
- Store `documents`: `{ id, dataUrl, fileName, fileType, fileSize, createdAt }`

---

## 4. FRONTEND MODULES & API DEPENDENCIES

| Module | Current Storage Calls | Backend API Needed |
|--------|----------------------|-------------------|
| **Auth** | — | Register, Login, Logout, Refresh, Me, Approval |
| **Projects** | getAllProjects, createProjectRecord, updateProjectRecord, deleteProjectRecord, archiveProjectRecord, restoreProjectRecord, duplicateProjectRecord, getProjectById, getWellsForProject, selectProject | CRUD + list with pagination/filter/sort |
| **Wells** | createWellRecord, updateWellRecord, deleteWellRecord, duplicateWellRecord, getWellData, getWellsForProject, selectWell | CRUD per project + list |
| **Designer** | saveActiveWellData (model.designer), loadActiveWellData | CRUD designer state per well |
| **Geology** | saveActiveWellData (model.geologicalLog), loadActiveWellData | CRUD geology per well |
| **Monitoring** | saveActiveWellData (model.groundwaterMonitoring), loadActiveWellData | CRUD measurements per well |
| **Documentation** | getWellDocumentation, saveWellDocumentation, addWellPhoto, addWellDocument, updatePhoto, updateDocument, deletePhoto, deleteDocument, storeLargeFile, retrieveFile, migrateWellDocumentation | CRUD photos/docs per well/project, file upload/download |
| **Reports** | downloadBoreholePdf (client-side) | Keep client-side PDF; optionally server-side generation |
| **Data Management** | createFullBackup, restoreFromBackup, export/import, checkDataIntegrity, getStorageHealth, auditStorage | Backup/restore via API, health via DB stats |

---

## 5. PROPOSED BACKEND ARCHITECTURE

### 5.1 Go Project Structure
```
backend/
├── cmd/
│   ├── server/           # Main HTTP server entry point
│   ├── migrate/          # Goose migration runner
│   └── bootstrap-admin/  # CLI to create first admin
├── internal/
│   ├── config/           # Environment config (viper)
│   ├── database/         # pgxpool connection, health check
│   ├── middleware/       # RequestID, Logger, CORS, Auth, RateLimit, Recovery
│   ├── model/            # Domain models (User, Project, Well, etc.)
│   ├── repository/       # Data access layer (SQL queries)
│   ├── service/          # Business logic, ownership verification
│   ├── handler/          # HTTP handlers (Gin)
│   ├── router/           # Route registration, middleware chains
│   └── auth/             # JWT, Argon2id, Session management
├── migrations/           # Goose SQL migrations (up/down)
├── Dockerfile
├── docker-compose.yml    # PostgreSQL + pgAdmin (optional)
├── .env.example
├── go.mod / go.sum
└── README.md
```

### 5.2 Technology Choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Language** | Go 1.22+ | Performance, stdlib, single binary |
| **HTTP Framework** | Gin | Fast, minimal, middleware ecosystem |
| **Database Driver** | pgx/v5 (pgxpool) | Native, performant, prepared statements |
| **Migrations** | Goose | Versioned, up/down, CLI + library |
| **Password Hash** | Argon2id (golang.org/x/crypto) | Memory-hard, recommended |
| **Access Token** | JWT (HS256, 15min) | Stateless, short-lived |
| **Refresh Token** | Opaque token + SHA-256 hash in DB, HttpOnly cookie | Rotation, revocation, secure storage |
| **Config** | Viper (env + .env) | 12-factor app |
| **Logging** | slog (stdlib) + request-id | Structured, correlated |
| **Validation** | go-playground/validator/v10 | Struct tags |
| **File Upload** | multipart/form-data, local filesystem | UUID names, metadata in DB |
| **CORS** | gin-contrib/cors | Strict origin allowlist |

---

## 6. AUTHENTICATION & AUTHORIZATION DESIGN

### 6.1 User Model
```go
type User struct {
    ID           uuid.UUID `db:"id"`
    Email        string    `db:"email"`        // unique, normalized lower
    PasswordHash string    `db:"password_hash"` // Argon2id
    FullName     string    `db:"full_name"`
    Role         string    `db:"role"`         // "admin" | "user"
    Status       string    `db:"status"`       // "pending" | "approved" | "rejected" | "suspended"
    CreatedAt    time.Time `db:"created_at"`
    UpdatedAt    time.Time `db:"updated_at"`
    ApprovedAt   *time.Time `db:"approved_at"`
    ApprovedBy   *uuid.UUID `db:"approved_by"`
    RejectionReason *string `db:"rejection_reason"`
}
```

### 6.2 Session / Refresh Token
```go
type RefreshSession struct {
    ID        uuid.UUID `db:"id"`
    UserID    uuid.UUID `db:"user_id"`
    TokenHash string    `db:"token_hash"`  // SHA-256 of opaque token
    UserAgent string    `db:"user_agent"`
    IP        string    `db:"ip"`
    ExpiresAt time.Time `db:"expires_at"`  // 30 days
    RevokedAt *time.Time `db:"revoked_at"`
    CreatedAt time.Time `db:"created_at"`
}
```

### 6.3 Token Flow
1. **Login** → Verify Argon2id → Issue JWT (15min) + Refresh Token (opaque, 30 days)
2. **Refresh Token** stored as SHA-256 hash in `refresh_sessions` + HttpOnly cookie
3. **Access Token** in memory (React state), sent as `Authorization: Bearer <jwt>`
4. **Refresh** → POST `/auth/refresh` with cookie → Verify hash, rotate token, issue new JWT + new refresh cookie
5. **Logout** → Revoke session (set `revoked_at`), clear cookie
6. **Middleware** validates JWT → extracts `user_id`, `role` → attaches to context

### 6.4 Role & Status Gates
| Action | Required |
|--------|----------|
| Register | Public (creates `status=pending`) |
| Login | `status=approved` only |
| Access app modules | `status=approved` + valid JWT |
| Admin approval dashboard | `role=admin` |
| Approve/Reject/Suspend user | `role=admin` |
| Bootstrap admin CLI | No existing admin |

---

## 7. DATA OWNERSHIP & ISOLATION (Critical)

### 7.1 Ownership Chain
```
User (owner_id)
  └── Project (owner_id → User.id)
        └── Well (project_id → Project.id, owner_id via project)
              ├── Designer (well_id)
              ├── GeologicalLog (well_id)
              ├── GroundwaterMonitoring (well_id)
              ├── Documentation (well_id + project_id)
              └── Reports (well_id)
```

### 7.2 Backend Enforcement Rules
- **Every query** joining Project/Well/Module must include `WHERE project.owner_id = $current_user_id`
- **Never trust** `owner_id` / `project_id` / `well_id` from frontend as authorization proof
- **Admin** does NOT automatically see all user data — explicit admin scope required
- **UUIDs are not authorization** — always verify via JOIN

### 7.3 Repository Pattern Example
```go
func (r *WellRepository) GetByIDForUser(ctx context.Context, wellID, userID uuid.UUID) (*Well, error) {
    return r.db.QueryRow(ctx, `
        SELECT w.* FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE w.id = $1 AND p.owner_id = $2
    `, wellID, userID)
}
```

---

## 8. FILE STORAGE STRATEGY

### 8.1 Local Filesystem
- **Root**: `./data/files/` (outside public, outside repo)
- **Structure**: `{type}/{uuid}.{ext}` (e.g., `photos/a1b2c3d4.jpg`, `documents/e5f6g7h8.pdf`)
- **Naming**: UUID v7 (timestamp-ordered) or UUID v4
- **Metadata in PostgreSQL**: `files` table with `id, owner_id, well_id, project_id, original_name, mime_type, size_bytes, storage_path, checksum, created_at`

### 8.2 Upload Flow
1. Frontend → `POST /api/upload` (multipart)
2. Backend validates: MIME, extension, size (photo ≤10MB, doc ≤20MB)
3. Generate UUID, save to filesystem, compute SHA-256
4. Insert `files` row, return `{ id, url: "/api/files/{id}" }`
5. Frontend uses returned ID in photo/document create

### 8.3 Download Flow
1. Frontend → `GET /api/files/{id}`
2. Backend verifies ownership via JOIN
3. `Content-Disposition: attachment; filename="{original_name}"`
4. Stream file (range requests for large files)

---

## 9. FRONTEND-TO-BACKEND MIGRATION STRATEGY

### 9.1 Adapter Layer
Create `src/api/client.js` — centralized API client with:
- Base URL from `import.meta.env.VITE_API_BASE` (default `/api` via Vite proxy)
- Automatic JWT attachment from memory
- Automatic refresh on 401 (once)
- Typed response wrappers: `{ data, error, meta }`

### 9.2 Feature Flags / Dual-Write Period
| Module | Primary Source | Fallback | Migration Order |
|--------|---------------|----------|-----------------|
| Auth | **API** | — | FS2 (first) |
| Projects | **API** | localStorage | FS3 |
| Wells | **API** | localStorage | FS3 |
| Designer | localStorage | — | FS4 |
| Geology | localStorage | — | FS4 |
| Monitoring | localStorage | — | FS4 |
| Documentation | localStorage + IndexedDB | — | FS5 |
| Reports | Client PDF | — | FS5 (keep client) |
| Backup/Restore | **API** | localStorage | FS6 |
| Legacy Migration | **API** (import endpoint) | — | FS7 |

### 9.3 Protected Route Wrapper
```jsx
// src/components/ProtectedRoute.jsx
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== 'approved') return <Navigate to="/pending" replace />;
  return children;
}
```

---

## 10. DEVELOPMENT ENVIRONMENT

### 10.1 Ports
| Service | Port |
|---------|------|
| Vite Dev Server | 5173 (configurable) |
| Go Backend | 8080 |
| PostgreSQL | 5432 (Docker) |
| pgAdmin (optional) | 5050 |

### 10.2 Vite Proxy (`vite.config.js`)
```js
server: {
  proxy: {
    '/api': { target: 'http://localhost:8080', changeOrigin: true },
    '/auth': { target: 'http://localhost:8080', changeOrigin: true },
  }
}
```

### 10.3 Cookie Configuration (localhost)
- `SameSite: Lax` (allows navigation from login page)
- `Secure: false` (localhost HTTP)
- `HttpOnly: true`
- `Path: /`
- `Domain: localhost` (not wildcard)

---

## 11. RISK ASSESSMENT & MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Medium | Critical | FS7: preview, backup, idempotent import, rollback plan |
| Auth bypass via frontend | Low | Critical | All authorization in backend, never trust frontend IDs |
| File upload DoS | Medium | High | Size limits, MIME validation, streaming upload, rate limit |
| localStorage quota exceeded | Medium | Medium | IndexedDB for large files, storage health monitor, warnings |
| Backup/restore corruption | Low | Critical | Manifest validation, safety backup, rollback, integrity checks |
| Session fixation | Low | High | Rotate refresh token on login, HTTPS in prod |
| SQL injection | Low | Critical | pgx prepared statements only, no string interpolation |

---

## 12. DECISION LOG (FS0)

| ID | Decision | Rationale |
|----|----------|-----------|
| D001 | Keep client-side PDF generation | Complex Canvas rendering, jsPDF already working, no server benefit |
| D002 | Argon2id over bcrypt | Memory-hard, future-proof, Go stdlib support |
| D003 | JWT (15min) + HttpOnly refresh cookie (30d) | Balance security (short access) + UX (no re-login) |
| D004 | UUID v7 for file names | Timestamp-ordered, no collision, sortable |
| D005 | pgx over GORM | Performance, explicit SQL, migration compatibility |
| D006 | Goose over golang-migrate | Pure SQL, up/down, CLI + embed support |
| D007 | No soft delete | Simplicity; archive status sufficient |
| D008 | Admin cannot auto-see user data | Privacy, compliance, least privilege |
| D009 | Vite proxy for `/api` | Avoid CORS complexity in dev, same-origin cookies |
| D010 | Dual-write during migration | Zero-downtime, rollback capability, incremental cutover |

---

## 13. NEXT STEPS (FS1)

1. Scaffold Go project structure
2. Implement `config`, `database`, `middleware` packages
3. Create Goose migrations for: `users`, `refresh_sessions`, `projects`, `wells`
4. Implement health endpoint, graceful shutdown, structured logging
5. Docker Compose for PostgreSQL
6. `.env.example` with all required variables
7. Backend README with setup instructions