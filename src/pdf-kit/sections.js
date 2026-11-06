// Bagian-bagian laporan: sampul, daftar isi, konstruksi, geologi, monitoring, dll.
import { THEME, PAGE, fmtNum, fmtFixed, fmtSigned, fmtDate, val, clean } from './kit.js';
import { drawConstructionDiagram, drawGeologyColumn, drawHydrograph } from './diagrams.js';
import { getEffectiveModelForPDF, groupExtraComponentsForPDF } from '../designer/adapter.js';
import { COMPONENT_LABELS } from '../designer/model.js';
import { MEASUREMENT_METHODS, REFERENCE_POINTS } from '../monitoring/model.js';
import { GEOLOGY_MATERIALS } from '../geology/model.js';

// ---------------------------------------------------------------------------
// Konteks data (dihitung sekali, dipakai semua bagian)
// ---------------------------------------------------------------------------
export function buildContext({ model, well, project, designer, geology, monitoring }) {
  const { legacyModel, extraComponents, source } = getEffectiveModelForPDF({ model: { ...model, designer } });
  const extraGroups = groupExtraComponentsForPDF(extraComponents);

  const pipes = (legacyModel.pipes || []).slice().sort((a, b) => a.start - b.start);
  const screens = (legacyModel.screens || []).slice().sort((a, b) => a.depth - b.depth);
  const ground = legacyModel.ground;
  const groundSet = ground !== null && ground !== undefined;
  const mat = legacyModel.mat;
  const matSet = mat !== null && mat !== undefined;
  const openHole = legacyModel.openHole
    ? { startDepth: Number(legacyModel.openHole.start), endDepth: Number(legacyModel.openHole.end), size: Number(legacyModel.openHole.size) }
    : null;
  const currentDepth = pipes.length ? Number(pipes[pipes.length - 1].end) : 0;
  const rel = (abs) => (groundSet ? Number(abs) - Number(ground) : Number(abs));
  const fmtRel = (abs) => { const r = rel(abs); return r < -0.0001 ? `+${fmtNum(-r)}` : fmtNum(r); };
  const unit = groundSet ? 'm.bmt' : 'm (absolut)';

  const totalPipeLength = pipes.reduce((t, p) => t + (Number(p.end) - Number(p.start)), 0);
  const pipeInfo = pipes.length ? [...new Set(pipes.map((p) => fmtNum(p.diameter)))].join(' / ') : '-';

  const screenInfo = screens.length
    ? screens.map((s) => {
      const end = Number(s.depth) + Number(s.size);
      return groundSet ? `${fmtNum(rel(s.depth))} - ${fmtNum(rel(end))} m.bmt` : `${fmtNum(s.depth)} - ${fmtNum(end)} m`;
    }).join(', ')
    : '-';

  let pipeTopInfo = '-';
  if (pipes.length && groundSet) {
    const r = rel(pipes[0].start);
    pipeTopInfo = r >= 0 ? `${fmtNum(r)} m.bmt` : `${fmtNum(Math.abs(r))} m di atas tanah`;
  }

  let kedalamanSumur = '-';
  if (currentDepth > 0) kedalamanSumur = `${fmtNum(rel(openHole ? openHole.endDepth : currentDepth))} m.bmt`;

  let wellDepthMeters = currentDepth;
  if (openHole && Number.isFinite(openHole.endDepth)) wellDepthMeters = Math.max(wellDepthMeters, openHole.endDepth);
  (designer?.components || model?.designer?.components || []).forEach((c) => {
    const d = c.endDepth || c.startDepth || 0;
    if (d > wellDepthMeters) wellDepthMeters = d;
  });

  const mon = monitoring || geology?.groundwaterMonitoring || null;
  const series = (mon?.measurements || [])
    .filter((m) => m.status === 'valid' && Number.isFinite(m.waterLevelDepth))
    .map((m) => ({ ...m, measuredAt: new Date(m.measuredAt) }))
    .filter((m) => !Number.isNaN(m.measuredAt.getTime()))
    .sort((a, b) => a.measuredAt - b.measuredAt);

  const layers = (geology?.layers || [])
    .map((l) => ({ ...l, startDepth: Number(l.startDepth) || 0, endDepth: Number(l.endDepth) || 0 }))
    .filter((l) => l.endDepth > l.startDepth)
    .sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);

  return {
    well: well || {}, project: project || {}, designer, source,
    legacyModel, extra: extraComponents, extraGroups,
    pipes, screens, openHole, ground, groundSet, mat, matSet,
    currentDepth, totalPipeLength, pipeInfo, screenInfo, pipeTopInfo, kedalamanSumur, wellDepthMeters,
    rel, fmtRel, unit, series, layers,
  };
}

