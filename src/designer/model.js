// Phase 3 — Advanced Well Designer data model
// Engineering well construction components with type-specific properties.
// Units: depth in meters, diameter in millimeters.

export const DESIGNER_VERSION = 1;

// Component categories
export const COMPONENT_CATEGORIES = {
  casing: {
    label: 'Casing',
    types: ['surface_casing', 'production_casing', 'blank_casing'],
  },
  filter: {
    label: 'Filter & Formasi',
    types: ['screen_pipe', 'open_hole', 'gravel_pack'],
  },
  protection: {
    label: 'Proteksi',
    types: ['cement_grouting', 'well_cap'],
  },
  equipment: {
    label: 'Peralatan',
    types: ['submersible_pump', 'pump_position', 'water_level_marker'],
  },
};

// Human-readable labels per component type
export const COMPONENT_LABELS = {
  surface_casing: 'Casing Permukaan',
  production_casing: 'Casing Produksi',
  blank_casing: 'Casing Kosong',
  screen_pipe: 'Pipa Saring',
  open_hole: 'Lubang Terbuka',
  gravel_pack: 'Pasir Filter',
  cement_grouting: 'Semen Rekat',
  well_cap: 'Tutup Sumur',
  submersible_pump: 'Pompa Sumur',
  pump_position: 'Posisi Pompa',
  water_level_marker: 'Pemarkah Air',
};

// Components that represent a depth interval (have start + end depth)
export const INTERVAL_TYPES = new Set([
  'surface_casing', 'production_casing', 'blank_casing',
  'screen_pipe', 'open_hole', 'gravel_pack', 'cement_grouting',
]);

// Components that are point-like / marker (single depth)
export const MARKER_TYPES = new Set([
  'well_cap', 'submersible_pump', 'pump_position', 'water_level_marker',
]);

// Component type → category
export function componentCategory(type) {
  for (const [key, cat] of Object.entries(COMPONENT_CATEGORIES)) {
    if (cat.types.includes(type)) return key;
  }
  return null;
}

// Default properties for each component type
export const COMPONENT_DEFAULTS = {
  surface_casing: {
    name: 'Casing Permukaan',
    outerDiameter: 200, innerDiameter: 180, material: 'PVC', color: '#475569',
  },
  production_casing: {
    name: 'Casing Produksi',
    outerDiameter: 150, innerDiameter: 130, material: 'PVC', color: '#475569',
  },
  blank_casing: {
    name: 'Casing Kosong',
    outerDiameter: 150, innerDiameter: 130, material: 'PVC', color: '#64748b',
  },
  screen_pipe: {
    name: 'Pipa Saring',
    outerDiameter: 150, innerDiameter: 130, material: 'PVC', color: '#b45309',
  },
  open_hole: {
    name: 'Lubang Terbuka',
    outerDiameter: 200, innerDiameter: 200, material: 'Batu', color: '#7c5a3c',
  },
  gravel_pack: {
    name: 'Pasir Filter',
    outerDiameter: 250, innerDiameter: 200, material: 'Pasir', color: '#d97706',
  },
  cement_grouting: {
    name: 'Semen Rekat',
    outerDiameter: 250, innerDiameter: 200, material: 'Semen', color: '#e2e8f0',
  },
  well_cap: {
    name: 'Tutup Sumur',
    outerDiameter: 200, innerDiameter: null, material: 'Baja', color: '#1e293b',
  },
  submersible_pump: {
    name: 'Pompa Sumur',
    outerDiameter: 100, innerDiameter: null, material: 'Baja', color: '#3b82f6',
  },
  pump_position: {
    name: 'Posisi Pompa',
    outerDiameter: null, innerDiameter: null, material: '—', color: '#2563eb',
  },
  water_level_marker: {
    name: 'Pemarkah Air',
    outerDiameter: null, innerDiameter: null, material: '—', color: '#0891b2',
  },
};

