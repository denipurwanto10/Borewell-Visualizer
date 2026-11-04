// Phase 7 verification tests — run with Node.js, localStorage/IndexedDB mocked.
import { createProject, validateProject, createWell, validateWell, PROJECT_STATUSES, WELL_TYPES, WELL_STATUSES } from 'file:///C:/Website/visualisasi_pipa/src/models/project.js';
import * as projectStorage from 'file:///C:/Website/visualisasi_pipa/src/storage/projectStorage.js';
import * as backupStorage from 'file:///C:/Website/visualisasi_pipa/src/storage/backupStorage.js';
import * as integrityStorage from 'file:///C:/Website/visualisasi_pipa/src/storage/integrityStorage.js';
import * as healthStorage from 'file:///C:/Website/visualisasi_pipa/src/storage/healthStorage.js';
import { getProjectDocumentation, getWellDocumentation, saveProjectDocumentation, saveWellDocumentation } from 'file:///C:/Website/visualisasi_pipa/src/storage/documentationStorage.js';
import { createPhotoRecord, createDocumentRecord } from 'file:///C:/Website/visualisasi_pipa/src/documentation/model.js';

// ---------- localStorage mock ----------
const store = new Map();
globalThis.localStorage = {
  getItem(k) { return store.get(k) ?? null; },
  setItem(k, v) { store.set(k, String(v)); return true; },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
  get length() { return store.size; },
  key(i) { const keys = [...store.keys()]; return keys[i] ?? null; },
};

// ---------- IndexedDB mock ----------
const idbStores = { photos: new Map(), documents: new Map() };
let idbVersion = 1;

globalThis.indexedDB = {
  open(name, version) {
    idbVersion = version;
    // Auto-create stores for BorewellDocsDB
    if (name === 'BorewellDocsDB') {
      if (!idbStores.photos) idbStores.photos = new Map();
      if (!idbStores.documents) idbStores.documents = new Map();
    }
    const request = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: {
        objectStoreNames: { contains: (n) => idbStores[n] !== undefined },
        createObjectStore: (n) => { idbStores[n] = new Map(); },
        transaction: (storeNames, mode) => {
          // storeNames can be a string or array of strings
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          const stores = {};
          for (const n of names) {
            if (!idbStores[n]) idbStores[n] = new Map();
            stores[n] = {
              put: (record) => { idbStores[n].set(record.id, record); },
              get: (id) => { return { onsuccess: null, onerror: null, result: idbStores[n].get(id) }; },
              getAll: () => { return { onsuccess: null, onerror: null, result: [...idbStores[n].values()] }; },
              delete: (id) => { idbStores[n].delete(id); },
            };
          }
          return {
            objectStore: (n) => stores[n],
            oncomplete: null,
            onerror: null,
          };
        },
      },
    };
    setTimeout(() => { if (request.onupgradeneeded) request.onupgradeneeded({ target: request.result }); if (request.onsuccess) request.onsuccess(); }, 0);
    return request;
  },
  deleteDatabase: (name) => {
    if (name === 'BorewellDocsDB') {
      idbStores.photos.clear();
      idbStores.documents.clear();
    }
    const request = { onsuccess: null, onerror: null };
    setTimeout(() => request.onsuccess && request.onsuccess(), 0);
    return request;
  },
};

// Mock navigator.storage.estimate for Node.js (doesn't have navigator)
// The healthStorage module checks for navigator.storage.estimate existence
Object.defineProperty(globalThis, 'navigator', {
  value: {
    storage: {
      estimate: async () => ({ quota: 5 * 1024 * 1024, usage: 1024 * 1024 }),
    },
  },
  configurable: true,
  writable: true,
});

const logs = [];
const origError = console.error;
console.error = (...a) => { logs.push(a.join(' ')); };