// ---------------------------------------------------------------------------
// Sampul
// ---------------------------------------------------------------------------
export function renderCover(doc, c, meta) {
  const pdf = doc.pdf;
  const W = PAGE.w; const H = PAGE.h; const left = PAGE.mx;
  doc.noChrome.add(doc.pageNo);
  doc.fillRect(0, 0, W, H, THEME.paper);

  // blok hero
  const heroH = 134;
  doc.fillRect(0, 0, W, heroH, THEME.tealDark);
  doc.fillRect(0, heroH, W, 2.2, [74, 190, 176]);

  // motif penggaris kedalaman (tema sumur)
  const rx = W - 26;
  pdf.setLineWidth(0.25);
  for (let i = 0, yy = 16; yy <= heroH - 12; i++, yy += 3.4) {
    const major = i % 5 === 0;
    pdf.setDrawColor(...(major ? [64, 156, 146] : [30, 105, 98]));
    pdf.line(rx, yy, rx + (major ? 7 : 3.6), yy);
    if (major && i % 10 === 0) doc.text(String(i * 2), rx - 2, yy + 0.9, { size: 5.4, color: [64, 156, 146], align: 'right' });
  }
  pdf.setDrawColor(30, 105, 98);
  pdf.setLineWidth(0.3);
  pdf.line(rx, 16, rx, heroH - 12);

  // logo
  let ty = 56;
  const logo = meta.logoDataUrl && doc.images.get(meta.logoDataUrl);
  if (logo) {
    doc.fillRect(left, 18, 30, 30, THEME.white, 3);
    doc.image(meta.logoDataUrl, left + 2, 20, 26, 26, { bg: null, border: null });
  }

  doc.text('LAPORAN TEKNIS  |  PENYELESAIAN SUMUR BOR', left, ty, { size: 8, style: 'bold', color: [140, 215, 205] });
  ty += 13;
  const titleW = rx - left - 14;
  const titleLines = doc.wrap(meta.title || 'Laporan Penyelesaian Sumur Bor', titleW, 25, 'bold').slice(0, 3);
  titleLines.forEach((line, i) => doc.text(line, left, ty + i * 11.2, { size: 25, style: 'bold', color: THEME.white }));
  const titleEnd = ty + (titleLines.length - 1) * 11.2;
  doc.fillRect(left, titleEnd + 6, 24, 1.3, [110, 214, 200]);

  // identitas sumur di dasar hero
  doc.text('SUMUR', left, heroH - 24, { size: 6.8, style: 'bold', color: [140, 215, 205] });
  doc.text(doc.fit(c.well.wellName || '-', titleW, 15, 'bold'), left, heroH - 16.5, { size: 15, style: 'bold', color: THEME.white });
  doc.text(`Kode ${c.well.wellCode || '-'}`, left, heroH - 10.4, { size: 8.6, color: [190, 225, 220] });

  // proyek
  let y = heroH + 16;
  doc.text('PROYEK', left, y, { size: 6.8, style: 'bold', color: THEME.muted });
  y += 6.6;
  const projLines = doc.wrap(c.project.projectName || '-', W - left * 2, 14, 'bold').slice(0, 2);
  projLines.forEach((l, i) => doc.text(l, left, y + i * 6.2, { size: 14, style: 'bold', color: THEME.ink }));
  y += (projLines.length - 1) * 6.2 + 6.2;
  const parties = [c.project.clientName && `Klien: ${c.project.clientName}`, c.project.contractorName && `Kontraktor: ${c.project.contractorName}`].filter(Boolean).join('   |   ');
  if (parties) doc.text(doc.fit(parties, W - left * 2, 8.8), left, y, { size: 8.8, color: THEME.label });
  const loc = [c.well.village, c.well.district, c.well.city, c.well.province].filter(Boolean).join(', ');
  if (loc) { y += 5.2; doc.text(doc.fit(loc, W - left * 2, 8.4), left, y, { size: 8.4, color: THEME.muted }); }

  // ringkasan angka
  doc.y = y + 11;
  doc.fresh = false;
  const firstScreen = c.screens[0];
  doc.stats([
    { label: 'Kedalaman total', value: c.kedalamanSumur },
    { label: 'Diameter casing', value: c.pipeInfo === '-' ? '-' : `${c.pipeInfo} in` },
    { label: 'Interval screen', value: c.screens.length ? `${c.screens.length} interval` : '-', sub: firstScreen ? `${fmtNum(c.rel(firstScreen.depth))} - ${fmtNum(c.rel(Number(firstScreen.depth) + Number(firstScreen.size)))} ${c.unit}` : '' },
    { label: 'Elevasi', value: c.well.elevation ? `${fmtNum(c.well.elevation)} mdpl` : '-' },
  ]);

  // metadata dokumen
  const items = [
    ['Nomor laporan', meta.reportNumber],
    ['Revisi', meta.revision],
    ['Tanggal', meta.reportDate ? fmtDate(meta.reportDate) : ''],
    ['Disusun oleh', meta.preparedBy],
    ['Ditinjau oleh', meta.reviewedBy],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (items.length) {
    const rows = Math.ceil(items.length / 2);
    const rowH = 15;
    const top = H - 26 - rows * rowH;
    doc.hline(left, W - left, top, THEME.line, 0.3);
    doc.fillRect(left, top - 0.45, 22, 0.9, THEME.teal);
    const colW = (W - left * 2) / 2;
    items.forEach(([label, value], i) => {
      const cx = left + (i % 2) * colW;
      const cy = top + 8 + Math.floor(i / 2) * rowH;
      doc.text(String(label).toUpperCase(), cx, cy, { size: 6.6, style: 'bold', color: THEME.muted });
      doc.text(doc.fit(String(value), colW - 6, 10.5), cx, cy + 5.6, { size: 10.5, color: THEME.ink });
    });
  }
  doc.text(`Dokumen dihasilkan dari data lapangan  |  ${fmtDate(new Date())}`, left, H - 12, { size: 7, color: THEME.faint });
}

// ---------------------------------------------------------------------------
// Daftar isi (dirender di akhir, saat nomor halaman sudah diketahui)
// ---------------------------------------------------------------------------
export function renderToc(doc, page) {
  const pdf = doc.pdf;
  pdf.setPage(page);
  const x = PAGE.mx; const w = PAGE.w - PAGE.mx * 2;
  let y = PAGE.top;
  doc.text('DOKUMEN', x, y + 3.2, { size: 8.5, style: 'bold', color: THEME.teal });
  doc.text('Daftar Isi', x, y + 11, { size: 17, style: 'bold', color: THEME.ink });
  doc.hline(x, x + w, y + 14.2, THEME.line, 0.25);
  doc.fillRect(x, y + 13.75, 22, 0.9, THEME.teal);
  y += 28;
  doc.toc.forEach((e) => {
    const rowH = 12;
    doc.text(e.number || '', x, y + 1, { size: 9.5, style: 'bold', color: THEME.teal });
    doc.text(e.title, x + 12, y + 1, { size: 11, style: 'bold', color: THEME.ink });
    const tw = (pdf.setFont('helvetica', 'bold'), pdf.setFontSize(11), pdf.getTextWidth(clean(e.title)));
    const pageText = String(e.page);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5);
    const pw = pdf.getTextWidth(pageText);
    // garis titik penuntun
    pdf.setDrawColor(...THEME.faint);
    pdf.setLineWidth(0.25);
    pdf.setLineDashPattern([0.2, 1.3], 0);
    pdf.line(x + 12 + tw + 3, y + 1.2, x + w - pw - 3, y + 1.2);
    pdf.setLineDashPattern([], 0);
    doc.text(pageText, x + w, y + 1, { size: 10.5, style: 'bold', color: THEME.ink, align: 'right' });
    try { pdf.link(x, y - 5, w, rowH - 2, { pageNumber: e.page }); } catch { /* abaikan */ }
    doc.hline(x, x + w, y + 5.2, THEME.lineSoft, 0.15);
    y += rowH;
  });
}

