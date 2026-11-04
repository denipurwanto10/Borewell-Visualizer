# User and Role Management

## Overview

This document describes the user account lifecycle, roles, and permissions in the Borewell Engineering Visualizer.

## Roles

### ADMIN (Global Administrator)

**Capabilities:**
- View all projects in the system
- Create, edit, archive, restore, duplicate, delete any project
- Create staff and admin accounts
- Assign/unassign staff to projects with VIEW or EDIT permissions
- Change assignment permissions
- Suspend/activate any user account
- View system activity logs
- Manage backups and restore
- Access storage health monitoring
- Access all engineering modules in any project

**Access Level:** Global (bypasses project-level RLS)

### STAFF (Project Member)

**Capabilities:**
- View only assigned projects (via project_assignments table)
- Access engineering modules within assigned projects
- VIEW permission: Read-only access to project data
- EDIT permission: Create/modify project data (wells, designer, geology, monitoring, docs)
- Create project documentation and reports within authorized projects
- Cannot create accounts
- Cannot assign projects
- Cannot access admin-only functions

**Access Level:** Project-scoped (enforced by RLS)

## Account Status

| Status | Description | Can Login | Can Access API |
|--------|-------------|-----------|----------------|
| `approved` | Active account | Yes | Yes |
| `pending` | Awaiting admin action (legacy) | No | No |
| `rejected` | Registration rejected | No | No |
| `suspended` | Temporarily disabled by admin | No | No |

**Note:** New accounts created by admins are immediately `approved`. The `pending` status only exists for legacy self-registered accounts.

## Account Lifecycle

### Creation (Admin Only)

1. Admin navigates to **User Management** page
2. Clicks "Tambah Pengguna" (Add User)
3. Fills: Email, Password (min 12 chars), Full Name, Role (Admin/Staf)
4. Account created with `approved` status, `approved_at` = now, `approved_by` = admin
5. User can immediately log in

### Suspension/Activation

1. Admin clicks "Suspend" on active user or "Aktifkan" on suspended user
2. Backend updates user status to `suspended` or `approved`
3. All refresh tokens revoked (user logged out on all devices)
4. User cannot log in until reactivated

### Deletion

**No hard delete.** Users are suspended instead.
- Preserves audit trail and activity logs
- Prevents orphaned foreign keys
- Admin can "delete" by suspending with reason "Deleted by admin"

### Legacy Accounts

Existing accounts with `pending` or `rejected` status:
- Preserved in database
- Cannot log in until admin approves or reactivates
- Admin can approve (→ `approved`) or keep rejected

## Password Security

- Argon2id hashing (configurable time, memory, threads, keylen)
- Minimum 12 characters enforced at creation
- No password complexity rules beyond length
- Passwords never logged or exposed in API responses

## Session Management

- Access token: JWT, 15 minutes, stored in memory only
- Refresh token: 30 days, HttpOnly cookie, rotated on each use
- Token family tracking prevents replay attacks
- Automatic refresh before API requests (frontend)
- Logout revokes refresh token server-side
- Suspension/rejection revokes all user sessions

## API Endpoints

### Auth (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login, returns access token + sets refresh cookie |
| GET | `/api/v1/auth/me` | Get current user (requires auth) |
| POST | `/api/v1/auth/logout` | Logout (requires auth + refresh cookie) |
| POST | `/api/v1/auth/refresh` | Refresh access token (requires refresh cookie) |

### Admin User Management (Admin Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/users/pending` | List pending users (legacy) |
| GET | `/api/v1/admin/users` | List all users with filters |
| POST | `/api/v1/admin/users` | Create new user (approved immediately) |
| POST | `/api/v1/admin/users/:id/approve` | Approve pending user |
| POST | `/api/v1/admin/users/:id/reject` | Reject pending user |
| POST | `/api/v1/admin/users/:id/suspend` | Suspend user |
| POST | `/api/v1/admin/users/:id/unsuspend` | Reactivate suspended user |

### Admin Project Assignment (Admin Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/projects/:id/assignments` | List project assignments |
| POST | `/api/v1/admin/projects/:id/assignments` | Create assignment |
| PUT | `/api/v1/admin/projects/:id/assignments/:userId` | Update permission |
| DELETE | `/api/v1/admin/projects/:id/assignments/:userId` | Remove assignment |

## Frontend Pages

### Login Page (`/login`)
- Email/password form
- Redirects to dashboard on success
- Shows error for invalid credentials, suspended, rejected, pending accounts

### User Management (`/user-management`, Admin Only)
- Table with search, filter by status/role, pagination
- "Tambah Pengguna" modal for creating accounts
- Row actions: Approve/Reject (pending), Suspend/Activate (approved), Delete (suspend)

### Project Assignment (`/project-assignment`, Admin Only)
- Accessed after selecting a project in project list view
- Table of current assignments with permission badges
- "Tambah Assignment" modal: select user (dropdown of unassigned approved users), permission
- Edit permission inline, delete assignment

## RLS Enforcement

The `user_can_access_project(project_id, user_id)` SQL function is used in all RLS policies:

```sql
CREATE OR REPLACE FUNCTION user_can_access_project(p_project_id UUID, p_user_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.role = 'admin')
        OR EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.owner_id = p_user_id)
        OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p_project_id AND pa.user_id = p_user_id);
$$;
```

**Effective Permission Logic:**
1. If user is admin → `admin` (full access)
2. If user owns project → `edit` (owner has edit)
3. If user has assignment → assignment permission (`view` or `edit`)
4. Otherwise → no access

## Migration Notes

### From Self-Registration to Admin-Created

**Before:** Users registered publicly → `pending` → admin approved/rejected
**After:** Admin creates users directly → `approved` immediately

**Database Impact:**
- `pending` accounts remain but cannot be created new
- Registration endpoint removed
- Admin approval workflow retained for legacy pending accounts

### Preserved Data
- All existing users, projects, wells, modules, docs, activity logs
- Password hashes, refresh tokens, sessions
- No data loss or reset required

## Testing Checklist

- [ ] Admin login works
- [ ] Staff login works (assigned project)
- [ ] Staff login fails (unassigned project)
- [ ] Admin can create staff account
- [ ] Admin can create admin account
- [ ] Admin can suspend/activate users
- [ ] Suspended user cannot log in
- [ ] Admin can assign staff to project (VIEW)
- [ ] Admin can assign staff to project (EDIT)
- [ ] Admin can change assignment permission
- [ ] Admin can remove assignment
- [ ] Staff with VIEW cannot modify data
- [ ] Staff with EDIT can modify data
- [ ] Staff cannot access unassigned project by UUID
- [ ] Admin sees all projects
- [ ] Staff sees only assigned projects
- [ ] Refresh token rotation works
- [ ] Session revoked on suspend
- [ ] RLS blocks cross-project access at DB level
PY