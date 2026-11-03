// Phase 3.1 — Adapter between Designer model and Legacy visualization model.
// Provides explicit, one-directional conversion for PDF generation and migration.

import {
  INTERVAL_TYPES,
  MARKER_TYPES,
  COMPONENT_DEFAULTS,
  COMPONENT_LABELS,
  componentCategory,
} from './model.js';

// Convert mm to inches (1 inch = 25.4 mm)
function mmToInch(mm) {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return null;
  return Number((mm / 25.4).toFixed(2));
}

// Convert inches to mm
function inchToMm(inch) {
  if (inch === null || inch === undefined || !Number.isFinite(inch)) return null;
  return Math.round(inch * 25.4);
}

// Map Designer casing types to legacy pipe diameter (inches)
function casingTypeToInchDiameter(type, outerDiameterMm) {
  const od = mmToInch(outerDiameterMm);
  // Legacy model uses a single diameter per pipe segment (OD in inches)
  // We use outer diameter as the representative diameter
  return od;
}

// Determine casing type from Designer component
function classifyCasingComponent(comp) {
  // All casing types map to legacy pipes; differentiate by diameter if needed
  return 'casing';
}

/**
 * Convert Designer model to Legacy model format for PDF generation.
 * This is a one-way conversion: Designer → Legacy.
 * Components not representable in legacy model (gravel_pack, cement_grouting, markers)
 * are returned separately for optional PDF rendering.
 *
 * @param {Object} designer - Designer state { components, config }
 * @returns {Object} { legacyModel, extraComponents }
 *   legacyModel: { pipes, screens, openHole, ground, mat }
 *   extraComponents: Array of Designer components with no legacy equivalent
 */
export function designerToLegacy(designer) {
  if (!designer || !Array.isArray(designer.components)) {
    return {
      legacyModel: { pipes: [], screens: [], openHole: null, ground: null, mat: null },
      extraComponents: [],
    };
  }

  const components = designer.components.filter(c => c.visible !== false);
  const config = designer.config || {};

  const pipes = [];
  const screens = [];
  let openHole = null;
  const extraComponents = [];

  // Sort components by startDepth for consistent output
  const sorted = [...components].sort((a, b) => (a.startDepth || 0) - (b.startDepth || 0));

  for (const comp of sorted) {
    const type = comp.type;
    const start = Number(comp.startDepth) || 0;
    const end = Number(comp.endDepth) || 0;

    if (type === 'surface_casing' || type === 'production_casing' || type === 'blank_casing') {
      // Casing → legacy pipe
      const diameterInch = casingTypeToInchDiameter(type, comp.outerDiameter);
      if (diameterInch !== null && end > start) {
        pipes.push({
          id: comp.id,
          start,
          end,
          depth: Number((end - start).toFixed(2)),
          diameter: diameterInch,
          // Preserve original designer type for potential reverse mapping
          _designerType: type,
          _designerOuterDiameter: comp.outerDiameter,
          _designerInnerDiameter: comp.innerDiameter,
        });
      }
    } else if (type === 'screen_pipe') {
      // Screen pipe → legacy screen
      if (end > start) {
        screens.push({
          id: comp.id,
          depth: start,
          size: Number((end - start).toFixed(2)),
          _designerType: type,
          _designerOuterDiameter: comp.outerDiameter,
          _designerInnerDiameter: comp.innerDiameter,
        });
      }
    } else if (type === 'open_hole') {
      // Open hole → legacy openHole (only first one)
      if (!openHole && end > start) {
        openHole = {
          start,
          end,
          size: Number((end - start).toFixed(2)),
          _designerType: type,
          _designerOuterDiameter: comp.outerDiameter,
        };
      } else if (openHole) {
        // Multiple open holes not supported in legacy; treat as extra
        extraComponents.push(comp);
      }
    } else if (type === 'gravel_pack' || type === 'cement_grouting') {
      // Annular materials - no legacy equivalent
      extraComponents.push(comp);
    } else if (MARKER_TYPES.has(type)) {
      // Markers - no legacy equivalent
      extraComponents.push(comp);
    } else {
      // Unknown type
      extraComponents.push(comp);
    }
  }

  // Sort pipes by start depth
  pipes.sort((a, b) => a.start - b.start);
  // Recalculate depth for each pipe after sorting
  pipes.forEach((pipe, idx) => {
    pipe.depth = Number((pipe.end - pipe.start).toFixed(2));
  });

  // Sort screens by depth
  screens.sort((a, b) => a.depth - b.depth);

  const legacyModel = {
    pipes,
    screens,
    openHole,
    ground: config.groundLevel !== null && config.groundLevel !== undefined
      ? Number(config.groundLevel)
      : null,
    mat: config.matLevel !== null && config.matLevel !== undefined
      ? Number(config.matLevel)
      : null,
  };

  return { legacyModel, extraComponents };
}

