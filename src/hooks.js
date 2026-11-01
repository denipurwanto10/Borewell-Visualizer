import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITY_KEYS, EMPTY_MODEL, INITIAL_WELL, formatNumber, makeEmptyActivity, pipeBottom, totalDepth, totalPipeLength } from './model';

const STORAGE_KEY = 'visualisasi-pipa-sumur-bor:v2';

const normalizeActivity = (value) => {
  const base = makeEmptyActivity();
  if (!value || typeof value !== 'object') return base;
  for (const key of ACTIVITY_KEYS) {
    const items = Array.isArray(value[key]) ? value[key] : [];
    base[key] = items
      .filter((item) => item && (item.dataUrl || item.preview))
      .slice(0, 3)
      .map((item, index) => ({
        id: item.id ?? `${key}-${index}-${Date.now()}`,
        name: item.name || `Foto ${index + 1}`,
        dataUrl: item.dataUrl || item.preview || '',
        createdAt: item.createdAt || item.timestamp || new Date().toISOString(),
      }));
  }
  return base;
};

const normalizeModel = (value) => {
  if (!value || typeof value !== 'object') return { ...EMPTY_MODEL, pipes: [], screens: [] };
  const pipes = Array.isArray(value.pipes)
    ? value.pipes
        .map((pipe) => ({
          id: pipe.id ?? `${pipe.start}-${pipe.end}-${pipe.diameter}`,
          start: Number(pipe.start),
          end: Number(pipe.end),
          depth: Number(pipe.depth ?? (Number(pipe.end) - Number(pipe.start))),
          diameter: Number(pipe.diameter),
        }))
        .filter((pipe) => Number.isFinite(pipe.start) && Number.isFinite(pipe.end) && Number.isFinite(pipe.depth) && Number.isFinite(pipe.diameter))
        .sort((a, b) => a.start - b.start)
    : [];
  const screens = Array.isArray(value.screens)
    ? value.screens
        .map((screen, index) => ({
          id: screen.id ?? `screen-${index}`,
          depth: Number(screen.depth),
          size: Number(screen.size),
        }))
        .filter((screen) => Number.isFinite(screen.depth) && Number.isFinite(screen.size))
        .sort((a, b) => a.depth - b.depth)
    : [];
  const ground = value.ground === null || value.ground === undefined || value.ground === '' ? null : Number(value.ground);
  const mat = value.mat === null || value.mat === undefined || value.mat === '' ? null : Number(value.mat);
  return {
    pipes,
    screens,
    ground: Number.isFinite(ground) ? ground : null,
    mat: Number.isFinite(mat) ? mat : null,
    openHole: value.openHole && Number.isFinite(Number(value.openHole.end)) ? {
      start: Number(value.openHole.start),
      end: Number(value.openHole.end),
      size: Number(value.openHole.size),
    } : null,
  };
};

export function useBoreholeState() {
  const [model, setModel] = useState(() => ({ ...EMPTY_MODEL, pipes: [], screens: [] }));
  const [well, setWell] = useState(() => ({ ...INITIAL_WELL, boreholeImages: {} }));
  const [activity, setActivity] = useState(() => makeEmptyActivity());
  const [page, setPage] = useState('page1');
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const legacy = JSON.parse(localStorage.getItem('wellData') || 'null');
      if (saved?.model) setModel(normalizeModel(saved.model));
      if (saved?.well) setWell({ ...INITIAL_WELL, ...saved.well, boreholeImages: saved.well.boreholeImages || {} });
      if (saved?.activity) setActivity(normalizeActivity(saved.activity));
      else if (legacy?.activityImages) setActivity(normalizeActivity(legacy.activityImages));
      if (!saved?.well && legacy) {
        setWell({
          ...INITIAL_WELL,
          companyName: legacy.companyName || '',
          shallowWellNumber: legacy.shallowWellNumber || '',
          address: legacy.address || '',
          province: legacy.province || '',
          latitude: legacy.latitude || '',
          longitude: legacy.longitude || '',
          elevation: legacy.elevation || '',
          city: legacy.city || '',
          district: legacy.district || '',
          village: legacy.village || '',
          boreholeDate: legacy.boreholeDate || '',
          wellNumber: legacy.wellNumber || '',
          piezoDistance: legacy.piezoDistance || '',
          pumpType: legacy.pumpType || '',
          pumpPosition: legacy.pumpPosition || '',
          boreholeImages: legacy.boreholeImages || {},
        });
      }
    } catch {
      // Start with a clean state when storage is unavailable or corrupted.
    }
  }, []);

  const notify = useCallback((message, type = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, type });
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const persist = useCallback((nextModel, nextWell, nextActivity) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: nextModel, well: nextWell, activity: nextActivity }));
    } catch {
      // Storage quota or privacy mode: keep working in memory.
    }
  }, []);

  const summary = useMemo(() => ({
    pipeTotal: formatNumber(totalPipeLength(model)),
    currentDepth: formatNumber(pipeBottom(model)),
    wellDepth: formatNumber(totalDepth(model)),
    pipeCount: model.pipes.length,
    screenCount: model.screens.length,
  }), [model]);

  return {
    model, setModel, well, setWell, activity, setActivity,
    page, setPage, toast, setToast, notify, persist, summary,
  };
}

export function readImageFile(file, maxMb = 5) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) reject(new Error('Hanya file gambar yang diperbolehkan'));
    else if (file.size > maxMb * 1024 * 1024) reject(new Error(`Ukuran file maksimal ${maxMb}MB`));
    else {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal membaca gambar'));
      reader.readAsDataURL(file);
    }
  });
}
