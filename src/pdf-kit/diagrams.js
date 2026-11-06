// Diagram teknis: konstruksi sumur, kolom litologi, hidrograf.
import { THEME, clean, fmtNum, fmtFixed, fmtDate, hexToRgb, mix, niceStep, hatch, dots, withOpacity } from './kit.js';
import { COMPONENT_LABELS } from '../designer/model.js';
import { GEOLOGY_MATERIALS } from '../geology/model.js';

const COL = {
  casing: [176, 190, 197],
  casingEdge: [69, 90, 100],
  screen: [214, 138, 46],
  screenEdge: [140, 78, 14],
  gravel: [247, 222, 160],
  gravelEdge: [196, 150, 52],
  cement: [220, 224, 228],
  cementEdge: [140, 150, 158],
  hole: [236, 226, 212],
  holeEdge: [124, 90, 60],
  ground: [124, 90, 60],
  soil: [250, 246, 238],
  water: [37, 99, 235],
};

/** Susun posisi label agar tidak saling menimpa (label di kolom kanan). */
function placeLabels(items, top, bottom, minGap) {
  items.sort((a, b) => a.y - b.y);
  items.forEach((it, i) => {
    it.ly = Math.max(it.y, top);
    if (i > 0 && it.ly < items[i - 1].ly + minGap) it.ly = items[i - 1].ly + minGap;
  });
  for (let i = items.length - 1; i >= 0; i--) {
    const maxY = i === items.length - 1 ? bottom : items[i + 1].ly - minGap;
    if (items[i].ly > maxY) items[i].ly = maxY;
  }
  items.forEach((it, i) => {
    const minY = i === 0 ? top : items[i - 1].ly + minGap;
    if (it.ly < minY) it.ly = minY;
  });
}

function drawLabel(doc, it, labelX, maxW) {
  const pdf = doc.pdf;
  // garis penunjuk
  pdf.setDrawColor(...mix(it.color, [255, 255, 255], 0.25));
  pdf.setLineWidth(0.18);
  const ex = labelX - 7;
  pdf.line(it.ax, it.y, Math.max(ex, it.ax + 1), it.y);
  pdf.line(Math.max(ex, it.ax + 1), it.y, labelX - 1.2, it.ly);
  pdf.setFillColor(...it.color);
  pdf.circle(it.ax, it.y, 0.55, 'F');
  // blok teks
  doc.fillRect(labelX, it.ly - 3, 0.9, 6.6, it.color);
  doc.text(doc.fit(it.title, maxW, 7.2, 'bold'), labelX + 2.6, it.ly - 0.4, { size: 7.2, style: 'bold', color: THEME.ink });
  if (it.detail) doc.text(doc.fit(it.detail, maxW, 6.5), labelX + 2.6, it.ly + 2.9, { size: 6.5, color: THEME.muted });
}

function panelFrame(doc, { x, y, w, h }, title, right) {
  doc.fillRect(x, y, w, h, THEME.white);
  doc.fillRect(x, y, w, 9, THEME.tealDark);
  doc.text(title, x + 4, y + 5.9, { size: 7.4, style: 'bold', color: THEME.white });
  if (right) doc.text(right, x + w - 4, y + 5.9, { size: 6.6, color: [190, 220, 216], align: 'right' });
  doc.strokeRect(x, y, w, h, THEME.line, 0.3);
}

