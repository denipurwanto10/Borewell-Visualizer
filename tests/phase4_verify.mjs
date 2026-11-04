// Phase 4 — Geological Log verification tests.
// Runs in Node with mocked localStorage, exercises real src modules.

import * as storage from 'file:///C:/Website/visualisasi_pipa/src/storage/projectStorage.js';
import {
  GEOLOGY_VERSION, createLayer, emptyGeology, normalizeGeology, normalizeLayer,
  getMaterial, getMaterialsByCategory,
} from 'file:///C:/Website/visualisasi_pipa/src/geology/model.js';
import {
  validateLayers, validateLayer, countsByLevel, groupByLevel, geologySummary,
} from 'file:///C:/Website/visualisasi_pipa/src/geology/validation.js';
import {
  depthToPixel, pixelToDepth, computeDepthScale, rulerTickStep, layerPixelHeight,
} from 'file:///C:/Website/visualisasi_pipa/src/geology/geometry.js';

// Minimal DOM mocks needed by pdf.js (jspdf + canvas usage).
globalThis.window = { devicePixelRatio: 1 };

// ---- localStorage mock ----
const store = new Map();
globalThis.localStorage = {
  getItem(k) { return store.get(k) ?? null; },
  setItem(k, v) { store.set(k, String(v)); return true; },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
  get length() { return store.size; },
  key(i) { const keys = [...store.keys()]; return keys[i] ?? null; },
};

function clearStorage() { store.clear(); }