/**
 * Convert Legacy model to Designer components for initial migration.
 * This is a one-time migration helper: Legacy → Designer.
 * Run only when a well has legacy data but no Designer components yet.
 *
 * @param {Object} legacyModel - Legacy model { pipes, screens, openHole, ground, mat }
 * @returns {Object} Designer state { components, config }
 */
export function legacyToDesigner(legacyModel) {
  if (!legacyModel) {
    return { components: [], config: { totalWellDepth: 0, groundLevel: null, matLevel: null } };
  }

  const components = [];
  let maxDepth = 0;

  // Legacy pipes → casing components
  // Heuristic: first pipe = surface_casing, subsequent = production_casing
  // If only one pipe, use surface_casing
  const pipes = Array.isArray(legacyModel.pipes) ? [...legacyModel.pipes].sort((a, b) => a.start - b.start) : [];
  pipes.forEach((pipe, idx) => {
    const start = Number(pipe.start) || 0;
    const end = Number(pipe.end) || 0;
    const diameterInch = Number(pipe.diameter) || 6;
    const outerDiameterMm = inchToMm(diameterInch);
    const innerDiameterMm = Math.round(outerDiameterMm * 0.9); // Approximate ID = 90% OD

    if (end > start) {
      let type;
      if (idx === 0) type = 'surface_casing';
      else if (idx === pipes.length - 1 && pipes.length > 1) type = 'production_casing';
      else type = 'blank_casing';

      components.push({
        id: pipe.id || `comp-migrated-${Date.now()}-${idx}`,
        type,
        name: COMPONENT_DEFAULTS[type]?.name || COMPONENT_LABELS[type] || type,
        startDepth: start,
        endDepth: end,
        length: Number((end - start).toFixed(2)),
        outerDiameter: outerDiameterMm,
        innerDiameter: innerDiameterMm,
        material: COMPONENT_DEFAULTS[type]?.material || 'PVC',
        color: COMPONENT_DEFAULTS[type]?.color || '#475569',
        description: `Dimigrasikan dari pipa lama (${diameterInch}″)`,
        visible: true,
        zOrder: idx,
        _migrated: true,
        _legacyDiameterInch: diameterInch,
      });
      if (end > maxDepth) maxDepth = end;
    }
  });

  // Legacy screens → screen_pipe components
  const screens = Array.isArray(legacyModel.screens) ? [...legacyModel.screens].sort((a, b) => a.depth - b.depth) : [];
  screens.forEach((screen, idx) => {
    const start = Number(screen.depth) || 0;
    const size = Number(screen.size) || 0;
    const end = start + size;

    if (size > 0) {
      // Use diameter from nearest pipe or default
      let outerDiameterMm = 150; // default production casing OD
      let innerDiameterMm = 130;
      const nearestPipe = pipes.find(p => p.start <= start && p.end >= end) || pipes[pipes.length - 1];
      if (nearestPipe) {
        outerDiameterMm = inchToMm(Number(nearestPipe.diameter) || 6);
        innerDiameterMm = Math.round(outerDiameterMm * 0.9);
      }

      components.push({
        id: screen.id || `comp-migrated-screen-${Date.now()}-${idx}`,
        type: 'screen_pipe',
        name: COMPONENT_DEFAULTS.screen_pipe?.name || COMPONENT_LABELS.screen_pipe || 'Pipa Saring',
        startDepth: start,
        endDepth: end,
        length: size,
        outerDiameter: outerDiameterMm,
        innerDiameter: innerDiameterMm,
        material: COMPONENT_DEFAULTS.screen_pipe?.material || 'PVC',
        color: COMPONENT_DEFAULTS.screen_pipe?.color || '#b45309',
        description: `Dimigrasikan dari saringan lama`,
        visible: true,
        zOrder: pipes.length + idx,
        _migrated: true,
      });
      if (end > maxDepth) maxDepth = end;
    }
  });

  // Legacy openHole → open_hole component
  if (legacyModel.openHole && Number.isFinite(legacyModel.openHole.end)) {
    const start = Number(legacyModel.openHole.start) || 0;
    const end = Number(legacyModel.openHole.end) || 0;
    const size = Number(legacyModel.openHole.size) || (end - start);

    if (end > start) {
      components.push({
        id: legacyModel.openHole.id || `comp-migrated-openhole-${Date.now()}`,
        type: 'open_hole',
        name: COMPONENT_DEFAULTS.open_hole?.name || COMPONENT_LABELS.open_hole || 'Lubang Terbuka',
        startDepth: start,
        endDepth: end,
        length: size,
        outerDiameter: COMPONENT_DEFAULTS.open_hole?.outerDiameter || 200,
        innerDiameter: COMPONENT_DEFAULTS.open_hole?.innerDiameter || 200,
        material: COMPONENT_DEFAULTS.open_hole?.material || 'Batu',
        color: COMPONENT_DEFAULTS.open_hole?.color || '#7c5a3c',
        description: `Dimigrasikan dari open hole lama`,
        visible: true,
        zOrder: pipes.length + screens.length,
        _migrated: true,
      });
      if (end > maxDepth) maxDepth = end;
    }
  }

  // Ground level and MAT
  const groundLevel = legacyModel.ground !== null && legacyModel.ground !== undefined
    ? Number(legacyModel.ground)
    : null;
  const matLevel = legacyModel.mat !== null && legacyModel.mat !== undefined
    ? Number(legacyModel.mat)
    : null;

  const config = {
    totalWellDepth: maxDepth,
    groundLevel,
    matLevel,
  };

  return { components, config };
}

