// Phase 5 — Groundwater Monitoring data model.
// Units: depth in meters, elevation in meters.
// One monitoring record per well, stored in model.groundwaterMonitoring.

export const MONITORING_VERSION = 1;

export const MEASUREMENT_METHODS = {
  electric_water_level_meter: { label: 'Electric Water Level Meter', category: 'manual' },
  manual_water_level_meter: { label: 'Manual Water Level Meter', category: 'manual' },
  pressure_transducer: { label: 'Pressure Transducer', category: 'automatic' },
  automatic_data_logger: { label: 'Automatic Data Logger', category: 'automatic' },
  other: { label: 'Other', category: 'manual' },
};

export const REFERENCE_POINTS = {
  top_of_casing: { label: 'Top of Casing', abbreviation: 'TOC' },
  ground_level: { label: 'Ground Level', abbreviation: 'GL' },
  custom: { label: 'Custom Reference Point', abbreviation: 'CUSTOM' },
};

export function getMethod(id) {
  return MEASUREMENT_METHODS[id] || MEASUREMENT_METHODS.other;
}

export function getReferencePoint(id) {
  return REFERENCE_POINTS[id] || REFERENCE_POINTS.custom;
}

export function generateId() {
  return `mon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createMeasurement(overrides = {}) {
  const now = new Date();
  const measuredAt = overrides.measuredAt || now.toISOString();
  const method = overrides.method || 'electric_water_level_meter';
  const refPoint = overrides.referencePoint || 'top_of_casing';
  const refElev = overrides.referenceElevation;
  return {
    id: overrides.id || generateId(),
    measuredAt,
    waterLevelDepth: Number.isFinite(Number(overrides.waterLevelDepth)) ? Number(overrides.waterLevelDepth) : 0,
    referencePoint: refPoint,
    referenceElevation: refElev !== undefined && refElev !== '' && refElev !== null && Number.isFinite(Number(refElev)) ? Number(refElev) : null,
    method,
    status: overrides.status || 'valid',
    notes: typeof overrides.notes === 'string' ? overrides.notes : '',
    createdAt: overrides.createdAt || now.toISOString(),
    updatedAt: overrides.updatedAt || now.toISOString(),
  };
}

export function emptyMonitoring() {
  return {
    version: MONITORING_VERSION,
    measurements: [],
  };
}

export function normalizeMonitoring(saved) {
  if (!saved || typeof saved !== 'object') return emptyMonitoring();
  const version = saved.version === undefined || saved.version === null ? MONITORING_VERSION : Number(saved.version) || MONITORING_VERSION;
  const rawMeasurements = Array.isArray(saved.measurements) ? saved.measurements : [];
  const measurements = [];
  const seenIds = new Set();
  for (const raw of rawMeasurements) {
    const m = normalizeMeasurement(raw);
    if (!m) continue;
    let id = m.id;
    if (seenIds.has(id)) id = generateId();
    seenIds.add(id);
    m.id = id;
    measurements.push(m);
  }
  // Sort by measuredAt ascending
  measurements.sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
  return { version, measurements };
}

export function normalizeMeasurement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const waterLevelDepth = Number.isFinite(Number(raw.waterLevelDepth)) ? Number(raw.waterLevelDepth) : 0;
  const referencePoint = raw.referencePoint && REFERENCE_POINTS[raw.referencePoint] ? raw.referencePoint : 'top_of_casing';
  const referenceElevation = raw.referenceElevation !== undefined && raw.referenceElevation !== '' && Number.isFinite(Number(raw.referenceElevation))
    ? Number(raw.referenceElevation) : null;
  const method = raw.method && MEASUREMENT_METHODS[raw.method] ? raw.method : 'electric_water_level_meter';
  const status = raw.status === 'invalid' ? 'invalid' : 'valid';
  const measuredAt = raw.measuredAt && !isNaN(Date.parse(raw.measuredAt)) ? raw.measuredAt : null;
  
  // Drop invalid measurements (no valid timestamp)
  if (!measuredAt) return null;
  
  return {
    id: raw.id || generateId(),
    measuredAt,
    waterLevelDepth,
    referencePoint,
    referenceElevation,
    method,
    status,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    createdAt: raw.createdAt && !isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString(),
    updatedAt: raw.updatedAt && !isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date().toISOString(),
  };
}

export function sortByTime(measurements) {
  return [...(measurements || [])].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
}

export function getLatestMeasurement(measurements) {
  const sorted = sortByTime(measurements);
  return sorted[sorted.length - 1] || null;
}

export function getPreviousMeasurement(measurements, currentMeasurement) {
  const sorted = sortByTime(measurements);
  const currentIdx = sorted.findIndex(m => m.id === currentMeasurement.id);
  if (currentIdx <= 0) return null;
  return sorted[currentIdx - 1] || null;
}

export function calculateChange(current, previous) {
  if (!current || !previous) return null;
  // Both must have same reference point for meaningful comparison
  if (current.referencePoint !== previous.referencePoint) return { depth: null, direction: 'incomparable', referenceMismatch: true };
  const depthChange = current.waterLevelDepth - previous.waterLevelDepth;
  const direction = depthChange > 0 ? 'deeper' : depthChange < 0 ? 'shallower' : 'unchanged';
  return { depth: depthChange, direction, referenceMismatch: false };
}

export function depthToElevation(measurement, groundElevation) {
  // Convert depth to elevation if reference point elevation is known
  // Priority: measurement.referenceElevation > groundElevation (if referencePoint is ground_level)
  let refElev = measurement.referenceElevation;
  if (refElev === null || refElev === undefined) {
    if (measurement.referencePoint === 'ground_level' && groundElevation !== null && groundElevation !== undefined) {
      refElev = groundElevation;
    }
  }
  if (refElev === null || refElev === undefined) return null;
  return refElev - measurement.waterLevelDepth;
}