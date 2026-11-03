# 🚰 Visualisasi Pipa Sumur Bor — Borewell Engineering Visualizer

Aplikasi web interaktif untuk memvisualisasikan dan mendokumentasikan konstruksi sumur bor secara komprehensif. Dirancang untuk insinyur geoteknik, hidrogeologi, dan teknisi lapangan dalam merancang, memonitor, dan melaporkan spesifikasi sumur bor secara visual dan terstruktur.

## ✨ Fitur Utama

### 📁 Manajemen Proyek & Sumur (Phase 2)
- **Proyek**: Buat, edit, arsipkan, pulihkan, duplikasi, hapus proyek dengan validasi
- **Sumur**: Multiple sumur per proyek, tipe (produksi, monitoring, eksplorasi, test), status (planned, drilling, completed, on_hold, abandoned)
- **Isolasi Data**: Data sumur terisolasi per proyek & per sumur — tidak ada kebocoran data
- **Migrasi Otomatis**: Data lama (legacy) termigrasi aman ke struktur baru dengan backup

### 🎨 Desain Konstruksi Sumur Lanjutan (Phase 3)
- **Komponen Modular**: Surface casing, production casing, blank casing, screen pipe, open hole, gravel pack, cement grouting
- **Marker**: Well cap, submersible pump, pump position, water level marker
- **Validasi Teknis**: Overlap detection, diameter validation, depth range checking
- **Undo/Redo**: History stack (max 50) dengan keyboard shortcut
- **Autosave**: Penyimpanan otomatis 1.5s setelah perubahan
- **Export PNG**: Ekspor kanvas desain sebagai gambar

### 📊 Log Geologi (Phase 4)
- **Lapisan Geologi**: Multiple lapisan dengan material, kedalaman, deskripsi, formasi
- **10 Kategori Material**: Topsoil, clay, silt, sand, gravel, sandstone, limestone, shale, granite, basalt, dll.
- **Visualisasi Proporsional**: Kanvas log geologi dengan skala kedalaman
- **Validasi**: Overlap warning, gap warning, kedalaman di luar sumur
- **Ringkasan**: Total lapisan, interval terisi, kedalaman terdalam

### 💧 Monitoring Air Tanah (Phase 5)
- **Pengukuran Muka Air**: Waktu, kedalaman, titik referensi (TOC/GL), elevasi referensi, metode, status, catatan
- **Hidrograf Interaktif**: Grafik time-series muka air dengan sumbu kedalaman & waktu
- **Statistik**: Min, max, rata-rata, perubahan terakhir, elevasi muka air (estimasi)
- **Import/Export CSV**: Format standar dengan validasi, preview import, duplicate ID handling
- **Peringatan Titik Referensi**: Deteksi mixed reference points
- **Isolasi Per Sumur**: Data monitoring terpisah per sumur

### 📸 Dokumentasi Foto & Dokumen (Phase 6)
- **Galeri Foto**: 10 kategori (site condition, drilling process, well construction, dll.), max 3 per kategori
- **Manajemen Dokumen**: 10 kategori (permit, contract, test result, daily report, as-built, dll.)
- **Upload Drag & Drop**: Validasi tipe file (JPG, PNG, WebP, PDF, TXT), batas ukuran (10MB foto, 20MB dokumen)
- **IndexedDB**: File besar (>2MB) disimpan di IndexedDB, kecil di localStorage (base64)
- **Pratinjau**: Image preview, PDF iframe, metadata (kategori, ukuran, tanggal, deskripsi)
- **Pencarian & Filter**: Search nama/deskripsi, filter kategori, sort (tanggal, nama, ukuran)
- **Grid/List View**: Toggle mode tampilan
- **Migrasi Legacy**: Foto borehole lama & activity images termigrasi otomatis

