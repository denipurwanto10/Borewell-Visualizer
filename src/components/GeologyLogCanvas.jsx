// Phase 4 — Geological Log canvas visualization (vertical borehole log column).
import { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  depthToPixel, pixelToDepth, computeDepthScale, rulerTickStep, layerPixelHeight,
} from '../geology/geometry';
import { getMaterial } from '../geology/model';

const DEFAULT_WIDTH = 340;
const DEFAULT_HEIGHT = 640;
const MIN_DEPTH = 0;
const RULER_WIDTH = 70;
const COLUMN_WIDTH = 140;
const MARGIN_RIGHT = 30;

// Pattern SVG definitions (drawn once per canvas)
function drawPatterns(ctx) {
  // Patterns are drawn directly per-layer using canvas primitives.
}

function drawRuler(ctx, { plotTop, plotBottom, minDepth, maxDepth, step }) {
  ctx.save();
  ctx.strokeStyle = '#98a29e';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(RULER_WIDTH - 10, plotTop);
  ctx.lineTo(RULER_WIDTH - 10, plotBottom);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const firstTick = Math.ceil(minDepth / step) * step;
  for (let value = firstTick; value <= maxDepth + 0.001; value += step) {
    const py = depthToPixel(value, { plotTop, plotBottom, minDepth, maxDepth });
    const major = value % (step * 2) === 0;
    ctx.strokeStyle = major ? '#1e293b' : '#98a29e';
    ctx.lineWidth = major ? 0.6 : 0.3;
    ctx.beginPath();
    ctx.moveTo(RULER_WIDTH - 10, py);
    ctx.lineTo(RULER_WIDTH - (major ? 6 : 3), py);
    ctx.stroke();
    ctx.font = major ? 'bold 7px var(--mono)' : '6px var(--mono)';
    ctx.fillStyle = major ? '#1f2937' : '#6b7773';
    ctx.fillText(`${Number(value).toFixed(1)} m`, RULER_WIDTH - 14, py + 1);
  }
  ctx.restore();
}

function drawDepthLabels(ctx, layers, scale, { plotTop, plotBottom, minDepth, maxDepth }) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '6.5px var(--mono)';
  ctx.fillStyle = '#6b7773';
  const drawn = [];
  for (const l of layers) {
    const s = Number(l.startDepth) || 0;
    const e = Number(l.endDepth) || 0;
    for (const [depth, label] of [[s, `${Number(s).toFixed(1)}`], [e, `${Number(e).toFixed(1)}`]]) {
      if (!Number.isFinite(depth)) continue;
      const key = depth.toFixed(2);
      if (drawn.includes(key)) continue;
      drawn.push(key);
      const py = depthToPixel(depth, { plotTop, plotBottom, minDepth, maxDepth });
      if (py < plotTop - 4 || py > plotBottom + 4) continue;
      ctx.fillText(label, RULER_WIDTH + COLUMN_WIDTH + 6, py);
    }
  }
  ctx.restore();
}

