# DATABASE_SCHEMA_DESIGN.md
# Borewell Engineering Visualizer v2.0.0 — PostgreSQL Schema Design

**Status**: FS0 Audit Complete
**Date**: 2026-11-03
**Target**: PostgreSQL 16+
**Migration Tool**: Goose (SQL up/down)

---

## 1. DESIGN PRINCIPLES

1. **Explicit Ownership**: Every data table links to `users` via `owner_id` (direct or transitive)
2. **UUID Primary Keys**: `uuid_generate_v4()` (pgcrypto) or `gen_random_uuid()`
3. **Timestamps**: `created_at`, `updated_at` on all tables; `deleted_at` for soft delete if needed
4. **Foreign Keys**: `ON DELETE CASCADE` for owned children, `ON DELETE RESTRICT` for references
5. **Indexes**: On all FKs, common query columns, unique constraints
6. **JSONB for Flexible Schemas**: Designer components, Geology config, Monitoring config
7. **No ORM**: Raw SQL via pgx, Goose migrations are source of truth

---

## 2. ENTITY RELATIONSHIP DIAGRAM

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │       │  projects   │       │    wells    │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │◄──────│ owner_id    │       │ id (PK)     │
│ email (UQ)  │       │ id (PK)     │◄──────│ project_id  │
│ password_hash│       │ project_code(UQ)│     │ well_code(UQ per project)│
│ full_name   │       │ project_name    │     │ well_name   │
│ role        │       │ client_name     │     │ well_type   │
│ status      │       │ contractor_name │     │ location    │
│ created_at  │       │ location        │     │ latitude    │
│ updated_at  │       │ province        │     │ longitude   │
└─────────────┘       │ district        │     │ planned_depth│
                      │ village         │     │ actual_depth │
                      │ latitude        │     │ drilling_date│
                      │ longitude       │     │ completion_dt│
                      │ description     │     │ status       │
                      │ start_date      │     │ description  │
                      │ end_date        │     │ created_at   │
                      │ status          │     │ updated_at   │
                      │ created_at      │     └──────┬───────┘
                      │ updated_at      │            │
                      │ archived_at     │            ▼
                      └─────────────┘  ┌────────────────────────┐
                                       │   well_modules         │
                                       │  (polymorphic or FK)   │
                                       └────────────────────────┘
```

### Module Tables (per well)
- `designer_states` — JSONB components + config
- `geological_logs` — JSONB layers array
- `groundwater_monitoring` — JSONB measurements array
- `documentation_photos` — metadata + file_id
- `documentation_documents` — metadata + file_id
- `files` — binary file metadata (storage_path, checksum, etc.)

---

## 3. TABLE DEFINITIONS

### 3.1 users
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
    approved_at     TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id),
    rejection_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

### 3.2 refresh_sessions
```sql
CREATE TABLE refresh_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,  -- SHA-256 of opaque token
    user_agent      TEXT,
    ip              INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE INDEX idx_refresh_sessions_token ON refresh_sessions(token_hash);
CREATE INDEX idx_refresh_sessions_expires ON refresh_sessions(expires_at) WHERE revoked_at IS NULL;
```

### 3.3 projects
```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_code    TEXT NOT NULL,
    project_name    TEXT NOT NULL,
    client_name     TEXT NOT NULL,
    contractor_name TEXT,
    location        TEXT,
    province        TEXT,
    district        TEXT,
    village         TEXT,
    latitude        TEXT,
    longitude       TEXT,
    description     TEXT,
    start_date      DATE,
    end_date        DATE,
    status          TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','in_progress','completed','on_hold','archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_projects_owner_code ON projects(owner_id, project_code);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);
