# API_SPECIFICATION.md
# Borewell Engineering Visualizer v2.0.0 — REST API Specification

**Status**: FS0 Audit Complete
**Date**: 2026-11-03
**Base URL**: `http://localhost:8080/api/v1`
**Auth**: JWT Bearer (access) + HttpOnly Cookie (refresh)
**Content-Type**: `application/json` (except file upload: `multipart/form-data`)

---

## 1. CONVENTIONS

| Convention | Standard |
|------------|----------|
| **Naming** | snake_case for JSON, query params, route params |
| **IDs** | UUID v4 strings (`"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`) |
| **Timestamps** | ISO 8601 UTC (`"2024-01-15T10:30:00Z"`) |
| **Dates** | ISO 8601 date (`"2024-01-15"`) |
| **Enums** | Lowercase snake_case strings |
| **Pagination** | `page` (1-based), `page_size` (default 20, max 100) |
| **Sorting** | `sort_by=field`, `sort_dir=asc\|desc` |
| **Filtering** | `filter[field]=value` (exact), `filter[field][op]=value` (operators) |
| **Errors** | RFC 7807 Problem Details |
| **Success** | `{ "data": ..., "meta": {} }` |
| **List Response** | `{ "data": [...], "meta": { "page", "page_size", "total", "total_pages" } }` |

---

## 2. ERROR FORMAT (RFC 7807)

```json
{
  "type": "https://example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields failed validation",
  "instance": "/api/v1/projects",
  "errors": [
    { "field": "project_code", "code": "required", "message": "Project code is required" },
    { "field": "email", "code": "unique", "message": "Email already registered" }
  ]
}
```

### Common Error Types
| Status | Type | Title |
|--------|------|-------|
| 400 | `invalid-request` | Invalid Request |
| 401 | `unauthenticated` | Unauthenticated |
| 403 | `forbidden` | Forbidden |
| 404 | `not-found` | Not Found |
| 409 | `conflict` | Conflict |
| 422 | `validation-failed` | Validation Failed |
| 429 | `rate-limited` | Too Many Requests |
| 500 | `internal-error` | Internal Server Error |

---

## 3. AUTHENTICATION ENDPOINTS

### 3.1 Register
**POST** `/auth/register`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "full_name": "John Doe"
}
```

**Validation**:
- Email: valid format, normalized lowercase, unique
- Password: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special
- Full name: 1-100 chars

**Response 201**:
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "user",
      "status": "pending",
      "created_at": "2024-01-15T10:30:00Z"
    }
  },
  "meta": { "message": "Registration submitted. Awaiting admin approval." }
}
```

**Errors**: 422 (validation), 409 (email exists — generic message)

---

### 3.2 Login
**POST** `/auth/login`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response 200**:
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "user",
      "status": "approved"
    },
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

**Cookies Set**:
- `refresh_token=<opaque>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (30 days)

**Errors**: 401 (invalid credentials — generic), 403 (not approved), 429 (rate limited)

---

### 3.3 Logout
**POST** `/auth/logout`

**Headers**: `Authorization: Bearer <access_token>`

**Response 200**:
```json { "data": null, "meta": { "message": "Logged out successfully" } }
```

**Cookies Cleared**: `refresh_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`

---

### 3.4 Refresh Access Token
**POST** `/auth/refresh`

**Cookies**: `refresh_token=<opaque>`

**Response 200**:
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

**Cookies Set**: New `refresh_token` (rotation), old revoked

**Errors**: 401 (invalid/expired/revoked refresh token)

---

### 3.5 Get Current User
**GET** `/auth/me`

**Headers**: `Authorization: Bearer <access_token>`

**Response 200**:
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "user",
    "status": "approved",
    "created_at": "2024-01-15T10:30:00Z",
    "approved_at": "2024-01-16T08:00:00Z"
  }
}
```

---

## 4. ADMIN ENDPOINTS (Require `role=admin`)

### 4.1 List Pending Users
**GET** `/admin/users/pending`