// ---------------------------------------------------------------------------
// Diagram konstruksi sumur
// ---------------------------------------------------------------------------
export function drawConstructionDiagram(doc, box, c) {
  const pdf = doc.pdf;
  const { x, y, w, h } = box;
  const unit = c.groundSet ? 'm.bmt' : 'm (absolut)';
  const rel = (abs) => (c.groundSet ? abs - c.ground : abs);
  const fmtD = (abs) => { const r = rel(abs); return r < -0.0001 ? `+${fmtNum(-r)}` : fmtNum(r); };
  const range = (a, b) => `${fmtD(a)} - ${fmtD(b)} m`;

  panelFrame(doc, box, 'GAMBAR KONSTRUKSI SUMUR BOR', `Kedalaman dalam ${unit}`);

  const pipes = c.pipes.map((p) => ({ ...p, start: Number(p.start), end: Number(p.end), diameter: Number(p.diameter) }));
  const screens = c.screens.map((s) => ({ ...s, depth: Number(s.depth), size: Number(s.size) }));
  const hole = c.openHole && Number.isFinite(c.openHole.endDepth) ? c.openHole : null;
  const extra = c.extra || [];

  const hasAny = pipes.length || screens.length || hole || extra.length;
  if (!hasAny) {
    doc.text('Data konstruksi belum tersedia.', x + w / 2, y + h / 2, { size: 9, color: THEME.muted, align: 'center' });
    return;
  }

  // ---- rentang kedalaman ----
  let maxDepth = 0;
  pipes.forEach((p) => { maxDepth = Math.max(maxDepth, p.end); });
  screens.forEach((s) => { maxDepth = Math.max(maxDepth, s.depth + s.size); });
  if (hole) maxDepth = Math.max(maxDepth, hole.endDepth);
  extra.forEach((e) => { const d = e.endDepth !== undefined && Number.isFinite(e.endDepth) ? e.endDepth : e.startDepth; if (Number.isFinite(d)) maxDepth = Math.max(maxDepth, d); });
  const td = maxDepth;
  if (c.groundSet) maxDepth = Math.max(maxDepth, c.ground);
  const matAbs = c.matSet ? (c.ground || 0) + Number(c.mat) : null;
  if (matAbs !== null) maxDepth = Math.max(maxDepth, matAbs);
  if (!(maxDepth > 0)) maxDepth = 10;

  // ---- legenda (dihitung dulu agar tinggi plot pasti) ----
  const legend = [];
  if (pipes.length) legend.push({ t: 'Casing', fill: COL.casing, edge: COL.casingEdge });
  if (screens.length) legend.push({ t: 'Screen', fill: COL.screen, edge: COL.screenEdge });
  if (extra.some((e) => e.type === 'gravel_pack')) legend.push({ t: 'Pasir filter', fill: COL.gravel, edge: COL.gravelEdge });
  if (extra.some((e) => e.type === 'cement_grouting')) legend.push({ t: 'Semen rekat', fill: COL.cement, edge: COL.cementEdge });
  if (hole) legend.push({ t: 'Lubang terbuka', fill: COL.hole, edge: COL.holeEdge });
  if (matAbs !== null) legend.push({ t: 'Muka air tanah', fill: [190, 212, 250], edge: COL.water });
  if (c.groundSet) legend.push({ t: 'Permukaan tanah', fill: COL.soil, edge: COL.ground });
  const legW = (it) => 8 + (pdf.setFont('helvetica', 'normal'), pdf.setFontSize(6.6), pdf.getTextWidth(it.t)) + 5;
  const legRows = [];
  let curRow = []; let curW = 0;
  legend.forEach((it) => {
    const lw = legW(it);
    if (curW + lw > w - 8 && curRow.length) { legRows.push(curRow); curRow = []; curW = 0; }
    curRow.push({ ...it, lw }); curW += lw;
  });
  if (curRow.length) legRows.push(curRow);
  const legendH = legRows.length ? legRows.length * 5.2 + 4 : 0;

  // ---- geometri ----
  const plotTop = y + 9 + 9;
  const plotBottom = y + h - legendH - 7;
  const rulerX = x + 15;
  const areaL = rulerX + 3;
  const labelX = x + Math.max(w * 0.6, 62 + 15);
  const areaR = labelX - 8;
  const wellCx = areaL + (areaR - areaL) * 0.5;
  const scale = (plotBottom - plotTop) / (maxDepth * 1.02);
  const Y = (d) => plotTop + d * scale;

  const diameters = pipes.map((p) => p.diameter).filter((d) => d > 0);
  const maxD = diameters.length ? Math.max(...diameters) : 1;
  const maxW = Math.min(26, (areaR - areaL) * 0.36);
  const minW = 8;
  const casingW = (d) => (d > 0 ? minW + (d / maxD) * (maxW - minW) : minW);
  const widthAt = (depth) => {
    const cover = pipes.filter((p) => depth >= p.start - 0.01 && depth <= p.end + 0.01).map((p) => casingW(p.diameter));
    if (cover.length) return Math.min(...cover);
    if (pipes.length) return Math.min(...pipes.map((p) => casingW(p.diameter)));
    return 12;
  };
  const annW = 4;

  // latar bawah tanah
  const gy = c.groundSet ? Y(c.ground) : null;
  if (gy !== null) {
    doc.fillRect(areaL, gy, areaR - areaL, plotBottom - gy, COL.soil);
  }

  // grid & penggaris kedalaman
  const relMin = rel(0);
  const relMax = rel(maxDepth);
  const step = niceStep(relMax - relMin, 9);
  const first = Math.ceil(relMin / step - 1e-9) * step;
  pdf.setLineWidth(0.12);
  for (let v = first; v <= relMax + 1e-9; v += step) {
    const abs = v + (c.groundSet ? c.ground : 0);
    const py = Y(abs);
    if (py > plotBottom + 0.5) break;
    pdf.setDrawColor(...THEME.lineSoft);
    pdf.line(areaL, py, areaR, py);
    pdf.setDrawColor(...THEME.label);
    pdf.setLineWidth(0.3);
    pdf.line(rulerX - 2.5, py, rulerX, py);
    const lbl = v < -1e-9 ? `+${fmtNum(-v)}` : fmtNum(v);
    doc.text(lbl, rulerX - 3.6, py + 0.9, { size: 6.4, color: THEME.label, align: 'right' });
    pdf.setLineWidth(0.12);
  }
  pdf.setDrawColor(...THEME.label);
  pdf.setLineWidth(0.4);
  pdf.line(rulerX, plotTop, rulerX, plotBottom);

  const labels = [];
  const rightOf = (cx, wd) => cx + wd / 2;

  // lubang terbuka (paling belakang)
  if (hole) {
    const hw = maxW * 1.28;
    const top = Y(hole.startDepth); const bot = Y(hole.endDepth);
    doc.fillRect(wellCx - hw / 2, top, hw, bot - top, COL.hole);
    hatch(pdf, wellCx - hw / 2, top, hw, bot - top, 2.6, mix(COL.holeEdge, [255, 255, 255], 0.55), 0.12);
    pdf.setDrawColor(...COL.holeEdge);
    pdf.setLineWidth(0.35);
    pdf.setLineDashPattern([1.4, 1], 0);
    pdf.line(wellCx - hw / 2, top, wellCx - hw / 2, bot);
    pdf.line(wellCx + hw / 2, top, wellCx + hw / 2, bot);
    pdf.setLineDashPattern([], 0);
    labels.push({ y: (top + bot) / 2, ax: rightOf(wellCx, hw), title: 'Lubang terbuka', detail: range(hole.startDepth, hole.endDepth), color: COL.holeEdge });
  }

  // anulus: semen & pasir filter
  extra.filter((e) => e.type === 'cement_grouting' || e.type === 'gravel_pack').forEach((e) => {
    const s = Y(e.startDepth); const eY = Y(Number.isFinite(e.endDepth) ? e.endDepth : e.startDepth);
    const ah = Math.max(1.5, eY - s);
    const wd = widthAt((e.startDepth + (e.endDepth ?? e.startDepth)) / 2) + annW * 2;
    const isGravel = e.type === 'gravel_pack';
    doc.fillRect(wellCx - wd / 2, s, wd, ah, isGravel ? COL.gravel : COL.cement);
    if (isGravel) dots(pdf, wellCx - wd / 2, s, wd, ah, 1.7, 0.22, COL.gravelEdge);
    else hatch(pdf, wellCx - wd / 2, s, wd, ah, 1.8, COL.cementEdge, 0.12);
    doc.strokeRect(wellCx - wd / 2, s, wd, ah, isGravel ? COL.gravelEdge : COL.cementEdge, 0.25);
    labels.push({
      y: s + ah / 2, ax: rightOf(wellCx, wd),
      title: isGravel ? 'Pasir filter' : 'Semen rekat',
      detail: range(e.startDepth, e.endDepth ?? e.startDepth),
      color: isGravel ? COL.gravelEdge : COL.cementEdge,
    });
  });

  // casing (besar dulu agar yang kecil tampil di atasnya)
  [...pipes].sort((a, b) => b.diameter - a.diameter).forEach((p) => {
    const top = Y(p.start); const ph = Math.max(1, (p.end - p.start) * scale);
    const wd = casingW(p.diameter);
    doc.fillRect(wellCx - wd / 2, top, wd, ph, COL.casing);
    // sorotan silinder
    doc.fillRect(wellCx - wd / 2 + wd * 0.14, top, wd * 0.12, ph, mix(COL.casing, [255, 255, 255], 0.5));
    doc.fillRect(wellCx + wd / 2 - wd * 0.22, top, wd * 0.12, ph, mix(COL.casing, COL.casingEdge, 0.3));
    doc.strokeRect(wellCx - wd / 2, top, wd, ph, COL.casingEdge, 0.4);
    // sambungan
    pdf.setDrawColor(...COL.casingEdge);
    pdf.setLineWidth(0.3);
    const jointStep = Math.max(6, 3 * scale);
    for (let jy = top + jointStep; jy < top + ph - 1; jy += jointStep) pdf.line(wellCx - wd / 2, jy, wellCx + wd / 2, jy);
    labels.push({
      y: top + ph / 2, ax: rightOf(wellCx, wd),
      title: `${COMPONENT_LABELS[p._designerType] || 'Casing'}`,
      detail: `Dia. ${fmtNum(p.diameter)} in  |  ${range(p.start, p.end)}`,
      color: COL.casingEdge,
    });
  });

  // screen
  screens.forEach((s) => {
    const top = Y(s.depth); const sh = Math.max(1.5, s.size * scale);
    const wd = widthAt(s.depth + s.size / 2);
    doc.fillRect(wellCx - wd / 2, top, wd, sh, COL.screen);
    pdf.setDrawColor(...mix(COL.screen, [255, 255, 255], 0.65));
    pdf.setLineWidth(0.28);
    for (let sy = top + 1.4; sy < top + sh - 0.8; sy += 1.7) {
      pdf.line(wellCx - wd * 0.3, sy, wellCx - wd * 0.06, sy);
      pdf.line(wellCx + wd * 0.06, sy, wellCx + wd * 0.3, sy);
    }
    doc.strokeRect(wellCx - wd / 2, top, wd, sh, COL.screenEdge, 0.4);
    labels.push({ y: top + sh / 2, ax: rightOf(wellCx, wd), title: 'Pipa saring (screen)', detail: range(s.depth, s.depth + s.size), color: COL.screenEdge });
  });

  // muka air di dalam sumur
  if (matAbs !== null) {
    const wy = Y(matAbs);
    const bottomY = Y(td);
    if (bottomY > wy) {
      const wd = widthAt(Math.max(matAbs, 0)) * 0.55;
      withOpacity(pdf, 0.45, (ok) => {
        pdf.setFillColor(...(ok ? COL.water : [150, 185, 245]));
        pdf.rect(wellCx - wd / 2, wy, wd, bottomY - wy, 'F');
      });
    }
  }

  // penanda titik (tutup sumur, pompa, dll.)
  extra.filter((e) => ['well_cap', 'submersible_pump', 'pump_position', 'water_level_marker'].includes(e.type)).forEach((e) => {
    const py = Y(e.startDepth);
    const wd = widthAt(e.startDepth);
    if (e.type === 'well_cap') {
      doc.fillRect(wellCx - wd / 2 - 2, py - 1.6, wd + 4, 1.8, THEME.ink, 0.4);
      labels.push({ y: py - 0.6, ax: wellCx + wd / 2 + 2, title: 'Tutup sumur', detail: `${fmtD(e.startDepth)} m`, color: THEME.ink });
    } else if (e.type === 'submersible_pump') {
      const pw = Math.max(4, wd * 0.5);
      pdf.setFillColor(...THEME.blue); pdf.setDrawColor(20, 50, 130); pdf.setLineWidth(0.3);
      pdf.roundedRect(wellCx - pw / 2, py - 3.5, pw, 7, 1.2, 1.2, 'FD');
      doc.fillRect(wellCx - pw / 2 + 0.8, py - 1.4, pw - 1.6, 0.6, [170, 195, 250]);
      labels.push({ y: py, ax: wellCx + pw / 2, title: 'Pompa submersible', detail: `${fmtD(e.startDepth)} m`, color: THEME.blue });
    } else if (e.type === 'pump_position') {
      pdf.setFillColor(...THEME.blue);
      pdf.triangle(wellCx - 2.2, py - 2.4, wellCx + 2.2, py - 2.4, wellCx, py + 1.2, 'F');
      labels.push({ y: py, ax: wellCx + 2.2, title: 'Posisi pompa', detail: `${fmtD(e.startDepth)} m`, color: THEME.blue });
    } else {
      pdf.setFillColor(8, 145, 178);
      pdf.triangle(wellCx - 2.2, py - 2.4, wellCx + 2.2, py - 2.4, wellCx, py + 1.2, 'F');
      labels.push({ y: py, ax: wellCx + 2.2, title: 'Pemarkah muka air', detail: `${fmtD(e.startDepth)} m`, color: [8, 145, 178] });
    }
  });

  // permukaan tanah
  if (gy !== null) {
    hatch(pdf, areaL, gy, areaR - areaL, 2.2, 1.6, mix(COL.ground, [255, 255, 255], 0.35), 0.15);
    pdf.setDrawColor(...COL.ground);
    pdf.setLineWidth(0.8);
    pdf.line(areaL, gy, areaR, gy);
    labels.push({ y: gy, ax: areaR, title: 'Permukaan tanah', detail: `0 ${unit}`, color: COL.ground });
  }

  // muka air tanah (garis & penanda)
  if (matAbs !== null) {
    const wy = Y(matAbs);
    pdf.setDrawColor(...COL.water);
    pdf.setLineWidth(0.5);
    pdf.setLineDashPattern([2, 1.4], 0);
    pdf.line(areaL, wy, areaR, wy);
    pdf.setLineDashPattern([], 0);
    pdf.setFillColor(...COL.water);
    pdf.triangle(areaL + 2, wy - 3.2, areaL + 7, wy - 3.2, areaL + 4.5, wy - 0.2, 'F');
    const artesian = Number(c.mat) < 0;
    labels.push({ y: wy, ax: areaR, title: 'Muka air tanah (MAT)', detail: `${fmtNum(c.mat)} m.bmt${artesian ? '  |  artesis' : ''}`, color: COL.water });
  }

  // dasar sumur
  if (td > 0) {
    const ty = Y(td);
    pdf.setDrawColor(...THEME.ink);
    pdf.setLineWidth(0.6);
    pdf.line(wellCx - maxW / 2 - 4, ty, wellCx + maxW / 2 + 4, ty);
    labels.push({ y: ty, ax: wellCx + maxW / 2 + 4, title: 'Kedalaman total', detail: `${fmtD(td)} ${unit}`, color: THEME.ink });
  }

  placeLabels(labels, plotTop + 1, plotBottom - 1, 8.2);
  const maxLabelW = x + w - 3 - (labelX + 2.6);
  labels.forEach((it) => drawLabel(doc, it, labelX, maxLabelW));

  // legenda
  let ly = y + h - legendH + 2.2;
  legRows.forEach((row) => {
    let lx = x + 4;
    row.forEach((it) => {
      doc.fillRect(lx, ly - 2.4, 5, 3.2, it.fill);
      doc.strokeRect(lx, ly - 2.4, 5, 3.2, it.edge, 0.25);
      doc.text(it.t, lx + 6.4, ly, { size: 6.6, color: THEME.label });
      lx += it.lw;
    });
    ly += 5.2;
  });
  if (legRows.length) doc.hline(x + 3, x + w - 3, y + h - legendH - 1, THEME.lineSoft, 0.2);
}

