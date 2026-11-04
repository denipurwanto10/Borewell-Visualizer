# Local Development Guide

## Overview

This guide covers setting up and running the Borewell Engineering Visualizer locally for development.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.22+ | Backend compilation |
| Node.js | 20+ | Frontend build/dev |
| npm | 10+ | Package management |
| PostgreSQL | 15+ | Database (via Docker) |
| Docker | 24+ | PostgreSQL container |
| Git | 2.40+ | Version control |

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd visualisasi_pipa
```

### 2. Start PostgreSQL (Docker)

```bash
cd backend
docker compose up -d postgres
```

Wait for health check (≈10 seconds):
```bash
docker compose ps postgres
# Should show "healthy"
```

### 3. Configure Backend

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# Minimum required:
# DATABASE_URL=postgres://postgres:password@localhost:5432/borewell?sslmode=disable
# JWT_SECRET=your-jwt-secret-minimum-32-characters
# REFRESH_TOKEN_SECRET=your-refresh-secret-minimum-32-characters
```

**Default .env.example values:**
```
APP_ENV=development
APP_PORT=8080
DATABASE_URL=postgres://postgres:password@localhost:5432/borewell?sslmode=disable
JWT_SECRET=dev-jwt-secret-change-in-production-min-32-chars
REFRESH_TOKEN_SECRET=dev-refresh-secret-change-in-production-min-32-chars
FILE_STORAGE_PATH=./data/files
LOG_LEVEL=info
ARGON2_TIME=3
ARGON2_MEMORY=65536
ARGON2_THREADS=4
ARGON2_KEYLEN=32
```

### 4. Apply Database Migrations

```bash
go run ./cmd/migrate up
```

Verify:
```bash
go run ./cmd/migrate status
# Should show all migrations applied (14 total)
```

### 5. Create Admin User

```bash
go run ./cmd/bootstrap-admin -email admin@example.com -password "StrongPassword123"
```

**Output:**
```
Admin user created: admin@example.com
```

### 6. Start Backend Server

```bash
go run ./cmd/server
```

**Output:**
```
server listening on :8080
```

### 7. Start Frontend (New Terminal)

```bash
cd ..  # back to project root
npm install
npm run dev
```

**Output:**
```
VITE v5.x.x ready in xxx ms
Local:   http://localhost:5173
Network: http://192.168.x.x:5173
```

### 8. Access Application

Open http://localhost:5173 in browser

**Login:**
- Email: `admin@example.com`
- Password: `StrongPassword123`

## Development Workflow

### Backend Development

```bash
cd backend

# Run tests
go test ./... -count=1

# Run specific test
go test ./tests/fs3/ -v -run TestProjectCRUD

# Build
go build ./...

# Vet
go vet ./...

# Format
go fmt ./...

# Generate mocks (if needed)
go generate ./...
```

### Frontend Development

```bash
cd ..  # project root

# Dev server with hot reload
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint (if configured)
npm run lint
```

### Database Operations

```bash
cd backend

# Migration status
go run ./cmd/migrate status

# Create new migration
go run ./cmd/migrate create add_new_feature

# Rollback last migration
go run ./cmd/migrate down

# Reset test database
DATABASE_URL="postgres://borewell_app:app_password_change_me@localhost:5433/borewell_fs3_test?sslmode=disable" \
go run ./cmd/migrate up
```

### Common Commands

| Task | Command |
|------|---------|
| Start all | `docker compose up -d && go run ./cmd/server` (backend) + `npm run dev` (frontend) |
| Stop all | `Ctrl+C` (both terminals) + `docker compose down` |
| Reset DB | `docker compose down -v && docker compose up -d postgres && go run ./cmd/migrate up` |
| View logs | `docker compose logs -f postgres` |
| DB shell | `docker exec -it postgres-borewell psql -U postgres -d borewell` |

## Project Structure

```
visualisasi_pipa/
├── backend/
│   ├── cmd/
│   │   ├── server/          # Main server entry
│   │   ├── migrate/         # Migration CLI
│   │   ├── bootstrap-admin/ # Admin user creation
│   │   └── ...
│   ├── internal/
│   │   ├── auth/            # JWT, password, sessions
│   │   ├── config/          # Configuration
│   │   ├── database/        # DB connection, RLS helpers
│   │   ├── handler/         # HTTP handlers
│   │   ├── middleware/      # Auth, CSRF, rate limit
│   │   ├── model/           # Data models
│   │   ├── repository/      # Data access layer
│   │   └── router/          # Route registration
│   ├── migrations/          # SQL migrations (14 files)
│   ├── init-scripts/        # Docker init scripts
│   ├── docker-compose.yml   # PostgreSQL service
│   └── go.mod/sum
├── src/
│   ├── components/
│   │   ├── admin/           # Admin pages (UserManagement, ProjectAssignment)
│   │   ├── auth/            # Login, pending, rejected, suspended
│   │   ├── layout/          # AppShell, AuthLayout
│   │   └── ...              # Feature pages
│   ├── context/             # React contexts (Auth, Project)
│   ├── api/                 # API client
│   ├── designer/            # Well designer modules
│   ├── geology/             # Geological log modules
│   ├── monitoring/          # Groundwater monitoring
│   ├── documentation/       # Photos/documents
│   ├── storage/             # LocalStorage/IndexedDB
│   ├── hooks.js             # Custom React hooks
│   ├── pdf.js               # PDF generation
│   ├── App.jsx              # Main app routing
│   └── main.jsx             # Entry point
├── public/                  # Static assets
├── index.html               # HTML template
├── vite.config.js           # Vite config
├── package.json
└── package-lock.json
```