export default function GeologyLogCanvas({ layers = [], wellDepth = 0, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, selectedId = null, onSelect }) {
  const canvasRef = useRef(null);

  const scale = useMemo(() => computeDepthScale(layers, wellDepth, {
    plotTop: 40, plotBottom: height - 30, minDepth: MIN_DEPTH,
  }), [layers, wellDepth, height]);

  const { plotTop, plotBottom, minDepth, maxDepth } = scale;
  const step = rulerTickStep(maxDepth - minDepth);

  // Draw on mount & whenever data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Column bounds
    const colLeft = RULER_WIDTH;
    const colRight = RULER_WIDTH + COLUMN_WIDTH;

    // Title
    ctx.save();
    ctx.font = 'bold 12px var(--font)';
    ctx.fillStyle = '#15201e';
    ctx.textAlign = 'center';
    ctx.fillText('LOG GEOLOGI', colLeft + COLUMN_WIDTH / 2, 20);
    ctx.restore();

    // Depth ruler
    drawRuler(ctx, { plotTop, plotBottom, minDepth, maxDepth, step });

    // Layer column background
    ctx.save();
    ctx.strokeStyle = '#dedacf';
    ctx.lineWidth = 1;
    ctx.strokeRect(colLeft, plotTop, COLUMN_WIDTH, plotBottom - plotTop);
    ctx.restore();

    if (layers.length === 0) {
      // Empty state text
      ctx.save();
      ctx.font = '12px var(--font)';
      ctx.fillStyle = '#98a29e';
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada lapisan geologi', colLeft + COLUMN_WIDTH / 2, plotTop + (plotBottom - plotTop) / 2);
      ctx.restore();
    } else {
      // Draw each layer
      for (const l of layers) {
        const s = Number(l.startDepth) || 0;
        const e = Number(l.endDepth) || 0;
        if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
        const py = depthToPixel(s, { plotTop, plotBottom, minDepth, maxDepth });
        const h = layerPixelHeight(s, e, scale);
        const selected = l.id === selectedId;

        // Fill color
        ctx.save();
        ctx.fillStyle = l.color || '#9ca3af';
        ctx.globalAlpha = selected ? 0.9 : 0.65;
        ctx.fillRect(colLeft + 1, py, COLUMN_WIDTH - 2, h);
        ctx.globalAlpha = 1;

        // Border
        ctx.strokeStyle = selected ? '#0d5f5a' : '#34423f';
        ctx.lineWidth = selected ? 2 : 0.5;
        ctx.strokeRect(colLeft + 1, py, COLUMN_WIDTH - 2, h);

        // Pattern overlay
        drawPatternOverlay(ctx, l.pattern, colLeft + 1, py, COLUMN_WIDTH - 2, h, selected);

        // Material label (centered if thick enough)
        const mat = getMaterial(l.material);
        const labelY = py + h / 2;
        if (h > 16) {
          ctx.save();
          ctx.fillStyle = selected ? '#fff' : '#1f2937';
          ctx.font = 'bold 9px var(--font)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(l.name || mat.label, colLeft + COLUMN_WIDTH / 2, labelY);
          if (h > 24) {
            ctx.font = '7px var(--mono)';
            ctx.fillStyle = selected ? '#e5e7eb' : '#6b7773';
            ctx.fillText(`${Number(s).toFixed(1)}–${Number(e).toFixed(1)} m`, colLeft + COLUMN_WIDTH / 2, labelY + 8);
          }
          ctx.restore();
        }

        ctx.restore();
      }
    }

    // Depth labels on right side
    drawDepthLabels(ctx, layers, scale, { plotTop, plotBottom, minDepth, maxDepth });

    // Well depth reference line (if set)
    if (wellDepth > 0) {
      const wy = depthToPixel(wellDepth, { plotTop, plotBottom, minDepth, maxDepth });
      if (wy >= plotTop && wy <= plotBottom) {
        ctx.save();
        ctx.strokeStyle = '#b03a2e';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(colLeft, wy);
        ctx.lineTo(colRight, wy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 7px var(--mono)';
        ctx.fillStyle = '#b03a2e';
        ctx.textAlign = 'right';
        ctx.fillText(`Sumur: ${wellDepth.toFixed(1)} m`, colLeft - 6, wy - 3);
        ctx.restore();
      }
    }

    // Bottom axis
    ctx.save();
    ctx.strokeStyle = '#98a29e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colLeft, plotBottom);
    ctx.lineTo(colRight, plotBottom);
    ctx.stroke();
    ctx.restore();
  }, [layers, wellDepth, width, height, plotTop, plotBottom, minDepth, maxDepth, step, selectedId, scale]);

  // Click to select layer
  const handleClick = useCallback((e) => {
    if (!onSelect) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const py = e.clientY - rect.top;
    // convert to depth
    const depth = pixelToDepth(py, { plotTop, plotBottom, minDepth, maxDepth });
    const hit = (layers || [])
      .slice()
      .sort((a, b) => a.startDepth - b.startDepth)
      .find((l) => {
        const s = Number(l.startDepth) || 0;
        const e = Number(l.endDepth) || 0;
        return depth >= s && depth <= e;
      });
    onSelect(hit ? hit.id : null);
  }, [layers, plotTop, plotBottom, minDepth, maxDepth, onSelect]);

  return (
    <div className="geology-canvas-wrap" style={{ width, height, display: 'grid', placeItems: 'center' }}>
      <canvas ref={canvasRef} className="geology-sheet" onClick={handleClick} style={{ cursor: 'crosshair' }} />
    </div>
  );
}

function drawPatternOverlay(ctx, pattern, x, y, w, h, selected) {
  ctx.save();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = selected ? '#f5f3ec' : 'rgba(0,0,0,0.18)';
  const g = 6; // grid size
  switch (pattern) {
    case 'clay':
      // horizontal lines
      for (let yy = y + g; yy < y + h; yy += g) {
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      }
      break;
    case 'silt':
    case 'sandy-silt':
      // dots
      for (let yy = y + g; yy < y + h; yy += g) {
        for (let xx = x + g; xx < x + w; xx += g) {
          ctx.beginPath(); ctx.arc(xx, yy, 0.8, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    case 'fine-sand':
    case 'medium-sand':
    case 'coarse-sand':
      // diagonal hatch
      for (let i = -h; i < w; i += g) {
        ctx.beginPath(); ctx.moveTo(x + Math.max(0, i), y); ctx.lineTo(x + Math.min(w, i + h), y + h); ctx.stroke();
      }
      break;
    case 'gravel':
    case 'sandy-gravel':
      // circles
      for (let yy = y + g; yy < y + h; yy += g) {
        for (let xx = x + g; xx < x + w; xx += g) {
          ctx.beginPath(); ctx.arc(xx, yy, 1.4, 0, Math.PI * 2); ctx.stroke();
        }
      }
      break;
    case 'sandstone':
    case 'limestone':
    case 'shale':
    case 'mudstone':
    case 'granite':
    case 'basalt':
    case 'conglomerate':
      // brick pattern for rock
      for (let yy = y; yy < y + h; yy += g * 1.5) {
        const offset = (Math.floor(yy / (g * 1.5)) % 2) * (g / 2);
        for (let xx = x + offset; xx < x + w; xx += g) {
          ctx.beginPath(); ctx.rect(xx, yy, g - 1, g * 1.5 - 1); ctx.stroke();
        }
      }
      break;
    case 'weathered-rock':
    case 'fractured-rock':
      // irregular cracks
      ctx.strokeStyle = selected ? '#f5f3ec' : 'rgba(0,0,0,0.25)';
      for (let i = 0; i < Math.max(w, h) / 2; i++) {
        const rx = x + Math.random() * w;
        const ry = y + Math.random() * h;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + (Math.random() - 0.5) * 4, ry + (Math.random() - 0.5) * 4); ctx.stroke();
      }
      break;
    case 'fill':
    case 'topsoil':
      // dashed horizontal
      for (let yy = y + g * 1.5; yy < y + h; yy += g * 1.5) {
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      }
      break;
    case 'unknown':
    default:
      // no pattern
      break;
  }
  ctx.restore();
}
