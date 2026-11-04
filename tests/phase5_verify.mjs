// Phase 5 — Groundwater Monitoring verification tests.
// Runs in Node with mocked localStorage, exercises real src modules.

import * as storage from 'file:///C:/Website/visualisasi_pipa/src/storage/projectStorage.js';
import {
  MONITORING_VERSION, createMeasurement, emptyMonitoring, normalizeMonitoring, normalizeMeasurement,
  getMethod, getReferencePoint, sortByTime, getLatestMeasurement, getPreviousMeasurement,
  calculateChange, depthToElevation,
  MEASUREMENT_METHODS, REFERENCE_POINTS,
} from 'file:///C:/Website/visualisasi_pipa/src/monitoring/model.js';
import {
  validateMeasurements, validateMeasurement, groupByLevel, countsByLevel, monitoringSummary,
} from 'file:///C:/Website/visualisasi_pipa/src/monitoring/validation.js';
import {
  computeHydrographScale, depthToPixel, pixelToDepth, timeToPixel, pixelToTime, depthRulerTickStep, timeAxisTickStep,
} from 'file:///C:/Website/visualisasi_pipa/src/monitoring/geometry.js';
import {
  exportToCsv, parseCsv, previewImport,
} from 'file:///C:/Website/visualisasi_pipa/src/monitoring/export.js';
import {
  computeStatistics, formatStatValue, formatChange, formatDateTime,
} from 'file:///C:/Website/visualisasi_pipa/src/monitoring/statistics.js';

// Minimal DOM mocks needed by pdf.js (jspdf + canvas usage).
globalThis.window = { devicePixelRatio: 1 };
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'a') return { href: '', download: '', click: () => {}, setAttribute: () => {} };
    if (tag === 'canvas') return { getContext: () => ({}), width: 0, height: 0, style: {} };
    return {};
  },
  body: { appendChild: () => {}, removeChild: () => {} },
};
globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
globalThis.Blob = function(content, opts) { this.content = content; this.type = opts?.type; };

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
console.log('\n=== MODEL: create monitoring record ===');
{
  const m = emptyMonitoring();
  assert(m.version === MONITORING_VERSION, 'empty monitoring has version');
  assert(Array.isArray(m.measurements) && m.measurements.length === 0, 'empty monitoring has no measurements');
}

{
  const meas = createMeasurement({
    measuredAt: '2026-11-03T08:00:00.000Z',
    waterLevelDepth: 12.5,
    referencePoint: 'top_of_casing',
    referenceElevation: 50.0,
    method: 'electric_water_level_meter',
    status: 'valid',
    notes: 'Test measurement',
  });
  assert(meas.id.startsWith('mon-'), 'measurement has generated id');
  assert(meas.waterLevelDepth === 12.5, 'depth set');
  assert(meas.referencePoint === 'top_of_casing', 'reference point set');
  assert(meas.referenceElevation === 50.0, 'reference elevation set');
  assert(meas.method === 'electric_water_level_meter', 'method set');
  assert(meas.status === 'valid', 'status set');
  assert(meas.notes === 'Test measurement', 'notes set');
  assert(typeof meas.createdAt === 'string', 'createdAt set');
  assert(typeof meas.updatedAt === 'string', 'updatedAt set');
}

{
  const m = getMethod('electric_water_level_meter');
  assert(m.label === 'Electric Water Level Meter', 'method label');
  assert(m.category === 'manual', 'method category');
  const r = getReferencePoint('top_of_casing');
  assert(r.label === 'Top of Casing', 'reference point label');
  assert(r.abbreviation === 'TOC', 'reference point abbreviation');
}

// =========================================================
console.log('\n=== MODEL: normalization & invalid data ===');
{
  const n1 = normalizeMonitoring(undefined);
  assert(n1.version === MONITORING_VERSION, 'normalize undefined → empty');
  assert(n1.measurements.length === 0, 'normalize empty array');
}

