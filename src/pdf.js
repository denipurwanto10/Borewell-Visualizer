// Template PDF disamakan 100% dengan versi lama:
// https://github.com/denipurwanto10/visualisasi_pipa/blob/main/js/script.js
// https://visualisasi-pipa.vercel.app/
// Tampilan web (CSS/React) TIDAK diubah.

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
  const names = { 1: 'Ujung Pipa Awal', 2: 'Muka Air Tanah', 3: 'Batas Pipa', 4: 'Screen Perporasi', 5: 'Dasar Sumur Bor' };
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

export async function downloadBoreholePdf({ model, well, activity, canvas }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const tableW = 155;
  const tableOffsetX = (pageW - tableW) / 2;

  // --- mapping data React -> variabel legacy (js/script.js) ---
  // well.companyName -> companyName, dll. activity.doc1-doc6 dipakai langsung.
  // boreholeImages dibaca dari bentuk React maupun legacy.
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

  const pipeSegments = (model?.pipes || []).slice().sort((a, b) => a.start - b.start);
  const saringanPosisi = (model?.screens || []).slice().sort((a, b) => a.depth - b.depth);
  const groundLevel = model?.ground;
  const groundLevelSet = model?.ground !== null && model?.ground !== undefined;
  const matLevel = model?.mat;
  const matSet = model?.mat !== null && model?.mat !== undefined;
  const openHole = model?.openHole
    ? { startDepth: Number(model.openHole.start), endDepth: Number(model.openHole.end), size: Number(model.openHole.size) }
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

  function drawCell(x, y, w, h, opts = {}) {
    if (opts.fill) {
      pdf.setFillColor(...opts.fill);
      pdf.rect(x, y, w, h, 'F');
    }
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, w, h, 'S');
  }

  function cellText(text, x, y, w, h, opts = {}) {
    const fontSize = opts.fontSize || 8;
    const bold = opts.bold || false;
    const align = opts.align || 'left';
    const color = opts.color || [0, 0, 0];
    const paddingX = opts.paddingX !== undefined ? opts.paddingX : 1.5;
    const paddingY = opts.paddingY !== undefined ? opts.paddingY : 1;
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
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text('KONSTRUKSI SUMUR BOR', pageW / 2, titleY, { align: 'center' });

  const leftLabelW = 32;
  const colonW = 5;
  const leftValW = 35;
  const rightLabelW = 18;
  const colonW2 = 5;
  const rightValW = tableW - leftLabelW - colonW - leftValW - rightLabelW - colonW2;
  const rowH = 7;
  let curY = titleY + 10;

  // Baris 1: Nama Perusahaan (full width)
  drawCell(tableOffsetX, curY, leftLabelW, rowH);
  cellText('Nama Perusahaan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
  drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
  cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
  const restW1 = leftValW + rightLabelW + colonW2 + rightValW;
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
  const imageHeight = 24;
  let imageCurrentY = imageStartY;

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
        // best-effort center-crop
        let drawW = imgW;
        let drawH = imgH;
        // legacy assumes 4/3 fallback; we just fill box
        addImageToPDF(pdf, dataUrl, imgX, imgY, drawW, drawH);
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
    pdf.setTextColor(37, 99, 235);

    let depthText = '';
    if (groundLevelSet) {
      switch (i) {
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
      switch (i) {
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
    if (depthText) pdf.text(depthText, imgX, imgY + imgH + 6);
    pdf.setTextColor(0, 0, 0);
    imageCurrentY += imgH + 9;
    if (imageCurrentY > curY + remainH - 10) break;
  }

  // KOLOM KANAN - GAMBAR KONSTRUKSI SUMUR BOR
  // Background dibuat penuh sampai seluruh area kolom PDF.
  drawCell(tableOffsetX + leftColW, curY, rightColW, remainH, { fill: [248, 250, 252] });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const ksLabelX = tableOffsetX + leftColW + rightColW / 2;
  pdf.text('GAMBAR KONSTRUKSI SUMUR BOR', ksLabelX, curY + 8, { align: 'center' });
  const ksTextW = pdf.getTextWidth('GAMBAR KONSTRUKSI SUMUR BOR');
  pdf.line(ksLabelX - ksTextW / 2, curY + 9, ksLabelX + ksTextW / 2, curY + 9);

  if (canvas && typeof canvas.toDataURL === 'function') {
    let imgData = '';
    try {
      // Untuk PDF saja, hilangkan teks judul yang berada di bagian atas canvas
      // tanpa mengubah tampilan canvas di halaman web. Area tersebut tetap
      // menggunakan background canvas agar hasil PDF tetap penuh dan rapi.
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext('2d');
      if (exportCtx) {
        const w = canvas.width;
        const h = canvas.height;
        const bg = exportCtx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#f8fafc');
        bg.addColorStop(0.55, '#eef2f7');
        bg.addColorStop(1, '#e2e8f0');
        exportCtx.fillStyle = bg;
        exportCtx.fillRect(0, 0, w, h);
        // Salin seluruh diagram kecuali header "SKEMA KONSTRUKSI SUMUR".
        // Tinggi header pada canvas adalah 52 px CSS; sesuaikan dengan DPR.
        const dpr = window.devicePixelRatio || 1;
        const headerPx = Math.round(52 * dpr);
        exportCtx.drawImage(canvas, 0, headerPx, w, h - headerPx, 0, headerPx, w, h - headerPx);
        imgData = exportCanvas.toDataURL('image/png');
      } else {
        imgData = canvas.toDataURL('image/png');
      }
      if (imgData === 'data:,') imgData = '';
    } catch { imgData = ''; }
    if (imgData) {
      try {
        const imgPadX = 5;
        const imgPadT = 15;
        const imgPadB = 5;
        const imgAreaW = rightColW - imgPadX * 2;
        const imgAreaH = remainH - imgPadT - imgPadB;
        const canvasRatio = (canvas.width || 520) / (canvas.height || 720);
        let imgW, imgH;
        if (imgAreaW / imgAreaH > canvasRatio) { imgH = imgAreaH; imgW = imgH * canvasRatio; }
        else { imgW = imgAreaW; imgH = imgW / canvasRatio; }
        const imgX = tableOffsetX + leftColW + imgPadX + (imgAreaW - imgW) / 2;
        const imgY = curY + imgPadT + (imgAreaH - imgH) / 2;
        pdf.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH);
      } catch {}
    }
  }

  // =========== HALAMAN 2: DATA BOREHOLE CAMERA ===========
  pdf.addPage();
  titleY = 20;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text('DATA BOREHOLE CAMERA', pageW / 2, titleY, { align: 'center' });

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
      // use 4/3 assumption for layout
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
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(0, 0, 0);
    pdf.text('DOKUMENTASI KEGIATAN BOREHOLE CAMERA', pageW / 2, 20, { align: 'center' });
    let currentY = 35;
    const categoryHeight = 70;
    const categorySpacing = 10;
    const startIdx = page === 3 ? 1 : 4;
    const endIdx = page === 3 ? 3 : 6;
    for (let i = startIdx; i <= endIdx; i++) {
      const categoryKey = `doc${i}`;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(37, 99, 235);
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

  pdf.save('laporan_konstruksi_sumur_bor.pdf');
}
