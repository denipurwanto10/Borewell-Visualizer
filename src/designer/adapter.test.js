// Phase 3.1 — Unit tests for Designer↔Legacy adapter

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

// --- Tests for designerToLegacy ---

console.log('Testing designerToLegacy...');

// Test 1: Empty designer
{
  const designer = createDesigner([]);
  const { legacyModel, extraComponents } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 0, 'Test 1a: pipes empty');
  console.assert(legacyModel.screens.length === 0, 'Test 1b: screens empty');
  console.assert(legacyModel.openHole === null, 'Test 1c: openHole null');
  console.assert(legacyModel.ground === null, 'Test 1d: ground null');
  console.assert(legacyModel.mat === null, 'Test 1e: mat null');
  console.assert(extraComponents.length === 0, 'Test 1f: extraComponents empty');
  console.log('Test 1 passed: Empty designer');
}

// Test 2: Single surface casing
{
  const comp = createComponent('surface_casing', { startDepth: 0, endDepth: 20, outerDiameter: 200, innerDiameter: 180 });
  const designer = createDesigner([comp], { groundLevel: 0, matLevel: 5 });
  const { legacyModel, extraComponents } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 1, 'Test 2a: one pipe');
  console.assert(Math.abs(legacyModel.pipes[0].start - 0) < 0.01, 'Test 2b: pipe start 0');
  console.assert(Math.abs(legacyModel.pipes[0].end - 20) < 0.01, 'Test 2c: pipe end 20');
  console.assert(Math.abs(legacyModel.pipes[0].diameter - (200/25.4)) < 0.01, 'Test 2d: diameter in inches');
  console.assert(legacyModel.ground === 0, 'Test 2e: ground 0');
  console.assert(legacyModel.mat === 5, 'Test 2f: mat 5');
  console.assert(extraComponents.length === 0, 'Test 2g: no extra');
  console.log('Test 2 passed: Single surface casing');
}

// Test 3: Multiple casings (surface, production, blank)
{
  const comps = [
    createComponent('surface_casing', { startDepth: 0, endDepth: 20, outerDiameter: 200, innerDiameter: 180 }),
    createComponent('production_casing', { startDepth: 20, endDepth: 60, outerDiameter: 150, innerDiameter: 130 }),
    createComponent('blank_casing', { startDepth: 60, endDepth: 80, outerDiameter: 150, innerDiameter: 130 }),
  ];
  const designer = createDesigner(comps);
  const { legacyModel } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 3, 'Test 3a: three pipes');
  console.assert(legacyModel.pipes[0].start === 0 && legacyModel.pipes[0].end === 20, 'Test 3b: pipe 1 depths');
  console.assert(legacyModel.pipes[1].start === 20 && legacyModel.pipes[1].end === 60, 'Test 3c: pipe 2 depths');
  console.assert(legacyModel.pipes[2].start === 60 && legacyModel.pipes[2].end === 80, 'Test 3d: pipe 3 depths');
  console.log('Test 3 passed: Multiple casings');
}

// Test 4: Screen pipe
{
  const comp = createComponent('screen_pipe', { startDepth: 40, endDepth: 60, outerDiameter: 150, innerDiameter: 130 });
  const designer = createDesigner([comp]);
  const { legacyModel } = designerToLegacy(designer);
  console.assert(legacyModel.screens.length === 1, 'Test 4a: one screen');
  console.assert(legacyModel.screens[0].depth === 40, 'Test 4b: screen depth 40');
  console.assert(legacyModel.screens[0].size === 20, 'Test 4c: screen size 20');
  console.log('Test 4 passed: Screen pipe');
}

// Test 5: Open hole
{
  const comp = createComponent('open_hole', { startDepth: 80, endDepth: 100, outerDiameter: 200 });
  const designer = createDesigner([comp]);
  const { legacyModel } = designerToLegacy(designer);
  console.assert(legacyModel.openHole !== null, 'Test 5a: openHole present');
  console.assert(legacyModel.openHole.start === 80, 'Test 5b: openHole start 80');
  console.assert(legacyModel.openHole.end === 100, 'Test 5c: openHole end 100');
  console.assert(legacyModel.openHole.size === 20, 'Test 5d: openHole size 20');
  console.log('Test 5 passed: Open hole');
}

// Test 6: Gravel pack and cement grouting → extraComponents
{
  const comps = [
    createComponent('gravel_pack', { startDepth: 40, endDepth: 60, outerDiameter: 250, innerDiameter: 200 }),
    createComponent('cement_grouting', { startDepth: 0, endDepth: 20, outerDiameter: 250, innerDiameter: 200 }),
  ];
  const designer = createDesigner(comps);
  const { legacyModel, extraComponents } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 0, 'Test 6a: no pipes from gravel/cement');
  console.assert(extraComponents.length === 2, 'Test 6b: two extra components');
  const types = extraComponents.map(c => c.type).sort();
  console.assert(types[0] === 'cement_grouting' && types[1] === 'gravel_pack', 'Test 6c: correct types');
  console.log('Test 6 passed: Gravel pack and cement grouting as extra');
}

