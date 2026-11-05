// Template PDF disamakan 100% dengan versi lama:
// https://github.com/denipurwanto10/visualisasi_pipa/blob/main/js/script.js
// https://visualisasi-pipa.vercel.app/
// Tampilan web (CSS/React) TIDAK diubah.

import {
  getEffectiveModelForPDF,
  groupExtraComponentsForPDF,
  designerToLegacy,
} from './designer/adapter.js';
import { COMPONENT_LABELS } from './designer/model.js';
import { MEASUREMENT_METHODS, REFERENCE_POINTS } from './monitoring/model.js';

// ---------------------------------------------------------------------------
// Tema PDF premium (netral — tanpa header/footer atau identitas perusahaan).
// ---------------------------------------------------------------------------
const PDF_THEME = {
  ink: [21, 32, 30],
  label: [52, 68, 64],
  muted: [112, 124, 120],
  teal: [13, 95, 90],
  line: [208, 215, 212],
  labelBg: [239, 243, 242],
  paper: [248, 250, 249],
};

function drawPdfTitle(pdf, text, x, y, { align = 'left', size = 15 } = {}) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(size);
  pdf.setTextColor(...PDF_THEME.ink);
  pdf.text(text, x, y, { align });
  const barX = align === 'center' ? x - 7 : x;
  pdf.setFillColor(...PDF_THEME.teal);
  pdf.rect(barX, y + 2.6, 14, 0.9, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
}

/** Aksen tipis di tepi atas + nomor halaman halus di setiap halaman. */
function finalizePdf(pdf, { skipFirst = false } = {}) {
  const total = pdf.getNumberOfPages();
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFillColor(...PDF_THEME.teal);
    pdf.rect(0, 0, W, 1.2, 'F');
    if (skipFirst && i === 1) continue;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...PDF_THEME.muted);
    pdf.text(`${i} / ${total}`, W / 2, H - 8, { align: 'center' });
  }
  pdf.setTextColor(0, 0, 0);
}

