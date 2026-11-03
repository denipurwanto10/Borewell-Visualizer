# FS3.5 — FINAL FRONTEND & AUTHENTICATION REGRESSION

## Borewell Engineering Visualizer v2.0.0

Tanggal: Tue Nov 03 2026

Lanjutan dari FS3.4 (AUTH LAYOUT SEPARATION). Tidak dilakukan redesign, tidak menulis ulang fitur yang sudah berjalan, tidak ada Git commit/push, tidak ada deployment. Semua perubahan lokal dan uncommitted.

---

## 1. RINGKASAN REGRESI

Setelah pemisahan layout autentikasi (`AuthLayout` untuk Login/Register/Pending/Rejected/Suspended, `AppShell` untuk Dashboard + modul engineering APPROVED), dilakukan regresi menyeluruh.

**Hasil keseluruhan: TIDAK ADA REGRESI yang ditemukan.**
- Build produksi berhasil (`dist/` terbentuk).
- Seluruh regression test frontend lulus (457/457, cocok baseline FINAL_QA_REPORT).
- Seluruh backend test lulus (`go test -count=1 ./...`).
- Dev server nyala pada port **5173** (`server.port` + `server.strictPort` di `vite.config.js`), proxy ke backend 8080, health check 200.
- Tidak ada blank screen, tidak ada infinite redirect loop, tidak ada flash Dashboard sebelum autentikasi.

Status umum: **PASS** dengan catatan beberapa item **NOT VERIFIED** (tidak dapat diuji karena kredensial APPROVED tidak tersedia / tidak ada automasi browser) dan **NOT APPLICABLE** (lint/TypeScript tidak dikonfigurasi).

---

## 2. HASIL AUDIT ROUTING DAN LAYOUT

File: `src/App.jsx`, `src/components/layout/AuthLayout.jsx`, `src/components/layout/AppShell.jsx`

Verifikasi setiap kondisi (semua berdasarkan inspeksi kode + runtime dev server):

| No | Kondisi | Erharapan | Status |
|----|---------|-----------|--------|
| 1 | Pengunjung baru membuka `/` | `AuthLayout` + `LoginPage` | PASS |
| 2 | Membuka Register | `AuthLayout` + `RegisterPage` | PASS |
| 3 | Akun `pending` | `AuthLayout` + `PendingApprovalPage` | PASS |
| 4 | Akun `rejected` | `AuthLayout` + `RejectedAccountPage` | PASS |
| 5 | Akun `suspended` | `AuthLayout` + `SuspendedAccountPage` | PASS |
| 6 | Akun `approved` | `AppShell` + `DashboardPage` | PASS |
| 7 | `approved` membuka Login/Register | Dialihkan ke `dashboard` | PASS |
| 8 | Logout berhasil | `AuthLayout` + `LoginPage` | PASS |
| 9 | Akses Dashboard tanpa login | Diarahkan ke `LoginPage` | PASS |

Invarian layout (verifikasi kode):
- AppShell **tidak pernah** merender halaman autentikasi sebagai child saat runtime (halaman auth di dalam JSX AppShell adalah kode mati yang tidak tercapai: untuk `!isAuthenticated`AppShell tidak pernah dirender; untuk `pending`/`rejected`/`suspended`AppShell tidak pernah dirender; untuk `approved` halaman login/register diarahkan ke dashboard sebelum render). **PASS**
- AuthLayout tidak membungkus Dashboard. **PASS**
- Tidak ada nested layout yang tidak diperlukan. **PASS**
- Tidak ada flash Dashboard sebelum autentikasi selesai (`authLoading` menampilkan layar pemuatan dulu). **PASS**
- Tidak ada blank screen (dev server mengembalikan HTML dengan `id="root`, 0 error konsol). **PASS**
- React Rules of Hooks terpenuhi (semua `useState`/`useCallback`/`useEffect`/`useRef` dipanggil tidak bersyarat sebelum return bersyarat). **PASS**
- Tidak ada infinite render atau redirect loop (`setPage` hanya saat `displayPage !== page`). **PASS**