**Query**: `page`, `page_size`, `sort_by=created_at`, `sort_dir=asc`

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "status": "pending",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 5, "total_pages": 1 }
}
```

---

### 4.2 Approve User
**POST** `/admin/users/{id}/approve`

**Response 200**:
```json
{
  "data": {
    "id": "uuid",
    "status": "approved",
    "approved_at": "2024-01-16T08:00:00Z",
    "approved_by": "admin-uuid"
  }
}
```

**Activity Log**: `user.approve` with `metadata: { approved_by: "admin-uuid" }`

---

### 4.3 Reject User
**POST** `/admin/users/{id}/reject`

**Request**:
```json
{ "reason": "Incomplete information" }
```

**Response 200**:
```json
{
  "data": {
    "id": "uuid",
    "status": "rejected",
    "rejection_reason": "Incomplete information"
  }
}
```

---

### 4.4 Suspend/Unsuspend User
**POST** `/admin/users/{id}/suspend`
**POST** `/admin/users/{id}/unsuspend`

**Request** (suspend):
```json
{ "reason": "Policy violation" }
```

**Response 200**:
```json
{ "data": { "id": "uuid", "status": "suspended" } }
```

---

### 4.5 List All Users (Admin)
**GET** `/admin/users`

**Query**: `status`, `role`, `page`, `page_size`

---

## 5. PROJECTS ENDPOINTS

### 5.1 List Projects
**GET** `/projects`

**Query**:
- `page`, `page_size`
- `sort_by` (created_at, updated_at, project_name, project_code, status, start_date)
- `sort_dir` (asc, desc)
- `filter[status]` (exact)
- `filter[project_name][contains]` (ILIKE)
- `filter[client_name][contains]`

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "project_code": "PRJ-001",
      "project_name": "Sumur Bor Desa",
      "client_name": "Pemerintah Desa",
      "contractor_name": "CV Bor Jaya",
      "location": "Jl. Raya No. 1",
      "province": "Jawa Barat",
      "district": "Bandung",
      "village": "Mekarjaya",
      "latitude": "-6.9175",
      "longitude": "107.6191",
      "description": "Proyek sumur bor produksi",
      "start_date": "2024-01-01",
      "end_date": "2024-03-31",
      "status": "in_progress",
      "well_count": 3,
      "created_at": "2024-01-10T08:00:00Z",
      "updated_at": "2024-01-20T14:30:00Z",
      "archived_at": null
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 15, "total_pages": 1 }
}
```

---

### 5.2 Get Project
**GET** `/projects/{id}`

**Response 200**: Single project object (same as list item)

**Errors**: 404 (not found or not owner)

---

### 5.3 Create Project
**POST** `/projects`

**Request**:
```json
{
  "project_code": "PRJ-002",
  "project_name": "Sumur Bor Baru",
  "client_name": "PT Air Bersih",
  "contractor_name": "CV Bor Makmur",
  "location": "Jl. Baru No. 5",
  "province": "DKI Jakarta",
  "district": "Jakarta Selatan",
  "village": "Kebayoran",
  "latitude": "-6.2088",
  "longitude": "106.8456",
  "description": "Proyek baru",
  "start_date": "2024-02-01",
  "end_date": "2024-04-30",
  "status": "planning"
}
```

**Validation**: Required fields, unique project_code per owner, valid coordinates, date logic

**Response 201**: Created project object

---

### 5.4 Update Project
**PATCH** `/projects/{id}`

**Request**: Partial update (any subset of create fields)

**Response 200**: Updated project object

---

### 5.5 Delete Project
**DELETE** `/projects/{id}`

**Response 204**: No content

**Cascade**: Deletes all wells + modules + documentation + files (via FK CASCADE)

---

### 5.6 Archive Project
**POST** `/projects/{id}/archive`

**Response 200**: Project with `status: "archived"`, `archived_at` set

---

### 5.7 Restore Project
**POST** `/projects/{id}/restore`

**Response 200**: Project with `status: "planning"`, `archived_at: null`

---

### 5.8 Duplicate Project
**POST** `/projects/{id}/duplicate`

**Response 201**: New project with `project_code: "{original}-COPY"`, `project_name: "{original} (Salinan)"`, `status: "planning"`, no wells

---

### 5.9 Get Project Stats
**GET** `/projects/stats`

**Response 200**:
```json
{
  "data": {
    "total_projects": 15,
    "active_projects": 8,
    "total_wells": 42,
    "completed_wells": 28,
    "recent_projects": [...],
    "recent_wells": [...]
  }
}
```

---

## 6. WELLS ENDPOINTS

### 6.1 List Wells (per Project)
**GET** `/projects/{project_id}/wells`

**Query**: `page`, `page_size`, `sort_by`, `sort_dir`, `filter[status]`, `filter[well_type]`, `filter[well_code][contains]`

**Response 200**: List of wells with well_count = 0 (since per-project)

---

### 6.2 Get Well
**GET** `/wells/{id}`

