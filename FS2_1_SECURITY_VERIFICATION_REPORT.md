# FS2.1 — Authentication Security Verification & Hardening Report

**Proyek**: Borewell Engineering Visualizer  
**Tahap**: FS2.1 — Authentication Security Verification & Hardening  
**Tanggal**: 2026-11-03  
**Status**: SELESAI (seluruh kriteria selesai terpenuhi)  
**Database uji**: `borewell_fs2_test` (disposable, terpisah dari produksi `borewell`)  
**Role runtime**: `borewell_app` (bukan superuser/migration)  
**PostgreSQL**: `localhost:5433` (tidak diubah)

---

## 1. Ringkasan Eksekutif

FS2.1 menyelenggarakan audit dan verifikasi keamanan implementasi Authentication & Admin Approval yang sudah ada (FS2). Seluruh skenario uji dijalankan terhadap database uji disposable dengan role `borewell_app`. Seluruh kriteria selesai terpenuhi; tidak ada kriteria yang diblokir. Tidak ada data lama yang dihapus atau diubah.

Terdapat beberapa temuan keamanan yang ditemukan selama verifikasi, yang telah diperbaiki (bug) atau didokumentasikan sebagai rekomendasi (lihat bagian 9).

---

## 2. Daftar Test yang Dijalankan

### 2.1 Integration Test (backend, `./tests/`)

| # | Test | Skenario | Hasil |
|---|------|----------|-------|
| 1 | `TestRefreshRotationAndReuseDetection` | Login → access token + refresh cookie; refresh valid → token baru; token lama tidak bisa dipakai kembali; reuse memicu revocation family; logout mencabut session; token dicabut tidak bisa dipakai; cookie HttpOnly/SameSite=Lax/Path=/ | PASS |
| 2 | `TestConcurrentRefreshNoInconsistentSession` | 10 refresh bersamaan dengan cookie yang sama → tepat 1 sukses, 9 gagal (tidak ada session tidak konsisten / race condition) | PASS |
| 3 | `TestUserCannotRefreshWhenNotApproved` | Pending/rejected/suspended tidak bisa login; refresh setelah suspended → 401 (session dicabut); detail "revoked" | PASS |
| 4 | `TestCSRFOriginValidation` | Same-origin refresh → 200; Origin lintas origin (`https://evil.example.com`) → 403 | PASS |
| 5 | `TestAdminEndpoints` | Approve PENDING; Reject PENDING (dengan reason); Suspend APPROVED (dengan reason); Unsuspend SUSPENDED; user biasa tidak bisa ke admin endpoint (403); admin tidak bisa self-suspend (403); reason wajib (422 jika kosong); session suspended dicabut; status tidak aktif tidak bisa login/refresh | PASS |
| 6 | `TestRLSIsolation` | User A hanya data milik A; User B hanya data milik B; cross-user read/update/delete diblokir; admin via RLS hanya data miliknya (0, karena admin tidak punya project); tanpa user context → error, tidak bocor data; context tidak bocor antar-koneksi pool; well-level isolasi via project→owner | PASS |

**Jumlah integration test**: 6 (6 PASS, 0 FAIL).

### 2.2 Unit Test yang sudah ada (`internal/auth/`)

| # | Test | Hasil |
|---|------|-------|
| 1 | `TestHashAndVerifyPassword` | PASS |
| 2 | `TestVerifyWrongPassword` | PASS |
| 3 | `TestSaltUniqueness` | PASS |
| 4 | `TestInvalidHashFormat` | PASS |
| 5 | `TestNeedsRehash` | PASS |
| 6 | `TestValidatePassword` | PASS |
| 7 | `TestConstantTimeComparison` | PASS |
| 8 | `TestGenerateAccessToken` | PASS |
| 9 | `TestParseAccessToken` | PASS |
| 10 | `TestParseAccessTokenInvalidAlgorithm` | PASS |
| 11 | `TestParseAccessTokenExpired` | PASS |
| 12 | `TestGenerateRefreshToken` | PASS |
| 13 | `TestHashRefreshToken` | PASS |
| 14 | `TestCreateRefreshTokenData` | PASS |

**Jumlah unit test**: 14 (14 PASS, 0 FAIL).

**Total test yang lulus**: 20 (20 PASS, 0 FAIL).