function formatNumber(num) {
  if (num === null || num === undefined || num === '-' || num === '') return '-';
  if (typeof num === 'string') {
    if (num === '-') return '-';
    num = parseFloat(num);
    if (isNaN(num)) return '-';
  }
  const formatted = Number(num).toFixed(2);
  return formatted.replace(/\.00$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
}

function getImageFormatFromDataURL(dataURL) {
  if (!dataURL || dataURL === '#' || dataURL === 'data:,') return null;
  if (dataURL.startsWith('data:image/png')) return 'PNG';
  if (dataURL.startsWith('data:image/jpeg') || dataURL.startsWith('data:image/jpg')) return 'JPEG';
  if (dataURL.startsWith('data:image/gif')) return 'GIF';
  if (dataURL.startsWith('data:image/webp')) return 'WEBP';
  if (dataURL.startsWith('data:image/bmp')) return 'BMP';
  if (dataURL.startsWith('data:image/tiff')) return 'TIFF';
  return 'JPEG';
}

function addImageToPDF(pdf, imgData, x, y, w, h) {
  if (!imgData || imgData === '#' || imgData === 'data:,') return false;
  const supportedFormats = ['JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'TIFF'];
  let format = getImageFormatFromDataURL(imgData);
  if (!supportedFormats.includes(format)) format = 'JPEG';
  try {
    pdf.addImage(imgData, format, x, y, w, h);
    return true;
  } catch (e) {
    try {
      pdf.addImage(imgData, 'PNG', x, y, w, h);
      return true;
    } catch (e2) {
      try {
        pdf.addImage(imgData, 'JPEG', x, y, w, h);
        return true;
      } catch (e3) {
        return false;
      }
    }
  }
}

function getBoreholeImageName(index) {
  const names = { 1: 'Ujung Pipa Awal', 2: 'Muka Air Tanah', 3: 'Batas Pipa', 4: 'Screen Perforasi', 5: 'Dasar Sumur Bor' };
  return names[index] || `Gambar ${index}`;
}

function getDocTitle(index) {
  const titles = {
    1: 'Papan Nama Lokasi Penyelidikan',
    2: 'Kenampakan Sumur Bor Produksi',
    3: 'Persiapan Pengukuran Borehole Camera',
    4: 'Kegiatan Pengukuran Borehole Camera',
    5: 'Ukuran Pipa PVC (Casing Sumur)',
    6: 'Pompa Submersible',
  };
  return titles[index] || `Dokumentasi ${index}`;
}

/**
 * Render construction diagram directly in PDF from model data.
 * This replaces the canvas-image approach to ensure Designer components are shown.
 */
function renderConstructionDiagram(pdf, x, y, w, h, legacyModel, extraComponents, groundLevel, matLevel, groundLevelSet, matSet) {
  const { pipes, screens, openHole } = legacyModel;

  // Calculate depths for scaling
  let maxDepth = 0;
  for (const p of pipes) maxDepth = Math.max(maxDepth, p.end);
  for (const s of screens) maxDepth = Math.max(maxDepth, s.depth + s.size);
  if (openHole) maxDepth = Math.max(maxDepth, openHole.endDepth);
  if (groundLevelSet) maxDepth = Math.max(maxDepth, groundLevel);
  if (matSet) maxDepth = Math.max(maxDepth, groundLevel + matLevel);
  if (maxDepth === 0) maxDepth = 10;

  // Also consider extra components (gravel pack, cement, markers)
  for (const comp of extraComponents) {
    const d = comp.endDepth !== undefined ? comp.endDepth : comp.startDepth;
    if (Number.isFinite(d)) maxDepth = Math.max(maxDepth, d);
  }

  const plotTop = y + 15;
  const plotBottom = y + h - 10;
  const plotLeft = x + 25; // Space for depth ruler
  const plotRight = x + w - 5;
  const wellAxisPx = plotLeft + (plotRight - plotLeft) * 0.3; // Well on left side
  const scale = (plotBottom - plotTop) / maxDepth;

  const depthToPixel = (depth) => plotTop + depth * scale;
  const mmToPx = (mm) => mm * 0.15; // Scale factor for diameter

  // Helper: draw rounded rectangle using rect + lines (jsPDF doesn't have roundedRect in all versions)
  function drawRoundedRect(px, py, pw, ph, r, style) {
    const radius = Math.min(r, pw / 2, ph / 2);
    if (pw < 2 * radius || ph < 2 * radius) {
      pdf.rect(px, py, pw, ph, style);
      return;
    }
    // Draw as rect with rounded corners approximation
    pdf.rect(px + radius, py, pw - 2 * radius, ph, style);
    pdf.rect(px, py + radius, radius, ph - 2 * radius, style);
    pdf.rect(px + pw - radius, py + radius, radius, ph - 2 * radius, style);
    // Corner quarters (approximate with filled rects for simplicity)
    pdf.rect(px, py, radius, radius, style);
    pdf.rect(px + pw - radius, py, radius, radius, style);
    pdf.rect(px, py + ph - radius, radius, radius, style);
    pdf.rect(px + pw - radius, py + ph - radius, radius, radius, style);
  }

  // Helper: draw circle using ellipse
  function drawCircle(cx, cy, r, style) {
    pdf.ellipse(cx, cy, r, r, style);
  }

  // Helper: draw triangle using lines
  function drawTriangle(x1, y1, x2, y2, x3, y3, style) {
    pdf.setDrawColor(0, 0, 0); // Will be overridden by fill/draw settings
    pdf.line(x1, y1, x2, y2);
    pdf.line(x2, y2, x3, y3);
    pdf.line(x3, y3, x1, y1);
    if (style && style.includes('F')) {
      // Fill triangle - use polygon fill via lines (simplified)
      // For jsPDF, we can't easily fill arbitrary polygons, so skip fill for triangles
    }
  }

  // Background
  pdf.setFillColor(248, 250, 252);
  pdf.rect(x, y, w, h, 'F');

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text('GAMBAR KONSTRUKSI SUMUR BOR', x + w / 2, y + 8, { align: 'center' });

  // Depth ruler
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.5);
  pdf.line(plotLeft - 10, plotTop, plotLeft - 10, plotBottom);

  const step = maxDepth > 200 ? 20 : maxDepth > 100 ? 10 : 5;
  const firstTick = Math.ceil(0 / step) * step;
  for (let value = firstTick; value <= maxDepth + 0.001; value += step) {
    const py = depthToPixel(value);
    const major = value % (step * 2) === 0;
    pdf.setDrawColor(major ? 71 : 148, major ? 85 : 163, major ? 105 : 184);
    pdf.setLineWidth(major ? 0.6 : 0.3);
    pdf.line(plotLeft - 10, py, plotLeft - (major ? 5 : 3), py);
    pdf.setFont('helvetica', major ? 'bold' : 'normal');
    pdf.setFontSize(major ? 7 : 6);
    pdf.setTextColor(major ? 30 : 100, major ? 41 : 100, major ? 59 : 112);
    pdf.text(`${formatNumber(value)} m`, plotLeft - 12, py + 1.5, { align: 'right' });
  }

  // Ground line
  if (groundLevelSet) {
    const gy = depthToPixel(groundLevel);
    pdf.setDrawColor(180, 119, 6);
    pdf.setLineWidth(0.6);
    pdf.setLineDashPattern([2, 1.5]);
    pdf.line(plotLeft, gy, plotRight, gy);
    pdf.setLineDashPattern([]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.setTextColor(180, 119, 6);
    pdf.text(`Permukaan tanah (${formatNumber(groundLevel)} m)`, plotLeft, gy - 2);
  }

  // MAT line
  if (matSet) {
    const absMat = groundLevel + matLevel;
    const my = depthToPixel(absMat);
    pdf.setDrawColor(59, 130, 246);
    pdf.setLineWidth(0.6);
    pdf.setLineDashPattern([2, 1.5]);
    pdf.line(plotLeft, my, plotRight, my);
    pdf.setLineDashPattern([]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.setTextColor(59, 130, 246);
    pdf.text(`MAT (${formatNumber(matLevel)} m)`, plotLeft, my + 3);
  }

  // Draw pipes/casings
  for (const pipe of pipes) {
    const py = depthToPixel(pipe.start);
    const ph = (pipe.end - pipe.start) * scale;
    const casingWidth = Math.max(10, Math.min(20, mmToPx(pipe.diameter * 25.4))); // Convert inch to mm then to px

    const cx = wellAxisPx - casingWidth / 2;

    // Casing body
    pdf.setFillColor(71, 85, 105);
    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(0.4);
    drawRoundedRect(cx, py, casingWidth, ph, 1, 'FD');

    // Joint rings
    pdf.setFillColor(30, 41, 59);
    pdf.rect(cx, py, casingWidth, 1, 'F');
    if (ph > 3) pdf.rect(cx, py + ph - 1, casingWidth, 1, 'F');

    // Label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.setTextColor(0, 0, 0);
    const labelX = wellAxisPx + casingWidth / 2 + 3;
    const labelY = py + ph / 2;
    pdf.text(`${formatNumber(pipe.diameter)}″`, labelX, labelY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${formatNumber(pipe.start)}–${formatNumber(pipe.end)} m`, labelX, labelY + 3);
  }

  // Draw screens
  for (const screen of screens) {
    const py = depthToPixel(screen.depth);
    const ph = screen.size * scale;
    // Use last pipe's casing width or default
    const lastPipe = pipes[pipes.length - 1];
    const casingWidth = lastPipe ? Math.max(10, Math.min(20, mmToPx(lastPipe.diameter * 25.4))) : 15;
    const cx = wellAxisPx - casingWidth / 2;

    // Screen body (orange/brown)
    pdf.setFillColor(180, 83, 10);
    pdf.setDrawColor(120, 53, 15);
    pdf.setLineWidth(0.4);
    drawRoundedRect(cx - 1, py, casingWidth + 2, ph, 1, 'FD');

    // Perforation pattern (simplified) - use small rects instead of circles
    pdf.setFillColor(110, 42, 3);
    for (let sy = py + 2; sy < py + ph - 2; sy += Math.max(2, ph / 10)) {
      for (let sx = cx + 1; sx < cx + casingWidth - 1; sx += Math.max(2, casingWidth / 5)) {
        pdf.rect(sx - 0.5, sy - 0.5, 1, 1, 'F');
      }
    }

    // Label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.setTextColor(0, 0, 0);
    const labelX = wellAxisPx + casingWidth / 2 + 3;
    const labelY = py + ph / 2;
    pdf.text('Screen', labelX, labelY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${formatNumber(screen.depth)}–${formatNumber(screen.depth + screen.size)} m`, labelX, labelY + 3);
  }

  // Draw open hole
  if (openHole) {
    const py = depthToPixel(openHole.startDepth);
    const ph = (openHole.endDepth - openHole.startDepth) * scale;
    const holeWidth = Math.max(8, 12); // Fixed width for open hole
    const hx = wellAxisPx + 3;

    // Open hole walls (brown) - draw as trapezoid using rect + lines
    pdf.setFillColor(124, 90, 60);
    pdf.setDrawColor(75, 54, 38);
    pdf.setLineWidth(0.4);
    const topW = holeWidth;
    const botW = holeWidth * 1.2;
    // Draw as filled rect (approximation) + outline lines
    pdf.rect(hx, py, topW, ph, 'F');
    // Outline the trapezoid
    pdf.line(hx, py, hx + topW, py);
    pdf.line(hx + topW, py, hx + botW, py + ph);
    pdf.line(hx + botW, py + ph, hx, py + ph);
    pdf.line(hx, py + ph, hx, py);

    // Inner dark
    pdf.setFillColor(17, 24, 39);
    pdf.rect(hx + 2, py + 1, Math.max(1, topW - 4), Math.max(1, ph - 2), 'F');

    // Label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.setTextColor(0, 0, 0);
    const labelX = hx + botW + 3;
    const labelY = py + ph / 2;
    pdf.text('Open Hole', labelX, labelY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${formatNumber(openHole.startDepth)}–${formatNumber(openHole.endDepth)} m`, labelX, labelY + 3);
  }

  // Draw extra components (gravel pack, cement grouting, markers)
  for (const comp of extraComponents) {
    const startY = depthToPixel(comp.startDepth);
    const endY = comp.endDepth !== undefined ? depthToPixel(comp.endDepth) : startY;
    const height = Math.max(3, endY - startY);
    const lastPipe = pipes[pipes.length - 1];
    const casingWidth = lastPipe ? Math.max(10, Math.min(20, mmToPx(lastPipe.diameter * 25.4))) : 15;
    const cx = wellAxisPx - casingWidth / 2;

    if (comp.type === 'gravel_pack') {
      // Annular zone around screen (orange)
      pdf.setFillColor(217, 119, 6);
      pdf.setDrawColor(180, 83, 10);
      pdf.setLineWidth(0.3);
      pdf.setLineDashPattern([1, 1]);
      drawRoundedRect(cx - 3, startY, casingWidth + 6, height, 1, 'FD');
      pdf.setLineDashPattern([]);
      // Label
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5);
      pdf.setTextColor(180, 83, 10);
      pdf.text('Pasir Filter', wellAxisPx + casingWidth / 2 + 3, startY + height / 2);
    } else if (comp.type === 'cement_grouting') {
      // Annular zone at top (light gray)
      pdf.setFillColor(226, 232, 240);
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.3);
      pdf.setLineDashPattern([1, 1]);
      drawRoundedRect(cx - 3, startY, casingWidth + 6, height, 1, 'FD');
      pdf.setLineDashPattern([]);
      // Label
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5);
      pdf.setTextColor(100, 100, 100);
      pdf.text('Semen Rekat', wellAxisPx + casingWidth / 2 + 3, startY + height / 2);
    } else if (['well_cap', 'submersible_pump', 'pump_position', 'water_level_marker'].includes(comp.type)) {
      // Markers
      const markerColors = {
        well_cap: [30, 41, 59],
        submersible_pump: [59, 130, 246],
        pump_position: [37, 99, 235],
        water_level_marker: [8, 145, 178],
      };
      const markerLabels = {
        well_cap: 'Tutup Sumur',
        submersible_pump: 'Pompa',
        pump_position: 'Pos. Pompa',
        water_level_marker: 'MAT',
      };
      const color = markerColors[comp.type] || [100, 100, 100];
      const label = markerLabels[comp.type] || comp.type;

      pdf.setFillColor(...color);
      pdf.setDrawColor(...color.map(c => Math.max(0, c - 30)));
      pdf.setLineWidth(0.4);
      const markerSize = 5;
      const mx = wellAxisPx;
      const my = startY;
      drawCircle(mx, my, markerSize / 2, 'FD');

      // Label
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5);
      pdf.setTextColor(...color);
      pdf.text(label, mx + 4, my + 1);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(4);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${formatNumber(comp.startDepth)} m`, mx + 4, my + 3);
    }
  }

  // Total depth label at bottom
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(30, 41, 59);
  const totalDepth = pipes.length ? pipes[pipes.length - 1].end : (openHole ? openHole.endDepth : maxDepth);
  pdf.text(`Kedalaman total: ${formatNumber(totalDepth)} m`, plotLeft, plotBottom + 5);
}

/**
 * Render a geological log column (vertical borehole log) for the PDF.
 * One page, only when there is at least one layer.
 */
function renderGeologicalLog(pdf, x, y, w, h, geology, well, project) {
  const { layers = [] } = geology || {};
  const validLayers = (layers || [])
    .map((l) => ({ ...l, startDepth: Number(l.startDepth) || 0, endDepth: Number(l.endDepth) || 0 }))
    .filter((l) => Number.isFinite(l.startDepth) && Number.isFinite(l.endDepth) && l.endDepth > l.startDepth)
    .sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);

  if (validLayers.length === 0) return;

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(248, 250, 252);
  pdf.rect(x, y, w, h, 'F');

  // Title
  drawPdfTitle(pdf, 'LOG GEOLOGI SUMUR BOR', pageW / 2, y + 12, { align: 'center', size: 15 });

  // Well / project meta
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);
  const meta = [
    `Sumur: ${well?.wellName || '-'} (${well?.wellCode || '-'})`,
    `Proyek: ${project?.projectName || '-'} (${project?.projectCode || '-'})`,
    `Unit kedalaman: meter`,
  ];
  let my = y + 20;
  for (const m of meta) {
    pdf.text(m, x, my);
    my += 6;
  }

  // Compute scale for the column
  let maxDepth = 0;
  for (const l of validLayers) if (l.endDepth > maxDepth) maxDepth = l.endDepth;
  if (maxDepth === 0) maxDepth = 10;

  const plotTop = y + 42;
  const plotBottom = y + h - (34 + Math.min(validLayers.length, 8) * 7);
  const rulerLeft = x + 12;
  const rulerWidth = 30;
  const colLeft = rulerLeft + rulerWidth;
  const colRight = x + w - 14;
  const colWidth = colRight - colLeft;
  const scale = (plotBottom - plotTop) / maxDepth;

  const depthToPixel = (depth) => plotTop + depth * scale;

  // Depth ruler
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.5);
  pdf.line(rulerLeft + rulerWidth, plotTop, rulerLeft + rulerWidth, plotBottom);
  const step = maxDepth > 200 ? 20 : maxDepth > 100 ? 10 : 5;
  const firstTick = Math.ceil(0 / step) * step;
  for (let value = firstTick; value <= maxDepth + 0.001; value += step) {
    const py = depthToPixel(value);
    const major = value % (step * 2) === 0;
    pdf.setDrawColor(major ? 71 : 148, major ? 85 : 163, major ? 105 : 184);
    pdf.setLineWidth(major ? 0.6 : 0.3);
    pdf.line(rulerLeft + rulerWidth, py, rulerLeft + rulerWidth - (major ? 6 : 3), py);
    pdf.setFont('helvetica', major ? 'bold' : 'normal');
    pdf.setFontSize(major ? 7 : 6);
    pdf.setTextColor(major ? 30 : 100, major ? 41 : 100, major ? 59 : 112);
    pdf.text(`${formatNumber(value)} m`, rulerLeft + rulerWidth - 8, py + 1.5, { align: 'right' });
  }

  // Draw each layer column
  for (const l of validLayers) {
    const py = depthToPixel(l.startDepth);
    const ey = depthToPixel(l.endDepth);
    let ph = Math.max(2, ey - py);
    // minimum visible thickness
    if (ph < 2) ph = 2;

    const mat = getMaterialForPdf(l.material);
    pdf.setFillColor(mat.r, mat.g, mat.b);
    pdf.setDrawColor(50, 50, 50);
    pdf.setLineWidth(0.4);
    pdf.rect(colLeft, py, colWidth, ph, 'FD');

    // Pattern overlay (light hatch)
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.3);
    if (l.pattern === 'clay' || l.pattern === 'silty-clay') {
      for (let yy = py + 4; yy < py + ph - 2; yy += 4) { pdf.line(colLeft + 2, yy, colRight - 2, yy); }
    } else if (l.pattern === 'silt' || l.pattern === 'sandy-silt') {
      for (let yy = py + 4; yy < py + ph - 2; yy += 5) {
        for (let xx = colLeft + 4; xx < colRight - 2; xx += 5) { pdf.circle(xx, yy, 0.7); }
      }
    } else if (l.pattern === 'gravel' || l.pattern === 'sandy-gravel') {
      for (let yy = py + 5; yy < py + ph - 2; yy += 6) {
        for (let xx = colLeft + 5; xx < colRight - 2; xx += 7) { pdf.circle(xx, yy, 1.1); }
      }
    } else if (['sandstone','limestone','shale','mudstone','granite','basalt','conglomerate'].includes(l.pattern)) {
      for (let yy = py; yy < py + ph; yy += 6) {
        const off = (Math.floor((yy - py) / 6) % 2) * 3;
        for (let xx = colLeft + off; xx < colRight - 2; xx += 6) { pdf.rect(xx, yy, 5, 5); }
      }
    }

    // Label centered if thick enough
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(0, 0, 0);
    const cy = py + ph / 2;
    if (ph > 10) {
      pdf.text(l.name || mat.label, colLeft + colWidth / 2, cy, { align: 'center' });
      if (ph > 16) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.5);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`${formatNumber(l.startDepth)}–${formatNumber(l.endDepth)} m`, colLeft + colWidth / 2, cy + 4);
      }
    }

    // Depth ticks on right side of column
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.3);
    pdf.line(colRight, py, colRight + 4, py);
    pdf.line(colRight, ey, colRight + 4, ey);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${formatNumber(l.startDepth)}`, colRight + 6, py + 1.5);
    pdf.text(`${formatNumber(l.endDepth)}`, colRight + 6, ey + 1.5);
  }

  // Bottom axis
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.8);
  pdf.line(colLeft, plotBottom, colRight, plotBottom);

  // Layer summary table below the column
  const tableTop = plotBottom + 14;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Tabel Lapisan Geologi', x, tableTop);

  const colW = [
    20, // start
    20, // end
    20, // tebal
    32, // material
    36, // nama
    w - 20 - 20 - 20 - 32 - 36, // keterangan
  ];
  const headers = ['Mulai (m)', 'Akhir (m)', 'Tebal (m)', 'Material', 'Nama Lapisan', 'Keterangan'];
  let ty = tableTop + 8;
  const rowH = 7;
  const tableX = x;
  // header
  pdf.setFillColor(21, 32, 30);
  pdf.rect(tableX, ty, colW.reduce((a,b)=>a+b,0), rowH, 'F');
  pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(6.5);
  let hx = tableX + 3;
  headers.forEach((h, i) => { pdf.text(h, hx, ty + rowH/2 + 1.5); hx += colW[i]; });
  pdf.setTextColor(0,0,0);
  ty += rowH;

  // rows
  for (const l of validLayers) {
    const mat = getMaterialForPdf(l.material);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const row = [
      formatNumber(l.startDepth),
      formatNumber(l.endDepth),
      formatNumber(l.endDepth - l.startDepth),
      mat.label,
      l.name || mat.label,
      l.description || l.formation || '-',
    ];
    hx = tableX + 3;
    row.forEach((cell, i) => {
      const fitted = pdf.splitTextToSize(String(cell), colW[i] - 4)[0] || '';
      pdf.text(fitted, hx, ty + rowH/2 + 1.5);
      hx += colW[i];
    });
    pdf.setDrawColor(...PDF_THEME.line);
    pdf.setLineWidth(0.15);
    pdf.line(tableX, ty + rowH, tableX + colW.reduce((p, c) => p + c, 0), ty + rowH);
    ty += rowH;
    if (ty > y + h - 6) break;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
}

/**
 * Render groundwater monitoring section for the PDF.
 * Includes summary statistics, measurement history table, and simple hydrograph.
 */
function renderGroundwaterMonitoring(pdf, x, y, w, h, monitoring, well, project, wellDepthMeters) {
  const { measurements = [] } = monitoring || {};
  const validMeasurements = (measurements || [])
    .filter(m => m.status === 'valid' && Number.isFinite(m.waterLevelDepth))
    .map(m => ({ ...m, measuredAt: new Date(m.measuredAt) }))
    .sort((a, b) => a.measuredAt - b.measuredAt);

  if (validMeasurements.length === 0) return;

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(248, 250, 252);
  pdf.rect(x, y, w, h, 'F');

  // Title
  drawPdfTitle(pdf, 'MONITORING MUKA AIR TANAH', pageW / 2, y + 12, { align: 'center', size: 15 });

  // Well / project meta
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);
  const meta = [
    `Sumur: ${well?.wellName || '-'} (${well?.wellCode || '-'})`,
    `Proyek: ${project?.projectName || '-'} (${project?.projectCode || '-'})`,
    `Unit kedalaman: meter`,
  ];
  let my = y + 20;
  for (const m of meta) {
    pdf.text(m, x, my);
    my += 6;
  }

  // Statistics summary
  const depths = validMeasurements.map(m => m.waterLevelDepth);
  const latest = validMeasurements[validMeasurements.length - 1];
  const previous = validMeasurements.length > 1 ? validMeasurements[validMeasurements.length - 2] : null;
  const change = previous && previous.referencePoint === latest.referencePoint
    ? latest.waterLevelDepth - previous.waterLevelDepth
    : null;

  const refPointLabel = REFERENCE_POINTS[latest.referencePoint]?.label || latest.referencePoint;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Ringkasan Statistik', x, my);
  my += 6;

  const statData = [
    ['Total Pengukuran', String(validMeasurements.length)],
    ['Kedalaman Terbaru', `${latest.waterLevelDepth.toFixed(2)} m (${refPointLabel})`],
    ['Minimum', `${Math.min(...depths).toFixed(2)} m`],
    ['Maksimum', `${Math.max(...depths).toFixed(2)} m`],
    ['Rata-rata', `${(depths.reduce((a,b)=>a+b,0)/depths.length).toFixed(2)} m`],
    ['Perubahan Terakhir', change !== null ? (change > 0 ? `+${change.toFixed(2)} m (turun)` : `${change.toFixed(2)} m (naik)`) : '—'],
    ['Pengukuran Pertama', latest ? latest.measuredAt.toLocaleDateString('id-ID') : '—'],
    ['Pengukuran Terbaru', latest ? validMeasurements[validMeasurements.length - 1].measuredAt.toLocaleDateString('id-ID') : '—'],
  ];

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  for (const [label, value] of statData) {
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${label}:`, x, my);
    pdf.setTextColor(0, 0, 0);
    pdf.text(value, x + 50, my);
    my += 5;
  }

  my += 4;

  // Reference point warning if mixed
  const refPoints = new Set(validMeasurements.map(m => m.referencePoint));
  if (refPoints.size > 1) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(180, 119, 6);
    pdf.text('PERINGATAN: Data mengandung beberapa titik referensi berbeda. Perbandingan kedalaman langsung tidak valid tanpa koreksi elevasi.', x, my);
    my += 6;
    pdf.setTextColor(0, 0, 0);
  }

  // Measurement history table
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Riwayat Pengukuran', x, my);
  my += 6;

  const colW = [28, 22, 22, 28, 25, w - 28 - 22 - 22 - 28 - 25 - 10];
  const headers = ['Tanggal & Waktu', 'Kedalaman (m)', 'Perubahan (m)', 'Titik Referensi', 'Metode', 'Catatan'];
  const rowH = 6;
  const tableX = x;

  // Header
  pdf.setFillColor(21, 32, 30);
  pdf.rect(tableX, my, colW.reduce((a,b)=>a+b,0), rowH, 'F');
  pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(6);
  let hx = tableX + 2;
  headers.forEach((h, i) => { pdf.text(h, hx, my + rowH/2 + 1); hx += colW[i]; });
  pdf.setTextColor(0,0,0);
  my += rowH;

  // Rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  for (let i = 0; i < validMeasurements.length; i++) {
    const m = validMeasurements[i];
    const prev = i > 0 ? validMeasurements[i - 1] : null;
    const rowChange = prev && prev.referencePoint === m.referencePoint
      ? m.waterLevelDepth - prev.waterLevelDepth
      : null;
    const methodLabel = MEASUREMENT_METHODS[m.method]?.label || m.method;
    const refLabel = REFERENCE_POINTS[m.referencePoint]?.label || m.referencePoint;

    const row = [
      m.measuredAt.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      m.waterLevelDepth.toFixed(2),
      rowChange !== null ? (rowChange > 0 ? `+${rowChange.toFixed(2)}` : rowChange.toFixed(2)) : '—',
      refLabel,
      methodLabel,
      m.notes || '-',
    ];
    hx = tableX + 2;
    row.forEach((cell, j) => {
      pdf.text(cell, hx, my + rowH/2 + 1);
      hx += colW[j];
    });
    my += rowH;
    if (my > y + h - 30) break;
  }

  my += 6;

  // Simple hydrograph (mini chart)
  if (validMeasurements.length > 1 && my < y + h - 80) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Hidrograf (Ringkas)', x, my);
    my += 6;

    const plotLeft = x + 10;
    const plotRight = x + w - 10;
    const plotTop = my;
    const plotBottom = Math.min(my + 50, y + h - 20);
    const plotHeight = plotBottom - plotTop;

    const minDepth = Math.min(...depths);
    const maxDepth = Math.max(...depths, wellDepthMeters > 0 ? wellDepthMeters : 0);
    const depthRange = maxDepth - minDepth || 1;
    const minTime = validMeasurements[0].measuredAt.getTime();
    const maxTime = validMeasurements[validMeasurements.length - 1].measuredAt.getTime();
    const timeRange = maxTime - minTime || 1;

    const depthToPixel = (d) => plotTop + (1 - (d - minDepth) / depthRange) * plotHeight;
    const timeToPixel = (t) => plotLeft + ((t - minTime) / timeRange) * (plotRight - plotLeft);

    // Background
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.rect(plotLeft, plotTop, plotRight - plotLeft, plotHeight, 'FD');

    // Depth grid lines
    pdf.setDrawColor(230, 230, 230);
    const depthStep = (maxDepth - minDepth) > 20 ? 5 : (maxDepth - minDepth) > 10 ? 2 : 1;
    const firstTick = Math.ceil(minDepth / depthStep) * depthStep;
    for (let d = firstTick; d <= maxDepth + 0.001; d += depthStep) {
      const py = depthToPixel(d);
      pdf.line(plotLeft, py, plotRight, py);
    }

    // Time grid lines
    const timeStep = timeRange / 4;
    for (let j = 0; j <= 4; j++) {
      const px = plotLeft + j * (plotRight - plotLeft) / 4;
      pdf.line(px, plotTop, px, plotBottom);
    }

    // Axis
    pdf.setDrawColor(100, 100, 100);
    pdf.setLineWidth(0.5);
    pdf.line(plotLeft, plotTop, plotLeft, plotBottom);
    pdf.line(plotLeft, plotBottom, plotRight, plotBottom);

    // Depth labels (left)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(80, 80, 80);
    for (let d = firstTick; d <= maxDepth + 0.001; d += depthStep) {
      const py = depthToPixel(d);
      pdf.text(`${d.toFixed(1)}`, plotLeft - 2, py + 1, { align: 'right' });
    }

    // Time labels (bottom)
    pdf.setTextColor(80, 80, 80);
    for (let j = 0; j <= 4; j++) {
      const t = new Date(minTime + j * timeRange / 4);
      const px = plotLeft + j * (plotRight - plotLeft) / 4;
      pdf.text(t.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }), px, plotBottom + 3, { align: 'center' });
    }

    // Line connecting points
    pdf.setDrawColor(13, 95, 90);
    pdf.setLineWidth(1);
    pdf.setLineDashPattern([], 0);
    for (let i = 1; i < validMeasurements.length; i++) {
      const m0 = validMeasurements[i - 1];
      const m1 = validMeasurements[i];
      const px0 = timeToPixel(m0.measuredAt.getTime());
      const py0 = depthToPixel(m0.waterLevelDepth);
      const px1 = timeToPixel(m1.measuredAt.getTime());
      const py1 = depthToPixel(m1.waterLevelDepth);
      pdf.line(px0, py0, px1, py1);
    }

    // Data points
    pdf.setFillColor(13, 95, 90);
    for (const m of validMeasurements) {
      const px = timeToPixel(m.measuredAt.getTime());
      const py = depthToPixel(m.waterLevelDepth);
      pdf.circle(px, py, 1.5, 'FD');
    }

    // Well depth line
    if (wellDepthMeters > 0 && wellDepthMeters >= minDepth && wellDepthMeters <= maxDepth) {
      const py = depthToPixel(wellDepthMeters);
      pdf.setDrawColor(255, 107, 53);
      pdf.setLineWidth(0.5);
      pdf.setLineDashPattern([2, 2], 0);
      pdf.line(plotLeft, py, plotRight, py);
      pdf.setLineDashPattern([], 0);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5);
      pdf.setTextColor(255, 107, 53);
      pdf.text(`Kedalaman Sumur: ${wellDepthMeters.toFixed(1)} m`, plotLeft, py - 2);
    }

    my = plotBottom + 8;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
}

