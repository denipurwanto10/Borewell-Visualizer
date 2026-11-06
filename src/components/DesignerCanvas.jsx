import { forwardRef, useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle } from 'react';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import {
  depthToPixel, computeDepthScale, rulerTickStep,
} from '../designer/geometry';
import { renderComponents as renderCompBoxes, drawGrid, drawDepthRuler, drawGroundLine, drawMatLine, drawSelection, drawComponentLabel, layoutLabels } from '../designer/renderers';
import { COMPONENT_LABELS } from '../designer/model';

const BASE_WIDTH = 360;
const BASE_HEIGHT = 750;
const PLOT_TOP_RATIO = 86 / BASE_HEIGHT;
const PLOT_BOTTOM_RATIO = 10 / BASE_HEIGHT;

export const DesignerCanvas = forwardRef(function DesignerCanvas({
  components,
  config,
  selectedId,
  onSelect,
  showGrid = true,
}, ref) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: BASE_WIDTH, height: BASE_HEIGHT });
  const [hoveredBox, setHoveredBox] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const boxesRef = useRef([]);

  // Responsive canvas sizing
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const newWidth = Math.max(240, Math.min(width || BASE_WIDTH, 700));
        const newHeight = (newWidth / BASE_WIDTH) * BASE_HEIGHT;
        setDimensions({ width: newWidth, height: newHeight });
      }
    });
    ro.observe(wrapper);
    const { width } = wrapper.getBoundingClientRect();
    const newWidth = Math.max(240, Math.min(width || BASE_WIDTH, 700));
    const newHeight = (newWidth / BASE_WIDTH) * BASE_HEIGHT;
    setDimensions({ width: newWidth, height: newHeight });
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    const { width: W, height: H } = dimensions;
    const plotTop = PLOT_TOP_RATIO * H;
    const plotBottom = H - PLOT_BOTTOM_RATIO * H;
    const rulerX = 44;
    const labelCol = W < 340 ? 96 : W < 460 ? 112 : 130;
    const labelX = W - labelCol;
    const zoneL = rulerX + 18;
    const zoneR = labelX - 22;
    const free = Math.max(40, zoneR - zoneL);
    const maxOD = Math.max(150, ...(components || []).filter(c => c.visible).map(c => Number(c.outerDiameter) || 0));
    const pxPerMm = 0.35; // gaya pipa asli: lebar 34–62px
    const wellAxisPx = zoneL + free / 2;
    return { W, H, plotTop, plotBottom, wellAxisPx, pxPerMm, rulerX, labelX, labelCol, free };
  }, [dimensions, components]);

  const scaleInfo = useMemo(() => {
    return computeDepthScale(components || [], config, {
      plotTop: plot.plotTop,
      plotBottom: plot.plotBottom,
      minDepth: 0,
    });
  }, [components, config, plot.plotTop, plot.plotBottom]);

  const { minDepth, maxDepth, range, scale } = scaleInfo;
  const step = rulerTickStep(range);

  const groundY = config.groundLevel !== null && config.groundLevel !== undefined
    ? depthToPixel(config.groundLevel, { plotTop: plot.plotTop, plotBottom: plot.plotBottom, minDepth: 0, maxDepth })
    : null;
  const matY = config.matLevel !== null && config.matLevel !== undefined
    ? depthToPixel((config.groundLevel || 0) + config.matLevel, { plotTop: plot.plotTop, plotBottom: plot.plotBottom, minDepth: 0, maxDepth })
    : null;

  // Hit test function for gestures
  const hitTest = useCallback((canvasX, canvasY) => {
    return [...boxesRef.current].reverse().find(b =>
      canvasX >= b.x && canvasX <= b.x + b.width && canvasY >= b.y && canvasY <= b.y + b.height
    );
  }, []);

  // Gesture system
  const { transform, api: gestureApi } = useCanvasGestures({
    targetRef: wrapperRef,
    minScale: 0.5,
    maxScale: 3,
    hitTest,
    preventPanOnObject: true, // Don't pan when over a component
    onTap: ({ hit }) => {
      if (hit && onSelect) onSelect(hit.id);
    },
    onDoubleTap: ({ clientX, clientY, canvasX, canvasY }) => {
      // Double-tap to zoom into point
      gestureApi.zoomTo(1.5, clientX, clientY);
    },
    onPan: () => {
      // Cursor handled by CSS
    },
  });

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const devicePixelRatio = window.devicePixelRatio || 1;
    const { W, H, plotTop, plotBottom, wellAxisPx, pxPerMm, rulerX, labelX: labelColX, labelCol } = plot;

    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    let cancelled = false;
    let done = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    const boxes = [];

    const render = (progress = 1) => {
      boxes.length = 0;
      ctx.clearRect(0, 0, W, H);

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#faf8f3');
      bg.addColorStop(0.55, '#f2efe7');
      bg.addColorStop(1, '#e8e4d8');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      if (showGrid) {
        drawGrid(ctx, { plotTop, plotBottom, minDepth, maxDepth, plotLeft: 0, plotRight: W, step });
      }

      drawDepthRuler(ctx, { plotTop, plotBottom, minDepth, maxDepth, rulerX, step });

      drawGroundLine(ctx, { depthY: groundY, plotLeft: 0, plotRight: W, wellX: wellAxisPx, casingWidth: 62 });
      drawMatLine(ctx, { depthY: matY, plotLeft: 0, plotRight: W, wellX: wellAxisPx, casingWidth: 62 });

      const compBoxes = renderCompBoxes(ctx, components || [], {
        plotTop, plotBottom, minDepth, maxDepth,
        wellAxisPx, pxPerMm,
      });
      boxes.push(...compBoxes);
      boxesRef.current = boxes;

      // Label sisi kanan: rapi, rata kiri, tanpa tumpang tindih
      const labelX = labelColX;
      const maxCasing = boxes.reduce((m, b) => Math.max(m, b.width), 0);
      const laid = layoutLabels(boxes, { minGap: 30, top: plotTop + 8, bottom: plotBottom - 8 });
      for (const it of laid) {
        drawComponentLabel(ctx, it.box, {
          labelX: Math.max(labelX, wellAxisPx + maxCasing / 2 + 24),
          centerY: it.labelY, anchorY: it.anchorY, maxLabelWidth: Math.max(60, labelCol - 12),
        });
      }

      if (selectedId) {
        const sel = boxes.find(b => b.id === selectedId);
        if (sel) drawSelection(ctx, sel);
      }

      if (groundY != null) {
        ctx.fillStyle = '#b45309';
        ctx.font = '700 11px Hanken Grotesk, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Permukaan tanah (${config.groundLevel} m)`, 14, groundY - 10);
        ctx.fillStyle = '#b45309';
        for (let x = rulerX + 4; x < labelX - 8; x += 26) {
          if (x + 13 > wellAxisPx - 46 && x < wellAxisPx + 46) continue;
          ctx.beginPath();
          ctx.moveTo(x, groundY);
          ctx.lineTo(x + 6.5, groundY - 7);
          ctx.lineTo(x + 13, groundY);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (matY != null) {
        ctx.fillStyle = '#1d4ed8';
        ctx.font = '700 11px Hanken Grotesk, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`MAT (${config.matLevel} m)`, 14, matY + 16);
        const triCX = labelX - 14;
        ctx.beginPath();
        ctx.moveTo(triCX - 7, matY - 10);
        ctx.lineTo(triCX + 7, matY - 10);
        ctx.lineTo(triCX, matY - 1);
        ctx.closePath();
        ctx.fillStyle = '#1d4ed8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      done = true;
    };

    if (reduce) { render(1); done = true; }
    else {
      const startTime = performance.now();
      const DURATION = 500;
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / DURATION);
        const p = 1 - (1 - t) ** 3;
        render(p);
        if (t < 1) { rafId = requestAnimationFrame(tick); }
        else done = true;
      };
      rafId = requestAnimationFrame(tick);
    }
    document.fonts?.ready.then(() => { if (!cancelled && done) render(1); });

    // Hover handling (separate from gestures)
    const handleMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const x = ((e.clientX - rect.left) * scaleX - transform.tx) / transform.scale;
      const y = ((e.clientY - rect.top) * scaleY - transform.ty) / transform.scale;
      const found = [...boxes].reverse().find(b =>
        x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
      );
      if (found) {
        setHoveredBox(found);
        setTooltip({ x: e.clientX, y: e.clientY });
      } else {
        setHoveredBox(null);
        setTooltip(null);
      }
    };
    const handleLeave = (e) => {
      if (e.pointerType === 'touch') return;
      setHoveredBox(null);
      setTooltip(null);
    };

    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerleave', handleLeave);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerleave', handleLeave);
    };
  }, [components, config, selectedId, onSelect, plot, scaleInfo, groundY, matY, showGrid, transform]);

  // Public API (combine gesture API with existing API)
  const api = useMemo(() => ({
    ...gestureApi,
    fitToScreen: gestureApi.reset,
    zoomIn: gestureApi.zoomIn,
    zoomOut: gestureApi.zoomOut,
    resetView: gestureApi.reset,
    exportPNG() {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const dataURL = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `desain_sumur_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataURL;
      link.click();
      return dataURL;
    },
    getImageData() {
      return canvasRef.current?.toDataURL('image/png') || null;
    },
  }), [gestureApi]);

  useImperativeHandle(ref, () => api);

  const canvasStyle = {
    transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
    transformOrigin: 'top left',
    cursor: 'crosshair',
    willChange: 'transform',
  };

  // Determine touch-action: manipulation for zoom/pan, none when panning
  const touchAction = 'manipulation';

  return (
    <div className="designer-canvas-wrap" ref={wrapperRef} style={{ touchAction }}>
      <div className="designer-sheet" style={canvasStyle}>
        <canvas
          ref={canvasRef}
          aria-label="Kanvas desain konstruksi sumur"
        />
      </div>
      {hoveredBox && tooltip && (
          <div className="designer-tooltip" style={{ left: `${tooltip.x + 10}px`, top: `${tooltip.y + 10}px` }}>
            <strong>{hoveredBox.name || COMPONENT_LABELS[hoveredBox.type] || 'Komponen'}</strong>
            <span>{hoveredBox.detail}</span>
          </div>
        )}
    </div>
  );
});