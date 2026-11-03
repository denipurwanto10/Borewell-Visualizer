// Phase 4 — Geological Log data model.
// Units: depth in meters. One Geological Log per well, stored in model.geologicalLog.

export const GEOLOGY_VERSION = 1;

export const GEOLOGY_MATERIALS = {
  // Soil
  topsoil: { label: 'Topsoil', category: 'soil', color: '#7c5a3c', pattern: 'topsoil' },
  clay: { label: 'Clay', category: 'soil', color: '#b45309', pattern: 'clay' },
  siltyClay: { label: 'Silty Clay', category: 'soil', color: '#d97706', pattern: 'silty-clay' },
  silt: { label: 'Silt', category: 'soil', color: '#eab308', pattern: 'silt' },
  sandySilt: { label: 'Sandy Silt', category: 'soil', color: '#ca8a04', pattern: 'sandy-silt' },
  fineSand: { label: 'Fine Sand', category: 'soil', color: '#f59e0b', pattern: 'fine-sand' },
  mediumSand: { label: 'Medium Sand', category: 'soil', color: '#d97706', pattern: 'medium-sand' },
  coarseSand: { label: 'Coarse Sand', category: 'soil', color: '#b45309', pattern: 'coarse-sand' },
  gravel: { label: 'Gravel', category: 'soil', color: '#92400e', pattern: 'gravel' },
  sandyGravel: { label: 'Sandy Gravel', category: 'soil', color: '#78350f', pattern: 'sandy-gravel' },
  // Rock
  sandstone: { label: 'Sandstone', category: 'rock', color: '#c2410c', pattern: 'sandstone' },
  limestone: { label: 'Limestone', category: 'rock', color: '#6b7280', pattern: 'limestone' },
  shale: { label: 'Shale', category: 'rock', color: '#374151', pattern: 'shale' },
  mudstone: { label: 'Mudstone', category: 'rock', color: '#4b5563', pattern: 'mudstone' },
  granite: { label: 'Granite', category: 'rock', color: '#9ca3af', pattern: 'granite' },
  basalt: { label: 'Basalt', category: 'rock', color: '#1f2937', pattern: 'basalt' },
  conglomerate: { label: 'Conglomerate', category: 'rock', color: '#78350f', pattern: 'conglomerate' },
  // Other
  weatheredRock: { label: 'Weathered Rock', category: 'other', color: '#a87292', pattern: 'weathered-rock' },
  fracturedRock: { label: 'Fractured Rock', category: 'rock', color: '#4b5563', pattern: 'fractured-rock' },
  fillMaterial: { label: 'Fill Material', category: 'other', color: '#6b7280', pattern: 'fill' },
  unknownMaterial: { label: 'Unknown Material', category: 'other', color: '#9ca3af', pattern: 'unknown' },
};

export const GEOLOGY_CATEGORIES = {
  soil: { label: 'Tanah', color: '#b45309' },
  rock: { label: 'Batu', color: '#374151' },
  other: { label: 'Lainnya', color: '#6b7280' },
};

export function getMaterial(id) {
  return GEOLOGY_MATERIALS[id] || GEOLOGY_MATERIALS.unknownMaterial;
}

export function getMaterialsByCategory() {
  const byCat = {};
  for (const [id, mat] of Object.entries(GEOLOGY_MATERIALS)) {
    if (!byCat[mat.category]) byCat[mat.category] = [];
    byCat[mat.category].push({ id, ...mat });
  }
  return byCat;
}

export function generateId() {
  return `geo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createLayer(overrides = {}) {
  const material = overrides.material || 'clay';
  const mat = getMaterial(material);
  const startDepth = Number.isFinite(Number(overrides.startDepth)) ? Number(overrides.startDepth) : 0;
  const endDepth = Number.isFinite(Number(overrides.endDepth)) ? Number(overrides.endDepth) : 0;
  return {
    id: overrides.id || generateId(),
    name: overrides.name || mat.label,
    material,
    startDepth,
    endDepth,
    description: overrides.description || '',
    formation: overrides.formation || '',
    notes: overrides.notes || '',
    color: overrides.color || mat.color,
    pattern: overrides.pattern || mat.pattern,
  };
}

export function emptyGeology() {
  return {
    version: GEOLOGY_VERSION,
    layers: [],
  };
}

export function normalizeGeology(saved) {
  if (!saved || typeof saved !== 'object') return emptyGeology();
  const version = saved.version === undefined || saved.version === null ? GEOLOGY_VERSION : Number(saved.version) || GEOLOGY_VERSION;
  const rawLayers = Array.isArray(saved.layers) ? saved.layers : [];
  const layers = [];
  const seenIds = new Set();
  for (const raw of rawLayers) {
    const layer = normalizeLayer(raw);
    if (!layer) continue;
    // Drop degenerate / invalid layers (zero or negative thickness) as cleanup.
    if (layer.endDepth <= layer.startDepth) continue;
    // Ensure unique id
    let id = layer.id;
    if (seenIds.has(id)) id = generateId();
    seenIds.add(id);
    layer.id = id;
    layers.push(layer);
  }
  // Sort by start depth then end depth
  layers.sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);
  return { version, layers };
}

export function normalizeLayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startDepth = Number.isFinite(Number(raw.startDepth)) ? Number(raw.startDepth) : 0;
  const endDepth = Number.isFinite(Number(raw.endDepth)) ? Number(raw.endDepth) : 0;
  const material = raw.material && GEOLOGY_MATERIALS[raw.material] ? raw.material : 'unknownMaterial';
  const mat = getMaterial(material);
  return {
    id: raw.id || generateId(),
    name: raw.name || mat.label,
    material,
    startDepth,
    endDepth,
    description: typeof raw.description === 'string' ? raw.description : '',
    formation: typeof raw.formation === 'string' ? raw.formation : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    color: typeof raw.color === 'string' ? raw.color : mat.color,
    pattern: typeof raw.pattern === 'string' ? raw.pattern : mat.pattern,
  };
}

export function totalDepth(layers) {
  let max = 0;
  for (const l of layers || []) {
    const d = l.endDepth || l.startDepth || 0;
    if (d > max) max = d;
  }
  return max;
}

export function layerThickness(layer) {
  return Math.max(0, Number(layer.endDepth || 0) - Number(layer.startDepth || 0));
}
