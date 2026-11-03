// Phase 3 — Canvas renderers for well construction components.
// Organized rendering logic: reusable functions, world-coordinate aware.
// Units: depth (m) → Y pixels, diameter (mm) → X pixels.

import { depthToPixel, mmToPixels } from './geometry.js';
import { INTERVAL_TYPES, MARKER_TYPES, COMPONENT_LABELS } from './model.js';

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function text(ctx, value, x, y, { color = '#1e293b', size = 12, weight = 600, align = 'left', font = 'Hanken Grotesk, system-ui, sans-serif' } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

// Measure text width for label collision avoidance
export function measureTextWidth(value, { size = 12, weight = 600, font = 'Hanken Grotesk, system-ui, sans-serif' } = {}) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${weight} ${size}px ${font}`;
  return ctx.measureText(value).width;
}

// Draw the depth ruler (vertical) on the left side of the plot area
export function drawDepthRuler(ctx, { plotTop, plotBottom, minDepth, maxDepth, rulerX, step }) {
  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rulerX, plotTop);
  ctx.lineTo(rulerX, plotBottom);
  ctx.stroke();

  const firstTick = Math.ceil(minDepth / step) * step;
  for (let value = firstTick; value <= maxDepth + 0.0001; value += step) {
    const y = depthToPixel(value, { plotTop, plotBottom, minDepth, maxDepth });
    const major = Math.abs(value % (step * 2)) < 0.001;
    ctx.strokeStyle = major ? '#475569' : '#94a3b8';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(rulerX, y);
    ctx.lineTo(rulerX + (major ? 16 : 10), y);
    ctx.stroke();
    ctx.font = `${major ? 700 : 600} ${major ? 11 : 10}px Hanken Grotesk, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = major ? '#1e293b' : '#64748b';
    ctx.fillText(`${value} m`, rulerX - 5, y + (major ? 4 : 3.5));
  }
  ctx.restore();
}

// Draw ground level reference line
export function drawGroundLine(ctx, { depthY, plotLeft, plotRight, wellX, casingWidth }) {
  if (depthY == null) return;
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, depthY);
  ctx.lineTo(wellX - casingWidth / 2 - 2, depthY);
  ctx.moveTo(wellX + casingWidth / 2 + 2, depthY);
  ctx.lineTo(plotRight, depthY);
  ctx.stroke();
  ctx.restore();
}

// Draw groundwater (MAT) reference line
export function drawMatLine(ctx, { depthY, plotLeft, plotRight, wellX, casingWidth }) {
  if (depthY == null) return;
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, depthY);
  ctx.lineTo(wellX - casingWidth / 2 - 2, depthY);
  ctx.moveTo(wellX + casingWidth / 2 + 2, depthY);
  ctx.lineTo(plotRight, depthY);
  ctx.stroke();
  ctx.restore();
}

