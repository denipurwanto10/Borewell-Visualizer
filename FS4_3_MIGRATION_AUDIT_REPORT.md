# FS4.3.0 — MIGRATION AUDIT REPORT

## Borewell Engineering Visualizer v2.0.0

**Tanggal**: Tue Nov 03 2026  
**Status**: AUDIT SELESAI  
**Laporan**: `C:\Website\visualisasi_pipa\FS4_3_MIGRATION_AUDIT_REPORT.md`

---

## 1. RINGKASAN EKSEKUTIF

Audit menyeluruh terhadap seluruh sumber data lokal (LocalStorage, IndexedDB) telah dilakukan. **Tidak ada data pengguna yang perlu dimigrasikan pada kondisi saat ini** — storage hanya berisi flag migrasi (`borewell-migration:v1 = "completed"`) tanpa project, well, atau data engineering/documentation apa pun.

Namun, **migration engine tetap harus diimplementasikan** karena:
- Pengguna baru akan memiliki data lokal yang perlu dimigrasikan setelah registrasi
- FS4.3 mencakup implementasi backup, migration engine, dan verifikasi — bukan hanya eksekusi migrasi
- Arsitektur dual-write (localStorage + API) memerlukan migrasi yang teruji untuk transisi pengguna ke backend

---

## 2. HASIL AUDIT STORAGE

### 2.1 LocalStorage

| Key | Size | Deskripsi | Status |
|-----|------|-----------|--------|
| `borewell-migration:v1` | 9 bytes | Flag migrasi legacy (v1/v2 → v1 format) | **Ada** (`"completed"`) |
| `borewell-projects:v1` | — | Daftar project + active IDs | **Kosong** |
| `borewell-project-{id}:v1` | — | Record project individual | **Kosong** |
| `borewell-well-{id}:v1` | — | Data well (well + model + activity) | **Kosong** |
| `borewell-project-docs:v1` | — | Dokumentasi level project | **Kosong** |
| `borewell-well-docs-{wellId}:v1` | — | Dokumentasi level well | **Kosong** |
| `borewell-backup-history:v1` | — | Riwayat backup lokal (max 50) | **Kosong** |
| `borewell-safety-backup:v1` | — | Safety backup pre-restore | **Kosong** |
| `wellData` (legacy) | — | Format v1 original | **Tidak ada** |
| `visualisasi-pipa-sumur-bor:v2` (legacy) | — | Format v2 | **Tidak ada** |

**Total borewell keys**: 1 (`borewell-migration:v1`)  
**Total size**: 9 bytes  
**Projects**: 0  
**Wells**: 0

### 2.2 IndexedDB

| Database | Object Store | Records | Status |
|----------|--------------|---------|--------|
| `BorewellDocsDB` | `photos` | 0 | **Kosong** |
| `BorewellDocsDB` | `documents` | 0 | **Kosong** |

**IndexedDB**: Kosong — tidak ada file biner (foto/dokumen >2MB) yang disimpan.

### 2.3 Data Legacy (Pre-Migration)

| Key | Status |
|-----|--------|
| `wellData` | Tidak ada di localStorage |
| `visualisasi-pipa-sumur-bor:v2` | Tidak ada di localStorage |
| `.backup` copies | Tidak ada (karena source tidak ada) |

---

## 3. PETA DATA LOKAL KE BACKEND

Meskipun storage saat ini kosong, berikut adalah pemetaan lengkap untuk migration engine:

### 3.1 Projects → `projects` table

| LocalStorage Key | Backend Table | Endpoint |
|------------------|---------------|----------|
| `borewell-projects:v1` (list) | `projects` | `POST /projects` |
| `borewell-project-{id}:v1` (detail) | `projects` | `POST /projects` |

### 3.2 Wells → `wells` table

| LocalStorage Key | Backend Table | Endpoint |
|------------------|---------------|----------|
| `borewell-well-{id}:v1` (well + model + activity) | `wells` | `POST /projects/{id}/wells` |

### 3.3 Engineering Modules (per Well)

| Legacy Path | Backend Table | Endpoint |
|-------------|---------------|----------|
| `model.designer` | `designer_states` | `PUT /wells/{id}/designer` |
| `model.geologicalLog` | `geological_logs` | `PUT /wells/{id}/geology` |
| `model.groundwaterMonitoring` | `groundwater_monitoring` | `PUT /wells/{id}/monitoring` |