let passed = 0;
let failed = 0;
const failures = [];
function assert(condition, name) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL: ${name}`); }
}

// =========================================================
console.log('\n=== MODEL: create geological log & layer ===');
{
  const g = emptyGeology();
  assert(g.version === GEOLOGY_VERSION, 'empty log has version');
  assert(Array.isArray(g.layers) && g.layers.length === 0, 'empty log has no layers');

  const layer = createLayer({ name: 'Clay', material: 'clay', startDepth: 0, endDepth: 5, description: 'Brown soft clay' });
  assert(layer.id.startsWith('geo-'), 'layer has generated id');
  assert(layer.name === 'Clay', 'layer name set');
  assert(layer.material === 'clay', 'layer material set');
  assert(layer.startDepth === 0, 'layer start depth');
  assert(layer.endDepth === 5, 'layer end depth');
  assert(layer.description === 'Brown soft clay', 'layer description');
  assert(typeof layer.color === 'string', 'layer has color');
  assert(typeof layer.pattern === 'string', 'layer has pattern');

  const mat = getMaterial('clay');
  assert(mat.label === 'Clay', 'material label');
  assert(mat.category === 'soil', 'material category');

  const byCat = getMaterialsByCategory();
  assert(Array.isArray(byCat.soil) && byCat.soil.length > 0, 'soil category has materials');
  assert(Array.isArray(byCat.rock) && byCat.rock.length > 0, 'rock category has materials');
  assert(Array.isArray(byCat.other) && byCat.other.length > 0, 'other category has materials');
}

// =========================================================
console.log('\n=== MODEL: normalization & invalid data ===');
{
  const n1 = normalizeGeology(undefined);
  assert(n1.components === undefined && Array.isArray(n1.layers) && n1.layers.length === 0, 'normalize undefined → empty');
  assert(n1.version === GEOLOGY_VERSION, 'normalize version default');

  const n2 = normalizeGeology({ version: 1, layers: [
    { startDepth: 'not-a-number', endDepth: null },
    { material: 'clay', startDepth: 0, endDepth: 5 },
  ]});
  assert(n2.layers.length === 1, 'invalid layer dropped, valid kept');
  assert(n2.layers[0].startDepth === 0, 'valid layer normalized');
  assert(n2.layers[0].id, 'normalized layer has id');

  const dupId = 'geo-duplicate';
  const n3 = normalizeGeology({ version: 1, layers: [
    { id: dupId, material: 'clay', startDepth: 0, endDepth: 3 },
    { id: dupId, material: 'sand', startDepth: 3, endDepth: 6 },
  ]});
  assert(n3.layers.length === 2, 'both layers kept');
  assert(n3.layers[0].id !== n3.layers[1].id, 'duplicate ids made unique');

  // version handling
  const n4 = normalizeGeology({ version: 99, layers: [] });
  assert(n4.version === 99, 'version preserved');

  // unknown material falls back
  const nl = normalizeLayer({ material: 'not-a-real-material', startDepth: 0, endDepth: 2 });
  assert(nl.material === 'unknownMaterial', 'unknown material fallback');
  assert(nl.color === getMaterial('unknownMaterial').color, 'fallback color');
}

// =========================================================
console.log('\n=== MODEL: UUID uniqueness ===');
{
  const a = createLayer({ material: 'clay', startDepth: 0, endDepth: 2 });
  const b = createLayer({ material: 'sand', startDepth: 2, endDepth: 4 });
  assert(a.id !== b.id, 'UUIDs differ');
}

// =========================================================
console.log('\n=== MODEL: derived values ===');
{
  const layers = [
    createLayer({ material: 'clay', startDepth: 0, endDepth: 5 }),
    createLayer({ material: 'sand', startDepth: 5, endDepth: 12 }),
  ];
  assert(totalDepthTest(layers) === 12, 'total depth = max end');
}
function totalDepthTest(layers) {
  let max = 0;
  for (const l of layers) { const d = l.endDepth || l.startDepth || 0; if (d > max) max = d; }
  return max;
}

// =========================================================
console.log('\n=== VALIDATION: negative depth ===');
{
  const r = validateLayer({ id: 'l1', name: 'X', material: 'clay', startDepth: -2, endDepth: 3 }, [], 0);
  assert(r.some(i => i.code === 'negative-start-depth' && i.level === 'error'), 'negative start = error');
  const r2 = validateLayer({ id: 'l1', name: 'X', material: 'clay', startDepth: 0, endDepth: -3 }, [], 0);
  assert(r2.some(i => i.code === 'negative-end-depth' && i.level === 'error'), 'negative end = error');
}

// =========================================================
console.log('\n=== VALIDATION: invalid interval ===');
{
  const r = validateLayer({ id: 'l1', name: 'X', material: 'clay', startDepth: 10, endDepth: 5 }, [], 0);
  assert(r.some(i => i.code === 'end-before-start' && i.level === 'error'), 'end before start = error');
  const r2 = validateLayer({ id: 'l1', name: 'X', material: 'clay', startDepth: 5, endDepth: 5 }, [], 0);
  assert(r2.some(i => i.code === 'zero-thickness' && i.level === 'warning'), 'zero thickness = warning');
  const r3 = validateLayer({ id: 'l1', name: 'X', material: 'clay', startDepth: 0, endDepth: 0.05 }, [], 0);
  assert(r3.some(i => i.code === 'very-thin-layer' && i.level === 'warning'), 'very thin layer = warning');
}

// =========================================================
console.log('\n=== VALIDATION: overlapping layers ===');
{
  const r = validateLayers([
    { id: 'a', name: 'A', material: 'clay', startDepth: 0, endDepth: 10 },
    { id: 'b', name: 'B', material: 'sand', startDepth: 5, endDepth: 15 },
  ], 0);
  assert(r.some(i => i.code === 'overlap' && i.level === 'warning'), 'overlap = warning');
  assert(r.some(i => i.message.includes('tumpang tindih')), 'overlap message');
}

// =========================================================
console.log('\n=== VALIDATION: gaps ===');
{
  const r = validateLayers([
    { id: 'a', name: 'A', material: 'clay', startDepth: 0, endDepth: 5 },
    { id: 'b', name: 'B', material: 'sand', startDepth: 8, endDepth: 12 },
  ], 0);
  assert(r.some(i => i.code === 'gap' && i.level === 'warning'), 'gap = warning (not error)');
  assert(!r.some(i => i.level === 'error'), 'gap is not an error');
}

// =========================================================
console.log('\n=== VALIDATION: out-of-well-depth ===');
{
  const r = validateLayers([
    { id: 'a', name: 'A', material: 'clay', startDepth: 0, endDepth: 120 },
  ], 100);
  assert(r.some(i => i.code === 'outside-well-depth' && i.level === 'warning'), 'outside well depth = warning');
}

// =========================================================
console.log('\n=== VALIDATION: duplicate id & empty ===');
{
  const r = validateLayers([
    { id: 'x', name: 'A', material: 'clay', startDepth: 0, endDepth: 5 },
    { id: 'x', name: 'B', material: 'sand', startDepth: 5, endDepth: 10 },
  ], 0);
  assert(r.some(i => i.code === 'duplicate-layer-id' && i.level === 'error'), 'duplicate id = error');

  const r2 = validateLayers([], 0);
  assert(r2.some(i => i.code === 'empty-log' && i.level === 'info'), 'empty log = info');
}

// =========================================================
console.log('\n=== VALIDATION: counts & grouping ===');
{
  const issues = [
    { level: 'error', code: 'e1' }, { level: 'error', code: 'e2' },
    { level: 'warning', code: 'w1' },
    { level: 'info', code: 'i1' },
  ];
  const c = countsByLevel(issues);
  assert(c.error === 2, '2 errors');
  assert(c.warning === 1, '1 warning');
  assert(c.info === 1, '1 info');
  const g = groupByLevel(issues);
  assert(g.error.length === 2 && g.warning.length === 1 && g.info.length === 1, 'grouping works');
}

// =========================================================
console.log('\n=== GEOMETRY: depth/pixel conversion ===');
{
  const plotTop = 40; const plotBottom = 600; const minDepth = 0; const maxDepth = 100;
  assert(Math.abs(depthToPixel(0, { plotTop, plotBottom, minDepth, maxDepth }) - 40) < 0.01, 'depth 0 → plotTop');
  assert(Math.abs(depthToPixel(100, { plotTop, plotBottom, minDepth, maxDepth }) - 600) < 0.01, 'depth 100 → plotBottom');
  assert(Math.abs(depthToPixel(50, { plotTop, plotBottom, minDepth, maxDepth }) - 320) < 0.01, 'depth 50 → mid');
  const px = depthToPixel(37.5, { plotTop, plotBottom, minDepth, maxDepth });
  assert(Math.abs(pixelToDepth(px, { plotTop, plotBottom, minDepth, maxDepth }) - 37.5) < 0.01, 'round-trip');
  assert(rulerTickStep(600) === 50, 'tick step 50');
  assert(rulerTickStep(150) === 10, 'tick step 10');
  assert(rulerTickStep(50) === 5, 'tick step 5');
}

// =========================================================
console.log('\n=== GEOMETRY: proportional layer height ===');
{
  const geom = { plotTop: 40, plotBottom: 600, minDepth: 0, maxDepth: 100 };
  computeDepthScale([{ startDepth: 0, endDepth: 100 }], 0, geom);
  // 10 m out of 100 m range over 560 px → 56 px
  const h = layerPixelHeight(0, 10, geom);
  assert(Math.abs(h - 56) < 0.01, '10 m layer = 56 px proportional');
  // 1 m layer → 5.6 px (above min)
  const h1 = layerPixelHeight(0, 1, geom);
  assert(Math.abs(h1 - 5.6) < 0.01, '1 m layer = 5.6 px');
  // very thin 0.01 m → clamped to min, data unchanged
  const h2 = layerPixelHeight(0, 0.01, geom);
  assert(h2 === 1.5, 'very thin layer clamped to min px');
}

// =========================================================
console.log('\n=== GEOMETRY: computeDepthScale uses well depth ===');
{
  const layers = [{ startDepth: 0, endDepth: 20 }];
  const s1 = computeDepthScale(layers, 0, { plotTop: 0, plotBottom: 100, minDepth: 0 });
  assert(s1.maxDepth === 20, 'maxDepth = deepest layer when wellDepth 0');
  const s2 = computeDepthScale(layers, 100, { plotTop: 0, plotBottom: 100, minDepth: 0 });
  assert(s2.maxDepth === 100, 'maxDepth respects well depth 100');
}

// =========================================================
console.log('\n=== STORAGE: save & reload per well ===');
{
  clearStorage();
  storage.initializeStorage();
  const proj = storage.createProjectRecord({ projectCode: 'PG', projectName: 'Proyek G', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w1 = storage.createWellRecord(proj.id, { wellCode: 'WG1', wellName: 'Sumur Geo 1', wellType: 'production', status: 'planned' });
  const w2 = storage.createWellRecord(proj.id, { wellCode: 'WG2', wellName: 'Sumur Geo 2', wellType: 'monitoring', status: 'planned' });

  storage.saveWellData(w1.id, {
    well: { companyName: 'Geo Co' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, geologicalLog: { version: 1, layers: [{ id: 'l1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 10 }] } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  storage.saveWellData(w2.id, {
    well: { companyName: 'Geo Co 2' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, geologicalLog: { version: 1, layers: [] } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });

  const d1 = storage.getWellData(w1.id);
  assert(d1.model.geologicalLog.layers.length === 1, 'Well 1 has 1 geology layer');
  assert(d1.model.geologicalLog.layers[0].name === 'Clay', 'Well 1 layer name');
  const d2 = storage.getWellData(w2.id);
  assert(d2.model.geologicalLog.layers.length === 0, 'Well 2 empty geology');

  // isolation: switch active well
  storage.setActiveProjectId(proj.id);
  storage.setActiveWellId(w1.id);
  assert(storage.getActiveWellId() === w1.id, 'active well = w1');
  storage.setActiveWellId(w2.id);
  const d1b = storage.getWellData(w1.id);
  assert(d1b.model.geologicalLog.layers.length === 1, 'Well 1 geology intact after switch');
}

// =========================================================
console.log('\n=== STORAGE: existing Designer data intact ===');
{
  clearStorage();
  storage.initializeStorage();
  const proj = storage.createProjectRecord({ projectCode: 'PD', projectName: 'Proyek D', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const wd = storage.createWellRecord(proj.id, { wellCode: 'WD', wellName: 'Sumur Desain', wellType: 'production', status: 'planned' });
  storage.saveWellData(wd.id, {
    well: { companyName: 'D Co' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  // add geology without touching designer
  const designerModel = {
    pipes: [],
    screens: [],
    ground: null,
    mat: null,
    openHole: null,
    designer: {
      version: 1,
      components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }],
      config: { totalWellDepth: 30 },
    },
    geologicalLog: { version: 1, layers: [{ id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 10 }] },
  };
  storage.saveWellData(wd.id, {
    well: { companyName: 'D Co' },
    model: designerModel,
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  const d = storage.getWellData(wd.id);
  assert(d.model.designer.components.length === 1, 'designer component intact');
  assert(d.model.designer.components[0].type === 'surface_casing', 'designer type intact');
  assert(d.model.geologicalLog.layers.length === 1, 'geology layer added');
}

// =========================================================
console.log('\n=== STORAGE: existing photos & documentation intact ===');
{
  clearStorage();
  storage.initializeStorage();
  const proj = storage.createProjectRecord({ projectCode: 'PP', projectName: 'Proyek P', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const wp = storage.createWellRecord(proj.id, { wellCode: 'WP', wellName: 'Sumur Foto', wellType: 'production', status: 'planned' });
  storage.saveWellData(wp.id, {
    well: { companyName: 'P Co', boreholeImages: { wellPhoto: 'data:image/png;base64,photo1' } },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, geologicalLog: { version: 1, layers: [] } },
    activity: { doc1: [{ id: 'd1', name: 'Foto', dataUrl: 'data:image/png;base64,doc1', createdAt: 't' }], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
    // add geology
  storage.saveWellData(wp.id, {
    well: { companyName: 'P Co', boreholeImages: { wellPhoto: 'data:image/png;base64,photo1' } },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, geologicalLog: { version: 1, layers: [{ id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 5 }] } },
    activity: { doc1: [{ id: 'd1', name: 'Foto', dataUrl: 'data:image/png;base64,doc1', createdAt: 't' }], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  const d = storage.getWellData(wp.id);
  assert(d.well.boreholeImages.wellPhoto === 'data:image/png;base64,photo1', 'photo intact');
  assert(d.activity.doc1.length === 1, 'documentation intact');
  assert(d.model.geologicalLog.layers.length === 1, 'geology added');
}

// =========================================================
console.log('\n=== PDF: geological log integration ===');
{
  const fs = await import('fs');
  const path = await import('path');
  const pdfMod = await import('file:///C:/Website/visualisasi_pipa/src/pdf.js');

  const project = {
    id: 'proj-geo', projectCode: 'PRJ-GEO', projectName: 'Proyek Geologi',
    clientName: 'Klien', contractorName: 'Kontraktor', location: 'Lokasi', status: 'completed',
  };
  const well = {
    id: 'well-geo', projectId: 'proj-geo', wellCode: 'WELL-GEO', wellName: 'Sumur Geologi',
    wellType: 'production', location: 'Lokasi', status: 'completed',
    companyName: 'PT. Geo', shallowWellNumber: 'SWB-001', address: 'Jl. Test',
    province: 'DKI Jakarta', city: 'Jakarta', district: 'Senen', village: 'Kramat',
    latitude: '-6.1802', longitude: '106.8272', elevation: '10', boreholeDate: '2024-01-15',
    wellNumber: 'SUM-001', piezoDistance: '12', pumpType: 'Submersible', pumpPosition: '45',
    boreholeImages: {},
  };
  const model = { pipes: [], screens: [], ground: null, mat: null, openHole: null };
  const activity = { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] };

  const cleanup = (name) => {
    try { fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf'); } catch { }
  };

  // PDF with multiple geology layers
  let thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model, well, activity, canvas: null, project,
      designer: null,
      geology: {
        version: 1,
        layers: [
          { id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 5, description: 'Lempuk coklat', color: '#b45309', pattern: 'clay' },
          { id: 'g2', name: 'Pasir', material: 'fineSand', startDepth: 5, endDepth: 12, description: 'Pasir halus', color: '#f59e0b', pattern: 'fine-sand' },
          { id: 'g3', name: 'Batu Pasir', material: 'sandstone', startDepth: 12, endDepth: 20, description: 'Batu pasir', color: '#c2410c', pattern: 'sandstone' },
        ],
      },
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `PDF with multiple geology layers did not throw (${thrown ? thrown.message : ''})`);
  const f1 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f1, 'PDF file produced with geology layers');
  if (f1) { const st = fs.statSync('laporan_konstruksi_sumur_bor.pdf'); assert(st.size > 1000, 'PDF non-trivial size'); fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf'); }

  // PDF with empty geology (should not add empty geology page, no crash)
  thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model: { pipes: [{ id: 'p1', start: 0, end: 10, depth: 10, diameter: 6 }], screens: [], ground: null, mat: null, openHole: null },
      well, activity, canvas: null, project, designer: null,
      geology: { version: 1, layers: [] },
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `PDF with empty geology did not throw (${thrown ? thrown.message : ''})`);
  const f2 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f2, 'PDF file produced with empty geology');
  if (f2) fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf');

  // PDF with designer + geology together
  thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } } },
      well, activity, canvas: null, project,
      designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } },
      geology: { version: 1, layers: [{ id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 10, color: '#b45309', pattern: 'clay' }] },
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `PDF with designer + geology together did not throw (${thrown ? thrown.message : ''})`);
  const f3 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f3, 'PDF file produced with designer + geology');
  if (f3) fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf');

  // Legacy PDF compatibility (no geology field at all)
  thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model: { pipes: [{ id: 'p1', start: 0, end: 10, depth: 10, diameter: 6 }], screens: [], ground: 2, mat: 5, openHole: null },
      well, activity, canvas: null, project, designer: null,
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `Legacy PDF without geology field did not throw (${thrown ? thrown.message : ''})`);
  const f4 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f4, 'Legacy PDF file produced');
  if (f4) fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf');
}

// =========================================================
console.log('\n=== SUMMARY ===');
console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log('All Phase 4 tests passed.');
}