// Test 7: Markers → extraComponents
{
  const comps = [
    createComponent('well_cap', { startDepth: 0 }),
    createComponent('submersible_pump', { startDepth: 50 }),
    createComponent('pump_position', { startDepth: 45 }),
    createComponent('water_level_marker', { startDepth: 10 }),
  ];
  const designer = createDesigner(comps);
  const { legacyModel, extraComponents } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 0, 'Test 7a: no pipes from markers');
  console.assert(extraComponents.length === 4, 'Test 7b: four extra components');
  const markerTypes = extraComponents.map(c => c.type).sort();
  console.assert(JSON.stringify(markerTypes) === JSON.stringify(['pump_position', 'submersible_pump', 'water_level_marker', 'well_cap']), 'Test 7c: correct marker types');
  console.log('Test 7 passed: Markers as extra');
}

// Test 8: Mixed components - only legacy-representable go to legacyModel
{
  const comps = [
    createComponent('surface_casing', { startDepth: 0, endDepth: 20 }),
    createComponent('screen_pipe', { startDepth: 40, endDepth: 60 }),
    createComponent('gravel_pack', { startDepth: 40, endDepth: 60 }),
    createComponent('cement_grouting', { startDepth: 0, endDepth: 20 }),
    createComponent('well_cap', { startDepth: 0 }),
  ];
  const designer = createDesigner(comps);
  const { legacyModel, extraComponents } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 1, 'Test 8a: one pipe');
  console.assert(legacyModel.screens.length === 1, 'Test 8b: one screen');
  console.assert(extraComponents.length === 3, 'Test 8c: three extra');
  console.log('Test 8 passed: Mixed components');
}

// Test 9: Multiple open holes - only first goes to legacy, rest to extra
{
  const comps = [
    createComponent('open_hole', { startDepth: 80, endDepth: 90 }),
    createComponent('open_hole', { startDepth: 90, endDepth: 100 }),
  ];
  const designer = createDesigner(comps);
  const { legacyModel, extraComponents } = designerToLegacy(designer);
  console.assert(legacyModel.openHole !== null, 'Test 9a: first openHole in legacy');
  console.assert(legacyModel.openHole.start === 80 && legacyModel.openHole.end === 90, 'Test 9b: correct first openHole');
  console.assert(extraComponents.length === 1, 'Test 9c: second openHole in extra');
  console.assert(extraComponents[0].type === 'open_hole', 'Test 9d: extra is open_hole');
  console.log('Test 9 passed: Multiple open holes');
}

// Test 10: Config groundLevel and matLevel
{
  const designer = createDesigner([], { groundLevel: 2.5, matLevel: 7.3 });
  const { legacyModel } = designerToLegacy(designer);
  console.assert(legacyModel.ground === 2.5, 'Test 10a: groundLevel preserved');
  console.assert(legacyModel.mat === 7.3, 'Test 10b: matLevel preserved');
  console.log('Test 10 passed: Config levels');
}

// Test 11: Invisible components filtered out
{
  const comps = [
    createComponent('surface_casing', { startDepth: 0, endDepth: 20, visible: true }),
    createComponent('production_casing', { startDepth: 20, endDepth: 40, visible: false }),
  ];
  const designer = createDesigner(comps);
  const { legacyModel } = designerToLegacy(designer);
  console.assert(legacyModel.pipes.length === 1, 'Test 11a: only visible pipe');
  console.assert(legacyModel.pipes[0].start === 0, 'Test 11b: visible pipe is first');
  console.log('Test 11 passed: Invisible filtered');
}

// --- Tests for legacyToDesigner ---

console.log('\nTesting legacyToDesigner...');

// Test 12: Empty legacy
{
  const legacy = { pipes: [], screens: [], openHole: null, ground: null, mat: null };
  const designer = legacyToDesigner(legacy);
  console.assert(designer.components.length === 0, 'Test 12a: no components');
  console.assert(designer.config.totalWellDepth === 0, 'Test 12b: totalWellDepth 0');
  console.assert(designer.config.groundLevel === null, 'Test 12c: groundLevel null');
  console.assert(designer.config.matLevel === null, 'Test 12d: matLevel null');
  console.log('Test 12 passed: Empty legacy');
}

