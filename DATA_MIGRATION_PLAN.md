# DATA_MIGRATION_PLAN.md
# Borewell Engineering Visualizer v2.0.0 — Legacy Data Migration Plan

**Status**: FS0 Audit Complete
**Date**: 2026-11-03
**Source**: Frontend localStorage + IndexedDB (single-user, no auth)
**Target**: PostgreSQL (multi-user, auth, ownership)

---

## 1. MIGRATION SCOPE

### 1.1 Source Data (Current Frontend)

| Storage | Keys | Description |
|---------|------|-------------|
| localStorage | `borewell-projects:v1` | Project list + active IDs |
| localStorage | `borewell-project-{id}:v1` | Individual project records |
| localStorage | `borewell-well-{id}:v1` | Well data (well + model + activity) |
| localStorage | `borewell-project-docs:v1` | Project-level photos/documents |
| localStorage | `borewell-well-docs-{wellId}:v1` | Well-level photos/documents |
| localStorage | `borewell-backup-history:v1` | Local backup history (max 50) |
| localStorage | `borewell-safety-backup:v1` | Pre-restore safety backup |
| localStorage | `borewell-migration:v1` | Migration completion flag |
| IndexedDB | `BorewellDocsDB` / `photos` | Binary photo files (>2MB) |
| IndexedDB | `BorewellDocsDB` / `documents` | Binary document files (>2MB) |
| Legacy | `wellData` | Original v1 format (backed up as `.backup`) |
| Legacy | `visualisasi-pipa-sumur-bor:v2` | v2 format (backed up as `.backup`) |

### 1.2 Target Data (PostgreSQL)

All tables defined in `DATABASE_SCHEMA_DESIGN.md`:
- `users` (new — created via registration or bootstrap)
- `projects`, `wells`
- `designer_states`, `geological_logs`, `groundwater_monitoring`
- `files`, `documentation_photos`, `documentation_documents`
- `activity_logs`, `backup_manifests`, `refresh_sessions`

---

## 2. MIGRATION STRATEGY

### 2.1 Approach: User-Triggered Import (FS7)

**NOT automatic**. Migration happens when:
1. User registers → gets approved → logs in
2. User navigates to "Data Management" → "Legacy Migration"
3. User selects "Import from Browser Storage"
4. System scans localStorage/IndexedDB, presents preview
5. User confirms → import runs with transaction safety

### 2.2 Ownership Mapping

Since legacy data has **no user concept**, migration requires explicit owner selection:

```
┌─────────────────────────────────────────────────────────────┐
│  LEGACY MIGRATION WIZARD                                     │
├─────────────────────────────────────────────────────────────┤
│  Step 1: Detect legacy data ✓                               │
│  Step 2: Select target account:                              │
│    ○ Current logged-in user (default)                        │
│    ○ Create new "Legacy Import" user                         │
│  Step 3: Preview data to import                              │
│  Step 4: Confirm & import                                    │
└─────────────────────────────────────────────────────────────┘
```

**Rule**: Legacy data imports to **one user only**. No auto-sharing.

---

## 3. DATA MAPPING SPECIFICATIONS

### 3.1 Users (New)
- Created via registration (FS2) or bootstrap-admin CLI (FS1)
- Legacy data imports **after** user exists

### 3.2 Projects → `projects`
| Legacy Field | Target Column | Transform |
|--------------|---------------|-----------|
| `id` | `id` | Keep UUID |
| `projectCode` | `project_code` | Direct |
| `projectName` | `project_name` | Direct |
| `clientName` | `client_name` | Direct |
| `contractorName` | `contractor_name` | Direct |
| `location` | `location` | Direct |
| `province` | `province` | Direct |
| `district` | `district` | Direct |
| `village` | `village` | Direct |
| `latitude` | `latitude` | Direct |
| `longitude` | `longitude` | Direct |
| `description` | `description` | Direct |
| `startDate` | `start_date` | Parse ISO date |
| `endDate` | `end_date` | Parse ISO date |
| `status` | `status` | Validate enum |
| `createdAt` | `created_at` | Parse ISO timestamp |
| `updatedAt` | `updated_at` | Parse ISO timestamp |
| `archivedAt` | `archived_at` | Parse or NULL |
| `owner_id` | `owner_id` | **Selected user** |

