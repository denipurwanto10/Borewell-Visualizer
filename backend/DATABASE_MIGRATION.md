# Database Migration Guide

## Overview

This project uses **Goose** for database migrations with versioned SQL files (up/down).

## Migration Files

Located in `migrations/`:

| File | Description | Tables |
|------|-------------|--------|
| `001_init_users.sql` | Users, sessions, activity logs | users, refresh_sessions, activity_logs |
| `002_init_projects.sql` | Projects and wells | projects, wells |
| `003_init_modules.sql` | Engineering modules | designer_states, geological_logs, groundwater_monitoring |
| `004_init_files.sql` | Files and documentation | files, documentation_photos, documentation_documents |
| `005_init_backups.sql` | Backup manifests | backup_manifests |
| `006_rls_policies.sql` | Row Level Security | (policies only) |
| `007_indexes.sql` | Composite indexes | (indexes only) |
| `008_triggers.sql` | Updated_at triggers | (functions + triggers) |

Each migration has `up` (apply) and `down` (rollback) sections.

## Commands

### Apply All Migrations
```bash
go run ./cmd/migrate up
```

### Rollback Last Migration
```bash
go run ./cmd/migrate down
```

### Check Status
```bash
go run ./cmd/migrate status
```
Output:
```
Applied At                  Migration
========================================
2024-01-15 10:30:00         001_init_users
2024-01-15 10:30:01         002_init_projects
...
Pending:
(none)
```

### Show Current Version
```bash
go run ./cmd/migrate version
```

### Create New Migration
```bash
go run ./cmd/migrate create add_user_avatar
```
Creates `migrations/XXXX_add_user_avatar.sql` with up/down template.

## Running Migrations

### Prerequisites
1. PostgreSQL running (Docker or local)
2. `.env` configured with `DATABASE_URL`
3. Database exists (created by Docker init script)

### Development Workflow
```bash
# 1. Start DB
docker compose up -d postgres

# 2. Wait for healthy
docker compose ps postgres

# 3. Apply migrations
go run ./cmd/migrate up

# 4. Verify
go run ./cmd/migrate status
```

### Testing Migrations (Disposable DB)
```bash
# Create test database
createdb -h localhost -p 5433 -U borewell_app borewell_test

# Run migrations against test DB
DATABASE_URL=postgres://borewell_app:password@localhost:5433/borewell_test go run ./cmd/migrate up

# Run tests
go test ./...

# Cleanup
dropdb -h localhost -p 5433 -U borewell_app borewell_test
```

## Migration Best Practices

### Writing Migrations

1. **Always include down migration** - Must be reversible
2. **Use transactions** - Goose wraps each migration in a transaction
3. **Order dependencies** - FK dependencies determine order
4. **Idempotent where possible** - Use `IF NOT EXISTS`, `IF EXISTS`
5. **Test down migration** - Run `up` then `down` then `up` again

### Example Migration Template
```sql
-- +goose Up
-- +goose StatementBegin

CREATE TABLE example (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_example_name ON example(name);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS example;

-- +goose StatementEnd
```

### JSONB Constraints
Use PostgreSQL JSONB path existence checks:
```sql
ALTER TABLE designer_states ADD CONSTRAINT chk_designer_components
CHECK (
    jsonb_typeof(components) = 'array' AND
    components @? '$.? (@.id && @.type && @.startDepth && @.name)'
);
```

### Triggers
Use `plpgsql` functions for `updated_at`:
```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;
```

## RLS (Row Level Security)

Migration `006_rls_policies.sql` enables RLS on all user-owned tables.

**Key points:**
- Primary authorization is in Go repository layer
- RLS is defense-in-depth
- Policies use `current_setting('app.current_user_id')`
- Application must `SET LOCAL app.current_user_id = 'uuid'` per transaction
- **Not yet tested with real users** (auth in FS2)

### Testing RLS (Manual)
```sql
-- As superuser
SET ROLE borewell_app;
SET LOCAL app.current_user_id = 'user-uuid-here';
SELECT * FROM projects; -- Should only return user's projects
RESET ROLE;
```

## Rollback Procedures

### Single Migration Rollback
```bash
go run ./cmd/migrate down
```

### Full Rollback (Destroy All Data)
```bash
# WARNING: Deletes all data
go run ./cmd/migrate down
# Repeat until version 0
```

### Point-in-Time Recovery
Use PostgreSQL `pg_dump` / `pg_restore` for production backups.

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Migrations
  run: |
    go run ./cmd/migrate up
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Pre-deployment Check
```bash
# Verify migrations apply cleanly
go run ./cmd/migrate status
# Should show "Pending: (none)" after up
```

## Troubleshooting

### Migration Lock
If migration crashes mid-run, Goose may leave a lock:
```sql
-- Connect as superuser
SELECT * FROM goose_db_version;
DELETE FROM goose_db_version WHERE is_applied = false;
```

### Dirty State
```bash
go run ./cmd/migrate status
# If shows "dirty", fix manually then:
go run ./cmd/migrate down
go run ./cmd/migrate up
```

### Foreign Key Errors
Check migration order - parent tables must be created before children.

### Permission Errors
Ensure migration role (`borewell_migrate`) has CREATE privileges.

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2024-11-03 | Initial schema: users, sessions, activity |
| 2 | 2024-11-03 | Projects and wells |
| 3 | 2024-11-03 | Engineering modules (designer, geology, monitoring) |
| 4 | 2024-11-03 | Files and documentation |
| 5 | 2024-11-03 | Backup manifests |
| 6 | 2024-11-03 | RLS policies |
| 7 | 2024-11-03 | Composite indexes |
| 8 | 2024-11-03 | Updated_at triggers |

## Related Documents

- `DATABASE_SCHEMA_DESIGN.md` - Full schema specification
- `DOCKER_SETUP.md` - PostgreSQL Docker setup
- `README.md` - General backend documentation