// Test 13: Legacy pipes → casing components
{
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
  console.assert(designer.components.length === 2, 'Test 13a: two components');
  console.assert(designer.components[0].type === 'surface_casing', 'Test 13b: first is surface_casing');
  console.assert(designer.components[1].type === 'production_casing', 'Test 13c: second is production_casing');
  console.assert(Math.abs(designer.components[0].outerDiameter - 203.2) < 1, 'Test 13d: OD ~203mm (8″)');
  console.assert(Math.abs(designer.components[1].outerDiameter - 152.4) < 1, 'Test 13e: OD ~152mm (6″)');
  console.assert(designer.config.groundLevel === 0, 'Test 13f: groundLevel 0');
  console.assert(designer.config.matLevel === 5, 'Test 13g: matLevel 5');
  console.assert(designer.config.totalWellDepth === 60, 'Test 13h: totalWellDepth 60');
  console.log('Test 13 passed: Legacy pipes to casings');
}

// Test 14: Single legacy pipe → surface_casing
{
  const legacy = {
    pipes: [{ start: 0, end: 50, depth: 50, diameter: 6 }],
    screens: [],
    openHole: null,
    ground: null,
    mat: null,
  };
  const designer = legacyToDesigner(legacy);
  console.assert(designer.components.length === 1, 'Test 14a: one component');
  console.assert(designer.components[0].type === 'surface_casing', 'Test 14b: single pipe is surface_casing');
  console.log('Test 14 passed: Single legacy pipe');
}

// Test 15: Legacy screens → screen_pipe
{
  const legacy = {
    pipes: [{ start: 0, end: 60, depth: 60, diameter: 6 }],
    screens: [
      { depth: 40, size: 20 },
    ],
    openHole: null,
    ground: 0,
    mat: 5,
  };
  const designer = legacyToDesigner(legacy);
  const screens = designer.components.filter(c => c.type === 'screen_pipe');
  console.assert(screens.length === 1, 'Test 15a: one screen_pipe');
  console.assert(screens[0].startDepth === 40, 'Test 15b: screen start 40');
  console.assert(screens[0].endDepth === 60, 'Test 15c: screen end 60');
  console.assert(screens[0].length === 20, 'Test 15d: screen length 20');
  console.log('Test 15 passed: Legacy screens');
}

// Test 16: Legacy openHole → open_hole
{
  const legacy = {
    pipes: [{ start: 0, end: 80, depth: 80, diameter: 6 }],
    screens: [],
    openHole: { start: 80, end: 100, size: 20 },
    ground: 0,
    mat: 5,
  };
  const designer = legacyToDesigner(legacy);
  const openHoles = designer.components.filter(c => c.type === 'open_hole');
  console.assert(openHoles.length === 1, 'Test 16a: one open_hole');
  console.assert(openHoles[0].startDepth === 80, 'Test 16b: openHole start 80');
  console.assert(openHoles[0].endDepth === 100, 'Test 16c: openHole end 100');
  console.assert(openHoles[0].length === 20, 'Test 16d: openHole length 20');
  console.log('Test 16 passed: Legacy openHole');
}

// Test 17: Full legacy migration with all types
{
  const legacy = {
    pipes: [
      { id: 'pipe-1', start: 0, end: 20, depth: 20, diameter: 8 },
      { id: 'pipe-2', start: 20, end: 60, depth: 40, diameter: 6 },
    ],
    screens: [
      { id: 'screen-1', depth: 40, size: 20 },
    ],
    openHole: { start: 60, end: 80, size: 20 },
    ground: 0,
    mat: 5,
  };
  const designer = legacyToDesigner(legacy);
  console.assert(designer.components.length === 4, 'Test 17a: 4 components (2 pipes + 1 screen + 1 openHole)');
  const types = designer.components.map(c => c.type);
  console.assert(types.includes('surface_casing'), 'Test 17b: has surface_casing');
  console.assert(types.includes('production_casing'), 'Test 17c: has production_casing');
  console.assert(types.includes('screen_pipe'), 'Test 17d: has screen_pipe');
  console.assert(types.includes('open_hole'), 'Test 17e: has open_hole');
  console.assert(designer.config.totalWellDepth === 80, 'Test 17f: totalWellDepth 80');
  // Check migrated flag
  console.assert(designer.components.every(c => c._migrated === true), 'Test 17g: all marked migrated');
  console.log('Test 17 passed: Full legacy migration');
}

// Test 18: Idempotency - running twice produces same result
{
  const legacy = {
    pipes: [{ start: 0, end: 50, depth: 50, diameter: 6 }],
    screens: [{ depth: 30, size: 20 }],
    openHole: null,
    ground: 0,
    mat: 5,
  };
  const designer1 = legacyToDesigner(legacy);
  const designer2 = legacyToDesigner(legacy);
  console.assert(designer1.components.length === designer2.components.length, 'Test 18a: same component count');
  console.assert(designer1.config.totalWellDepth === designer2.config.totalWellDepth, 'Test 18b: same totalWellDepth');
  console.log('Test 18 passed: Idempotent');
}

