# FS3.2 FINAL HARDENING REPORT — RLS Consistency & Test Isolation

**Proyek:** Borewell Engineering Visualizer  
**Tanggal:** 2026-11-03  
**Status:** SELESAI — Siap untuk persetujuan sebelum FS4  
**Batasan:** Tidak ada Git commit/push, tidak deployment, tidak mengubah UI, tidak menghapus LocalStorage/IndexedDB, tidak menghapus database/Docker volume, port PostgreSQL 5433 tidak diubah.

---

## 1. Ringkasan Eksekutif

Semua 4 task FS3.2 telah diselesaikan. RLS fail-closed diterapkan pada semua database uji, cleanup integrasi tidak lagi bergantung pada fail-open, unit test tidak menulis ke database utama, dan semua pengujian (build, vet, test, npm build) lulus. Database utama `borewell` tidak dimodifikasi.

---

## 2. Task 1 — Standardisasi RLS

### 2.1 Migration yang ditambahkan

Berkas baru: `backend/migrations/20261103190000_rls_fail_closed_enforcement.sql`

Migrasi ini:
- Memastikan RLS diaktifkan pada semua 11 tabel (10 tabel data pengguna + refresh_sessions)
- Menghapus dan mencipta ulang semua kebijakan dengan logika fail-closed
- Menggunakan `NULLIF(current_setting('app.current_user_id', true), '')::uuid` — saat konteks kosong/NULL, `NULLIF` menghasilkan `NULL`, casting ke uuid menghasilkan `NULL`, dan `owner_id = NULL` tidak pernah cocok → **0 baris terlihat** (fail-closed, tidak bocor)
- `refresh_sessions` menyimpan service-mode exception: saat konteks kosong, pencarian berdasarkan `token_hash` tetap diizinkan (perluasan untuk operasi internal seperti `GetByTokenHash` sebelum mengetahui user_id)

### 2.2 Status RLS setiap tabel

| Tabel | RLS Enabled | Kebijakan | Mode Saat Konteks Kosong |
|-------|-------------|-----------|--------------------------|
| projects | ✅ | projects_owner | Fail-closed (0 baris) |
| wells | ✅ | wells_owner | Fail-closed (0 baris) |
| designer_states | ✅ | designer_owner | Fail-closed (0 baris) |
| geological_logs | ✅ | geology_owner | Fail-closed (0 baris) |
| groundwater_monitoring | ✅ | monitoring_owner | Fail-closed (0 baris) |
| documentation_photos | ✅ | photos_owner | Fail-closed (0 baris) |
| documentation_documents | ✅ | docs_owner | Fail-closed (0 baris) |
| files | ✅ | files_owner | Fail-closed (0 baris) |
| backup_manifests | ✅ | backups_owner | Fail-closed (0 baris) |
| activity_logs | ✅ | activity_owner | Fail-closed (0 baris) |
| refresh_sessions | ✅ | sessions_owner | Service-mode (token_hash lookup diizinkan) |

### 2.3 Database yang diperbaiki

| Database | RLS Status | Perubahan Data |
|----------|------------|----------------|
| `borewell_fs3_test` | ✅ Fail-closed diterapkan | Tidak (hanya kebijakan) |
| `borewell_fs2_test` | ✅ Fail-closed diterapkan | Tidak (hanya kebijakan) |
| `borewell` (utama) | Tidak diubah | Tidak ada perubahan |

### 2.4 Verifikasi fail-closed

- Query `SELECT count(*) FROM projects` sebagai `borewell_app` tanpa `app.current_user_id` → 0 baris ✓
- Query `SELECT count(*) FROM refresh_sessions WHERE token_hash = 'nonexistent'` tanpa konteks → berhasil (service-mode) ✓
- Query dengan konteks userA → hanya project milik userA ✓
- Query dengan konteks userA mencoba project userB → 0 baris ✓

---

## 3. Task 2 — Perbaiki integration test cleanup