### 📄 Pembuat Laporan Profesional (Phase 6)
- **7 Bagian Laporan**: Cover, Project & Well Info, Well Construction, Geological Log, Groundwater Monitoring, Field Documentation, Notes & Conclusion
- **Pilihan Foto**: Select foto dokumentasi untuk disertakan di laporan
- **Metadata Laporan**: Judul, nomor, revisi, tanggal, disusun oleh, ditinjau oleh, logo perusahaan
- **Catatan Teknis & Kesimpulan**: Editor teks kaya
- **Pratinjau HTML**: Live preview sebelum ekspor PDF
- **PDF Multi-Halaman**: Diagram konstruksi, tabel geologi, hidrograf, galeri foto, tanda tangan

### 💾 Manajemen Data, Backup & Restore (Phase 7)
- **Backup Lengkap**: ZIP archive (manifest.json + localStorage JSON + assets IndexedDB)
- **Full Replace**: Ganti seluruh data dengan backup (dengan safety backup otomatis & rollback)
- **Merge**: Gabungkan data backup dengan existing (deteksi konflik project code/well code)
- **Safety Backup**: Otomatis sebelum restore, manual recovery via UI
- **Export Parsial**: Projects (JSON), Well (JSON), Monitoring (CSV), Geology (CSV), Docs Metadata (JSON)
- **Import**: Projects (JSON), Well (JSON) dengan validasi
- **Storage Health**: Monitor localStorage & IndexedDB usage, quota, warnings (>60% warning, >80% critical)
- **Integritas Data**: Pemeriksaan duplicate IDs, orphaned docs, broken references, invalid values
- **Perbaikan Aman**: Repair preview dengan konfirmasi (rename duplicate well, remove orphaned well)

## 🧑‍💻 Teknologi yang Digunakan

- **React 18 + Vite 5**: Antarmuka modern, cepat, modular
- **Lucide React**: Ikon modern pada navigasi, formulir, dan aksi
- **CSS Murni** (`src/styles.css`): Tema kertas teknis, layout Grid/Flexbox, responsif desktop & mobile (tab bar bawah), animasi halus yang menghormati `prefers-reduced-motion`
- **Canvas API**: Menggambar pipa, saringan, open hole, MAT, permukaan tanah, skala kedalaman, log geologi, hidrograf
- **jsPDF**: Ekspor laporan konstruksi, data teknis, foto borehole, dokumentasi kegiatan
- **JSZip**: Backup/restore berbasis ZIP archive
- **LocalStorage**: Menyimpan otomatis seluruh model, data sumur, dokumentasi di browser
- **IndexedDB**: Penyimpanan file binary besar (foto, dokumen >2MB)
- **FileReader API**: Validasi upload gambar, pratinjau, batas maksimal per file

## 🚀 Menjalankan Proyek (Full-Stack)

### Frontend Only (LocalStorage Mode)
Aplikasi dapat berjalan sepenuhnya di browser tanpa backend:

1. Instal dependensi:
   ```sh
   npm install
   ```

2. Jalankan mode pengembangan:
   ```sh
   npm run dev
   ```

3. Build versi produksi:
   ```sh
   npm run build
   ```

4. Preview build produksi:
   ```sh
   npm run preview
   ```

### Full-Stack Mode (Dengan Backend & Database)

#### Persyaratan
- **Go 1.22+**
- **Node.js 20+** dan **npm**
- **PostgreSQL 15+**
- **Docker** (opsional, untuk PostgreSQL)

#### Setup Backend

1. Masuk ke direktori backend:
   ```sh
   cd backend
   ```

2. Salin file konfigurasi contoh:
   ```sh
   cp .env.example .env
   ```

