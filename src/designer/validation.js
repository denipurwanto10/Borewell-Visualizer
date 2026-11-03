// Phase 3 — Engineering validation for the Well Designer.
// Every rule returns { level: 'error' | 'warning' | 'info', code, message, componentId?, depth? }.
// Not every geometric overlap is an error: components may share depth while occupying
// different radial zones (different inner/outer diameters). Rules are explicit & maintainable.

import { INTERVAL_TYPES, MARKER_TYPES, COMPONENT_LABELS } from './model.js';

export const VALIDATION_LEVELS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

function error(code, message, componentId, depth) {
  return { level: 'error', code, message, componentId, depth };
}
function warning(code, message, componentId, depth) {
  return { level: 'warning', code, message, componentId, depth };
}
function info(code, message, componentId, depth) {
  return { level: 'info', code, message, componentId, depth };
}

// Validate a single component's own properties.
export function validateComponent(component, allComponents, config) {
  const issues = [];
  const label = COMPONENT_LABELS[component.type] || component.type;
  const name = component.name || label;

  // Negative depths
  if (component.startDepth < 0) {
    issues.push(error('negative-start-depth', `${name}: kedalaman mulai tidak boleh negatif (${component.startDepth} m).`, component.id, component.startDepth));
  }
  if (component.endDepth < 0) {
    issues.push(error('negative-end-depth', `${name}: kedalaman akhir tidak boleh negatif (${component.endDepth} m).`, component.id, component.endDepth));
  }

  // Invalid start/end: end before start
  if (INTERVAL_TYPES.has(component.type)) {
    if (component.endDepth < component.startDepth) {
      issues.push(error('end-before-start', `${name}: kedalaman akhir (${component.endDepth} m) tidak boleh sebelum kedalaman mulai (${component.startDepth} m).`, component.id, component.startDepth));
    }
    // Zero length
    if (component.endDepth === component.startDepth) {
      issues.push(warning('zero-length', `${name}: panjang nol (mulai = akhir = ${component.startDepth} m).`, component.id, component.startDepth));
    }
  }

  // Zero or negative diameters (only where diameter applies)
  if (component.outerDiameter !== null && component.outerDiameter !== undefined && component.outerDiameter <= 0) {
    issues.push(error('invalid-outer-diameter', `${name}: diameter luar harus lebih besar dari nol (${component.outerDiameter} mm).`, component.id));
  }
  if (component.innerDiameter !== null && component.innerDiameter !== undefined && component.innerDiameter <= 0) {
    issues.push(error('invalid-inner-diameter', `${name}: diameter dalam harus lebih besar dari nol (${component.innerDiameter} mm).`, component.id));
  }
  // Inner diameter cannot exceed outer diameter
  if (component.innerDiameter !== null && component.innerDiameter !== undefined &&
      component.outerDiameter !== null && component.outerDiameter !== undefined &&
      component.innerDiameter > component.outerDiameter) {
    issues.push(error('inner-greater-than-outer', `${name}: diameter dalam (${component.innerDiameter} mm) tidak boleh lebih besar dari diameter luar (${component.outerDiameter} mm).`, component.id));
  }

  // Length consistency for intervals: length should equal end - start
  if (INTERVAL_TYPES.has(component.type)) {
    const expectedLength = Math.max(0, component.endDepth - component.startDepth);
    if (Math.abs((component.length || 0) - expectedLength) > 0.001 && component.length !== undefined) {
      issues.push(warning('length-mismatch', `${name}: panjang tercatat (${component.length} m) tidak konsisten dengan kedalaman (${expectedLength} m).`, component.id));
    }
  }

  // Components outside total well depth
  const totalDepth = config?.totalWellDepth || 0;
  if (totalDepth > 0) {
    const compBottom = component.endDepth !== undefined ? component.endDepth : component.startDepth;
    if (compBottom > totalDepth) {
      issues.push(warning('outside-well-depth', `${name}: mencapai ${compBottom} m, melebihi kedalangan sumur (${totalDepth} m).`, component.id, compBottom));
    }
  }

  return issues;
}