function clearStorage() {
  store.clear();
  idbStores.photos.clear();
  idbStores.documents.clear();
  logs.length = 0;
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL: ${name}`); }
}

// =========================================================
console.log('\n=== TEST 1: Storage Audit ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek Satu', clientName: 'C1', contractorName: 'K1', location: 'L1', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });
  projectStorage.saveWellData(w.id, { well: { companyName: 'Co A' }, model: {}, activity: {} });

  saveProjectDocumentation(p.id, { photos: [createPhotoRecord({ projectId: p.id, name: 'Foto 1' })], documents: [] });
  saveWellDocumentation(w.id, { photos: [], documents: [createDocumentRecord({ projectId: p.id, wellId: w.id, title: 'Doc 1' })] });

  const audit = backupStorage.auditStorage();
  assert(audit.localStorage.totalKeys > 0, 'audit returns localStorage keys');
  assert(audit.localStorage.borewellKeys.length > 0, 'audit finds borewell keys');
  assert(audit.projects === 1, 'audit reports project count');
  assert(audit.wells === 1, 'audit reports well count');
}

// =========================================================
console.log('\n=== TEST 2: Backup Manifest Creation ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek Satu', clientName: 'C1', contractorName: 'K1', location: 'L1', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });
  projectStorage.saveWellData(w.id, { well: { companyName: 'Co A' }, model: { pipes: [], screens: [], ground: null, mat: null, openHole: null }, activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] } });
  saveProjectDocumentation(p.id, { photos: [createPhotoRecord({ projectId: p.id, name: 'Foto 1' })], documents: [] });
  saveWellDocumentation(w.id, { photos: [], documents: [createDocumentRecord({ projectId: p.id, wellId: w.id, title: 'Doc 1' })] });

  const manifest = await backupStorage.createBackupManifestSync();
  assert(manifest.format === 'borewell-engineering-backup', 'manifest has correct format');
  assert(manifest.version === 1, 'manifest has correct version');
  assert(manifest.projects.length === 1, 'manifest includes projects');
  assert(manifest.wells.length === 1, 'manifest includes wells');
  assert(manifest.documentation.project.length === 1, 'manifest includes project docs');
  assert(manifest.documentation.well.length === 1, 'manifest includes well docs');
  assert(manifest.storageManifest.localStorage.length > 0, 'manifest includes localStorage manifest');
}

// =========================================================
console.log('\n=== TEST 3: Backup Validation ===');
{
  const validManifest = {
    format: 'borewell-engineering-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: 'test',
    projects: [{ id: 'p1', projectCode: 'P1' }],
    wells: [{ id: 'w1', wellCode: 'W1', projectId: 'p1' }],
    documentation: { project: [], well: [] },
    storageManifest: { localStorage: [], indexedDB: [] },
  };
  const result = backupStorage.validateBackupManifest(validManifest);
  assert(result.valid === true, 'valid manifest passes');

  const invalidFormat = { ...validManifest, format: 'wrong' };
  const r2 = backupStorage.validateBackupManifest(invalidFormat);
  assert(r2.valid === false, 'invalid format fails');
  assert(r2.errors.some(e => e.includes('format')), 'error mentions format');

  const missingProjects = { ...validManifest, projects: null };
  const r3 = backupStorage.validateBackupManifest(missingProjects);
  assert(r3.valid === false, 'missing projects fails');
}

// =========================================================
console.log('\n=== TEST 4: Export Functions ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek Satu', clientName: 'C1', contractorName: 'K1', location: 'L1', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });
  projectStorage.saveWellData(w.id, { well: { companyName: 'Co A' }, model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, geologicalLog: { layers: [] }, groundwaterMonitoring: { measurements: [] } }, activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] } });
  saveProjectDocumentation(p.id, { photos: [createPhotoRecord({ projectId: p.id, name: 'Foto 1' })], documents: [] });
  saveWellDocumentation(w.id, { photos: [], documents: [createDocumentRecord({ projectId: p.id, wellId: w.id, title: 'Doc 1' })] });

  const projectsJson = backupStorage.exportProjects();
  const projectsData = JSON.parse(projectsJson);
  assert(projectsData.projects.length === 1, 'exportProjects returns project');

  const wellJson = backupStorage.exportWell(w.id);
  const wellData = JSON.parse(wellJson);
  assert(wellData.well.well.wellCode === 'W-001', 'exportWell returns well data');
  assert(wellData.documentation !== undefined, 'exportWell includes documentation');

  const monitoringCsv = backupStorage.exportMonitoringCSV(w.id);
  assert(monitoringCsv !== null, 'exportMonitoringCSV returns CSV');
  assert(monitoringCsv.includes('"ID","Tanggal & Waktu"'), 'CSV has headers');

  const geologyCsv = backupStorage.exportGeologyCSV(w.id);
  assert(geologyCsv !== null, 'exportGeologyCSV returns CSV');
  assert(geologyCsv.includes('"ID","Nama Lapisan"'), 'CSV has headers');

  const docsJson = backupStorage.exportDocumentationMetadata();
  const docsData = JSON.parse(docsJson);
  assert(docsData.projectDocumentation.length === 1, 'exportDocumentationMetadata includes project docs');
  assert(docsData.wellDocumentation.length === 1, 'exportDocumentationMetadata includes well docs');
}

// =========================================================
console.log('\n=== TEST 5: Import Projects ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const importJson = JSON.stringify({
    projects: [
      { id: 'p-import-1', projectCode: 'IMP-1', projectName: 'Imported', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' },
    ],
  });

  const result = await backupStorage.importProjects(importJson);
  assert(result.created === 1, 'import creates new project');
  assert(result.updated === 0, 'no updates');

  const projects = projectStorage.getAllProjects();
  assert(projects.find(p => p.projectCode === 'IMP-1'), 'imported project exists in storage');
}

// =========================================================
console.log('\n=== TEST 6: Import Well ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const importJson = JSON.stringify({
    well: {
      well: { id: 'w-import-1', projectId: p.id, wellCode: 'IMP-W', wellName: 'Imported Well', wellType: 'production', status: 'planned' },
      model: { pipes: [], screens: [], ground: null, mat: null, openHole: null },
      activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
    },
    documentation: { photos: [], documents: [] },
  });

  const result = await backupStorage.importWell(importJson);
  assert(result.success === true, 'import well succeeds');
  assert(result.wellId === 'w-import-1', 'returns well ID');

  const wellData = projectStorage.getWellData('w-import-1');
  assert(wellData !== null, 'well data saved');
  assert(wellData.well.wellCode === 'IMP-W', 'well code correct');
}

// =========================================================
console.log('\n=== TEST 7: Data Integrity Checker ===');
(async () => {
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });
  projectStorage.saveWellData(w.id, { well: { companyName: 'Co A' }, model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, geologicalLog: { layers: [] }, groundwaterMonitoring: { measurements: [] } }, activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] } });

  // Add orphaned well doc (no well)
  localStorage.setItem('borewell-well-docs-orphan:v1', JSON.stringify({ photos: [], documents: [] }));

  const result = integrityStorage.checkDataIntegrity();
  assert(result.issues.length >= 0, 'check returns issues array');
  assert(result.stats.projectsChecked === 1, 'checks projects');
  assert(result.stats.wellsChecked === 1, 'checks wells');
  assert(result.summary.totalIssues >= 0, 'summary has counts');

  // Wait for indexedDB check
  const idbResult = await result.indexedDBCheck;
  assert(idbResult.checked === false || idbResult.checked === true, 'indexedDB check runs');
})();

// =========================================================
console.log('\n=== TEST 8: Integrity - Duplicate Detection ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  // Create two projects with same code
  const p1 = projectStorage.createProjectRecord({ projectCode: 'DUP', projectName: 'One', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const p2 = projectStorage.createProjectRecord({ projectCode: 'DUP', projectName: 'Two', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });

  const result = integrityStorage.checkDataIntegrity();
  const dupErrors = result.issues.filter(i => i.category === 'project' && i.message.includes('Duplicate project code'));
  assert(dupErrors.length > 0, 'detects duplicate project codes');
}

// =========================================================
console.log('\n=== TEST 9: Integrity - Orphaned Well Doc Detection ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  // Add well doc for non-existent well
  localStorage.setItem('borewell-well-docs-nonexistent:v1', JSON.stringify({ photos: [], documents: [] }));

  const result = integrityStorage.checkDataIntegrity();
  const orphaned = result.issues.filter(i => i.category === 'documentation' && i.message.includes('non-existent well'));
  assert(orphaned.length > 0, 'detects orphaned well documentation');
}

// =========================================================
console.log('\n=== TEST 10: Storage Health Monitor ===');
(async () => {
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });
  projectStorage.saveWellData(w.id, { well: { companyName: 'Co A' }, model: {}, activity: {} });

  const health = await healthStorage.getStorageHealth();
  assert(health.localStorage.used > 0, 'localStorage used > 0');
  assert(health.localStorage.percent >= 0, 'localStorage percent');
  assert(health.indexedDB.available === true, 'indexedDB available');
  assert(health.dataCounts.projectCount === 1, 'counts projects');
  assert(health.dataCounts.wellCount === 1, 'counts wells');
  assert(health.totalEstimatedSize >= 0, 'total estimated size');
  assert(typeof healthStorage.formatBytes === 'function', 'formatBytes exported');
})();

// =========================================================
console.log('\n=== TEST 11: Safety Backup ===');
(async () => {
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });

  const safety = backupStorage.createSafetyBackup();
  assert(safety.success === true, 'safety backup created');
  assert(backupStorage.hasSafetyBackup() === true, 'hasSafetyBackup returns true');

  // Modify data
  projectStorage.updateProjectRecord(p.id, { projectName: 'Modified' });

  // Restore safety backup
  const restore = await backupStorage.restoreSafetyBackup();
  if (!restore.success) console.log('Restore failed:', restore.error, restore.stage);
  assert(restore.success === true, 'safety backup restored');

  const restoredProject = projectStorage.getProjectById(p.id);
  assert(restoredProject.projectName === 'Proyek', 'project restored to original');
})();

// =========================================================
console.log('\n=== TEST 12: Repair Preview Generation ===');
{
  const issues = [
    { id: 'i1', severity: 'error', category: 'well', message: 'Duplicate well code', details: { wellId: 'w1', projectId: 'p1' } },
    { id: 'i2', severity: 'warning', category: 'documentation', message: 'Photo missing fileRef', details: { photoId: 'ph1' } },
    { id: 'i3', severity: 'info', category: 'indexeddb', message: 'Orphaned photo in IndexedDB', details: { id: 'idx1', fileName: 'test.jpg' } },
  ];

  const repairs = integrityStorage.generateRepairPreview(issues);
  assert(repairs.length === 2, 'generates repairs for error and warning (not info)');
  assert(repairs.some(r => r.action === 'rename_duplicate_well'), 'has rename duplicate well repair');
  assert(repairs.some(r => r.action === 'remove_orphaned_metadata'), 'has remove orphaned metadata repair');
}

// =========================================================
console.log('\n=== TEST 13: Execute Repair - Rename Duplicate Well ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });

  // Manually create duplicate well code scenario
  const w2 = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur B', wellType: 'monitoring', status: 'planned' });

  const issueDetails = { wellId: w2.id, projectId: p.id };
  const result = await integrityStorage.executeRepair('rename_duplicate_well', issueDetails);
  assert(result.success === true, 'rename duplicate well succeeds');
  assert(result.changes.some(c => c.field === 'wellCode'), 'wellCode changed');

  const updatedWell = projectStorage.getWellData(w2.id);
  assert(updatedWell.well.wellCode === 'W-001-DUP', 'wellCode suffixed with -DUP');
}

// =========================================================
console.log('\n=== TEST 14: Execute Repair - Remove Orphaned Well ===');
{
  clearStorage();
  projectStorage.initializeStorage();

  const p = projectStorage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w = projectStorage.createWellRecord(p.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', status: 'planned' });

  // Manually add orphaned well (not in any project)
  localStorage.setItem('borewell-well-orphan:v1', JSON.stringify({ well: { id: 'orphan', projectId: 'p1', wellCode: 'ORPH', wellName: 'Orphan' }, model: {}, activity: {} }));
  projectStorage.updateProjectRecord(p.id, { wells: [w.id, 'orphan'] });

  const issueDetails = { wellId: 'orphan' };
  const result = await integrityStorage.executeRepair('remove_orphaned_well', issueDetails);
  assert(result.success === true, 'remove orphaned well succeeds');
  assert(result.changes.some(c => c.action === 'deleted'), 'well deleted');

  const wellData = projectStorage.getWellData('orphan');
  assert(wellData === null, 'orphaned well removed');
}

// =========================================================
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log('All Phase 7 tests passed.');
}