// ---------------------------------------------------------------------------
// Informasi proyek & sumur (laporan lengkap)
// ---------------------------------------------------------------------------
export function sectionInfo(doc, c) {
  const { well, project } = c;
  doc.h1(doc.nextNo(), 'Informasi Proyek & Sumur', 'Identitas pekerjaan, lokasi, dan spesifikasi sumur');
  doc.h2('Proyek');
  doc.kvGrid([
    { label: 'Nama proyek', value: val(project.projectName), span: 2 },
    { label: 'Kode proyek', value: val(project.projectCode) },
    { label: 'Klien', value: val(project.clientName) },
    { label: 'Kontraktor', value: val(project.contractorName) },
    { label: 'Lokasi proyek', value: val(project.location) },
  ]);
  doc.h2('Sumur');
  doc.kvGrid([
    { label: 'Nama sumur', value: val(well.wellName) },
    { label: 'Kode sumur', value: val(well.wellCode) },
    { label: 'Tipe sumur', value: val(well.wellType) },
    { label: 'Status', value: val(well.status) },
    { label: 'Kedalaman rencana', value: well.plannedDepth ? `${fmtNum(well.plannedDepth)} m` : '-' },
    { label: 'Kedalaman aktual', value: well.actualDepth ? `${fmtNum(well.actualDepth)} m` : '-' },
    { label: 'Tanggal mulai bor', value: well.drillingDate ? fmtDate(well.drillingDate) : '-' },
    { label: 'Tanggal selesai bor', value: well.completionDate ? fmtDate(well.completionDate) : '-' },
    { label: 'Perusahaan', value: val(well.companyName) },
    { label: 'Nomor urut sumur bor', value: val(well.shallowWellNumber) },
  ]);
  doc.h2('Lokasi & koordinat');
  doc.kvGrid([
    { label: 'Alamat', value: val(well.address), span: 2 },
    { label: 'Desa/Kelurahan', value: val(well.village || project.village) },
    { label: 'Kecamatan', value: val(well.district || project.district) },
    { label: 'Kabupaten/Kota', value: val(well.city) },
    { label: 'Provinsi', value: val(well.province || project.province) },
    { label: 'Koordinat (lintang, bujur)', value: well.latitude && well.longitude ? `${well.latitude}, ${well.longitude}` : '-' },
    { label: 'Elevasi', value: well.elevation ? `${fmtNum(well.elevation)} mdpl` : '-' },
  ]);
  doc.h2('Peralatan');
  doc.kvGrid([
    { label: 'Jenis / kapasitas pompa', value: val(well.pumpType) },
    { label: 'Posisi pompa', value: well.pumpPosition ? `${fmtNum(well.pumpPosition)} m` : '-' },
    { label: 'Jarak piezometer ke sumur', value: well.piezoDistance ? `${fmtNum(well.piezoDistance)} m` : '-' },
    { label: 'Jarak muka pipa ke tanah', value: c.pipeTopInfo },
  ]);
}

