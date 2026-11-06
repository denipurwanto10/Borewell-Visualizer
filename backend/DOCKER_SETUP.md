# Docker Setup for Borewell Backend

## Overview

This document describes the Docker Compose setup for running PostgreSQL 16 locally for development.

## Services

### PostgreSQL (Required)

- **Image**: `postgres:16-alpine`
- **Container**: `borewell-postgres`
- **Port**: `127.0.0.1:5433` → `5432` (container)
- **Database**: `borewell`
- **User**: `borewell_app`
- **Password**: From `POSTGRES_PASSWORD` env var

### pgAdmin (Optional)

- **Image**: `dpage/pgadmin4:latest`
- **Container**: `borewell-pgadmin`
- **Port**: `127.0.0.1:5050` → `80` (container)
- **Credentials**: From `PGADMIN_EMAIL` / `PGADMIN_PASSWORD`

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Edit .env with secure passwords
# Minimum: change POSTGRES_PASSWORD, JWT_SECRET, REFRESH_TOKEN_SECRET

# 3. Start PostgreSQL
docker compose up -d postgres

# 4. Wait for healthcheck (10-30 seconds)
docker compose ps postgres

# 5. Run migrations
go run ./cmd/migrate up

# 6. (Optional) Start pgAdmin
docker compose up -d pgadmin
```

## Configuration

### Environment Variables (.env)

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password |
| `PGADMIN_EMAIL` | pgAdmin login email |
| `PGADMIN_PASSWORD` | pgAdmin login password |
| `DATABASE_URL` | App connection string (uses borewell_app user) |

### Docker Compose Override

For local customization, create `docker-compose.override.yml`:

```yaml
version: '3.8'
services:
  postgres:
    ports:
      - "5433:5432"  # Expose to all interfaces (not just localhost)
    environment:
      POSTGRES_PASSWORD: "localdev"
```

## Data Persistence

- **Volume**: `postgres_data` (named volume)
- **Location**: Docker managed (`/var/lib/docker/volumes/...`)
- **Survives**: `docker compose down`, container recreation
- **Destroyed**: `docker compose down -v` ⚠️

## Connecting

### From Backend (Go)
```env
DATABASE_URL=postgres://borewell_app:app_password_change_me@localhost:5433/borewell
```

### From psql (Host)
```bash
psql -h localhost -p 5433 -U borewell_app -d borewell
```

### From pgAdmin
1. Open http://localhost:5050
2. Login with `PGADMIN_EMAIL` / `PGADMIN_PASSWORD`
3. Add server:
   - Host: `postgres` (container name) or `host.docker.internal`
   - Port: `5432`
   - Database: `borewell`
   - User: `borewell_app`

## Database Roles

The init script (`init-scripts/01-roles.sql`) creates two roles:

| Role | Purpose | Can Do |
|------|---------|--------|
| `borewell_migrate` | Run migrations (DDL) | CREATE/ALTER/DROP tables, indexes, functions |
| `borewell_app` | Application runtime (DML) | SELECT/INSERT/UPDATE/DELETE on tables |

**Application never uses superuser or table owner.**

## Healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U borewell_app -d borewell"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

Wait for `healthy` status before running migrations:
```bash
docker compose ps postgres
# STATUS should show: Up ... (healthy)
```

## Troubleshooting

### Port 5433 already in use
```bash
# Check what's using it
netstat -an | findstr :5433

# Change port in docker-compose.yml and .env
ports:
  - "127.0.0.1:5434:5432"
```

### Container won't start
```bash
# Check logs
docker compose logs postgres

# Common issues:
# - POSTGRES_PASSWORD not set
# - Volume permission issues (Windows)
# - Port conflict
```

### Reset Database (DESTROYS DATA)
```bash
docker compose down -v
docker compose up -d postgres
go run ./cmd/migrate up
```

### Connect from another container
Use service name `postgres` and port `5432`:
```env
DATABASE_URL=postgres://borewell_app:password@postgres:5432/borewell
```

## Production Notes

For production deployment:
1. Use managed PostgreSQL (RDS, Cloud SQL, etc.)
2. Remove pgAdmin
3. Use Docker secrets for passwords
4. Enable SSL/TLS
5. Configure backups and monitoring
6. Use `restart: always` policy