{
  const n2 = normalizeMonitoring({ version: 1, measurements: [
    { waterLevelDepth: 'not-a-number', measuredAt: 'invalid' },
    { waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
  ]});
  assert(n2.measurements.length === 1, 'invalid measurement dropped, valid kept');
  assert(n2.measurements[0].waterLevelDepth === 10, 'valid measurement normalized');
  assert(n2.measurements[0].id, 'normalized measurement has id');
}

{
  const dupId = 'mon-duplicate';
  const n3 = normalizeMonitoring({ version: 1, measurements: [
    { id: dupId, waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
    { id: dupId, waterLevelDepth: 10, measuredAt: '2026-11-03T09:00:00.000Z', referencePoint: 'ground_level', method: 'manual_water_level_meter' },
  ]});
  assert(n3.measurements.length === 2, 'both measurements kept');
  assert(n3.measurements[0].id !== n3.measurements[1].id, 'duplicate ids made unique');
}

{
  // unknown reference point falls back
  const nm = normalizeMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'not-a-real-ref', method: 'electric_water_level_meter' });
  assert(nm.referencePoint === 'top_of_casing', 'unknown reference point fallback');
  // unknown method falls back
  const nm2 = normalizeMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'not-a-real-method' });
  assert(nm2.method === 'electric_water_level_meter', 'unknown method fallback');
  // invalid reference elevation becomes null
  const nm3 = normalizeMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter', referenceElevation: 'not-a-number' });
  assert(nm3.referenceElevation === null, 'invalid reference elevation becomes null');
}

// =========================================================
console.log('\n=== MODEL: UUID uniqueness ===');
{
  const a = createMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z' });
  const b = createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T09:00:00.000Z' });
  assert(a.id !== b.id, 'UUIDs differ');
}

// =========================================================
console.log('\n=== MODEL: sorting & time helpers ===');
{
  const measurements = [
    createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T10:00:00.000Z', id: 'a' }),
    createMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', id: 'b' }),
    createMeasurement({ waterLevelDepth: 8, measuredAt: '2026-11-03T09:00:00.000Z', id: 'c' }),
  ];
  const sorted = sortByTime(measurements);
  assert(sorted[0].id === 'b', 'earliest first');
  assert(sorted[1].id === 'c', 'middle second');
  assert(sorted[2].id === 'a', 'latest last');
}

{
  const measurements = [
    createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T10:00:00.000Z', id: 'a' }),
    createMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', id: 'b' }),
  ];
  const latest = getLatestMeasurement(measurements);
  assert(latest.id === 'a', 'latest is most recent');
  const prev = getPreviousMeasurement(measurements, latest);
  assert(prev.id === 'b', 'previous is earlier');
  const change = calculateChange(latest, prev);
  assert(change.depth === 5, 'change depth = 5');
  assert(change.direction === 'deeper', 'deeper = water level dropped');
  assert(!change.referenceMismatch, 'same reference point');
}