**Response 200**:
```json
{
  "data": {
    "id": "uuid",
    "project_id": "uuid",
    "well_code": "WELL-001",
    "well_name": "Sumur Produksi 1",
    "well_type": "production",
    "location": "Jl. Raya No. 1",
    "latitude": "-6.9175",
    "longitude": "107.6191",
    "planned_depth": 50.00,
    "actual_depth": 48.50,
    "drilling_date": "2024-01-15",
    "completion_date": "2024-01-20",
    "status": "completed",
    "description": "Sumur produksi utama",
    "created_at": "2024-01-10T08:00:00Z",
    "updated_at": "2024-01-20T14:30:00Z"
  }
}
```

---

### 6.3 Create Well
**POST** `/projects/{project_id}/wells`

**Request**: Same fields as update (minus project_id)

**Validation**: Unique well_code per project, valid well_type/status, date logic

**Response 201**: Created well object

---

### 6.4 Update Well
**PATCH** `/wells/{id}`

**Request**: Partial update

**Response 200**: Updated well object

---

### 6.5 Delete Well
**DELETE** `/wells/{id}`

**Response 204**: No content

**Cascade**: Deletes designer, geology, monitoring, documentation, files

---

### 6.6 Duplicate Well
**POST** `/wells/{id}/duplicate`

**Response 201**: New well with `well_code: "{original}-COPY"`, `status: "planned"`, copies all module data

---

## 7. DESIGNER ENDPOINTS (Phase 3)

### 7.1 Get Designer State
**GET** `/wells/{well_id}/designer`

**Response 200**:
```json
{
  "data": {
    "well_id": "uuid",
    "version": 1,
    "components": [
      {
        "id": "comp-uuid",
        "type": "surface_casing",
        "name": "Casing Permukaan",
        "start_depth": 0,
        "end_depth": 20,
        "length": 20,
        "outer_diameter": 200,
        "inner_diameter": 180,
        "material": "PVC",
        "color": "#475569",
        "description": "",
        "visible": true,
        "z_order": 0
      }
    ],
    "config": {
      "total_well_depth": 48.5,
      "ground_level": 0,
      "mat_level": null
    },
    "updated_at": "2024-01-20T14:30:00Z"
  }
}
```

---

### 7.2 Upsert Designer State
**PUT** `/wells/{well_id}/designer`

**Request**: Full designer state (components array + config)

**Validation**: Component structure, unique IDs, depth ranges, no overlaps (warning only)

**Response 200**: Saved designer state

---

### 7.3 Delete Designer State
**DELETE** `/wells/{well_id}/designer`

**Response 204**

---

## 8. GEOLOGY ENDPOINTS (Phase 4)

### 8.1 Get Geological Log
**GET** `/wells/{well_id}/geology`

**Response 200**:
```json
{
  "data": {
    "well_id": "uuid",
    "version": 1,
    "layers": [
      {
        "id": "geo-uuid",
        "name": "Topsoil",
        "material": "topsoil",
        "start_depth": 0,
        "end_depth": 1.5,
        "description": "Tanah organik",
        "formation": "Alluvium",
        "notes": "",
        "color": "#7c5a3c",
        "pattern": "topsoil"
      }
    ],
    "updated_at": "2024-01-20T14:30:00Z"
  }
}
```

---

### 8.2 Upsert Geological Log
**PUT** `/wells/{well_id}/geology`

**Request**: Full geology state (layers array)

**Validation**: Layer structure, unique IDs, start < end, no overlaps (warning), within well depth

**Response 200**: Saved geology state

---

### 8.3 Delete Geological Log
**DELETE** `/wells/{well_id}/geology`

**Response 204**

---

## 9. MONITORING ENDPOINTS (Phase 5)

### 9.1 Get Monitoring Data
**GET** `/wells/{well_id}/monitoring`

**Response 200**:
```json
{
  "data": {
    "well_id": "uuid",
    "version": 1,
    "measurements": [
      {
        "id": "mon-uuid",
        "measured_at": "2024-01-15T10:30:00Z",
        "water_level_depth": 12.35,
        "reference_point": "top_of_casing",
        "reference_elevation": 25.5,
        "method": "electric_water_level_meter",
        "status": "valid",
        "notes": "Normal",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      }
    ],
    "updated_at": "2024-01-20T14:30:00Z"
  }
}
```

---

### 9.2 Upsert Monitoring Data
**PUT** `/wells/{well_id}/monitoring`

**Request**: Full monitoring state (measurements array)

**Validation**: Measurement structure, unique IDs, valid timestamps, valid reference points/methods, valid reference elevations

