// Phase 5 — Hydrograph Canvas Component for Groundwater Monitoring.
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import { computeHydrographScale, depthToPixel, timeToPixel, depthRulerTickStep, timeAxisTickStep } from '../monitoring/geometry';

export function MonitoringHydrographCanvas({ measurements, wellDepth, referencePoint, selectedId, onSelect }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const scaleRef = useRef(null);

  const validMeasurements = useMemo(() => 
    (measurements || [])
      .filter(m => m.status === 'valid' && Number.isFinite(m.waterLevelDepth))
      .map(m => ({ ...m, measuredAt: new Date(m.measuredAt) }))
      .sort((a, b) => a.measuredAt - b.measuredAt),
  [measurements]);

  // Compute scale based on container size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const plotLeft = 60;
    const plotRight = rect.width - 20;
    const plotTop = 20;
    const plotBottom = rect.height - 40;
    scaleRef.current = computeHydrographScale(validMeasurements, wellDepth, { plotLeft, plotRight, plotTop, plotBottom, minDepth: 0 });
  }, [validMeasurements, wellDepth]);

  // Hit test for measurement selection
  const hitTest = useCallback((canvasX, canvasY) => {
    const scale = scaleRef.current;
    if (!scale) return null;
    
    const { plotLeft, plotRight, plotTop, plotBottom, minTime, maxTime, minDepth, maxDepth } = scale;
    
    // Convert canvas coordinates to data coordinates
    // Note: canvasX/Y are already in transformed space
    const x = canvasX;
    const y = canvasY;
    
    // Find nearest point
    let nearest = null;
    let minDist = Infinity;
    for (const m of validMeasurements) {
      const px = timeToPixel(m.measuredAt, { plotLeft, plotRight, minTime, maxTime });
      const py = depthToPixel(m.waterLevelDepth, { plotTop, plotBottom, minDepth, maxDepth });
      const dist = Math.hypot(px - x, py - y);
      if (dist < minDist && dist < 20 / transform.scale) { // Adjust threshold for zoom
        minDist = dist;
        nearest = m;
      }
    }
    return nearest ? nearest.id : null;
  }, [validMeasurements, transform.scale]);

  // Gesture system
  const { transform: gestureTransform, api: gestureApi } = useCanvasGestures({
    targetRef: wrapRef,
    minScale: 0.5,
    maxScale: 5,
    hitTest,
    preventPanOnObject: false,
    onTap: ({ hit }) => {
      if (hit && onSelect) onSelect(hit);
      else if (onSelect) onSelect(null);
    },
    onDoubleTap: () => {
      gestureApi.reset();
    },
    onPan: () => {
      // Pan handled by transform
    },
  });

  // Combine transforms (gesture takes precedence)
  const currentTransform = gestureTransform;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scaleRef.current) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const { plotLeft, plotRight, plotTop, plotBottom, minDepth, maxDepth, depthScale, minTime, maxTime, timeScale } = scaleRef.current;

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Apply transform
    ctx.save();
    ctx.translate(currentTransform.tx, currentTransform.ty);
    ctx.scale(currentTransform.scale, currentTransform.scale);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop);

    // Grid lines - depth (horizontal)
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    const depthStep = depthRulerTickStep(maxDepth - minDepth);
    const firstDepthTick = Math.ceil(minDepth / depthStep) * depthStep;
    for (let d = firstDepthTick; d <= maxDepth + 0.001; d += depthStep) {
      const y = depthToPixel(d, { plotTop, plotBottom, minDepth, maxDepth });
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    // Grid lines - time (vertical)
    const timeTick = timeAxisTickStep(maxTime - minTime);
    let currentTime = new Date(Math.ceil(minTime / timeTick.step) * timeTick.step);
    while (currentTime.getTime() <= maxTime) {
      const x = timeToPixel(currentTime, { plotLeft, plotRight, minTime, maxTime });
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
      currentTime = new Date(currentTime.getTime() + timeTick.step);
    }

    // Depth axis labels (left)
    ctx.fillStyle = '#666';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let d = firstDepthTick; d <= maxDepth + 0.001; d += depthStep) {
      const y = depthToPixel(d, { plotTop, plotBottom, minDepth, maxDepth });
      ctx.fillText(`${d.toFixed(1)} m`, plotLeft - 8, y);
    }

    // Time axis labels (bottom)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    currentTime = new Date(Math.ceil(minTime / timeTick.step) * timeTick.step);
    while (currentTime.getTime() <= maxTime) {
      const x = timeToPixel(currentTime, { plotLeft, plotRight, minTime, maxTime });
      const label = timeTick.format(currentTime);
      ctx.fillText(label, x, plotBottom + 4);
      currentTime = new Date(currentTime.getTime() + timeTick.step);
    }

    // Axis lines
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    // Y axis
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.stroke();
    // X axis
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // Well depth line (if available)
    if (wellDepth > 0 && wellDepth <= maxDepth) {
      const y = depthToPixel(wellDepth, { plotTop, plotBottom, minDepth, maxDepth });
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff6b35';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Kedalaman Sumur: ${wellDepth.toFixed(1)} m`, plotLeft + 4, y - 4);
    }

    // Reference point label
    if (referencePoint) {
      ctx.fillStyle = '#888';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Ref: ${referencePoint}`, plotRight - 4, plotTop - 8);
    }

    // Draw connecting line
    if (validMeasurements.length > 1) {
      ctx.strokeStyle = '#0d5f5a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      validMeasurements.forEach((m, i) => {
        const x = timeToPixel(m.measuredAt, { plotLeft, plotRight, minTime, maxTime });
        const y = depthToPixel(m.waterLevelDepth, { plotTop, plotBottom, minDepth, maxDepth });
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Draw data points
    validMeasurements.forEach((m, i) => {
      const x = timeToPixel(m.measuredAt, { plotLeft, plotRight, minTime, maxTime });
      const y = depthToPixel(m.waterLevelDepth, { plotTop, plotBottom, minDepth, maxDepth });
      const isSelected = m.id === selectedId;

      // Point circle
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#0d5f5a' : '#0d5f5a';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : '#fff';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // White inner dot for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    });

    ctx.restore(); // Restore transform

    // Tooltip will be handled by parent via onSelect
  }, [validMeasurements, wellDepth, referencePoint, selectedId, currentTransform]);

  return (
    <div className="hydrograph-wrap" ref={wrapRef} style={{ touchAction: 'manipulation', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        role="img"
        aria-label="Hidrograf muka air tanah"
      />
    </div>
  );
}

export function MonitoringHydrographTooltip({ measurement, referencePoint, onClose }) {
  if (!measurement) return null;

  const methodLabels = {
    electric_water_level_meter: 'Electric Water Level Meter',
    manual_water_level_meter: 'Manual Water Level Meter',
    pressure_transducer: 'Pressure Transducer',
    automatic_data_logger: 'Automatic Data Logger',
    other: 'Other',
  };

  const refLabels = {
    top_of_casing: 'Top of Casing',
    ground_level: 'Ground Level',
    custom: 'Custom Reference Point',
  };

  return (
    <div className="hydrograph-tooltip">
      <strong>{new Date(measurement.measuredAt).toLocaleString('id-ID')}</strong>
      <div className="mono">Kedalaman: {measurement.waterLevelDepth.toFixed(2)} m</div>
      <div>Titik Referensi: {refLabels[measurement.referencePoint] || measurement.referencePoint}</div>
      <div>Metode: {methodLabels[measurement.method] || measurement.method}</div>
      {measurement.notes && <div className="notes">Catatan: {measurement.notes}</div>}
    </div>
  );
}