// ---------------------------------------------------------------------------
// Kolom litologi
// ---------------------------------------------------------------------------
function texture(pdf, pattern, x, y, w, h, dark) {
  const g = (s) => Math.max(s, Math.sqrt((w * h) / 900));
  switch (pattern) {
    case 'clay':
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.14);
      for (let yy = y + 1.6; yy < y + h - 0.4; yy += g(2.4)) pdf.line(x + 0.8, yy, x + w - 0.8, yy);
      break;
    case 'silty-clay':
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.14);
      for (let yy = y + 1.8; yy < y + h - 0.4; yy += g(3.2)) pdf.line(x + 0.8, yy, x + w - 0.8, yy);
      dots(pdf, x, y, w, h, 3, 0.2, dark);
      break;
    case 'silt': dots(pdf, x, y, w, h, 2.3, 0.2, dark); break;
    case 'sandy-silt':
      dots(pdf, x, y, w, h, 2.6, 0.22, dark);
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.12);
      for (let yy = y + 2.4; yy < y + h - 0.4; yy += g(5.2)) pdf.line(x + 1.2, yy, x + w - 1.2, yy);
      break;
    case 'fine-sand': dots(pdf, x, y, w, h, 1.8, 0.17, dark); break;
    case 'medium-sand': dots(pdf, x, y, w, h, 2.3, 0.28, dark); break;
    case 'coarse-sand': dots(pdf, x, y, w, h, 2.9, 0.4, dark); break;
    case 'gravel': case 'conglomerate': dots(pdf, x, y, w, h, 4, 0.85, dark, true); break;
    case 'sandy-gravel':
      dots(pdf, x, y, w, h, 4.4, 0.85, dark, true);
      dots(pdf, x + 1.2, y + 1.2, w - 1.2, h - 1.2, 2.6, 0.2, dark);
      break;
    case 'sandstone':
      dots(pdf, x, y, w, h, 2, 0.2, dark);
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.12);
      for (let yy = y + 3; yy < y + h - 0.4; yy += g(6)) pdf.line(x + 0.8, yy, x + w - 0.8, yy);
      break;
    case 'limestone': {
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.14);
      const bh = g(4.2); let r = 0;
      for (let yy = y + bh; yy < y + h; yy += bh, r++) {
        pdf.line(x + 0.4, yy, x + w - 0.4, yy);
        for (let xx = x + 4 + (r % 2) * 4; xx < x + w - 0.5; xx += 8) pdf.line(xx, yy - bh, xx, Math.min(yy, y + h - 0.2));
      }
      break;
    }
    case 'shale': case 'mudstone':
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.12);
      for (let yy = y + 1.2; yy < y + h - 0.3; yy += g(1.6)) pdf.line(x + 0.6, yy, x + w - 0.6, yy);
      break;
    case 'granite': case 'basalt': {
      pdf.setDrawColor(...dark); pdf.setLineWidth(0.15);
      const s = g(4.4);
      for (let yy = y + s / 2; yy < y + h - 0.6; yy += s) {
        for (let xx = x + s / 2; xx < x + w - 0.6; xx += s) { pdf.line(xx - 0.8, yy, xx + 0.8, yy); pdf.line(xx, yy - 0.8, xx, yy + 0.8); }
      }
      break;
    }
    case 'weathered-rock': case 'fractured-rock': case 'fill': case 'topsoil':
      hatch(pdf, x, y, w, h, g(pattern === 'fill' ? 3 : 2.4), dark, 0.13);
      break;
    default: break;
  }
}