### 3.3 Wells → `wells`
| Legacy Field | Target Column | Transform |
|--------------|---------------|-----------|
| `well.id` | `id` | Keep UUID |
| `well.projectId` | `project_id` | FK → migrated project |
| `well.wellCode` | `well_code` | Direct |
| `well.wellName` | `well_name` | Direct |
| `well.wellType` | `well_type` | Validate enum |
| `well.location` | `location` | Direct |
| `well.latitude` | `latitude` | Direct |
| `well.longitude` | `longitude` | Direct |
| `well.plannedDepth` | `planned_depth` | Parse numeric |
| `well.actualDepth` | `actual_depth` | Parse numeric |
| `well.drillingDate` | `drilling_date` | Parse ISO date |
| `well.completionDate` | `completion_date` | Parse ISO date |
| `well.status` | `status` | Validate enum |
| `well.description` | `description` | Direct |
| `well.createdAt` | `created_at` | Parse ISO timestamp |
| `well.updatedAt` | `updated_at` | Parse ISO timestamp |

**Legacy well data fields** (from `model.well` in storage):
- `companyName`, `shallowWellNumber`, `address`, `province`, `city`, `district`, `village`
- `elevation`, `boreholeDate`, `wellNumber`, `piezoDistance`, `pumpType`, `pumpPosition`
- `boreholeImages` (5 positions) → migrate to `documentation_photos` with category `well_construction`

### 3.4 Designer → `designer_states`
| Legacy Path | Target | Transform |
|-------------|--------|-----------|
| `model.designer.components[]` | `components` (JSONB) | Direct (already normalized) |
| `model.designer.config` | `config` (JSONB) | Direct |
| `model.designer.version` | `version` | Default 1 |

**Note**: Legacy pipes/screens (in `model.pipes`, `model.screens`) are **not** migrated to Designer — they remain as legacy visualization only. Designer is the new canonical model.

### 3.5 Geology → `geological_logs`
| Legacy Path | Target | Transform |
|-------------|--------|-----------|
| `model.geologicalLog.layers[]` | `layers` (JSONB) | Direct (already normalized) |
| `model.geologicalLog.version` | `version` | Default 1 |

### 3.6 Monitoring → `groundwater_monitoring`
| Legacy Path | Target | Transform |
|-------------|--------|-----------|
| `model.groundwaterMonitoring.measurements[]` | `measurements` (JSONB) | Direct (already normalized) |
| `model.groundwaterMonitoring.version` | `version` | Default 1 |

### 3.7 Documentation Photos → `files` + `documentation_photos`
| Legacy Source | Target | Transform |
|---------------|--------|-----------|
| `activity.doc1-6[]` (legacy) | `documentation_photos` | Migrated by `documentationStorage.migrateLegacyActivityImages()` |
| `well.boreholeImages.borehole1-5` | `documentation_photos` (category: `well_construction`) | Each position → named photo |
| `project-docs` / `well-docs` | `documentation_photos` / `documentation_documents` | Already in new format |

**File Storage Migration**:
1. For each photo/document with `fileRef`:
   - If `data:` URL (base64) → decode → save to filesystem → create `files` row
   - If `indexeddb:type:id` → read from IndexedDB → save to filesystem → create `files` row
   - Compute SHA-256 checksum
   - Store relative path in `files.storage_path`
2. Link via `file_id` FK in `documentation_photos` / `documentation_documents`

### 3.8 Backup History → `backup_manifests`
| Legacy Field | Target Column |
|--------------|---------------|
| `filename` | `filename` |
| `size` | `size_bytes` |
| `createdAt` | `created_at` |
| `projectCount` | `project_count` |
| `wellCount` | `well_count` |
| `owner_id` | **Selected user** |

---

## 4. MIGRATION PROCESS FLOW

