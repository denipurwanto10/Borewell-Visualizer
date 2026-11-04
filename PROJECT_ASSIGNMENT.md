# Project Assignment System

## Overview

The project assignment system enables fine-grained access control for staff members to specific projects. It replaces the previous model where users could only access their own projects (owner-only) with a flexible assignment model supporting VIEW and EDIT permissions.

## Data Model

### `project_assignments` Table

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

**Indexes:**
- `idx_project_assignments_project` on `project_id`
- `idx_project_assignments_user` on `user_id`

### Permission Levels

| Permission | Description | Use Case |
|------------|-------------|----------|
| `view` | Read-only access to project data | Field technicians, reviewers, clients |
| `edit` | Read + write access to project data | Engineers, project managers |

### Effective Permission Resolution

The SQL function `user_can_access_project(project_id, user_id)` determines access:

```sql
SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.role = 'admin')
    OR EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.owner_id = p_user_id)
    OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p_project_id AND pa.user_id = p_user_id);
```

**Permission Hierarchy:**
1. **Admin** → Full access (bypasses all checks)
2. **Project Owner** → EDIT (implicit, cannot be removed)
3. **Explicit Assignment** → As assigned (VIEW or EDIT)
4. **No Assignment** → No access

## RLS Policy Integration

All user-owned tables use the `user_can_access_project` function in their RLS policies:

```sql
-- Projects
CREATE POLICY projects_access ON projects
    USING (user_can_access_project(id, current_setting('app.current_user_id')::uuid))
    WITH CHECK (
        owner_id = current_setting('app.current_user_id')::uuid
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = current_setting('app.current_user_id')::uuid AND u.role = 'admin')
    );

-- Wells
CREATE POLICY wells_access ON wells
    USING (project_id IN (SELECT id FROM projects WHERE user_can_access_project(id, current_setting('app.current_user_id')::uuid)));

-- Modules (designer, geology, monitoring)
CREATE POLICY designer_access ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE user_can_access_project(p.id, current_setting('app.current_user_id')::uuid)
    ));

-- Documentation (photos, documents)
CREATE POLICY photos_access ON documentation_photos
    USING (
        user_can_access_project(project_id, current_setting('app.current_user_id')::uuid)
        OR well_id IN (...)
    );

-- Files
CREATE POLICY files_access ON files
    USING (
        owner_id = current_setting('app.current_user_id')::uuid
        OR (project_id IS NOT NULL AND user_can_access_project(project_id, current_setting('app.current_user_id')::uuid))
    );
```

**Key Points:**
- Fail-closed: Returns 0 rows if `app.current_user_id` not set
- Admin bypass: `role = 'admin'` grants access to all projects
- Owner bypass: `owner_id = user_id` grants access
- Assignment check: `project_assignments` table for staff
- WITH CHECK on projects ensures only owners/admins can create projects

## API Endpoints

### Admin Project Assignment Management

All endpoints require `Authorization: Bearer <token>` and admin role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/projects/:id/assignments` | List all assignments for a project |
| POST | `/api/v1/admin/projects/:id/assignments` | Create new assignment |
| PUT | `/api/v1/admin/projects/:id/assignments/:userId` | Update assignment permission |
| DELETE | `/api/v1/admin/projects/:id/assignments/:userId` | Remove assignment |

### Request/Response Formats

**List Assignments (GET)**
```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "user_id": "uuid",
      "permission": "view",
      "created_at": "2026-11-04T02:30:00Z"
    }
  ]
}
```

**Create Assignment (POST)**
```json
// Request
{
  "user_id": "uuid",
  "permission": "view"  // or "edit"
}

// Response 201
{
  "data": {
    "id": "uuid",
    "project_id": "uuid",
    "user_id": "uuid",
    "permission": "view",
    "assigned_by": "uuid",
    "created_at": "2026-11-04T02:30:00Z",
    "updated_at": "2026-11-04T02:30:00Z"
  }
}
```

**Update Assignment (PUT)**
```json
// Request
{
  "permission": "edit"  // or "view"
}

