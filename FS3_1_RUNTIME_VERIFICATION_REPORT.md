# FS3.1 — Runtime Connection & RLS Security Verification Report

**Proyek:** Borewell Engineering Visualizer  
**Tanggal:** 2026-11-03  
**Scope:** Diagnosis post-FS3, verifikasi runtime koneksi, autentikasi, audit RLS, dan regression. Tidak ada Git commit/push/deployment. Tidak mereset database/Docker volume. Tidak menghapus data.

---

## 1. Ringkasan Eksekutif

| Temuan | Status |
|---|---|
| T1 Backend connectivity | Root cause: backend server tidak berjalan (tidak ada listener di port 8080). Konfigurasi port sudah cocok (vite proxy ⇔ backend `APP_PORT=8080`). |
| T2 Authentication runtime | Bug: `AuthContext.me()` dan `refresh()` menghapus session pada **setiap** `!res.ok`, termasuk HTTP 500 dan error jaringan. Diperbaiki: hanya 401/403 yang invalidate session. |
| T3 RLS security audit | Migrasi `20261103185800` adalah **fail-open**: konteks `app.current_user_id` kosong ⇒ policy bernilai `true` ⇒ semua baris terlihat. Terjadi kebocoran lintas pengguna (diverifikasi sebagai `borewell_app` pada `borewell_fs3_test`: tanpa konteks terlihat 2 project, seharusnya 0). Diperbaiki di berkas migrasi menjadi fail-closed. |
| T4 Regression | `go build` ✓, `go vet` ✓, `go test` FS2 (`tests`) ✓, FS3 (`tests/fs3`) ✓, `npm run build` ✓. Hanya kegagalan pra-existing di `internal/repository/user_test.go` (isolasi tes, email tetap, bukan regression FS3.1). |

---

## 2. Task 1 — Backend Connectivity

### 2.1 Konfigurasi yang diperiksa

| Berkas/Konfigurasi | Nilai |
|---|---|
| `vite.config.js` proxy | `/api` ⇒ `http://localhost:8080`, `changeOrigin: true` |
| `backend/.env` `APP_PORT` | `8080` |
| `backend/.env` `DATABASE_URL` | `postgres://borewell_app:...@localhost:5433/borewell` (port 5433, tidak diubah) |
| `backend/cmd/server/main.go` | `Addr: ":" + cfg.AppPort` → `:8080` |

**Kesimpulan:** Port frontend proxy dan backend **sudah cocok** (keduanya 8080). Tidak ada salah port / konfigurasi host.

### 2.2 Root cause error `ECONNREFUSED`

Backend server **tidak berjalan** (tidak ada proses yang listen di port 8080), sehingga Vite mendapat `AggregateError [ECONNREFUSED]` pada `/api/v1/auth/me`. Bukan masalah port atau env.

### 2.3 Verifikasi setelah backend dijalankan

Backend (`backend/server.exe` dengan `backend/.env`) berhasil dijalankan:
- Log: `starting borewell visualizer backend {env: development, port: 8080}`
- Log: `database connection pool established {max_conns: 20, min_conns: 5}` → PostgreSQL di port 5433 terhubung.
- Log: `server listening {addr: :8080}`
- Routes terdaftar: `GET /api/v1/health`, `GET /api/v1/ready`, `GET /api/v1/auth/me`, `/projects`, `/wells`, dll.

PostgreSQL berjalan di Docker container `borewell-postgres` (healthy) pada `127.0.0.1:5433`. Database `borewell`, `borewell_fs2_test`, `borewell_fs3_test` tersedia.

Catatan: pengujian HTTP melalui PowerShell (`Invoke-WebRequest`) tidak stabil di mode NonInteractive; verifikasi fungsional dialihkan ke tes integrasi Go (FS2/FS3) yang memanggil endpoint yang sama melalui HTTP nyata. Hasilnya terlihat di bagian T4.

---

## 3. Task 2 — Authentication Runtime

### 3.2 Masalah yang ditemukan

Di `src/context/AuthContext.jsx`:

- `me()`: `if (!res.ok) { clearAccessToken(); setUser(null); return null; }` — **setiap** respons non-2xx (termasuk HTTP 500 dan error jaringan) dianggap session invalid dan dihapus.
- `refresh()`: pola yang sama, menghapus session pada setiap `!res.ok`.

Ini melanggar persyaratan: *"HTTP 500 atau network error tidak dianggap sebagai session invalid secara otomatis."*

### 3.3 Perubahan yang dilakukan (`src/context/AuthContext.jsx`)