### 4.1 Phase 1: Detection & Preview (Frontend)
```javascript
// Frontend: DataManagementPage → "Migrate Legacy Data" button
async function detectLegacyData() {
  const keys = Object.keys(localStorage).filter(k => 
    k.startsWith('borewell-') || k === 'wellData' || k === 'visualisasi-pipa-sumur-bor:v2'
  );
  
  // Also check IndexedDB
  const db = await openDB('BorewellDocsDB');
  const photoCount = await countStore(db, 'photos');
  const docCount = await countStore(db, 'documents');
  
  return { localStorageKeys: keys, indexedDB: { photos: photoCount, documents: docCount } };
}
```

### 4.2 Phase 2: Preview API (Backend)
**POST** `/api/v1/migration/preview`

**Request**: `{ "user_id": "uuid" }` (current user)

**Response**:
```json
{
  "data": {
    "projects": [
      { "id": "uuid", "project_code": "PRJ-001", "project_name": "Proyek A", "well_count": 2 }
    ],
    "total_wells": 5,
    "total_photos": 42,
    "total_documents": 18,
    "indexeddb_files": { "photos": 35, "documents": 12 },
    "estimated_size_mb": 156,
    "warnings": [
      "Project code 'PRJ-001' may conflict with existing project"
    ]
  }
}
```

### 4.3 Phase 3: Import Execution (Backend)
**POST** `/api/v1/migration/import`

**Request**: `{ "user_id": "uuid", "options": { "skip_conflicts": true } }`

**Process** (single transaction per project):
```
BEGIN;
  FOR each project:
    INSERT INTO projects (..., owner_id) VALUES (...);
    FOR each well in project:
      INSERT INTO wells (..., project_id) VALUES (...);
      INSERT INTO designer_states (well_id, components, config) ...;
      INSERT INTO geological_logs (well_id, layers) ...;
      INSERT INTO groundwater_monitoring (well_id, measurements) ...;
      FOR each photo:
        Save file to disk → INSERT INTO files ...
        INSERT INTO documentation_photos (..., file_id) ...;
      FOR each document:
        Save file to disk → INSERT INTO files ...
        INSERT INTO documentation_documents (..., file_id) ...;
  INSERT INTO backup_manifests ...;
  INSERT INTO activity_logs (action='migration.import', metadata={...}) ...;
COMMIT;
```

**On Error**: Full rollback, return error details.

---

## 5. CONFLICT RESOLUTION

| Conflict | Detection | Resolution Options |
|----------|-----------|-------------------|
| Project code exists | `UNIQUE (owner_id, project_code)` | Skip / Rename (`-IMPORT`) / Overwrite |
| Well code exists in project | `UNIQUE (project_id, well_code)` | Skip / Rename (`-IMPORT`) |
| File checksum duplicate | `UNIQUE (checksum_sha256)` | Reuse existing file, link new metadata |
| ID collision (unlikely) | `PRIMARY KEY` | Generate new UUID |

**Default**: `skip_conflicts=true` — import only non-conflicting data.

---

## 6. VALIDATION RULES

### 6.1 Pre-Import Checks
- [ ] Target user exists and is `approved`
- [ ] No active import running for user
- [ ] Sufficient disk space (estimate × 2)
- [ ] Database connection healthy

### 6.2 Per-Record Validation
- [ ] Project: required fields, valid status, valid dates
- [ ] Well: required fields, valid type/status, valid project FK
- [ ] Designer: valid component structure, unique IDs
- [ ] Geology: valid layers, start < end, no overlaps (warning)
- [ ] Monitoring: valid measurements, timestamps, reference points
- [ ] Files: valid MIME, size limits, checksum match

### 6.3 Post-Import Verification
- [ ] Count matches: projects, wells, photos, documents
- [ ] All FKs resolve
- [ ] Files exist on disk at `storage_path`
- [ ] Checksums match
- [ ] Activity log entry created

---

## 7. ROLLBACK & RECOVERY

### 7.1 Automatic Rollback
- Single transaction per import → full rollback on any error
- No partial state left in database

### 7.2 Manual Cleanup (if needed)
```sql
-- Delete migrated data for a user
DELETE FROM projects WHERE owner_id = 'user-uuid';
-- Cascades to wells, modules, docs, files
```

### 7.3 Re-import
- Idempotent: re-running with same data + `skip_conflicts=true` → no duplicates
- Checksum-based file dedup prevents re-uploading binaries

