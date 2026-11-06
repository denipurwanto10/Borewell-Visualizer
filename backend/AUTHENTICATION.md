# Authentication — Borewell Engineering Visualizer v2.0.0

## Ringkasan

Dokumen ini menjelaskan sistem autentikasi backend untuk FS2 (Authentication & Admin Approval). Sistem menyediakan akun lokal dengan registrasi, login, JWT access token, refresh token rotation, dan admin approval workflow.

## Arsitektur

### Komponen

| Komponen | Path | Tanggung Jawab |
|----------|------|----------------|
| Password hashing | `internal/auth/password.go` | Argon2id hashing, verifikasi, rehash |
| Token management | `internal/auth/token.go` | JWT access token, refresh token opaque, hashing |
| Session store | `internal/auth/session.go` | Refresh session CRUD, rotasi, revocation |
| User repository | `internal/repository/user.go` | CRUD pengguna, daftar pending, status update |
| Auth handler | `internal/handler/auth/handler.go` | Register, login, logout, refresh, me |
| Admin handler | `internal/handler/admin/handler.go` | Approve, reject, suspend, reactivate, list |
| Auth middleware | `internal/middleware/auth/auth.go` | JWT verifikasi, role-based access |

## Alur Registrasi

1. Pengguna mengirim `POST /api/v1/auth/register` dengan `email`, `password`, `password_confirmation`, `full_name`.
2. Backend memvalidasi format email, konfirmasi password, dan password policy (min 12 karakter).
3. Password di-hash menggunakan Argon2id dengan salt random.
4. Pengguna dibuat dengan role `USER`, status `PENDING`.
5. Tidak ada session aktif dibuat untuk pengguna baru.
6. Respons 201 dengan informasi pengguna dan pesan menunggu persetujuan.

## Bootstrap Admin

Command CLI `cmd/bootstrap-admin/main.go` membuat akun ADMIN pertama:

- Hanya dapat dijalankan jika belum ada admin yang approved.
- Password diminta melalui terminal tersembunyi (`term.ReadPassword`).
- Alternatif environment variable tersedia dengan peringatan keamanan.
- Password di-hash Argon2id, role `ADMIN`, status `APPROVED`.
- Menggunakan transaksi database.
- Mencegah pembuatan admin duplikat.

## Alur Login

1. `POST /api/v1/auth/login` dengan `email` dan `password`.
2. Backend memeriksa email, password (Argon2id), dan status akun.
3. PENDING → 403 "Account Pending Approval".
4. REJECTED → 403 "Account Rejected".
5. SUSPENDED → 403 "Account Suspended".
6. Invalid credentials → 401 pesan generik (tidak membedakan email salah atau password salah).
7. Jika berhasil: access token (JWT, 15 menit) + refresh token (HttpOnly cookie, 30 hari).
8. Refresh token hash disimpan di database.

## Token Lifecycle

| Token | Tipe | Masa Berlaku | Penyimpanan | Pengiriman |
|-------|------|-------------|-------------|------------|
| Access Token | JWT HS256 | 15 menit | Memori frontend | `Authorization: Bearer` |
| Refresh Token | Opaque string | 30 hari | HttpOnly cookie | Cookie (tidak dalam JSON) |

### Refresh Token Rotation

Setiap `POST /api/v1/auth/refresh`:
1. Baca refresh token dari cookie.
2. Verifikasi hash terhadap database.
3. Periksa session belum dicabut dan belum kedaluwarsa.
4. Periksa akun masih APPROVED dan aktif.
5. Buat refresh token baru, hash, simpan atomically.
6. Revoke refresh token lama dalam transaksi yang sama.
7. Set cookie baru dengan atribut sama.

### Token Reuse Detection

Jika refresh token lama digunakan kembali (mungkin mencurigakan):
1. Revoke seluruh session family (semua session dengan token_family yang sama).
2. Catat security event di activity_logs.
3. Respons 401.

## Cookie Attributes

| Atribut | Nilai (Development) | Nilai (Production) |
|---------|---------------------|-------------------|
| `HttpOnly` | true | true |
| `SameSite` | Lax | Lax/Strict |
| `Secure` | false (localhost HTTP) | true (HTTPS) |
| `Path` | / | / |
| `Max-Age` | 2592000 (30 hari) | 2592000 (30 hari) |

## Password Security

- Algoritma: Argon2id
- Parameter default: time=3, memory=64MB, threads=4, keyLen=32
- Salt: random 16 byte untuk setiap password
- Encoded hash menyimpan parameter untuk verifikasi dan rehash
- Constant-time comparison menggunakan `crypto/subtle.ConstantTimeCompare`
- Password tidak pernah dicetak ke log
- Password hash tidak pernah dikembalikan via API

### Password Policy

- Minimal 12 karakter
- Maksimal 128 karakter
- Password kosong ditolak
- Tidak ada trimming diam-diam
- Pesan validasi yang jelas

## Role dan Status Akun

| Role | Deskripsi |
|------|-----------|
| `admin` | Akses penuh ke endpoint admin |
| `user` | Akses ke fitur aplikasi umum |

| Status | Deskripsi |
|--------|-----------|
| `pending` | Menunggu persetujuan admin |
| `approved` | Aktif, dapat login |
| `rejected` | Pendaftaran ditolak |
| `suspended` | Akun dinonaktifkan sementara |