3. Edit file `.env` dan isi nilai yang diperlukan:
   - `DATABASE_URL` — Connection string PostgreSQL (wajib)
   - `JWT_SECRET` — Secret untuk access token (min 32 karakter, wajib)
   - `REFRESH_TOKEN_SECRET` — Secret untuk refresh token (min 32 karakter, wajib)
   - `FILE_STORAGE_PATH` — Direktori penyimpanan file (default: `./data/files`)
   - `APP_ENV` — `development` atau `production`
   - `APP_PORT` — Port backend (default: `8080`)

   Contoh `.env` untuk development:
   ```env
   APP_ENV=development
   APP_PORT=8080
   DATABASE_URL=postgresql://postgres:password@localhost:5432/borewell?sslmode=disable
   JWT_SECRET=your-super-secret-jwt-key-change-in-production-32-chars-min
   REFRESH_TOKEN_SECRET=your-super-secret-refresh-key-change-in-production-32-chars-min
   FILE_STORAGE_PATH=./data/files
   LOG_LEVEL=info
   ```

4. Jalankan PostgreSQL (via Docker atau install manual):
   ```sh
   # Via Docker
   docker run --name postgres-borewell \
     -e POSTGRES_DB=borewell \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=password \
     -p 5432:5432 \
     -d postgres:15
   ```

5. Jalankan migrasi database:
   ```sh
   ./bin/migrate up
   # atau jika menggunakan source: go run ./cmd/migrate up
   ```

6. (Opsional) Buat user admin pertama:
   ```sh
   ./bin/bootstrap-admin -email admin@example.com -password "StrongPassword123"
   ```

7. Jalankan backend server:
   ```sh
   ./bin/server
   # atau: go run ./cmd/server
   ```

   Backend akan berjalan di `http://127.0.0.1:8080`

#### Setup Frontend (Development)

1. Di direktori root proyek, instal dependensi:
   ```sh
   npm install
   ```

2. Jalankan Vite dev server:
   ```sh
   npm run dev
   ```

   Frontend akan berjalan di `http://localhost:5173` dan proxy `/api` ke backend.

#### Build Produksi

1. Build frontend:
   ```sh
   npm run build
   ```
   Output di folder `dist/`.

2. Build backend:
   ```sh
   cd backend
   go build -o bin/server ./cmd/server
   ```

3. Jalankan backend dan serve frontend statis via reverse proxy (nginx/Caddy) atau gunakan Vite preview untuk testing.

## 🧪 Menjalankan Test

```sh
# Phase 2 - Project & Well Management
node tests/phase2_verify.mjs

# Phase 3 - Advanced Well Designer
node tests/phase3_verify.mjs

# Phase 4 - Geological Log
node tests/phase4_verify.mjs

# Phase 5 - Groundwater Monitoring
node tests/phase5_verify.mjs

# Phase 7 - Data Management, Backup & Restore
node tests/phase7_verify.mjs

# PDF Generation
node tests/pdf_verify.mjs
```

Semua test dijalankan di Node.js dengan localStorage/IndexedDB mock.

## 📦 Arsitektur Penyimpanan

### LocalStorage Keys
- `borewell-projects:v1` — Daftar proyek + active project/well IDs
- `borewell-project-{id}:v1` — Record proyek individual
- `borewell-well-{id}:v1` — Data sumur (well, model, activity)
- `borewell-project-docs:v1` — Dokumentasi level proyek
- `borewell-well-docs-{wellId}:v1` — Dokumentasi level sumur
- `borewell-migration:v1` — Flag status migrasi
- `borewell-safety-backup:v1` — Safety backup untuk restore
- `borewell-backup-history:v1` — Riwayat backup lokal (max 50)

### IndexedDB
- Database: `BorewellDocsDB` (version 1)
- Object Stores: `photos`, `documents`
- Key Path: `id`
- Menyimpan file binary sebagai base64 data URLs

## 🔒 Keamanan & Privasi

- **Frontend-only**: Tidak ada backend, cloud database, atau paid API
- **Data Lokal**: Seluruh data proyek, sumur, foto, dokumen tetap di browser pengguna
- **Validasi File**: Tipe MIME, ekstensi, ukuran file divalidasi sebelum disimpan
- **Sanitasi CSV**: Formula injection prevention pada export
- **Path Traversal Protection**: ZIP extraction aman, validasi manifest
- **Tidak Ada Jaringan Eksternal**: Aplikasi bekerja sepenuhnya offline setelah load awal

