// Phase 3.1 — Unit tests for Designer↔Legacy adapter

import { describe, it, expect, beforeEach } from 'vitest';
import {
  designerToLegacy,
  legacyToDesigner,
  hasDesignerData,
  hasLegacyData,
  getEffectiveModelForPDF,
  groupExtraComponentsForPDF,
} from './adapter.js';

import {
  COMPONENT_DEFAULTS,
  COMPONENT_LABELS,
  INTERVAL_TYPES,
  MARKER_TYPES,
} from './model.js';

// Helper to create a basic designer state
function createDesigner(components = [], config = {}) {
  return {
    version: 1,
    components,
    config: {
      totalWellDepth: 0,
      groundLevel: null,
      matLevel: null,
      ...config,
    },
  };
}

function createComponent(type, overrides = {}) {
  const defaults = COMPONENT_DEFAULTS[type] || {};
  const isInterval = INTERVAL_TYPES.has(type);
  return {
    id: overrides.id || `comp-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    name: overrides.name || defaults.name || 'Komponen',
    startDepth: overrides.startDepth !== undefined ? Number(overrides.startDepth) : 0,
    endDepth: isInterval ? (overrides.endDepth !== undefined ? Number(overrides.endDepth) : 0) : 0,
    length: isInterval ? Math.max(0, (overrides.endDepth || 0) - (overrides.startDepth || 0)) : 0,
    outerDiameter: overrides.outerDiameter !== undefined ? overrides.outerDiameter : defaults.outerDiameter,
    innerDiameter: overrides.innerDiameter !== undefined ? overrides.innerDiameter : defaults.innerDiameter,
    material: overrides.material || defaults.material || '—',
    color: overrides.color || defaults.color || '#64748b',
    description: overrides.description || '',
    visible: overrides.visible !== undefined ? overrides.visible : true,
    zOrder: overrides.zOrder !== undefined ? overrides.zOrder : 0,
  };
}

describe('designerToLegacy', () => {
  it('Empty designer', () => {
    const designer = createDesigner([]);
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(0);
    expect(legacyModel.screens.length).toBe(0);
    expect(legacyModel.openHole).toBeNull();
    expect(legacyModel.ground).toBeNull();
    expect(legacyModel.mat).toBeNull();
    expect(extraComponents.length).toBe(0);
  });

  it('Single surface casing', () => {
    const comp = createComponent('surface_casing', { startDepth: 0, endDepth: 20, outerDiameter: 200, innerDiameter: 180 });
    const designer = createDesigner([comp], { groundLevel: 0, matLevel: 5 });
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(1);
    expect(legacyModel.pipes[0].start).toBeCloseTo(0, 2);
    expect(legacyModel.pipes[0].end).toBeCloseTo(20, 2);
    expect(legacyModel.pipes[0].diameter).toBeCloseTo(200/25.4, 2);
    expect(legacyModel.ground).toBe(0);
    expect(legacyModel.mat).toBe(5);
    expect(extraComponents.length).toBe(0);
  });

  it('Multiple casings (surface, production, blank)', () => {
    const comps = [
      createComponent('surface_casing', { startDepth: 0, endDepth: 20, outerDiameter: 200, innerDiameter: 180 }),
      createComponent('production_casing', { startDepth: 20, endDepth: 60, outerDiameter: 150, innerDiameter: 130 }),
      createComponent('blank_casing', { startDepth: 60, endDepth: 80, outerDiameter: 150, innerDiameter: 130 }),
    ];
    const designer = createDesigner(comps);
    const { legacyModel } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(3);
    expect(legacyModel.pipes[0].start).toBe(0);
    expect(legacyModel.pipes[0].end).toBe(20);
    expect(legacyModel.pipes[1].start).toBe(20);
    expect(legacyModel.pipes[1].end).toBe(60);
    expect(legacyModel.pipes[2].start).toBe(60);
    expect(legacyModel.pipes[2].end).toBe(80);
  });

  it('Screen pipe', () => {
    const comp = createComponent('screen_pipe', { startDepth: 40, endDepth: 60, outerDiameter: 150, innerDiameter: 130 });
    const designer = createDesigner([comp]);
    const { legacyModel } = designerToLegacy(designer);
    expect(legacyModel.screens.length).toBe(1);
    expect(legacyModel.screens[0].depth).toBe(40);
    expect(legacyModel.screens[0].size).toBe(20);
  });

  it('Open hole', () => {
    const comp = createComponent('open_hole', { startDepth: 80, endDepth: 100, outerDiameter: 200 });
    const designer = createDesigner([comp]);
    const { legacyModel } = designerToLegacy(designer);
    expect(legacyModel.openHole).not.toBeNull();
    expect(legacyModel.openHole.start).toBe(80);
    expect(legacyModel.openHole.end).toBe(100);
    expect(legacyModel.openHole.size).toBe(20);
  });

  it('Gravel pack and cement grouting → extraComponents', () => {
    const comps = [
      createComponent('gravel_pack', { startDepth: 40, endDepth: 60, outerDiameter: 250, innerDiameter: 200 }),
      createComponent('cement_grouting', { startDepth: 0, endDepth: 20, outerDiameter: 250, innerDiameter: 200 }),
    ];
    const designer = createDesigner(comps);
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(0);
    expect(extraComponents.length).toBe(2);
    const types = extraComponents.map(c => c.type).sort();
    expect(types).toEqual(['cement_grouting', 'gravel_pack']);
  });

  it('Markers → extraComponents', () => {
    const comps = [
      createComponent('well_cap', { startDepth: 0 }),
      createComponent('submersible_pump', { startDepth: 50 }),
      createComponent('pump_position', { startDepth: 45 }),
      createComponent('water_level_marker', { startDepth: 10 }),
    ];
    const designer = createDesigner(comps);
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(0);
    expect(extraComponents.length).toBe(4);
    const markerTypes = extraComponents.map(c => c.type).sort();
    expect(markerTypes).toEqual(['pump_position', 'submersible_pump', 'water_level_marker', 'well_cap']);
  });

  it('Mixed components - only legacy-representable go to legacyModel', () => {
    const comps = [
      createComponent('surface_casing', { startDepth: 0, endDepth: 20 }),
      createComponent('screen_pipe', { startDepth: 40, endDepth: 60 }),
      createComponent('gravel_pack', { startDepth: 40, endDepth: 60 }),
      createComponent('cement_grouting', { startDepth: 0, endDepth: 20 }),
      createComponent('well_cap', { startDepth: 0 }),
    ];
    const designer = createDesigner(comps);
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(1);
    expect(legacyModel.screens.length).toBe(1);
    expect(extraComponents.length).toBe(3);
  });

  it('Multiple open holes - only first goes to legacy, rest to extra', () => {
    const comps = [
      createComponent('open_hole', { startDepth: 80, endDepth: 90 }),
      createComponent('open_hole', { startDepth: 90, endDepth: 100 }),
    ];
    const designer = createDesigner(comps);
    const { legacyModel, extraComponents } = designerToLegacy(designer);
    expect(legacyModel.openHole).not.toBeNull();
    expect(legacyModel.openHole.start).toBe(80);
    expect(legacyModel.openHole.end).toBe(90);
    expect(extraComponents.length).toBe(1);
    expect(extraComponents[0].type).toBe('open_hole');
  });

  it('Config groundLevel and matLevel', () => {
    const designer = createDesigner([], { groundLevel: 2.5, matLevel: 7.3 });
    const { legacyModel } = designerToLegacy(designer);
    expect(legacyModel.ground).toBe(2.5);
    expect(legacyModel.mat).toBe(7.3);
  });

  it('Invisible components filtered out', () => {
    const comps = [
      createComponent('surface_casing', { startDepth: 0, endDepth: 20, visible: true }),
      createComponent('production_casing', { startDepth: 20, endDepth: 40, visible: false }),
    ];
    const designer = createDesigner(comps);
    const { legacyModel } = designerToLegacy(designer);
    expect(legacyModel.pipes.length).toBe(1);
    expect(legacyModel.pipes[0].start).toBe(0);
  });
});

describe('legacyToDesigner', () => {
  it('Empty legacy', () => {
    const legacy = { pipes: [], screens: [], openHole: null, ground: null, mat: null };
    const designer = legacyToDesigner(legacy);
    expect(designer.components.length).toBe(0);
    expect(designer.config.totalWellDepth).toBe(0);
    expect(designer.config.groundLevel).toBeNull();
    expect(designer.config.matLevel).toBeNull();
  });

  it('Legacy pipes → casing components', () => {
    const legacy = {
      pipes: [
        { start: 0, end: 20, depth: 20, diameter: 8 },
        { start: 20, end: 60, depth: 40, diameter: 6 },
      ],
      screens: [],
      openHole: null,
      ground: 0,
      mat: 5,
    };
    const designer = legacyToDesigner(legacy);
    expect(designer.components.length).toBe(2);
    expect(designer.components[0].type).toBe('surface_casing');
    expect(designer.components[1].type).toBe('production_casing');
    expect(designer.components[0].outerDiameter).toBeCloseTo(203.2, 0);
    expect(designer.components[1].outerDiameter).toBeCloseTo(152.4, 0);
    expect(designer.config.groundLevel).toBe(0);
    expect(designer.config.matLevel).toBe(5);
    expect(designer.config.totalWellDepth).toBe(60);
  });

  it('Single legacy pipe → surface_casing', () => {
    const legacy = {
      pipes: [{ start: 0, end: 50, depth: 50, diameter: 6 }],
      screens: [],
      openHole: null,
      ground: null,
      mat: null,
    };
    const designer = legacyToDesigner(legacy);
    expect(designer.components.length).toBe(1);
    expect(designer.components[0].type).toBe('surface_casing');
  });

  it('Legacy screens → screen_pipe', () => {
    const legacy = {
      pipes: [{ start: 0, end: 60, depth: 60, diameter: 6 }],
      screens: [{ depth: 40, size: 20 }],
      openHole: null,
      ground: 0,
      mat: 5,
    };
    const designer = legacyToDesigner(legacy);
    const screens = designer.components.filter(c => c.type === 'screen_pipe');
    expect(screens.length).toBe(1);
    expect(screens[0].startDepth).toBe(40);
    expect(screens[0].endDepth).toBe(60);
    expect(screens[0].length).toBe(20);
  });

  it('Legacy openHole → open_hole', () => {
    const legacy = {
      pipes: [{ start: 0, end: 80, depth: 80, diameter: 6 }],
      screens: [],
      openHole: { start: 80, end: 100, size: 20 },
      ground: 0,
      mat: 5,
    };
    const designer = legacyToDesigner(legacy);
    const openHoles = designer.components.filter(c => c.type === 'open_hole');
    expect(openHoles.length).toBe(1);
    expect(openHoles[0].startDepth).toBe(80);
    expect(openHoles[0].endDepth).toBe(100);
    expect(openHoles[0].length).toBe(20);
  });

  it('Full legacy migration with all types', () => {
    const legacy = {
      pipes: [
        { id: 'pipe-1', start: 0, end: 20, depth: 20, diameter: 8 },
        { id: 'pipe-2', start: 20, end: 60, depth: 40, diameter: 6 },
      ],
      screens: [{ id: 'screen-1', depth: 40, size: 20 }],
      openHole: { start: 60, end: 80, size: 20 },
      ground: 0,
      mat: 5,
    };
    const designer = legacyToDesigner(legacy);
    expect(designer.components.length).toBe(4);
    const types = designer.components.map(c => c.type);
    expect(types).toContain('surface_casing');
    expect(types).toContain('production_casing');
    expect(types).toContain('screen_pipe');
    expect(types).toContain('open_hole');
    expect(designer.config.totalWellDepth).toBe(80);
    expect(designer.components.every(c => c._migrated === true)).toBe(true);
  });

  it('Idempotency - running twice produces same result', () => {
    const legacy = {
      pipes: [{ start: 0, end: 50, depth: 50, diameter: 6 }],
      screens: [{ depth: 30, size: 20 }],
      openHole: null,
      ground: 0,
      mat: 5,
    };
    const designer1 = legacyToDesigner(legacy);
    const designer2 = legacyToDesigner(legacy);
    expect(designer1.components.length).toBe(designer2.components.length);
    expect(designer1.config.totalWellDepth).toBe(designer2.config.totalWellDepth);
  });
});

describe('Helper functions', () => {
  it('hasDesignerData', () => {
    const wellWithDesigner = { model: { designer: { components: [{ type: 'surface_casing' }] } } };
    const wellWithoutDesigner = { model: { designer: { components: [] } } };
    const wellNoDesigner = { model: {} };
    expect(hasDesignerData(wellWithDesigner)).toBe(true);
    expect(hasDesignerData(wellWithoutDesigner)).toBe(false);
    expect(hasDesignerData(wellNoDesigner)).toBe(false);
    expect(hasDesignerData(null)).toBe(false);
  });

  it('hasLegacyData', () => {
    const wellWithPipes = { model: { pipes: [{ start: 0, end: 10 }] } };
    const wellWithScreens = { model: { screens: [{ depth: 5, size: 5 }] } };
    const wellWithOpenHole = { model: { openHole: { start: 10, end: 20, size: 10 } } };
    const wellEmpty = { model: { pipes: [], screens: [], openHole: null } };
    const wellNoModel = { model: {} };
    expect(hasLegacyData(wellWithPipes)).toBe(true);
    expect(hasLegacyData(wellWithScreens)).toBe(true);
    expect(hasLegacyData(wellWithOpenHole)).toBe(true);
    expect(hasLegacyData(wellEmpty)).toBe(false);
    expect(hasLegacyData(wellNoModel)).toBe(false);
    expect(hasLegacyData(null)).toBe(false);
  });

  it('getEffectiveModelForPDF - prefers designer', () => {
    const wellData = {
      model: {
        designer: { components: [createComponent('surface_casing', { startDepth: 0, endDepth: 20 })], config: {} },
        pipes: [{ start: 0, end: 100, depth: 100, diameter: 6 }],
      },
    };
    const result = getEffectiveModelForPDF(wellData);
    expect(result.source).toBe('designer');
    expect(result.legacyModel.pipes.length).toBe(1);
    expect(result.legacyModel.pipes[0].end).toBe(20);
  });

  it('getEffectiveModelForPDF - falls back to legacy', () => {
    const wellData = {
      model: {
        designer: { components: [], config: {} },
        pipes: [{ start: 0, end: 50, depth: 50, diameter: 6 }],
        screens: [{ depth: 30, size: 20 }],
        ground: 0,
        mat: 5,
      },
    };
    const result = getEffectiveModelForPDF(wellData);
    expect(result.source).toBe('legacy');
    expect(result.legacyModel.pipes.length).toBe(1);
    expect(result.legacyModel.screens.length).toBe(1);
    expect(result.legacyModel.ground).toBe(0);
    expect(result.legacyModel.mat).toBe(5);
  });

  it('getEffectiveModelForPDF - none', () => {
    const wellData = { model: { designer: { components: [], config: {} }, pipes: [], screens: [] } };
    const result = getEffectiveModelForPDF(wellData);
    expect(result.source).toBe('none');
    expect(result.legacyModel.pipes.length).toBe(0);
  });

  it('groupExtraComponentsForPDF', () => {
    const extraComponents = [
      createComponent('gravel_pack', { startDepth: 40, endDepth: 60 }),
      createComponent('cement_grouting', { startDepth: 0, endDepth: 20 }),
      createComponent('well_cap', { startDepth: 0 }),
      createComponent('submersible_pump', { startDepth: 50 }),
      createComponent('pump_position', { startDepth: 45 }),
      createComponent('water_level_marker', { startDepth: 10 }),
      createComponent('unknown_type', { startDepth: 10 }),
    ];
    const groups = groupExtraComponentsForPDF(extraComponents);
    expect(groups.gravelPack.length).toBe(1);
    expect(groups.cementGrouting.length).toBe(1);
    expect(groups.wellCap.length).toBe(1);
    expect(groups.submersiblePump.length).toBe(1);
    expect(groups.pumpPosition.length).toBe(1);
    expect(groups.waterLevelMarker.length).toBe(1);
    expect(groups.other.length).toBe(1);
  });
});