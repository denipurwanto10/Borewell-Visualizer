import { createProject, createWell, PROJECT_STATUSES, WELL_TYPES, WELL_STATUSES } from '../models/project.js';
import { INITIAL_WELL, ACTIVITY_KEYS, EMPTY_MODEL, makeEmptyActivity } from '../model.js';

const STORAGE_KEY = 'borewell-projects:v1';
const MIGRATION_KEY = 'borewell-migration:v1';
const LEGACY_KEY = 'wellData';
const V2_KEY = 'visualisasi-pipa-sumur-bor:v2';

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getStoredProjects() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : { projects: [], activeProjectId: null, activeWellId: null };
  } catch {
    return { projects: [], activeProjectId: null, activeWellId: null };
  }
}

function saveProjects(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function isMigrationDone() {
  try {
    return localStorage.getItem(MIGRATION_KEY) === 'completed';
  } catch {
    return false;
  }
}

function markMigrationDone() {
  try {
    localStorage.setItem(MIGRATION_KEY, 'completed');
    return true;
  } catch {
    return false;
  }
}

function backupLegacyData() {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    const v2 = localStorage.getItem(V2_KEY);
    if (legacy) localStorage.setItem(`${LEGACY_KEY}.backup`, legacy);
    if (v2) localStorage.setItem(`${V2_KEY}.backup`, v2);
    return true;
  } catch {
    return false;
  }
}

function normalizeLegacyWell(legacyWell) {
  if (!legacyWell || typeof legacyWell !== 'object') return null;
  return {
    companyName: legacyWell.companyName || '',
    shallowWellNumber: legacyWell.shallowWellNumber || '',
    address: legacyWell.address || '',
    province: legacyWell.province || '',
    latitude: legacyWell.latitude || '',
    longitude: legacyWell.longitude || '',
    elevation: legacyWell.elevation || '',
    city: legacyWell.city || '',
    district: legacyWell.district || '',
    village: legacyWell.village || '',
    boreholeDate: legacyWell.boreholeDate || '',
    wellNumber: legacyWell.wellNumber || '',
    piezoDistance: legacyWell.piezoDistance || '',
    pumpType: legacyWell.pumpType || '',
    pumpPosition: legacyWell.pumpPosition || '',
    boreholeImages: legacyWell.boreholeImages || {},
  };
}

function normalizeLegacyActivity(legacyActivity) {
  const base = makeEmptyActivity();
  if (!legacyActivity || typeof legacyActivity !== 'object') return base;
  for (const key of ACTIVITY_KEYS) {
    const items = Array.isArray(legacyActivity[key]) ? legacyActivity[key] : [];
    base[key] = items
      .filter(item => item && (item.dataUrl || item.preview))
      .slice(0, 3)
      .map((item, index) => ({
        id: item.id || `${key}-${index}-${Date.now()}`,
        name: item.name || `Foto ${index + 1}`,
        dataUrl: item.dataUrl || item.preview || '',
        createdAt: item.createdAt || item.timestamp || new Date().toISOString(),
      }));
  }
  return base;
}

function normalizeLegacyModel(legacyModel) {
  if (!legacyModel || typeof legacyModel !== 'object') return { ...EMPTY_MODEL, pipes: [], screens: [] };
  const pipes = Array.isArray(legacyModel.pipes)
    ? legacyModel.pipes
        .map(pipe => ({
          id: pipe.id || `${pipe.start}-${pipe.end}-${pipe.diameter}`,
          start: Number(pipe.start),
          end: Number(pipe.end),
          depth: Number(pipe.depth ?? (Number(pipe.end) - Number(pipe.start))),
          diameter: Number(pipe.diameter),
        }))
        .filter(pipe => Number.isFinite(pipe.start) && Number.isFinite(pipe.end) && Number.isFinite(pipe.depth) && Number.isFinite(pipe.diameter))
        .sort((a, b) => a.start - b.start)
    : [];
  const screens = Array.isArray(legacyModel.screens)
    ? legacyModel.screens
        .map((screen, index) => ({
          id: screen.id || `screen-${index}`,
          depth: Number(screen.depth),
          size: Number(screen.size),
        }))
        .filter(screen => Number.isFinite(screen.depth) && Number.isFinite(screen.size))
        .sort((a, b) => a.depth - b.depth)
    : [];
  const ground = legacyModel.ground === null || legacyModel.ground === undefined || legacyModel.ground === '' ? null : Number(legacyModel.ground);
  const mat = legacyModel.mat === null || legacyModel.mat === undefined || legacyModel.mat === '' ? null : Number(legacyModel.mat);
  return {
    pipes,
    screens,
    ground: Number.isFinite(ground) ? ground : null,
    mat: Number.isFinite(mat) ? mat : null,
    openHole: legacyModel.openHole && Number.isFinite(Number(legacyModel.openHole.end)) ? {
      start: Number(legacyModel.openHole.start),
      end: Number(legacyModel.openHole.end),
      size: Number(legacyModel.openHole.size),
    } : null,
  };
}