/**
 * Check if a well has Designer data (non-empty components array).
 * @param {Object} wellData - Well data from storage
 * @returns {boolean}
 */
export function hasDesignerData(wellData) {
  return wellData?.model?.designer?.components?.length > 0;
}

/**
 * Check if a well has Legacy data (pipes, screens, or openHole).
 * @param {Object} wellData - Well data from storage
 * @returns {boolean}
 */
export function hasLegacyData(wellData) {
  const model = wellData?.model || {};
  return !!(
    (Array.isArray(model.pipes) && model.pipes.length > 0) ||
    (Array.isArray(model.screens) && model.screens.length > 0) ||
    (model.openHole && Number.isFinite(model.openHole?.end))
  );
}

/**
 * Get the effective model for PDF generation.
 * Prefers Designer data, falls back to Legacy.
 * @param {Object} wellData - Well data from storage
 * @returns {Object} { legacyModel, extraComponents, source: 'designer' | 'legacy' }
 */
export function getEffectiveModelForPDF(wellData) {
  if (!wellData) {
    return {
      legacyModel: { pipes: [], screens: [], openHole: null, ground: null, mat: null },
      extraComponents: [],
      source: 'none',
    };
  }

  const designer = wellData.model?.designer;
  const legacy = wellData.model || {};

  if (hasDesignerData(wellData)) {
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    return { legacyModel, extraComponents, source: 'designer' };
  } else if (hasLegacyData(wellData)) {
    // Normalize legacy model to match expected structure
    const pipes = Array.isArray(legacy.pipes) ? legacy.pipes : [];
    const screens = Array.isArray(legacy.screens) ? legacy.screens : [];
    const openHole = legacy.openHole && Number.isFinite(legacy.openHole?.end) ? legacy.openHole : null;
    const ground = legacy.ground !== null && legacy.ground !== undefined ? Number(legacy.ground) : null;
    const mat = legacy.mat !== null && legacy.mat !== undefined ? Number(legacy.mat) : null;

    return {
      legacyModel: { pipes, screens, openHole, ground, mat },
      extraComponents: [],
      source: 'legacy',
    };
  } else {
    return {
      legacyModel: { pipes: [], screens: [], openHole: null, ground: null, mat: null },
      extraComponents: [],
      source: 'none',
    };
  }
}

/**
 * Merge extra Designer components into PDF rendering context.
 * Returns components that need custom PDF rendering (gravel_pack, cement_grouting, markers).
 * @param {Array} extraComponents - Components from designerToLegacy().extraComponents
 * @returns {Object} Grouped extra components by type for PDF rendering
 */
export function groupExtraComponentsForPDF(extraComponents) {
  const groups = {
    gravelPack: [],
    cementGrouting: [],
    wellCap: [],
    submersiblePump: [],
    pumpPosition: [],
    waterLevelMarker: [],
    other: [],
  };

  for (const comp of extraComponents) {
    switch (comp.type) {
      case 'gravel_pack':
        groups.gravelPack.push(comp);
        break;
      case 'cement_grouting':
        groups.cementGrouting.push(comp);
        break;
      case 'well_cap':
        groups.wellCap.push(comp);
        break;
      case 'submersible_pump':
        groups.submersiblePump.push(comp);
        break;
      case 'pump_position':
        groups.pumpPosition.push(comp);
        break;
      case 'water_level_marker':
        groups.waterLevelMarker.push(comp);
        break;
      default:
        groups.other.push(comp);
    }
  }

  return groups;
}