// Generate a stable unique id
export function generateId() {
  return `comp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Create a new component with type-specific defaults, merged with overrides
export function createComponent(type, overrides = {}) {
  const defaults = COMPONENT_DEFAULTS[type] || {};
  const isInterval = INTERVAL_TYPES.has(type);
  const base = {
    id: overrides.id || generateId(),
    type,
    name: overrides.name || defaults.name || 'Komponen',
    startDepth: overrides.startDepth !== undefined ? Number(overrides.startDepth) : 0,
    endDepth: isInterval ? (overrides.endDepth !== undefined ? Number(overrides.endDepth) : 0) : 0,
    length: 0,
    outerDiameter: overrides.outerDiameter !== undefined ? overrides.outerDiameter : defaults.outerDiameter,
    innerDiameter: overrides.innerDiameter !== undefined ? overrides.innerDiameter : defaults.innerDiameter,
    material: overrides.material || defaults.material || '—',
    color: overrides.color || defaults.color || '#64748b',
    description: overrides.description || '',
    visible: overrides.visible !== undefined ? overrides.visible : true,
    zOrder: overrides.zOrder !== undefined ? overrides.zOrder : 0,
  };
  // Calculate length from start/end depth for intervals
  if (isInterval) {
    base.length = Math.max(0, base.endDepth - base.startDepth);
  }
  return base;
}

// Clone a component deeply
export function cloneComponent(component) {
  return { ...component };
}

// Calculate total well depth from components (max end depth)
export function totalWellDepth(components) {
  let max = 0;
  for (const c of components || []) {
    const d = c.endDepth || c.startDepth || 0;
    if (d > max) max = d;
  }
  return max;
}

// Empty designer state
export function emptyDesigner() {
  return {
    version: DESIGNER_VERSION,
    components: [],
    config: {
      totalWellDepth: 0,
      groundLevel: null,
      matLevel: null,
    },
  };
}

// Merge a saved designer state, filling defaults and fixing malformed data
export function normalizeDesigner(saved) {
  if (!saved || typeof saved !== 'object') return emptyDesigner();
  const components = Array.isArray(saved.components)
    ? saved.components.map(c => normalizeComponent(c)).filter(Boolean)
    : [];
  const config = {
    totalWellDepth: Number.isFinite(Number(saved.config?.totalWellDepth)) ? Number(saved.config.totalWellDepth) : 0,
    groundLevel: saved.config?.groundLevel === null || saved.config?.groundLevel === undefined ? null : Number(saved.config.groundLevel) || null,
    matLevel: saved.config?.matLevel === null || saved.config?.matLevel === undefined ? null : Number(saved.config.matLevel) || null,
  };
  return { version: saved.version || DESIGNER_VERSION, components, config };
}

function normalizeComponent(c) {
  if (!c || typeof c !== 'object' || !c.type) return null;
  const defaults = COMPONENT_DEFAULTS[c.type] || {};
  const isInterval = INTERVAL_TYPES.has(c.type);
  const startDepth = Number.isFinite(Number(c.startDepth)) ? Number(c.startDepth) : 0;
  const endDepth = Number.isFinite(Number(c.endDepth)) ? Number(c.endDepth) : 0;
  const outerDiameter = Number.isFinite(Number(c.outerDiameter)) ? Number(c.outerDiameter) : (defaults.outerDiameter || 0);
  const innerDiameter = c.innerDiameter === null || c.innerDiameter === undefined
    ? (defaults.innerDiameter === null ? null : Number(c.innerDiameter) || null)
    : Number(c.innerDiameter);
  return {
    id: c.id || generateId(),
    type: c.type,
    name: c.name || defaults.name || 'Komponen',
    startDepth,
    endDepth,
    length: isInterval ? Math.max(0, endDepth - startDepth) : 0,
    outerDiameter,
    innerDiameter,
    material: c.material || defaults.material || '—',
    color: c.color || defaults.color || '#64748b',
    description: c.description || '',
    visible: c.visible !== undefined ? Boolean(c.visible) : true,
    zOrder: Number.isFinite(Number(c.zOrder)) ? Number(c.zOrder) : 0,
  };
}
