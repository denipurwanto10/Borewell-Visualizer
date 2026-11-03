// Phase 6 — Documentation & Reports data model
// Units: file sizes in bytes, dates in ISO 8601.

export const DOC_VERSION = 1;

// Photo categories for field documentation
export const PHOTO_CATEGORIES = [
  { value: 'site_condition', label: 'Kondisi Lapangan' },
  { value: 'drilling_process', label: 'Proses Pengeboran' },
  { value: 'drilling_equipment', label: 'Peralatan Pengeboran' },
  { value: 'well_construction', label: 'Konstruksi Sumur' },
  { value: 'casing_installation', label: 'Pemasangan Casing' },
  { value: 'pump_installation', label: 'Pemasangan Pompa' },
  { value: 'groundwater_measurement', label: 'Pengukuran Air Tanah' },
  { value: 'geological_sample', label: 'Sampel Geologi' },
  { value: 'completion', label: 'Penyelesaian' },
  { value: 'other', label: 'Lainnya' },
];

// Document categories
export const DOCUMENT_CATEGORIES = [
  { value: 'permit', label: 'Izin & Perizinan' },
  { value: 'contract', label: 'Kontrak & Perjanjian' },
  { value: 'technical_spec', label: 'Spesifikasi Teknis' },
  { value: 'test_result', label: 'Hasil Uji Laboratorium' },
  { value: 'daily_report', label: 'Laporan Harian' },
  { value: 'as_built', label: 'Gambar As-Built' },
  { value: 'certification', label: 'Sertifikasi' },
  { value: 'correspondence', label: 'Surat Menyurat' },
  { value: 'manual', label: 'Manual & Panduan' },
  { value: 'other', label: 'Lainnya' },
];

// Report sections available for well completion report
export const REPORT_SECTIONS = [
  { id: 'cover', label: 'Halaman Sampul', default: true },
  { id: 'project_well_info', label: 'Info Proyek & Sumur', default: true },
  { id: 'well_construction', label: 'Konstruksi Sumur', default: true },
  { id: 'geological_log', label: 'Log Geologi', default: true },
  { id: 'groundwater_monitoring', label: 'Monitoring Air Tanah', default: true },
  { id: 'field_documentation', label: 'Dokumentasi Lapangan', default: true },
  { id: 'notes_conclusion', label: 'Catatan & Kesimpulan', default: true },
];

// Generate a stable unique id
export function generateId(prefix = 'doc') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Create a new photo record
export function createPhotoRecord(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || generateId('photo'),
    version: DOC_VERSION,
    projectId: overrides.projectId || '',
    wellId: overrides.wellId || '',
    name: overrides.name || 'Foto Dokumentasi',
    category: overrides.category || 'other',
    description: overrides.description || '',
    documentedAt: overrides.documentedAt || now,
    fileRef: overrides.fileRef || null, // Base64 data URL or reference to IndexedDB
    fileName: overrides.fileName || '',
    fileType: overrides.fileType || 'image/jpeg',
    fileSize: overrides.fileSize || 0,
    width: overrides.width || 0,
    height: overrides.height || 0,
    createdAt: overrides.createdAt || now,
    updatedAt: now,
  };
}

// Create a new document record
export function createDocumentRecord(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || generateId('doc'),
    version: DOC_VERSION,
    projectId: overrides.projectId || '',
    wellId: overrides.wellId || '', // Empty for project-level documents
    title: overrides.title || 'Dokumen Baru',
    category: overrides.category || 'other',
    description: overrides.description || '',
    documentDate: overrides.documentDate || now,
    fileRef: overrides.fileRef || null,
    fileName: overrides.fileName || '',
    fileType: overrides.fileType || 'application/pdf',
    fileSize: overrides.fileSize || 0,
    createdAt: overrides.createdAt || now,
    updatedAt: now,
  };
}

// Create empty documentation state for a project
export function emptyProjectDocumentation() {
  return {
    version: DOC_VERSION,
    photos: [],
    documents: [],
  };
}

