# 🚰 Visualisasi Pipa Sumur Bor

Aplikasi web interaktif untuk memvisualisasikan konstruksi sumur bor, termasuk pipa, saringan (screen), open hole, muka air tanah (MAT), serta dilengkapi fitur dokumentasi lengkap.
 
Proyek ini dirancang untuk membantu para insinyur geoteknik, hidrogeologi, atau teknisi lapangan dalam merancang dan mendokumentasikan spesifikasi sumur bor secara visual dan terstruktur.

## ✨ Fitur Utama

- **Visualisasi Dinamis**: Gambarkan pipa, saringan, dan open hole secara proporsional dalam kanvas.
- **Titik Acuan & MAT**: Atur posisi permukaan tanah dan level muka air tanah yang dinamis.
- **Manajemen Komponen**:
  - Tambah pipa utama dengan kedalaman tertentu.
  - Tambah saringan (screen) di kedalaman dan panjang yang diinginkan.
  - Atur open hole di dasar sumur.
- **Data Teknis Sumur**: Isi informasi perusahaan, lokasi, koordinat, elevasi, kedalaman pompa, dll.
- **Dokumentasi Terintegrasi**:
  - Unggah foto borehole dan diagram.
  - 6 kategori dokumentasi (papan nama, sumur, persiapan, kegiatan, pipa PVC, pompa).
  - Setiap kategori mendukung hingga 3 foto.
- **Export/Reset Data**: Mulai ulang atau simpan data untuk laporan.

## 🧑‍💻 Teknologi yang Digunakan

- **React 18 + Vite 5**: Antarmuka modern, cepat, dan modular.
- **Lucide React**: Ikon modern pada navigasi, formulir, dan aksi.
- **CSS murni** (`src/styles.css`): tema kertas teknis, layout Grid/Flexbox, responsif desktop dan mobile (tab bar bawah di layar kecil), animasi halus yang menghormati `prefers-reduced-motion`.
- **Canvas API**: Menggambar pipa, saringan, open hole, MAT, permukaan tanah, dan skala kedalaman.
- **jsPDF**: Ekspor laporan konstruksi, data teknis, foto borehole, dan dokumentasi kegiatan.
- **LocalStorage**: Menyimpan otomatis seluruh model, data sumur, dan dokumentasi di browser.
- **FileReader API**: Validasi upload gambar, pratinjau, dan batas maksimal 5 MB per foto.

## 🚀 Menjalankan Proyek

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

Seluruh data tersimpan otomatis di browser. Gunakan tombol **Simpan** untuk penyimpanan manual, **Reset** untuk menghapus data per halaman, dan **Unduh PDF** untuk laporan siap diserahkan.
