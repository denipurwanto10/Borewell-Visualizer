export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Perencanaan' },
  { value: 'in_progress', label: 'Sedang Berjalan' },
  { value: 'completed', label: 'Selesai' },
  { value: 'on_hold', label: 'Ditunda' },
  { value: 'archived', label: 'Diarsipkan' },
];

export const WELL_TYPES = [
  { value: 'production', label: 'Sumur Produksi' },
  { value: 'monitoring', label: 'Sumur Monitoring' },
  { value: 'exploration', label: 'Sumur Eksplorasi' },
  { value: 'test', label: 'Sumur Uji' },
  { value: 'other', label: 'Lainnya' },
];

export const WELL_STATUSES = [
  { value: 'planned', label: 'Direncanakan' },
  { value: 'drilling', label: 'Sedang Bor' },
  { value: 'completed', label: 'Selesai' },
  { value: 'on_hold', label: 'Ditunda' },
  { value: 'abandoned', label: 'Ditinggalkan' },
];

export function createProject(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    projectCode: data.projectCode || '',
    projectName: data.projectName || '',
    clientName: data.clientName || '',
    contractorName: data.contractorName || '',
    location: data.location || '',
    province: data.province || '',
    district: data.district || '',
    village: data.village || '',
    latitude: data.latitude || '',
    longitude: data.longitude || '',
    description: data.description || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    status: data.status || 'planning',
    createdAt: data.createdAt || now,
    updatedAt: now,
    archivedAt: data.archivedAt || null,
  };
}

export function createWell(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || `well-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    projectId: data.projectId || '',
    wellCode: data.wellCode || '',
    wellName: data.wellName || '',
    wellType: data.wellType || 'production',
    location: data.location || '',
    latitude: data.latitude || '',
    longitude: data.longitude || '',
    plannedDepth: data.plannedDepth || '',
    actualDepth: data.actualDepth || '',
    drillingDate: data.drillingDate || '',
    completionDate: data.completionDate || '',
    status: data.status || 'planned',
    description: data.description || '',
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

export function validateProject(project) {
  const errors = {};
  if (!project.projectCode?.trim()) errors.projectCode = 'Kode proyek wajib diisi';
  if (!project.projectName?.trim()) errors.projectName = 'Nama proyek wajib diisi';
  if (!project.clientName?.trim()) errors.clientName = 'Nama klien wajib diisi';
  if (!PROJECT_STATUSES.some(s => s.value === project.status)) {
    errors.status = 'Status proyek tidak valid';
  }
  if (project.latitude && (Number(project.latitude) < -90 || Number(project.latitude) > 90)) {
    errors.latitude = 'Latitude harus antara -90 dan 90';
  }
  if (project.longitude && (Number(project.longitude) < -180 || Number(project.longitude) > 180)) {
    errors.longitude = 'Longitude harus antara -180 dan 180';
  }
  if (project.startDate && project.endDate && project.endDate < project.startDate) {
    errors.endDate = 'Tanggal selesai tidak boleh sebelum tanggal mulai';
  }
  return Object.keys(errors).length ? errors : null;
}

export function validateWell(well, existingWells = []) {
  const errors = {};
  if (!well.wellCode?.trim()) errors.wellCode = 'Kode sumur wajib diisi';
  if (!well.wellName?.trim()) errors.wellName = 'Nama sumur wajib diisi';
  if (!WELL_TYPES.some(t => t.value === well.wellType)) {
    errors.wellType = 'Tipe sumur tidak valid';
  }
  if (!WELL_STATUSES.some(s => s.value === well.status)) {
    errors.status = 'Status sumur tidak valid';
  }
  if (well.plannedDepth !== '' && (isNaN(Number(well.plannedDepth)) || Number(well.plannedDepth) <= 0)) {
    errors.plannedDepth = 'Kedalaman rencana harus angka positif';
  }
  if (well.actualDepth !== '' && (isNaN(Number(well.actualDepth)) || Number(well.actualDepth) < 0)) {
    errors.actualDepth = 'Kedalaman aktual tidak boleh negatif';
  }
  if (well.latitude && (Number(well.latitude) < -90 || Number(well.latitude) > 90)) {
    errors.latitude = 'Latitude harus antara -90 dan 90';
  }
  if (well.longitude && (Number(well.longitude) < -180 || Number(well.longitude) > 180)) {
    errors.longitude = 'Longitude harus antara -180 dan 180';
  }
  if (well.drillingDate && well.completionDate && well.completionDate < well.drillingDate) {
    errors.completionDate = 'Tanggal selesai bor tidak boleh sebelum tanggal mulai bor';
  }
  const duplicate = existingWells.find(w => 
    w.id !== well.id && 
    w.projectId === well.projectId && 
    w.wellCode.toLowerCase() === well.wellCode.toLowerCase()
  );
  if (duplicate) errors.wellCode = 'Kode sumur sudah ada di proyek ini';
  return Object.keys(errors).length ? errors : null;
}

export function getStatusLabel(statuses, value) {
  const found = statuses.find(s => s.value === value);
  return found ? found.label : value;
}

export function getWellTypeLabel(value) {
  const found = WELL_TYPES.find(t => t.value === value);
  return found ? found.label : value;
}