export function drawGeologyColumn(doc, box, layers) {
  const pdf = doc.pdf;
  const { x, y, w, h } = box;
  panelFrame(doc, box, 'KOLOM LITOLOGI', 'Kedalaman dalam m.bmt');

  let maxDepth = 0;
  layers.forEach((l) => { maxDepth = Math.max(maxDepth, l.endDepth); });
  if (!(maxDepth > 0)) maxDepth = 10;

  // legenda material yang dipakai
  const used = [];
  layers.forEach((l) => { if (!used.includes(l.material)) used.push(l.material); });
  const legItems = used.map((m) => ({ id: m, t: GEOLOGY_MATERIALS[m]?.label || m }));
  const legRows = []; let row = []; let rw = 0;
  legItems.forEach((it) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.6);
    const lw = 8 + pdf.getTextWidth(clean(it.t)) + 5;
    if (rw + lw > w - 8 && row.length) { legRows.push(row); row = []; rw = 0; }
    row.push({ ...it, lw }); rw += lw;
  });
  if (row.length) legRows.push(row);
  const legendH = legRows.length * 5.6 + 4;

  const plotTop = y + 9 + 7;
  const plotBottom = y + h - legendH - 6;
  const rulerX = x + 15;
  const colL = rulerX + 4;
  const colW = Math.min(36, w * 0.24);
  const colR = colL + colW;
  const labelX = colR + 14;
  const scale = (plotBottom - plotTop) / maxDepth;
  const Y = (d) => plotTop + d * scale;

  // penggaris
  const step = niceStep(maxDepth, 9);
  pdf.setLineWidth(0.12);
  for (let v = 0; v <= maxDepth + 1e-9; v += step) {
    const py = Y(v);
    pdf.setDrawColor(...THEME.lineSoft);
    pdf.line(colL, py, colR, py);
    pdf.setDrawColor(...THEME.label); pdf.setLineWidth(0.3);
    pdf.line(rulerX - 2.5, py, rulerX, py);
    doc.text(fmtNum(v), rulerX - 3.6, py + 0.9, { size: 6.4, color: THEME.label, align: 'right' });
    pdf.setLineWidth(0.12);
  }
  pdf.setDrawColor(...THEME.label); pdf.setLineWidth(0.4);
  pdf.line(rulerX, plotTop, rulerX, plotBottom);

  const labels = [];
  layers.forEach((l) => {
    const mat = GEOLOGY_MATERIALS[l.material] || GEOLOGY_MATERIALS.unknownMaterial;
    const base = hexToRgb(mat.color);
    const fill = mix(base, [255, 255, 255], 0.5);
    const dark = mix(base, [0, 0, 0], 0.35);
    const top = Y(l.startDepth); const ph = Math.max(0.8, Y(l.endDepth) - top);
    doc.fillRect(colL, top, colW, ph, fill);
    texture(pdf, mat.pattern, colL, top, colW, ph, dark);
    pdf.setDrawColor(...THEME.label); pdf.setLineWidth(0.3);
    pdf.rect(colL, top, colW, ph, 'S');
    labels.push({
      y: top + ph / 2, ax: colR,
      title: l.name || mat.label,
      detail: `${fmtNum(l.startDepth)} - ${fmtNum(l.endDepth)} m  |  tebal ${fmtNum(l.endDepth - l.startDepth)} m`,
      color: dark,
    });
  });
  placeLabels(labels, plotTop + 1, plotBottom - 1, 8.2);
  const maxLabelW = x + w - 3 - (labelX + 2.6);
  labels.forEach((it) => drawLabel(doc, it, labelX, maxLabelW));

  // legenda
  let ly = y + h - legendH + 2.4;
  doc.hline(x + 3, x + w - 3, y + h - legendH - 1, THEME.lineSoft, 0.2);
  legRows.forEach((r) => {
    let lx = x + 4;
    r.forEach((it) => {
      const mat = GEOLOGY_MATERIALS[it.id] || GEOLOGY_MATERIALS.unknownMaterial;
      const base = hexToRgb(mat.color);
      doc.fillRect(lx, ly - 2.6, 5, 3.6, mix(base, [255, 255, 255], 0.5));
      texture(pdf, mat.pattern, lx, ly - 2.6, 5, 3.6, mix(base, [0, 0, 0], 0.35));
      doc.strokeRect(lx, ly - 2.6, 5, 3.6, THEME.label, 0.2);
      doc.text(it.t, lx + 6.4, ly, { size: 6.6, color: THEME.label });
      lx += it.lw;
    });
    ly += 5.6;
  });
}