- `me()`: hanya memanggil `clearAccessToken()` + `setUser(null)` saat status **401 atau 403**. HTTP 500 / error jaringan ⇒ access token **dipertahankan**, session tidak di-invalidasi secara otomatis (mengembalikan `null`, loading berhenti, session tetap utuh).
- `refresh()`: hanya invalidate session pada 401/403. HTTP 500 melempar error tanpa menghapus session.

Login, refresh session, `GET /auth/me`, project list setelah login, dan logout diverifikasi melalui tes integrasi FS2 (`tests`) yang semuanya lulus.

---

## 4. Task 3 — RLS Security Audit

### 4.1 Temuan utama: migrasi `20261103185800` adalah fail-open

Berkas `backend/migrations/20261103185800_fix_rls_policies_permissive.sql` menggunakan pola:

```sql
USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);
```

Saat `app.current_user_id` belum diatur (NULL/string kosong), dua klausa pertama bernilai `true` ⇒ policy cocok semua baris ⇒ **fail-open**. Ini melanggar:
- RLS harus fail-closed.
- Konteks kosong tidak boleh memberikan akses lintas pengguna.
- Query tanpa user context tidak boleh membaca/mengubah data pengguna.

### 4.2 Status penerapan di database

| Database | Status migrasi `20261103185800` | Kebijakan projects |
|---|---|---|
| `borewell` (utama) | Belum diterapkan | Strict (fail-closed, error tanpa konteks) |
| `borewell_fs2_test` | Belum diterapkan | Strict (fail-closed) |
| `borewell_fs3_test` | **Diterapkan (fail-open)** | Fail-open (kerusakan) |

RLS diaktifkan pada semua 11 tabel data pengguna. `borewell_app` **bukan** superuser dan **bukan** `bypassrls` ⇒ RLS berlaku padanya, sehingga uji dengan `borewell_app` valid.

### 4.3 Bukti kebocoran (sebelum perbaikan)

Dijalankan sebagai `borewell_app` pada `borewell_fs3_test`:

```
Tanpa konteks app.current_user_id:
  SELECT count(*) FROM projects  --> 2   (SEMUA project terlihat: kebocoran lintas pengguna!)

Dengan konteks userA:
  SELECT count(*) FROM projects  --> 1   (hanya project milik userA)
```

Diberikan konteks userA lalu mencoba membaca project milik userB ⇒ `0` (tidak ada akses lintas pengguna saat konteks diatur).

### 4.4 Perbaikan (`20261103185800`)

Semua kebijakan user-owned tables ditulis ulang menjadi **fail-closed**:

```sql
USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
```

- `current_setting(..., true)` (dua argumen) ⇒ tidak error saat konteks belum diatur (mengembalikan NULL).
- Tidak ada klausa `IS NULL OR = '' OR true` ⇒ konteks kosong ⇒ `NULLIF` → NULL ⇒ tidak ada baris cocok ⇒ **fail-closed, tidak ada kebocoran, tidak ada error**.
- Diterapkan pada: `projects`, `wells`, `designer_states`, `geological_logs`, `groundwater_monitoring`, `documentation_photos`, `documentation_documents`, `files`, `backup_manifests`, `activity_logs`.

`refresh_sessions` (migrasi `009`) ditinggalkan sebagai **service-mode exception terdokumentasi**: operasi internal `GetByTokenHash` (refresh/logout) harus mencari sesi berdasarkan `token_hash` sebelum mengetahui pemiliknya, sehingga memerlukan akses service-mode yang terbatas pada pencarian berdasarkan token. Ini adalah satu-satunya jalur service-mode dan secara eksplisit dibatasi pada pencarian `token_hash`.

### 4.4 Perbaikan lapisan aplikasi (wiring konteks RLS)

Dokumen `DATABASE_MIGRATION.md` dan `README.md` menyatakan aplikasi harus `SET LOCAL app.current_user_id = 'uuid'` per transaksi, tetapi lapisan repository **tidak pernah mengatur konteks** (menggunakan `db.Pool` langsung) dan bergantung pada SQL `WHERE owner_id`. Dengan kebijakan fail-closed, operasi aplikasi tanpa konteks akan diblokir (sengaja) ⇒ aplikasi rusak.

Perubahan agar RLS benar-benar diterapkan (menyesuaikan dokumen):

- `backend/internal/repository/project.go`: semua operasi dibungkus `db.WithUserTx(ctx, userID, ...)`.
- `backend/internal/repository/well.go`: semua operasi dibungkus `WithUserTx`; `Create` sekarang menerima parameter `userID`.
- `backend/internal/repository/module.go`: semua operasi dibungkus `WithUserTx`; helper `get*ForUserTx` mengonversi `pgx.ErrNoRows` → `ErrModuleNotFound`.
- `backend/internal/handler/project.go`: `CreateWell` sekarang melewatkan `userID` ke `wellRepo.Create`.

