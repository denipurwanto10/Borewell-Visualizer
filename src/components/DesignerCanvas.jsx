import { forwardRef, useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle } from 'react';
import {
  depthToPixel, computeDepthScale, rulerTickStep,
} from '../designer/geometry';
import { renderComponents as renderCompBoxes, drawGrid, drawDepthRuler, drawGroundLine, drawMatLine, drawSelection, drawComponentLabel } from '../designer/renderers';
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
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef({ x: 0, y: 0 });

  // Responsive canvas sizing
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const newWidth = Math.max(280, Math.min(width, 700));
        const newHeight = (newWidth / BASE_WIDTH) * BASE_HEIGHT;
        setDimensions({ width: newWidth, height: newHeight });
        setTransform({ scale: 1, tx: 0, ty: 0 });
      }
    });
    ro.observe(wrapper);
    const { width } = wrapper.getBoundingClientRect();
    const newWidth = Math.max(280, Math.min(width, 700));
    const newHeight = (newWidth / BASE_WIDTH) * BASE_HEIGHT;
    setDimensions({ width: newWidth, height: newHeight });
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    const { width: W, height: H } = dimensions;
    const plotTop = PLOT_TOP_RATIO * H;
    const plotBottom = H - PLOT_BOTTOM_RATIO * H;
    const wellAxisPx = W / 2;
    const pxPerMm = 0.35;
    return { W, H, plotTop, plotBottom, wellAxisPx, pxPerMm };
  }, [dimensions]);

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

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { dpr } = window;
    const devicePixelRatio = dpr || 1;
    const { W, H, plotTop, plotBottom, wellAxisPx, pxPerMm } = plot;

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

      const rulerX = 40;
      drawDepthRuler(ctx, { plotTop, plotBottom, minDepth, maxDepth, rulerX, step });

      drawGroundLine(ctx, { depthY: groundY, plotLeft: 0, plotRight: W, wellX: wellAxisPx, casingWidth: 62 });
      drawMatLine(ctx, { depthY: matY, plotLeft: 0, plotRight: W, wellX: wellAxisPx, casingWidth: 62 });

      const compBoxes = renderCompBoxes(ctx, components || [], {
        plotTop, plotBottom, minDepth, maxDepth,
        wellAxisPx, pxPerMm,
      });
      boxes.push(...compBoxes);

      // Labels right side with overlap prevention
      const labelX = W - 170;
      let lastLabelY = -Infinity;
      for (const box of boxes) {
        const centerY = box.y + box.height / 2;
        const labelY = centerY - lastLabelY < 26 ? lastLabelY + 26 : centerY;
        lastLabelY = labelY;
        drawComponentLabel(ctx, box, { labelX, centerY: labelY });
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
        for (let x = 40; x < W - 40; x += 26) {
          if (x + 13 > wellAxisPx - 31 && x < wellAxisPx + 31) continue;
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
        const triCX = W - 34;
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

    const hitTest = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      // Invert CSS transform
      const x = ((clientX - rect.left) * scaleX - transform.tx) / transform.scale;
      const y = ((clientY - rect.top) * scaleY - transform.ty) / transform.scale;
      const found = [...boxes].reverse().find(b =>
        x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
      );
      return found;
    };

    const handleMove = (e) => {
      const found = hitTest(e.clientX, e.clientY);
      if (found) {
        setHoveredBox(found);
        setTooltip({ x: e.clientX, y: e.clientY });
        if (onSelect) onSelect(found.id);
      } else {
        setHoveredBox(null);
        setTooltip(null);
      }
    };
    const handleDown = (e) => {
      const found = hitTest(e.clientX, e.clientY);
      if (found) {
        setHoveredBox(found);
        setTooltip({ x: e.clientX, y: e.clientY });
        if (onSelect) onSelect(found.id);
      }
    };
    const handleLeave = (e) => {
      if (e.pointerType === 'touch') return;
      setHoveredBox(null);
      setTooltip(null);
    };

    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointerleave', handleLeave);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointerleave', handleLeave);
    };
  }, [components, config, selectedId, onSelect, plot, scaleInfo, groundY, matY, showGrid, transform]);

  // Pan via pointer drag on wrapper
  const handleWrapperDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    lastPan.current = { x: e.clientX, y: e.clientY };
  }, []);
  const handleWrapperMove = useCallback((e) => {
    if (!isPanning) return;
    setTransform(prev => ({
      scale: prev.scale,
      tx: prev.tx + (e.clientX - lastPan.current.x),
      ty: prev.ty + (e.clientY - lastPan.current.y),
    }));
    lastPan.current = { x: e.clientX, y: e.clientY };
  }, [isPanning]);
  const handleWrapperUp = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    window.addEventListener('pointerup', handleWrapperUp);
    return () => window.removeEventListener('pointerup', handleWrapperUp);
  }, [handleWrapperUp]);

  // Wheel zoom
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left);
      const my = (e.clientY - rect.top);
      const delta = -e.deltaY * 0.001;
      const newScale = Math.min(3, Math.max(0.5, transform.scale + delta));
      const zoomFactor = newScale / transform.scale;
      setTransform(prev => ({
        scale: newScale,
        tx: prev.tx - mx * (zoomFactor - 1),
        ty: prev.ty - my * (zoomFactor - 1),
      }));
    };
    const el = wrapperRef.current;
    el?.addEventListener('wheel', onWheel, { passive: false });
    return () => el?.removeEventListener('wheel', onWheel);
  }, [transform.scale]);

  // Public API
  const api = useMemo(() => ({
    fitToScreen() {
      setTransform({ scale: 1, tx: 0, ty: 0 });
    },
    zoomIn() {
      setTransform(prev => ({ scale: Math.min(3, prev.scale + 0.2), tx: prev.tx, ty: prev.ty }));
    },
    zoomOut() {
      setTransform(prev => ({ scale: Math.max(0.5, prev.scale - 0.2), tx: prev.tx, ty: prev.ty }));
    },
    resetView() {
      setTransform({ scale: 1, tx: 0, ty: 0 });
    },
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
  }), []);

  useImperativeHandle(ref, () => api);

  const canvasStyle = {
    transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
    transformOrigin: 'top left',
    cursor: isPanning ? 'grabbing' : 'crosshair',
    willChange: 'transform',
  };

  return (
    <div className="designer-canvas-wrap" ref={wrapperRef}
         onPointerDown={handleWrapperDown}
         onPointerMove={handleWrapperMove}
         style={{ touchAction: isPanning ? 'none' : 'manipulation' }}>
      <div className="designer-sheet" style={canvasStyle}>
        <canvas
          ref={canvasRef}
          aria-label="Kanvas desain konstruksi sumur"
        />
        {hoveredBox && tooltip && (
          <div className="designer-tooltip" style={{ left: `${tooltip.x + 10}px`, top: `${tooltip.y + 10}px` }}>
            <strong>{hoveredBox.name || COMPONENT_LABELS[hoveredBox.type] || 'Komponen'}</strong>
            <span>{hoveredBox.detail}</span>
          </div>
        )}
      </div>
    </div>
  );
});