// ---------------------------------------------------------------------------
// Konstruksi sumur
// ---------------------------------------------------------------------------
function boreholeDepthText(c, i) {
  const { pipes, screens, groundSet, ground, matSet, mat, currentDepth, openHole } = c;
  const bmt = (abs) => {
    const v = Number(abs) - Number(ground);
    return v >= 0 ? `${fmtNum(v)} m.bmt` : `${fmtNum(Math.abs(v))} m di atas tanah`;
  };
  const baseDepth = openHole ? Number(openHole.endDepth) : Number(currentDepth);
  if (groundSet) {
    switch (i) {
      case 1: return pipes.length ? bmt(pipes[0].start) : '';
      case 2: if (!matSet) return ''; return Number(mat) >= 0 ? `${fmtNum(mat)} m.bmt` : `${fmtNum(Math.abs(Number(mat)))} m di atas tanah (artesis)`;
      case 3: return pipes.length ? bmt(pipes[pipes.length - 1].end) : '';
      case 4: return screens.length ? bmt(screens[0].depth) : '';
      case 5: return currentDepth > 0 ? bmt(baseDepth) : '';
      default: return '';
    }
  }
  switch (i) {
    case 1: return pipes.length ? `${fmtNum(pipes[0].start)} m (absolut)` : '';
    case 2: return matSet ? `${fmtNum(Number(ground || 0) + Number(mat))} m (absolut)` : '';
    case 3: return pipes.length ? `${fmtNum(pipes[pipes.length - 1].end)} m (absolut)` : '';
    case 4: return screens.length ? `${fmtNum(screens[0].depth)} m (absolut)` : '';
    case 5: return currentDepth > 0 ? `${fmtNum(baseDepth)} m (absolut)` : '';
    default: return '';
  }
}

const BOREHOLE_NAMES = { 1: 'Ujung pipa awal', 2: 'Muka air tanah', 3: 'Batas pipa', 4: 'Screen perforasi', 5: 'Dasar sumur bor' };

function componentRows(c) {
  const rel = c.fmtRel;
  const rows = [];
  const comps = (c.designer?.components || []).filter((x) => x.visible !== false);
  if (comps.length) {
    comps.slice().sort((a, b) => (a.startDepth || 0) - (b.startDepth || 0)).forEach((x) => {
      const point = x.endDepth === undefined || x.endDepth === null || !(Number(x.endDepth) > Number(x.startDepth));
      rows.push([
        { t: x.name || COMPONENT_LABELS[x.type] || x.type, bold: true },
        COMPONENT_LABELS[x.type] || x.type,
        rel(x.startDepth),
        point ? '-' : rel(x.endDepth),
        point ? '-' : fmtNum(Number(x.endDepth) - Number(x.startDepth)),
        x.outerDiameter ? fmtNum(x.outerDiameter) : '-',
        x.material && x.material !== '—' ? x.material : '-',
      ]);
    });
    return rows;
  }
  c.pipes.forEach((p, i) => rows.push([{ t: `Pipa ${i + 1}`, bold: true }, i === 0 ? 'Casing' : 'Casing', rel(p.start), rel(p.end), fmtNum(p.end - p.start), fmtNum(p.diameter * 25.4, 0), 'PVC']));
  c.screens.forEach((s, i) => rows.push([{ t: `Screen ${i + 1}`, bold: true }, 'Pipa saring', rel(s.depth), rel(Number(s.depth) + Number(s.size)), fmtNum(s.size), c.pipes.length ? fmtNum(c.pipes[c.pipes.length - 1].diameter * 25.4, 0) : '-', 'PVC']));
  if (c.openHole) rows.push([{ t: 'Open hole', bold: true }, 'Lubang terbuka', rel(c.openHole.startDepth), rel(c.openHole.endDepth), fmtNum(c.openHole.endDepth - c.openHole.startDepth), '-', 'Batuan']);
  return rows;
}