---

## 8. FRONTEND MIGRATION UI

### 8.1 DataManagementPage Additions
```jsx
// New tab: "Legacy Migration"
<TabPanel value="migration">
  <MigrationWizard />
</TabPanel>
```

### 8.2 MigrationWizard Steps
1. **Detect** → Scan localStorage/IndexedDB, show summary
2. **Select Owner** → Current user (default) or create "Legacy Import" user
3. **Preview** → Call `/migration/preview`, show table of projects/wells
4. **Options** → Conflict strategy (skip/rename), dry-run toggle
5. **Execute** → Call `/migration/import`, show progress, result
6. **Verify** → Link to project list, show imported counts

---

## 9. LEGACY DATA PRESERVATION

**Critical Rule**: **NEVER delete browser storage during/after migration.**

| Storage | Action |
|---------|--------|
| localStorage keys | Keep all `borewell-*` keys intact |
| IndexedDB | Keep `BorewellDocsDB` intact |
| Legacy keys (`wellData`, `v2`) | Keep `.backup` copies |

**Rationale**:
- User can verify migration success before cleanup
- Rollback to browser-only mode if backend fails
- No data loss if import has bugs

**Cleanup**: Manual "Clear Browser Data" button in Settings (post-verification only).

---

## 10. TESTING SCENARIOS

| Scenario | Expected Result |
|----------|-----------------|
| Empty legacy storage | Preview shows 0 projects, import succeeds (no-op) |
| Single project, 1 well, no modules | Imports project + well, empty modules |
| Multiple projects, wells with all modules | All imported with correct FKs |
| Duplicate project codes | Skipped per conflict strategy |
| Large files (>10MB) in IndexedDB | Streamed to disk, checksum verified |
| Corrupted base64 in localStorage | Skipped with warning, import continues |
| Network failure mid-import | Full rollback, no partial data |
| Re-import same data | No duplicates (idempotent) |
| Import to different user | Data isolated per user |

---

## 11. PERFORMANCE CONSIDERATIONS

| Concern | Mitigation |
|---------|------------|
| Large file uploads | Stream to disk (not memory), chunked |
| Many photos (1000+) | Batch INSERT, parallel file save |
| Transaction size | Per-project transactions (not one giant TX) |
| IndexedDB read | Async iteration, progress callbacks |
| Memory | Process one well at a time, clear refs |

---

## 12. DECISION LOG

| ID | Decision | Rationale |
|----|----------|-----------|
| MIG001 | User-triggered import (not auto) | Explicit consent, ownership choice, verifiable |
| MIG002 | Single transaction per project | Atomicity, simpler rollback, manageable size |
| MIG003 | Files → filesystem (not DB) | Performance, backup simplicity, streaming downloads |
| MIG004 | Checksum dedup | Avoid re-storing identical files across imports |
| MIG005 | Never delete browser storage | Safety net, user verification, zero regret |
| MIG006 | Legacy pipes/screens not migrated to Designer | Designer is new canonical; legacy kept for PDF compatibility |
| MIG007 | Activity log for migration | Audit trail, debugging, compliance |
| MIG008 | Preview before import | User sees exactly what will happen |
| MIG009 | Conflict strategy default = skip | Safe default, no data overwritten silently |
| MIG010 | Dry-run option | Test run without writing to DB |

---

## 13. MIGRATION CHECKLIST (FS7 Implementation)

- [ ] Backend: `/migration/preview` endpoint
- [ ] Backend: `/migration/import` endpoint with transaction
- [ ] Backend: File streaming save with checksum
- [ ] Backend: Conflict detection (project_code, well_code)
- [ ] Backend: Activity logging for migration
- [ ] Frontend: MigrationWizard component
- [ ] Frontend: localStorage/IndexedDB scanner
- [ ] Frontend: Preview display with conflict warnings
- [ ] Frontend: Progress indicator during import
- [ ] Frontend: Result summary with verification links
- [ ] Test: Empty, small, large, corrupted data
- [ ] Test: Rollback on error
- [ ] Test: Re-import idempotency
- [ ] Test: Multi-user isolation
- [ ] Docs: User migration guide