```

### 3.4 wells
```sql
CREATE TABLE wells (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    well_code           TEXT NOT NULL,
    well_name           TEXT NOT NULL,
    well_type           TEXT NOT NULL DEFAULT 'production' CHECK (well_type IN ('production','monitoring','exploration','test','other')),
    location            TEXT,
    latitude            TEXT,
    longitude           TEXT,
    planned_depth       NUMERIC(10,2),
    actual_depth        NUMERIC(10,2),
    drilling_date       DATE,
    completion_date     DATE,
    status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','drilling','completed','on_hold','abandoned')),
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_wells_project_code ON wells(project_id, well_code);
CREATE INDEX idx_wells_project ON wells(project_id);
CREATE INDEX idx_wells_status ON wells(status);
CREATE INDEX idx_wells_updated ON wells(updated_at DESC);

-- Trigger to update project.updated_at when well changes
CREATE OR REPLACE FUNCTION update_project_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE projects SET updated_at = now() WHERE id = NEW.project_id;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_well_update_project
    AFTER INSERT OR UPDATE OR DELETE ON wells
    FOR EACH ROW EXECUTE FUNCTION update_project_timestamp();
```

### 3.5 designer_states (Phase 3)
```sql
CREATE TABLE designer_states (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    well_id         UUID NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL DEFAULT 1,
    components      JSONB NOT NULL DEFAULT '[]',  -- Array of component objects
    config          JSONB NOT NULL DEFAULT '{}',  -- { totalWellDepth, groundLevel, matLevel }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (well_id)  -- One designer state per well
);

CREATE INDEX idx_designer_well ON designer_states(well_id);
```

**Component JSON Structure**:
```json
{
  "id": "comp-...",
  "type": "surface_casing",
  "name": "Casing Permukaan",
  "startDepth": 0,
  "endDepth": 20,
  "length": 20,
  "outerDiameter": 200,
  "innerDiameter": 180,
  "material": "PVC",
  "color": "#475569",
  "description": "",
  "visible": true,
  "zOrder": 0
}
```

### 3.6 geological_logs (Phase 4)
```sql
CREATE TABLE geological_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    well_id         UUID NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL DEFAULT 1,
    layers          JSONB NOT NULL DEFAULT '[]',  -- Array of layer objects
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (well_id)
);

CREATE INDEX idx_geology_well ON geological_logs(well_id);
```

**Layer JSON Structure**:
```json
{
  "id": "geo-...",
  "name": "Clay",
  "material": "clay",
  "startDepth": 0,
  "endDepth": 5.5,
  "description": "Lempung lunak",
  "formation": "Alluvium",
  "notes": "",
  "color": "#b45309",
  "pattern": "clay"
}
```

### 3.7 groundwater_monitoring (Phase 5)
```sql
CREATE TABLE groundwater_monitoring (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    well_id             UUID NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
    version             INTEGER NOT NULL DEFAULT 1,
    measurements        JSONB NOT NULL DEFAULT '[]',  -- Array of measurement objects
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (well_id)
);