export function sectionConstruction(doc, c, { compact = false, boreholeImages = {}, showStats = true } = {}) {
  doc.h1(doc.nextNo(), 'Konstruksi Sumur Bor', `${val(c.well.wellName)} (${val(c.well.wellCode)})  |  kedalaman dalam ${c.unit}`);

  if (compact) {
    const { well, project } = c;
    const lon = well.longitude !== undefined && well.longitude !== null && well.longitude !== '' ? String(well.longitude) : '-';
    const lat = well.latitude !== undefined && well.latitude !== null && well.latitude !== '' ? String(well.latitude) : '-';
    doc.kvGrid([
      { label: 'Nama proyek', value: val(project.projectName), span: 2 },
      { label: 'Kode proyek', value: val(project.projectCode) },
      { label: 'Klien', value: val(project.clientName) },
      { label: 'Kontraktor', value: val(project.contractorName) },
      { label: 'Nama perusahaan', value: val(well.companyName), span: 2 },
      { label: 'Nomor urut sumur', value: val(well.shallowWellNumber) },
      { label: 'Alamat', value: val(well.address), span: 4 },
      { label: 'Desa/Kelurahan', value: val(well.village) },
      { label: 'Kecamatan', value: val(well.district) },
      { label: 'Kabupaten/Kota', value: val(well.city) },
      { label: 'Provinsi', value: val(well.province) },
      { label: 'X (bujur)', value: lon },
      { label: 'Y (lintang)', value: lat },
      { label: 'Elevasi', value: well.elevation ? `${fmtNum(well.elevation)} mdpl` : '-' },
      { label: 'Tanggal borehole', value: well.boreholeDate ? fmtDate(well.boreholeDate) : '-' },
    ], { cols: 4, valueSize: 8.2 });
  } else if (showStats) {
    const fs = c.screens[0];
    doc.stats([
      { label: 'Kedalaman total', value: c.kedalamanSumur },
      { label: 'Diameter casing', value: c.pipeInfo === '-' ? '-' : `${c.pipeInfo} in` },
      { label: 'Interval screen', value: c.screens.length ? `${c.screens.length} interval` : '-', sub: fs ? `${fmtNum(c.rel(fs.depth))} - ${fmtNum(c.rel(Number(fs.depth) + Number(fs.size)))} ${c.unit}` : '' },
      { label: 'Muka air tanah', value: c.matSet ? `${fmtNum(c.mat)} m` : '-', sub: c.matSet ? (Number(c.mat) < 0 ? 'artesis (di atas tanah)' : 'bawah muka tanah') : '' },
    ]);
  }

  const hasPhotos = [1, 2, 3, 4, 5].some((i) => boreholeImages[`borehole${i}`]);
  const maxBox = hasPhotos ? 215 : 150;
  const minBox = hasPhotos ? 150 : 110;
  if (doc.remaining < minBox) doc.newPage();
  const boxH = Math.min(doc.remaining - 2, maxBox);

  if (hasPhotos) {
    const gap = 3;
    const leftW = doc.cw * 0.31;
    const rightW = doc.cw - leftW - gap;
    const x = doc.x0; const y = doc.y;
    // panel foto borehole
    doc.fillRect(x, y, leftW, boxH, THEME.white);
    doc.fillRect(x, y, leftW, 9, THEME.tealDark);
    doc.text('GAMBAR BOREHOLE', x + 4, y + 5.9, { size: 7.4, style: 'bold', color: THEME.white });
    doc.strokeRect(x, y, leftW, boxH, THEME.line, 0.3);
    const slotH = (boxH - 9) / 5;
    for (let i = 1; i <= 5; i++) {
      const sy = y + 9 + (i - 1) * slotH;
      const imgH = slotH - 12.5;
      const imgX = x + 3; const imgW = leftW - 6;
      const key = boreholeImages[`borehole${i}`];
      doc.image(key, imgX, sy + 2.6, imgW, imgH, { pad: 0.6 });
      doc.fillRect(imgX + 1.2, sy + 3.8, 5.2, 5.2, THEME.tealDark, 2.6);
      doc.text(String(i), imgX + 3.8, sy + 7.4, { size: 6.4, style: 'bold', color: THEME.white, align: 'center' });
      doc.text(doc.fit(BOREHOLE_NAMES[i], imgW, 7, 'bold'), imgX, sy + 2.6 + imgH + 3.6, { size: 7, style: 'bold', color: THEME.ink });
      const dt = boreholeDepthText(c, i);
      if (dt) doc.text(doc.fit(dt, imgW, 6.4), imgX, sy + 2.6 + imgH + 6.9, { size: 6.4, color: THEME.teal });
      if (i < 5) doc.hline(x + 3, x + leftW - 3, sy + slotH, THEME.lineSoft, 0.2);
    }
    drawConstructionDiagram(doc, { x: x + leftW + gap, y, w: rightW, h: boxH }, c);
  } else {
    drawConstructionDiagram(doc, { x: doc.x0, y: doc.y, w: doc.cw, h: boxH }, c);
  }
  doc.advance(boxH + 6);

  if (!compact) {
    const rows = componentRows(c);
    if (rows.length) {
      doc.h2('Rincian komponen konstruksi', { keep: 40, note: `Kedalaman dalam ${c.unit}` });
      doc.table([
        { label: 'Komponen', w: 3.1 }, { label: 'Jenis', w: 2.5 },
        { label: 'Dari (m)', w: 1.2, align: 'right' }, { label: 'Sampai (m)', w: 1.3, align: 'right' },
        { label: 'Panjang (m)', w: 1.4, align: 'right' }, { label: 'OD (mm)', w: 1.1, align: 'right' },
        { label: 'Material', w: 1.6 },
      ], rows);
    }
  }
}