function migrateLegacyData() {
  if (isMigrationDone()) return { success: true, alreadyDone: true };

  try {
    const v2Data = localStorage.getItem(V2_KEY) ? JSON.parse(localStorage.getItem(V2_KEY)) : null;
    const legacyData = localStorage.getItem(LEGACY_KEY) ? JSON.parse(localStorage.getItem(LEGACY_KEY)) : null;

    const hasV2Well = v2Data?.well && Object.keys(v2Data.well).some(k => v2Data.well[k] && k !== 'boreholeImages');
    const hasLegacyWell = legacyData && Object.keys(legacyData).some(k => legacyData[k] && k !== 'boreholeImages' && k !== 'activityImages');

    if (!hasV2Well && !hasLegacyWell) {
      markMigrationDone();
      return { success: true, alreadyDone: true, message: 'No legacy data to migrate' };
    }

    backupLegacyData();

    // Guard: if a migration-created project already exists (e.g. a previous run
    // saved projects but failed before marking migration done), do not duplicate.
    // Original legacy data remains backed up and intact.
    const existing = getStoredProjects();
    const alreadyMigrated = existing.projects.some(
      (p) => p.projectCode === 'DEFAULT' && p.description && p.description.includes('Migrasi')
    );
    if (alreadyMigrated) {
      markMigrationDone();
      return { success: true, alreadyDone: true, message: 'Migrasi sudah diterapkan sebelumnya' };
    }

    const projects = [];
    let activeProjectId = null;
    let activeWellId = null;

    const defaultProject = createProject({
      projectCode: 'DEFAULT',
      projectName: 'Proyek Default (Migrasi)',
      clientName: '-',
      contractorName: '-',
      location: '-',
      status: 'completed',
      description: 'Proyek dibuat otomatis dari data lama saat migrasi.',
    });
    projects.push(defaultProject);
    activeProjectId = defaultProject.id;

    let wellData = null;
    let wellModel = null;
    let wellActivity = null;

    if (v2Data?.well) {
      wellData = { ...INITIAL_WELL, ...v2Data.well, boreholeImages: v2Data.well.boreholeImages || {} };
      wellModel = v2Data.model ? normalizeLegacyModel(v2Data.model) : { ...EMPTY_MODEL, pipes: [], screens: [] };
      wellActivity = v2Data.activity ? normalizeLegacyActivity(v2Data.activity) : makeEmptyActivity();
    } else if (legacyData) {
      wellData = normalizeLegacyWell(legacyData);
      wellModel = legacyData.visualization ? normalizeLegacyModel(legacyData.visualization) : { ...EMPTY_MODEL, pipes: [], screens: [] };
      wellActivity = legacyData.activityImages ? normalizeLegacyActivity(legacyData.activityImages) : makeEmptyActivity();
    }

    if (wellData) {
      const wellCode = wellData.wellNumber || wellData.shallowWellNumber || 'WELL-001';
      const well = createWell({
        projectId: defaultProject.id,
        wellCode,
        wellName: wellData.companyName || 'Sumur Migrasi',
        wellType: 'production',
        location: wellData.address || wellData.village || '-',
        latitude: wellData.latitude || '',
        longitude: wellData.longitude || '',
        plannedDepth: '',
        actualDepth: '',
        drillingDate: wellData.boreholeDate || '',
        completionDate: '',
        status: 'completed',
        description: 'Sumur dimigrasikan dari data lama.',
      });
      defaultProject.wells = [well.id];
      activeWellId = well.id;

      const wellStorageKey = `borewell-well-${well.id}:v1`;
      localStorage.setItem(wellStorageKey, JSON.stringify({
        well: {
          ...wellData,
          id: well.id,
          projectId: well.projectId,
          wellCode,
          wellName: well.wellName,
          wellType: well.wellType,
          location: well.location,
          plannedDepth: well.plannedDepth,
          actualDepth: well.actualDepth,
          drillingDate: well.drillingDate,
          completionDate: well.completionDate,
          status: well.status,
          description: well.description,
          createdAt: well.createdAt,
          updatedAt: well.updatedAt,
        },
        model: wellModel,
        activity: wellActivity,
      }));
    }

    saveProjects({ projects, activeProjectId, activeWellId });
    markMigrationDone();

    return { success: true, message: 'Migrasi berhasil', projectCount: projects.length };
  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error: error.message };
  }
}