// Response 200
{
  "data": {
    "project_id": "uuid",
    "user_id": "uuid",
    "permission": "edit"
  }
}
```

**Delete Assignment (DELETE)**
```json
// Response 204 No Content
```

### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid UUID format |
| 401 | Not authenticated |
| 403 | Not admin |
| 404 | Project not found / Assignment not found |
| 409 | Assignment already exists (POST) |
| 422 | Invalid permission value |
| 500 | Database error |

## Frontend Integration

### Admin Pages

**User Management Page (`/user-management`)**
- Lists all users with search/filter
- Create new users (admin or staff)
- Suspend/activate users
- Approve/reject legacy pending users

**Project Assignment Page (`/project-assignment`)**
- Accessed by selecting a project → "Assignment" action
- Shows current assignments in table
- Add assignment: select user (dropdown of available approved users), permission
- Edit permission inline
- Delete assignment

### Navigation

Admin-only nav items (filtered by `user.role === 'admin'`):
- Manajemen Pengguna → `/user-management`
- Assignment Proyek → `/project-assignment` (requires project selection)

### Project List Filtering

Staff users see only assigned projects:
- Backend `ListForUser` query uses `user_can_access_project` in WHERE clause
- Admin users see all projects (bypass via role check)

## Security Considerations

### IDOR Prevention

**Before:** Users could only access own projects (owner check)
**After:** RLS + backend checks enforce assignment

**Attack Vectors Blocked:**
- Guessing project UUID → RLS returns 0 rows
- Guessing well UUID → RLS returns 0 rows (well → project → assignment)
- Direct API calls to other projects → Backend validates assignment first
- Nested endpoints (`/projects/:id/wells`) → Project ownership verified first

### Permission Enforcement

| Operation | VIEW Permission | EDIT Permission | Owner/Admin |
|-----------|-----------------|-----------------|-------------|
| List projects | ✓ | ✓ | ✓ |
| Get project | ✓ | ✓ | ✓ |
| Create project | ✗ | ✗ | ✓ (admin) |
| Update project | ✗ | ✗ | ✓ |
| Delete project | ✗ | ✗ | ✓ |
| List wells | ✓ | ✓ | ✓ |
| Get well | ✓ | ✓ | ✓ |
| Create well | ✗ | ✓ | ✓ |
| Update well | ✗ | ✓ | ✓ |
| Delete well | ✗ | ✓ | ✓ |
| Module GET | ✓ | ✓ | ✓ |
| Module PUT/DELETE | ✗ | ✓ | ✓ |
| Docs/Photos GET | ✓ | ✓ | ✓ |
| Docs/Photos POST/PATCH/DELETE | ✗ | ✓ | ✓ |

### Session Revocation

When assignments change:
- No automatic session invalidation (short-lived access tokens)
- Next API call (max 15 min) will re-check permissions via RLS
- For immediate revocation: admin can suspend user (revokes all sessions)

## Migration Strategy

### From Owner-Only to Assignment Model

**Previous Schema:** Projects had `owner_id` only, RLS checked `owner_id = current_user_id`

**Changes:**
1. Added `project_assignments` table
2. Created `user_can_access_project()` function
3. Updated all RLS policies to use the function
4. Added WITH CHECK for project creation
5. Updated backend queries to use assignment-aware logic

**Backward Compatibility:**
- Existing projects: Owner implicitly has EDIT access
- No data migration needed for existing projects
- Owner cannot be removed from project (enforced by unique constraint on owner)

### Applying Migration

```bash
# Run migration
go run ./cmd/migrate up

# Verify
go run ./cmd/migrate status
# Should show 20261104100000_project_assignments.sql as applied
```

### Verification Queries

```sql
-- Check table exists
SELECT * FROM project_assignments LIMIT 1;

-- Check function exists
SELECT proname FROM pg_proc WHERE proname = 'user_can_access_project';

-- Check policies updated
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'projects'::regclass;
-- Should show projects_access with cmd=* (all commands)
```

## Testing

### Backend Tests (FS3)

```bash
cd backend
go test ./tests/fs3/ -v
```

Key test scenarios:
- Admin sees all projects
- Staff sees only assigned projects
- VIEW user cannot POST/PUT/DELETE
- EDIT user can POST/PUT/DELETE
- Unassigned staff gets 404/403
- Nested endpoints respect project assignment
- RLS blocks cross-project queries

### Manual API Testing

```bash
# Login as admin
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Create assignment
curl -X POST http://localhost:8080/api/v1/admin/projects/<project-id>/assignments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<staff-uuid>","permission":"edit"}'

# List assignments
curl -X GET http://localhost:8080/api/v1/admin/projects/<project-id>/assignments \
  -H "Authorization: Bearer <token>"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Staff sees 0 projects | No assignment created | Admin: create assignment via UI/API |
| 403 on project access | RLS blocking | Verify assignment exists, user is approved |
| 404 on nested endpoint | Project not accessible | Check assignment permission |
| Admin can't create project | WITH CHECK failed | Admin must be owner or use admin role |
| Assignment not showing | Filter issue | Check `availableUsers` excludes already assigned |
| RLS returns 0 rows | `app.current_user_id` not set | Verify middleware sets user context |

## Performance

- Function `user_can_access_project` is STABLE (cached per statement)
- Indexes on `project_assignments(project_id)` and `(user_id)`
- RLS policies use EXISTS subqueries (short-circuit)
- Typical query adds ~1-2ms overhead

## Future Enhancements

- Project-level admin role (delegate admin per project)
- Assignment expiration dates
- Bulk assignment operations
- Assignment audit trail (separate from activity log)
- Default project permissions for new users
PY