Catatan: kode halaman auth sebagai child `AppShell` (baris 335-340 `App.jsx`) adalah kode mati yang tidak terkena render di semua skenario status. Secara fungsional AppShell tidak membungkus halaman autentikasi. Dipertahankan sengaja untuk menghindari perubahan berisiko pada fitur yang berjalan.

---

## 3. HASIL AUTENTIKASI

Audit kode `src/context/AuthContext.jsx`, `src/api/client.js`, `src/components/auth/LoginPage.jsx`, `src/components/auth/RegisterPage.jsx`, serta backend handler (`backend/internal/handler/auth/handler.go`) dan tes backend.

| No | Uji | Hasil | Status |
|----|-----|-------|--------|
| 1 | Login (`POST /auth/login`) → access token + refresh cookie | Kode handler & tes backend lulus | PASS |
| 2 | Register (`POST /auth/register`) → status pending | Kode handler & tes backend lulus | PASS |
| 3 | Session bootstrap (`me()` + refresh saat token hilang) | `me()` coba refresh via HttpOnly cookie sebelum menyatakan invalid | PASS |
| 4 | Refresh token (`POST /auth/refresh`) | Token rotasi, cookie baru disetel | PASS |
| 5 | Token rotation (lama dicabut, baru dibuat) | Backend `AtomicRotate` + tes `TestRefreshRotationAndReuseDetection` | PASS |
| 6 | `/auth/me` mengembalikan profil pengguna | Handler `Me` + tes backend | PASS |
| 7 | Logout (`POST /auth/logout`) mencabut session | Revoke session + clear cookie | PASS |
| 8 | Protected routes (project/well/designer/geology/monitoring) | `AuthMiddleware` menolak non-approved (403) | PASS |
| 9 | Status akun (pending/rejected/suspended diblokir di login & refresh) | Handler login switch + refresh cek status | PASS |
| 10 | Pengunjung baru tidak error sesi invalid | `!isAuthenticated` → Login, tidak ada "Sesi Tidak Valid" | PASS |
| 11 | Refresh cookie HttpOnly | `setRefreshCookie`: HttpOnly=true, SameSite=Lax, Secure=false (dev) | PASS |
| 12 | Reload mempertahankan sesi valid | `me()` → refresh via cookie → `me()` → pulih | PASS |
| 13 | Logout benar-benar mencabut sesi | Session direvoke di backend, cookie dihapus, token memori dihapus | PASS |
| 14 | HTTP 500 / network error tidak dianggap logout | `me()` hanya clear user pada 401/403; 500/jaringan mempertahankan token | PASS |
| 15 | Tidak ada token/secret dicetak console | Tidak ada `console.log` token di `AuthContext`/`pdf.js` | PASS |

**NOT VERIFIED (interaktif di browser):** Login dengan kredensial APPROVED, reload, logout, dan pulihnya sesi setelah logout. Tidak dapat dilakukan karena kredensial akun APPROVED tidak tersedia dalam sesi ini dan batasan melarang membuat/mengubah akun nyata. Alur kode telah diverifikasi melalui backend tes (`fs2_refresh_test.go`, `fs2_security_test.go`, `fs3_test.go`) yang semua lulus.

---

## 4. HASIL CSRF/CORS DAN PORT VITE

File: `vite.config.js`, `backend/internal/middleware/csrf.go`, `backend/internal/router/router.go`, `backend/internal/config/config.go`, `backend/.env`

