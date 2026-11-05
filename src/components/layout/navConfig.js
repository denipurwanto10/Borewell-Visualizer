import {
  LayoutDashboard, FolderOpen, FolderTree, ClipboardList, SlidersHorizontal, Ruler,
  Layers, Droplets, Camera, Images, FileText, Database, Shield, Settings,
} from 'lucide-react';

/**
 * Sumber tunggal untuk semua navigasi (sidebar, menu HP, tab bawah, URL hash).
 * Ubah label/urutan di sini saja — semua tampilan ikut berubah.
 *
 * needsWell  : halaman baru berguna setelah ada sumur aktif
 * adminOnly  : hanya tampil untuk administrator
 * available  : false = belum jadi (tampil "Segera", tidak bisa dibuka)
 */
export const NAV_ITEMS = [
  { id: 'dashboard',       label: 'Beranda',            icon: LayoutDashboard,   hash: '/' },
  { id: 'projects',        label: 'Proyek & Sumur',     icon: FolderOpen,        hash: '/projects' },
  { id: 'project-docs',    label: 'Dokumen Proyek',     icon: FolderTree,        hash: '/project-docs' },

  { id: 'data',            label: 'Data Sumur',         icon: ClipboardList,     hash: '/data',          needsWell: true },
  { id: 'desain',          label: 'Desain Konstruksi',  icon: SlidersHorizontal, hash: '/desain',        needsWell: true },
  { id: 'visualisasi',     label: 'Visualisasi Pipa',   icon: Ruler,             hash: '/visualisasi',   needsWell: true },
  { id: 'geology',         label: 'Log Geologi',        icon: Layers,            hash: '/geology',       needsWell: true },
  { id: 'monitoring',      label: 'Muka Air Tanah',     icon: Droplets,          hash: '/monitoring',    needsWell: true },
  { id: 'docs',            label: 'Foto Kegiatan',      icon: Camera,            hash: '/docs',          needsWell: true },
  { id: 'documentation',   label: 'Galeri & Dokumen',   icon: Images,            hash: '/documentation', needsWell: true },
  { id: 'reports',         label: 'Laporan PDF',        icon: FileText,          hash: '/reports',       needsWell: true },

  { id: 'data-management', label: 'Backup & Data',      icon: Database,          hash: '/data-management' },
  { id: 'admin-approval',  label: 'Persetujuan Akun',   icon: Shield,            hash: '/admin-approval', adminOnly: true },
  { id: 'settings',        label: 'Pengaturan',         icon: Settings,          hash: null,             available: false },
].map((item) => ({ available: true, ...item }));

export const NAV_GROUPS = [
  { id: 'umum',   label: 'Umum',            ids: ['dashboard'] },
  { id: 'proyek', label: 'Proyek',          ids: ['projects', 'project-docs'] },
  { id: 'sumur',  label: 'Pekerjaan sumur', ids: ['data', 'desain', 'visualisasi', 'geology', 'monitoring', 'docs', 'documentation', 'reports'], needsWell: true },
  { id: 'sistem', label: 'Pengelolaan',     ids: ['data-management', 'admin-approval', 'settings'] },
];

/** Grup + item yang boleh dilihat user ini. */
export function getNavGroups({ isAdmin }) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.ids
      .map((id) => NAV_ITEMS.find((i) => i.id === id))
      .filter((i) => i && (!i.adminOnly || isAdmin)),
  })).filter((g) => g.items.length > 0);
}

/** Pintasan di tab bawah (HP). Sisanya lewat tombol "Menu". */
export const TAB_IDS = ['dashboard', 'projects', 'visualisasi', 'desain'];

export const PAGE_HASH_MAP = Object.fromEntries(
  NAV_ITEMS.filter((i) => i.hash).map((i) => [i.id, i.hash]),
);

export const labelOf = (id) => NAV_ITEMS.find((i) => i.id === id)?.label;
