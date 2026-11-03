// Phase 7 — Backup & Restore Storage
// Unified backup format with ZIP archive containing manifest + binary assets

import {
  getAllProjects,
  getProjectById,
  getWellsForProject,
  getWellData,
  getProjectStats,
} from './projectStorage.js';
import {
  getProjectDocumentation,
  getWellDocumentation,
  getProjectDocsData,
  getWellDocsData,
  getStorageInfo,
  retrieveFile,
} from './documentationStorage.js';

const BACKUP_FORMAT = 'borewell-engineering-backup';
const BACKUP_VERSION = 1;
const SAFETY_BACKUP_KEY = 'borewell-safety-backup:v1';
const BACKUP_HISTORY_KEY = 'borewell-backup-history:v1';

// Helper to get all localStorage keys (works with both real and mocked)
function getAllLocalStorageKeys() {
  const keys = [];
  try {
    // Try standard approach first
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
  } catch {
    // Fallback for mocks that don't implement key()/length properly
    try {
      keys.push(...Object.keys(localStorage));
    } catch {}
  }
  return keys;
}

// ==================== STORAGE AUDIT ====================

export function auditStorage() {
  const localStorageKeys = [];
  let localStorageSize = 0;

  const allKeys = getAllLocalStorageKeys();
  for (const key of allKeys) {
    const value = localStorage.getItem(key);
    const size = value ? value.length : 0;
    localStorageKeys.push({ key, size });
    localStorageSize += size;
  }

  const borewellKeys = localStorageKeys.filter(k =>
    k.key.startsWith('borewell-') || k.key === 'wellData' || k.key === 'visualisasi-pipa-sumur-bor:v2'
  );

  return {
    localStorage: {
      totalKeys: localStorageKeys.length,
      totalSize: localStorageSize,
      borewellKeys: borewellKeys.map(k => k.key),
      borewellSize: borewellKeys.reduce((sum, k) => sum + k.size, 0),
      allKeys: localStorageKeys,
    },
    indexedDB: {
      dbName: 'BorewellDocsDB',
      stores: ['photos', 'documents'],
    },
    projects: getAllProjects().length,
    wells: getAllProjects().flatMap(p => p.wells || []).length,
  };
}

// ==================== BACKUP FORMAT SCHEMA ====================

const BACKUP_SCHEMA = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  createdAt: 'ISO-8601',
  appVersion: 'string',
  projects: 'array',
  wells: 'array',
  documentation: {
    project: 'array',
    well: 'array',
  },
  storageManifest: {
    localStorage: 'array',
    indexedDB: 'array',
  },
};