// ---------------------------------------------------------------------------
// Log geologi
// ---------------------------------------------------------------------------
export function sectionGeology(doc, c) {
  const layers = c.layers;
  if (!layers.length) return false;
  const { well, project } = c;
  const total = Math.max(...layers.map((l) => l.endDepth));
  const thickest = layers.reduce((a, l) => ((l.endDepth - l.startDepth) > (a.endDepth - a.startDepth) ? l : a), layers[0]);
  const matLabel = (l) => GEOLOGY_MATERIALS[l.material]?.label || l.material || '-';

  doc.h1(doc.nextNo(), 'Log Geologi', `Sumur ${val(well.wellName)}  |  Proyek ${val(project.projectName)}  |  kedalaman dalam m.bmt`);
  doc.stats([
    { label: 'Jumlah lapisan', value: String(layers.length) },
    { label: 'Kedalaman log', value: `${fmtNum(total)} m` },
    { label: 'Lapisan tertebal', value: doc.fit(thickest.name || matLabel(thickest), 38, 12, 'bold'), sub: `${fmtNum(thickest.endDepth - thickest.startDepth)} m` },
  ]);
  if (doc.remaining < 105) doc.newPage();
  const boxH = Math.min(Math.max(95, 28 + total * 2.4), Math.min(doc.remaining - 2, 165));
  drawGeologyColumn(doc, { x: doc.x0, y: doc.y, w: doc.cw, h: boxH }, layers);
  doc.advance(boxH + 7);

  doc.h2('Rincian lapisan', { keep: 40 });
  doc.table([
    { label: 'No', w: 0.7, align: 'center' },
    { label: 'Dari (m)', w: 1.2, align: 'right' }, { label: 'Sampai (m)', w: 1.3, align: 'right' }, { label: 'Tebal (m)', w: 1.2, align: 'right' },
    { label: 'Material', w: 2.1 }, { label: 'Nama lapisan', w: 2.6 }, { label: 'Keterangan', w: 3.4 },
  ], layers.map((l, i) => [
    String(i + 1), fmtNum(l.startDepth), fmtNum(l.endDepth), fmtNum(l.endDepth - l.startDepth),
    matLabel(l), { t: l.name || matLabel(l), bold: true }, l.description || l.formation || '-',
  ]));
  return true;
}

// ---------------------------------------------------------------------------
// Monitoring muka air tanah
// ---------------------------------------------------------------------------
export function sectionMonitoring(doc, c) {
  const s = c.series;
  if (!s.length) return false;
  const { well, project } = c;
  const depths = s.map((m) => m.waterLevelDepth);
  const latest = s[s.length - 1];
  const prev = s.length > 1 ? s[s.length - 2] : null;
  const change = prev && prev.referencePoint === latest.referencePoint ? latest.waterLevelDepth - prev.waterLevelDepth : null;
  const refLabel = (id) => REFERENCE_POINTS[id]?.label || id;
  const avg = depths.reduce((a, b) => a + b, 0) / depths.length;

  doc.h1(doc.nextNo(), 'Monitoring Muka Air Tanah', `Sumur ${val(well.wellName)}  |  Proyek ${val(project.projectName)}  |  kedalaman dalam meter`);
  doc.stats([
    { label: 'Pengukuran terbaru', value: `${fmtFixed(latest.waterLevelDepth)} m`, sub: refLabel(latest.referencePoint) },
    { label: 'Terdangkal (min)', value: `${fmtFixed(Math.min(...depths))} m` },
    { label: 'Terdalam (maks)', value: `${fmtFixed(Math.max(...depths))} m` },
    { label: 'Rata-rata', value: `${fmtFixed(avg)} m`, sub: `${s.length} pengukuran` },
  ]);
  doc.kvGrid([
    { label: 'Periode pengukuran', value: `${fmtDate(s[0].measuredAt, { long: false })} - ${fmtDate(latest.measuredAt, { long: false })}` },
    { label: 'Perubahan terakhir', value: change === null ? '-' : `${fmtSigned(change)} m (${change > 0 ? 'muka air turun' : change < 0 ? 'muka air naik' : 'tetap'})` },
  ], { cols: 2 });

  if (new Set(s.map((m) => m.referencePoint)).size > 1) {
    doc.callout('Data memuat beberapa titik referensi berbeda. Perbandingan kedalaman secara langsung tidak valid tanpa koreksi elevasi.', { tone: 'warn', title: 'Perhatian titik referensi' });
  }

  if (s.length > 1) {
    if (doc.remaining < 80) doc.newPage();
    const h = 70;
    drawHydrograph(doc, { x: doc.x0, y: doc.y, w: doc.cw, h }, s.map((m) => ({ t: m.measuredAt, d: m.waterLevelDepth })), { refLabel: refLabel(latest.referencePoint) });
    doc.advance(h + 7);
  }

  doc.h2('Riwayat pengukuran', { keep: 40, note: `${s.length} data valid` });
  doc.table([
    { label: 'No', w: 0.8, align: 'center' },
    { label: 'Tanggal & waktu', w: 2.5 }, { label: 'Kedalaman (m)', w: 1.9, align: 'right' }, { label: 'Perubahan (m)', w: 1.9, align: 'right' },
    { label: 'Titik acuan', w: 2 }, { label: 'Metode', w: 2.6 }, { label: 'Catatan', w: 2.4 },
  ], s.map((m, i) => {
    const p = i > 0 ? s[i - 1] : null;
    const ch = p && p.referencePoint === m.referencePoint ? m.waterLevelDepth - p.waterLevelDepth : null;
    return [
      String(i + 1), fmtDate(m.measuredAt, { long: false, time: true }), { t: fmtFixed(m.waterLevelDepth), bold: true },
      ch === null ? '-' : { t: fmtSigned(ch), color: ch > 0 ? THEME.amber : ch < 0 ? THEME.teal : THEME.ink },
      refLabel(m.referencePoint), MEASUREMENT_METHODS[m.method]?.label || m.method, m.notes || '-',
    ];
  }), { size: 7.2 });
  return true;
}