**Response 200**: Saved monitoring state

---

### 9.3 Delete Monitoring Data
**DELETE** `/wells/{well_id}/monitoring`

**Response 204**

---

### 9.4 Export Monitoring CSV
**GET** `/wells/{well_id}/monitoring/export`

**Response**: `text/csv` attachment

---

### 9.5 Import Monitoring CSV
**POST** `/wells/{well_id}/monitoring/import`

**Request**: `multipart/form-data` with `file` (CSV)

**Response 200**:
```json
{ "data": { "imported": 10, "skipped": 2, "errors": [...] } }
```

---

## 10. DOCUMENTATION ENDPOINTS (Phase 6)

### 10.1 List Photos
**GET** `/wells/{well_id}/photos` or `/projects/{project_id}/photos`

**Query**: `page`, `page_size`, `sort_by`, `sort_dir`, `filter[category]`, `filter[name][contains]`

**Response 200**: List of photo metadata (no file data)

---

### 10.2 Get Photo
**GET** `/photos/{id}`

**Response 200**: Photo metadata + `download_url: "/api/v1/files/{file_id}"`

---

### 10.3 Upload Photo
**POST** `/wells/{well_id}/photos` or `/projects/{project_id}/photos`

**Request**: `multipart/form-data`
- `file`: image (JPG/PNG/WebP, max 10MB)
- `name`: string
- `category`: enum
- `description`: string
- `documented_at`: ISO timestamp

**Process**:
1. Validate file
2. Save to filesystem → create `files` record
3. Create `documentation_photos` record with `file_id`

**Response 201**: Photo metadata

---

### 10.4 Update Photo Metadata
**PATCH** `/photos/{id}`

**Request**: `name`, `category`, `description`, `documented_at`

**Response 200**: Updated photo

---

### 10.5 Delete Photo
**DELETE** `/photos/{id}`

**Response 204**: Deletes photo record + file (if not referenced elsewhere)

---

### 10.6 List Documents
**GET** `/wells/{well_id}/documents` or `/projects/{project_id}/documents`

**Query**: Same as photos

---

### 10.7 Upload Document
**POST** `/wells/{well_id}/documents` or `/projects/{project_id}/documents`

**Request**: `multipart/form-data`
- `file`: PDF/image/text (max 20MB)
- `title`: string
- `category`: enum
- `description`: string
- `document_date`: ISO timestamp

**Response 201**: Document metadata

---

### 10.8 Update Document
**PATCH** `/documents/{id}`

---

### 10.9 Delete Document
**DELETE** `/documents/{id}`

---

### 10.10 Download File
**GET** `/files/{id}`

**Headers**: `Authorization: Bearer <token>`

**Response**: File stream with `Content-Disposition: attachment; filename="original_name"`

**Ownership**: Verified via JOIN (user → project/well → file)

---

## 11. REPORTS ENDPOINTS (Phase 6)

### 11.1 Generate PDF Report
**POST** `/wells/{well_id}/report`

**Request**:
```json
{
  "sections": {
    "cover": true,
    "project_well_info": true,
    "well_construction": true,
    "geological_log": true,
    "groundwater_monitoring": true,
    "field_documentation": true,
    "notes_conclusion": true
  },
  "selected_photo_ids": ["uuid1", "uuid2"],
  "metadata": {
    "title": "Laporan Penyelesaian",
    "report_number": "RPT-001",
    "revision": "0",
    "report_date": "2024-01-20",
    "prepared_by": "John Doe",
    "reviewed_by": "Jane Smith",
    "logo_file_id": "uuid"
  },
  "notes": {
    "technical": "Catatan teknis...",
    "conclusion": "Kesimpulan..."
  }
}
```

**Response**: `application/pdf` attachment

> **Note**: PDF generation can remain client-side (current implementation). This endpoint is optional for server-side generation.

---

## 12. DATA MANAGEMENT ENDPOINTS (Phase 7)

### 12.1 Create Full Backup
**POST** `/backup`

**Response 200**: `application/zip` attachment (streaming)

**Manifest**: Includes all user's projects, wells, modules, documentation metadata, file references

---

### 12.2 Restore Backup
**POST** `/backup/restore`

**Request**: `multipart/form-data`
- `file`: backup ZIP
- `mode`: `replace` | `merge`

**Process**:
1. Create safety backup (current state)
2. Validate manifest
3. Restore (replace or merge with conflict detection)
4. On failure: auto-rollback from safety backup

