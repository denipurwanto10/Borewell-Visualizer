// Phase 3 — Geometry & depth/pixel conversion for the Well Designer.
// World coordinate system: depth in meters (Y, positive downward), radius/X in millimeters.
// Separates engineering depth coordinates from screen pixels.

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

// Millimeters (radius/diameter) → screen pixels (X) using a pixels-per-mm scale.
export function mmToPixels(mm, pixelsPerMm) {
  return mm * pixelsPerMm;
}

// Screen pixels (X) → millimeters.
export function pixelsToMm(px, pixelsPerMm) {
  return px / pixelsPerMm;
}

// Compute a proportional depth scale for a canvas given component depths and config.
export function computeDepthScale(components, config, { plotTop, plotBottom, minDepth = 0 }) {
  let maxDepth = minDepth;
  for (const c of components || []) {
    if (!c.visible) continue;
    const d = c.endDepth !== undefined ? c.endDepth : c.startDepth;
    if (Number.isFinite(d) && d > maxDepth) maxDepth = d;
  }
  // Also consider configured depths
  if (config?.groundLevel !== null && config?.groundLevel !== undefined && Number.isFinite(config.groundLevel)) {
    if (config.groundLevel > maxDepth) maxDepth = config.groundLevel;
  }
  if (config?.matLevel !== null && config?.matLevel !== undefined && Number.isFinite(config.matLevel)) {
    const absMat = config.groundLevel !== null ? config.groundLevel + config.matLevel : config.matLevel;
    if (Number.isFinite(absMat) && absMat > maxDepth) maxDepth = absMat;
  }
  // Ensure a minimum range so the ruler is meaningful
  if (maxDepth <= minDepth) maxDepth = minDepth + 10;
  const range = maxDepth - minDepth || 1;
  const scale = (plotBottom - plotTop) / range;
  return { minDepth, maxDepth, range, scale };
}

// Choose a nice tick step for the depth ruler based on range.
export function rulerTickStep(range) {
  if (range > 500) return 50;
  if (range > 200) return 20;
  if (range > 100) return 10;
  return 5;
}

// World X position for a component radius/diameter, centered on the well axis.
export function componentX(worldXmm, wellAxisPx, pixelsPerMm) {
  return wellAxisPx + worldXmm * pixelsPerMm;
}