## 📱 Responsivitas & Aksesibilitas

- **Desktop** (≥1200px): Layout 3-kolom penuh (toolbar, canvas, properties)
- **Tablet** (768-1199px): Layout 2-kolom, properties panel disembunyikan
- **Mobile** (<768px): Single column, bottom tab bar, drawer sidebar, dialog bottom-sheet
- **Keyboard Navigation**: Focus visible, tab order logis, Escape untuk tutup dialog
- **Semantic HTML**: Button, nav, main, section, dialog, form elements
- **ARIA**: Labels, roles, aria-current, aria-disabled, aria-live
- **Color Contrast**: Tema warna memenuhi WCAG AA
- **Reduced Motion**: Menghormati `prefers-reduced-motion`

## ⚡ Performa

- **Bundle Size**: ~517 KB (gzipped: ~144 KB)
- **Code Splitting**: Vendor chunks terpisah (jsPDF, JSZip, html2canvas)
- **Lazy Loading**: Heavy libraries (jsPDF, JSZip) hanya load saat dibutuhkan
- **Autosave Debounce**: 1.5s debounce mengurangi write ke storage
- **Canvas Optimization**: requestAnimationFrame, offscreen rendering
- **IndexedDB Async**: Non-blocking file operations

## 📚 Dokumentasi Proyek

- `README.md` — File ini
- `PHASE6_IMPLEMENTATION_SUMMARY.md` — Rincian implementasi Phase 6
- `PHASE7_COMPLETION_REPORT.md` — Laporan lengkap Phase 7
- `PHASE_3.1_COMPLETION_REPORT.md` — Integrasi Designer & Legacy
- `tasks/plan.md` — Rencana pengembangan keseluruhan
- `tasks/todo.md` — Daftar tugas
- `tasks/phase7_plan.md` — Rencana Phase 7

## 🛠️ Dokumentasi Operasional

### Autentikasi & Persetujuan

**Registrasi User Baru:**
1. Buka halaman Register, isi email, password (min 12 karakter), konfirmasi password, nama lengkap
2. Akun dibuat dengan status `pending` — menunggu persetujuan admin
3. Admin login ke halaman "Persetujuan Admin" (`/admin-approval`)
4. Admin approve/reject user; user mendapat notifikasi status

**Login:**
1. Masukkan email & password di halaman Login
2. Access token (JWT, 15 menit) disimpan di memori (bukan localStorage)
3. Refresh token (30 hari) disimpan di HttpOnly cookie
4. Otomatis refresh token saat access token expired (sebelum request API)

**Logout:** Menghapus access token memori, merevoke refresh token di server, menghapus cookie.

### Backup & Restore

**Backend (Database + Files):**
```sh
# Backup database PostgreSQL
pg_dump -h localhost -U postgres -d borewell -Fc -f borewell_backup_$(date +%Y%m%d_%H%M%S).dump

# Restore database
pg_restore -h localhost -U postgres -d borewell -c borewell_backup_20260101_120000.dump

# Backup file storage (direktori fisik)
tar -czf files_backup_$(date +%Y%m%d_%H%M%S).tar.gz ./data/files
```

**Frontend (via UI - Data Management Page):**
- Tab "Backup & Restore" → "Buat & Unduh Backup" → menghasilkan file ZIP
- Backup mencakup: projects, wells, designer, geology, monitoring, photos, documents, IndexedDB assets
- Restore: pilih file ZIP → pilih mode "Full Replace" atau "Merge" → konfirmasi
- Safety backup otomatis dibuat sebelum restore; bisa dipulihkan via "Pulihkan Safety Backup"

**Konsistensi Backup:** Backup database dan file storage harus dilakukan bersamaan (dalam window waktu yang sama) untuk konsistensi metadata-file.

### File Storage

