# Final Architecture - Borewell Engineering Visualizer

## Overview

This document describes the final architecture of the Borewell Engineering Visualizer after implementing the account management, project assignment, and authorization refinements.

## Technology Stack (Unchanged)

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite 5 |
| Icons | Lucide React |
| Styling | Pure CSS (technical paper theme) |
| Visualization | Canvas API |
| PDF Export | jsPDF |
| Archive | JSZip |
| Client Storage | localStorage (auto-save), IndexedDB (binary files >2MB) |
| Backend | Go 1.22 + Gin |
| Database | PostgreSQL 15+ |
| Auth | JWT (15min access, 30d refresh in HttpOnly cookie), Argon2id |
| Migrations | 14 SQL migrations (users, projects, wells, files, RLS, triggers, indexes, project_assignments) |
| Security | Row Level Security (project/well isolation, fail-closed), CSRF, Rate limiting |

## Key Architecture Changes

### 1. Account Management (Phase 1)

**Removed:**
- Public self-registration endpoint (`POST /api/v1/auth/register`)
- Register page from frontend
- Admin approval workflow for new registrations (pending status)

**Added:**
- Admin-only user creation endpoint (`POST /api/v1/admin/users`)
- Admin can create staff or admin accounts directly
- New accounts are created with `approved` status immediately
- Admin can activate/deactivate (suspend/unsuspend) accounts
- Account status validation in backend on every login and token refresh
- Session revocation when accounts are suspended or rejected

**Preserved:**
- Secure password hashing (Argon2id)
- JWT access token (15 min) + refresh token (30 days in HttpOnly cookie)
- Token rotation on refresh
- Existing admin account and credentials
- All existing authentication security mechanisms

### 2. Project Assignment & Authorization (Phase 2)

**Database Changes:**
- New `project_assignments` table linking users to projects with `view` or `edit` permission
- SQL function `user_can_access_project(project_id, user_id)` for RLS evaluation
- Updated RLS policies on all user-owned tables to use the new function

**Backend Changes:**
- Project listing now returns projects where user is owner, admin, or has assignment
- All project/well/module/documentation endpoints validate access via RLS (fail-closed)
- Admin has global access to all projects
- Staff can only access assigned projects
- VIEW permission: read-only access to project data
- EDIT permission: read and modify project data
- IDOR protection: staff cannot access other projects by guessing UUIDs

**API Endpoints Added:**
- `GET /api/v1/admin/projects/:id/assignments` - List project assignments
- `POST /api/v1/admin/projects/:id/assignments` - Create assignment
- `PUT /api/v1/admin/projects/:id/assignments/:userId` - Update assignment permission
- `DELETE /api/v1/admin/projects/:id/assignments/:userId` - Remove assignment

**Frontend Changes:**
- Removed Register page and public registration flow
- Added Admin User Management page (create, suspend, activate, delete users)
- Added Project Assignment page (manage staff access to projects)
- Navigation shows admin-only items for admin users only
- Staff sees only assigned projects in project lists
- Empty states guide users when no projects are assigned

### 3. Data Consistency (Phase 3)

**Preserved:**
- PostgreSQL and backend API as source of truth for shared project data
- LocalStorage and IndexedDB for cache, local drafts, temporary offline work
- Existing local data and migration compatibility
- Offline functionality (frontend-only mode)

**Verified:**
- Project data correctly scoped by project and user permissions
- Photos and documents stored and retrieved consistently via centralized file API

### 4. Concurrent Editing & Activity Logging (Phase 4)

**Existing (Preserved):**
- Optimistic locking via version fields in module tables (designer, geology, monitoring)
- Activity logs for create, update, delete operations
- Activity log records: actor, action, target resource, project context, timestamp, metadata

**Verified:**
- Version checking prevents silent overwrites
- Activity logs capture assignment and account management operations

### 5. Local Development Compatibility (Phase 5)

**Preserved:**
- Frontend runs on localhost:5173 (Vite dev server)
- Backend runs on localhost:8080 (Go Gin server)
- PostgreSQL via existing Docker Compose setup
- Vite proxy configuration for `/api` to backend
- Environment-specific settings configurable via `.env`
- No hardcoded office IP addresses or domain names
- No reverse proxy or production server required

**Configuration for Future LAN Deployment:**
- Database URL, JWT secrets, file storage path configurable via environment variables
- CORS allow-list configurable
- RLS policies work with any PostgreSQL instance

## Database Schema Changes

### New Table: `project_assignments`

```sql
CREATE TABLE project_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL CHECK (permission IN ('view','edit')),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);
```

### RLS Policy Updates