// ---------------------------------------------------------------------------
// Hidrograf kedalaman muka air
// ---------------------------------------------------------------------------
export function drawHydrograph(doc, box, series, { refLabel } = {}) {
  const pdf = doc.pdf;
  const { x, y, w, h } = box;
  panelFrame(doc, box, 'HIDROGRAF MUKA AIR TANAH', refLabel ? `Acuan: ${refLabel}` : 'Kedalaman muka air (m)');

  const plL = x + 17; const plR = x + w - 8;
  const plT = y + 9 + 7; const plB = y + h - 13;
  const ds = series.map((s) => s.d);
  let dMin = Math.min(...ds); let dMax = Math.max(...ds);
  if (dMax - dMin < 1e-6) { dMin -= 0.5; dMax += 0.5; }
  const pad = (dMax - dMin) * 0.18;
  const step = niceStep(dMax - dMin + pad * 2, 5);
  dMin = Math.floor((dMin - pad) / step) * step;
  dMax = Math.ceil((dMax + pad) / step) * step;
  if (dMin < 0 && Math.min(...ds) >= 0) dMin = 0;
  const t0 = series[0].t.getTime(); const t1 = series[series.length - 1].t.getTime();
  const tr = t1 - t0 || 1;
  const X = (t) => plL + ((t - t0) / tr) * (plR - plL);
  const Yd = (d) => plT + ((d - dMin) / (dMax - dMin)) * (plB - plT);

  doc.fillRect(plL, plT, plR - plL, plB - plT, [251, 252, 252]);
  // grid horizontal + label
  pdf.setLineWidth(0.12);
  for (let v = dMin; v <= dMax + 1e-9; v += step) {
    const py = Yd(v);
    pdf.setDrawColor(...THEME.lineSoft);
    pdf.line(plL, py, plR, py);
    doc.text(fmtFixed(v, step < 1 ? 1 : 0), plL - 2, py + 0.9, { size: 6.4, color: THEME.label, align: 'right' });
  }
  // grid vertikal + label tanggal
  const nT = Math.min(5, Math.max(2, series.length));
  for (let i = 0; i < nT; i++) {
    const t = t0 + (tr * i) / (nT - 1);
    const px = X(t);
    pdf.setDrawColor(...THEME.lineSoft);
    pdf.line(px, plT, px, plB);
    doc.text(fmtDate(new Date(t), { long: false }), px, plB + 4.6, { size: 6.2, color: THEME.label, align: i === 0 ? 'left' : i === nT - 1 ? 'right' : 'center' });
  }
  pdf.setDrawColor(...THEME.label); pdf.setLineWidth(0.35);
  pdf.line(plL, plT, plL, plB);
  pdf.line(plL, plB, plR, plB);
  doc.text('Kedalaman (m)', x + 5, (plT + plB) / 2, { size: 6.4, color: THEME.muted, align: 'center', angle: 90 });

  // area tipis di bawah garis (ke dasar grafik)
  if (series.length > 1) {
    withOpacity(pdf, 0.12, () => {
      pdf.setFillColor(...THEME.teal);
      series.slice(1).forEach((s, i) => {
        const a = series[i]; const b = s;
        const xa = X(a.t.getTime()); const xb = X(b.t.getTime());
        pdf.triangle(xa, Yd(a.d), xb, Yd(b.d), xa, plB, 'F');
        pdf.triangle(xb, Yd(b.d), xb, plB, xa, plB, 'F');
      });
    });
  }
  // garis & titik
  pdf.setDrawColor(...THEME.teal); pdf.setLineWidth(0.7);
  for (let i = 1; i < series.length; i++) pdf.line(X(series[i - 1].t.getTime()), Yd(series[i - 1].d), X(series[i].t.getTime()), Yd(series[i].d));
  const dotR = series.length > 40 ? 0.6 : 1.1;
  series.forEach((s) => {
    pdf.setFillColor(...THEME.white); pdf.setDrawColor(...THEME.teal); pdf.setLineWidth(0.5);
    pdf.circle(X(s.t.getTime()), Yd(s.d), dotR, 'FD');
  });
  // label nilai terakhir
  const last = series[series.length - 1];
  const lx = X(last.t.getTime()); const ly = Yd(last.d);
  const txt = `${fmtFixed(last.d)} m`;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
  const tw = pdf.getTextWidth(txt) + 4;
  const bx = Math.min(lx - tw / 2, plR - tw);
  const by = ly - 8 < plT ? ly + 2.4 : ly - 8;
  doc.fillRect(bx, by, tw, 5.2, THEME.tealDark, 1.2);
  doc.text(txt, bx + tw / 2, by + 3.7, { size: 7, style: 'bold', color: THEME.white, align: 'center' });
}