## Endpoint

| Method | Endpoint | Deskripsi | Akses |
|--------|----------|-----------|-------|
| POST | `/api/v1/auth/register` | Registrasi pengguna baru | Public |
| POST | `/api/v1/auth/login` | Login dan terbitkan token | Public |
| POST | `/api/v1/auth/logout` | Revoke session dan hapus cookie | Auth |
| POST | `/api/v1/auth/refresh` | Rotasi access token | Auth (cookie) |
| GET | `/api/v1/auth/me` | Informasi pengguna saat ini | Auth |
| GET | `/api/v1/admin/users/pending` | Daftar pengguna pending | Admin |
| GET | `/api/v1/admin/users` | Daftar semua pengguna | Admin |
| POST | `/api/v1/admin/users/{id}/approve` | Setujui pengguna | Admin |
| POST | `/api/v1/admin/users/{id}/reject` | Tolak pengguna | Admin |
| POST | `/api/v1/admin/users/{id}/suspend` | Tangguhkan pengguna | Admin |
| POST | `/api/v1/admin/users/{id}/unsuspend` | Aktifkan kembali | Admin |

## Rate Limiting

| Endpoint Group | Limit |
|----------------|-------|
| Login / Register | 5 req/min per IP |
| Refresh | 10 req/min per user |
| Admin actions | 30 req/min per admin |

## Konfigurasi Environment

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `JWT_SECRET` | Secret untuk signing JWT | (required) |
| `REFRESH_TOKEN_SECRET` | Secret untuk refresh token | (required) |
| `ARGON2_TIME` | Argon2 iterations | 3 |
| `ARGON2_MEMORY` | Argon2 memory (KB) | 65536 |
| `ARGON2_THREADS` | Argon2 parallelism | 4 |
| `ARGON2_KEYLEN` | Argon2 key length | 32 |
| `APP_ENV` | Environment | development |

## RLS Verifikasi

Refresh sessions tabel dilindungi oleh RLS policy `sessions_owner` yang membatasi akses berdasarkan `app.current_user_id`. Context diset per transaksi menggunakan `SET LOCAL` sebelum operasi DML.

## Session Revocation Behavior

### What Happens When Admin Suspends a User

1. Admin calls `POST /api/v1/admin/users/{id}/suspend`
2. `UserRepo.UpdateStatusAndRevokeSessions` runs in a transaction:
   - Updates user status to `suspended`
   - Revokes ALL refresh sessions for that user (sets `revoked_at = now()`)
3. User's existing access token (JWT, 15 min TTL) remains valid until expiry
4. On next API request with expired access token:
   - Frontend attempts `POST /api/v1/auth/refresh`
   - Refresh fails with 401 (session revoked)
   - Frontend redirects to login

### What Happens When Admin Changes Project Assignments

1. Admin calls `PUT /api/v1/admin/projects/{id}/assignments/{userId}`
2. Assignment permission updated in database
3. **No immediate token invalidation** — JWT access tokens (15 min TTL) do not contain project assignment context
4. On next API request:
   - Access token still valid (contains only user_id, email, role)
   - Handler checks `assignmentRepo.CanEdit()` against current database state
   - New permission enforced immediately for write operations
   - Read operations filtered by RLS (which uses current project assignments)

### What Happens on Password Change

1. User changes password
2. `UserRepo.UpdatePassword` updates password hash
3. All refresh sessions for user are revoked (implicitly via token family rotation on next refresh)
4. Next refresh attempt fails, user must re-login

### What Happens on Role Change (User → Admin)

1. Admin updates user role in database (currently no direct API, requires manual DB update)
2. Existing access token contains old role claim
3. Token remains valid until 15 min expiry
4. On next refresh, new token issued with updated role

### Revocation Timing Summary

| Event | Access Token Invalidated | Refresh Token Invalidated | Notes |
|-------|-------------------------|--------------------------|-------|
| User suspended | No (15 min TTL) | **Yes (immediate)** | Via `UpdateStatusAndRevokeSessions` |
| Assignment changed | No (15 min TTL) | No | Handler checks DB on each write |
| Password changed | No (15 min TTL) | Yes (on next refresh) | Token family rotation |
| Role changed | No (15 min TTL) | No (on next refresh) | New token gets new role |

### Frontend Handling of Revoked Sessions

- `GET /api/v1/auth/me` returns 403 if user status is not `approved`
- `POST /api/v1/auth/refresh` returns 401 if session revoked
- Frontend catches 401/403 on API calls and redirects to login
- No automatic token refresh on 403 (prevents infinite loop)

### Design Rationale

- **Short access token TTL (15 min)** limits exposure window for stale permissions
- **Immediate refresh token revocation** on suspend ensures user cannot get new access tokens
- **Handler-level permission checks** (not in token) ensure assignment changes take effect immediately for write operations
- **RLS policies** enforce read isolation at database level

## Keterbatasan

- Tidak ada email verification service (localhost-only).
- Refresh cookie Secure=false untuk development HTTP.
- CSRF protection menggunakan SameSite=Lax tanpa token tambahan (dievaluasi untuk production).
- JWT access tokens stateless — tidak dicabut segera saat permission berubah (by design, 15 min TTL)