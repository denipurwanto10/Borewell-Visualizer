// Phase 4 — Geological Log canvas visualization (vertical borehole log column).
import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import {
  depthToPixel, pixelToDepth, computeDepthScale, rulerTickStep, layerPixelHeight,
} from '../geology/geometry';
import { getMaterial } from '../geology/model';

const MIN_DEPTH = 0;

// Warna & font diambil dari variabel CSS situs, supaya kanvas selalu sepalet dengan halaman.
// (Canvas tidak bisa membaca var(--x) di dalam ctx.font, jadi nilainya di-resolve di sini.)
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, d) => cs.getPropertyValue(n).trim() || d;
  return {
    ink: g('--ink', '#15201e'), ink2: g('--ink-2', '#34423f'),
    mute: g('--mute', '#6b7773'), mute2: g('--mute-2', '#98a29e'),
    line: g('--line', '#dedacf'), line2: g('--line-2', '#cdc8ba'),
    teal: g('--teal', '#0d5f5a'), red: g('--red', '#b03a2e'),
    card: g('--card', '#fbfaf6'), paper2: g('--paper-2', '#e9e6dd'),
    font: g('--font', 'system-ui, sans-serif'), mono: g('--mono', 'ui-monospace, monospace'),
  };
}

function layoutFor(width) {
  const ruler = Math.round(Math.max(58, Math.min(76, width * 0.19)));
  const right = Math.round(Math.max(44, Math.min(60, width * 0.15)));
  const column = Math.max(120, width - ruler - right);
  return { ruler, column, right };
}