// Draw grid lines (horizontal depth grid)
export function drawGrid(ctx, { plotTop, plotBottom, minDepth, maxDepth, plotLeft, plotRight, step }) {
  ctx.save();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  const firstTick = Math.ceil(minDepth / step) * step;
  for (let value = firstTick; value <= maxDepth + 0.0001; value += step) {
    const y = depthToPixel(value, { plotTop, plotBottom, minDepth, maxDepth });
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Compute casing column width from diameter (mm → px) with clamping
export function casingWidthPx(outerDiameterMm, wellAxisPx, pxPerMm, { min = 34, max = 62 } = {}) {
  const w = Math.max(min, Math.min(max, outerDiameterMm * pxPerMm * 0.5));
  return w;
}

// Render a single interval component (casing, screen, open hole, gravel pack, cement)
// Returns a hit-test bounding box {x, y, width, height, type, id, ...}
export function renderIntervalComponent(ctx, comp, {
  plotTop, plotBottom, minDepth, maxDepth,
  wellAxisPx, pxPerMm, casingWidthOverride,
}) {
  const y = depthToPixel(comp.startDepth, { plotTop, plotBottom, minDepth, maxDepth });
  const endY = depthToPixel(comp.endDepth, { plotTop, plotBottom, minDepth, maxDepth });
  const h = Math.max(2, endY - y);

  const od = comp.outerDiameter || 0;
  const id = comp.innerDiameter || 0;
  const casingW = casingWidthOverride !== undefined ? casingWidthOverride : casingWidthPx(od, wellAxisPx, pxPerMm);
  const x = wellAxisPx - casingW / 2;

  // Outer wall (metal/gradient)
  const wallGrad = ctx.createLinearGradient(x, 0, x + casingW, 0);
  wallGrad.addColorStop(0, '#475569');
  wallGrad.addColorStop(0.3, '#cbd5e1');
  wallGrad.addColorStop(0.5, '#f1f5f9');
  wallGrad.addColorStop(0.7, '#94a3b8');
  wallGrad.addColorStop(1, '#334155');

  // Override wall color based on type
  let fillStyle;
  if (comp.type === 'screen_pipe') fillStyle = '#b45309';
  else if (comp.type === 'open_hole') fillStyle = '#7c5a3c';
  else if (comp.type === 'gravel_pack') fillStyle = '#d97706';
  else if (comp.type === 'cement_grouting') fillStyle = '#e2e8f0';
  else fillStyle = wallGrad;

  ctx.save();
  roundRect(ctx, x, y, casingW, h, 3);
  if (fillStyle instanceof CanvasGradient) {
    ctx.fillStyle = fillStyle;
  } else {
    ctx.fillStyle = fillStyle;
  }
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Inner diameter wall (if different from outer)
  if (id && id > 0 && id < od) {
    const innerW = Math.max(2, id * pxPerMm * 0.5);
    const innerX = wellAxisPx - innerW / 2;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(innerX, y + 1, innerW, Math.max(1, h - 2));
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(innerX, y + 1, innerW, Math.max(1, h - 2));
  }

  // Perforation dots for screen
  if (comp.type === 'screen_pipe') {
    ctx.save();
    roundRect(ctx, x + 2, y + 2, casingW - 4, h - 4, 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(69,26,3,.55)';
    const dotSpacing = 8;
    for (let py = y + 5; py < y + h - 5; py += dotSpacing) {
      for (let px = x + 5; px < x + casingW - 5; px += dotSpacing) {
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Connection rings at top/bottom
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, casingW, 3);
  if (h > 8) ctx.fillRect(x, y + h - 3, casingW, 3);

  ctx.restore();

  return {
    type: comp.type, id: comp.id, name: comp.name,
    x: x - 4, y, width: casingW + 8, height: h,
    startDepth: comp.startDepth, endDepth: comp.endDepth,
    outerDiameter: comp.outerDiameter, innerDiameter: comp.innerDiameter,
    material: comp.material, color: comp.color,
    detail: `${comp.startDepth} – ${comp.endDepth} m · OD ${comp.outerDiameter} mm · ID ${comp.innerDiameter || '—'} mm`,
  };
}

// Render a marker component (well cap, pump, pump position, water level marker)
export function renderMarkerComponent(ctx, comp, {
  plotTop, plotBottom, minDepth, maxDepth,
  wellAxisPx, pxPerMm,
}) {
  const y = depthToPixel(comp.startDepth, { plotTop, plotBottom, minDepth, maxDepth });
  const h = Math.max(18, 24);
  const w = Math.max(28, 40);
  const x = wellAxisPx - w / 2;

  let fillStyle, strokeStyle, iconLabel;
  if (comp.type === 'well_cap') { fillStyle = '#1e293b'; strokeStyle = '#0f172a'; iconLabel = '▣'; }
  else if (comp.type === 'submersible_pump') { fillStyle = '#3b82f6'; strokeStyle = '#1d4ed8'; iconLabel = '↻'; }
  else if (comp.type === 'pump_position') { fillStyle = '#2563eb'; strokeStyle = '#1e40af'; iconLabel = '●'; }
  else if (comp.type === 'water_level_marker') { fillStyle = '#0891b2'; strokeStyle = '#0c7499'; iconLabel = '▲'; }
  else { fillStyle = '#64748b'; strokeStyle = '#475569'; iconLabel = '◆'; }

  ctx.save();
  roundRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Center marker dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(wellAxisPx, y + h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  return {
    type: comp.type, id: comp.id, name: comp.name,
    x: x - 4, y: y - 4, width: w + 8, height: h + 8,
    startDepth: comp.startDepth, endDepth: comp.startDepth,
    outerDiameter: comp.outerDiameter, innerDiameter: comp.innerDiameter,
    material: comp.material, color: comp.color,
    detail: `Kedalaman ${comp.startDepth} m · ${comp.material}`,
  };
}

// Render all visible components. Returns hit-test boxes array.
export function renderComponents(ctx, components, {
  plotTop, plotBottom, minDepth, maxDepth,
  wellAxisPx, pxPerMm, casingWidthOverride,
}) {
  const boxes = [];
  // Render by zOrder ascending (lower first = drawn first, on bottom)
  const ordered = [...components].filter(c => c.visible).sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0));
  for (const comp of ordered) {
    const box = INTERVAL_TYPES.has(comp.type)
      ? renderIntervalComponent(ctx, comp, { plotTop, plotBottom, minDepth, maxDepth, wellAxisPx, pxPerMm, casingWidthOverride })
      : renderMarkerComponent(ctx, comp, { plotTop, plotBottom, minDepth, maxDepth, wellAxisPx, pxPerMm });
    boxes.push(box);
  }
  return boxes;
}

// Draw a selection highlight ring around a component hit box
export function drawSelection(ctx, box) {
  ctx.save();
  ctx.strokeStyle = '#0d5f5a';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(box.x - 2, box.y - 2, box.width + 4, box.height + 4);
  ctx.restore();
}

// Draw component label to the right of the well with a leader line
export function drawComponentLabel(ctx, box, { labelX, centerY, maxLabelWidth }) {
  const label = box.name || COMPONENT_LABELS[box.type] || 'Komponen';
  const depthText = `${box.startDepth} – ${box.endDepth} m`;
  ctx.save();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(box.x + box.width, centerY);
  ctx.lineTo(labelX, centerY);
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 11px Hanken Grotesk, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, labelX, centerY);

  ctx.fillStyle = '#64748b';
  ctx.font = '10px Hanken Grotesk, system-ui, sans-serif';
  ctx.fillText(depthText, labelX, centerY + 13);
  ctx.restore();
}