**Response 200**:
```json
{
  "data": {
    "mode": "replace",
    "restored": { "projects": 5, "wells": 12 },
    "conflicts": []
  }
}
```

---

### 12.3 Export Data (Partial)
**GET** `/export/projects` → JSON
**GET** `/export/wells/{well_id}` → JSON
**GET** `/export/monitoring/{well_id}` → CSV
**GET** `/export/geology/{well_id}` → CSV
**GET** `/export/docs/metadata` → JSON

---

### 12.4 Import Data
**POST** `/import/projects` → JSON
**POST** `/import/wells` → JSON (requires project_id in payload)

---

### 12.5 Storage Health
**GET** `/health/storage`

**Response 200**:
```json
{
  "data": {
    "database": { "size_bytes": 10485760, "tables": 12 },
    "files": { "count": 150, "size_bytes": 52428800 },
    "backup_manifests": 5
  }
}
```

---

### 12.6 Data Integrity Check
**POST** `/integrity/check`

**Response 200**:
```json
{
  "data": {
    "issues": [
      { "severity": "error", "category": "well", "message": "Well references deleted project", "details": {} }
    ],
    "summary": { "total": 1, "errors": 1, "warnings": 0, "info": 0 },
    "repairs": [
      { "action": "remove_orphaned_well", "description": "Remove well uuid...", "destructive": true }
    ]
  }
}
```

---

### 12.7 Execute Repair
**POST** `/integrity/repair`

**Request**:
```json
{ "action": "rename_duplicate_well", "issue_id": "uuid" }
```

**Response 200**: Repair result

---

## 13. RATE LIMITING

| Endpoint Group | Limit |
|----------------|-------|
| Auth (login/register) | 5 req/min per IP |
| Auth (refresh) | 10 req/min per user |
| API (general) | 100 req/min per user |
| File upload | 20 req/min per user |
| Backup/Restore | 2 req/hour per user |
| Admin actions | 30 req/min per admin |

**Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 14. REQUEST/RESPONSE EXAMPLES

### 14.1 Create Project (Full)
```bash
curl -X POST http://localhost:8080/api/v1/projects \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "project_code": "PRJ-003",
    "project_name": "Sumur Monitoring",
    "client_name": "Dinas PU",
    "contractor_name": "CV Teknik",
    "location": "Jl. Sudirman No. 10",
    "province": "DKI Jakarta",
    "district": "Jakarta Pusat",
    "village": "Gambir",
    "latitude": "-6.1754",
    "longitude": "106.8272",
    "description": "Sumur monitoring kualitas air",
    "start_date": "2024-03-01",
    "end_date": "2024-05-31",
    "status": "planning"
  }'
```

### 14.2 Upload Photo
```bash
curl -X POST http://localhost:8080/api/v1/wells/<well_id>/photos \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@/path/to/photo.jpg" \
  -F "name=Pipa Casing" \
  -F "category=well_construction" \
  -F "description=Pemasangan casing produksi" \
  -F "documented_at=2024-01-15T10:00:00Z"
```

### 14.3 List Projects with Filters
```bash
curl "http://localhost:8080/api/v1/projects?page=1&page_size=10&sort_by=updated_at&sort_dir=desc&filter[status]=in_progress&filter[project_name][contains]=sumur" \
  -H "Authorization: Bearer <access_token>"
```

---

## 15. OPEN API / SWAGGER

- Generate from Go structs using `swaggo/swag`
- Serve at `/swagger/index.html` (dev only)
- Include all schemas, parameters, responses, security schemes

---

## 16. DECISION LOG

| ID | Decision | Rationale |
|----|----------|-----------|
| API001 | PUT for module upsert (designer/geology/monitoring) | Full state replacement matches frontend autosave pattern |
| API002 | Separate `/files/{id}` download endpoint | Streaming, ownership check, range requests |
| API003 | `multipart/form-data` for all uploads | Standard, supports large files, progress events |
| API004 | Backup as ZIP stream | Memory efficient, no temp files, single request |
| API005 | Merge mode with conflict detection | Safe incremental restore, user decides conflicts |
| API006 | CSV import/export for monitoring/geology | Interoperability with field equipment software |
| API007 | No PATCH for modules (full PUT only) | Simpler validation, atomic replacement |
| API008 | Admin endpoints under `/admin` prefix | Clear separation, middleware scoping |
| API009 | Rate limits per endpoint group | Prevent abuse, allow legitimate bursts |
| API010 | RFC 7807 error format | Standard, machine-readable, extensible |