- Lokasi: `FILE_STORAGE_PATH` dari `.env` (default: `backend/data/files/`)
- Struktur: `photos/{uuid}.{ext}`, `documents/{uuid}.{ext}`
- Validasi: MIME type (content-based via `mimetype` lib), ekstensi, ukuran (foto 10MB, dokumen 20MB)
- Path traversal protection: `filepath.Clean` + verifikasi path berada di bawah `FILE_STORAGE_PATH`
- Checksum SHA-256 disimpan untuk deduplikasi dan verifikasi integritas

### Migrasi Legacy Data

**Wizard Migrasi (Halaman "Legacy Migration"):**
1. Masuk ke halaman Data Management → tab "Legacy Migration"
2. Klik "Scan Data Legacy" — mendeteksi data localStorage/IndexedDB lama
3. Review preview: jumlah proyek, sumur, foto, dokumen, Konflik kode
4. Pilih opsi: "Skip Conflicts" atau biarkan auto-rename (`-IMPORT` suffix)
5. Klik "Import" — migrasi transaksional ke backend
6. Hasil: status imported/skipped/errors per item

**Catatan:** Migrasi satu arah (legacy → backend). Data legacy tetap ada di browser sampai dihapus manual.

### Troubleshooting

| Masalah | Penyebab & Solusi |
|---------|-------------------|
| Frontend tidak konek ke backend | Cek backend running di port 8080, cek Vite proxy config |
| Login gagal "Invalid credentials" | Cek user status `approved`, password benar, DB accessible |
| Refresh token 401 terus menerus | Cookie tidak terkirim (cek SameSite, Secure, domain), clear browser cookies |
| Upload file gagal "Invalid MIME type" | File corrupt atau bukan format yang diizinkan; cek `mimetype` detection |
| Backup restore gagal | Cek format manifest.json, versi kompatibel, disk space cukup |
| RLS error "permission denied" | Pastikan migrasi RLS terjalankan (`goose up`), user context diset via `SET LOCAL` |
| Chunk size warning build | Sudah dioptimasi via `manualChunks` di `vite.config.js` |

### Shutdown (Menghentikan Aplikasi)

1. **Frontend (Vite dev server):** `Ctrl+C` di terminal Vite
2. **Backend (Go server):** `Ctrl+C` di terminal backend — graceful shutdown 30s timeout
3. **PostgreSQL (Docker):** `docker stop postgres-borewell` → `docker rm postgres-borewell`
4. **PostgreSQL (Manual/Systemd):** `systemctl stop postgresql` atau `pg_ctl stop`

**Penting:** Selalu hentikan backend sebelum PostgreSQL untuk menghindari koneksi terputus saat transaksi.

## 🏷️ Identitas Aplikasi

- **Nama**: Visualisasi Pipa Sumur Bor / Borewell Engineering Visualizer
- **Versi**: 2.0.0
- **Favicon**: `img/tubes.png`
- **Title**: "Visualisasi Pipa Sumur Bor"
- **Brand**: "Borewell Visualizer" (sidebar), "Sumur Bor Visualisasi konstruksi" (topbar)

## ⚠️ Keterbatasan Dikenal

1. **Pratinjau Laporan**: HTML preview disederhanakan — PDF output lebih sophisticated
2. **IndexedDB di Test**: Dimock di test environment
3. **File Besar Fallback**: Base64 di localStorage jika IndexedDB unavailable
4. **Migrasi Satu Arah**: Legacy → Modern, tidak ada rollback ke legacy
5. **Offline Only (Frontend-only mode)**: Tidak ada sinkronisasi cloud atau multi-device
6. **Single User (Frontend-only mode)**: Tidak ada autentikasi atau multi-user support
7. **Backend Production Hardening**: HTTPS, production secrets, dan deployment belum diverifikasi (lokal only)

## 🔮 Enhancement Masa Depan (Out of Scope)

- Batch operations (multi-select delete/download)
- Custom report templates
- Digital signature support
- Cloud sync/backup
- OCR untuk dokumen scan
- Multi-language support
- Advanced charting (drill-down, annotations)

---

**Dibangun dengan ❤️ untuk komunitas teknik sumur bor Indonesia**