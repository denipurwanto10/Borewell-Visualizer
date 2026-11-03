// Phase 4 — Geometry & depth/pixel conversion for Geological Log visualization.

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

// Compute a proportional depth scale for the geological log column given layers and well depth.
export function computeDepthScale(layers, wellDepthMeters, { plotTop, plotBottom, minDepth = 0 }) {
  let maxDepth = minDepth;
  for (const l of layers || []) {
    const d = Number(l.endDepth) || Number(l.startDepth) || 0;
    if (Number.isFinite(d) && d > maxDepth) maxDepth = d;
  }
  if (wellDepthMeters > 0 && wellDepthMeters > maxDepth) maxDepth = wellDepthMeters;
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

// Minimum pixel height to render a layer so thin layers stay visible without
// changing the underlying data value.
export const MIN_LAYER_PX = 1.5;

export function layerPixelHeight(startDepth, endDepth, { plotTop, plotBottom, minDepth, maxDepth }) {
  const topY = depthToPixel(startDepth, { plotTop, plotBottom, minDepth, maxDepth });
  const bottomY = depthToPixel(endDepth, { plotTop, plotBottom, minDepth, maxDepth });
  let h = bottomY - topY;
  if (h < MIN_LAYER_PX && endDepth > startDepth) h = MIN_LAYER_PX;
  return h;
}
