// Phase 3 — Advanced Well Designer verification tests.
// Runs in Node with mocked localStorage, exercises real src modules.

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

// Import real modules
import * as storage from 'file:///C:/tmp/opencode/p2test/src/storage/projectStorage.js';
import {
  createComponent, emptyDesigner, normalizeDesigner, totalWellDepth,
  DESIGNER_VERSION, COMPONENT_DEFAULTS, INTERVAL_TYPES, MARKER_TYPES,
  componentCategory,
} from 'file:///C:/tmp/opencode/p2test/src/designer/model.js';
import {
  depthToPixel, pixelToDepth, computeDepthScale, rulerTickStep,
} from 'file:///C:/tmp/opencode/p2test/src/designer/geometry.js';
import {
  validateComponent, validateComponents, countsByLevel, groupByLevel,
} from 'file:///C:/tmp/opencode/p2test/src/designer/validation.js';
import { createHistory } from 'file:///C:/tmp/opencode/p2test/src/designer/history.js';

// =========================================================
console.log('\n=== GEOMETRY: depth/pixel conversion ===');
{
  const plotTop = 86; const plotBottom = 740;
  const minDepth = 0; const maxDepth = 100;

  assert(Math.abs(depthToPixel(0, { plotTop, plotBottom, minDepth, maxDepth }) - 86) < 0.01, 'depth 0 → plotTop');
  assert(Math.abs(depthToPixel(100, { plotTop, plotBottom, minDepth, maxDepth }) - 740) < 0.01, 'depth 100 → plotBottom');
  assert(Math.abs(depthToPixel(50, { plotTop, plotBottom, minDepth, maxDepth }) - 413) < 0.01, 'depth 50 → mid');

  const px = depthToPixel(37.5, { plotTop, plotBottom, minDepth, maxDepth });
  assert(Math.abs(pixelToDepth(px, { plotTop, plotBottom, minDepth, maxDepth }) - 37.5) < 0.01, 'round-trip depth→pixel→depth');

  const sx = computeDepthScale([], { totalWellDepth: 0 }, { plotTop: 0, plotBottom: 100, minDepth: 0 });
  assert(sx.maxDepth === 10, 'empty design defaults maxDepth to 10');
  assert(sx.range === 10, 'empty design range = 10');

  assert(rulerTickStep(600) === 50, 'tick step 50 for range > 500');
  assert(rulerTickStep(150) === 10, 'tick step 10 for range 100-200');
  assert(rulerTickStep(50) === 5, 'tick step 5 for range <= 100');
}

// =========================================================
console.log('\n=== MODEL: component creation & defaults ===');
{
  const c = createComponent('surface_casing', { startDepth: 0, endDepth: 30, outerDiameter: 200 });
  assert(c.id.startsWith('comp-'), 'component has generated id');
  assert(c.type === 'surface_casing', 'type set');
  assert(c.name === 'Casing Permukaan', 'default name');
  assert(c.startDepth === 0, 'start depth');
  assert(c.endDepth === 30, 'end depth');
  assert(c.length === 30, 'length = end - start');
  assert(c.outerDiameter === 200, 'outer diameter');
  assert(c.visible === true, 'default visible');
  assert(c.zOrder === 0, 'default zOrder');

  const marker = createComponent('well_cap', { startDepth: 2 });
  assert(marker.startDepth === 2, 'marker start depth');
  assert(marker.length === 0, 'marker length is 0');
  assert(MARKER_TYPES.has('well_cap'), 'well_cap is marker type');
  assert(INTERVAL_TYPES.has('surface_casing'), 'surface_casing is interval type');
  assert(componentCategory('screen_pipe') === 'filter', 'screen_pipe in filter category');
  assert(componentCategory('cement_grouting') === 'protection', 'cement_grouting in protection category');

  for (const [type] of Object.entries(COMPONENT_DEFAULTS)) {
    const inst = createComponent(type);
    assert(inst.type === type, `create ${type}`);
    assert(typeof inst.color === 'string', `${type} has color`);
  }
}

