// Phase 5 — Groundwater Statistics computation.

import { sortByTime, getLatestMeasurement, getPreviousMeasurement, calculateChange, depthToElevation } from './model.js';

export function computeStatistics(measurements, wellDepthMeters, groundElevation) {
  const valid = (measurements || []).filter(m => m.status === 'valid' && Number.isFinite(m.waterLevelDepth));
  const sorted = sortByTime(valid);

  if (sorted.length === 0) {
    return {
      totalMeasurements: 0,
      validMeasurements: 0,
      latestDepth: null,
      minDepth: null,
      maxDepth: null,
      avgDepth: null,
      latestChange: null,
      changeDirection: null,
      referenceMismatch: false,
      firstDate: null,
      latestDate: null,
      referencePoint: null,
      elevation: null,
    };
  }

  const depths = sorted.map(m => m.waterLevelDepth);
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const change = calculateChange(latest, previous);

  // Elevation of water level if reference elevation is known
  let elevation = null;
  if (latest.referenceElevation !== null && latest.referenceElevation !== undefined) {
    elevation = latest.referenceElevation - latest.waterLevelDepth;
  } else if (groundElevation !== null && groundElevation !== undefined && latest.referencePoint === 'ground_level') {
    elevation = groundElevation - latest.waterLevelDepth;
  }

  return {
    totalMeasurements: measurements.length,
    validMeasurements: valid.length,
    latestDepth: latest.waterLevelDepth,
    minDepth: Math.min(...depths),
    maxDepth: Math.max(...depths),
    avgDepth: depths.reduce((a, b) => a + b, 0) / depths.length,
    latestChange: change?.depth ?? null,
    changeDirection: change?.direction ?? null,
    referenceMismatch: change?.referenceMismatch ?? false,
    firstDate: sorted[0].measuredAt,
    latestDate: latest.measuredAt,
    referencePoint: latest.referencePoint,
    elevation,
    wellDepthMeters,
  };
}

export function formatStatValue(value, unit = 'm', decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)} ${unit}`;
}

export function formatChange(change, direction) {
  if (change === null || change === undefined) return '—';
  const sign = change > 0 ? '+' : '';
  const dirLabel = direction === 'deeper' ? ' (turun)' : direction === 'shallower' ? ' (naik)' : '';
  return `${sign}${change.toFixed(2)} m${dirLabel}`;
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}