CREATE INDEX idx_monitoring_well ON groundwater_monitoring(well_id);
```

**Measurement JSON Structure**:
```json
{
  "id": "mon-...",
  "measuredAt": "2024-01-15T10:30:00Z",
  "waterLevelDepth": 12.35,
  "referencePoint": "top_of_casing",
  "referenceElevation": 25.5,
  "method": "electric_water_level_meter",
  "status": "valid",
  "notes": "",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### 3.8 files (Binary File Metadata)
```sql
CREATE TABLE files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    well_id         UUID REFERENCES wells(id) ON DELETE SET NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    storage_path    TEXT NOT NULL UNIQUE,  -- Relative to files root
    checksum_sha256 CHAR(64) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_owner ON files(owner_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_well ON files(well_id);
CREATE INDEX idx_files_checksum ON files(checksum_sha256);
```

### 3.9 documentation_photos (Phase 6)
```sql
CREATE TABLE documentation_photos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    well_id             UUID REFERENCES wells(id) ON DELETE CASCADE,
    file_id             UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    name                TEXT NOT NULL,
    category            TEXT NOT NULL CHECK (category IN (
        'site_condition','drilling_process','drilling_equipment',
        'well_construction','casing_installation','pump_installation',
        'groundwater_measurement','geological_sample','completion','other'
    )),
    description         TEXT,
    documented_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    width               INTEGER,
    height              INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photos_project ON documentation_photos(project_id);
CREATE INDEX idx_photos_well ON documentation_photos(well_id);
CREATE INDEX idx_photos_category ON documentation_photos(category);
CREATE INDEX idx_photos_documented ON documentation_photos(documented_at DESC);
```

### 3.10 documentation_documents (Phase 6)
```sql
CREATE TABLE documentation_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    well_id             UUID REFERENCES wells(id) ON DELETE CASCADE,
    file_id             UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    title               TEXT NOT NULL,
    category            TEXT NOT NULL CHECK (category IN (
        'permit','contract','technical_spec','test_result',
        'daily_report','as_built','certification','correspondence',
        'manual','other'
    )),
    description         TEXT,
    document_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_docs_project ON documentation_documents(project_id);
CREATE INDEX idx_docs_well ON documentation_documents(well_id);
CREATE INDEX idx_docs_category ON documentation_documents(category);
CREATE INDEX idx_docs_document_date ON documentation_documents(document_date DESC);
```

### 3.11 activity_logs (Audit Trail)
```sql
CREATE TABLE activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,  -- e.g., 'project.create', 'well.update', 'auth.login'
    entity_type     TEXT,           -- 'project', 'well', 'designer', 'geology', 'monitoring', 'photo', 'document'
    entity_id       UUID,
    metadata        JSONB,
    ip              INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_action ON activity_logs(action);
```

### 3.12 backup_manifests (Backup History)
```sql
CREATE TABLE backup_manifests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename            TEXT NOT NULL,
    size_bytes          BIGINT NOT NULL,
    format              TEXT NOT NULL DEFAULT 'borewell-engineering-backup',
    version             INTEGER NOT NULL DEFAULT 1,
    project_count       INTEGER NOT NULL DEFAULT 0,
    well_count          INTEGER NOT NULL DEFAULT 0,
    photo_count         INTEGER NOT NULL DEFAULT 0,
    document_count      INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_owner ON backup_manifests(owner_id);
CREATE INDEX idx_backup_created ON backup_manifests(created_at DESC);
```

---

## 4. JSONB SCHEMA VALIDATION (PostgreSQL 12+)

### 4.1 Designer Components Check Constraint
```sql
ALTER TABLE designer_states ADD CONSTRAINT chk_designer_components
CHECK (
    jsonb_typeof(components) = 'array' AND
    components @? '$.? (@.id && @.type && @.startDepth && @.name)'
);
```

### 4.2 Geological Layers Check Constraint
```sql
ALTER TABLE geological_logs ADD CONSTRAINT chk_geology_layers
CHECK (
    jsonb_typeof(layers) = 'array' AND
    layers @? '$.? (@.id && @.material && @.startDepth && @.endDepth && @.name)'
);
```

### 4.3 Monitoring Measurements Check Constraint
```sql
ALTER TABLE groundwater_monitoring ADD CONSTRAINT chk_monitoring_measurements
CHECK (
    jsonb_typeof(measurements) = 'array' AND
    measurements @? '$.? (@.id && @.measuredAt && @.waterLevelDepth && @.referencePoint && @.method)'
);
```

---

## 5. ROW LEVEL SECURITY (RLS) — Alternative to Application-Level Checks

> **Note**: Primary enforcement is in Go repository layer (see FULLSTACK_ARCHITECTURE.md §7). RLS is defense-in-depth.

```sql
-- Enable RLS on all user-owned tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE wells ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE geological_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE groundwater_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their own projects
CREATE POLICY projects_owner ON projects
    USING (owner_id = current_setting('app.current_user_id')::uuid);

-- Policy: wells via project ownership
CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid));

-- Similar policies for all module tables...
```

**Application sets**: `SET LOCAL app.current_user_id = '...'` at start of each request.

---

## 6. MIGRATION SEQUENCE (Goose)

| Migration | Description | Tables |
|-----------|-------------|--------|
| `001_init_users.sql` | Users, refresh_sessions, activity_logs | users, refresh_sessions, activity_logs |
| `002_init_projects.sql` | Projects, wells | projects, wells |
| `003_init_modules.sql` | Designer, geology, monitoring | designer_states, geological_logs, groundwater_monitoring |
| `004_init_files.sql` | Files, documentation | files, documentation_photos, documentation_documents |
| `005_init_backups.sql` | Backup manifests | backup_manifests |
| `006_rls_policies.sql` | Row Level Security | (policies only) |
| `007_indexes.sql` | Additional composite indexes | (indexes only) |
| `008_triggers.sql` | Updated_at triggers | (functions + triggers) |

Each migration has `up.sql` and `down.sql`.

---

## 7. QUERY PATTERNS & INDEXES

### 7.1 Common Queries Requiring Indexes

| Query | Index |
|-------|-------|
| `SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC` | `(owner_id, updated_at DESC)` |
| `SELECT * FROM wells WHERE project_id = ?` | `(project_id)` |
| `SELECT * FROM wells WHERE project_id = ? AND well_code = ?` | `(project_id, well_code)` UNIQUE |
| `SELECT * FROM documentation_photos WHERE well_id = ? ORDER BY documented_at DESC` | `(well_id, documented_at DESC)` |
| `SELECT * FROM files WHERE owner_id = ?` | `(owner_id)` |
| `SELECT * FROM backup_manifests WHERE owner_id = ? ORDER BY created_at DESC` | `(owner_id, created_at DESC)` |

### 7.2 Composite Indexes (Migration 007)
```sql
CREATE INDEX idx_projects_owner_updated ON projects(owner_id, updated_at DESC);
CREATE INDEX idx_wells_project_status ON wells(project_id, status);
CREATE INDEX idx_photos_well_documented ON documentation_photos(well_id, documented_at DESC);
CREATE INDEX idx_docs_well_date ON documentation_documents(well_id, document_date DESC);
CREATE INDEX idx_files_owner_created ON files(owner_id, created_at DESC);
CREATE INDEX idx_activity_user_created ON activity_logs(user_id, created_at DESC);
```

---

## 8. DATA TYPES MAPPING (Frontend → PostgreSQL)

| Frontend Field | PostgreSQL Type | Notes |
|----------------|-----------------|-------|
| `id` (string) | `UUID` | gen_random_uuid() |
| `email` | `CITEXT` | Case-insensitive unique |
| `password_hash` | `TEXT` | Argon2id output |
| `role/status` | `TEXT` + `CHECK` | Enum-like |
| `latitude/longitude` | `TEXT` | Keep as string (frontend validates) |
| `planned_depth` | `NUMERIC(10,2)` | Meters, 2 decimals |
| `dates` | `DATE` or `TIMESTAMPTZ` | ISO 8601 |
| `boreholeImages` | → `files` + `documentation_photos` | Migrated |
| `model.pipes/screens` | → `designer_states.components` (legacy) or keep JSONB | Designer replaces |
| `model.geologicalLog` | `geological_logs.layers` JSONB | |
| `model.groundwaterMonitoring` | `groundwater_monitoring.measurements` JSONB | |
| `activity.doc1-6` | → `documentation_photos` (migrated) | |
| `photos.documents` | `documentation_photos` + `documentation_documents` | |
| `fileRef` (dataUrl/indexeddb) | `files.storage_path` + `file_id` FK | |

---

## 9. TRIGGERS FOR UPDATED_AT

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wells_updated BEFORE UPDATE ON wells FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_designer_updated BEFORE UPDATE ON designer_states FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_geology_updated BEFORE UPDATE ON geological_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_monitoring_updated BEFORE UPDATE ON groundwater_monitoring FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_photos_updated BEFORE UPDATE ON documentation_photos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON documentation_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 10. SEED DATA (Development Only)

```sql
-- Migration 099_seed_dev.sql (run only in dev)
-- Creates: 1 admin, 1 user, 2 projects, 3 wells, sample modules
-- Password: 'devpassword123' (Argon2id hashed)
-- DO NOT RUN IN PRODUCTION
```

---

## 11. BACKUP/RESTORE CONSIDERATIONS

- `pg_dump --format=custom --no-owner --no-privileges` for full DB backup
- Application-level backup (ZIP) includes manifest + JSON + file references
- Restore via API validates ownership before writing
- `backup_manifests` table tracks application-level backups

---

## 12. DECISION LOG

| ID | Decision | Rationale |
|----|----------|-----------|
| DB001 | JSONB for Designer/Geology/Monitoring | Flexible schema, matches frontend structure, queryable |
| DB002 | Separate `files` table | Deduplication, checksums, metadata, shared between photos/docs |
| DB003 | `CITEXT` for email | Case-insensitive unique without lower() calls |
| DB004 | `INET` for IP addresses | Native type, validation, CIDR ops |
| DB005 | No soft delete | Archive status sufficient; simpler queries |
| DB006 | RLS as defense-in-depth | Primary enforcement in Go; RLS catches bugs |
| DB007 | `NUMERIC(10,2)` for depths | Precision for engineering data, avoids float issues |
| DB008 | UUID v4 (gen_random_uuid) | Standard, no timestamp leakage |
| DB009 | Composite unique `(project_id, well_code)` | Business rule: unique code per project |
| DB010 | Trigger updates `projects.updated_at` on well change | Dashboard "recent" accuracy |