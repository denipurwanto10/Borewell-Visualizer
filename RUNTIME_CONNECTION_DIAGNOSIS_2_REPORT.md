# RUNTIME CONNECTION DIAGNOSIS 2 REPORT

Proyek: Borewell Engineering Visualizer  
Tanggal: 2026-11-03  
Status: DIAGNOSIS SELESAI — penyebab ditemukan dan divalidasi

---

## 1. Kondisi awal (sebelum perbaikan)

| Pemeriksaan | Hasil |
|---|---|
| Listener port 8080 (`Get-NetTCPConnection -LocalPort 8080`) | **Tidak ada** listener (no objects found) |
| Proses Go / backend hidup | **Tidak ada** proses `go`/`server` |
| Backend di terminal terpisah | **Tidak** |
| Backend berhenti setelah pengujian sebelumnya | **Ya** — tidak tersisa proses apa pun |
| Konflik port / lebih dari satu backend | Tidak ada (karena tidak ada proses sama sekali) |

**Kesimpulan awal:** Saat Vite dijalankan, tidak ada backend yang menunggu di `127.0.0.1:8080`, sehingga setiap permintaan proxy `/api` menghasilkan `connect ECONNREFUSED 127.0.0.1:8080`.

---

## 2. Backend dijalankan secara persisten

Backend di-build dan dijalankan sebagai proses terpisah (terlepas dari shell orchestrator):

- Perintah: `go build -o server.exe ./cmd/server` → `server.exe` (working directory `backend/`)
- Build: **sukses** (exit 0, tanpa kesalahan kompilasi)
- `.env` dibaca: `APP_PORT=8080`, `DATABASE_URL` pada `127.0.0.1:5432` (tidak diubah)
- Server listen pada `:8080` (semua antarmuka, mencakup `127.0.0.1:8080`)

### Bukti proses & port (saat report ditulis)

```
ID  ProcessName  Path
18496 server     C:\Website\visualisasi_pipa\backend\server.exe
```

```
LocalAddress  LocalPort  State      OwningProcess
::            8080       Listen     18496
127.0.0.1     8080       TimeWait   0      (koneksi uji yang sudah selesai)
```

Log startup (`backend_startup.err`):
- `starting borewell visualizer backend {env: development, port: 8080}`
- `database connection pool established {max_conns: 20, min_conns: 5}`
- `server listening {addr: :8080}`

Semua rute terdaftar (`/api/v1/health`, `/api/v1/ready`, `/api/v1/auth/me`, dll.) — tidak ada crash runtime.

PostgreSQL berjalan pada port 5432 (PID 6936) — konfigurasi database **tidak diubah**, sesuai batasan.

---

## 3. Hasil pengujian langsung (backend)

| Endpoint | Metode | Hasil | Keterangan |
|---|---|---|---|
| `http://127.0.0.1:8080/api/v1/health` | GET | `{"service":"borewell-visualizer-backend","status":"ok"}` | 200 OK |
| `http://127.0.0.1:8080/api/v1/ready` | GET | `{"status":"ready","checks":{"database":"ok"}}` | 200 OK, DB terhubung |

---

## 4. Hasil pengujian melalui Vite (proxy)

Vite berjalan (port 5173 proses PID 26112; instansi tambahan pada 5175 PID 9508 karena 5173/5174 terpakai). Proxy `vite.config.js`: `/api → http://127.0.0.1:8080`.

| Endpoint | Metode | Hasil | Keterangan |
|---|---|---|---|
| `http://127.0.0.1:5173/api/v1/health` | GET | `{"service":"borewell-visualizer-backend","status":"ok"}` | 200 OK via proxy |
| `http://127.0.0.1:5173/api/v1/auth/me` | GET | `{"detail":"Authorization header required","status":401}` | 401 — **diterima** (tanpa login), bukan ECONNREFUSED |

**Tidak ada ECONNREFUSED** pada semua uji di atas.

---

## 5. Konfigurasi proses (verifikasi)

- Backend listen: `:8080` → mencakup `127.0.0.1:8080` ✓
- `.env` `APP_PORT=8080` ✓
- Vite proxy target: `http://127.0.0.1:8080` ✓
- Tidak ada konfigurasi port berbeda antara `.env`, server, dan Vite ✓
- PostgreSQL tetap port 5432 (tidak diubah) ✓
- `host: '0.0.0.0'` pada Vite hanya mengatur antarmuka frontend, **bukan** pengganti backend ✓

---

## 6. Penyebab akhir

**Penyebab utama:** Backend Go **tidak berjalan** saat Vite dijalankan. Tidak ada proses yang listen pada port 8080, sehingga Vite proxy tidak dapat mentransfer permintaan `/api` ke backend, menghasilkan `connect ECONNREFUSED 127.0.0.1:8080`.

Ini bukan masalah konfigurasi (`.env`, `vite.config.js`, dan `server.go` sudah konsisten pada port 8080), melainkan **masalah keberadaan proses runtime**: backend sebelumnya telah dimatikan setelah pengujian health, dan tidak ditinggalkan berjalan di terminal terpisah.

---

## 7. Rekomendasi (menjaga agar tidak kembali)

Biarkan backend tetap berjalan dan gunakan **dua terminal terpisah**:

- **Terminal 1:** Backend Go — `cd backend && go run ./cmd/server` (jangan tutup setelah health check)
- **Terminal 2:** Frontend Vite — `npm run dev` (atau `vite`)

Jangan mengklaim masalah selesai hanya karena backend berhasil dijalankan sesaat. Pastikan proses backend (PID 18496 / `server.exe`) tetap hidup selama pengembangan.

---

## 8. Catatan

- Laporan ini dibuat setelah diagnosis dan verifikasi. Tidak ada commit/push/deployment yang dilakukan.
- Database, Docker volume, LocalStorage/IndexedDB, password Admin, RLS, dan autentikasi tidak diubah.
- UI tidak diubah.