// ---------------------------------------------------------------------------
// Data borehole camera (laporan konstruksi)
// ---------------------------------------------------------------------------
export function sectionBoreholeCamera(doc, c, { boreholeImages = {} } = {}) {
  const { well } = c;
  let kedKonstruksi = c.totalPipeLength > 0 ? `${fmtNum(c.totalPipeLength)} m.bmt` : '-';
  doc.h1(doc.nextNo(), 'Data Borehole Camera', `Sumur ${val(well.wellName || well.wellNumber)}`);
  const rows = [
    { label: 'Nama perusahaan', value: val(well.companyName), span: 2 },
    { label: 'Nomor urut sumur bor', value: val(well.shallowWellNumber) },
    { label: 'Sumur', value: val(well.wellNumber) },
    { label: 'Alamat', value: val(well.address), span: 2 },
    { label: 'Koordinat', value: `X = ${val(well.longitude)}, Y = ${val(well.latitude)}` },
    { label: 'Elevasi', value: well.elevation ? `${fmtNum(well.elevation)} mdpl` : '-' },
    { label: 'Tanggal pelaksanaan borehole', value: well.boreholeDate ? fmtDate(well.boreholeDate) : '-' },
    { label: 'Kedalaman konstruksi sumur', value: kedKonstruksi },
    { label: 'Kedalaman sumur (setelah terendapkan lumpur/kotoran)', value: c.kedalamanSumur, span: 2 },
    { label: 'Konstruksi pipa (diameter)', value: c.pipeInfo === '-' ? '-' : `${c.pipeInfo} inci` },
    { label: 'Screen', value: c.screenInfo },
    { label: 'Jarak muka pipa ke permukaan tanah', value: c.pipeTopInfo },
    { label: 'Jarak piezometer ke sumur', value: well.piezoDistance ? `${fmtNum(well.piezoDistance)} m` : '-' },
    { label: 'Jenis / kapasitas pompa', value: val(well.pumpType) },
    { label: 'Posisi pompa', value: well.pumpPosition ? `${fmtNum(well.pumpPosition)} m` : '-' },
  ];
  if (c.source === 'designer' && c.extra.length) {
    const g = c.extraGroups; const lab = [];
    if (g.gravelPack.length) lab.push(`Pasir filter (${g.gravelPack.length})`);
    if (g.cementGrouting.length) lab.push(`Semen rekat (${g.cementGrouting.length})`);
    if (g.wellCap.length) lab.push(`Tutup sumur (${g.wellCap.length})`);
    if (g.submersiblePump.length) lab.push(`Pompa sumur (${g.submersiblePump.length})`);
    if (g.pumpPosition.length) lab.push(`Posisi pompa (${g.pumpPosition.length})`);
    if (g.waterLevelMarker.length) lab.push(`Pemarkah air (${g.waterLevelMarker.length})`);
    if (lab.length) rows.push({ label: 'Komponen desainer tambahan', value: lab.join(', '), span: 2 });
  }
  doc.kvGrid(rows, { cols: 2 });

  doc.h2('Foto sumur bor', { keep: 80 });
  const h = Math.min(doc.remaining - 4, 85);
  doc.image(boreholeImages.wellPhoto, doc.x0, doc.y, doc.cw, h, { pad: 2 });
  doc.advance(h + 4);
}

// ---------------------------------------------------------------------------
// Dokumentasi kegiatan (laporan konstruksi)
// ---------------------------------------------------------------------------
const DOC_TITLES = {
  1: 'Papan nama lokasi penyelidikan',
  2: 'Kenampakan sumur bor produksi',
  3: 'Persiapan pengukuran borehole camera',
  4: 'Kegiatan pengukuran borehole camera',
  5: 'Ukuran pipa PVC (casing sumur)',
  6: 'Pompa submersible',
};

