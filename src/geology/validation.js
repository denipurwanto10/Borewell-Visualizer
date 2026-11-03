// Phase 4 — Geological Log validation.
// Returns { level: 'error' | 'warning' | 'info', code, message, layerId?, depth? }.

import { getMaterial } from './model.js';

const VALIDATION_LEVELS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

function error(code, message, layerId, depth) {
  return { level: 'error', code, message, layerId, depth };
}
function warning(code, message, layerId, depth) {
  return { level: 'warning', code, message, layerId, depth };
}
function info(code, message, layerId, depth) {
  return { level: 'info', code, message, layerId, depth };
}

// Validate a single layer's own properties.
export function validateLayer(layer, allLayers, wellDepthMeters) {
  const issues = [];
  const mat = getMaterial(layer.material);
  const label = layer.name || mat.label || layer.material;
  const start = Number(layer.startDepth) || 0;
  const end = Number(layer.endDepth) || 0;

  // Non-numeric / invalid depth values
  if (!Number.isFinite(start)) {
    issues.push(error('invalid-start-depth', `${label}: kedalaman mulai tidak valid (harus angka).`, layer.id, start));
  }
  if (!Number.isFinite(end)) {
    issues.push(error('invalid-end-depth', `${label}: kedalaman akhir tidak valid (harus angka).`, layer.id, end));
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return issues;

  // Negative depth
  if (start < 0) {
    issues.push(error('negative-start-depth', `${label}: kedalaman mulai tidak boleh negatif (${start} m).`, layer.id, start));
  }
  if (end < 0) {
    issues.push(error('negative-end-depth', `${label}: kedalaman akhir tidak boleh negatif (${end} m).`, layer.id, end));
  }

  // End before start
  if (end < start) {
    issues.push(error('end-before-start', `${label}: kedalaman akhir (${end} m) tidak boleh sebelum kedalaman mulai (${start} m).`, layer.id, start));
  }
  // Zero thickness
  if (end === start) {
    issues.push(warning('zero-thickness', `${label}: ketebalan nol (mulai = akhir = ${start} m).`, layer.id, start));
  }

  // Very thin layer (< 0.1 m)
  if (end > start && (end - start) < 0.1) {
    issues.push(warning('very-thin-layer', `${label}: ketebalan sangat kecil (${(end - start).toFixed(2)} m).`, layer.id, start));
  }

  // Outside well depth (warning only)
  if (wellDepthMeters > 0 && end > wellDepthMeters) {
    issues.push(warning('outside-well-depth', `${label}: mencapai ${end} m, melebihi kedalangan sumur (${wellDepthMeters} m).`, layer.id, end));
  }

  return issues;
}

// Cross-layer validation: overlaps & gaps based on sorted intervals.
export function validateLayers(layers, wellDepthMeters) {
  const issues = [];
  const visible = (layers || []).slice();

  // Self-validation of each layer
  for (const l of visible) {
    issues.push(...validateLayer(l, visible, wellDepthMeters));
  }

  // Sort by start depth for overlap/gap analysis
  const sorted = [...visible].sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);

  // Detect duplicate layer IDs
  const ids = new Set();
  for (const l of sorted) {
    if (ids.has(l.id)) {
      issues.push(error('duplicate-layer-id', `Layer ID "${l.id}" muncul lebih dari sekali.`, l.id, l.startDepth));
    } else {
      ids.add(l.id);
    }
  }

  // Overlap & gap checks between consecutive sorted intervals
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aEnd = Number(a.endDepth) || 0;
    const bStart = Number(b.startDepth) || 0;
    const aLabel = a.name || getMaterial(a.material).label;
    const bLabel = b.name || getMaterial(b.material).label;

    // Overlap
    if (aEnd > bStart) {
      const overlapLen = aEnd - bStart;
      issues.push(warning('overlap',
        `${aLabel} (${Number(a.startDepth)}–${aEnd} m) tumpang tindih dengan ${bLabel} (${bStart}–${Number(b.endDepth)} m) selama ${overlapLen.toFixed(2)} m.`,
        a.id, bStart));
    }
    // Gap (warning, not error — geology may be undocumented)
    else if (bStart > aEnd) {
      const gapLen = bStart - aEnd;
      issues.push(warning('gap',
        `Jendela geologi antara ${aLabel} (berakhir ${aEnd} m) dan ${bLabel} (mulai ${bStart} m): ${gapLen.toFixed(2)} m belum terdokumentasi.`,
        a.id, bStart));
    }
  }

  // Informational: empty log
  if (sorted.length === 0) {
    issues.push(info('empty-log', 'Log geologi kosong. Belum ada lapisan yang tercatat.', null, null));
  }

  return issues;
}

// Group issues by level
export function groupByLevel(issues) {
  const grouped = { error: [], warning: [], info: [] };
  for (const issue of issues || []) {
    if (grouped[issue.level]) grouped[issue.level].push(issue);
  }
  return grouped;
}

// Count by level
export function countsByLevel(issues) {
  return {
    error: issues.filter(i => i.level === 'error').length,
    warning: issues.filter(i => i.level === 'warning').length,
    info: issues.filter(i => i.level === 'info').length,
  };
}

// Summary statistics for the info panel
export function geologySummary(layers, wellDepthMeters) {
  const sorted = (layers || []).slice().sort((a, b) => a.startDepth - b.startDepth);
  let totalFilled = 0;
  let deepest = 0;
  for (const l of sorted) {
    const s = Number(l.startDepth) || 0;
    const e = Number(l.endDepth) || 0;
    if (e > s) totalFilled += (e - s);
    if (e > deepest) deepest = e;
  }
  return {
    layerCount: sorted.length,
    totalFilledInterval: totalFilled,
    deepestDescribed: deepest,
    wellDepthMeters,
  };
}