// =========================================================
console.log('\n=== MODEL: normalization & empty designer ===');
{
  const empty = emptyDesigner();
  assert(empty.version === DESIGNER_VERSION, 'version set');
  assert(Array.isArray(empty.components) && empty.components.length === 0, 'empty components');
  assert(empty.config.totalWellDepth === 0, 'total depth 0');

  const n1 = normalizeDesigner(undefined);
  assert(n1.components.length === 0, 'normalize undefined → empty');

  const n2 = normalizeDesigner({
    components: [
      { type: 'surface_casing', startDepth: 'not-a-number', endDepth: null },
      { type: 'screen_pipe', startDepth: 10, endDepth: 20, outerDiameter: 'bad' },
    ],
  });
  assert(n2.components.length === 2, 'both components kept after normalize');
  assert(Number.isFinite(n2.components[0].startDepth), 'bad startDepth coerced to 0');
  assert(Number.isFinite(n2.components[1].outerDiameter), 'bad outerDiameter coerced to default');

  assert(totalWellDepth([]) === 0, 'total depth empty = 0');
  assert(totalWellDepth([{ endDepth: 50 }, { endDepth: 30 }]) === 50, 'total depth = max end');
}

// =========================================================
console.log('\n=== VALIDATION: component rules ===');
{
  const r1 = validateComponent({ type: 'surface_casing', startDepth: -5, endDepth: 10, outerDiameter: 200, id: 'c1' }, [], {});
  assert(r1.some(i => i.code === 'negative-start-depth' && i.level === 'error'), 'negative start depth = error');

  const r2 = validateComponent({ type: 'surface_casing', startDepth: 30, endDepth: 10, outerDiameter: 200, id: 'c1' }, [], {});
  assert(r2.some(i => i.code === 'end-before-start' && i.level === 'error'), 'end before start = error');

  const r3 = validateComponent({ type: 'surface_casing', startDepth: 0, endDepth: 10, outerDiameter: 0, id: 'c1' }, [], {});
  assert(r3.some(i => i.code === 'invalid-outer-diameter' && i.level === 'error'), 'zero outer diameter = error');

  const r4 = validateComponent({ type: 'surface_casing', startDepth: 0, endDepth: 10, outerDiameter: 100, innerDiameter: 150, id: 'c1' }, [], {});
  assert(r4.some(i => i.code === 'inner-greater-than-outer' && i.level === 'error'), 'inner > outer = error');

  const r5 = validateComponent({ type: 'surface_casing', startDepth: 0, endDepth: 30, outerDiameter: 200, innerDiameter: 180, id: 'c1' }, [], {});
  assert(r5.length === 0, 'valid component → no issues');

  const r6 = validateComponent({ type: 'surface_casing', startDepth: 0, endDepth: 30, outerDiameter: 200, length: 99, id: 'c1' }, [], {});
  assert(r6.some(i => i.code === 'length-mismatch' && i.level === 'warning'), 'length mismatch = warning');
}

// =========================================================
console.log('\n=== VALIDATION: cross-component rules ===');
{
  const r1 = validateComponents([
    { id: 'a', type: 'surface_casing', startDepth: 0, endDepth: 30, outerDiameter: 200, innerDiameter: 180, visible: true },
    { id: 'b', type: 'surface_casing', startDepth: 10, endDepth: 40, outerDiameter: 200, innerDiameter: 180, visible: true },
  ], {});
  assert(r1.some(i => i.code === 'same-zone-overlap' && i.level === 'error'), 'same-zone overlap = error');

  const r2 = validateComponents([
    { id: 'a', type: 'surface_casing', startDepth: 0, endDepth: 30, outerDiameter: 200, innerDiameter: 180, visible: true },
    { id: 'b', type: 'cement_grouting', startDepth: 10, endDepth: 20, outerDiameter: 250, innerDiameter: 200, visible: true },
  ], {});
  assert(r2.some(i => i.code === 'depth-overlap' && i.level === 'warning'), 'different-type overlap = warning');

  const counts = countsByLevel(r2);
  assert(counts.warning === 1, 'one warning');
  assert(counts.error === 0, 'no errors');

  const r3 = validateComponents([
    { id: 'a', type: 'surface_casing', startDepth: 0, endDepth: 150, outerDiameter: 200, visible: true },
  ], { totalWellDepth: 100 });
  assert(r3.some(i => i.code === 'outside-well-depth'), 'outside well depth = warning');

  const r4 = validateComponents([], { totalWellDepth: 100 });
  assert(r4.some(i => i.code === 'empty-design'), 'empty design = info');
}