export function activityImageList(activity) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    (activity?.[`doc${i}`] || []).forEach((it) => {
      const src = it?.dataUrl || it;
      if (typeof src === 'string' && src.startsWith('data:')) out.push(src);
    });
  }
  return out;
}

export function sectionActivityDocs(doc, activity) {
  doc.h1(doc.nextNo(), 'Dokumentasi Kegiatan Borehole Camera', 'Foto pelaksanaan pekerjaan di lapangan');
  for (let i = 1; i <= 6; i++) {
    const imgs = (activity?.[`doc${i}`] || []).map((it) => it?.dataUrl || it).filter((s) => typeof s === 'string' && s.startsWith('data:')).slice(0, 6);
    doc.h2(`${i}. ${DOC_TITLES[i]}`, { keep: imgs.length ? 70 : 26 });
    if (!imgs.length) {
      doc.ensure(14);
      doc.fillRect(doc.x0, doc.y, doc.cw, 10, THEME.zebra, 1.5);
      doc.strokeRect(doc.x0, doc.y, doc.cw, 10, THEME.line, 0.2, 1.5);
      doc.text('Belum ada foto untuk kategori ini.', doc.x0 + 4, doc.y + 6.2, { size: 7.8, style: 'italic', color: THEME.faint });
      doc.advance(14);
      continue;
    }
    doc.photoGrid(imgs.map((src) => ({ src })), { cols: imgs.length >= 3 ? 3 : 2, ratio: 0.75 });
    doc.y += 3;
  }
}

// ---------------------------------------------------------------------------
// Dokumentasi lapangan (laporan lengkap, foto terpilih)
// ---------------------------------------------------------------------------
export function sectionFieldDocs(doc, photos, categoryLabel, requested) {
  doc.h1(doc.nextNo(), 'Dokumentasi Lapangan', `${photos.length} foto terpilih`);
  if (!photos.length) {
    doc.callout(`${requested} foto dipilih, tetapi data gambarnya tidak dapat dimuat. Coba unggah ulang foto atau pilih foto lain.`, { tone: 'warn', title: 'Foto tidak dapat dimuat' });
    return;
  }
  if (photos.length < requested) {
    doc.callout(`${requested - photos.length} dari ${requested} foto terpilih tidak dapat dimuat dan dilewati.`, { tone: 'info' });
  }
  const groups = new Map();
  photos.forEach((p) => {
    const key = categoryLabel(p.category);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  groups.forEach((list, label) => {
    doc.h2(label, { keep: 70, note: `${list.length} foto` });
    doc.photoGrid(list.map((p) => ({
      src: p.dataUrl,
      title: p.name || 'Foto dokumentasi',
      sub: [p.description, p.documentedAt ? fmtDate(p.documentedAt, { long: false }) : ''].filter(Boolean).join('  |  '),
    })));
    doc.y += 3;
  });
}

// ---------------------------------------------------------------------------
// Catatan, kesimpulan, tanda tangan
// ---------------------------------------------------------------------------
export function sectionNotes(doc, { notes = {}, metadata = {} }) {
  doc.h1(doc.nextNo(), 'Catatan & Kesimpulan', 'Ringkasan temuan teknis dan rekomendasi');
  if (notes.technical) { doc.h2('Catatan teknis'); doc.paragraph(notes.technical); doc.gap(3); }
  if (notes.conclusion) { doc.h2('Kesimpulan'); doc.paragraph(notes.conclusion); doc.gap(3); }
  if (!notes.technical && !notes.conclusion) {
    doc.paragraph('Tidak ada catatan tambahan.', { color: THEME.muted });
  }

  // blok tanda tangan
  const blocks = [{ role: 'Disusun oleh', name: metadata.preparedBy }];
  if (metadata.reviewedBy) blocks.push({ role: 'Ditinjau oleh', name: metadata.reviewedBy });
  const h = 52;
  doc.ensure(h + 8);
  doc.gap(8);
  if (metadata.reportDate) {
    doc.text(fmtDate(metadata.reportDate), doc.x0 + doc.cw, doc.y, { size: 8.4, color: THEME.muted, align: 'right' });
    doc.advance(7);
  }
  const gap = 8;
  const w = Math.min(78, (doc.cw - gap * (blocks.length - 1)) / blocks.length);
  const totalW = w * blocks.length + gap * (blocks.length - 1);
  const startX = blocks.length === 1 ? doc.x0 + doc.cw - totalW : doc.x0;
  blocks.forEach((b, i) => {
    const x = startX + i * (w + gap);
    doc.text(b.role, x, doc.y + 3, { size: 8.6, color: THEME.label });
    doc.hline(x, x + w, doc.y + 31, THEME.ink, 0.3);
    doc.text(doc.fit(b.name || '', w, 9.4, 'bold'), x, doc.y + 36, { size: 9.4, style: 'bold', color: THEME.ink });
  });
  doc.advance(h - 8);
}