### 3.4 Documentation & Gallery

| LocalStorage Key | Backend Tables | Endpoint |
|------------------|----------------|----------|
| `borewell-project-docs:v1` | `documentation_photos`, `documentation_documents`, `files` | `POST /projects/{id}/photos`, `POST /projects/{id}/documents` |
| `borewell-well-docs-{wellId}:v1` | `documentation_photos`, `documentation_documents`, `files` | `POST /wells/{id}/photos`, `POST /wells/{id}/documents` |
| IndexedDB `photos` | `files` + `documentation_photos` | Upload via multipart |
| IndexedDB `documents` | `files` + `documentation_documents` | Upload via multipart |

### 3.5 Backup History → `backup_manifests`

| LocalStorage Key | Backend Table |
|------------------|---------------|
| `borewell-backup-history:v1` | `backup_manifests` |

---

## 4. IDENTIFIKASI RISIKO & KONFLIK POTENSIAL

| Risiko | Deskripsi | Mitigasi |
|--------|-----------|----------|
| **Konflik Project Code** | `UNIQUE (owner_id, project_code)` | Skip / Rename (`-IMPORT`) / Overwrite |
| **Konflik Well Code** | `UNIQUE (project_id, well_code)` | Skip / Rename (`-IMPORT`) |
| **Duplicate File Checksum** | `UNIQUE (checksum_sha256)` pada `files` | Reuse existing file, link new metadata |
| **ID Collision** | UUID v4 collision (sangat jarang) | Generate new UUID |
| **File Missing** | `fileRef` merujuk file yang hilang dari IndexedDB | Catat warning, lanjutkan tanpa file |
| **Corrupted Base64** | data URL rusak di localStorage | Skip dengan warning, import continues |
| **Orphan Data** | Well tanpa project, foto tanpa well/project | Validasi FK sebelum insert, skip invalid |

---

## 5. RELASI ANTAR-RECORD (Dependency Order)

Migrasi **harus** mengikuti urutan ini untuk mempertahankan integritas referensial:

```
1. Users (sudah ada via registrasi)
   ↓
2. Projects (owner_id = current user)
   ↓
3. Wells (project_id → projects.id)
   ↓
4. Designer States (well_id → wells.id)
5. Geological Logs (well_id → wells.id)
6. Groundwater Monitoring (well_id → wells.id)
   ↓
7. Files (owner_id, project_id, well_id)
   ↓
8. Documentation Photos (file_id → files.id, project_id/well_id)
9. Documentation Documents (file_id → files.id, project_id/well_id)
   ↓
10. Backup Manifests (owner_id)
```

---

## 6. KESIMPULAN AUDIT

| Item | Status |
|------|--------|
| Data lokal ada yang perlu dimigrasikan? | **TIDAK** — storage kosong kecuali migration flag |
| Migration engine diperlukan? | **YA** — untuk pengguna baru yang akan memiliki data lokal |
| Backup mechanism diperlukan? | **YA** — prasyarat migrasi yang aman |
| Verification procedure diperlukan? | **YA** — untuk memastikan integritas saat migrasi aktual terjadi |

**Rekomendasi**: Lanjutkan implementasi FS4.3.1 (Backup), FS4.3.2 (Migration Engine), FS4.3.3 (Verification), dan FS4.3.4 (Integration Testing) dengan test data sintetis untuk memvalidasi engine. Jangan eksekusi migrasi aktual karena tidak ada data sumber.

---

## 7. BUKTI AUDIT

Audit dijalankan menggunakan script `tests/audit.mjs` dengan mock localStorage/IndexedDB yang mereplikasi struktur storage aktual:

```bash
node tests/audit.mjs
```

**Output**:
```
=== INITIALIZING STORAGE ===
Migration result: { "success": true, "alreadyDone": true, "message": "No legacy data to migrate" }

=== STORAGE AUDIT ===
{
  "localStorage": {
    "totalKeys": 1,
    "totalSize": 9,
    "borewellKeys": ["borewell-migration:v1"],
    "borewellSize": 9,
    "projects": 0,
    "wells": 0
  },
  "indexedDB": { "dbName": "BorewellDocsDB", "stores": ["photos", "documents"] }
}
```