// Create empty documentation state for a well
export function emptyWellDocumentation() {
  return {
    version: DOC_VERSION,
    photos: [],
    documents: [],
  };
}

// Normalize photo record (fill defaults, validate)
export function normalizePhotoRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const defaults = createPhotoRecord();
  return {
    id: record.id || generateId('photo'),
    version: record.version || DOC_VERSION,
    projectId: record.projectId || '',
    wellId: record.wellId || '',
    name: record.name || defaults.name,
    category: PHOTO_CATEGORIES.some(c => c.value === record.category) ? record.category : 'other',
    description: record.description || '',
    documentedAt: record.documentedAt || record.createdAt || new Date().toISOString(),
    fileRef: record.fileRef || record.dataUrl || record.preview || null,
    fileName: record.fileName || record.name || '',
    fileType: record.fileType || 'image/jpeg',
    fileSize: Number.isFinite(Number(record.fileSize)) ? Number(record.fileSize) : 0,
    width: Number.isFinite(Number(record.width)) ? Number(record.width) : 0,
    height: Number.isFinite(Number(record.height)) ? Number(record.height) : 0,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
}

// Normalize document record
export function normalizeDocumentRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const defaults = createDocumentRecord();
  return {
    id: record.id || generateId('doc'),
    version: record.version || DOC_VERSION,
    projectId: record.projectId || '',
    wellId: record.wellId || '',
    title: record.title || defaults.title,
    category: DOCUMENT_CATEGORIES.some(c => c.value === record.category) ? record.category : 'other',
    description: record.description || '',
    documentDate: record.documentDate || record.createdAt || new Date().toISOString(),
    fileRef: record.fileRef || null,
    fileName: record.fileName || '',
    fileType: record.fileType || 'application/pdf',
    fileSize: Number.isFinite(Number(record.fileSize)) ? Number(record.fileSize) : 0,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
}

// Normalize project documentation
export function normalizeProjectDocumentation(data) {
  if (!data || typeof data !== 'object') return emptyProjectDocumentation();
  return {
    version: data.version || DOC_VERSION,
    photos: Array.isArray(data.photos)
      ? data.photos.map(normalizePhotoRecord).filter(Boolean)
      : [],
    documents: Array.isArray(data.documents)
      ? data.documents.map(normalizeDocumentRecord).filter(Boolean)
      : [],
  };
}

// Normalize well documentation
export function normalizeWellDocumentation(data) {
  if (!data || typeof data !== 'object') return emptyWellDocumentation();
  return {
    version: data.version || DOC_VERSION,
    photos: Array.isArray(data.photos)
      ? data.photos.map(normalizePhotoRecord).filter(Boolean)
      : [],
    documents: Array.isArray(data.documents)
      ? data.documents.map(normalizeDocumentRecord).filter(Boolean)
      : [],
  };
}

// Get photo category label
export function getPhotoCategoryLabel(value) {
  const found = PHOTO_CATEGORIES.find(c => c.value === value);
  return found ? found.label : value;
}

// Get document category label
export function getDocumentCategoryLabel(value) {
  const found = DOCUMENT_CATEGORIES.find(c => c.value === value);
  return found ? found.label : value;
}

// Format file size
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Check if file type is previewable in browser
export function isPreviewable(fileType) {
  if (!fileType) return false;
  // Images
  if (fileType.startsWith('image/')) return true;
  // PDF
  if (fileType === 'application/pdf') return true;
  // Text
  if (fileType.startsWith('text/')) return true;
  return false;
}

// Get file type icon
export function getFileTypeIcon(fileType) {
  if (!fileType) return 'file';
  if (fileType.startsWith('image/')) return 'image';
  if (fileType === 'application/pdf') return 'file-text';
  if (fileType.startsWith('text/')) return 'file-text';
  if (fileType.includes('word') || fileType.includes('document')) return 'file-text';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'table';
  return 'file';
}