// Cross-component validation: geometric conflicts & relationships.
export function validateComponents(components, config) {
  const issues = [];
  const visible = (components || []).filter(c => c.visible);
  const totalDepth = config?.totalWellDepth || 0;

  // Self-validation of each component
  for (const c of visible) {
    issues.push(...validateComponent(c, visible, config));
  }

  // Interval overlap checks (depth-based). Overlap is a WARNING, not an error,
  // because components can share depth at different radial zones.
  const intervals = visible.filter(c => INTERVAL_TYPES.has(c.type));
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      const aStart = a.startDepth; const aEnd = a.endDepth;
      const bStart = b.startDepth; const bEnd = b.endDepth;
      const overlap = aEnd > bStart && bEnd > aStart;
      if (overlap) {
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        const overlapLen = overlapEnd - overlapStart;
        const la = COMPONENT_LABELS[a.type] || a.type;
        const lb = COMPONENT_LABELS[b.type] || b.type;

        // Same type overlapping at same radial zone → error (two casings can't occupy same space)
        if (a.type === b.type && a.outerDiameter === b.outerDiameter && a.innerDiameter === b.innerDiameter) {
          issues.push(error('same-zone-overlap',
            `${la} (${aStart}–${aEnd} m) tumpang tindih dengan ${lb} (${bStart}–${bEnd} m) di zona radial yang sama (${overlapStart}–${overlapEnd} m).`,
            a.id, overlapStart));
        } else {
          // Different types or different diameters → warning (legitimate overlap possible)
          issues.push(warning('depth-overlap',
            `${la} (${aStart}–${aEnd} m) bertindihan dalam kedalaman dengan ${lb} (${bStart}–${bEnd} m) selama ${overlapLen.toFixed(2)} m. Ini boleh valid jika occupying zona radial berbeda.`,
            a.id, overlapStart));
        }
      }
    }
  }

  // Pump position validation: must be within well depth and not below bottom
  for (const c of visible) {
    if (c.type === 'pump_position') {
      if (totalDepth > 0 && c.startDepth > totalDepth) {
        issues.push(error('pump-outside-well',
          `Posisi pompa (${c.startDepth} m) di bawah kedalangan sumur (${totalDepth} m).`,
          c.id, c.startDepth));
      }
    }
    if (c.type === 'submersible_pump') {
      if (totalDepth > 0 && c.startDepth > totalDepth) {
        issues.push(error('pump-outside-well',
          `Pompa sumur (${c.startDepth} m) di bawah kedalangan sumur (${totalDepth} m).`,
          c.id, c.startDepth));
      }
    }
    if (c.type === 'water_level_marker') {
      if (config?.matLevel !== null && config?.matLevel !== undefined &&
          config?.groundLevel !== null) {
        const absMat = config.groundLevel + config.matLevel;
        if (Math.abs(c.startDepth - absMat) > 0.5) {
          issues.push(info('water-level-off-mat',
            `Pemarkah air (${c.startDepth} m) tidak sesuai dengan muka air tanah (${absMat.toFixed(2)} m).`,
            c.id, c.startDepth));
        }
      }
    }
  }

  // Screen interval should be within casing/borehole
  for (const c of visible) {
    if (c.type === 'screen_pipe') {
      if (totalDepth > 0 && c.endDepth > totalDepth) {
        issues.push(warning('screen-outside-well',
          `Pipa saring (${c.startDepth}–${c.endDepth} m) melebihi kedalangan sumur (${totalDepth} m).`,
          c.id, c.endDepth));
      }
    }
  }

  // Well cap should be at or near surface (ground level)
  for (const c of visible) {
    if (c.type === 'well_cap') {
      if (config?.groundLevel !== null && config?.groundLevel !== undefined &&
          Math.abs(c.startDepth - config.groundLevel) > 1) {
        issues.push(info('well-cap-not-at-surface',
          `Tutup sumur (${c.startDepth} m) tidak berada di permukaan tanah (${config.groundLevel} m).`,
          c.id, c.startDepth));
      }
    }
  }

  // Cement grouting should typically be at shallow depths (annular seal)
  for (const c of visible) {
    if (c.type === 'cement_grouting') {
      if (totalDepth > 0 && c.startDepth > totalDepth) {
        issues.push(warning('grouting-outside-well',
          `Semen rekat (${c.startDepth}–${c.endDepth} m) melebihi kedalangan sumur.`,
          c.id, c.startDepth));
      }
    }
  }

  // Informational: no components at all
  if (visible.length === 0 && totalDepth > 0) {
    issues.push(info('empty-design', 'Belum ada komponen konstruksi yang dirancang.', null, null));
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