// =========================================================
console.log('\n=== HISTORY: undo/redo ===');
{
  const h = createHistory({ version: 1, components: [], config: {} });
  assert(h.canUndo === false, 'initially cannot undo');
  assert(h.canRedo === false, 'initially cannot redo');

  h.push({ version: 1, components: [{ id: 'c1' }], config: {} });
  assert(h.canUndo === true, 'can undo after push');
  const undone = h.undo();
  assert(undone.components.length === 0, 'undo returns previous state');
  assert(h.canRedo === true, 'can redo after undo');

  const redone = h.redo();
  assert(redone.components.length === 1, 'redo returns state');

  const h2 = createHistory({ version: 1, components: [], config: {} });
  for (let i = 0; i < 60; i++) h2.push({ version: 1, components: [{ id: `c${i}` }], config: {} });
  let count = 0;
  while (h2.canUndo) { h2.undo(); count++; }
  assert(count <= 50, `history capped at 50 (undid ${count})`);
}

// =========================================================
console.log('\n=== PERSISTENCE: per-well designer isolation ===');
{
  clearStorage();
  storage.initializeStorage();

  const proj = storage.createProjectRecord({ projectCode: 'P1', projectName: 'Proyek', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w1 = storage.createWellRecord(proj.id, { wellCode: 'W1', wellName: 'Sumur A', wellType: 'production', status: 'planned' });
  const w2 = storage.createWellRecord(proj.id, { wellCode: 'W2', wellName: 'Sumur B', wellType: 'monitoring', status: 'planned' });

  storage.saveWellData(w1.id, {
    well: { companyName: 'A' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [{ id: 'd1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  storage.saveWellData(w2.id, {
    well: { companyName: 'B' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [], config: { totalWellDepth: 0 } } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });

  const d1 = storage.getWellData(w1.id);
  const d2 = storage.getWellData(w2.id);
  assert(d1.model.designer.components.length === 1, 'Well 1 has 1 designer component');
  assert(d1.model.designer.components[0].type === 'surface_casing', 'Well 1 component type');
  assert(d2.model.designer.components.length === 0, 'Well 2 has no designer components');
  assert(d2.model.designer.config.totalWellDepth === 0, 'Well 2 total depth 0');

  storage.setActiveProjectId(proj.id);
  storage.setActiveWellId(w1.id);
  assert(storage.getActiveWellId() === w1.id, 'active well = w1');
  storage.setActiveWellId(w2.id);
  const d1b = storage.getWellData(w1.id);
  assert(d1b.model.designer.components.length === 1, 'Well 1 data intact after switch');
}

// =========================================================
console.log('\n=== PERSISTENCE: legacy visualization compatibility ===');
{
  clearStorage();
  storage.initializeStorage();

  const proj = storage.createProjectRecord({ projectCode: 'PL', projectName: 'Legacy', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const wl = storage.createWellRecord(proj.id, { wellCode: 'WL', wellName: 'Legacy Well', wellType: 'production', status: 'planned' });
  storage.saveWellData(wl.id, {
    well: { companyName: 'Legacy' },
    model: { pipes: [{ id: 'p1', start: 0, end: 20, depth: 20, diameter: 6 }], screens: [], ground: null, mat: null, openHole: null },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });

  const data = storage.getWellData(wl.id);
  assert(data.model.pipes.length === 1, 'legacy pipes preserved');
  assert(data.model.designer === undefined, 'legacy model has no designer (expected)');
  const norm = normalizeDesigner(data.model.designer);
  assert(norm.components.length === 0, 'missing designer normalizes to empty');
}

// =========================================================
console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log('All Phase 3 tests passed.');
}