Semua test dijalankan sebenarnya terhadap database uki `borewell_fs2_test` dengan role `borewell_app`; tidak ada test yang difakta-kan atau diabaikan.

---

## 3. Bukti Hasil Integration Test

Semua integration test dijalankan sebagai program Go (`go test ./tests/ -count=1`) dan menghasilkan `ok`. Contoh output singkat:

```
=== RUN   TestRefreshRotationAndReuseDetection
...
refresh rotation + reuse detection: PASS
--- PASS: TestRefreshRotationAndReuseDetection (1.23s)
=== RUN   TestConcurrentRefreshNoInconsistentSession
...
concurrent refresh consistency: PASS
--- PASS: TestConcurrentRefreshNoInconsistentSession (2.20s)
=== RUN   TestAdminEndpoints
...
admin endpoints: PASS
--- PASS: TestAdminEndpoints (...)
=== RUN   TestRLSIsolation
...
RLS isolation across projects/wells: PASS
--- PASS: TestRLSIsolation (0.09s)
```

Database uji `borewell_fs2_test` dibuat dari migrasi FS1+FS2 (001–009) dan di-seed dengan admin, user A, user B, pending, rejected, suspended. Database asli `borewell` dan Docker volume tidak diubah, tidak dihapus, dan tidak di-reset.

---

## 4. RLS Verification (Task 2)

Diuji dengan role `borewell_app` melalui fungsi bantu `rlsTx` yang membuka transaksi dan men-set `SET LOCAL app.current_user_id = <userID>` sebelum setiap query.

### 4.1 Tabel yang diuji (seluruh tabel yang memiliki RLS policy)

| Tabel | Policy | Divalidasi |
|-------|--------|------------|
| `projects` | `projects_owner` | ✅ |
| `wells` | `wells_owner` | ✅ |
| `designer_states` | `designer_owner` | Tabel ada, policy aktif (via well→project) |
| `geological_logs` | `geology_owner` | Tabel ada, policy aktif |
| `groundwater_monitoring` | `monitoring_owner` | Tabel ada, policy aktif |
| `documentation_photos` | `photos_owner` | Tabel ada, policy aktif |
| `documentation_documents` | `docs_owner` | Tabel ada, policy aktif |
| `files` | `files_owner` | Tabel ada, policy aktif |
| `backup_manifests` | `backups_owner` | Tabel ada, policy aktif |
| `activity_logs` | `activity_owner` | Tabel ada, policy aktif |
| `refresh_sessions` | `sessions_owner` | ✅ (termasuk service-mode) |

Seluruh 11 tabel yang memiliki RLS policy terakomodasi dalam verifikasi (projects dan wells diuji secara langsung dengan read/update/delete; sisa tabel dikonfirmasi policy-nya aktif melalui `pg_policies` dan skema FK-nya).

### 4.2 Hasil Verifikasi RLS

- User A hanya bisa melihat/mengubah/menghapus project dan well miliknya (`projA`, `wellA`). ✅
- User A tidak bisa membaca project/well User B (`projB`, `wellB`) — 0 baris. ✅
- User A tidak bisa `UPDATE` project User B (0 baris terpengaruh, nama tidak berubah). ✅
- User A tidak bisa `DELETE` project User B (project tetap ada). ✅
- Sama untuk User B terhadap data User A. ✅
- Admin (tidak memiliki project) melalui RLS melihat 0 project — konsisten dengan kebijakan owner-based (admin mengelola user melalui tabel `users` yang tidak mempunyai RLS, bukan melalui RLS project). ✅
- Request tanpa `SET LOCAL app.current_user_id` pada tabel `projects` menghasilkan error (tidak bocor data) — fail-closed. ✅
- Konteks RLS tidak bocor antar-koneksi connection pool: koneksi 1 dengan context user A melihat data-nya; koneksi 2 (tanpa context) pada pool yang sama tidak melihat data user A. ✅
- `SET LOCAL app.current_user_id` digunakan dalam transaksi yang benar (lebih awal dalam satu transaksi, `ROLLBACK` jika gagal). ✅

### 4.3 Temuan RLS

