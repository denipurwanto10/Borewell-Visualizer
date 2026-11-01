import { forwardRef, useEffect, useRef, useState } from 'react';
import { formatNumber, totalPipeLength, pipeBottom, totalDepth } from '../model';

const WIDTH = 360;
const HEIGHT = 750;
const TOP = 86;
const BOTTOM = 10;
const WELL_X = 200;

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

function text(ctx, value, x, y, { color = '#334155', size = 12, weight = 600, align = 'left' } = {}) {
  ctx.font = `${weight} ${size}px Hanken Grotesk, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

function haloText(ctx, value, x, y, color) {
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(250,248,243,.95)';
  ctx.strokeText(value, x, y);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export const Diagram = forwardRef(function Diagram({ model }, ref) {
  const canvasRef = useRef(null);
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const components = [];
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let cancelled = false;
    let done = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const render = (progress) => {
    components.length = 0;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, 52 + (HEIGHT - 52) * progress);
    ctx.clip();

    // Latar modern
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#faf8f3');
    bg.addColorStop(0.55, '#f2efe7');
    bg.addColorStop(1, '#e8e4d8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Judul di dalam kanvas
    text(ctx, 'SKEMA KONSTRUKSI SUMUR', WIDTH / 2, 34, { size: 12, weight: 700, align: 'center', color: '#1e293b' });
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 44);
    ctx.lineTo(WIDTH - 40, 44);
    ctx.stroke();

    if (!model.pipes.length) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      roundRect(ctx, WELL_X - 34, 240, 68, 240, 34);
      ctx.stroke();
      ctx.restore();
      text(ctx, 'Belum ada pipa', WIDTH / 2, 350, { size: 13, weight: 600, align: 'center', color: '#64748b' });
      text(ctx, 'Tambahkan pipa untuk memulai', WIDTH / 2, 372, { size: 11, weight: 400, align: 'center', color: '#94a3b8' });
      ctx.restore();
      return;
    }

    const bottom = pipeBottom(model);
    const absoluteMat = model.ground !== null && model.mat !== null ? model.ground + model.mat : null;
    const base = model.openHole?.end ?? bottom;
    const values = [0, base, model.ground, absoluteMat].filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    const minValue = 0;
    const maxValue = Math.max(10, ...values);
    // Skala selalu dimulai dari 0 m, bukan nilai negatif.
    const minDepth = 0;
    // Akhir skala mengikuti kedalaman aktual agar tidak ada ruang kosong besar di bawah diagram.
    const maxDepth = maxValue;
    const range = maxDepth - minDepth || 1;
    // Tick kedalaman tidak boleh melewati kedalaman aktual.
    // Contoh: jika pipa berakhir di 45 m, jangan tampilkan tick 50 m.
    const tickMaxDepth = maxValue;
    const plotTop = TOP;
    const plotBottom = HEIGHT - BOTTOM;
    const scale = (plotBottom - plotTop) / range;
    const yAt = (depth) => plotTop + (depth - minDepth) * scale;

    // Latar zona heaven / earth
    const surfaceY = model.ground !== null ? yAt(model.ground) : yAt(0);
    // Batas zona tanah: berhenti tepat di atas open hole (bukan tembus ke bawah).
    const openZoneTop = model.openHole ? yAt(model.openHole.start) : null;
    const soilEndY = openZoneTop !== null ? openZoneTop : HEIGHT;
    const earth = ctx.createLinearGradient(0, surfaceY, 0, HEIGHT);
    earth.addColorStop(0, 'rgba(180,140,90,.16)');
    earth.addColorStop(1, 'rgba(120,90,50,.26)');
    ctx.fillStyle = earth;
    if (surfaceY < soilEndY) {
      ctx.fillRect(0, surfaceY, WIDTH, soilEndY - surfaceY);
    }

    // Zona open hole memakai background yang berbeda dari tanah (abu-abu kebiruan).
    if (openZoneTop !== null && openZoneTop < HEIGHT) {
      const openZone = ctx.createLinearGradient(0, openZoneTop, 0, HEIGHT);
      openZone.addColorStop(0, '#e6ecf2');
      openZone.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = openZone;
      ctx.fillRect(0, openZoneTop, WIDTH, HEIGHT - openZoneTop);
      // Garis pemisah tanah ↔ open hole
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, openZoneTop);
      ctx.lineTo(WIDTH, openZoneTop);
      ctx.stroke();
      ctx.restore();
    }

    const casingWidth = Math.max(34, Math.min(62, (model.pipes[0]?.diameter || 6) * 6));
    const casingX = WELL_X - casingWidth / 2;

    // Skala meter — menempel di sisi pipa (bukan di pinggir kanvas)
    const rulerX = casingX - 12;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rulerX, plotTop);
    ctx.lineTo(rulerX, plotBottom);
    ctx.stroke();

    const step = range > 200 ? 20 : range > 100 ? 10 : 5;
    const firstTick = Math.ceil(minDepth / step) * step;
    for (let value = firstTick; value <= tickMaxDepth + 0.0001; value += step) {
      const y = yAt(value);
      const major = Math.abs(value % (step * 2)) < 0.001;
      // Tick masuk ke arah pipa
      ctx.strokeStyle = major ? '#475569' : '#94a3b8';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(rulerX, y);
      ctx.lineTo(rulerX + (major ? 16 : 10), y);
      ctx.stroke();
      // Angka menempel dekat pipa
      ctx.font = `${major ? 700 : 600} ${major ? 11 : 10}px Hanken Grotesk, system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = major ? '#1e293b' : '#64748b';
      ctx.fillText(`${formatNumber(value)} m`, rulerX - 5, y + (major ? 4 : 3.5));
    }

    // Garis acuan digambar DULU (di belakang pipa) supaya pipa menutupinya
    const groundYBehind = model.ground !== null ? yAt(model.ground) : null;
    const matYBehind = absoluteMat !== null ? yAt(absoluteMat) : null;
    if (groundYBehind !== null) {
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, groundYBehind);
      ctx.lineTo(WIDTH - 14, groundYBehind);
      ctx.stroke();
      ctx.restore();
    }
    if (matYBehind !== null) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, matYBehind);
      ctx.lineTo(WIDTH - 14, matYBehind);
      ctx.stroke();
    }

    // Pipa / casing dengan gradient metal
    for (const pipe of model.pipes) {
      const y = yAt(pipe.start);
      const h = Math.max(2, (pipe.end - pipe.start) * scale);
      const metal = ctx.createLinearGradient(casingX, 0, casingX + casingWidth, 0);
      metal.addColorStop(0, '#475569');
      metal.addColorStop(0.3, '#cbd5e1');
      metal.addColorStop(0.5, '#f1f5f9');
      metal.addColorStop(0.7, '#94a3b8');
      metal.addColorStop(1, '#334155');
      roundRect(ctx, casingX, y, casingWidth, h, 3);
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Kilat
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(casingX + casingWidth * 0.32, y, 2, h);
      // Sambungan
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(casingX, y, casingWidth, 3);
      if (h > 8) ctx.fillRect(casingX, y + h - 3, casingWidth, 3);

      components.push({
        type: 'pipe',
        title: `Pipa ${model.pipes.indexOf(pipe) + 1}`,
        x: casingX - 4,
        y,
        width: casingWidth + 8,
        height: h,
        detail: `${formatNumber(pipe.start)} – ${formatNumber(pipe.end)} m · diameter ${formatNumber(pipe.diameter)} inch`,
      });
    }

    // Saringan (screen)
    for (const screen of model.screens) {
      const y = yAt(screen.depth);
      const h = Math.max(14, screen.size * scale);
      const grad = ctx.createLinearGradient(casingX, 0, casingX + casingWidth, 0);
      grad.addColorStop(0, '#b45309');
      grad.addColorStop(0.45, '#f59e0b');
      grad.addColorStop(1, '#92400e');
      roundRect(ctx, casingX - 3, y, casingWidth + 6, h, 4);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Lubang perforasi
      ctx.save();
      roundRect(ctx, casingX, y, casingWidth, h, 3);
      ctx.clip();
      ctx.fillStyle = 'rgba(69,26,3,.55)';
      for (let py = y + 5; py < y + h; py += 8) {
        for (let px = casingX + 5; px < casingX + casingWidth; px += 8) {
          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      // Label saringan — mirip versi asli: garis + "Saringan (X m)" + detail kedalaman
      const labelX = casingX + casingWidth + 16;
      const centerY = y + h / 2;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(casingX + casingWidth, centerY);
      ctx.lineTo(labelX, centerY);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px Hanken Grotesk, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Saringan (${formatNumber(screen.size)} m)`, labelX + 4, centerY);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Hanken Grotesk, system-ui, sans-serif';
      ctx.fillText(`${formatNumber(screen.depth)} - ${formatNumber(screen.depth + screen.size)} m`, labelX + 4, centerY + 14);

      components.push({
        type: 'screen',
        title: `Saringan ${model.screens.indexOf(screen) + 1}`,
        x: casingX - 4,
        y,
        width: casingWidth + 8,
        height: h,
        detail: `${formatNumber(screen.depth)} – ${formatNumber(screen.depth + screen.size)} m · panjang ${formatNumber(screen.size)} m`,
      });
    }

    // Open hole — lubang bor terbuka tanpa casing/saringan.
    // Dibuat seperti borehole nyata: dinding formasi tidak berlapis pipa,
    // bagian tengah gelap sebagai ruang lubang dan tepi dibuat sedikit tidak beraturan.
    if (model.openHole) {
      const y = yAt(model.openHole.start);
      const h = Math.max(18, (model.openHole.end - model.openHole.start) * scale);
      const holeX = casingX + 3;
      const holeW = Math.max(22, casingWidth - 6);

      const wall = ctx.createLinearGradient(holeX, 0, holeX + holeW, 0);
      wall.addColorStop(0, '#7c5a3c');
      wall.addColorStop(0.18, '#a67c52');
      wall.addColorStop(0.5, '#5b4636');
      wall.addColorStop(0.82, '#9a7049');
      wall.addColorStop(1, '#684b34');

      // Dinding lubang yang sedikit tidak rata.
      ctx.beginPath();
      ctx.moveTo(holeX + 2, y);
      ctx.lineTo(holeX + holeW - 2, y);
      for (let i = 1; i <= 8; i += 1) {
        const yy = y + (h * i) / 8;
        const inset = (i % 2 === 0 ? 1.5 : 0);
        ctx.lineTo(holeX + holeW - inset, yy);
      }
      for (let i = 8; i >= 0; i -= 1) {
        const yy = y + (h * i) / 8;
        const inset = (i % 2 === 0 ? 1.5 : 0);
        ctx.lineTo(holeX + inset, yy);
      }
      ctx.closePath();
      ctx.fillStyle = wall;
      ctx.fill();

      // Ruang kosong/gelap di tengah lubang.
      const innerX = holeX + Math.max(4, holeW * 0.13);
      const innerW = Math.max(12, holeW - Math.max(8, holeW * 0.26));
      const inner = ctx.createLinearGradient(innerX, 0, innerX + innerW, 0);
      inner.addColorStop(0, '#111827');
      inner.addColorStop(0.5, '#27313a');
      inner.addColorStop(1, '#111827');
      ctx.fillStyle = inner;
      ctx.fillRect(innerX, y + 1, innerW, Math.max(1, h - 2));

      // Tekstur formasi/batu di dinding lubang.
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      for (let py = y + 7; py < y + h - 3; py += 12) {
        const leftX = holeX + 5 + ((Math.floor(py) * 7) % Math.max(8, holeW * 0.18));
        const rightX = holeX + holeW - 5 - ((Math.floor(py) * 5) % Math.max(8, holeW * 0.18));
        ctx.beginPath();
        ctx.arc(leftX, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightX, py + 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Tambahan: bebatuan di dasar lubang
      ctx.fillStyle = '#8b6e45';
      for (let i = 0; i < 5; i++) {
        const bx = holeX + 8 + (i * holeW) / 6 + (rnd() * 4 - 2);
        const by = y + h - 6 + (rnd() * 6);
        ctx.beginPath();
        ctx.arc(bx, by, 2 + rnd() * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = '#4b3626';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label open hole.
      const labelX = casingX + casingWidth + 20;
      const centerY = y + h / 2;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(casingX + casingWidth, centerY);
      ctx.lineTo(labelX, centerY);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px Hanken Grotesk, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Open Hole (${formatNumber(model.openHole.size)} m)`, labelX + 4, centerY);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Hanken Grotesk, system-ui, sans-serif';
      ctx.fillText(`${formatNumber(model.openHole.start)} - ${formatNumber(model.openHole.end)} m`, labelX + 4, centerY + 14);

      // Label Total Pipa di samping kanan bawah pipa terakhir
      const totalPipeLengthVal = totalPipeLength(model);
      if (model.pipes.length > 0) {
        const lastPipe = model.pipes[model.pipes.length - 1];
        const yLast = yAt(lastPipe.end);
        const hLast = Math.max(2, (lastPipe.end - lastPipe.start) * scale);
        const casingWidth = Math.max(34, Math.min(62, (lastPipe.diameter || 6) * 6));
        const casingX = WELL_X - casingWidth / 2;

        // Posisi label di samping kanan pipa terakhir
        const labelXTotal = casingX + casingWidth + 20;
        const centerYTotal = yLast + hLast / 2;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(casingX + casingWidth, centerYTotal);
        ctx.lineTo(labelXTotal, centerYTotal);
        ctx.stroke();

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 11px Hanken Grotesk, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Total Pipa (${formatNumber(totalPipeLengthVal)} m)`, labelXTotal + 4, centerYTotal);

        ctx.fillStyle = '#64748b';
        ctx.font = '10px Hanken Grotesk, system-ui, sans-serif';
        ctx.fillText(`${formatNumber(lastPipe.start)} - ${formatNumber(lastPipe.end)} m`, labelXTotal + 4, centerYTotal + 14);
      }

      // Label kedalaman total di ujung bawah canvas (fallback)
      const totalDepthVal = totalPipeLength(model);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px Hanken Grotesk, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Kedalaman total: ${formatNumber(totalDepthVal)} m`, 14, HEIGHT - BOTTOM / 2 + 12);

      components.push({
        type: 'openhole',
        title: 'Open Hole',
        x: holeX - 3,
        y,
        width: holeW + 6,
        height: h,
        detail: `${formatNumber(model.openHole.start)} – ${formatNumber(model.openHole.end)} m · panjang ${formatNumber(model.openHole.size)} m`,
      });
    }

    // Permukaan tanah — label + segitiga DI ATAS garis (garisnya sudah digambar di belakang pipa)
    if (model.ground !== null) {
      const y = yAt(model.ground);
      components.push({
        type: 'ground',
        title: 'Permukaan Tanah',
        x: 10,
        y: y - 5,
        width: WIDTH - 20,
        height: 10,
        detail: `Titik acuan ${formatNumber(model.ground)} m`,
      });
      // Segitiga tanah — hanya di luar area pipa biar tidak tertutup
      ctx.fillStyle = '#b45309';
      for (let x = 16; x < WIDTH - 16; x += 13) {
        const occupied = x + 13 > casingX - 6 && x < casingX + casingWidth + 6;
        if (occupied) continue;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6.5, y - 7);
        ctx.lineTo(x + 13, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = '700 11px Hanken Grotesk, system-ui, sans-serif';
      ctx.textAlign = 'left';
      haloText(ctx, 'Permukaan tanah', 20, y - 12, '#b45309');
    }

    // Muka air tanah — garis sudah digambar di belakang pipa (lihat blok di bawah).
    // Kita hanya tampilkan teks dan segitiga di atas garis.
    if (absoluteMat !== null) {
      const y = yAt(absoluteMat);
      components.push({
        type: 'mat',
        title: 'Muka Air Tanah (MAT)',
        x: 10,
        y: y - 5,
        width: WIDTH - 20,
        height: 10,
        detail: `${formatNumber(model.mat)} m dari muka tanah`,
      });
      ctx.font = '700 11px Hanken Grotesk, system-ui, sans-serif';
      ctx.textAlign = 'left';
      // Label MAT dibuat dua baris agar jelas dan tidak berulang:
      // baris pertama menunjukkan jarak, baris kedua hanya 'muka tanah'.
      haloText(ctx, model.mat >= 0
        ? `MAT: ${formatNumber(model.mat)} m dari`
        : `MAT: ${formatNumber(Math.abs(model.mat))} m di atas`, 20, y + 17, '#1d4ed8');
      haloText(ctx, 'muka tanah', 20, y + 31, '#1d4ed8');
      // Segitiga terbalik (▽) menempel di atas garis, sebelah kanan
      const triCX = WIDTH - 30;
      ctx.beginPath();
      ctx.moveTo(triCX - 7, y - 12);
      ctx.lineTo(triCX + 7, y - 12);
      ctx.lineTo(triCX, y - 1);
      ctx.closePath();
      ctx.fillStyle = '#1d4ed8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ==========================================================
    // Garis acuan sudah digambar DI BELAKANG pipa.
    // Pastikan garis permukaan tanah tetap menyentuh sisi casing.
    // ==========================================================
    if (model.ground !== null) {
      const groundY = yAt(model.ground);
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, groundY);
      ctx.lineTo(casingX + 2, groundY);
      ctx.moveTo(casingX + casingWidth - 2, groundY);
      ctx.lineTo(WIDTH - 14, groundY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    };

    const DURATION = 720;
    if (reduce) {
      render(1);
      done = true;
    } else {
      const startTime = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / DURATION);
        render(1 - (1 - t) ** 3);
        if (t < 1) raf = requestAnimationFrame(tick);
        else done = true;
      };
      raf = requestAnimationFrame(tick);
    }
    document.fonts?.ready.then(() => { if (!cancelled && done) render(1); });

    const hitTest = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const found = [...components].reverse().find((component) =>
        x >= component.x && x <= component.x + component.width &&
        y >= component.y && y <= component.y + component.height
      );

      if (found) {
        setHoveredComponent(found);
        setTooltip({
          x: Math.max(8, Math.min(event.clientX - rect.left + 14, rect.width - 190)),
          y: Math.max(8, Math.min(event.clientY - rect.top + 14, rect.height - 80)),
        });
      } else {
        setHoveredComponent(null);
        setTooltip(null);
      }
    };

    const handlePointerMove = (event) => hitTest(event);
    const handlePointerDown = (event) => hitTest(event);
    const handlePointerLeave = (event) => {
      if (event.pointerType === 'touch') return;
      setHoveredComponent(null);
      setTooltip(null);
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [model]);

  const typeLabel = {
    pipe: 'PIPA',
    screen: 'SARINGAN',
    openhole: 'OPEN HOLE',
    ground: 'PERMUKAAN TANAH',
    mat: 'MUKA AIR TANAH',
  };

  return (
    <div className="diagram-interactive">
      <div className="diagram-canvas-wrap">
        <div className="diagram-sheet">
          <canvas
            ref={(node) => {
              canvasRef.current = node;
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            aria-label="Diagram konstruksi sumur bor"
          />
          {hoveredComponent && tooltip && (
            <div
              className="diagram-tooltip"
              style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
            >
              <strong>{hoveredComponent.title}</strong>
              <span>{hoveredComponent.detail}</span>
            </div>
          )}
        </div>
      </div>

      <div className="component-info">
        <div className="component-info-heading">
          <span className="component-info-icon" aria-hidden="true">i</span>
          <div>
            <strong>Detail komponen</strong>
          </div>
        </div>
        <div className={`component-info-body ${hoveredComponent ? 'has-selection' : ''}`}>
          {hoveredComponent ? (
            <>
              <span className="component-type">{typeLabel[hoveredComponent.type] || 'KOMPONEN'}</span>
              <strong>{hoveredComponent.title}</strong>
              <span>{hoveredComponent.detail}</span>
            </>
          ) : (
            <span className="component-hint">Arahkan kursor atau ketuk pipa, saringan, dan open hole untuk melihat detailnya.</span>
          )}
        </div>
      </div>
    </div>
  );
});