// --- Tests for helper functions ---

console.log('\nTesting helper functions...');

// Test 19: hasDesignerData
{
  const wellWithDesigner = { model: { designer: { components: [{ type: 'surface_casing' }] } } };
  const wellWithoutDesigner = { model: { designer: { components: [] } } };
  const wellNoDesigner = { model: {} };
  console.assert(hasDesignerData(wellWithDesigner) === true, 'Test 19a: has designer data');
  console.assert(hasDesignerData(wellWithoutDesigner) === false, 'Test 19b: empty designer');
  console.assert(hasDesignerData(wellNoDesigner) === false, 'Test 19c: no designer key');
  console.assert(hasDesignerData(null) === false, 'Test 19d: null well');
  console.log('Test 19 passed: hasDesignerData');
}

// Test 20: hasLegacyData
{
  const wellWithPipes = { model: { pipes: [{ start: 0, end: 10 }] } };
  const wellWithScreens = { model: { screens: [{ depth: 5, size: 5 }] } };
  const wellWithOpenHole = { model: { openHole: { start: 10, end: 20, size: 10 } } };
  const wellEmpty = { model: { pipes: [], screens: [], openHole: null } };
  const wellNoModel = { model: {} };
  console.assert(hasLegacyData(wellWithPipes) === true, 'Test 20a: has pipes');
  console.assert(hasLegacyData(wellWithScreens) === true, 'Test 20b: has screens');
  console.assert(hasLegacyData(wellWithOpenHole) === true, 'Test 20c: has openHole');
  console.assert(hasLegacyData(wellEmpty) === false, 'Test 20d: empty legacy');
  console.assert(hasLegacyData(wellNoModel) === false, 'Test 20e: no legacy arrays');
  console.assert(hasLegacyData(null) === false, 'Test 20f: null well');
  console.log('Test 20 passed: hasLegacyData');
}

// Test 21: getEffectiveModelForPDF - prefers designer
{
  const wellData = {
    model: {
      designer: { components: [createComponent('surface_casing', { startDepth: 0, endDepth: 20 })], config: {} },
      pipes: [{ start: 0, end: 100, depth: 100, diameter: 6 }], // Different legacy data
    },
  };
  const result = getEffectiveModelForPDF(wellData);
  console.assert(result.source === 'designer', 'Test 21a: source is designer');
  console.assert(result.legacyModel.pipes.length === 1, 'Test 21b: designer converted to 1 pipe');
  console.assert(result.legacyModel.pipes[0].end === 20, 'Test 21c: designer depths used, not legacy');
  console.log('Test 21 passed: Prefers designer');
}

// Test 22: getEffectiveModelForPDF - falls back to legacy
{
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
  console.assert(result.source === 'legacy', 'Test 22a: source is legacy');
  console.assert(result.legacyModel.pipes.length === 1, 'Test 22b: legacy pipe preserved');
  console.assert(result.legacyModel.screens.length === 1, 'Test 22c: legacy screen preserved');
  console.assert(result.legacyModel.ground === 0, 'Test 22d: ground preserved');
  console.assert(result.legacyModel.mat === 5, 'Test 22e: mat preserved');
  console.log('Test 22 passed: Falls back to legacy');
}

// Test 23: getEffectiveModelForPDF - none
{
  const wellData = { model: { designer: { components: [], config: {} }, pipes: [], screens: [] } };
  const result = getEffectiveModelForPDF(wellData);
  console.assert(result.source === 'none', 'Test 23a: source is none');
  console.assert(result.legacyModel.pipes.length === 0, 'Test 23b: empty pipes');
  console.log('Test 23 passed: No data');
}

// Test 24: groupExtraComponentsForPDF
{
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
  console.assert(groups.gravelPack.length === 1, 'Test 24a: gravelPack grouped');
  console.assert(groups.cementGrouting.length === 1, 'Test 24b: cementGrouting grouped');
  console.assert(groups.wellCap.length === 1, 'Test 24c: wellCap grouped');
  console.assert(groups.submersiblePump.length === 1, 'Test 24d: submersiblePump grouped');
  console.assert(groups.pumpPosition.length === 1, 'Test 24e: pumpPosition grouped');
  console.assert(groups.waterLevelMarker.length === 1, 'Test 24f: waterLevelMarker grouped');
  console.assert(groups.other.length === 1, 'Test 24g: other grouped');
  console.log('Test 24 passed: groupExtraComponentsForPDF');
}

console.log('\n✅ All adapter tests completed!');