# Borewell Engineering Visualizer - Backend

Go 1.22+ backend with Gin, PostgreSQL 16, pgx/v5, and Goose migrations.

## Quick Start

### Prerequisites
- Go 1.22+
- Docker & Docker Compose (for PostgreSQL)
- Make (optional)

### Setup

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

2. **Start PostgreSQL:**
   ```bash
   docker compose up -d
   ```

3. **Run migrations:**
   ```bash
   go run ./cmd/migrate up
   ```

4. **Start server:**
   ```bash
   go run ./cmd/server
   ```

5. **Verify health:**
   ```bash
   curl http://localhost:8080/api/v1/health
   curl http://localhost:8080/api/v1/ready
   ```

### Bootstrap Admin (First Admin User)

```bash
go run ./cmd/bootstrap-admin --email admin@example.com --password "securePassword123" --name "Admin User"
```

## Project Structure

```
backend/
├── cmd/
│   ├── server/           # Main HTTP server
│   ├── migrate/          # Goose migration runner
│   └── bootstrap-admin/  # CLI to create first admin
├── internal/
│   ├── config/           # Viper configuration
│   ├── database/         # pgxpool connection
│   ├── handler/          # HTTP handlers
│   ├── middleware/       # Gin middleware
│   ├── model/            # Domain models
│   ├── repository/       # Data access layer
│   ├── service/          # Business logic
│   ├── router/           # Route registration
│   └── logger/           # Structured logging (zap)
├── migrations/           # Goose SQL migrations
├── init-scripts/         # PostgreSQL init scripts
├── tests/                # Test files
├── docker-compose.yml    # PostgreSQL + optional pgAdmin
├── .env.example          # Environment template
├── go.mod / go.sum
└── README.md
```

## Commands

### Build
```bash
go build -o bin/server ./cmd/server
go build -o bin/migrate ./cmd/migrate
go build -o bin/bootstrap-admin ./cmd/bootstrap-admin
```

### Run Tests
```bash
go test ./...
go test -v ./internal/...
go test -tags=integration ./...
```

### Migrations
```bash
# Apply all migrations
go run ./cmd/migrate up

# Rollback last migration
go run ./cmd/migrate down

# Show status
go run ./cmd/migrate status

# Show current version
go run ./cmd/migrate version

# Create new migration
go run ./cmd/migrate create migration_name
```

### Docker
```bash
# Start PostgreSQL only
docker compose up -d postgres

# Start with pgAdmin (uncomment in docker-compose.yml)
docker compose up -d

# View logs
docker compose logs -f postgres

# Stop
docker compose down

# Stop and remove volumes (DESTROYS DATA)
docker compose down -v
```

## Database Roles

| Role | Purpose | Privileges |
|------|---------|------------|
| `borewell_migrate` | Migration runner (DDL) | CREATE, ALTER, DROP, GRANT |
| `borewell_app` | Application runtime (DML) | SELECT, INSERT, UPDATE, DELETE |

**Never use superuser for application connections.**

## Row Level Security (RLS)

RLS is enabled on all user-owned tables as defense-in-depth. Primary authorization is enforced in the Go repository layer.

Policies use `current_setting('app.current_user_id')` which must be set at the start of each request transaction:

```sql
SET LOCAL app.current_user_id = 'user-uuid';
```

See `migrations/006_rls_policies.sql` for all policies.

**Note:** RLS requires authentication middleware (FS2) to be fully tested. In FS1, policies exist but are not yet activated by the application.

## Health Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /api/v1/health` | Liveness | Process alive |
| `GET /api/v1/ready` | Readiness | Database connectivity |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV` | No | `development` | Environment (development/production) |
| `APP_PORT` | No | `8080` | HTTP server port |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string |
| `DATABASE_MAX_CONNECTIONS` | No | `20` | Max pool connections |
| `DATABASE_MIN_CONNECTIONS` | No | `5` | Min pool connections |
| `DATABASE_MAX_LIFETIME` | No | `1h` | Connection max lifetime |
| `DATABASE_MAX_IDLE_TIME` | No | `30m` | Connection max idle time |
| `LOG_LEVEL` | No | `info` | Log level (debug/info/warn/error) |
| `FILE_STORAGE_PATH` | No | `./data/files` | File storage root |
| `JWT_SECRET` | **Yes** | - | JWT signing secret (32+ chars) |
| `REFRESH_TOKEN_SECRET` | **Yes** | - | Refresh token secret (32+ chars) |
| `ARGON2_TIME` | No | `3` | Argon2id time parameter |
| `ARGON2_MEMORY` | No | `65536` | Argon2id memory (KB) |
| `ARGON2_THREADS` | No | `4` | Argon2id threads |
| `ARGON2_KEYLEN` | No | `32` | Argon2id key length |

## Security Notes

- Never commit `.env` file
- Use strong secrets in production (32+ random chars)
- JWT_SECRET and REFRESH_TOKEN_SECRET must differ
- Database passwords via Docker secrets or env vars only
- RLS is defense-in-depth; application-layer checks are primary

## Development

### Adding a Migration
```bash
go run ./cmd/migrate create add_new_table
# Edit migrations/XXXX_add_new_table.sql (up/down)
go run ./cmd/migrate up
```

### Running with Local PostgreSQL (no Docker)
Update `.env` with your local PostgreSQL connection string:
```env
DATABASE_URL=postgres://user:pass@localhost:5432/borewell
```

## Troubleshooting

### Migration fails
```bash
# Check status
go run ./cmd/migrate status

# Check database connection
docker compose logs postgres
```

### Port conflicts
- PostgreSQL Docker: 5433 (host) → 5432 (container)
- Backend: 8080
- Change in `docker-compose.yml` and `.env` if needed

### Database connection refused
- Ensure Docker is running: `docker compose ps`
- Check healthcheck: `docker compose ps postgres`
- Verify DATABASE_URL in `.env` matches Docker port (5433)

## License

Internal project - not for distribution.