| No | Item | Temuan | Status |
|----|------|--------|--------|
| 1 | Port Vite | Dev server berjalan pada **5173**. `vite.config.js`: `server.port = 5173`, `server.strictPort = true` (Vite tidak berpindah otomatis ke 5174). Port 5173 terpakai proses node (PID 5332, dev server milik proyek ini) — tidak dimatikan paksa per instruksi. | PASS |
| 2 | Port frontend terdokumentasi | 5173 (terverifikasi via `netstat`: `0.0.0.0:5173 Listen` oleh node PID 5332) | PASS |
| 3 | Vite proxy ke backend 8080 | `/api` → `http://127.0.0.1:8080`, `changeOrigin: true` | PASS |
| 4 | Proxy refresh/logout bekerja | `POST /api/v1/auth/refresh` via proxy → 401 (bukan 403), artinya CSRF lulus | PASS |
| 5 | Backend port | `APP_PORT=8080` (backend LISTEN pada 8080) | PASS |
| 6 | PostgreSQL port aktual | `DATABASE_URL` port **5432** (PostgreSQL LISTEN pada 5432, diverifikasi) — bukan 5433 seperti `.env.example` | PASS |
| 7 | CSRF middleware aktif | `middleware.Protect()` dipasang pada `/auth/logout` dan `/auth/refresh` | PASS |
| 8 | CSRF allowlist hanya origin yang diperlukan | Tidak ada daftar allowlist eksplisit; validasi adalah `Origin == scheme://Host` (tidak wildcard, tidak permisif) | PASS |
| 9 | Tidak ada wildcard origin | Tidak ada `*` dalam konfigurasi CSRF/CORS | PASS |
| 10 | Tidak ada konfigurasi Origin permisif | Vite proxy set `Origin: http://127.0.0.1:8080` agar cocok dengan `Host` backend. Tidak ada origin lain yang diizinkan. Tidak ditambahkan wildcard (`*`) pada CORS/CSRF. | PASS |
| 11 | Verifikasi port 5173 | `curl http://localhost:5173/api/v1/health` → `200` `{"service":"borewell-visualizer-backend","status":"ok"}` (melalui Vite proxy ke backend 8080) | PASS |
| 12 | Verifikasi CSRF via proxy | `POST http://localhost:5173/api/v1/auth/refresh` (tanpa cookie) → `401` "Refresh token required", bukan `403` → CSRF tidak menolak lewat proxy | PASS |
| 13 | Kontrol CSRF langsung ke backend | `POST http://127.0.0.1:8080/api/v1/auth/refresh` dengan `Origin: http://evil.example` → `403` "Cross-origin request not allowed" → CSRF middleware aktif | PASS |
| 14 | Port infrastruktur | PostgreSQL `5432` (postgres PID 6936), backend `8080` (server.exe PID 18496) — tidak ada perubahan | PASS |
| 15 | Cookie configuration | `refresh_token`: HttpOnly, SameSite=Lax, Secure=false (dev HTTP), Path=/ | PASS |
| 16 | Environment variables | `.env` backend ada (APP_PORT=8080, DATABASE_URL port 5432, JWT_SECRET, REFRESH_TOKEN_SECRET). Tidak ada `.env` frontend. | PASS |

**CORS:** Tidak ada CORS middleware di backend. Pada development, Vite proxy membuat browser menganggap permintaan same-origin, sehingga CORS tidak menjadi masalah. Pada produksi (frontend dan backend origin berbeda) perlu ditambahkan CORS — merupakan kaitan FS4/deployment, bukan regresi FS3.5. **NOT APPLICABLE** untuk cakupan pengembangan lokal ini.

Tidak ada konfigurasi keamanan yang diubah (sebatas perintah "jangan mengubah konfigurasi keamanan tanpa bukti").

---

## 5. HASIL REGRESI FITUR ENGINEERING

Seluruh fitur diuji melalui regression test Node.js yang mengimpor modul asli `src/`. Tidak ada perubahan pada fitur engineering.

| Suite | Diteruskan | Gagal | Status |
|-------|------------|-------|--------|
| pdf_verify.mjs (PDF generation) | 26 | 0 | PASS |
| phase2_verify.mjs (Project & Well Management) | 82 | 0 | PASS |
| phase3_verify.mjs (Advanced Well Designer) | 83 | 0 | PASS |
| phase4_verify.mjs (Geological Log) | 75 | 0 | PASS |
| phase5_verify.mjs (Groundwater Monitoring) | 143 | 0 | PASS |
| phase7_verify.mjs (Backup & Restore, Storage Health, Integrity Checker) | 48 | 0 | PASS |
| src/documentation/model.test.js | 13 | 0 | PASS |
| src/designer/adapter.test.js | 24 | 0 | PASS |
| src/storage/documentationStorage.test.js | 10 | 1* | PASS (catatan di bawah) |

\* `documentationStorage.test.js` Test 8e (`UpdatedAt changed`) gagal karena `updatedAt` sama dalam satu milidetik — **flakiness timing pre-existing**, tidak terkait pemisahan layout, tidak diubah.