// =========================================================
console.log('\n=== MODEL: reference point mismatch ===');
{
  const current = createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T10:00:00.000Z', id: 'a', referencePoint: 'top_of_casing' });
  const previous = createMeasurement({ waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', id: 'b', referencePoint: 'ground_level' });
  const change = calculateChange(current, previous);
  assert(change.depth === null, 'depth change null on mismatch');
  assert(change.direction === 'incomparable', 'direction incomparable');
  assert(change.referenceMismatch === true, 'reference mismatch flag');
}

// =========================================================
console.log('\n=== MODEL: depthToElevation ===');
{
  const m = createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T10:00:00.000Z', referencePoint: 'top_of_casing', referenceElevation: 50 });
  const elev = depthToElevation(m, null);
  assert(elev === 40, 'elevation = refElev - depth');
  const m2 = createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T10:00:00.000Z', referencePoint: 'ground_level', referenceElevation: null });
  const elev2 = depthToElevation(m2, 45);
  assert(elev2 === 35, 'elevation uses ground elevation when refElev null and refPoint is ground_level');
  const m3 = createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T10:00:00.000Z', referencePoint: 'top_of_casing', referenceElevation: null });
  const elev3 = depthToElevation(m3, 45);
  assert(elev3 === null, 'no elevation when no refElev and not ground_level');
}

// =========================================================
console.log('\n=== VALIDATION: negative depth ===');
{
  const r = validateMeasurement({ id: 'm1', waterLevelDepth: -2, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' }, [], 0);
  assert(r.some(i => i.code === 'negative-depth' && i.level === 'error'), 'negative depth = error');
}

// =========================================================
console.log('\n=== VALIDATION: invalid numeric depth ===');
{
  const r = validateMeasurement({ id: 'm1', waterLevelDepth: NaN, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' }, [], 0);
  assert(r.some(i => i.code === 'invalid-depth' && i.level === 'error'), 'NaN depth = error');
}

// =========================================================
console.log('\n=== VALIDATION: invalid timestamp ===');
{
  const r = validateMeasurement({ id: 'm1', waterLevelDepth: 5, measuredAt: 'not-a-date', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' }, [], 0);
  assert(r.some(i => i.code === 'invalid-timestamp' && i.level === 'error'), 'invalid timestamp = error');
}

// =========================================================
console.log('\n=== VALIDATION: missing method ===');
{
  const r = validateMeasurement({ id: 'm1', waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'invalid_method' }, [], 0);
  assert(r.some(i => i.code === 'missing-method' && i.level === 'error'), 'invalid method = error');
}

// =========================================================
console.log('\n=== VALIDATION: invalid reference elevation ===');
{
  const r = validateMeasurement({ id: 'm1', waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter', referenceElevation: 'not-a-number' }, [], 0);
  assert(r.some(i => i.code === 'invalid-reference-elevation' && i.level === 'error'), 'invalid ref elevation = error');
}

// =========================================================
console.log('\n=== VALIDATION: depth exceeds well depth (warning) ===');
{
  const r = validateMeasurement({ id: 'm1', waterLevelDepth: 120, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' }, [], 100);
  assert(r.some(i => i.code === 'depth-exceeds-well' && i.level === 'warning'), 'exceeds well depth = warning');
}

// =========================================================
console.log('\n=== VALIDATION: duplicate id ===');
{
  const measurements = [
    { id: 'x', waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
    { id: 'x', waterLevelDepth: 10, measuredAt: '2026-11-03T09:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
  ];
  const r = validateMeasurement(measurements[0], measurements, 0);
  assert(r.some(i => i.code === 'duplicate-id' && i.level === 'error'), 'duplicate id = error');
}

// =========================================================
console.log('\n=== VALIDATION: duplicate timestamp (info) ===');
{
  const measurements = [
    { id: 'a', waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
    { id: 'b', waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
  ];
  const r = validateMeasurement(measurements[0], measurements, 0);
  assert(r.some(i => i.code === 'duplicate-timestamp' && i.level === 'info'), 'duplicate timestamp = info');
}

// =========================================================
console.log('\n=== VALIDATION: mixed reference points (warning) ===');
{
  const measurements = [
    { id: 'a', waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter' },
    { id: 'b', waterLevelDepth: 10, measuredAt: '2026-11-03T09:00:00.000Z', referencePoint: 'ground_level', method: 'electric_water_level_meter' },
  ];
  const r = validateMeasurements(measurements, 0);
  assert(r.some(i => i.code === 'mixed-reference-points' && i.level === 'warning'), 'mixed ref points = warning');
}

// =========================================================
console.log('\n=== VALIDATION: empty monitoring (info) ===');
{
  const r = validateMeasurements([], 0);
  assert(r.some(i => i.code === 'empty-monitoring' && i.level === 'info'), 'empty = info');
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
console.log('\n=== VALIDATION: monitoring summary ===');
{
  const measurements = [
    createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', id: 'a' }),
    createMeasurement({ waterLevelDepth: 12, measuredAt: '2026-11-03T09:00:00.000Z', id: 'b' }),
    createMeasurement({ waterLevelDepth: 8, measuredAt: '2026-11-03T10:00:00.000Z', id: 'c' }),
  ];
  const s = monitoringSummary(measurements, 0);
  assert(s.measurementCount === 3, 'count = 3');
  assert(s.latestDepth === 8, 'latest depth = 8');
  assert(s.minDepth === 8, 'min = 8');
  assert(s.maxDepth === 12, 'max = 12');
  assert(Math.abs(s.avgDepth - 10) < 0.001, 'avg = 10');
  assert(s.latestChange === -4, 'change = -4 (shallower)');
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
  assert(depthRulerTickStep(600) === 50, 'tick step 50');
  assert(depthRulerTickStep(150) === 10, 'tick step 10');
  assert(depthRulerTickStep(51) === 5, 'tick step 5 for range > 50');
}

// =========================================================
console.log('\n=== GEOMETRY: time/pixel conversion ===');
{
  const plotLeft = 60; const plotRight = 540; const minTime = 1000000; const maxTime = 2000000;
  assert(Math.abs(timeToPixel(new Date(1000000), { plotLeft, plotRight, minTime, maxTime }) - 60) < 0.01, 'min time → plotLeft');
  assert(Math.abs(timeToPixel(new Date(2000000), { plotLeft, plotRight, minTime, maxTime }) - 540) < 0.01, 'max time → plotRight');
  const midTime = 1500000;
  const px = timeToPixel(new Date(midTime), { plotLeft, plotRight, minTime, maxTime });
  assert(Math.abs(px - 300) < 0.01, 'mid time → mid');
  const back = pixelToTime(px, { plotLeft, plotRight, minTime, maxTime });
  assert(Math.abs(back.getTime() - midTime) < 0.01, 'time round-trip');
}

// =========================================================
console.log('\n=== GEOMETRY: time axis tick step ===');
{
  const day = 86400000;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  assert(timeAxisTickStep(6 * year).step === year, 'year step for >5 years');
  assert(timeAxisTickStep(2 * year).step === month, 'month step for >1 year');
  assert(timeAxisTickStep(4 * month).step === month, 'month step for >3 months');
  assert(timeAxisTickStep(month + 1).step === week, 'week step for >1 month');
  assert(timeAxisTickStep(week + 1).step === day, 'day step for >1 week');
  assert(timeAxisTickStep(day + 1).step === day, 'day step for >1 day');
  assert(timeAxisTickStep(day / 2).step === 6 * 3600000, '6 hour step for <1 day');
}

// =========================================================
console.log('\n=== GEOMETRY: computeHydrographScale ===');
{
  const measurements = [
    { waterLevelDepth: 5, measuredAt: '2026-11-03T08:00:00.000Z' },
    { waterLevelDepth: 15, measuredAt: '2026-11-03T10:00:00.000Z' },
  ];
  const s = computeHydrographScale(measurements, 20, { plotTop: 40, plotBottom: 600, plotLeft: 60, plotRight: 540, minDepth: 0 });
  assert(s.maxDepth >= 20, 'maxDepth respects well depth');
  assert(s.minTime < s.maxTime, 'time range valid');
  assert(s.depthScale > 0, 'positive depth scale');
  assert(s.timeScale > 0, 'positive time scale');
}

// =========================================================
console.log('\n=== CSV EXPORT: basic export ===');
{
  const measurements = [
    createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', id: 'm1', referencePoint: 'top_of_casing', method: 'electric_water_level_meter', notes: 'Test' }),
  ];
  const csv = exportToCsv(measurements);
  assert(csv.includes('Measurement Date & Time'), 'header present');
  assert(csv.includes('m1'), 'id in csv');
  assert(csv.includes('10'), 'depth in csv');
  assert(csv.includes('top_of_casing'), 'ref point in csv');
}

// =========================================================
console.log('\n=== CSV IMPORT: valid import ===');
{
  const csv = `ID,Measurement Date & Time (ISO 8601),Water Level Depth (m),Reference Point (top_of_casing / ground_level / custom),Reference Elevation (m; optional),Method (electric / manual / pressure_transducer / logger / other),Status (valid / invalid),Notes,Created At (ISO 8601),Updated At (ISO 8601)
m1,2026-11-03T08:00:00.000Z,10,top_of_casing,50,electric,valid,Test,2026-11-03T08:00:00.000Z,2026-11-03T08:00:00.000Z`;
  const { measurements, errors } = parseCsv(csv);
  assert(measurements.length === 1, 'one measurement imported');
  assert(measurements[0].waterLevelDepth === 10, 'depth parsed');
  assert(errors.length === 0, 'no errors');
}

// =========================================================
console.log('\n=== CSV IMPORT: invalid values handled ===');
{
  const csv = `ID,Measurement Date & Time (ISO 8601),Water Level Depth (m),Reference Point (top_of_casing / ground_level / custom),Reference Elevation (m; optional),Method (electric / manual / pressure_transducer / logger / other),Status (valid / invalid),Notes,Created At (ISO 8601),Updated At (ISO 8601)
m1,invalid-date,not-a-number,invalid-ref,not-a-number,invalid-method,invalid-status,Test,invalid,invalid`;
  const { measurements, errors } = parseCsv(csv);
  assert(measurements.length === 1, 'one measurement imported despite errors');
  assert(measurements[0].waterLevelDepth === 0, 'invalid depth defaults to 0');
  assert(measurements[0].referencePoint === 'top_of_casing', 'invalid ref point defaults');
  assert(measurements[0].method === 'electric_water_level_meter', 'invalid method defaults to full name');
  assert(errors.length > 0, 'errors reported');
}

// =========================================================
console.log('\n=== CSV IMPORT: duplicate ID handling ===');
{
  const csv = `ID,Measurement Date & Time (ISO 8601),Water Level Depth (m),Reference Point (top_of_casing / ground_level / custom),Reference Elevation (m; optional),Method (electric / manual / pressure_transducer / logger / other),Status (valid / invalid),Notes,Created At (ISO 8601),Updated At (ISO 8601)
m1,2026-11-03T08:00:00.000Z,10,top_of_casing,,electric,valid,,2026-11-03T08:00:00.000Z,2026-11-03T08:00:00.000Z
m1,2026-11-03T09:00:00.000Z,12,top_of_casing,,electric,valid,,2026-11-03T09:00:00.000Z,2026-11-03T09:00:00.000Z`;
  const { measurements, errors } = parseCsv(csv);
  assert(measurements.length === 2, 'both rows imported (ID collision handled by generator)');
  assert(measurements[0].id !== measurements[1].id, 'duplicate IDs made unique');
  assert(errors.some(e => e.includes('duplikat')), 'duplicate ID error reported');
}

// =========================================================
console.log('\n=== CSV PREVIEW ===');
{
  const csv = `ID,Measurement Date & Time (ISO 8601),Water Level Depth (m),Reference Point (top_of_casing / ground_level / custom),Reference Elevation (m; optional),Method (electric / manual / pressure_transducer / logger / other),Status (valid / invalid),Notes,Created At (ISO 8601),Updated At (ISO 8601)
m1,2026-11-03T08:00:00.000Z,10,top_of_casing,,electric,valid,Test,2026-11-03T08:00:00.000Z,2026-11-03T08:00:00.000Z`;
  const preview = previewImport(csv);
  assert(preview.validCount === 1, 'preview valid count');
  assert(preview.sample.length === 1, 'preview sample');
  assert(preview.sample[0].waterLevelDepth === 10, 'sample depth');
}

// =========================================================
console.log('\n=== STATISTICS: computeStatistics ===');
{
  const measurements = [
    createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', id: 'a', referencePoint: 'ground_level' }),
    createMeasurement({ waterLevelDepth: 12, measuredAt: '2026-11-03T09:00:00.000Z', id: 'b', referencePoint: 'ground_level' }),
    createMeasurement({ waterLevelDepth: 8, measuredAt: '2026-11-03T10:00:00.000Z', id: 'c', referencePoint: 'ground_level' }),
  ];
  const stats = computeStatistics(measurements, 50, 45);
  assert(stats.totalMeasurements === 3, 'total = 3');
  assert(stats.validMeasurements === 3, 'valid = 3');
  assert(stats.latestDepth === 8, 'latest = 8');
  assert(stats.minDepth === 8, 'min = 8');
  assert(stats.maxDepth === 12, 'max = 12');
  assert(Math.abs(stats.avgDepth - 10) < 0.001, 'avg = 10');
  assert(stats.latestChange === -4, 'change = -4');
  assert(stats.changeDirection === 'shallower', 'direction shallower');
  assert(stats.referenceMismatch === false, 'no ref mismatch');
  assert(stats.elevation === 37, 'elevation = groundElev - depth');
}

// =========================================================
console.log('\n=== STATISTICS: reference mismatch ===');
{
  const measurements = [
    createMeasurement({ waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', id: 'a', referencePoint: 'top_of_casing' }),
    createMeasurement({ waterLevelDepth: 12, measuredAt: '2026-11-03T09:00:00.000Z', id: 'b', referencePoint: 'ground_level' }),
  ];
  const stats = computeStatistics(measurements, 50, 45);
  assert(stats.latestChange === null, 'change null on mismatch');
  assert(stats.referenceMismatch === true, 'ref mismatch flag');
}

// =========================================================
console.log('\n=== STATISTICS: empty ===');
{
  const stats = computeStatistics([], 0, null);
  assert(stats.totalMeasurements === 0, 'total = 0');
  assert(stats.latestDepth === null, 'latest null');
  assert(stats.elevation === null, 'elevation null');
}

// =========================================================
console.log('\n=== STATISTICS: format helpers ===');
{
  assert(formatStatValue(12.5) === '12.50 m', 'format depth');
  assert(formatStatValue(null) === '—', 'format null');
  assert(formatChange(-4, 'shallower') === '-4.00 m (naik)', 'format change negative');
  assert(formatChange(4, 'deeper') === '+4.00 m (turun)', 'format change positive');
  assert(formatChange(null) === '—', 'format null change');
  assert(formatDateTime('2026-11-03T08:00:00.000Z').includes('03'), 'format date');
  const invalidResult = formatDateTime('invalid');
  assert(invalidResult === 'invalid' || invalidResult === 'Invalid Date', 'invalid date handled');
}

// =========================================================
console.log('\n=== STORAGE: save & reload per well ===');
{
  clearStorage();
  storage.initializeStorage();
  const proj = storage.createProjectRecord({ projectCode: 'PG', projectName: 'Proyek G', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const w1 = storage.createWellRecord(proj.id, { wellCode: 'WG1', wellName: 'Sumur Mon 1', wellType: 'production', status: 'planned' });
  const w2 = storage.createWellRecord(proj.id, { wellCode: 'WG2', wellName: 'Sumur Mon 2', wellType: 'monitoring', status: 'planned' });

  storage.saveWellData(w1.id, {
    well: { companyName: 'Mon Co' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, groundwaterMonitoring: { version: 1, measurements: [{ id: 'm1', waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter', status: 'valid', notes: '' }] } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  storage.saveWellData(w2.id, {
    well: { companyName: 'Mon Co 2' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, groundwaterMonitoring: { version: 1, measurements: [] } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });

  const d1 = storage.getWellData(w1.id);
  assert(d1.model.groundwaterMonitoring.measurements.length === 1, 'Well 1 has 1 monitoring measurement');
  assert(d1.model.groundwaterMonitoring.measurements[0].waterLevelDepth === 10, 'Well 1 measurement depth');
  const d2 = storage.getWellData(w2.id);
  assert(d2.model.groundwaterMonitoring.measurements.length === 0, 'Well 2 empty monitoring');

  // isolation: switch active well
  storage.setActiveProjectId(proj.id);
  storage.setActiveWellId(w1.id);
  assert(storage.getActiveWellId() === w1.id, 'active well = w1');
  storage.setActiveWellId(w2.id);
  const d1b = storage.getWellData(w1.id);
  assert(d1b.model.groundwaterMonitoring.measurements.length === 1, 'Well 1 monitoring intact after switch');
}

// =========================================================
console.log('\n=== STORAGE: existing Designer & Geology intact ===');
{
  clearStorage();
  storage.initializeStorage();
  const proj = storage.createProjectRecord({ projectCode: 'PD', projectName: 'Proyek D', clientName: 'C', contractorName: 'K', location: 'L', status: 'planning' });
  const wd = storage.createWellRecord(proj.id, { wellCode: 'WD', wellName: 'Sumur Data', wellType: 'production', status: 'planned' });
  storage.saveWellData(wd.id, {
    well: { companyName: 'D Co' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } }, geologicalLog: { version: 1, layers: [{ id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 10 }] } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  // add monitoring without touching designer/geology
  storage.saveWellData(wd.id, {
    well: { companyName: 'D Co' },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } }, geologicalLog: { version: 1, layers: [{ id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 10 }] }, groundwaterMonitoring: { version: 1, measurements: [{ id: 'm1', waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter', status: 'valid', notes: '' }] } },
    activity: { doc1: [], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  const d = storage.getWellData(wd.id);
  assert(d.model.designer.components.length === 1, 'designer component intact');
  assert(d.model.designer.components[0].type === 'surface_casing', 'designer type intact');
  assert(d.model.geologicalLog.layers.length === 1, 'geology layer intact');
  assert(d.model.groundwaterMonitoring.measurements.length === 1, 'monitoring added');
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
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, groundwaterMonitoring: { version: 1, measurements: [] } },
    activity: { doc1: [{ id: 'd1', name: 'Foto', dataUrl: 'data:image/png;base64,doc1', createdAt: 't' }], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  // add monitoring
  storage.saveWellData(wp.id, {
    well: { companyName: 'P Co', boreholeImages: { wellPhoto: 'data:image/png;base64,photo1' } },
    model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, groundwaterMonitoring: { version: 1, measurements: [{ id: 'm1', waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', method: 'electric_water_level_meter', status: 'valid', notes: '' }] } },
    activity: { doc1: [{ id: 'd1', name: 'Foto', dataUrl: 'data:image/png;base64,doc1', createdAt: 't' }], doc2: [], doc3: [], doc4: [], doc5: [], doc6: [] },
  });
  const d = storage.getWellData(wp.id);
  assert(d.well.boreholeImages.wellPhoto === 'data:image/png;base64,photo1', 'photo intact');
  assert(d.activity.doc1.length === 1, 'documentation intact');
  assert(d.model.groundwaterMonitoring.measurements.length === 1, 'monitoring added');
}

// =========================================================
console.log('\n=== PDF: groundwater monitoring integration ===');
{
  const fs = await import('fs');
  const pdfMod = await import('file:///C:/Website/visualisasi_pipa/src/pdf.js');

  const project = {
    id: 'proj-mon', projectCode: 'PRJ-MON', projectName: 'Proyek Monitoring',
    clientName: 'Klien', contractorName: 'Kontraktor', location: 'Lokasi', status: 'completed',
  };
  const well = {
    id: 'well-mon', projectId: 'proj-mon', wellCode: 'WELL-MON', wellName: 'Sumur Monitoring',
    wellType: 'production', location: 'Lokasi', status: 'completed',
    companyName: 'PT. Mon', shallowWellNumber: 'SWB-001', address: 'Jl. Test',
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

  // PDF with monitoring data
  let thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model, well, activity, canvas: null, project,
      designer: null,
      geology: {
        version: 1,
        layers: [],
        groundwaterMonitoring: {
          version: 1,
          measurements: [
            { id: 'm1', waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', referenceElevation: 50, method: 'electric_water_level_meter', status: 'valid', notes: 'First', createdAt: '2026-11-03T08:00:00.000Z', updatedAt: '2026-11-03T08:00:00.000Z' },
            { id: 'm2', waterLevelDepth: 12, measuredAt: '2026-11-04T08:00:00.000Z', referencePoint: 'top_of_casing', referenceElevation: 50, method: 'electric_water_level_meter', status: 'valid', notes: 'Second', createdAt: '2026-11-04T08:00:00.000Z', updatedAt: '2026-11-04T08:00:00.000Z' },
            { id: 'm3', waterLevelDepth: 8, measuredAt: '2026-11-05T08:00:00.000Z', referencePoint: 'top_of_casing', referenceElevation: 50, method: 'electric_water_level_meter', status: 'valid', notes: 'Third', createdAt: '2026-11-05T08:00:00.000Z', updatedAt: '2026-11-05T08:00:00.000Z' },
          ],
        },
      },
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `PDF with monitoring data did not throw (${thrown ? thrown.message : ''})`);
  const f1 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f1, 'PDF file produced with monitoring data');
  if (f1) { const st = fs.statSync('laporan_konstruksi_sumur_bor.pdf'); assert(st.size > 1000, 'PDF non-trivial size'); fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf'); }

  // PDF with empty monitoring (should not add empty page, no crash)
  thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model: { pipes: [{ id: 'p1', start: 0, end: 10, depth: 10, diameter: 6 }], screens: [], ground: null, mat: null, openHole: null },
      well, activity, canvas: null, project, designer: null,
      geology: { version: 1, layers: [], groundwaterMonitoring: { version: 1, measurements: [] } },
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `PDF with empty monitoring did not throw (${thrown ? thrown.message : ''})`);
  const f2 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f2, 'PDF file produced with empty monitoring');
  if (f2) fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf');

  // PDF with designer + geology + monitoring together
  thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model: { pipes: [], screens: [], ground: null, mat: null, openHole: null, designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } } },
      well, activity, canvas: null, project,
      designer: { version: 1, components: [{ id: 'c1', type: 'surface_casing', startDepth: 0, endDepth: 30 }], config: { totalWellDepth: 30 } },
      geology: {
        version: 1,
        layers: [{ id: 'g1', name: 'Clay', material: 'clay', startDepth: 0, endDepth: 10, color: '#b45309', pattern: 'clay' }],
        groundwaterMonitoring: {
          version: 1,
          measurements: [{ id: 'm1', waterLevelDepth: 10, measuredAt: '2026-11-03T08:00:00.000Z', referencePoint: 'top_of_casing', referenceElevation: 50, method: 'electric_water_level_meter', status: 'valid', notes: 'Test', createdAt: '2026-11-03T08:00:00.000Z', updatedAt: '2026-11-03T08:00:00.000Z' }],
        },
      },
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `PDF with designer + geology + monitoring did not throw (${thrown ? thrown.message : ''})`);
  const f3 = fs.existsSync('laporan_konstruksi_sumur_bor.pdf');
  assert(f3, 'PDF file produced with all three modules');
  if (f3) fs.unlinkSync('laporan_konstruksi_sumur_bor.pdf');

  // Legacy PDF compatibility (no monitoring field at all)
  thrown = null;
  try {
    await pdfMod.downloadBoreholePdf({
      model: { pipes: [{ id: 'p1', start: 0, end: 10, depth: 10, diameter: 6 }], screens: [], ground: 2, mat: 5, openHole: null },
      well, activity, canvas: null, project, designer: null,
    });
  } catch (e) { thrown = e; }
  assert(!thrown, `Legacy PDF without monitoring field did not throw (${thrown ? thrown.message : ''})`);
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
  console.log('All Phase 5 tests passed.');
}