const MATERIAL_COLORS = {
  topsoil: [124, 90, 60], clay: [180, 83, 10], siltyClay: [217, 119, 6], silt: [234, 179, 8],
  sandySilt: [202, 138, 4], fineSand: [245, 158, 11], mediumSand: [217, 119, 6], coarseSand: [180, 83, 10],
  gravel: [146, 64, 14], sandyGravel: [120, 53, 15], sandstone: [194, 65, 12], limestone: [107, 114, 128],
  shale: [55, 65, 81], mudstone: [75, 85, 99], granite: [156, 163, 175], basalt: [31, 41, 55],
  conglomerate: [120, 53, 15], weatheredRock: [168, 114, 146], fracturedRock: [75, 85, 99],
  fillMaterial: [107, 114, 128], unknownMaterial: [156, 163, 175],
};

function getMaterialForPdf(material) {
  const c = MATERIAL_COLORS[material] || [156, 163, 175];
  return { r: c[0], g: c[1], b: c[2], label: material };
}

export async function downloadBoreholePdf({ model, well, activity, canvas, project, designer, geology, _reportConfig }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // If report config is provided, generate the new comprehensive report
  if (_reportConfig) {
    return await generateWellCompletionReport(pdf, {
      model, well, activity, canvas, project, designer, geology,
      ..._reportConfig,
    });
  }

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const tableW = 155;
  const tableOffsetX = (pageW - tableW) / 2;

  // --- mapping data React -> variabel legacy (js/script.js) ---
  const companyName = well?.companyName || '-';
  const shallowWellNumber = well?.shallowWellNumber || '-';
  const wellNumber = well?.wellNumber || '-';
  const companyAddress = well?.address || '-';
  const province = well?.province || '-';
  const city = well?.city || '-';
  const district = well?.district || '-';
  const village = well?.village || '-';
  const latitude = well?.latitude || '-';
  const longitude = well?.longitude || '-';
  const elevation = well?.elevation || '-';
  const boreholeDate = well?.boreholeDate || '-';
  const piezoDistance = well?.piezoDistance || '-';
  const pumpType = well?.pumpType || '-';
  const pumpPosition = well?.pumpPosition || '-';

  // Project info
  const projectName = project?.projectName || '-';
  const projectCode = project?.projectCode || '-';
  const clientName = project?.clientName || '-';
  const contractorName = project?.contractorName || '-';
  const projectLocation = project?.location || '-';

  // Get effective model (Designer -> Legacy, or Legacy fallback)
  const wellDataForAdapter = { model: { ...model, designer } };
  const { legacyModel, extraComponents, source } = getEffectiveModelForPDF(wellDataForAdapter);
  const extraGroups = groupExtraComponentsForPDF(extraComponents);

  const pipeSegments = (legacyModel.pipes || []).slice().sort((a, b) => a.start - b.start);
  const saringanPosisi = (legacyModel.screens || []).slice().sort((a, b) => a.depth - b.depth);
  const groundLevel = legacyModel.ground;
  const groundLevelSet = legacyModel.ground !== null && legacyModel.ground !== undefined;
  const matLevel = legacyModel.mat;
  const matSet = legacyModel.mat !== null && legacyModel.mat !== undefined;
  const openHole = legacyModel.openHole
    ? { startDepth: Number(legacyModel.openHole.start), endDepth: Number(legacyModel.openHole.end), size: Number(legacyModel.openHole.size) }
    : null;
  const currentDepth = pipeSegments.length ? pipeSegments[pipeSegments.length - 1].end : 0;
  const activityImages = activity || {};
  const boreholeImages = well?.boreholeImages || {};

  let formattedDate = boreholeDate;
  if (boreholeDate && boreholeDate !== '-') {
    try {
      const date = new Date(boreholeDate);
      formattedDate = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      formattedDate = boreholeDate;
    }
  }

  let totalPipeLength = 0;
  let pipeInfo = '-';
  if (pipeSegments.length > 0) {
    totalPipeLength = pipeSegments.reduce((t, p) => t + (Number(p.end) - Number(p.start)), 0);
    const diameters = [...new Set(pipeSegments.map((p) => p.diameter || '-'))].join(', ');
    pipeInfo = diameters || '-';
  }

  let screenInfo = '-';
  if (saringanPosisi.length > 0) {
    screenInfo = saringanPosisi
      .slice()
      .sort((a, b) => a.depth - b.depth)
      .map((s) => {
        const sEnd = Number(s.depth) + Number(s.size);
        if (groundLevelSet) {
          const relStart = Number(s.depth) - Number(groundLevel);
          const relEnd = sEnd - Number(groundLevel);
          return `${formatNumber(relStart)} - ${formatNumber(relEnd)} m.bmt`;
        }
        return `${formatNumber(s.depth)} - ${formatNumber(sEnd)} m`;
      })
      .join(', ');
  }

  let pipeTopInfo = '-';
  if (pipeSegments.length > 0 && groundLevelSet) {
    const firstPipe = pipeSegments[0];
    const pipeTopRel = Number(firstPipe.start) - Number(groundLevel);
    if (pipeTopRel >= 0) pipeTopInfo = `${formatNumber(pipeTopRel)} m.bmt`;
    else pipeTopInfo = `${formatNumber(Math.abs(pipeTopRel))} m di atas tanah`;
  }

  let kedalamanSumur = '-';
  if (currentDepth > 0) {
    if (openHole) kedalamanSumur = `${formatNumber(openHole.endDepth)} m.bmt`;
    else kedalamanSumur = `${formatNumber(currentDepth)} m.bmt`;
  }

  // Well depth for monitoring hydrograph (max of pipes, screens, openHole, designer components)
  let wellDepthMeters = currentDepth;
  if (openHole && Number.isFinite(openHole.endDepth)) wellDepthMeters = Math.max(wellDepthMeters, openHole.endDepth);
  // Check designer components for deeper elements
  if (designer?.components) {
    for (const c of designer.components) {
      const d = c.endDepth || c.startDepth || 0;
      if (d > wellDepthMeters) wellDepthMeters = d;
    }
  }
  if (model?.designer?.components) {
    for (const c of model.designer.components) {
      const d = c.endDepth || c.startDepth || 0;
      if (d > wellDepthMeters) wellDepthMeters = d;
    }
  }

  function drawCell(x, y, w, h, opts = {}) {
    if (opts.fill) { pdf.setFillColor(...opts.fill); pdf.rect(x, y, w, h, 'F'); }
    pdf.setDrawColor(...PDF_THEME.line); pdf.setLineWidth(0.15); pdf.rect(x, y, w, h, 'S');
  }

  function cellText(text, x, y, w, h, opts = {}) {
    const fontSize = opts.fontSize || 8;
    const bold = opts.bold || false;
    const align = opts.align || 'left';
    const color = opts.color || (bold ? PDF_THEME.label : PDF_THEME.ink);
    const paddingX = opts.paddingX !== undefined ? opts.paddingX : 1.5;
    const paddingY = opts.paddingY !== undefined ? opts.paddingY : 1;
    if (bold && !opts.color) { pdf.setFillColor(...PDF_THEME.labelBg); pdf.rect(x + 0.08, y + 0.08, w - 0.16, h - 0.16, 'F'); }
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setTextColor(...color);
    const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w - paddingX : x + paddingX;
    const lineH = fontSize * 0.352778 * 1.2;
    const lines = pdf.splitTextToSize(String(text ?? '-'), w - paddingX * 2);
    const totalTextH = lines.length * lineH;
    let textY = y + paddingY + lineH * 0.8;
    if (opts.vCenter) textY = y + (h - totalTextH) / 2 + lineH * 0.8;
    lines.forEach((line, i) => pdf.text(line, textX, textY + i * lineH, { align }));
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
  }

  // =========== HALAMAN 1: KONSTRUKSI SUMUR BOR ===========
  let titleY = 20;
  drawPdfTitle(pdf, 'KONSTRUKSI SUMUR BOR', pageW / 2, titleY, { align: 'center', size: 15 });

  const leftLabelW = 32;
  const colonW = 5;
  const leftValW = 35;
  const rightLabelW = 18;
  const colonW2 = 5;
  const rightValW = tableW - leftLabelW - colonW - leftValW - rightLabelW - colonW2;
  const restW1 = leftValW + rightLabelW + colonW2 + rightValW;
  const rowH = 7;
  let curY = titleY + 10;

  // Project info rows
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Nama Proyek', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
  cellText(projectName, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Kode Proyek', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
  cellText(projectCode, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Klien', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
  cellText(clientName, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Kontraktor', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
  cellText(contractorName, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  // Separator line
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(tableOffsetX, curY + 2, tableOffsetX + tableW, curY + 2);
  curY += 6;

  // Baris 1: Nama Perusahaan (full width)
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Nama Perusahaan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
  cellText(companyName, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  // Baris 2: Nomor Urut Sumur Bor Dangkal
  const row2H = rowH * 1.5;
  drawCell(tableOffsetX, curY, leftLabelW, row2H);
  cellText('Nomor Urut Sumur Bor', tableOffsetX, curY, leftLabelW, row2H, { bold: true, fontSize: 8, paddingX: 2 });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, row2H);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, row2H, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, row2H);
  cellText(shallowWellNumber, tableOffsetX + leftLabelW + colonW, curY, restW1, row2H, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += row2H;

  // Baris 3: Alamat
  const row3H = rowH * 1.5;
  drawCell(tableOffsetX, curY, leftLabelW, row3H);
  cellText('Alamat', tableOffsetX, curY, leftLabelW, row3H, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, row3H);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, row3H, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, row3H);
  cellText(companyAddress, tableOffsetX + leftLabelW + colonW, curY, restW1, row3H, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += row3H;

  // Baris 4: Desa/Kelurahan | X: longitude
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Desa/Kelurahan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH);
  cellText(village, tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH);
  cellText('X', tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH, { bold: true, fontSize: 7, paddingX: 1.5, vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH);
  cellText(':', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH);
  cellText(` ${String(longitude)}`, tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  // Baris 5: Kecamatan | Y: latitude
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Kecamatan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH);
  cellText(district, tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH);
  cellText('Y', tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH, { bold: true, fontSize: 7, paddingX: 1.5, vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH);
  cellText(':', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH);
  cellText(String(latitude), tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  // Baris 6: Kabupaten/Kota | Elevasi
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Kabupaten/Kota', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH);
  cellText(city, tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH);
  cellText('Elevasi', tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH, { bold: true, fontSize: 7, paddingX: 1.5, vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH);
  cellText(':', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH);
  cellText(String(elevation) + ' mdpl', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  // Baris 7: Provinsi (full)
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Provinsi', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
  cellText(province, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
  curY += rowH;

  // ===== DUA KOLOM GAMBAR: BOREHOLE (KIRI 30%) DAN KONSTRUKSI (KANAN 70%) =====
  curY += 3;
  const remainH = pageH - curY - 20;
  const leftColW = tableW * 0.3;
  const rightColW = tableW * 0.7;

  // KOLOM KIRI - GAMBAR BOREHOLE (5 FOTO VERTIKAL)
  drawCell(tableOffsetX, curY, leftColW, remainH);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const bhLabelX = tableOffsetX + leftColW / 2;
  pdf.text('GAMBAR BOREHOLE', bhLabelX, curY + 8, { align: 'center' });
  const bhTextW = pdf.getTextWidth('GAMBAR BOREHOLE');
  pdf.setLineWidth(0.2);
  pdf.line(bhLabelX - bhTextW / 2, curY + 9, bhLabelX + bhTextW / 2, curY + 9);

  const imageStartY = curY + 15;
  const imageWidth = leftColW - 12;
  const imageHeight = Math.max(12, Math.min(24, (remainH - 15 - 6) / 5 - 9));
  let imageCurrentY = imageStartY;

  // Helper to get depth for borehole image labels from effective model
  function getBoreholeDepthText(index) {
    let depthText = '';
    if (groundLevelSet) {
      switch (index) {
        case 1:
          if (pipeSegments.length > 0) {
            const v = Number(pipeSegments[0].start) - Number(groundLevel);
            depthText = v >= 0 ? `Kedalaman: ${formatNumber(v)} m.bmt` : `Kedalaman: ${formatNumber(Math.abs(v))} m di atas tanah`;
          }
          break;
        case 2:
          if (matSet) {
            if (Number(matLevel) >= 0) depthText = `Kedalaman: ${formatNumber(matLevel)} m.bmt`;
            else depthText = `Kedalaman: ${formatNumber(Math.abs(Number(matLevel)))} m di atas tanah (artesis)`;
          }
          break;
        case 3:
          if (pipeSegments.length > 0) {
            const v = Number(pipeSegments[pipeSegments.length - 1].end) - Number(groundLevel);
            depthText = v >= 0 ? `Kedalaman: ${formatNumber(v)} m.bmt` : `Kedalaman: ${formatNumber(Math.abs(v))} m di atas tanah`;
          }
          break;
        case 4:
          if (saringanPosisi.length > 0) {
            const v = Number(saringanPosisi[0].depth) - Number(groundLevel);
            depthText = v >= 0 ? `Kedalaman: ${formatNumber(v)} m.bmt` : `Kedalaman: ${formatNumber(Math.abs(v))} m di atas tanah`;
          }
          break;
        case 5:
          if (currentDepth > 0) {
            const baseDepth = openHole ? Number(openHole.endDepth) : Number(currentDepth);
            const v = baseDepth - Number(groundLevel);
            depthText = v >= 0 ? `Kedalaman: ${formatNumber(v)} m.bmt` : `Kedalaman: ${formatNumber(Math.abs(v))} m di atas tanah`;
          }
          break;
      }
    } else {
      switch (index) {
        case 1:
          if (pipeSegments.length > 0) depthText = `Kedalaman: ${formatNumber(pipeSegments[0].start)} m (absolut)`;
          break;
        case 2:
          if (matSet) depthText = `Kedalaman: ${formatNumber(Number(groundLevel || 0) + Number(matLevel))} m (absolut)`;
          break;
        case 3:
          if (pipeSegments.length > 0) depthText = `Kedalaman: ${formatNumber(pipeSegments[pipeSegments.length - 1].end)} m (absolut)`;
          break;
        case 4:
          if (saringanPosisi.length > 0) depthText = `Kedalaman: ${formatNumber(saringanPosisi[0].depth)} m (absolut)`;
          break;
        case 5:
          if (currentDepth > 0) {
            const baseDepth = openHole ? Number(openHole.endDepth) : Number(currentDepth);
            depthText = `Kedalaman: ${formatNumber(baseDepth)} m (absolut)`;
          }
          break;
      }
    }
    return depthText;
  }

  for (let i = 1; i <= 5; i++) {
    const imgX = tableOffsetX + 4;
    const imgY = imageCurrentY;
    const imgW = imageWidth;
    const imgH = imageHeight;
    const dataUrl = boreholeImages[`borehole${i}`] || null;

    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.rect(imgX, imgY, imgW, imgH, 'S');

    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      try {
        addImageToPDF(pdf, dataUrl, imgX, imgY, imgW, imgH);
      } catch {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Gambar tidak tersedia', imgX + imgW / 2, imgY + imgH / 2, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
      }
    } else {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Tidak ada gambar', imgX + imgW / 2, imgY + imgH / 2, { align: 'center' });
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(0, 0, 0);
    pdf.text(getBoreholeImageName(i), imgX, imgY + imgH + 2.5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    pdf.setTextColor(...PDF_THEME.teal);

    const depthText = getBoreholeDepthText(i);
    if (depthText) pdf.text(depthText, imgX, imgY + imgH + 6);
    pdf.setTextColor(0, 0, 0);
    imageCurrentY += imgH + 9;
    if (imageCurrentY > curY + remainH - 10) break;
  }

  // KOLOM KANAN - GAMBAR KONSTRUKSI SUMUR BOR (rendered from data, not canvas)
  // This ensures Designer components are displayed correctly
  renderConstructionDiagram(
    pdf,
    tableOffsetX + leftColW,
    curY,
    rightColW,
    remainH,
    legacyModel,
    extraComponents,
    groundLevel,
    matLevel,
    groundLevelSet,
    matSet
  );

  // =========== HALAMAN 2: DATA BOREHOLE CAMERA ===========
  // Geological log page (only when there are layers)
  if (geology && (geology.layers || []).length > 0) {
    pdf.addPage();
    renderGeologicalLog(pdf, tableOffsetX, 20, tableW, pageH - 40, geology, well, project);
  }

  // Groundwater Monitoring page (only when there are measurements)
  if (geology && (geology.groundwaterMonitoring?.measurements || []).length > 0) {
    const validMon = geology.groundwaterMonitoring.measurements.filter(m => m.status === 'valid' && Number.isFinite(m.waterLevelDepth));
    if (validMon.length > 0) {
      pdf.addPage();
      renderGroundwaterMonitoring(pdf, tableOffsetX, 20, tableW, pageH - 40, geology.groundwaterMonitoring, well, project, wellDepthMeters);
    }
  }

  pdf.addPage();
  titleY = 20;
  drawPdfTitle(pdf, 'DATA BOREHOLE CAMERA', pageW / 2, titleY, { align: 'center', size: 15 });

  const p2LabelW = 48;
  const p2ValW = tableW - p2LabelW;
  let p2Y = titleY + 10;

  function addDataRow(label, value) {
    const maxWidth = p2ValW - 8;
    const valueLines = pdf.splitTextToSize(String(value ?? '-'), maxWidth);
    const lineHeight = 4;
    const minRowHeight = 7;
    const rowHeight = Math.max(minRowHeight, valueLines.length * lineHeight + 4);
    drawCell(tableOffsetX, p2Y, p2LabelW, rowHeight);
    drawCell(tableOffsetX + p2LabelW, p2Y, p2ValW, rowHeight);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const labelLines = pdf.splitTextToSize(String(label), p2LabelW - 4);
    if (labelLines.length === 1) pdf.text(String(label), tableOffsetX + 2, p2Y + rowHeight / 2 + 1.2);
    else {
      let labelY = p2Y + rowHeight / 2 - ((labelLines.length - 1) * lineHeight) / 2 + 1.2;
      labelLines.forEach((line, idx) => pdf.text(line, tableOffsetX + 2, labelY + idx * lineHeight));
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    let valueY = p2Y + rowHeight / 2 - ((valueLines.length - 1) * lineHeight) / 2 + 1.2;
    valueLines.forEach((line, idx) => pdf.text(line, tableOffsetX + p2LabelW + 4, valueY + idx * lineHeight));
    p2Y += rowHeight;
    return p2Y;
  }

  addDataRow('Nama Perusahaan', companyName);
  addDataRow('Nomor Urut Sumur Bor', shallowWellNumber);
  addDataRow('Alamat', companyAddress);
  addDataRow('Sumur', wellNumber);
  addDataRow('Koordinat', `X = ${String(longitude)}, Y = ${String(latitude)}`);
  addDataRow('Elevasi', String(elevation) + ' mdpl');
  addDataRow('Tanggal pelaksanaan borehole', formattedDate);
  addDataRow('Kedalaman Konstruksi Sumur', totalPipeLength > 0 ? `${formatNumber(totalPipeLength)} m.bmt` : '-');
  addDataRow('Kedalaman Sumur (sudah terendapkan lumpur/kotoran)', kedalamanSumur);
  addDataRow('Konstruksi Pipa (diameter)', pipeInfo ? pipeInfo + ' Inchi' : '-');
  addDataRow('Screen', screenInfo);
  addDataRow('Jarak Muka Pipa ke Permukaan Tanah', pipeTopInfo);
  addDataRow('Jarak Piezometer ke Sumur', piezoDistance ? String(piezoDistance) + ' m' : '-');
  addDataRow('Jenis/Kap. Pompa', pumpType);
  addDataRow('Posisi Pompa', pumpPosition ? String(pumpPosition) + ' m' : '-');

  // Add Designer-specific info if present
  if (source === 'designer' && extraComponents.length > 0) {
    const extraLabels = [];
    if (extraGroups.gravelPack.length > 0) extraLabels.push(`Pasir Filter (${extraGroups.gravelPack.length})`);
    if (extraGroups.cementGrouting.length > 0) extraLabels.push(`Semen Rekat (${extraGroups.cementGrouting.length})`);
    if (extraGroups.wellCap.length > 0) extraLabels.push(`Tutup Sumur (${extraGroups.wellCap.length})`);
    if (extraGroups.submersiblePump.length > 0) extraLabels.push(`Pompa Sumur (${extraGroups.submersiblePump.length})`);
    if (extraGroups.pumpPosition.length > 0) extraLabels.push(`Posisi Pompa (${extraGroups.pumpPosition.length})`);
    if (extraGroups.waterLevelMarker.length > 0) extraLabels.push(`Pemarkah Air (${extraGroups.waterLevelMarker.length})`);
    if (extraLabels.length > 0) {
      addDataRow('Komponen Desainer Tambahan', extraLabels.join(', '));
    }
  }

  const fotoH = 50;
  drawCell(tableOffsetX, p2Y, p2LabelW, fotoH);
  drawCell(tableOffsetX + p2LabelW, p2Y, p2ValW, fotoH);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const fotoLabelLines = pdf.splitTextToSize('Foto Sumur Bor', p2LabelW - 4);
  if (fotoLabelLines.length === 1) pdf.text('Foto Sumur Bor', tableOffsetX + 2, p2Y + fotoH / 2 + 1.2);
  else {
    let fotoLabelY = p2Y + fotoH / 2 - ((fotoLabelLines.length - 1) * 4) / 2 + 1.2;
    fotoLabelLines.forEach((line, idx) => pdf.text(line, tableOffsetX + 2, fotoLabelY + idx * 4));
  }

  const wellPhoto = boreholeImages.wellPhoto || null;
  if (wellPhoto && typeof wellPhoto === 'string' && wellPhoto.startsWith('data:')) {
    try {
      const imgPadding = 4;
      const imgAreaW = p2ValW - imgPadding * 2;
      const imgAreaH = fotoH - imgPadding * 2;
      let imgW = imgAreaW, imgH = imgAreaH;
      const ratio = 4 / 3;
      if (imgAreaW / imgAreaH > ratio) { imgH = imgAreaH; imgW = imgH * ratio; }
      else { imgW = imgAreaW; imgH = imgW / ratio; }
      const imgX = tableOffsetX + p2LabelW + imgPadding + (imgAreaW - imgW) / 2;
      const imgY = p2Y + imgPadding + (imgAreaH - imgH) / 2;
      addImageToPDF(pdf, wellPhoto, imgX, imgY, imgW, imgH);
    } catch {
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(100, 100, 100);
      pdf.text('Foto tidak tersedia', tableOffsetX + p2LabelW + p2ValW / 2, p2Y + fotoH / 2, { align: 'center' });
      pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal');
    }
  } else {
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(100, 100, 100);
    pdf.text('Foto tidak tersedia', tableOffsetX + p2LabelW + p2ValW / 2, p2Y + fotoH / 2, { align: 'center' });
    pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal');
  }
  p2Y += fotoH;

  // =========== HALAMAN 3 & 4: DOKUMENTASI KEGIATAN BOREHOLE CAMERA ===========
  for (let page = 3; page <= 4; page++) {
    pdf.addPage();
    drawPdfTitle(pdf, 'DOKUMENTASI KEGIATAN BOREHOLE CAMERA', pageW / 2, 20, { align: 'center', size: 15 });
    let currentY = 35;
    const categoryHeight = 70;
    const categorySpacing = 10;
    const startIdx = page === 3 ? 1 : 4;
    const endIdx = page === 3 ? 3 : 6;
    for (let i = startIdx; i <= endIdx; i++) {
      const categoryKey = `doc${i}`;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...PDF_THEME.teal);
      pdf.text(`${i}. ${getDocTitle(i)}`, tableOffsetX, currentY);
      const startX = tableOffsetX;
      const startY = currentY + 5;
      const fotoWidth = 45;
      const fotoHeight = 45;
      const fotoSpacing = 6;
      const images = (activityImages[categoryKey] || []).slice(0, 3);
      if (images.length > 0) {
        for (let j = 0; j < images.length; j++) {
          const col = j % 3;
          const imgX = startX + col * (fotoWidth + fotoSpacing);
          const imgY = startY;
          pdf.setDrawColor(180, 180, 180); pdf.setLineWidth(0.3); pdf.rect(imgX, imgY, fotoWidth, fotoHeight, 'S');
          try {
            const imgData = images[j]?.dataUrl || images[j];
            let drawW, drawH; const padding = 4; const imgRatio = 4 / 3;
            if ((fotoWidth - padding) / (fotoHeight - padding) > imgRatio) { drawH = fotoHeight - padding; drawW = drawH * imgRatio; }
            else { drawW = fotoWidth - padding; drawH = drawW / imgRatio; }
            const drawX = imgX + (fotoWidth - drawW) / 2; const drawY = imgY + (fotoHeight - drawH) / 2;
            if (typeof imgData === 'string' && imgData.startsWith('data:')) addImageToPDF(pdf, imgData, drawX, drawY, drawW, drawH);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(0, 0, 0);
            pdf.text(`${j + 1}`, imgX + 4, imgY + 10);
          } catch {
            pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7); pdf.setTextColor(150, 150, 150);
            pdf.text('Error', imgX + 10, imgY + 25);
          }
        }
      } else {
        pdf.setFillColor(245, 245, 245); pdf.setDrawColor(200, 200, 200);
        pdf.rect(startX, startY, fotoWidth, fotoHeight, 'FD');
        pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7); pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada foto', startX + 8, startY + 25);
      }
      currentY += categoryHeight + categorySpacing;
    }
  }

  finalizePdf(pdf);
  pdf.save('laporan_konstruksi_sumur_bor.pdf');
}

/**
 * Generate comprehensive well completion report based on report builder configuration
 */
async function generateWellCompletionReport(pdf, {
  model, well, activity, canvas, project, designer, geology,
  sections, selectedPhotoIds, metadata, notes,
}) {
  const { getEffectiveModelForPDF, groupExtraComponentsForPDF } = await import('./designer/adapter.js');
  const { COMPONENT_LABELS } = await import('./designer/model.js');
  const { MEASUREMENT_METHODS, REFERENCE_POINTS } = await import('./monitoring/model.js');

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - 2 * margin;

  // Helper functions (reused from existing code)
  function formatNumber(num) {
    if (num === null || num === undefined || num === '-' || num === '') return '-';
    if (typeof num === 'string') {
      if (num === '-') return '-';
      num = parseFloat(num);
      if (isNaN(num)) return '-';
    }
    const formatted = Number(num).toFixed(2);
    return formatted.replace(/\.00$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
  }

  function addImageToPDF(pdf, imgData, x, y, w, h) {
    if (!imgData || imgData === '#' || imgData === 'data:,') return false;
    const supportedFormats = ['JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'TIFF'];
    let format = getImageFormatFromDataURL(imgData);
    if (!supportedFormats.includes(format)) format = 'JPEG';
    try {
      pdf.addImage(imgData, format, x, y, w, h);
      return true;
    } catch (e) {
      try { pdf.addImage(imgData, 'PNG', x, y, w, h); return true; }
      catch (e2) { try { pdf.addImage(imgData, 'JPEG', x, y, w, h); return true; } catch (e3) { return false; } }
    }
  }

  function getImageFormatFromDataURL(dataURL) {
    if (!dataURL || dataURL === '#' || dataURL === 'data:,') return null;
    if (dataURL.startsWith('data:image/png')) return 'PNG';
    if (dataURL.startsWith('data:image/jpeg') || dataURL.startsWith('data:image/jpg')) return 'JPEG';
    if (dataURL.startsWith('data:image/gif')) return 'GIF';
    if (dataURL.startsWith('data:image/webp')) return 'WEBP';
    if (dataURL.startsWith('data:image/bmp')) return 'BMP';
    if (dataURL.startsWith('data:image/tiff')) return 'TIFF';
    return 'JPEG';
  }

  function drawCell(x, y, w, h, opts = {}) {
    if (opts.fill) { pdf.setFillColor(...opts.fill); pdf.rect(x, y, w, h, 'F'); }
    pdf.setDrawColor(...PDF_THEME.line); pdf.setLineWidth(0.15); pdf.rect(x, y, w, h, 'S');
  }

  function cellText(text, x, y, w, h, opts = {}) {
    const fontSize = opts.fontSize || 8;
    const bold = opts.bold || false;
    const align = opts.align || 'left';
    const color = opts.color || (bold ? PDF_THEME.label : PDF_THEME.ink);
    const paddingX = opts.paddingX !== undefined ? opts.paddingX : 1.5;
    const paddingY = opts.paddingY !== undefined ? opts.paddingY : 1;
    if (bold && !opts.color) { pdf.setFillColor(...PDF_THEME.labelBg); pdf.rect(x + 0.08, y + 0.08, w - 0.16, h - 0.16, 'F'); }
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setTextColor(...color);
    const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w - paddingX : x + paddingX;
    const lineH = fontSize * 0.352778 * 1.2;
    const lines = pdf.splitTextToSize(String(text ?? '-'), w - paddingX * 2);
    const totalTextH = lines.length * lineH;
    let textY = y + paddingY + lineH * 0.8;
    if (opts.vCenter) textY = y + (h - totalTextH) / 2 + lineH * 0.8;
    lines.forEach((line, i) => pdf.text(line, textX, textY + i * lineH, { align }));
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
  }

  // Mengembalikan posisi Y berikutnya: otomatis pindah halaman bila ruang tidak cukup.
  function addPageIfNeeded(minHeight, y) {
    if (y + minHeight > pageH - margin) {
      pdf.addPage();
      return margin;
    }
    return y;
  }


  // Prepare data
  const wellDataForAdapter = { model: { ...model, designer } };
  const { legacyModel, extraComponents, source } = getEffectiveModelForPDF(wellDataForAdapter);
  const extraGroups = groupExtraComponentsForPDF(extraComponents);

  const pipeSegments = (legacyModel.pipes || []).slice().sort((a, b) => a.start - b.start);
  const saringanPosisi = (legacyModel.screens || []).slice().sort((a, b) => a.depth - b.depth);
  const groundLevel = legacyModel.ground;
  const groundLevelSet = legacyModel.ground !== null && legacyModel.ground !== undefined;
  const matLevel = legacyModel.mat;
  const matSet = legacyModel.mat !== null && legacyModel.mat !== undefined;
  const openHole = legacyModel.openHole
    ? { startDepth: Number(legacyModel.openHole.start), endDepth: Number(legacyModel.openHole.end), size: Number(legacyModel.openHole.size) }
    : null;

  let currentDepth = pipeSegments.length ? pipeSegments[pipeSegments.length - 1].end : 0;
  if (openHole && Number.isFinite(openHole.endDepth)) currentDepth = Math.max(currentDepth, openHole.endDepth);

  const selectedPhotos = (activity.activityImages || {}); // Will be overridden by selectedPhotoIds
  // We'll use the selectedPhotoIds to filter photos from documentation

  // ============================================================
  // A. COVER PAGE
  // ============================================================
  if (sections.cover) {
    const T = PDF_THEME;
    pdf.setFillColor(...T.paper);
    pdf.rect(0, 0, pageW, pageH, 'F');
    // pita vertikal di tepi kiri
    pdf.setFillColor(...T.teal);
    pdf.rect(0, 0, 9, pageH, 'F');
    pdf.setFillColor(...T.ink);
    pdf.rect(9, 0, 1.2, pageH, 'F');

    const left = margin + 6;
    const textW = pageW - left - margin;

    if (metadata.logoDataUrl) {
      try { addImageToPDF(pdf, metadata.logoDataUrl, left, margin, 32, 32); } catch {}
    }

    // kicker + judul
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...T.teal);
    pdf.text('LAPORAN TEKNIS', left, 98);
    pdf.setFontSize(28);
    pdf.setTextColor(...T.ink);
    const titleLines = pdf.splitTextToSize(metadata.title || 'Laporan Penyelesaian Sumur Bor', textW);
    titleLines.forEach((line, i) => pdf.text(line, left, 112 + i * 12));
    const titleEnd = 112 + (titleLines.length - 1) * 12;
    pdf.setFillColor(...T.teal);
    pdf.rect(left, titleEnd + 8, 24, 1.4, 'F');

    // sumur & proyek
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(...T.ink);
    pdf.text(`${well?.wellName || '-'}`, left, titleEnd + 24);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
    pdf.setTextColor(...T.muted);
    pdf.text(`Kode sumur ${well?.wellCode || '-'}`, left, titleEnd + 31);
    pdf.setFontSize(11);
    pdf.setTextColor(...T.label);
    const projLines = pdf.splitTextToSize(project?.projectName || '-', textW);
    projLines.forEach((line, i) => pdf.text(line, left, titleEnd + 43 + i * 5.5));

    // blok metadata (kisi 2 kolom) di bagian bawah
    const metaItems = [
      ['NOMOR LAPORAN', metadata.reportNumber],
      ['REVISI', metadata.revision],
      ['TANGGAL', metadata.reportDate ? new Date(metadata.reportDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''],
      ['DISUSUN OLEH', metadata.preparedBy],
      ['DITINJAU OLEH', metadata.reviewedBy],
    ].filter(([, v]) => v);
    if (metaItems.length) {
      const colW = textW / 2;
      const rows = Math.ceil(metaItems.length / 2);
      const top = pageH - margin - rows * 17 - 6;
      pdf.setDrawColor(...T.line);
      pdf.setLineWidth(0.3);
      pdf.line(left, top, left + textW, top);
      metaItems.forEach(([label, value], idx) => {
        const cx = left + (idx % 2) * colW;
        const cy = top + 9 + Math.floor(idx / 2) * 17;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...T.muted);
        pdf.text(label, cx, cy);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10.5);
        pdf.setTextColor(...T.ink);
        pdf.text(String(value), cx, cy + 5.5);
      });
    }
    pdf.setTextColor(0, 0, 0);
    pdf.addPage();
  }

  // ============================================================
  // B. PROJECT & WELL INFORMATION
  // ============================================================
  if (sections.project_well_info) {
    let y = margin;
    drawPdfTitle(pdf, 'INFORMASI PROYEK & SUMUR', margin, y, { size: 16 });
    y += 12;

    const infoRows = [
      ['Nama Proyek', project?.projectName || '-'],
      ['Kode Proyek', project?.projectCode || '-'],
      ['Klien', project?.clientName || '-'],
      ['Kontraktor', project?.contractorName || '-'],
      ['Lokasi Proyek', project?.location || '-'],
      ['Provinsi', project?.province || '-'],
      ['Kabupaten/Kota', project?.district || '-'],
      ['Desa/Kelurahan', project?.village || '-'],
      ['', ''],
      ['Nama Sumur', well?.wellName || '-'],
      ['Kode Sumur', well?.wellCode || '-'],
      ['Tipe Sumur', well?.wellType || '-'],
      ['Status', well?.status || '-'],
      ['Kedalaman Rencana', well?.plannedDepth ? `${well.plannedDepth} m` : '-'],
      ['Kedalaman Aktual', well?.actualDepth ? `${well.actualDepth} m` : '-'],
      ['Koordinat (Lat, Lon)', (well?.latitude && well?.longitude) ? `${well.latitude}, ${well.longitude}` : '-'],
      ['Elevasi', well?.elevation ? `${well.elevation} mdpl` : '-'],
      ['Tanggal Mulai Bor', well?.drillingDate ? new Date(well.drillingDate).toLocaleDateString('id-ID') : '-'],
      ['Tanggal Selesai Bor', well?.completionDate ? new Date(well.completionDate).toLocaleDateString('id-ID') : '-'],
      ['Perusahaan', well?.companyName || '-'],
      ['Nomor Urut Sumur Bor', well?.shallowWellNumber || '-'],
      ['Jarak Piezometer', well?.piezoDistance ? `${well.piezoDistance} m` : '-'],
      ['Jenis Pompa', well?.pumpType || '-'],
      ['Posisi Pompa', well?.pumpPosition ? `${well.pumpPosition} m` : '-'],
    ];

    const rowH = 7;
    const labelW = 55;
    infoRows.forEach(([label, value]) => {
      if (!label && !value) { y += 4; return; }
      y = addPageIfNeeded(rowH + 2, y);
      drawCell(margin, y, labelW, rowH, { fill: [240, 240, 245] });
      drawCell(margin + labelW, y, contentW - labelW, rowH);
      cellText(label, margin, y, labelW, rowH, { bold: true, fontSize: 8, vCenter: true });
      cellText(value, margin + labelW, y, contentW - labelW, rowH, { fontSize: 8, vCenter: true });
      y += rowH;
    });
    y += 8;
    pdf.addPage();
  }

  // ============================================================
  // C. WELL CONSTRUCTION
  // ============================================================
  if (sections.well_construction) {
    let y = margin;
    drawPdfTitle(pdf, 'KONSTRUKSI SUMUR', margin, y, { size: 16 });
    y += 12;

    // Construction diagram
    const diagH = 120;
    y = addPageIfNeeded(diagH + 20, y);
    renderConstructionDiagram(pdf, margin, y, contentW, diagH, legacyModel, extraComponents, groundLevel, matLevel, groundLevelSet, matSet);
    y += diagH + 10;

    // Component table
    const allComponents = [];
    if (designer?.components?.length) {
      designer.components.filter(c => c.visible).forEach(c => {
        allComponents.push({
          name: c.name || COMPONENT_LABELS[c.type] || c.type,
          type: c.type,
          start: c.startDepth,
          end: c.endDepth || c.startDepth,
          length: c.length || Math.max(0, (c.endDepth || c.startDepth) - c.startDepth),
          od: c.outerDiameter,
          id: c.innerDiameter,
          material: c.material,
        });
      });
    } else if (pipeSegments.length) {
      pipeSegments.forEach((p, i) => {
        allComponents.push({
          name: `Pipa ${i + 1}`,
          type: i === 0 ? 'surface_casing' : 'production_casing',
          start: p.start,
          end: p.end,
          length: p.end - p.start,
          od: p.diameter * 25.4,
          id: p.diameter * 25.4 - 20,
          material: 'PVC',
        });
      });
    }
    saringanPosisi.forEach((s, i) => {
      allComponents.push({
        name: `Screen ${i + 1}`,
        type: 'screen_pipe',
        start: s.depth,
        end: s.depth + s.size,
        length: s.size,
        od: (pipeSegments[pipeSegments.length - 1]?.diameter || 6) * 25.4,
        id: ((pipeSegments[pipeSegments.length - 1]?.diameter || 6) * 25.4) - 20,
        material: 'PVC',
      });
    });
    if (openHole) {
      allComponents.push({
        name: 'Open Hole',
        type: 'open_hole',
        start: openHole.startDepth,
        end: openHole.endDepth,
        length: openHole.endDepth - openHole.startDepth,
        od: openHole.size * 25.4,
        id: openHole.size * 25.4,
        material: 'Batu',
      });
    }
    extraGroups.gravelPack.forEach((g, i) => {
      allComponents.push({ name: `Pasir Filter ${i + 1}`, type: 'gravel_pack', start: g.startDepth, end: g.endDepth, length: g.endDepth - g.startDepth, od: 0, id: 0, material: 'Pasir' });
    });
    extraGroups.cementGrouting.forEach((g, i) => {
      allComponents.push({ name: `Semen Rekat ${i + 1}`, type: 'cement_grouting', start: g.startDepth, end: g.endDepth, length: g.endDepth - g.startDepth, od: 0, id: 0, material: 'Semen' });
    });

    if (allComponents.length > 0) {
      y = addPageIfNeeded(60, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Detail Komponen Konstruksi', margin, y);
      y += 8;

      const colW = [42, 30, 18, 18, 20, 18, contentW - 146];
      const headers = ['Nama', 'Tipe', 'Mulai (m)', 'Akhir (m)', 'Panjang (m)', 'OD (mm)', 'Material'];
      const rowH = 6;

      // Header
      drawCell(margin, y, colW.reduce((a,b)=>a+b,0), rowH, { fill: [30, 41, 59] });
      pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(6);
      let hx = margin + 2;
      headers.forEach((h, i) => { pdf.text(h, hx, y + rowH/2 + 1); hx += colW[i]; });
      pdf.setTextColor(0,0,0); y += rowH;

      // Rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      allComponents.forEach(c => {
        y = addPageIfNeeded(rowH, y);
        const row = [
          c.name,
          COMPONENT_LABELS[c.type] || c.type,
          formatNumber(c.start),
          formatNumber(c.end),
          formatNumber(c.length),
          c.od ? formatNumber(c.od) : '-',
          c.material,
        ];
        hx = margin + 2;
        row.forEach((cell, i) => { pdf.text(cell, hx, y + rowH/2 + 1); hx += colW[i]; });
        y += rowH;
      });
      y += 6;
    }

    pdf.addPage();
  }

  // ============================================================
  // D. GEOLOGICAL LOG
  // ============================================================
  if (sections.geological_log && geology?.layers?.length > 0) {
    const validLayers = geology.layers
      .map(l => ({ ...l, startDepth: Number(l.startDepth) || 0, endDepth: Number(l.endDepth) || 0 }))
      .filter(l => Number.isFinite(l.startDepth) && Number.isFinite(l.endDepth) && l.endDepth > l.startDepth)
      .sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);

    if (validLayers.length > 0) {
      let y = margin;
      drawPdfTitle(pdf, 'LOG GEOLOGI', margin, y, { size: 16 });
      y += 12;

      // Simple text-based geological log for PDF
      const colW = [22, 22, 22, 36, 34, contentW - 136];
      const headers = ['Mulai (m)', 'Akhir (m)', 'Tebal (m)', 'Material', 'Nama Lapisan', 'Keterangan'];
      const rowH = 6;

      // Header
      y = addPageIfNeeded(rowH * (validLayers.length + 2), y);
      drawCell(margin, y, colW.reduce((a,b)=>a+b,0), rowH, { fill: [30, 41, 59] });
      pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(6);
      let hx = margin + 2;
      headers.forEach((h, i) => { pdf.text(h, hx, y + rowH/2 + 1); hx += colW[i]; });
      pdf.setTextColor(0,0,0); y += rowH;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      validLayers.forEach(l => {
        y = addPageIfNeeded(rowH, y);
        const mat = getMaterialForPdf(l.material);
        const row = [
          formatNumber(l.startDepth),
          formatNumber(l.endDepth),
          formatNumber(l.endDepth - l.startDepth),
          mat.label,
          l.name || mat.label,
          l.description || l.formation || '-',
        ];
        hx = margin + 2;
        row.forEach((cell, i) => { pdf.text(cell, hx, y + rowH/2 + 1); hx += colW[i]; });
        y += rowH;
      });
      y += 8;
      pdf.addPage();
    }
  }

  // ============================================================
  // E. GROUNDWATER MONITORING
  // ============================================================
  if (sections.groundwater_monitoring && monitoring?.measurements?.length > 0) {
    const validMeasurements = monitoring.measurements
      .filter(m => m.status === 'valid' && Number.isFinite(m.waterLevelDepth))
      .map(m => ({ ...m, measuredAt: new Date(m.measuredAt) }))
      .sort((a, b) => a.measuredAt - b.measuredAt);

    if (validMeasurements.length > 0) {
      let y = margin;
      drawPdfTitle(pdf, 'MONITORING MUKA AIR TANAH', margin, y, { size: 16 });
      y += 12;

      // Summary
      const depths = validMeasurements.map(m => m.waterLevelDepth);
      const latest = validMeasurements[validMeasurements.length - 1];
      const refPointLabel = REFERENCE_POINTS[latest.referencePoint]?.label || latest.referencePoint;

      const statData = [
        ['Total Pengukuran', String(validMeasurements.length)],
        ['Kedalaman Terbaru', `${latest.waterLevelDepth.toFixed(2)} m (${refPointLabel})`],
        ['Minimum', `${Math.min(...depths).toFixed(2)} m`],
        ['Maksimum', `${Math.max(...depths).toFixed(2)} m`],
        ['Rata-rata', `${(depths.reduce((a,b)=>a+b,0)/depths.length).toFixed(2)} m`],
        ['Pengukuran Pertama', validMeasurements[0].measuredAt.toLocaleDateString('id-ID')],
        ['Pengukuran Terbaru', latest.measuredAt.toLocaleDateString('id-ID')],
      ];

      const rowH = 6;
      const labelW = 55;
      statData.forEach(([label, value]) => {
        y = addPageIfNeeded(rowH, y);
        drawCell(margin, y, labelW, rowH, { fill: [240, 240, 245] });
        drawCell(margin + labelW, y, contentW - labelW, rowH);
        cellText(label, margin, y, labelW, rowH, { bold: true, fontSize: 8, vCenter: true });
        cellText(value, margin + labelW, y, contentW - labelW, rowH, { fontSize: 8, vCenter: true });
        y += rowH;
      });
      y += 8;

      // Measurements table
      y = addPageIfNeeded(60, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Riwayat Pengukuran', margin, y);
      y += 8;

      const colW = [34, 24, 24, 28, 24, contentW - 134];
      const headers = ['Tanggal & Waktu', 'Kedalaman (m)', 'Perubahan (m)', 'Titik Referensi', 'Metode', 'Catatan'];
      const rowH2 = 5;

      drawCell(margin, y, colW.reduce((a,b)=>a+b,0), rowH2, { fill: [30, 41, 59] });
      pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(5.5);
      hx = margin + 2;
      headers.forEach((h, i) => { pdf.text(h, hx, y + rowH2/2 + 1); hx += colW[i]; });
      pdf.setTextColor(0,0,0); y += rowH2;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.5);
      validMeasurements.forEach((m, i) => {
        y = addPageIfNeeded(rowH2, y);
        const prev = i > 0 ? validMeasurements[i - 1] : null;
        const rowChange = prev && prev.referencePoint === m.referencePoint
          ? m.waterLevelDepth - prev.waterLevelDepth
          : null;
        const methodLabel = MEASUREMENT_METHODS[m.method]?.label || m.method;
        const refLabel = REFERENCE_POINTS[m.referencePoint]?.label || m.referencePoint;

        const row = [
          m.measuredAt.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          m.waterLevelDepth.toFixed(2),
          rowChange !== null ? (rowChange > 0 ? `+${rowChange.toFixed(2)}` : rowChange.toFixed(2)) : '—',
          refLabel,
          methodLabel,
          m.notes || '-',
        ];
        hx = margin + 2;
        row.forEach((cell, j) => { pdf.text(cell, hx, y + rowH2/2 + 1); hx += colW[j]; });
        y += rowH2;
      });
      y += 8;
      pdf.addPage();
    }
  }

  // ============================================================
  // F. FIELD DOCUMENTATION
  // ============================================================
  if (sections.field_documentation && selectedPhotoIds?.length > 0) {
    let y = margin;
    drawPdfTitle(pdf, 'DOKUMENTASI LAPANGAN', margin, y, { size: 16 });
    y += 12;

    // We need to get the actual photo records - for now use activity images as fallback
    // In a full implementation, we'd fetch from documentation storage
    const photosToShow = selectedPhotoIds.slice(0, 12); // Limit to 12 photos

    if (photosToShow.length > 0) {
      const imgW = 55;
      const imgH = 45;
      const spacing = 8;
      const cols = 3;
      let col = 0;
      let row = 0;

      photosToShow.forEach((photoId, idx) => {
        // Find photo in documentation (would need to fetch)
        // For now, skip rendering individual photos without the data
        // This is a placeholder - actual implementation would retrieve from storage
      });

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`[${photosToShow.length} foto dokumentasi dipilih - akan dirender di PDF lengkap]`, margin, y);
      y += 15;
    }

    y += 8;
    pdf.addPage();
  }

  // ============================================================
  // G. NOTES & CONCLUSION
  // ============================================================
  if (sections.notes_conclusion) {
    let y = margin;
    drawPdfTitle(pdf, 'CATATAN & KESIMPULAN', margin, y, { size: 16 });
    y += 12;

    if (notes.technical) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Catatan Teknis', margin, y);
      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 30, 30);
      const techLines = pdf.splitTextToSize(notes.technical, contentW);
      techLines.forEach(line => {
        y = addPageIfNeeded(5, y);
        pdf.text(line, margin, y);
        y += 5;
      });
      y += 6;
    }

    if (notes.conclusion) {
      y = addPageIfNeeded(30, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Kesimpulan', margin, y);
      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 30, 30);
      const concLines = pdf.splitTextToSize(notes.conclusion, contentW);
      concLines.forEach(line => {
        y = addPageIfNeeded(5, y);
        pdf.text(line, margin, y);
        y += 5;
      });
      y += 10;
    }

    // Signatures
    y = addPageIfNeeded(40, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Disusun oleh,', margin, y);
    y += 20;
    pdf.setFont('helvetica', 'bold');
    pdf.text(metadata.preparedBy || '____________________', margin, y);
    y += 15;
    if (metadata.reviewedBy) {
      pdf.setFont('helvetica', 'normal');
      pdf.text('Ditinjau oleh,', margin, y);
      y += 20;
      pdf.setFont('helvetica', 'bold');
      pdf.text(metadata.reviewedBy, margin, y);
    }
  }

  // Save
  const fileName = `laporan_penyelesaian_${well?.wellCode || 'sumur'}_${new Date().toISOString().split('T')[0]}.pdf`;
  finalizePdf(pdf, { skipFirst: !!sections.cover });
  pdf.save(fileName);
}