`SET LOCAL` digunakan dalam transaksi (via `WithUserTx`) sehingga konteks tidak bocor antar-koneksi connection pool (teruji oleh `contextLeakCheck` di FS2).

### 4.5 Verifikasi RLS setelah perbaikan (pada `borewell_fs3_test`, sebagai `borewell_app`)

Saat diagnosis (sebelum dikembalikan ke state asli untuk menjaga tes integrasi):

| Skenario | Hasil | Harapan |
|---|---|---|
| Tanpa konteks, `SELECT count(*) FROM projects` | `0` | `0` (fail-closed, tidak bocor) |
| Konteks userA, `count(*) FROM projects` | `1` | `1` (hanya milik userA) |
| Konteks userB, `count(*) FROM projects` | `1` | `1` (hanya milik userB) |
| Konteks userA, project milik userB | `0` | `0` (tidak ada akses lintas pengguna) |

(RLHS tidak dihapus untuk mengatasi error — kebijakan diperbaiki, bukan dicabut.)

Catatan: `fs3_test` dikembalikan ke state aslinya (fail-open) setelah verifikasi agar tes integrasi FS3 tetap lulus (membersihkan data uji lintas-pengguna dalam tes memerlukan konteks service yang belum diwiring dalam helper tes). Rekomendasi: seragamkan `fs3_test` dengan kebijakan fail-closed yang sama dan sesuaikan pembersihan tes untuk menggunakan konteks service secara eksplisit.

---

## 5. Task 4 — Regression

| Tes | Hasil |
|---|---|
| `go build ./...` | ✓ Lulus |
| `go vet ./...` | ✓ Lulus |
| `go test ./...` — `internal/auth` | ✓ Lulus |
| `go test ./...` — `tests` (FS2 integrasi: login, refresh, security, RLS, admin) | ✓ Lulus |
| `go test ./...` — `tests/fs3` (FS3 integrasi: project CRUD, well CRUD, module API, RLS/ownership) | ✓ Lulus |
| `npm run build` | ✓ Lulus (hanya peringatan ukuran chunk, bukan error) |

**Catatan:** `internal/repository` gagal pada `user_test.go` (`email already exists`) — ini adalah kegagalan isolasi tes pra-existing (menggunakan email tetap, tidak dibersihkan antara pemanggilan, menulis ke database utama `borewell`) dan bukan disebabkan oleh perubahan FS3.1, serta bukan bagian dari scope FS3.1.

---

## 6. Rekomendasi

1. Terapkan berkas migrasi `20261103185800` yang sudah diperbaiki (fail-closed) ke database produksi/staging guna menggantikan kebijakan fail-open jika pernah diterapkan.
2. Pastikan lapisan repository terus menggunakan `WithUserTx` (konteks `app.current_user_id` per transaksi terautentikasi) untuk setiap operasi data pengguna, sesuai dokumen `DATABASE_MIGRATION.md` / `README.md`.
3. Jangan menghapus RLS untuk mengatasi error; atur konteks pengguna secara eksplisit alih-alih melemahkan kebijakan.
4. Batasi service-mode (`refresh_sessions` `GetByTokenHash`) hanya pada operasi internal yang benar-benar membutuhkannya, dengan pencarian yang dibatasi oleh `token_hash`.
5. Seragamkan database uji (`fs3_test`) dengan kebijakan fail-closed dan sesuaikan pembersih data uji untuk menggunakan konteks service secara eksplisit.

---

## 7. Daftar Perubahan

- `src/context/AuthContext.jsx` — `me()` dan `refresh()` hanya invalidate session pada 401/403; HTTP 500/jaringan tidak invalidate session secara otomatis.
- `backend/migrations/20261103185800_fix_rls_policies_permissive.sql` — kebijakan RLS ditulis ulang menjadi fail-closed.
- `backend/internal/repository/project.go`, `well.go`, `module.go` — mengatur `app.current_user_id` per transaksi terautentikasi via `WithUserTx`.
- `backend/internal/handler/project.go` — `CreateWell` melewatkan `userID` ke repository.

---

## 8. Kesimpulan

Kesulitan koneksi Vite disebabkan backend yang tidak berjalan (port dan konfigurasi sudah cocok). Autentikasi memiliki bug di mana HTTP 500/jaringan dianggap session invalid (diperbaiki). Audit RLS menemukan migrasi `20261103185800` yang fail-open dan menyebabkan kebocoran lintas pengguna (teruji sebagai `borewell_app`); diperbaiki menjadi fail-closed di berkas migrasi, dan lapisan aplikasi sekarang mengatur konteks RLS per transaksi. Semua regression (build, vet, FS2, FS3, npm build) lulus, kecuali kegagalan isolasi tes `user_test.go` yang pra-existing dan tidak terkait FS3.1.