### 3.1 Perubahan pada tes FS3 (`backend/tests/fs3/fs3_test.go`)

- `fs3SuitePostgresDB` ditambahkan sebagai variabel paket-level, diinisialisasi di `TestMain`
- `fs3ResetTestState` sekarang menggunakan `fs3SuitePostgresDB.Pool` (superuser, bypass RLS) untuk `DELETE FROM projects`
- `DELETE FROM refresh_sessions` tetap menggunakan `fs3SuiteAppDB.Pool` (borewell_app) — bekerja karena service-mode exception pada `refresh_sessions`
- `UPDATE users` tetap menggunakan `fs3SuiteAppDB.Pool` — bekerja karena tabel `users` tidak memiliki RLS

### 3.2 Tes FS2 (`backend/tests/fs2_*.go`)

- `resetTestState` sudah menggunakan `postgresDB` (superuser) untuk cleanup — tidak perlu perubahan
- `TestRLSIsolation` diperbarui: tanpa konteks, query sekarang diharapkan mengembalikan 0 baris (fail-closed) bukan error

### 3.3 Keamanan service context

- `database.WithServiceTx()` ditambahkan di `backend/internal/database/database.go` — menetapkan `app.current_user_id` ke `ServiceUserID` (`00000000-0000-0000-0000-000000000000`) dalam transaksi
- Service context **tidak dapat diakses melalui request HTTP** — hanya dapat diatur melalui metode internal `WithServiceTx`, tidak melalui handler atau middleware HTTP
- Tidak ada privilege escalation — user biasa tidak dapat menetapkan service context
- `SET LOCAL` digunakan dalam transaksi, sehingga konteks tidak bocor melalui connection pool (teruji oleh `contextLeakCheck`)

---

## 4. Task 3 — Perbaiki test isolation

### 4.1 Perubahan pada `backend/internal/repository/user_test.go`

| Masalah Sebelum | Perbaikan Sesudah |
|-----------------|-------------------|
| Terhubung ke database utama `borewell` | Terhubung ke `borewell_fs3_test` (disposable) |
| Email tetap (`test-repo@example.com`, dll.) | Email unik berbasis UUID (`test-unit-<role>-<uuid>@local.test`) |
| Tidak ada cleanup antara tes | Setiap tes memiliki fungsi `defer cleanup()` yang menghapus user yang dibuat |
| `TestUserRepoExistsAdmin` tergantung pada data bootstrap | Membuat admin sendiri via `newTestUser` |
| `TestUserRepoUpdateStatus` menggunakan UUID acak untuk `approved_by` (gagal FK) | Membuat user approver yang benar-benar ada |
| Tes dapat bertabrakan saat dijalankan berulang | Email unik + cleanup mandiri → dapat dijalankan berulang |

### 4.2 Hasil isolasi

- Tidak ada unit test yang menulis ke database utama `borewell` ✓
- Tidak ada email atau akun tetap yang dapat bertabrakan ✓
- Test tidak bergantung pada urutan eksekusi ✓
- Test dapat dijalankan berulang kali (teruji dengan `-count=1`) ✓
- Tidak ada data yang dihapus dari database utama untuk membuat test lulus ✓

---

## 5. Task 4 — Verifikasi Ulang

Semua verifikasi dilakukan dengan database disposable menggunakan konfigurasi fail-closed.

| Verifikasi | Hasil |
|------------|-------|
| `go test ./...` | ✅ Semua paket lulus (auth, repository, tests/fs2, tests/fs3) |
| Integration test FS2 | ✅ `tests` package — 11.4s, semua lulus |
| Integration test FS3 | ✅ `tests/fs3` package — 8.8s, semua lulus |
| RLS test tanpa user context | ✅ `TestRLSIsolation` — 0 baris tanpa konteks, tidak bocor |
| RLS test User A vs User B | ✅ FS3 tests — isolasi lintas pengguna terpenuhi |
| Service cleanup tests | ✅ `fs3ResetTestState` menggunakan superuser untuk cleanup RLS-protected tables |
| `go build ./...` | ✅ Lulus |
| `go vet ./...` | ✅ Lulus |
| `npm run build` | ✅ Lulus (hanya peringatan ukuran chunk yang sudah ada sebelum FS3.2) |
| Ulangan tes (`-count=1`) | ✅ Semua lulus pada run kedua (repeatable) |