## Configuration Reference

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| APP_ENV | development | `development` or `production` |
| APP_PORT | 8080 | HTTP server port |
| DATABASE_URL | (required) | PostgreSQL connection string |
| MIGRATION_DATABASE_URL | DATABASE_URL | Separate migration connection |
| DATABASE_MAX_CONNECTIONS | 20 | Pool max connections |
| DATABASE_MIN_CONNECTIONS | 5 | Pool min connections |
| DATABASE_MAX_LIFETIME | 1h | Connection max lifetime |
| DATABASE_MAX_IDLE_TIME | 30m | Connection max idle time |
| JWT_SECRET | (required) | JWT signing secret (32+ chars) |
| REFRESH_TOKEN_SECRET | (required) | Refresh token secret (32+ chars) |
| FILE_STORAGE_PATH | ./data/files | Local file storage directory |
| LOG_LEVEL | info | `debug`, `info`, `warn`, `error` |
| ARGON2_TIME | 3 | Argon2 iterations |
| ARGON2_MEMORY | 65536 | Argon2 memory (KB) |
| ARGON2_THREADS | 4 | Argon2 parallelism |
| ARGON2_KEYLEN | 32 | Argon2 output length |

### Frontend Configuration

**vite.config.js** - Proxy for API:
```javascript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  // ... build config
})
```

## Troubleshooting

### Backend Won't Start

| Issue | Solution |
|-------|----------|
| `failed to load configuration` | Check `.env` exists in `backend/` |
| `dial tcp: connection refused` | PostgreSQL not running: `docker compose up -d postgres` |
| `role "borewell_app" does not exist` | Run init scripts: `docker compose up -d postgres` |
| `migration failed` | Check DATABASE_URL, run `go run ./cmd/migrate status` |
| `JWT_SECRET too short` | Use 32+ character secret |

### Frontend Won't Start

| Issue | Solution |
|-------|----------|
| `npm install` fails | Clear cache: `npm cache clean --force && rm -rf node_modules package-lock.json && npm install` |
| `vite: not found` | Run `npm install` |
| Build fails | Check Node version (20+), clear dist: `rm -rf dist` |
| API calls fail | Backend not running, or proxy misconfigured |

### Database Issues

| Issue | Solution |
|-------|----------|
| `relation "xxx" does not exist` | Run `go run ./cmd/migrate up` |
| `permission denied for table` | Check RLS policies, verify migration applied |
| `duplicate key value` | Unique constraint violation, check data |
| `RLS policy blocks query` | Verify user has assignment, `app.current_user_id` set |

### Authentication Issues

| Issue | Solution |
|-------|----------|
| `Invalid credentials` | Check email/password, user status = approved |
| `Account suspended` | Admin must unsuspend user |
| `Refresh token 401` | Cookie not sent (check SameSite, Secure, domain) |
| `CORS error` | Backend CORS allow-list includes frontend origin |

## Testing Checklist

Before committing:

- [ ] `go test ./... -count=1` passes
- [ ] `go vet ./...` clean
- [ ] `go build ./...` succeeds
- [ ] `npm run build` succeeds
- [ ] Manual login works (admin + staff)
- [ ] Project assignment works (admin creates, staff accesses)
- [ ] VIEW permission blocks writes
- [ ] EDIT permission allows writes
- [ ] Unassigned staff cannot access project
- [ ] Admin sees all projects
- [ ] Staff sees only assigned projects

## Production Deployment Notes

This is a **development/local guide only**. For production:

1. **HTTPS/TLS** - Required for secure cookies
2. **Secrets** - Use strong random secrets (32+ chars)
3. **Database** - Use managed PostgreSQL (Cloud SQL, RDS, etc.)
4. **File Storage** - Use S3/GCS instead of local filesystem
5. **Reverse Proxy** - Nginx/Traefik for TLS termination
6. **Monitoring** - Log aggregation, metrics, alerting
7. **Backups** - Automated pg_dump + file storage backup
7. **Secrets Management** - Vault, AWS Secrets Manager, etc.

## Useful Scripts

### Reset Everything (Nuclear Option)

```bash
# Stop everything
docker compose down -v

# Clean frontend
cd ..
rm -rf node_modules package-lock.json dist

# Clean backend
cd backend
go clean -cache -modcache -testcache

# Restart
docker compose up -d postgres
go run ./cmd/migrate up
go run ./cmd/bootstrap-admin -email admin@example.com -password "StrongPassword123"
go run ./cmd/server &

cd ..
npm install
npm run dev
```

### Backup/Restore Development Data

```bash
# Backup
pg_dump -h localhost -U postgres -d borewell -Fc -f dev_backup_$(date +%Y%m%d).dump

# Restore
pg_restore -h localhost -U postgres -d borewell -c dev_backup_20241104.dump
```

## IDE Setup

### VS Code Extensions (Recommended)

- Go (golang.go)
- ES7+ React/Redux/React-Native snippets
- Tailwind CSS IntelliSense (if using)
- ESLint
- Prettier
- Docker
- PostgreSQL (for DB queries)

### Debug Configuration (launch.json)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Backend",
      "type": "go",
      "request": "launch",
      "mode": "auto",
      "program": "${workspaceFolder}/backend/cmd/server",
      "envFile": "${workspaceFolder}/backend/.env"
    },
    {
      "name": "Launch Frontend",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

## Performance Tips

### Backend

- Use `go build -ldflags="-s -w"` for smaller binaries
- Enable connection pooling (configured via env)
- Use `EXPLAIN ANALYZE` for slow queries

### Frontend

- `npm run build` creates optimized production build
- Code splitting via Vite manualChunks
- Lazy load heavy modules (jsPDF, JSZip, html2canvas)

## License

MIT License - See LICENSE file for details.
PY