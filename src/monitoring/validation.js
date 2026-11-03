// Phase 5 — Groundwater Monitoring validation.
// Returns { level: 'error' | 'warning' | 'info', code, message, measurementId?, depth? }.

import { getMethod, getReferencePoint, MEASUREMENT_METHODS, REFERENCE_POINTS } from './model.js';

const VALIDATION_LEVELS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

function error(code, message, measurementId, depth) {
  return { level: 'error', code, message, measurementId, depth };
}
function warning(code, message, measurementId, depth) {
  return { level: 'warning', code, message, measurementId, depth };
}
function info(code, message, measurementId, depth) {
  return { level: 'info', code, message, measurementId, depth };
}

export function validateMeasurement(measurement, allMeasurements, wellDepthMeters) {
  const issues = [];
  const method = getMethod(measurement.method);
  const refPoint = getReferencePoint(measurement.referencePoint);
  const label = `${refPoint.label} - ${method.label}`;
  const rawDepth = measurement.waterLevelDepth;
  const depth = Number(rawDepth);
  const measuredAt = measurement.measuredAt;

  // Invalid numeric value (check raw value before conversion)
  if (!Number.isFinite(rawDepth)) {
    issues.push(error('invalid-depth', `${label}: kedalaman air tidak valid (harus angka).`, measurement.id, rawDepth));
  } else {
    // Negative depth (only check if it's a valid number)
    if (depth < 0) {
      issues.push(error('negative-depth', `${label}: kedalaman air tidak boleh negatif (${depth} m).`, measurement.id, depth));
    }
  }

  // Invalid timestamp
  if (!measuredAt || isNaN(Date.parse(measuredAt))) {
    issues.push(error('invalid-timestamp', `${label}: tanggal/waktu pengukuran tidak valid.`, measurement.id, depth));
  }

  // Missing measurement method
  if (!measurement.method || !MEASUREMENT_METHODS[measurement.method]) {
    issues.push(error('missing-method', `${label}: metode pengukuran tidak valid.`, measurement.id, depth));
  }

  // Reference elevation validity
  if (measurement.referenceElevation !== null && measurement.referenceElevation !== undefined) {
    if (!Number.isFinite(Number(measurement.referenceElevation))) {
      issues.push(error('invalid-reference-elevation', `${label}: elevasi titik referensi tidak valid.`, measurement.id, depth));
    }
  }

  // Depth exceeds well depth (warning only)
  if (wellDepthMeters > 0 && depth > wellDepthMeters) {
    issues.push(warning('depth-exceeds-well', `${label}: kedalaman ${depth} m melebihi kedalaman sumur (${wellDepthMeters} m).`, measurement.id, depth));
  }

  // Duplicate ID check
  const sameIdCount = (allMeasurements || []).filter(m => m.id === measurement.id).length;
  if (sameIdCount > 1) {
    issues.push(error('duplicate-id', `Measurement ID "${measurement.id}" muncul lebih dari sekali.`, measurement.id, depth));
  }

  // Duplicate timestamp (info)
  const sameTimeCount = (allMeasurements || []).filter(m => m.measuredAt === measuredAt && m.id !== measurement.id).length;
  if (sameTimeCount > 0) {
    issues.push(info('duplicate-timestamp', `${label}: ada ${sameTimeCount} pengukuran lain dengan waktu yang sama.`, measurement.id, depth));
  }

  return issues;
}

export function validateMeasurements(measurements, wellDepthMeters) {
  const issues = [];
  const all = measurements || [];

  // Self-validation of each measurement
  for (const m of all) {
    issues.push(...validateMeasurement(m, all, wellDepthMeters));
  }

  // Reference point consistency check
  const refPoints = new Set(all.map(m => m.referencePoint));
  if (refPoints.size > 1) {
    issues.push(warning('mixed-reference-points', `Data mengandung ${refPoints.size} titik referensi berbeda. Perbandingan kedalaman antar titik referensi berbeda tidak valid tanpa koreksi elevasi.`, null, null));
  }

  // Sort by time for temporal checks
  const sorted = [...all].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));

  // Check for decreasing time order in input vs stored (informational)
  // Not an error since we sort on display

  // Informational: empty monitoring
  if (sorted.length === 0) {
    issues.push(info('empty-monitoring', 'Monitoring air tanah kosong. Belum ada pengukuran yang tercatat.', null, null));
  }

  return issues;
}

export function groupByLevel(issues) {
  const grouped = { error: [], warning: [], info: [] };
  for (const issue of issues || []) {
    if (grouped[issue.level]) grouped[issue.level].push(issue);
  }
  return grouped;
}

export function countsByLevel(issues) {
  return {
    error: issues.filter(i => i.level === 'error').length,
    warning: issues.filter(i => i.level === 'warning').length,
    info: issues.filter(i => i.level === 'info').length,
  };
}

export function monitoringSummary(measurements, wellDepthMeters) {
  const valid = (measurements || []).filter(m => m.status === 'valid' && Number.isFinite(m.waterLevelDepth));
  const sorted = [...valid].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));

  if (sorted.length === 0) {
    return {
      measurementCount: 0,
      latestDepth: null,
      minDepth: null,
      maxDepth: null,
      avgDepth: null,
      latestChange: null,
      firstMeasurementDate: null,
      latestMeasurementDate: null,
    };
  }

  const depths = sorted.map(m => m.waterLevelDepth);
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const change = previous ? latest.waterLevelDepth - previous.waterLevelDepth : null;

  return {
    measurementCount: valid.length,
    latestDepth: latest.waterLevelDepth,
    minDepth: Math.min(...depths),
    maxDepth: Math.max(...depths),
    avgDepth: depths.reduce((a, b) => a + b, 0) / depths.length,
    latestChange: change,
    firstMeasurementDate: sorted[0].measuredAt,
    latestMeasurementDate: latest.measuredAt,
    referencePoint: latest.referencePoint,
  };
}