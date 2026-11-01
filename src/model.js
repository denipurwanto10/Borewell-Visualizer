export const EMPTY_MODEL = {
  pipes: [],
  ground: null,
  mat: null,
  screens: [],
  openHole: null,
};

export const INITIAL_WELL = {
  companyName: '',
  shallowWellNumber: '',
  address: '',
  province: '',
  latitude: '',
  longitude: '',
  elevation: '',
  city: '',
  district: '',
  village: '',
  boreholeDate: '',
  wellNumber: '',
  piezoDistance: '',
  pumpType: '',
  pumpPosition: '',
  boreholeImages: {},
};

export const ACTIVITY_KEYS = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5', 'doc6'];

export const PROVINCES = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi',
  'Sumatera Selatan', 'Bangka Belitung', 'Bengkulu', 'Lampung', 'Banten', 'DKI Jakarta',
  'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Bali',
  'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat',
  'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan', 'Sulawesi Tenggara',
  'Gorontalo', 'Sulawesi Barat', 'Maluku', 'Maluku Utara', 'Papua', 'Papua Barat',
  'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan', 'Papua Barat Daya',
];

export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return String(Number(number.toFixed(2)));
}

export function makeEmptyActivity() {
  return Object.fromEntries(ACTIVITY_KEYS.map((key) => [key, []]));
}

export function totalPipeLength(model) {
  return model.pipes.reduce((sum, pipe) => sum + (pipe.end - pipe.start), 0);
}

export function pipeBottom(model) {
  return model.pipes.length ? model.pipes[model.pipes.length - 1].end : 0;
}

export function totalDepth(model) {
  return model.openHole?.end ?? pipeBottom(model);
}

export function depthLabel(value) {
  if (value === null || value === undefined) return 'Belum diatur';
  return `${formatNumber(value)} m`;
}

export function relativeDepth(model, value) {
  if (value === null || value === undefined) return '—';
  if (model.ground === null) return `${formatNumber(value)} m absolut`;
  return `${formatNumber(value - model.ground)} m dari tanah`;
}
