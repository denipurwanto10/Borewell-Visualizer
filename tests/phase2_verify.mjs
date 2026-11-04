// Phase 2 verification tests — run with Node.js, localStorage mocked.
// Executes against the REAL src/storage/projectStorage.js implementation.

import { createWell, validateWell } from 'file:///C:/tmp/opencode/p2test/src/models/project.js';
import * as storage from 'file:///C:/tmp/opencode/p2test/src/storage/projectStorage.js';

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

const logs = [];
const origError = console.error;
console.error = (...a) => { logs.push(a.join(' ')); };

function clearStorage() { store.clear(); logs.length = 0; }

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL: ${name}`); }
}

function INITIALWELL() {
  return {
    companyName: '', shallowWellNumber: '', address: '', province: '', latitude: '', longitude: '',
    elevation: '', city: '', district: '', village: '', boreholeDate: '', wellNumber: '',
    piezoDistance: '', pumpType: '', pumpPosition: '', boreholeImages: {},
  };
}

function makeLegacyWell(overrides = {}) {
  return {
    companyName: 'PT. Geo Test',
    shallowWellNumber: 'SWB-001',
    address: 'Jl. Test No. 1',
    province: 'DKI Jakarta',
    city: 'Jakarta Pusat',
    district: 'Senen',
    village: 'Kramat',
    latitude: '-6.1802',
    longitude: '106.8272',
    elevation: '10',
    boreholeDate: '2024-01-15',
    wellNumber: 'SUM-001',
    piezoDistance: '12',
    pumpType: 'Submersible',
    pumpPosition: '45',
    boreholeImages: { borehole1: 'data:image/png;base64,abc', wellPhoto: 'data:image/png;base64,xyz' },
    ...overrides,
  };
}

function makeLegacyStorage() {
  clearStorage();
  localStorage.setItem('wellData', JSON.stringify(makeLegacyWell()));
}

// =========================================================
console.log('\n=== TEST 1: Data isolation between wells ===');
{
  clearStorage();
  storage.initializeStorage();

  const proj = storage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek Satu', clientName: 'C1', contractorName: 'K1', location: 'L1', status: 'planning' });
  assert(proj !== null, 'project created');

  const w1 = storage.createWellRecord(proj.id, { wellCode: 'W-001', wellName: 'Sumur A', wellType: 'production', location: 'Lokasi A', status: 'planned' });
  const w2 = storage.createWellRecord(proj.id, { wellCode: 'W-002', wellName: 'Sumur B', wellType: 'monitoring', location: 'Lokasi B', status: 'planned' });
  assert(w1 !== null && w2 !== null, 'two wells created');
  assert(w1.id !== w2.id, 'UUIDs differ');

  storage.saveWellData(w1.id, {
    well: { companyName: 'Perusahaan A', shallowWellNumber: 'SW-A', address: 'Alamat A', boreholeImages: { borehole1: 'data:image/png;base64,wellA' } },
    model: { pipes: [{ id: 'p1', start: 0, end: 10, depth: 10, diameter: 6 }], screens: [], ground: null, mat: null, openHole: null },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  storage.saveWellData(w2.id, {
    well: { companyName: 'Perusahaan B', shallowWellNumber: 'SW-B', address: 'Alamat B', boreholeImages: { wellPhoto: 'data:image/png;base64,wellB' } },
    model: { pipes: [], screens: [], ground: 5, mat: null, openHole: null },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });

  const d1 = storage.getWellData(w1.id);
  const d2 = storage.getWellData(w2.id);
  assert(d1.well.companyName === 'Perusahaan A', 'Well A retains its own company');
  assert(d1.well.shallowWellNumber === 'SW-A', 'Well A retains its own shallow number');
  assert(d1.well.boreholeImages.borehole1 === 'data:image/png;base64,wellA', 'Well A retains its own borehole photo');
  assert(d1.model.pipes.length === 1, 'Well A retains its own model pipes');
  assert(d2.well.companyName === 'Perusahaan B', 'Well B retains its own company');
  assert(d2.well.shallowWellNumber === 'SW-B', 'Well B retains its own shallow number');
  assert(d2.well.boreholeImages.wellPhoto === 'data:image/png;base64,wellB', 'Well B retains its own doc photo');
  assert(d2.model.ground === 5, 'Well B retains its own model ground');
  assert(d2.well.boreholeImages.borehole1 === undefined, 'Well A photo does not leak into Well B');
  assert(d1.well.boreholeImages.wellPhoto === undefined, 'Well B photo does not leak into Well A');

  storage.setActiveProjectId(proj.id);
  storage.setActiveWellId(w1.id);
  assert(storage.getActiveWellId() === w1.id, 'active well set to A');
  storage.setActiveWellId(w2.id);
  assert(storage.getActiveWellId() === w2.id, 'active well switched to B');
  const d1b = storage.getWellData(w1.id);
  assert(d1b.well.companyName === 'Perusahaan A', 'Well A data intact after switching away and back');
}

// =========================================================
console.log('\n=== TEST 2: Save state independence ===');
{
  clearStorage();
  storage.initializeStorage();
  const p2 = storage.createProjectRecord({ projectCode: 'P2', projectName: 'Proyek Dua', clientName: 'C2', contractorName: 'K2', location: 'L2', status: 'planning' });
  const wa = storage.createWellRecord(p2.id, { wellCode: 'WA', wellName: 'Well A', wellType: 'production', status: 'planned' });
  const wb = storage.createWellRecord(p2.id, { wellCode: 'WB', wellName: 'Well B', wellType: 'monitoring', status: 'planned' });

  storage.saveWellData(wa.id, { well: { companyName: 'Only A' } });
  const da = storage.getWellData(wa.id);
  const db = storage.getWellData(wb.id);
  assert(da.well.companyName === 'Only A', 'Well A has its own save state');
  assert(db.well.companyName !== 'Only A', 'Well B not polluted by A');
}

// =========================================================
console.log('\n=== TEST 3: Duplicate well code rejection ===');
{
  const existing = [createWell({ id: 'w1', projectId: 'p1', wellCode: 'WELL-001', wellName: 'Existing' })];
  const baseWell = { wellCode: 'WELL-001', wellName: 'Dup', wellType: 'production', status: 'planned', projectId: 'p1', plannedDepth: '', actualDepth: '' };
  const dup = validateWell(baseWell, existing);
  assert(dup !== null && dup.wellCode !== undefined, 'duplicate wellCode rejected');
  const ok = validateWell({ ...baseWell, wellCode: 'WELL-002', wellName: 'New' }, existing);
  assert(ok === null, 'unique wellCode accepted');

  const dup2 = validateWell({ ...baseWell, wellCode: 'well-001', wellName: 'Dup2' }, existing);
  assert(dup2 !== null && dup2.wellCode !== undefined, 'duplicate wellCode rejected (case-insensitive)');

  const diffProj = validateWell({ ...baseWell, wellCode: 'WELL-001', wellName: 'Other', projectId: 'p1' }, [createWell({ id: 'w2', projectId: 'p2', wellCode: 'WELL-001', wellName: 'Existing' })]);
  assert(diffProj === null, 'same wellCode allowed in different project');
}

// =========================================================
console.log('\n=== TEST 4: Delete active well does not leave invalid selection ===');
{
  clearStorage();
  storage.initializeStorage();
  const p4 = storage.createProjectRecord({ projectCode: 'P4', projectName: 'Proyek Empat', clientName: 'C4', contractorName: 'K4', location: 'L4', status: 'planning' });
  const w4a = storage.createWellRecord(p4.id, { wellCode: 'W4A', wellName: 'Well 4A', wellType: 'production', status: 'planned' });
  const w4b = storage.createWellRecord(p4.id, { wellCode: 'W4B', wellName: 'Well 4B', wellType: 'monitoring', status: 'planned' });
  storage.setActiveProjectId(p4.id);
  storage.setActiveWellId(w4a.id);
  assert(storage.getActiveWellId() === w4a.id, 'active well = 4A');
  storage.deleteWellRecord(w4a.id);
  const activeAfter = storage.getActiveWellId();
  assert(activeAfter === w4b.id || activeAfter === null, `active well reassigned (got ${activeAfter}, expected ${w4b.id} or null)`);
  assert(storage.getWellData(w4a.id) === null, 'deleted well storage removed');
  const wells4 = storage.getWellsForProject(p4.id);
  assert(wells4.length === 1, 'project has one well left');
}

// =========================================================
console.log('\n=== TEST 5: Archive / restore ===');
{
  clearStorage();
  storage.initializeStorage();
  const p5 = storage.createProjectRecord({ projectCode: 'P5', projectName: 'Proyek Lima', clientName: 'C5', contractorName: 'K5', location: 'L5', status: 'planning' });
  const archived = storage.archiveProjectRecord(p5.id);
  assert(archived !== null && archived.status === 'archived', 'project archived');
  assert(archived.archivedAt !== null, 'archivedAt set');
  const restored = storage.restoreProjectRecord(p5.id);
  assert(restored !== null && restored.status === 'planning', 'project restored');
  assert(restored.archivedAt === null, 'archivedAt cleared');
}

// =========================================================
console.log('\n=== TEST 6: Project well isolation ===');
{
  clearStorage();
  storage.initializeStorage();
  const pa = storage.createProjectRecord({ projectCode: 'PA', projectName: 'Project A', clientName: 'CA', contractorName: 'KA', location: 'LA', status: 'planning' });
  const pb = storage.createProjectRecord({ projectCode: 'PB', projectName: 'Project B', clientName: 'CB', contractorName: 'KB', location: 'LB', status: 'planning' });
  const wa6 = storage.createWellRecord(pa.id, { wellCode: 'WA', wellName: 'Well A', wellType: 'production', status: 'planned' });
  const wb6 = storage.createWellRecord(pb.id, { wellCode: 'WB', wellName: 'Well B', wellType: 'production', status: 'planned' });
  const wellsA = storage.getWellsForProject(pa.id);
  const wellsB = storage.getWellsForProject(pb.id);
  assert(wellsA.length === 1 && wellsA[0].id === wa6.id, 'Project A only sees its own well');
  assert(wellsB.length === 1 && wellsB[0].id === wb6.id, 'Project B only sees its own well');

  storage.setActiveProjectId(pa.id);
  const r2 = storage.setActiveWellId(wb6.id);
  assert(r2 === null, 'foreign project well rejected when project A active');
  assert(storage.getActiveWellId() === wa6.id, 'active well remains A');
}

// =========================================================
console.log('\n=== TEST 7: UUID stability ===');
{
  clearStorage();
  storage.initializeStorage();
  const p7 = storage.createProjectRecord({ projectCode: 'P7', projectName: 'Proyek Tujuh', clientName: 'C7', contractorName: 'K7', location: 'L7', status: 'planning' });
  const pid = p7.id;
  const p7b = storage.getProjectById(pid);
  assert(p7b.id === pid, 'project UUID stable');
  const w7 = storage.createWellRecord(pid, { wellCode: 'W7', wellName: 'Well 7', wellType: 'production', status: 'planned' });
  const wid = w7.id;
  const d7 = storage.getWellData(wid);
  assert(d7.well.id === wid, 'well UUID stable in storage');
  const updated = storage.updateWellRecord(wid, { wellName: 'Well 7 Renamed' });
  assert(updated.id === wid, 'well UUID stable after update');
}

// =========================================================
console.log('\n=== TEST 8: Delete project cleans up well storage ===');
{
  clearStorage();
  storage.initializeStorage();
  const p8 = storage.createProjectRecord({ projectCode: 'P8', projectName: 'Proyek Delapan', clientName: 'C8', contractorName: 'K8', location: 'L8', status: 'planning' });
  const w8 = storage.createWellRecord(p8.id, { wellCode: 'W8', wellName: 'Well 8', wellType: 'production', status: 'planned' });
  storage.saveWellData(w8.id, { well: { companyName: 'To Be Deleted' }, model: {}, activity: {} });
  assert(storage.getWellData(w8.id) !== null, 'well data exists before delete');
  storage.deleteProjectRecord(p8.id);
  assert(storage.getWellData(w8.id) === null, 'well storage removed when project deleted');
  assert(storage.getAllProjects().length === 0, 'project removed');
}

// =========================================================
console.log('\n=== TEST 9: Migration — legacy detection & preservation ===');
{
  clearStorage();
  makeLegacyStorage();
  assert(localStorage.getItem('wellData') !== null, 'legacy data present before migration');
  const r9 = storage.initializeStorage();
  assert(r9.success === true, 'migration reports success');
  assert(localStorage.getItem('borewell-migration:v1') === 'completed', 'migration marked done');
  assert(localStorage.getItem('wellData.backup') !== null, 'legacy backup created');

  const projects9 = storage.getAllProjects();
  assert(projects9.length === 1, 'one project created by migration');
  const p9 = projects9[0];
  assert(p9.projectCode === 'DEFAULT', 'default project code');
  assert(p9.status === 'completed', 'default project status completed');

  const wells9 = storage.getWellsForProject(p9.id);
  assert(wells9.length === 1, 'one well created from legacy');
  const w9 = wells9[0];
  assert(w9.wellCode === 'SUM-001', 'well code from legacy wellNumber');
  assert(w9.wellName === 'PT. Geo Test', 'well name from legacy companyName');
  assert(w9.location === 'Jl. Test No. 1', 'well location from legacy address');

  const wdata = storage.getWellData(w9.id);
  assert(wdata.well.companyName === 'PT. Geo Test', 'legacy companyName preserved');
  assert(wdata.well.shallowWellNumber === 'SWB-001', 'legacy shallowWellNumber preserved');
  assert(wdata.well.address === 'Jl. Test No. 1', 'legacy address preserved');
  assert(wdata.well.province === 'DKI Jakarta', 'legacy province preserved');
  assert(wdata.well.latitude === '-6.1802', 'legacy latitude preserved');
  assert(wdata.well.longitude === '106.8272', 'legacy longitude preserved');
  assert(wdata.well.boreholeDate === '2024-01-15', 'legacy boreholeDate preserved');
  assert(wdata.well.wellNumber === 'SUM-001', 'legacy wellNumber preserved');
  assert(wdata.well.piezoDistance === '12', 'legacy piezoDistance preserved');
  assert(wdata.well.pumpType === 'Submersible', 'legacy pumpType preserved');
  assert(wdata.well.pumpPosition === '45', 'legacy pumpPosition preserved');
  assert(wdata.well.boreholeImages.borehole1 === 'data:image/png;base64,abc', 'legacy boreholeImages preserved');
  assert(wdata.well.boreholeImages.wellPhoto === 'data:image/png;base64,xyz', 'legacy wellPhoto preserved');
}

// =========================================================
console.log('\n=== TEST 10: Migration idempotency ===');
{
  storage.initializeStorage();
  const count10 = storage.getAllProjects().length;
  assert(count10 === 1, `no duplicate project after re-migration (count=${count10})`);
}

// =========================================================
console.log('\n=== TEST 11: Migration — V2 key data ===');
{
  clearStorage();
  localStorage.setItem('visualisasi-pipa-sumur-bor:v2', JSON.stringify({
    well: { companyName: 'V2 Co', shallowWellNumber: 'V2-SW', address: 'V2 Alamat', boreholeImages: { borehole2: 'data:image/png;base64,v2img' } },
    model: { pipes: [{ start: 0, end: 20, depth: 20, diameter: 8 }], screens: [], ground: 2, mat: null, openHole: null },
    activity: { doc1: [{ id: 'd1', name: 'Foto', dataUrl: 'data:image/png;base64,d1', createdAt: '2024-02-01' }], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  }));
  const r11 = storage.initializeStorage();
  assert(r11.success === true, 'V2 migration success');
  const w11 = storage.getWellsForProject(storage.getAllProjects()[0].id)[0];
  const d11 = storage.getWellData(w11.id);
  assert(d11.well.companyName === 'V2 Co', 'V2 companyName preserved');
  assert(d11.well.boreholeImages.borehole2 === 'data:image/png;base64,v2img', 'V2 boreholeImages preserved');
  assert(d11.model.pipes.length === 1, 'V2 model pipes preserved');
  assert(d11.model.ground === 2, 'V2 model ground preserved');
  assert(d11.activity.doc1.length === 1, 'V2 activity preserved');
}

// =========================================================
console.log('\n=== TEST 12: Migration failure safety ===');
{
  clearStorage();
  const r12 = storage.initializeStorage();
  assert(r12.success === true, 'no-data migration completes');
  assert(localStorage.getItem('wellData') === null, 'no legacy data to disturb');
}

// =========================================================
console.log('\n=== TEST 13: Well duplication ===');
{
  clearStorage();
  storage.initializeStorage();
  const p13 = storage.createProjectRecord({ projectCode: 'P13', projectName: 'Proyek Tiga Belas', clientName: 'C13', contractorName: 'K13', location: 'L13', status: 'planning' });
  const w13 = storage.createWellRecord(p13.id, { wellCode: 'W13', wellName: 'Well 13', wellType: 'production', status: 'planned' });
  storage.saveWellData(w13.id, {
    well: { companyName: 'Dup Co', boreholeImages: { borehole1: 'data:image/png;base64,dup1' } },
    model: { pipes: [{ id: 'p', start: 0, end: 10, depth: 10, diameter: 6 }], screens: [], ground: null, mat: null, openHole: null },
    activity: { doc1: [{ id: 'd1', name: 'Foto', dataUrl: 'data:x', createdAt: 't' }], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  const w13dup = storage.duplicateWellRecord(w13.id);
  const w13data = storage.getWellData(w13.id);
  console.log(`  [DEBUG 13] w13.id=${w13.id} w13dup=${w13dup ? w13dup.id : 'null'} projectId=${w13data?.well?.projectId ?? 'MISSING'}`);
  assert(w13dup !== null, 'well duplicated (bug fixed: projectId now stored)');
  assert(w13dup.id !== w13.id, 'new UUID');
  const dDup = storage.getWellData(w13dup.id);
  assert(dDup.model.pipes.length === 1, 'duplicated well preserves model');
  assert(dDup.activity.doc1.length === 1, 'duplicated well preserves activity');
  assert(dDup.well.boreholeImages.borehole1 === 'data:image/png;base64,dup1', 'duplicated well preserves borehole photos (bug fixed)');
  assert(dDup.well.wellCode === 'W13-COPY', 'duplicate wellCode suffixed');
  assert(dDup.well.projectId === w13data.well.projectId, 'duplicate stays in same project');
}

// =========================================================
console.log('\n=== TEST 14: Dashboard stats ===');
{
  clearStorage();
  storage.initializeStorage();
  const ps = storage.getProjectStats();
  assert(ps.totalProjects === 0, 'empty stats');
  assert(ps.totalWells === 0, 'empty stats wells');
}

// =========================================================
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log('All storage tests passed.');
}