export function validateBackupManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest) {
    errors.push('Manifest is null or undefined');
    return { valid: false, errors, warnings };
  }

  if (manifest.format !== BACKUP_FORMAT) {
    errors.push(`Invalid format: expected "${BACKUP_FORMAT}", got "${manifest.format}"`);
  }

  if (manifest.version !== BACKUP_VERSION) {
    warnings.push(`Version mismatch: backup is v${manifest.version}, current is v${BACKUP_VERSION}`);
  }

  if (!manifest.createdAt || isNaN(Date.parse(manifest.createdAt))) {
    errors.push('Invalid or missing createdAt timestamp');
  }

  if (!Array.isArray(manifest.projects)) {
    errors.push('Missing or invalid projects array');
  }

  if (!Array.isArray(manifest.wells)) {
    errors.push('Missing or invalid wells array');
  }

  if (!manifest.documentation || !Array.isArray(manifest.documentation.project) || !Array.isArray(manifest.documentation.well)) {
    errors.push('Invalid documentation structure');
  }

  if (!manifest.storageManifest || !Array.isArray(manifest.storageManifest.localStorage) || !Array.isArray(manifest.storageManifest.indexedDB)) {
    errors.push('Invalid storageManifest structure');
  }

  // Check for required fields in projects
  if (Array.isArray(manifest.projects)) {
    manifest.projects.forEach((p, i) => {
      if (!p.id) errors.push(`Project[${i}]: missing id`);
      if (!p.projectCode) errors.push(`Project[${i}]: missing projectCode`);
    });
  }

  // Check for required fields in wells
  if (Array.isArray(manifest.wells)) {
    manifest.wells.forEach((w, i) => {
      if (!w.id) errors.push(`Well[${i}]: missing id`);
      if (!w.wellCode) errors.push(`Well[${i}]: missing wellCode`);
      if (!w.projectId) errors.push(`Well[${i}]: missing projectId`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==================== BACKUP CREATION ====================

export async function collectIndexedDBAssets() {
  const assets = [];
  try {
    const db = await openDocsDB();
    if (!db) return assets;

    for (const storeName of ['photos', 'documents']) {
      const records = await getAllFromStore(db, storeName);
      for (const record of records) {
        if (record.dataUrl && record.dataUrl.startsWith('data:')) {
          assets.push({
            id: record.id,
            store: storeName,
            dataUrl: record.dataUrl,
            fileName: record.fileName,
            fileType: record.fileType,
            fileSize: record.fileSize,
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to collect IndexedDB assets:', e);
  }
  return assets;
}

export function openDocsDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open('BorewellDocsDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export function getAllFromStore(db, storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function createBackupManifest(appVersion = 'unknown') {
  const projects = getAllProjects();
  const allWells = [];
  const wellDocs = [];

  // Collect all wells with their full data
  for (const project of projects) {
    const wells = getWellsForProject(project.id);
    for (const well of wells) {
      const wellData = getWellData(well.id);
      if (wellData) {
        allWells.push({
          well: wellData.well,
          model: wellData.model,
          activity: wellData.activity,
        });
      }
    }
  }

  // Collect project documentation
  const projectDocs = [];
  const allProjectDocs = getProjectDocsData();
  for (const [projectId, docs] of Object.entries(allProjectDocs)) {
    projectDocs.push({ projectId, ...docs });
  }

  // Collect well documentation
  const allWellDocsKeys = getAllLocalStorageKeys().filter(k => k.startsWith('borewell-well-docs-'));
  for (const key of allWellDocsKeys) {
    const wellId = key.replace('borewell-well-docs-', '').replace(':v1', '');
    const docs = getWellDocsData(wellId);
    if (docs) {
      wellDocs.push({ wellId, ...docs });
    }
  }

  // Collect IndexedDB assets
  const indexedDBAssets = await collectIndexedDBAssets();

  // Storage manifest
  const audit = auditStorage();
  const localStorageManifest = audit.localStorage.borewellKeys;
  const indexedDBManifest = indexedDBAssets.map(a => ({
    id: a.id,
    store: a.store,
    fileName: a.fileName,
    fileSize: a.fileSize,
  }));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion,
    projects,
    wells: allWells,
    documentation: {
      project: projectDocs,
      well: wellDocs,
    },
    storageManifest: {
      localStorage: localStorageManifest,
      indexedDB: indexedDBManifest,
    },
  };
}

export async function createFullBackup(appVersion = 'unknown') {
  const manifest = await createBackupManifest(appVersion);
  const validation = validateBackupManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Backup manifest validation failed: ${validation.errors.join(', ')}`);
  }

  // Create ZIP archive
  const zip = await createZipArchive(manifest);
  return zip;
}

async function createZipArchive(manifest) {
  const JSZip = await import('jszip').then(m => m.default || m);
  const zip = new JSZip();

  // Add manifest
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Add assets folder with IndexedDB files
  const assetsFolder = zip.folder('assets');
  const indexedDBAssets = await collectIndexedDBAssets();
  for (const asset of indexedDBAssets) {
    if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
      const base64 = asset.dataUrl.split(',')[1];
      if (base64) {
        assetsFolder.file(`${asset.store}/${asset.id}_${asset.fileName}`, base64, { base64: true });
      }
    }
  }

  // Add localStorage data as separate JSON files for readability
  const lsFolder = zip.folder('localStorage');
  for (const key of manifest.storageManifest.localStorage) {
    const value = localStorage.getItem(key);
    if (value) {
      lsFolder.file(`${key}.json`, value);
    }
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return blob;
}

// ==================== BACKUP DOWNLOAD ====================

export function downloadBackup(blob, filename = null) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `borewell-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== BACKUP HISTORY ====================

export function saveBackupHistoryEntry(entry) {
  try {
    const history = getBackupHistory();
    history.unshift(entry);
    // Keep last 50 entries
    if (history.length > 50) history.length = 50;
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function getBackupHistory() {
  try {
    const data = localStorage.getItem(BACKUP_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function deleteBackupHistoryEntry(index) {
  try {
    const history = getBackupHistory();
    history.splice(index, 1);
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function clearBackupHistory() {
  try {
    localStorage.removeItem(BACKUP_HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}

// ==================== SAFETY BACKUP ====================

export function createSafetyBackup() {
  try {
    const manifest = createBackupManifestSync();
    const json = JSON.stringify(manifest);
    localStorage.setItem(SAFETY_BACKUP_KEY, json);
    return { success: true, size: json.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export function createBackupManifestSync() {
  const projects = getAllProjects();
  const allWells = [];

  for (const project of projects) {
    const wells = getWellsForProject(project.id);
    for (const well of wells) {
      const wellData = getWellData(well.id);
      if (wellData) {
        allWells.push({
          well: wellData.well,
          model: wellData.model,
          activity: wellData.activity,
        });
      }
    }
  }

  const projectDocs = [];
  const allProjectDocs = getProjectDocsData();
  for (const [projectId, docs] of Object.entries(allProjectDocs)) {
    projectDocs.push({ projectId, ...docs });
  }

  const wellDocs = [];
  const allWellDocsKeys = getAllLocalStorageKeys().filter(k => k.startsWith('borewell-well-docs-'));
  for (const key of allWellDocsKeys) {
    const wellId = key.replace('borewell-well-docs-', '').replace(':v1', '');
    const docs = getWellDocsData(wellId);
    if (docs) {
      wellDocs.push({ wellId, ...docs });
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: 'safety-backup',
    projects,
    wells: allWells,
    documentation: {
      project: projectDocs,
      well: wellDocs,
    },
    storageManifest: {
      localStorage: getAllLocalStorageKeys().filter(k => k.startsWith('borewell-')),
      indexedDB: [], // Not included in safety backup (localStorage only)
    },
  };
}

function restoreFromManifest(manifest, options = {}) {
  // Reuse the full replace logic but with safety backup flag
  return restoreFullReplace(manifest);
}

export async function restoreSafetyBackup() {
  try {
    const data = localStorage.getItem(SAFETY_BACKUP_KEY);
    if (!data) return { success: false, error: 'No safety backup found' };
    const manifest = JSON.parse(data);
    return await restoreFromManifest(manifest, { isSafetyBackup: true });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export function hasSafetyBackup() {
  return localStorage.getItem(SAFETY_BACKUP_KEY) !== null;
}

export function clearSafetyBackup() {
  localStorage.removeItem(SAFETY_BACKUP_KEY);
}

// ==================== RESTORE ENGINE ====================

export async function restoreFromBackup(file, mode = 'replace') {
  // mode: 'replace' | 'merge'
  try {
    const manifest = await readBackupFile(file);
    const validation = validateBackupManifest(manifest);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, stage: 'validation' };
    }

    // Create safety backup before restore
    const safety = createSafetyBackup();
    if (!safety.success) {
      return { success: false, error: 'Failed to create safety backup', stage: 'safety-backup' };
    }

    let result;
    if (mode === 'replace') {
      result = await restoreFullReplace(manifest);
    } else {
      result = await restoreMerge(manifest);
    }

    if (result.success) {
      clearSafetyBackup();
      return { success: true, ...result };
    } else {
      // Restore failed - rollback from safety backup
      const rollback = restoreSafetyBackup();
      return { success: false, error: result.error, stage: result.stage, rolledBack: rollback.success };
    }
  } catch (e) {
    // Try to rollback on any error
    const rollback = restoreSafetyBackup();
    return { success: false, error: e.message, stage: 'exception', rolledBack: rollback.success };
  }
}

async function readBackupFile(file) {
  if (file.name.endsWith('.zip')) {
    return await readZipBackup(file);
  } else {
    // Assume JSON
    const text = await file.text();
    return JSON.parse(text);
  }
}

async function readZipBackup(file) {
  const JSZip = await import('jszip').then(m => m.default || m);
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('manifest.json not found in backup');
  const manifestText = await manifestFile.async('text');
  return JSON.parse(manifestText);
}

async function restoreFullReplace(manifest) {
  try {
    // Clear all borewell data
    clearAllBorewellData();

    // Restore projects
    for (const project of manifest.projects) {
      localStorage.setItem(`borewell-project-${project.id}:v1`, JSON.stringify(project));
    }
    // Save projects list
    localStorage.setItem('borewell-projects:v1', JSON.stringify({
      projects: manifest.projects,
      activeProjectId: manifest.projects[0]?.id || null,
      activeWellId: null,
    }));

    // Restore wells
    for (const wellEntry of manifest.wells) {
      const key = `borewell-well-${wellEntry.well.id}:v1`;
      localStorage.setItem(key, JSON.stringify(wellEntry));
    }

    // Restore project documentation
    for (const docEntry of manifest.documentation.project) {
      const { projectId, ...docs } = docEntry;
      const allData = getProjectDocsData();
      allData[projectId] = docs;
      localStorage.setItem('borewell-project-docs:v1', JSON.stringify(allData));
    }

    // Restore well documentation
    for (const docEntry of manifest.documentation.well) {
      const { wellId, ...docs } = docEntry;
      localStorage.setItem(`borewell-well-docs-${wellId}:v1`, JSON.stringify(docs));
    }

    // Restore IndexedDB assets (non-blocking - safety backups don't include IndexedDB)
    try {
      await restoreIndexedDBAssets(manifest);
    } catch (e) {
      console.warn('IndexedDB restore failed (non-critical):', e.message);
    }

    return { success: true, mode: 'replace', restored: { projects: manifest.projects.length, wells: manifest.wells.length } };
  } catch (e) {
    return { success: false, error: e.message, stage: 'restore-replace' };
  }
}

async function restoreMerge(manifest) {
  const conflicts = [];
  const merged = { projects: 0, wells: 0, skipped: 0 };

  try {
    // Merge projects
    const existingProjects = getAllProjects();
    const existingProjectIds = new Set(existingProjects.map(p => p.id));
    const existingProjectCodes = new Map(existingProjects.map(p => [p.projectCode.toLowerCase(), p.id]));

    for (const project of manifest.projects) {
      let targetProject = existingProjectIds.has(project.id) ? project : null;

      // Check for code conflict
      if (!targetProject && existingProjectCodes.has(project.projectCode.toLowerCase())) {
        conflicts.push({
          type: 'project',
          field: 'projectCode',
          value: project.projectCode,
          existingId: existingProjectCodes.get(project.projectCode.toLowerCase()),
          backupId: project.id,
          message: `Project code "${project.projectCode}" already exists`,
        });
        merged.skipped++;
        continue;
      }

      if (!targetProject) {
        // New project - add it
        localStorage.setItem(`borewell-project-${project.id}:v1`, JSON.stringify(project));
        merged.projects++;
      } else {
        // Update existing
        localStorage.setItem(`borewell-project-${project.id}:v1`, JSON.stringify(project));
        merged.projects++;
      }
    }

    // Rebuild projects list
    const allProjects = getAllProjects();
    localStorage.setItem('borewell-projects:v1', JSON.stringify({
      projects: allProjects,
      activeProjectId: allProjects[0]?.id || null,
      activeWellId: null,
    }));

    // Merge wells
    const existingWells = allProjects.flatMap(p => p.wells || []);
    const existingWellIds = new Set(existingWells);
    const existingWellCodes = new Map();
    for (const wellId of existingWells) {
      const w = getWellData(wellId);
      if (w) existingWellCodes.set(`${w.well.projectId}:${w.well.wellCode.toLowerCase()}`, wellId);
    }

    for (const wellEntry of manifest.wells) {
      const well = wellEntry.well;
      const wellKey = `${well.projectId}:${well.wellCode.toLowerCase()}`;

      if (existingWellIds.has(well.id)) {
        // Same ID exists - update
        localStorage.setItem(`borewell-well-${well.id}:v1`, JSON.stringify(wellEntry));
        merged.wells++;
      } else if (existingWellCodes.has(wellKey)) {
        // Same project + code but different ID - conflict
        conflicts.push({
          type: 'well',
          field: 'wellCode',
          value: well.wellCode,
          projectId: well.projectId,
          existingId: existingWellCodes.get(wellKey),
          backupId: well.id,
          message: `Well code "${well.wellCode}" already exists in project`,
        });
        merged.skipped++;
      } else {
        // New well
        localStorage.setItem(`borewell-well-${well.id}:v1`, JSON.stringify(wellEntry));
        // Add to project's well list
        const projectData = getProjectById(well.projectId);
        if (projectData && !projectData.wells.includes(well.id)) {
          projectData.wells.push(well.id);
          localStorage.setItem(`borewell-project-${well.projectId}:v1`, JSON.stringify(projectData));
        }
        merged.wells++;
      }
    }

    // Merge project documentation
    for (const docEntry of manifest.documentation.project) {
      const { projectId, photos, documents } = docEntry;
      const existing = getProjectDocumentation(projectId);
      const mergedPhotos = mergeById(existing.photos, photos);
      const mergedDocs = mergeById(existing.documents, documents);
      saveProjectDocumentation(projectId, { photos: mergedPhotos, documents: mergedDocs });
    }

    // Merge well documentation
    for (const docEntry of manifest.documentation.well) {
      const { wellId, photos, documents } = docEntry;
      const existing = getWellDocumentation(wellId);
      const mergedPhotos = mergeById(existing.photos, photos);
      const mergedDocs = mergeById(existing.documents, documents);
      saveWellDocumentation(wellId, { photos: mergedPhotos, documents: mergedDocs });
    }

    // Restore IndexedDB assets (only new ones)
    await restoreIndexedDBAssets(manifest, true);

    return { success: true, mode: 'merge', restored: merged, conflicts };
  } catch (e) {
    return { success: false, error: e.message, stage: 'restore-merge' };
  }
}

function mergeById(existing, incoming) {
  const byId = new Map(existing.map(e => [e.id, e]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

async function restoreIndexedDBAssets(manifest, skipExisting = false) {
  const db = await openDocsDB();
  if (!db) return;

  const assets = await collectIndexedDBAssets();
  const existingIds = new Set();
  if (skipExisting) {
    for (const storeName of ['photos', 'documents']) {
      const records = await getAllFromStore(db, storeName);
      for (const r of records) existingIds.add(r.id);
    }
  }

  for (const asset of assets) {
    if (skipExisting && existingIds.has(asset.id)) continue;
    await storeFileInDB(db, asset.store === 'photos' ? 'photos' : 'documents', {
      id: asset.id,
      dataUrl: asset.dataUrl,
      fileName: asset.fileName,
      fileType: asset.fileType,
      fileSize: asset.fileSize,
      createdAt: asset.createdAt || new Date().toISOString(),
    });
  }
}

function storeFileInDB(db, storeName, record) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

function clearAllBorewellData() {
  const keysToRemove = [];
  const allKeys = getAllLocalStorageKeys();
  for (const key of allKeys) {
    if (key && (key.startsWith('borewell-') || key === 'wellData' || key === 'visualisasi-pipa-sumur-bor:v2')) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }

  // Clear IndexedDB
  if (typeof indexedDB !== 'undefined') {
    indexedDB.deleteDatabase('BorewellDocsDB');
  }
}

// ==================== EXPORT FUNCTIONS ====================

export function exportProjects() {
  const projects = getAllProjects();
  return JSON.stringify({ projects }, null, 2);
}

export function exportWell(wellId) {
  const wellData = getWellData(wellId);
  if (!wellData) return null;
  const wellDocs = getWellDocumentation(wellId);
  const project = getProjectById(wellData.well.projectId);
  return JSON.stringify({ well: wellData, documentation: wellDocs, project }, null, 2);
}

export function exportMonitoringCSV(wellId) {
  const wellData = getWellData(wellId);
  if (!wellData) return null;
  const monitoring = wellData.model?.groundwaterMonitoring || { measurements: [] };
  const measurements = monitoring.measurements || [];

  const headers = ['ID', 'Tanggal & Waktu', 'Kedalaman (m)', 'Titik Referensi', 'Elevasi Referensi (m)', 'Metode', 'Status', 'Catatan'];
  const rows = measurements.map(m => [
    m.id,
    m.measuredAt,
    m.waterLevelDepth,
    m.referencePoint,
    m.referenceElevation ?? '',
    m.method,
    m.status,
    m.notes ?? '',
  ]);

  return [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function exportGeologyCSV(wellId) {
  const wellData = getWellData(wellId);
  if (!wellData) return null;
  const geology = wellData.model?.geologicalLog || { layers: [] };
  const layers = geology.layers || [];

  const headers = ['ID', 'Nama Lapisan', 'Material', 'Mulai (m)', 'Akhir (m)', 'Tebal (m)', 'Formasi', 'Catatan'];
  const rows = layers.map(l => [
    l.id,
    l.name,
    l.material,
    l.startDepth,
    l.endDepth,
    l.endDepth - l.startDepth,
    l.formation ?? '',
    l.notes ?? '',
  ]);

  return [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function exportDocumentationMetadata() {
  const projectDocs = [];
  const allProjectDocs = getProjectDocsData();
  for (const [projectId, docs] of Object.entries(allProjectDocs)) {
    projectDocs.push({
      projectId,
      photoCount: docs.photos?.length || 0,
      documentCount: docs.documents?.length || 0,
      totalPhotoSize: (docs.photos || []).reduce((s, p) => s + (p.fileSize || 0), 0),
      totalDocSize: (docs.documents || []).reduce((s, d) => s + (d.fileSize || 0), 0),
    });
  }

  const wellDocs = [];
  const allWellDocsKeys = getAllLocalStorageKeys().filter(k => k.startsWith('borewell-well-docs-'));
  for (const key of allWellDocsKeys) {
    const wellId = key.replace('borewell-well-docs-', '').replace(':v1', '');
    const docs = getWellDocumentation(wellId);
    wellDocs.push({
      wellId,
      photoCount: docs.photos?.length || 0,
      documentCount: docs.documents?.length || 0,
      totalPhotoSize: (docs.photos || []).reduce((s, p) => s + (p.fileSize || 0), 0),
      totalDocSize: (docs.documents || []).reduce((s, d) => s + (d.fileSize || 0), 0),
    });
  }

  return JSON.stringify({ projectDocumentation: projectDocs, wellDocumentation: wellDocs }, null, 2);
}

// ==================== IMPORT FUNCTIONS ====================

export async function importProjects(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data.projects || !Array.isArray(data.projects)) {
    throw new Error('Invalid format: missing projects array');
  }
  const results = { created: 0, updated: 0, errors: [] };
  for (const project of data.projects) {
    try {
      const existing = getProjectById(project.id);
      if (existing) {
        // Update
        localStorage.setItem(`borewell-project-${project.id}:v1`, JSON.stringify(project));
        results.updated++;
      } else {
        // Create
        localStorage.setItem(`borewell-project-${project.id}:v1`, JSON.stringify(project));
        results.created++;
      }
    } catch (e) {
      results.errors.push({ project: project.id, error: e.message });
    }
  }
  // Rebuild projects list from all individual project keys
  const allKeys = getAllLocalStorageKeys().filter(k => k.startsWith('borewell-project-') && k.endsWith(':v1') && !k.startsWith('borewell-projects'));
  const allProjects = [];
  for (const key of allKeys) {
    const data = localStorage.getItem(key);
    if (data) {
      try {
        const project = JSON.parse(data);
        if (project.id) allProjects.push(project);
      } catch {}
    }
  }
  localStorage.setItem('borewell-projects:v1', JSON.stringify({
    projects: allProjects,
    activeProjectId: allProjects[0]?.id || null,
    activeWellId: null,
  }));
  return results;
}

export async function importWell(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data.well) throw new Error('Invalid format: missing well data');
  const { well, documentation } = data;
  const wellData = well.well;
  const model = well.model;
  const activity = well.activity;

  // Save well data
  localStorage.setItem(`borewell-well-${wellData.id}:v1`, JSON.stringify({ well: wellData, model, activity }));

  // Add to project
  const project = getProjectById(wellData.projectId);
  if (project && !project.wells.includes(wellData.id)) {
    project.wells.push(wellData.id);
    localStorage.setItem(`borewell-project-${wellData.projectId}:v1`, JSON.stringify(project));
  }

  // Save documentation
  if (documentation) {
    saveWellDocumentation(wellData.id, documentation);
  }

  return { success: true, wellId: wellData.id };
}

// Re-export documentation save functions
import { saveProjectDocumentation, saveWellDocumentation } from './documentationStorage.js';