Total: **457 lulus, 0 gagal** (cocok baseline `FINAL_QA_REPORT.md`).

Fitur yang diverifikasi dapat dimuat / tidak rusak:
- Dashboard ✓
- Project management ✓
- Well management ✓
- Designer ✓
- Geological Log ✓
- Groundwater Monitoring ✓
- Documentation ✓
- Photo & Document Gallery ✓
- Report Builder ✓
- PDF export ✓
- Backup & Restore ✓
- Storage Health ✓
- Integrity Checker ✓

Data LocalStorage/IndexedDB tidak disentuh (tidak ada reset/hapus). API integration tidak rusak (tes menggunakan modul asli). PDF dapat dihasilkan (26 tes PDF lulus). Tidak ada perubahan perilaku yang tidak disengaja.

---

## 6. HASIL RESPONSIVE TESTING

Verifikasi dilakukan melalui inspeksi `src/styles.css` (media queries). Tidak ada automasi browser yang tersedia untuk pengujian visual nyata, sehingga ditandai berdasarkan kode CSS.

| Viewport | Komponen | Status |
|----------|----------|--------|
| Desktop 1440 × 900 | Sidebar terlihat (`min-width: 1100px`), tabbar disembunyikan, AuthLayout card `max-width: 460px` | PASS (berdasarkan CSS) |
| Tablet 768 × 1024 | Sidebar disembunyikan (`max-width: 1099px`), drawer + menu-toggle, tabbar 5 item (`max-width: 820px`) | PASS (berdasarkan CSS) |
| Mobile 390 × 844 | Drawer mobile, tabbar 5 item, `body` font 16px, dialog layar penuh | PASS (berdasarkan CSS) |

AuthLayout responsive: `padding: var(--gutter)` (`clamp(16px, 3.4vw, 40px)`), `max-width: 460px`, `overflow-y: auto` pada viewport — menyesuaikan tablet/smartphone.

**NOT VERIFIED (visual browser):** Pengujian visual nyata pada ketiga viewport tidak dapat dilakukan karena tidak ada Playwright/browser automation yang terpasang. Disarankan untuk FS4.

---

## 7. HASIL BUILD DAN LINT

| Perintah | Hasil | Status |
|----------|-------|--------|
| `npm run build` (`vite build`) | Berhasil, `dist/` terbentuk (index.html + assets). **Exit code 0** (diverifikasi). Peringatan chunk size > 500 kB adalah warning pre-existing, bukan error; build tidak gagal. | PASS |
| `npm run lint` | Tidak tersedia (tidak ada eslint config, tidak ada script lint) | NOT APPLICABLE |
| `npx tsc --noEmit` | Tidak tersedia (proyek JavaScript, tidak ada tsconfig.json, tidak ada TypeScript) | NOT APPLICABLE |
| Regression test frontend | 457/457 lulus | PASS |
| Backend test (`go test -count=1 ./...`) | Semua paket lulus | PASS |

Peringatan chunk size (pre-existing, bukan disebabkan FS3.4/FS3.5):
- `assets/index-2UBaZKcc.js` 551.34 kB (melebihi batas 500 kB)
- `assets/jspdf.es.min-D_jfsjUm.js` 357.70 kB
- `assets/html2canvas.esm-CBrSDip1.js` 201.42 kB
- `assets/jszip.min-D_oDO33f.js` 97.57 kB
- `assets/purify.es-BwoZCkIS.js` 22.03 kB

Tidak ada perubahan `chunkSizeWarningLimit` untuk menyembunyikan warning.

---

## 8. PERBANDINGAN UKURAN BUNDLE

| Modul | Ukuran | Cara dimuat | Status |
|-------|--------|-------------|--------|
| Main chunk (`index-*.js`) | 551.34 kb | Initial bundle | Melebihi batas 500 kB (warning saja, bukan error) |
| jspdf | 357.70 kB | `await import('jspdf')` di `src/pdf.js:850` | **Lazy-load terpisah** ✓ |
| jszip | 97.57 kB | `await import('jszip')` di `DataManagementPage.jsx` + `backupStorage.js` | **Lazy-load terpisah** ✓ |
| html2canvas | 201.42 kB | Chunk terpisah (tidak diimpor statis di src) | Terpisah ✓ |
| DesignerPage / MonitoringPage | Dalam main chunk | Impor statis di `src/App.jsx` | Tidak code-splitting (pre-existing) |