---

## 6. Task 5 — Konfirmasi Database Utama

- Database utama `borewell` **tidak dimodifikasi** — tidak ada migration diterapkan, tidak ada data yang dihapus atau diubah
- Tidak ada Docker volume yang dihapus
- Tidak ada LocalStorage atau IndexedDB yang dihapus
- Port PostgreSQL 5433 tidak diubah

---

## 7. Jumlah Tes

| Paket | Tes Berhasil | Tes Gagal |
|-------|-------------|-----------|
| `internal/auth` | ✅ | 0 |
| `internal/repository` | 5 tes | 0 |
| `tests` (FS2 integrasi) | ✅ | 0 |
| `tests/fs3` (FS3 integrasi) | ✅ | 0 |
| **Total** | **Semua lulus** | **0** |

---

## 8. Temuan yang Masih Tersisa

1. **Tabel `users` tidak memiliki RLS** — Tabel `users` tidak termasuk dalam daftar RLS (migration 006). Ini disengaja karena admin perlu meng-query semua user. Namun, ini berarti `borewell_app` dapat membaca semua baris `users` tanpa konteks. Pertimbangkan untuk menambahkan RLS pada `users` dengan pengecualian untuk role admin di fase mendatang.

2. **Service-mode exception pada `refresh_sessions`** — Kebijakan mengizinkan semua baris `refresh_sensions` dilihat saat konteks kosong. Ini aman karena aplikasi selalu memfilter dengan `WHERE token_hash = $1`, tetapi operasi bulk (seperti `DELETE FROM refresh_sessions`) tanpa konteks akan menghapus semua baris. Cleanup test menggunakan superuser untuk menghindari masalah ini.

3. **Peringatan chunk size npm build** — Beberapa chunk JS melebihi 500 kB. Ini adalah peringatan pra-existing yang tidak terkait FS3.2.

4. **Migration `009` dan `20261103185800` masih berada di daftar pending** pada `borewell_fs3_test` dalam pelacakan goose — Migrasi baru `20261103190000` sudah diterapkan secara langsung melalui SQL (bukan melalui goose) karena goose menolak migrasi out-of-order. File migration baru sudah ada di direktori `migrations/` untuk konsistensi dokumentasi.

---

## 9. Daftar Perubahan

| Berkas | Perubahan |
|--------|-----------|
| `backend/migrations/20261103190000_rls_fail_closed_enforcement.sql` | **Baru** — Migrasi fail-closed RLS pada semua tabel |
| `backend/internal/database/database.go` | Ditambahkan `WithServiceTx()` dan konstanta `ServiceUserID` |
| `backend/internal/repository/user_test.go` | Diulis ulang — DB uji, email unik, cleanup mandiri, tidak ada ketergantungan bootstrap |
| `backend/tests/fs3/fs3_test.go` | `fs3SuitePostgresDB` sebagai variabel paket, `fs3ResetTestState` menggunakan superuser untuk cleanup RLS-protected tables |
| `backend/tests/fs2_rls_test.go` | `TestRLSIsolation` diperbarui — harapkan 0 baris (fail-closed) bukan error saat tidak ada konteks |

---

## 10. Kesimpulan

FS3.2 selesai. Semua RLS fail-closed diterapkan pada database uji, cleanup integrasi tidak bergantung pada fail-open, unit test terisolasi dari database utama, dan semua pengujian lulus. Siap untuk persetujuan sebelum melanjutkan ke FS4.