export function initializeStorage() {
  const result = migrateLegacyData();
  return result;
}

export function getAllProjects() {
  const data = getStoredProjects();
  return data.projects.map(p => ({
    ...p,
    wellCount: p.wells?.length || 0,
  }));
}

export function getProjectById(id) {
  const data = getStoredProjects();
  return data.projects.find(p => p.id === id) || null;
}

export function createProjectRecord(projectData) {
  const data = getStoredProjects();
  const project = createProject(projectData);
  project.wells = [];
  data.projects.push(project);
  if (!data.activeProjectId) data.activeProjectId = project.id;
  saveProjects(data);
  return project;
}

export function updateProjectRecord(id, updates) {
  const data = getStoredProjects();
  const index = data.projects.findIndex(p => p.id === id);
  if (index === -1) return null;
  const updated = { ...data.projects[index], ...updates, updatedAt: new Date().toISOString() };
  data.projects[index] = updated;
  saveProjects(data);
  return updated;
}

export function deleteProjectRecord(id) {
  const data = getStoredProjects();
  const project = data.projects.find(p => p.id === id);
  if (!project) return false;
  if (project.wells?.length) {
    project.wells.forEach(wellId => {
      localStorage.removeItem(`borewell-well-${wellId}:v1`);
    });
  }
  data.projects = data.projects.filter(p => p.id !== id);
  if (data.activeProjectId === id) {
    data.activeProjectId = data.projects[0]?.id || null;
    data.activeWellId = null;
  }
  saveProjects(data);
  return true;
}

export function archiveProjectRecord(id) {
  return updateProjectRecord(id, { status: 'archived', archivedAt: new Date().toISOString() });
}

export function restoreProjectRecord(id) {
  return updateProjectRecord(id, { status: 'planning', archivedAt: null });
}

export function duplicateProjectRecord(id) {
  const data = getStoredProjects();
  const project = data.projects.find(p => p.id === id);
  if (!project) return null;
  const newProject = createProject({
    ...project,
    projectCode: `${project.projectCode}-COPY`,
    projectName: `${project.projectName} (Salinan)`,
    status: 'planning',
    archivedAt: null,
  });
  newProject.wells = [];
  data.projects.push(newProject);
  saveProjects(data);
  return newProject;
}

export function getActiveProjectId() {
  const data = getStoredProjects();
  return data.activeProjectId;
}

export function setActiveProjectId(id) {
  const data = getStoredProjects();
  data.activeProjectId = id;
  if (id) {
    const project = data.projects.find(p => p.id === id);
    data.activeWellId = project?.wells?.[0] || null;
  } else {
    data.activeWellId = null;
  }
  saveProjects(data);
  return data.activeProjectId;
}

export function getActiveWellId() {
  const data = getStoredProjects();
  return data.activeWellId;
}