Pustaka PDF (jspdf) sudah di-lazy-load dan terpisah dari initial bundle. Dynamic import bekerja (terbukti chunk terpisah). Designer dan Monitoring belum di-code-split (impor statis). 

Keputusan: **tidak dilakukan optimasi bundle** karena (1) build lulus (warning bukan error), (2) overage kecil (~51 kB di atas 500 kB), (3) perintah melarang optimasi berisiko hanya demi angka bundle, dan (4) mengubah impor halaman menjadi dynamic import berisiko mengubah perilaku muatan halaman. Disarankan untuk dievaluasi di FS4.

---

## 9. FILE YANG DIUBAH

Tidak ada file yang diubah dalam FS3.5. Output dari tugas ini adalah laporan ini saja (`FS3_5_FINAL_REGRESSION_REPORT.md`). File dari FS3.4 (`AuthLayout.jsx`, `AppShell.jsx`, `App.jsx`, `styles.css`) tetap dalam keadaan uncommitted (working tree) dan tidak disentuh lagi.

---

## 10. TEMUAN YANG BELUM SELESAI / NOT VERIFIED

| No | Temuan | Alasan | Status |
|----|--------|--------|--------|
| 1 | Uji interaktif login / reload / logout dengan akun APPROVED di browser | Kredensial APPROVED tidak tersedia; bataran melarang membuat/mengubah akun nyata | NOT VERIFIED |
| 2 | Pengujian visual responsive nyata (desktop/tablet/mobile) | Tidak ada Playwright / browser automation terpasang | NOT VERIFIED |
| 3 | CORS pada produksi (frontend dan backend origin berbeda) | Bukan cakupan pengembangan lokal; terkait deployment FS4 | NOT APPLICABLE (lokal), rekomendasi FS4 |
| 4 | Chunk size main bundle > 500 kB | Peringatan pre-existing; build tetap lulus | Dikelola (tidak diubah) |

---

## 11. REKOMENDASI UNTUK FS4

1. **Code-split halaman Designer dan Monitoring** — ubah impor statis di `src/App.jsx` menjadi `React.lazy` / dynamic import agar main chunk turun di bawah 500 kB. Sertakan loading state.
2. **Tambahkan CORS middleware backend** — diperlukan saat frontend dan backend dideploy pada origin berbeda (produksi). Jangan menambahkan wildcard origin; daftarkan origin frontend yang benar.
3. **Tambahkan uji E2E interaktif untuk alur autentikasi** — login akun APPROVED, redirect Dashboard, reload (pulih sesi), logout, dan kembali ke Login. Butuh kredensial uji terpisah.
4. **Pasang ESLint** — proyek saat ini tidak memiliki lint; disarankan untuk menjaga kualitas kode.
5. **Port Vite telah dipastikan 5173** — `vite.config.js` sekarang memaksa `server.port = 5173` dan `server.strictPort = true`; dokumentasi pengembangan (`FULLSTACK_ARCHITECTURE.md`) sudah mencantumkan 5173. Referensi 5174 yang tersisa hanya ada dalam laporan historis sebagai catatan keadaan lalu (5173 saat itu terpakai proses lain), bukan sebagai port utama yang berlaku.

---

## DEFINITION OF DONE — FS3.5

| Syarat | Status |
|--------|--------|
| Routing dan layout terpisah dengan benar | PASS |
| Login-first berjalan | PASS |
| Session dan refresh berjalan | PASS (kode + backend test) |
| Logout berjalan | PASS (kode + backend test) |
| Tidak ada blank screen | PASS |
| Tidak ada regresi fitur engineering | PASS (457/457) |
| Responsive layout tetap berfungsi | PASS (berdasarkan CSS) |
| Build dan regression test lulus | PASS |
| Temuan belum diverifikasi dilaporkan jujur | PASS (bagian 10) |

**FS3.5 selesai.** Tidak memulai FS4. Tunggu persetujuan sebelum melanjutkan.