function drawRuler(ctx, T, L, { plotTop, plotBottom, minDepth, maxDepth, step }) {
  ctx.save();
  const axisX = L.ruler - 10;
  ctx.strokeStyle = T.mute2;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(axisX, plotTop); ctx.lineTo(axisX, plotBottom); ctx.stroke();

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const firstTick = Math.ceil(minDepth / step) * step;
  for (let value = firstTick; value <= maxDepth + 0.001; value += step) {
    const py = depthToPixel(value, { plotTop, plotBottom, minDepth, maxDepth });
    const major = Math.round(value / step) % 2 === 0;
    ctx.strokeStyle = major ? T.ink : T.mute2;
    ctx.lineWidth = major ? 1.2 : 0.8;
    ctx.beginPath(); ctx.moveTo(axisX, py); ctx.lineTo(axisX - (major ? 6 : 3), py); ctx.stroke();
    ctx.font = `${major ? 600 : 500} 10.5px ${T.mono}`;
    ctx.fillStyle = major ? T.ink : T.mute;
    ctx.fillText(`${Number(value).toFixed(1)} m`, axisX - 10, py);
    // garis bantu halus sepanjang kolom
    if (major) {
      ctx.strokeStyle = T.line; ctx.lineWidth = 0.75; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(L.ruler, py); ctx.lineTo(L.ruler + L.column, py); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

function drawDepthLabels(ctx, T, L, layers, { plotTop, plotBottom, minDepth, maxDepth }) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `500 10.5px ${T.mono}`;
  ctx.fillStyle = T.mute;
  const drawn = [];
  let lastY = -Infinity;
  const depths = [];
  for (const l of layers) {
    depths.push(Number(l.startDepth) || 0, Number(l.endDepth) || 0);
  }
  depths.sort((a, b) => a - b);
  for (const depth of depths) {
    if (!Number.isFinite(depth)) continue;
    const key = depth.toFixed(2);
    if (drawn.includes(key)) continue;
    drawn.push(key);
    const py = depthToPixel(depth, { plotTop, plotBottom, minDepth, maxDepth });
    if (py < plotTop - 4 || py > plotBottom + 4 || py - lastY < 13) continue;
    lastY = py;
    ctx.fillText(depth.toFixed(1), L.ruler + L.column + 8, py);
  }
  ctx.restore();
}

export default function GeologyLogCanvas({ layers = [], wellDepth = 0, height: heightProp, selectedId = null, onSelect }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(360);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });

  // Lebar mengikuti wadahnya (responsif), dibatasi agar tetap proporsional.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.round(Math.max(300, Math.min(el.clientWidth || 360, 460))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = heightProp || Math.round(Math.max(520, Math.min(width * 1.5, 640)));
  const L = useMemo(() => layoutFor(width), [width]);

  const plotTop = 52;
  const plotBottom = height - 28;
  const scale = useMemo(() => computeDepthScale(layers, wellDepth, {
    plotTop, plotBottom, minDepth: MIN_DEPTH,
  }), [layers, wellDepth, plotBottom]);

  // computeDepthScale hanya mengembalikan rentang kedalaman; batas plot ditentukan di sini.
  const { minDepth, maxDepth } = scale;
  const step = rulerTickStep(maxDepth - minDepth);

  // Hit test for layer selection
  const hitTest = useCallback((canvasX, canvasY) => {
    // Convert canvas coordinates to depth
    const depth = pixelToDepth(canvasY, { plotTop, plotBottom, minDepth, maxDepth });
    const hit = (layers || [])
      .slice()
      .sort((a, b) => a.startDepth - b.startDepth)
      .find((l) => {
        const s0 = Number(l.startDepth) || 0;
        const e0 = Number(l.endDepth) || 0;
        return depth >= s0 && depth <= e0;
      });
    return hit ? hit.id : null;
  }, [layers, plotTop, plotBottom, minDepth, maxDepth]);

  // Gesture system
  const { transform: gestureTransform, api: gestureApi } = useCanvasGestures({
    targetRef: wrapRef,
    minScale: 0.5,
    maxScale: 3,
    hitTest,
    preventPanOnObject: false, // Allow panning anywhere
    onTap: ({ hit }) => {
      if (hit && onSelect) onSelect(hit);
      else if (onSelect) onSelect(null);
    },
    onDoubleTap: ({ clientX, clientY }) => {
      // Double-tap to reset zoom
      gestureApi.reset();
    },
    onPan: () => {
      // Optional: handle pan state
    },
  });

  // Combine local transform with gesture transform
  // For this canvas, we use the gesture transform directly
  const currentTransform = gestureTransform;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let raf = 0;
    const draw = () => {
      const T = readTokens();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Apply transform for pan/zoom
      ctx.save();
      ctx.translate(currentTransform.tx, currentTransform.ty);
      ctx.scale(currentTransform.scale, currentTransform.scale);

      const colLeft = L.ruler;
      const colRight = L.ruler + L.column;

      // Judul
      ctx.save();
      ctx.font = `700 12px ${T.mono}`;
      ctx.fillStyle = T.mute;
      ctx.textAlign = 'center';
      ctx.fillText('LOG GEOLOGI', colLeft + L.column / 2, 26);
      ctx.restore();

      drawRuler(ctx, T, L, { plotTop, plotBottom, minDepth, maxDepth, step });

      // Bingkai kolom
      ctx.save();
      ctx.fillStyle = T.paper2;
      ctx.fillRect(colLeft, plotTop, L.column, plotBottom - plotTop);
      ctx.strokeStyle = T.line2;
      ctx.lineWidth = 1;
      ctx.strokeRect(colLeft + 0.5, plotTop + 0.5, L.column - 1, plotBottom - plotTop - 1);
      ctx.restore();

      if (layers.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = T.mute;
        ctx.font = `600 13px ${T.font}`;
        ctx.fillText('Belum ada lapisan', colLeft + L.column / 2, plotTop + (plotBottom - plotTop) / 2 - 6);
        ctx.font = `400 12px ${T.font}`;
        ctx.fillStyle = T.mute2;
        ctx.fillText('Tambahkan lapisan di panel kiri', colLeft + L.column / 2, plotTop + (plotBottom - plotTop) / 2 + 14);
        ctx.restore();
      } else {
        for (const l of layers) {
          const s0 = Number(l.startDepth) || 0;
          const e0 = Number(l.endDepth) || 0;
          if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 <= s0) continue;
          const py = depthToPixel(s0, { plotTop, plotBottom, minDepth, maxDepth });
          const h = layerPixelHeight(s0, e0, { ...scale, plotTop, plotBottom });
          const selected = l.id === selectedId;

          ctx.save();
          ctx.fillStyle = l.color || T.mute2;
          ctx.globalAlpha = selected ? 0.92 : 0.7;
          ctx.fillRect(colLeft + 1, py, L.column - 2, h);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = selected ? T.teal : T.ink2;
          ctx.lineWidth = selected ? 2 : 0.75;
          ctx.strokeRect(colLeft + 1, py, L.column - 2, h);

          drawPatternOverlay(ctx, l.pattern, colLeft + 1, py, L.column - 2, h, selected);

          const mat = getMaterial(l.material);
          if (h > 22) {
            ctx.fillStyle = selected ? T.card : T.ink;
            ctx.font = `700 12px ${T.font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(l.name || mat.label, colLeft + L.column / 2, py + h / 2 - (h > 36 ? 7 : 0));
            if (h > 36) {
              ctx.font = `500 10.5px ${T.mono}`;
              ctx.fillStyle = selected ? T.card : T.ink2;
              ctx.fillText(`${s0.toFixed(1)}–${e0.toFixed(1)} m`, colLeft + L.column / 2, py + h / 2 + 8);
            }
          }
          ctx.restore();
        }
      }

      drawDepthLabels(ctx, T, L, layers, { plotTop, plotBottom, minDepth, maxDepth });

      if (wellDepth > 0) {
        const wy = depthToPixel(wellDepth, { plotTop, plotBottom, minDepth, maxDepth });
        if (wy >= plotTop && wy <= plotBottom) {
          ctx.save();
          ctx.strokeStyle = T.red;
          ctx.lineWidth = 1.25;
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(colLeft - 4, wy); ctx.lineTo(colRight, wy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `600 10.5px ${T.mono}`;
          ctx.fillStyle = T.red;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`Sumur ${wellDepth.toFixed(1)} m`, colLeft + 6, wy - 4);
          ctx.restore();
        }
      }

      ctx.restore(); // Restore transform
    };
    draw();
    // gambar ulang setelah font situs siap
    document.fonts?.ready.then(() => { raf = requestAnimationFrame(draw); });
    return () => cancelAnimationFrame(raf);
  }, [layers, wellDepth, width, height, L, plotTop, plotBottom, minDepth, maxDepth, step, selectedId, scale, currentTransform]);

  return (
    <div className="geology-canvas-wrap" ref={wrapRef} style={{ touchAction: 'manipulation', overflow: 'hidden' }}>
      <canvas ref={canvasRef} className="geology-sheet" aria-label="Log geologi sumur bor" />
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