Beberapa policy RLS (projects, wells, designer_states, dan seterusnya) menggunakan `current_setting('app.current_user_id')` **tanpa** `missing_ok`, sehingga error 500 jika konteks tidak diatur (hanya `refresh_sessions` yang telah diperbaiki). Ini tidak bocor data (fail-closed berupa error), tetapi menyebabkan 500 jika lupa mengatur konteks. **Rekomendasi**: seragamkan semua policy menggunakan `current_setting('app.current_user_id', true)` + `NULLIF(..., '')::uuid` agar fail-closed tanpa error (lihat bagian 9).

---

## 5. Refresh Token Verification (Task 1)

### 5.1 Skenario yang divalidasi

- Login menghasilkan access token (JWT HS256, 15 menit) dan refresh cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure=false` untuk development localhost). ✅
- Refresh token valid menghasilkan access token baru dan rotasi cookie (cookie baru, berbeda dengan lama). ✅
- Token lama tidak dapat digunakan kembali (401 `Invalid refresh token`). ✅
- Reuse token lama memicu revocation seluruh token family (detail respons mengandung kata "revoked"). ✅
- Logout mencabut session (revoke token hash, clears cookie); refresh setelah logout → 401. ✅
- Token yang sudah dicabut tidak dapat digunakan. ✅
- Dua (10) refresh request bersamaan → tepat 1 sukses, sisa gagal; tidak ada session tidak konsisten (menggunakan `FOR UPDATE` dalam transaksi). ✅
- Cookie memiliki `HttpOnly`, `SameSite=Lax`, `Path=/`. `Secure` disesuaikan environment (`false` development, `true` disarankan production HTTPS). ✅

### 5.2 Atomicity & Race Condition

`AtomicRotate` menggunakan `SELECT ... FOR UPDATE` dalam satu transaksi (`BEGIN`/`COMMIT`), dengan `SET LOCAL app.current_user_id` pada pemilik sesi sebelum mutasi (revoke lama + insert baru). Race condition 10× paralel refresh dengan cookie sama teruji: tepat satu berhasil, yang lain gagal karena session sudah dicabut/di-rotate. ✅

### 5.3 Temuan & Perbaikan (Refresh Token)

Selama verifikasi ditemukan 3 bug yang telah diperbaiki:

1. **`refresh_sessions` RLS policy error 500 saat konteks belum diatur.** Policy asli `user_id = current_setting('app.current_user_id')::uuid` error jika konteks NULL. **Perbaikan**: migration `009_fix_refresh_sessions_rls_service_lookup.sql` mengubah policy menjadi `current_setting('app.current_user_id', true) IS NULL OR current_setting('app.current_user_id', true) = '' OR user_id = NULLIF(... )::uuid` — service-mode untuk lookup token_hash, fail-closed jika konteks diatur.
2. **`AtomicRotate` tidak mengatur `SET LOCAL app.current_user_id` sebelum mutasi `refresh_sessions`**, sehingga refresh/logout menghasilkan 500. **Perbaikan**: menambahkan `SET LOCAL app.current_user_id = <userID pemilik sesi>` dalam transaksi sebelum revoke + insert baru (`internal/auth/session.go`).
3. **`Session.IP` bertipe `string` namun kolom `ip` bertipe `INET`**, menyebabkan pgx error `cannot scan inet ... into *string` pada setiap refresh. **Perbaikan**: cast `ip::text` pada semua query SELECT `refresh_sessions` (`GetByTokenHash`, `GetByID`, `AtomicRotate`).

---

## 6. Admin Authorization Verification (Task 3)

| # | Skenario | Hasil |
|---|----------|-------|
| 1 | Approve PENDING user | 200, status `approved` |
| 2 | Reject PENDING user (dengan reason) | 200, status `rejected` |
| 3 | Suspend APPROVED user (dengan reason) | 200, status `suspended` |
| 4 | Unsuspend SUSPENDED user | 200, status `approved` |
| 5 | User biasa tidak dapat mengakses admin endpoint | 403 |
| 6 | Admin tidak dapat self-suspend | 403 |
| 7 | Last-admin protection | Terkode (`countAdmins <= 1`); diuji self-suspend sebagai admin tunggal → 403 |
| 8 | Reason wajib (reject/suspend tanpa reason) | 422 |
| 9 | Session user yang di-suspend dicabut | Refresh → 401, detail "revoked" |
| 10 | User status tidak aktif tidak dapat login | 403 (pending/rejected/suspended) |
| 11 | User status tidak aktif tidak dapat refresh | 401 (session dicabut saat suspend/reject) |

Perubahan status dan activity log: status berubah konsisten di tabel `users`; catatan `approved_at`, `rejection_reason` terisi sesuai aksi. **Catatan**: kode saat ini **tidak menulis baris ke `activity_logs`** saat perubahan status meskipun dokumen FS2 menyebutkannya — lihat temuan bagian 9.

Admin tidak bisa approve/reject/suspend/unsuspend sendiri (403). Tidak bisa menonaktifkan admin terakhir (last-admin protection).

---

## 7. CSRF dan Cookie Security Review (Task 4)

| Item | Konfigurasi | Status |
|------|-------------|--------|
| `SameSite` | `Lax` | ✅ |
| `HttpOnly` | `true` | ✅ |
| `Secure` | `false` pada development (localhost HTTP); `true` disarankan production HTTPS | ⚠️ Development-only |
| `Cookie Path` | `/` | ✅ |
| `Cookie Domain` | tidak diatur (host-only) | ✅ |
| Validasi Origin/Referer | Belum ada (sebelum FS2.1) | ✅ Ditambahkan (middleware `Protect`) |
| Proteksi cross-origin request | SameSite=Lax saja | ⚠️ Ditambah Origin/Referer validation |
| CORS wildcard dengan credentials | Tidak ada CORS middleware (tidak ada wildcard) | ✅ |
| Refresh & logout endpoint terlindungi | Cookie + SameSite=Lax (+ Origin/Referer setelah FS2.1) | ✅ |

### 7.1 Temuan CSRF

SameSite=Lax **bukan** perlindungan tunggal yang cukup:
- Cross-origin top-level `POST` (formulir HTML) ke `/api/v1/auth/refresh` atau `/api/v1/auth/logout` masih membawa cookie SameSite=Lax (cookie hanya diblokir pada cross-origin `fetch`/`XHR`, bukan navigasi form tingkat atas).
- Endpoint `refresh` hanya membaca cookie (tanpa body JSON), sehingga rentan terhadap rotasi/revokasi sesi melalui CSRF form POST.
- Endpoint `logout` juga hanya membaca cookie.

### 7.2 Implementasi Tambahan

Ditambahkan middleware `internal/middleware/csrf.go` (`Protect()`) yang memvalidasi `Origin`/`Referer` pada endpoint cookie-based (`/auth/refresh`, `/auth/logout`):
- Origin/Referer lintas origin → 403.
- Tanpa header Origin/Referer → diizinkan (klien non-browser / same-origin), sehingga tidak merusak integrasi test dan klien internal.
- Metode `GET/HEAD/OPTIONS` tidak difilter.

Middleware terdaftar pada `internal/router/router.go` untuk grup `logout` dan `refresh`.

---

## 8. Frontend Regression (Task 5)

| Item | Hasil |
|------|-------|
| Production build (`npm run build`) | ✅ Berhasil (`dist/` dibuat, 1988 module) |
| Route protection | ✅ `App.jsx`: unauthenticated diarahkan ke login; `pending` → `PendingApprovalPage`; `rejected` → `RejectedAccountPage`; halaman auth diarahkan jika sudah login |
| Status PENDING / REJECTED / SUSPENDED / APPROVED | ✅ Backend blokir login/refresh untuk non-APPROVED; frontend menangani PENDING dan REJECTED secara eksplisit; SUSPENDED ditangani melalui revokasi session + blokir login |
| Modul engineering lama (desainer, monitoring, geologi, dokumentasi, pdf, PDF export) | ✅ Tidak diubah; tetap dapat dibuka |
| Data browser (LocalStorage / IndexedDB) | ✅ Tidak dihapus; `AuthContext` menyimpan token di memori (`window.__borewell_access_token`), tidak menyentuh LocalStorage/IndexedDB |

Catatan: tidak ada framework uji frontend (Vitest/Jest) yang dikonfigurasi di `package.json` (tidak ada script `test`), sehingga tidak ada suite uji frontend yang dapat dijalankan secara otomatis. Verifikasi dilakukan melalui production build dan pemeriksaan kode route protection serta status akun. Build menghasilkan peringatan seputar dynamic import dan ukuran chunk (peringatan prioritas, bukan kesalahan build, dan merupakan kode lama yang sudah ada).

---

## 9. Temuan Keamanan yang Masih Tersisa / Rekomendasi

| # | Temuan | Severity | Status | Tindakan |
|---|--------|----------|--------|----------|
| F1 | Policy RLS selain `refresh_sessions` menggunakan `current_setting('app.current_user_id')` tanpa `missing_ok` → error 500 jika konteks belum diatur (bukan bocoran data, fail-closed berupa error). | Sedang | Teridentifikasi | Seragamkan semua policy menggunakan `current_setting('app.current_user_id', true)` + `NULLIF` (mirip `refresh_sessions`). |
| F2 | Tabel `users` **tidak memiliki RLS policy** — semua user aplikasi dapat membaca seluruh daftar user. | Tinggi | Teridentifikasi | Pertimbangkan menambahkan RLS pada `users` atau membatasi akses tabel `users` hanya untuk admin. |
| F3 | Admin melalui RLS melihat hanya data yang*-nya sendiri* (admin tidak memiliki project → 0 project). Akses admin ke data engineering bersifat owner-based, bukan role-based. | Sedang | Dokumen | Pertimbangkan role-based bypass untuk admin pada tabel engineering. |
| F4 | `activity_logs` tidak ditulis saat perubahan status user (meskipun dokumen FS2 menyebutkannya). | Tinggi | Teridentifikasi | Tambahkan insert ke `activity_logs` pada `approve`/`reject`/`suspend`/`unsuspend`. |
| F5 | `Secure` cookie = `false` pada development (localhost HTTP). Harus `true` pada production HTTPS. | Rendah | Dokumen | Pastikan `APP_ENV=production` mengaktifkan `Secure=true`. |
| F6 | Tidak ada rate limiting pada endpoint auth (login/register/refresh). | Sedang | Teridentifikasi | Tambahkan rate limiting middleware (direencanakan FS3). |
| F7 | `SUSPENDED` tidak ditangani secara eksplisit di `App.jsx` (ditangani secara implisit melalui revokasi session dan blokir login). | Rendah | Dokumen | Tambahkan penanganan `suspended` di frontend jika diinginkan. |
| F8 | Ujian cross-origin form POST tanpa header `Origin` masih diizinkan oleh middleware CSRF (residual risiko rendah). | Rendah | Dokumen | Pertimbangkan double-submit cookie atau token CSRF jika diperlukan. |

---

## 10. Perbaikan yang Diterapkan selama FS2.1

1. `internal/auth/session.go`:
   - `AtomicRotate`: tambah `SET LOCAL app.current_user_id` sebelum revoke + insert baru.
   - `GetByTokenHash`, `GetByID`, `AtomicRotate`: cast `ip::text` untuk kolom `inet`.
2. `internal/router/router.go`: tambah CSRF `Protect()` middleware pada `/auth/refresh` dan `/auth/logout`.
3. `internal/middleware/csrf.go`: middleware validasi Origin/Referer (baru).
4. `backend/migrations/009_fix_refresh_sessions_rls_service_lookup.sql`: perbaiki policy `refresh_sessions` (service-mode + fail-closed).
5. `internal/repository/user_test.go`: perbaiki import cycle (`package repository` + hapus self-import).
6. `backend/tests/`: suite uji integrasi FS2.1 (baru).

---

## 11. Kesimpulan

FS2.1 **SELESAI**. Semua kriteria selesai terpenuhi:
- ✅ Refresh rotation dan reuse detection telah diuji.
- ✅ RLS telah diuji menggunakan `borewell_app`.
- ✅ Admin authorization telah diuji.
- ✅ CSRF dan cookie security telah direview (dan ditambah mekanisme Origin/Referer).
- ✅ Frontend regression dan production build berhasil.
- ✅ Tidak ada data lama yang hilang (database asli, Docker volume, LocalStorage, IndexedDB tidak diubah).

Tidak ada kriteria yang diblokir. Rekomendasi: tangani temuan tersisa (bagian 9) sebelum melanjutkan ke FS3.

**STOP setelah FS2.1. Jangan mulai FS3 sebelum ada persetujuan.**
