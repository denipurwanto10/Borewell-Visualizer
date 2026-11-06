# Session Security — Borewell Engineering Visualizer v2.0.0

## Ringkasan

Dokumen ini menjelaskan keamanan session untuk sistem autentikasi, termasuk JWT access token, refresh token rotation, cookie attributes, dan CSRF protection.

## Access Token

| Properti | Nilai |
|----------|-------|
| Algoritma | HS256 |
| Masa berlaku | 15 menit |
| Penyimpanan frontend | Memori (variabel JavaScript, tidak dalam LocalStorage/IndexedDB) |
| Pengiriman | `Authorization: Bearer <token>` |
| Issuer | `borewell-visualizer` |
| Audience | `borewell-api` |

### JWT Claims

| Claim | Deskripsi |
|-------|-----------|
| `user_id` | UUID pengguna |
| `email` | Email pengguna |
| `role` | Role (`admin` atau `user`) |
| `status` | Status akun (`pending`, `approved`, `rejected`, `suspended`) |
| `iss` | Issuer (`borewell-visualizer`) |
| `sub` | Subject (user_id) |
| `aud` | Audience (`borewell-api`) |
| `exp` | Expiration time |
| `nbf` | Not before |
| `iat` | Issued at |
| `jti` | JWT ID (untuk identifikasi unik) |

### Verifikasi JWT (Middleware)

Middleware memverifikasi:
1. Signature JWT (HS256 dengan secret dari env).
2. Algorithm yang diizinkan (hanya HS256).
3. Issuer (`borewell-visualizer`).
4. Audience (`borewell-api`).
5. Expiration (tidak kedaluwarsa).
6. Token purpose/type.
7. User masih aktif dan status `APPROVED` (dicek ke database setiap request `/auth/me` dan endpoint yang dilindungi).

## Refresh Token

| Properti | Nilai |
|----------|-------|
| Tipe | Opaque string (32 bytes hex = 64 karakter) |
| Masa berlaku maksimal | 30 hari |
| Penyimpanan backend | SHA-256 hash di PostgreSQL (`refresh_sessions.token_hash`) |
| Penyimpanan frontend | HttpOnly cookie (tidak dapat diakses JavaScript) |
| Pengiriman | Cookie otomatis oleh browser |
| Rotasi | Setiap refresh, token lama dicabut, token baru dibuat |

### Refresh Session Tabel

| Kolom | Deskripsi |
|-------|-----------|
| `id` | UUID primary key |
| `user_id` | FK ke `users(id)` |
| `token_hash` | SHA-256 hash dari refresh token |
| `user_agent` | User agent request |
| `ip` | IP address client |
| `expires_at` | Waktu kedaluwarsa |
| `revoked_at` | Waktu dicabut (NULL jika aktif) |
| `token_family` | Token family untuk deteksi reuse |
| `created_at` | Waktu dibuat |

## Cookie Attributes

| Atribut | Development (localhost) | Production (HTTPS) |
|---------|------------------------|-------------------|
| `Name` | `refresh_token` | `refresh_token` |
| `HttpOnly` | true | true |
| `SameSite` | Lax | Lax (atau Strict) |
| `Secure` | false | true |
| `Path` | `/` | `/` |
| `Max-Age` | 2592000 (30 hari) | 2592000 (30 hari) |

### Alasan Secure=false Development

Aplikasi didevelopment menggunakan HTTP (bukan HTTPS) pada localhost. Cookie Secure hanya dikirim melalui HTTPS, jadi Secure=false diperlukan agar cookie terkirim pada development. Dokumentasi ini mencatat keterbatasan ini dan menyarankan Secure=true untuk production.

## Refresh Token Rotation

Setiap `POST /api/v1/auth/refresh`:

1. Baca refresh token dari cookie `refresh_token`.
2. Hitung SHA-256 hash dari token.
3. Cari session di database berdasarkan token_hash.
4. Verifikasi:
   - Session ditemukan (tidak → 401).
   - Session belum dicabut (`revoked_at IS NULL`).
   - Session belum kedaluwarsa (`expires_at > now`).
   - User masih APPROVED dan aktif.
5. Buat refresh token baru.
6. Dalam satu transaksi database:
   - Revoke session lama (`revoked_at = now`).
   - Insert session baru dengan token_hash baru dan expires_at baru.
7. Set cookie baru dengan atribut sama.
8. Kembalikan access token baru.

## Token Reuse Detection

Jika refresh token lama digunakan kembali (kemungkinan token dicuri atau replay attack):

1. Deteksi: session dengan token_hash tersebut sudah memiliki `revoked_at != NULL`.
2. Tindakan: Revoke seluruh session family (semua session dengan `token_family` yang sama dan `user_id` yang sama).
3. Catat security event di `activity_logs` dengan action `token_reuse_detected`.
4. Respons 401 Unauthorized.

## Concurrent Refresh Safety

Rotasi menggunakan `SELECT ... FOR UPDATE` dan transaksi database untuk memastikan atomicity. Hanya satu request refresh yang dapat memproses suatu session pada satu waktu. Request concurrent akan menunggu hingga transaksi pertama selesai, kemudian menemukan session lama sudah dicabut (401).

## CSRF Protection

Karena refresh token menggunakan cookie yang dikirim otomatis browser:

### SameSite
- SameSite=Lax mencegah cookie dikirim pada request cross-site (berbeda dengan navegasi top-level).
- SameSite=Strict memastikan cookie tidak pernah dikirim pada cross-site request, tetapi dapat mengganggu UX (misalnya tautan dari email).

### Origin/Referer Validation
- Endpoint state-changing menggunakan cookie (`/auth/logout`, `/auth/refresh`) dievaluasi untuk penambahan validasi Origin/Referer.
- Untuk development localhost, validasi dikecualikan karena Vite proxy dapat mengubah origin.

### CORS
- Tidak menggunakan wildcard origin (`*`).
- Credentialed CORS hanya untuk origin yang diizinkan.
- Request state-changing dari origin tidak dikenal ditolak.

### CSRF Token
- Belum diimplementasikan untuk FS2 (dievaluasi untuk production).
- SameSite=Lax menyediakan perlindungan dasar terhadap CSRF untuk browser modern.

## Logout

`POST /api/v1/auth/logout`:
1. Baca refresh token dari cookie.
2. Revoke session di database.
3. Hapus cookie dengan atribut yang sama saat dibuat (Path=/, HttpOnly, SameSite=Lax).
4. Hapus access token dari memori frontend.

Setelah logout:
- Refresh token tidak dapat digunakan.
- Access token masih berlaku hingga expired (15 menit), tetapi tidak dapat digunakan untuk refresh.

## Keterbatasan Keamanan HTTP Localhost

1. Cookie Secure=false → cookie dapat ditransmisikan melalui HTTP (nestsif).
2. SameSite=Lax → sedikit rentan terhadap CSRF rispetto Strict.
3. Tidak ada CSRF token tambahan.
4. Access token di memori → rentan terhadap XSS jika ada eksekusi kode berbahaya.
5. Semua keterbatasan ini diabaikan untuk development dan harus diperbaiki untuk production.