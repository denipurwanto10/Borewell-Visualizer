// Phase 5 — Geometry & depth/pixel conversion for Hydrograph visualization.

// Depth → screen pixel (Y) within a plot area.
export function depthToPixel(depth, { plotTop, plotBottom, minDepth, maxDepth }) {
  const range = maxDepth - minDepth || 1;
  const scale = (plotBottom - plotTop) / range;
  return plotTop + (depth - minDepth) * scale;
}

// Screen pixel (Y) → depth in meters.
export function pixelToDepth(pixel, { plotTop, plotBottom, minDepth, maxDepth }) {
  const range = maxDepth - minDepth || 1;
  const scale = (plotBottom - plotTop) / range;
  return minDepth + (pixel - plotTop) / scale;
}

// Time → screen pixel (X) within a plot area.
export function timeToPixel(date, { plotLeft, plotRight, minTime, maxTime }) {
  const range = maxTime - minTime || 1;
  const scale = (plotRight - plotLeft) / range;
  return plotLeft + (date.getTime() - minTime) * scale;
}

// Screen pixel (X) → time.
export function pixelToTime(pixel, { plotLeft, plotRight, minTime, maxTime }) {
  const range = maxTime - minTime || 1;
  const scale = (plotRight - plotLeft) / range;
  return new Date(minTime + (pixel - plotLeft) / scale);
}

// Compute a proportional scale for the hydrograph given measurements and well depth.
export function computeHydrographScale(measurements, wellDepthMeters, { plotTop, plotBottom, plotLeft, plotRight, minDepth = 0 }) {
  let maxDepth = minDepth;
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const m of measurements || []) {
    const d = Number(m.waterLevelDepth) || 0;
    if (Number.isFinite(d) && d > maxDepth) maxDepth = d;
    const t = new Date(m.measuredAt).getTime();
    if (Number.isFinite(t)) {
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }
  }

  if (wellDepthMeters > 0 && wellDepthMeters > maxDepth) maxDepth = wellDepthMeters;
  // Ensure a minimum range so the ruler is meaningful
  if (maxDepth <= minDepth) maxDepth = minDepth + 10;

  // Ensure time range is meaningful
  if (minTime === Infinity || maxTime === -Infinity) {
    const now = Date.now();
    minTime = now - 86400000; // 1 day ago
    maxTime = now;
  }
  if (maxTime <= minTime) maxTime = minTime + 86400000;

  const depthRange = maxDepth - minDepth || 1;
  const timeRange = maxTime - minTime || 1;
  const depthScale = (plotBottom - plotTop) / depthRange;
  const timeScale = (plotRight - plotLeft) / timeRange;

  return { minDepth, maxDepth, depthRange, depthScale, minTime, maxTime, timeRange, timeScale };
}

// Choose a nice tick step for the depth ruler based on range.
export function depthRulerTickStep(range) {
  if (range > 500) return 50;
  if (range > 200) return 20;
  if (range > 100) return 10;
  if (range > 50) return 5;
  if (range > 20) return 2;
  if (range > 10) return 1;
  return 0.5;
}

// Choose a nice tick step for the time axis based on range in milliseconds.
export function timeAxisTickStep(rangeMs) {
  const day = 86400000;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (rangeMs > 5 * year) return { step: year, format: d => d.getFullYear().toString() };
  if (rangeMs > year) return { step: month, format: d => d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) };
  if (rangeMs > 3 * month) return { step: month, format: d => d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) };
  if (rangeMs > month) return { step: week, format: d => d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) };
  if (rangeMs > week) return { step: day, format: d => d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) };
  if (rangeMs > day) return { step: day, format: d => d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) };
  return { step: 6 * 3600000, format: d => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) };
}

// Minimum pixel height to render a data point so thin layers stay visible.
export const MIN_POINT_PX = 3;

export function pointRadius({ plotTop, plotBottom, minDepth, maxDepth }) {
  const range = maxDepth - minDepth || 1;
  const scale = (plotBottom - plotTop) / range;
  return Math.max(3, Math.min(6, 4 * scale));
}