export function setActiveWellId(id) {
  const data = getStoredProjects();
  if (id) {
    const project = data.projects.find(p => p.id === data.activeProjectId);
    if (!project?.wells?.includes(id)) return null;
  }
  data.activeWellId = id;
  saveProjects(data);
  return data.activeWellId;
}

export function getWellsForProject(projectId) {
  const data = getStoredProjects();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return [];
  return (project.wells || []).map(wellId => {
    try {
      const wellData = localStorage.getItem(`borewell-well-${wellId}:v1`);
      return wellData ? { ...JSON.parse(wellData).well, id: wellId } : null;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function getWellData(wellId) {
  try {
    const data = localStorage.getItem(`borewell-well-${wellId}:v1`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveWellData(wellId, { well, model, activity }) {
  try {
    const existing = getWellData(wellId) || { well: {}, model: {}, activity: {} };
    const updated = {
      well: { ...existing.well, ...well, updatedAt: new Date().toISOString() },
      model: model !== undefined ? model : existing.model,
      activity: activity !== undefined ? activity : existing.activity,
    };
    localStorage.setItem(`borewell-well-${wellId}:v1`, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export function createWellRecord(projectId, wellData) {
  const data = getStoredProjects();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;

  const well = createWell({ ...wellData, projectId });
  project.wells = [...(project.wells || []), well.id];
  project.updatedAt = new Date().toISOString();

  const wellStorageKey = `borewell-well-${well.id}:v1`;
  localStorage.setItem(wellStorageKey, JSON.stringify({
    well: { ...INITIAL_WELL, ...wellData, id: well.id, projectId, boreholeImages: wellData.boreholeImages || {} },
    model: { ...EMPTY_MODEL, pipes: [], screens: [] },
    activity: makeEmptyActivity(),
  }));

  saveProjects(data);
  return well;
}

export function updateWellRecord(wellId, updates) {
  const data = getWellData(wellId);
  if (!data) return null;
  const updatedWell = { ...data.well, ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem(`borewell-well-${wellId}:v1`, JSON.stringify({
    ...data,
    well: updatedWell,
  }));
  return updatedWell;
}

export function deleteWellRecord(wellId) {
  const data = getStoredProjects();
  data.projects.forEach(project => {
    if (project.wells?.includes(wellId)) {
      project.wells = project.wells.filter(id => id !== wellId);
      project.updatedAt = new Date().toISOString();
    }
  });
  if (data.activeWellId === wellId) {
    const activeProject = data.projects.find(p => p.id === data.activeProjectId);
    data.activeWellId = activeProject?.wells?.[0] || null;
  }
  localStorage.removeItem(`borewell-well-${wellId}:v1`);
  saveProjects(data);
  return true;
}

export function duplicateWellRecord(wellId) {
  const wellData = getWellData(wellId);
  if (!wellData) return null;
  const projectId = wellData.well.projectId;
  // Never carry the source id into the new well; a fresh id must be generated.
  const { id: _sourceId, ...wellForDuplicate } = wellData.well;
  const newWell = createWellRecord(projectId, {
    ...wellForDuplicate,
    wellCode: `${wellData.well.wellCode}-COPY`,
    wellName: `${wellData.well.wellName} (Salinan)`,
    status: 'planned',
  });
  if (newWell) {
    const newWellData = getWellData(newWell.id);
    localStorage.setItem(`borewell-well-${newWell.id}:v1`, JSON.stringify({
      ...newWellData,
      well: newWellData.well,
      model: wellData.model,
      activity: wellData.activity,
    }));
  }
  return newWell;
}

export function getProjectStats() {
  const data = getStoredProjects();
  const projects = data.projects;
  const allWells = projects.flatMap(p => p.wells || []);
  const completedWells = allWells.filter(wellId => {
    const w = getWellData(wellId);
    return w?.well?.status === 'completed';
  }).length;
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);
  const recentWells = allWells
    .map(wellId => getWellData(wellId))
    .filter(Boolean)
    .sort((a, b) => new Date(b.well.updatedAt) - new Date(a.well.updatedAt))
    .slice(0, 5);

  return {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status !== 'archived' && p.status !== 'completed').length,
    totalWells: allWells.length,
    completedWells,
    recentProjects,
    recentWells,
  };
}