All user-owned tables now use `user_can_access_project(id, current_setting('app.current_user_id')::uuid)` for access control, which returns true for:
- Admin users (global access)
- Project owners
- Users with explicit project assignments

The `projects` table has a WITH CHECK clause allowing INSERT only when the new row's `owner_id` matches the current user (or user is admin).

## Security Improvements

1. **Fail-closed RLS**: All queries return 0 rows if `app.current_user_id` is not set
2. **Backend authorization**: Every endpoint validates project access before operations
3. **No IDOR**: Staff cannot access unassigned projects by UUID
4. **Session management**: Refresh tokens revoked on suspend/reject; admin can revoke all user sessions
5. **Password security**: Argon2id with configurable parameters
6. **CSRF protection**: On all state-changing endpoints
7. **Rate limiting**: Per-IP rate limiting on auth endpoints

## Migration History

| Version | Description |
|---------|-------------|
| 001 | Users, sessions, activity logs |
| 002 | Projects and wells |
| 003 | Engineering modules (designer, geology, monitoring) |
| 004 | Files and documentation |
| 005 | Backup manifests |
| 006 | RLS policies (original) |
| 007 | Composite indexes |
| 008 | Updated_at triggers |
| 009 | Fix refresh_sessions RLS service lookup |
| 20261103082616 | Add token_family to refresh_sessions |
| 20261103185800 | Fix RLS policies permissive |
| 20261103190000 | RLS fail-closed enforcement |
| **20261104100000** | **Project assignments + updated RLS** |

## Navigation Structure

### All Users (Staff & Admin)
- **WORKSPACE**
  - Dashboard
  - My Projects (filtered by assignment/ownership)
- **ENGINEERING**
  - Well Construction Designer
  - Geological Log
  - Groundwater Monitoring
- **DOCUMENTATION**
  - Field Documentation
  - Project Documentation
  - Gallery
- **REPORTING**
  - Report Builder
  - PDF Export
- **DATA MANAGEMENT**

### Admin Only
- **ADMINISTRATION**
  - User Management
  - Project Assignment
  - Activity Log
  - Backup & Restore
  - Storage Health

## Testing Results

### Backend Tests (All Passing)
- Auth tests: login, refresh, logout, password validation
- RLS tests: cross-user isolation, fail-closed behavior
- Security tests: CSRF, rate limiting, token rotation
- FS3 tests: Project/Well CRUD, Module APIs, RLS & Ownership
- Admin tests: user management, project assignment

### Frontend Build
- Production build successful
- No TypeScript/ESLint errors
- Chunk optimization working

## Local Development Instructions

### Prerequisites
- Go 1.22+
- Node.js 20+
- PostgreSQL 15+ (via Docker)

### Quick Start

```bash
# 1. Start PostgreSQL
cd backend
docker compose up -d postgres

# 2. Apply migrations
go run ./cmd/migrate up

# 3. Create admin user (if needed)
go run ./cmd/bootstrap-admin -email admin@example.com -password "StrongPassword123"

# 4. Start backend
go run ./cmd/server

# 5. Start frontend (new terminal)
cd ..
npm install
npm run dev
```

### Environment Variables (.env in backend/)
```
APP_ENV=development
APP_PORT=8080
DATABASE_URL=postgres://postgres:password@localhost:5432/borewell?sslmode=disable
JWT_SECRET=your-jwt-secret-min-32-chars
REFRESH_TOKEN_SECRET=your-refresh-secret-min-32-chars
FILE_STORAGE_PATH=./data/files
LOG_LEVEL=info
ARGON2_TIME=3
ARGON2_MEMORY=65536
ARGON2_THREADS=4
ARGON2_KEYLEN=32
```

## Remaining Limitations

1. **No real-time collaboration**: No WebSocket/WebRTC for concurrent editing notifications
2. **No audit log UI**: Activity logs stored but no dedicated admin UI for viewing
3. **No backup scheduling**: Manual backup via UI or pg_dump
4. **Single admin bootstrap**: First admin must be created via CLI
5. **No email notifications**: Account creation, assignment changes not emailed
6. **Frontend-only mode**: Still available but without multi-user features
7. **No project-level admin roles**: Only global admin and project assignments
8. **No soft delete for users**: Users are suspended, not deleted

## Future Enhancements (Out of Scope)

- Real-time collaboration with conflict resolution UI
- Audit log dashboard with filtering
- Automated backup scheduling
- Email/SMS notifications
- Project-level admin roles (delegate admin per project)
- User profile management (avatar, preferences)
- Two-factor authentication
- API key management for integrations
- Webhook support for external systems
PY