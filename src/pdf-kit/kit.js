// PDF layout kit — komponen dasar untuk laporan sumur bor.
// Semua satuan dalam mm (A4 portrait). Tidak ada dependensi selain instance jsPDF.

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------
export const THEME = {
  ink: [21, 32, 30],
  label: [52, 68, 64],
  muted: [112, 124, 120],
  faint: [160, 170, 167],
  teal: [13, 95, 90],
  tealDark: [7, 56, 53],
  tealMid: [28, 132, 124],
  tealSoft: [229, 241, 239],
  line: [214, 221, 218],
  lineSoft: [232, 237, 235],
  zebra: [246, 249, 248],
  paper: [248, 250, 249],
  white: [255, 255, 255],
  amber: [180, 119, 6],
  amberSoft: [254, 243, 214],
  blue: [37, 99, 235],
  blueSoft: [226, 236, 253],
  red: [185, 28, 28],
};

export const PAGE = { w: 210, h: 297, mx: 18, top: 27, bottom: 20 };
export const CONTENT_W = PAGE.w - PAGE.mx * 2;
const PT = 0.352778; // 1 pt dalam mm

// ---------------------------------------------------------------------------
// Utilitas teks & angka
// ---------------------------------------------------------------------------
const TEXT_MAP = {
  '″': '"', '′': "'", '→': '>', '←': '<', '≥': '>=', '≤': '<=',
  '×': 'x', '−': '-', '≈': '~', ' ': ' ', '​': '', '•': '•',
};
const WIN_ANSI_EXTRA = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2122]);

/** Bersihkan karakter yang tidak ada di font standar PDF (WinAnsi). */
export function clean(value) {
  if (value === null || value === undefined) return '';
  let out = '';
  for (const ch of String(value)) {
    if (TEXT_MAP[ch] !== undefined) { out += TEXT_MAP[ch]; continue; }
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF || WIN_ANSI_EXTRA.has(cp)) out += ch;
    else out += '?';
  }
  return out;
}

/** Angka format Indonesia (koma desimal), tanpa nol di belakang. */
export function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || n === '' || n === '-') return '-';
  const v = typeof n === 'string' ? parseFloat(n.replace(',', '.')) : Number(n);
  if (!Number.isFinite(v)) return '-';
  let s = v.toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/** Angka dengan jumlah desimal tetap (untuk tabel data). */
export function fmtFixed(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return v.toFixed(digits).replace('.', ',');
}

export function fmtSigned(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  const s = fmtFixed(Math.abs(v), digits);
  if (v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return s;
}

export function fmtDate(value, { long = true, time = false } = {}) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    const opts = long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: '2-digit', month: 'short', year: 'numeric' };
    if (time) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return d.toLocaleString('id-ID', opts);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export const val = (v, suffix = '') => {
  if (v === null || v === undefined || v === '' || v === '-') return '-';
  return `${v}${suffix}`;
};

export function hexToRgb(hex) {
  const h = String(hex || '#999999').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Campur warna `a` dengan `b` sebesar t (0..1 menuju b). */
export function mix(a, b, t) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t));
}

/** Langkah skala "bagus" (1, 2, 5, 10, ...) untuk rentang tertentu. */
export function niceStep(range, targetTicks = 9) {
  const raw = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / pow;
  const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return f * pow;
}

// ---------------------------------------------------------------------------
// Primitif gambar
// ---------------------------------------------------------------------------
export function withOpacity(pdf, opacity, fn) {
  let used = false;
  try {
    if (pdf.GState && pdf.setGState) {
      pdf.setGState(new pdf.GState({ opacity }));
      used = true;
    }
  } catch { /* abaikan */ }
  try { fn(used); } finally {
    if (used) { try { pdf.setGState(new pdf.GState({ opacity: 1 })); } catch { /* abaikan */ } }
  }
}

/** Arsir diagonal "/" yang terpotong rapi di dalam persegi panjang. */
export function hatch(pdf, x, y, w, h, spacing = 2, color = THEME.faint, lw = 0.15) {
  if (w <= 0 || h <= 0) return;
  pdf.setDrawColor(...color);
  pdf.setLineWidth(lw);
  for (let t = -h; t < w; t += spacing) {
    const u0 = Math.max(0, -t);
    const u1 = Math.min(h, w - t);
    if (u1 > u0) pdf.line(x + t + u0, y + h - u0, x + t + u1, y + h - u1);
  }
}

/** Titik-titik acak-teratur (pasir/kerikil). */
export function dots(pdf, x, y, w, h, spacing = 2, r = 0.25, color = THEME.faint, ring = false) {
  if (w <= 0 || h <= 0) return;
  const cols = Math.max(1, Math.floor(w / spacing));
  const rows = Math.max(1, Math.floor(h / spacing));
  const step = Math.max(spacing, Math.sqrt((w * h) / 900)); // batasi jumlah titik
  pdf.setFillColor(...color);
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.12);
  let k = 0;
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    const off = (k++ % 2) * (step / 2);
    for (let xx = x + step / 2 + off; xx < x + w - 0.1; xx += step) {
      const jx = ((Math.sin(xx * 12.9898 + yy * 78.233) * 43758.5453) % 1) * step * 0.18;
      const jy = ((Math.cos(xx * 39.346 + yy * 11.135) * 24634.6345) % 1) * step * 0.18;
      if (ring) pdf.circle(xx + jx, yy + jy, r, 'S');
      else pdf.circle(xx + jx, yy + jy, r, 'F');
    }
  }
  void cols; void rows;
}

// ---------------------------------------------------------------------------
// Pra-pemrosesan gambar (kompres & ukuran asli)
// ---------------------------------------------------------------------------
export async function prepareImage(src, { maxPx = 1600, quality = 0.82, format = 'JPEG' } = {}) {
  if (typeof src !== 'string' || !src.startsWith('data:image')) return null;
  const isJpeg = /^data:image\/jpe?g/i.test(src);
  const isPng = /^data:image\/png/i.test(src);
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { data: src, fmt: isPng ? 'PNG' : 'JPEG' };
  }
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = src;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return { data: src, fmt: isPng ? 'PNG' : 'JPEG' };
    const scale = Math.min(1, maxPx / Math.max(w, h));
    const keep = scale === 1 && ((format === 'JPEG' && isJpeg && src.length < 700000) || (format === 'PNG' && isPng && src.length < 700000));
    if (keep) return { data: src, w, h, fmt: format };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (format === 'JPEG') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = format === 'PNG' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
    return { data, w: canvas.width, h: canvas.height, fmt: format };
  } catch {
    return { data: src, fmt: isPng ? 'PNG' : 'JPEG' };
  }
}

// ---------------------------------------------------------------------------
// Doc — pembungkus jsPDF dengan alur vertikal, header/footer, dan komponen
// ---------------------------------------------------------------------------
export class Doc {
  constructor(pdf, { headerTitle = '', headerRight = '', footerLeft = '' } = {}) {
    this.pdf = pdf;
    this.headerTitle = clean(headerTitle);
    this.headerRight = clean(headerRight);
    this.footerLeft = clean(footerLeft);
    this.y = PAGE.top;
    this.fresh = true; // halaman aktif belum berisi apa pun
    this.noChrome = new Set();
    this.toc = [];
    this.images = new Map();
    this.sectionCount = 0;
  }

  nextNo() { this.sectionCount += 1; return String(this.sectionCount).padStart(2, '0'); }

  // ---- alur halaman -------------------------------------------------------
  get x0() { return PAGE.mx; }
  get cw() { return CONTENT_W; }
  get limit() { return PAGE.h - PAGE.bottom; }
  get remaining() { return this.limit - this.y; }
  get pageNo() { return this.pdf.internal.getCurrentPageInfo().pageNumber; }

  newPage() {
    this.pdf.addPage();
    this.y = PAGE.top;
    this.fresh = true;
  }

  /** Mulai di halaman baru (kecuali halaman aktif masih kosong). */
  startPage() {
    if (this.fresh) { this.y = PAGE.top; return; }
    this.newPage();
  }

  advance(h) { this.y += h; this.fresh = false; }

  /** Pastikan ada ruang h; bila tidak, pindah halaman. Return true bila pindah. */
  ensure(h) {
    if (this.y + h > this.limit + 0.001 && !this.fresh) { this.newPage(); return true; }
    return false;
  }

  // ---- teks ---------------------------------------------------------------
  font(size, style = 'normal', color = THEME.ink) {
    this.pdf.setFont('helvetica', style);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
  }

  lh(size, k = 1.38) { return size * PT * k; }

  wrap(text, w, size, style = 'normal') {
    const p = this.pdf;
    p.setFont('helvetica', style);
    p.setFontSize(size);
    const out = [];
    clean(text).split(/\r?\n/).forEach((par) => {
      if (par === '') { out.push(''); return; }
      p.splitTextToSize(par, w).forEach((line) => {
        if (p.getTextWidth(line) <= w + 0.01) { out.push(line); return; }
        let cur = '';
        for (const ch of line) {
          if (p.getTextWidth(cur + ch) > w) { out.push(cur); cur = ch; } else cur += ch;
        }
        if (cur) out.push(cur);
      });
    });
    return out.length ? out : [''];
  }

  /** Potong satu baris dengan elipsis agar muat. */
  fit(text, w, size, style = 'normal') {
    const p = this.pdf;
    p.setFont('helvetica', style);
    p.setFontSize(size);
    let s = clean(text);
    if (p.getTextWidth(s) <= w) return s;
    while (s.length > 1 && p.getTextWidth(`${s}...`) > w) s = s.slice(0, -1);
    return `${s}...`;
  }

  text(str, x, y, { size = 9, style = 'normal', color = THEME.ink, align = 'left', angle } = {}) {
    this.font(size, style, color);
    const opts = { align };
    if (angle) opts.angle = angle;
    this.pdf.text(clean(str), x, y, opts);
  }

  fillRect(x, y, w, h, color, r = 0) {
    this.pdf.setFillColor(...color);
    if (r > 0) this.pdf.roundedRect(x, y, w, h, r, r, 'F'); else this.pdf.rect(x, y, w, h, 'F');
  }

  strokeRect(x, y, w, h, color = THEME.line, lw = 0.2, r = 0) {
    this.pdf.setDrawColor(...color);
    this.pdf.setLineWidth(lw);
    if (r > 0) this.pdf.roundedRect(x, y, w, h, r, r, 'S'); else this.pdf.rect(x, y, w, h, 'S');
  }

  hline(x1, x2, y, color = THEME.line, lw = 0.2) {
    this.pdf.setDrawColor(...color);
    this.pdf.setLineWidth(lw);
    this.pdf.line(x1, y, x2, y);
  }

  // ---- judul --------------------------------------------------------------
  h1(number, title, subtitle, { newPage = true } = {}) {
    if (newPage) this.startPage(); else this.ensure(34);
    const y0 = this.y;
    const x = this.x0;
    this.toc.push({ number, title, page: this.pageNo });
    let ty = y0 + 8;
    if (number) {
      this.text(String(number), x, y0 + 3.2, { size: 8.5, style: 'bold', color: THEME.teal });
      ty = y0 + 11;
    }
    this.text(title, x, ty, { size: 17, style: 'bold', color: THEME.ink });
    let by = ty + 1.8;
    if (subtitle) {
      by = ty + 6.4;
      this.text(this.fit(subtitle, this.cw, 8.6), x, by, { size: 8.6, color: THEME.muted });
      by += 3.2;
    }
    this.hline(x, x + this.cw, by, THEME.line, 0.25);
    this.fillRect(x, by - 0.45, 22, 0.9, THEME.teal);
    this.y = by + 6;
    this.fresh = false;
  }

  h2(title, { keep = 28, note } = {}) {
    if (!this.ensure(keep) && !this.fresh) this.y += 3;
    const x = this.x0;
    this.fillRect(x, this.y - 3.3, 1.1, 4.6, THEME.teal);
    this.text(title, x + 3.2, this.y, { size: 10.5, style: 'bold', color: THEME.ink });
    if (note) this.text(note, x + this.cw, this.y, { size: 7.6, color: THEME.muted, align: 'right' });
    this.advance(6.4);
  }

  gap(h = 4) { this.y += h; }

  // ---- paragraf -----------------------------------------------------------
  paragraph(text, { size = 9.2, color = [40, 52, 49], lineK = 1.55, width = this.cw, x = this.x0, after = 3 } = {}) {
    const lines = this.wrap(text, width, size);
    const lh = this.lh(size, lineK);
    lines.forEach((line) => {
      this.ensure(lh + 1);
      this.font(size, 'normal', color);
      this.pdf.text(line, x, this.y + lh * 0.72);
      this.advance(lh);
    });
    this.y += after;
  }

  // ---- grid label-nilai ---------------------------------------------------
  /** items: [{ label, value, span }] — gaya lembar spesifikasi. */
  kvGrid(items, { cols = 2, valueSize = 9, labelSize = 6.6 } = {}) {
    const colW = this.cw / cols;
    const padX = 3.2;
    const rows = [];
    let cur = [];
    let used = 0;
    items.filter(Boolean).forEach((it) => {
      const span = Math.min(it.span || 1, cols);
      if (used + span > cols) { rows.push(cur); cur = []; used = 0; }
      cur.push({ ...it, span });
      used += span;
      if (used >= cols) { rows.push(cur); cur = []; used = 0; }
    });
    if (cur.length) rows.push(cur);

    const lhV = this.lh(valueSize, 1.32);
    rows.forEach((row) => {
      const cells = row.map((c) => {
        const w = colW * c.span;
        const lines = this.wrap(c.value === undefined || c.value === '' ? '-' : c.value, w - padX * 2, valueSize, 'bold');
        return { ...c, w, lines };
      });
      const h = Math.max(...cells.map((c) => 2.6 + 3 + c.lines.length * lhV + 2.4));
      this.ensure(h);
      let x = this.x0;
      cells.forEach((c) => {
        this.fillRect(x, this.y, c.w, h, THEME.white);
        this.strokeRect(x, this.y, c.w, h, THEME.line, 0.2);
        this.text(String(c.label).toUpperCase(), x + padX, this.y + 4, { size: labelSize, style: 'bold', color: THEME.muted });
        this.font(valueSize, 'bold', THEME.ink);
        c.lines.forEach((line, i) => this.pdf.text(line, x + padX, this.y + 8.4 + i * lhV));
        x += c.w;
      });
      this.advance(h);
    });
    this.y += 4;
  }

  // ---- tabel --------------------------------------------------------------
  /** cols: [{ label, w, align }]; rows: array of arrays (sel boleh { t, bold, color }). */
  table(cols, rows, { size = 7.8, headSize = 6.5, padX = 2.3, padY = 1.9, zebra = true, minRowH = 6.2, headH = 7.2, emptyText } = {}) {
    const totalWeight = cols.reduce((a, c) => a + (c.w || 1), 0);
    const widths = cols.map((c) => (this.cw * (c.w || 1)) / totalWeight);
    const lhR = this.lh(size, 1.3);

    const drawHead = () => {
      let x = this.x0;
      this.fillRect(x, this.y, this.cw, headH, THEME.tealDark);
      cols.forEach((c, j) => {
        const align = c.align || 'left';
        const tx = align === 'right' ? x + widths[j] - padX : align === 'center' ? x + widths[j] / 2 : x + padX;
        this.font(headSize, 'bold', THEME.white);
        const label = this.fit(String(c.label).toUpperCase(), widths[j] - padX * 2, headSize, 'bold');
        this.font(headSize, 'bold', THEME.white);
        this.pdf.text(label, tx, this.y + headH / 2 + headSize * PT * 0.36, { align });
        x += widths[j];
      });
      this.advance(headH);
    };

    if (!rows.length) {
      this.ensure(headH + minRowH);
      drawHead();
      this.fillRect(this.x0, this.y, this.cw, 9, THEME.zebra);
      this.text(emptyText || 'Tidak ada data.', this.x0 + padX, this.y + 5.6, { size, color: THEME.muted });
      this.advance(9);
      this.y += 4;
      return;
    }

    const prepared = rows.map((row) => {
      const cells = row.map((cell, j) => {
        const o = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : { t: cell };
        const lines = this.wrap(o.t === undefined || o.t === null || o.t === '' ? '-' : o.t, widths[j] - padX * 2, size, o.bold ? 'bold' : 'normal');
        return { ...o, lines };
      });
      const h = Math.max(minRowH, Math.max(...cells.map((c) => c.lines.length)) * lhR + padY * 2);
      return { cells, h };
    });

    this.ensure(headH + prepared[0].h);
    drawHead();
    prepared.forEach((row, i) => {
      if (this.y + row.h > this.limit + 0.001) { this.newPage(); drawHead(); }
      if (zebra && i % 2 === 1) this.fillRect(this.x0, this.y, this.cw, row.h, THEME.zebra);
      let x = this.x0;
      row.cells.forEach((c, j) => {
        const align = cols[j].align || 'left';
        const tx = align === 'right' ? x + widths[j] - padX : align === 'center' ? x + widths[j] / 2 : x + padX;
        this.font(size, c.bold ? 'bold' : 'normal', c.color || THEME.ink);
        c.lines.forEach((line, k) => this.pdf.text(line, tx, this.y + padY + size * PT * 0.82 + k * lhR, { align }));
        x += widths[j];
      });
      this.hline(this.x0, this.x0 + this.cw, this.y + row.h, THEME.lineSoft, 0.15);
      this.advance(row.h);
    });
    this.hline(this.x0, this.x0 + this.cw, this.y, THEME.line, 0.3);
    this.y += 5;
  }

  // ---- kartu statistik ----------------------------------------------------
  stats(items) {
    const n = items.length;
    if (!n) return;
    const gap = 3.5;
    const w = (this.cw - gap * (n - 1)) / n;
    const h = 21;
    this.ensure(h + 4);
    items.forEach((it, i) => {
      const x = this.x0 + i * (w + gap);
      const y = this.y;
      this.fillRect(x, y, w, h, THEME.tealSoft, 2);
      this.fillRect(x, y + 3, 0.9, h - 6, THEME.teal);
      this.text(String(it.label).toUpperCase(), x + 4, y + 5.6, { size: 6.3, style: 'bold', color: THEME.muted });
      let size = 14;
      const valueText = clean(it.value);
      this.pdf.setFont('helvetica', 'bold');
      while (size > 8) { this.pdf.setFontSize(size); if (this.pdf.getTextWidth(valueText) <= w - 8) break; size -= 0.5; }
      this.text(valueText, x + 4, y + 13.2, { size, style: 'bold', color: it.color || THEME.tealDark });
      if (it.sub) this.text(this.fit(it.sub, w - 8, 6.8), x + 4, y + 18, { size: 6.8, color: THEME.muted });
    });
    this.advance(h + 5);
  }

  // ---- callout ------------------------------------------------------------
  callout(text, { tone = 'warn', title } = {}) {
    const tones = {
      warn: { bg: THEME.amberSoft, bar: THEME.amber, fg: [120, 74, 4] },
      info: { bg: THEME.blueSoft, bar: THEME.blue, fg: [30, 64, 150] },
      note: { bg: THEME.tealSoft, bar: THEME.teal, fg: THEME.tealDark },
    };
    const t = tones[tone] || tones.note;
    const size = 8.2;
    const lines = this.wrap(text, this.cw - 11, size);
    const lh = this.lh(size, 1.4);
    const h = 5 + (title ? 5 : 0) + lines.length * lh + 1;
    this.ensure(h + 3);
    this.fillRect(this.x0, this.y, this.cw, h, t.bg, 1.6);
    this.fillRect(this.x0, this.y, 1.4, h, t.bar);
    let ty = this.y + 5;
    if (title) { this.text(title, this.x0 + 5, ty, { size: 8.4, style: 'bold', color: t.fg }); ty += 5; }
    this.font(size, 'normal', t.fg);
    lines.forEach((l, i) => this.pdf.text(l, this.x0 + 5, ty + i * lh));
    this.advance(h + 4);
  }

  // ---- gambar / foto ------------------------------------------------------
  async loadImages(list, opts) {
    const unique = [...new Set(list.filter((s) => typeof s === 'string' && s.startsWith('data:image')))];
    for (const src of unique) {
      if (!this.images.has(src)) this.images.set(src, await prepareImage(src, opts));
    }
  }

  /** Gambar dalam kotak (contain, di tengah). Return false bila gagal. */
  image(src, x, y, w, h, { bg = THEME.zebra, border = THEME.line, pad = 0 } = {}) {
    if (bg) this.fillRect(x, y, w, h, bg);
    const entry = this.images.get(src) || (typeof src === 'string' && src.startsWith('data:image') ? { data: src } : null);
    let ok = false;
    if (entry) {
      try {
        let iw = entry.w; let ih = entry.h;
        if (!iw || !ih) {
          const props = this.pdf.getImageProperties(entry.data);
          iw = props.width; ih = props.height;
        }
        const bw = w - pad * 2; const bh = h - pad * 2;
        const ratio = iw / ih;
        let dw = bw; let dh = bw / ratio;
        if (dh > bh) { dh = bh; dw = bh * ratio; }
        const fmt = entry.fmt || (/^data:image\/png/i.test(entry.data) ? 'PNG' : 'JPEG');
        this.pdf.addImage(entry.data, fmt, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, 'FAST');
        ok = true;
      } catch { ok = false; }
    }
    if (!ok) {
      this.text('Gambar tidak tersedia', x + w / 2, y + h / 2 + 1, { size: 7, color: THEME.faint, align: 'center', style: 'italic' });
    }
    if (border) this.strokeRect(x, y, w, h, border, 0.2);
    return ok;
  }

  /** items: [{ src, title, sub }] — kolom menyesuaikan jumlah foto. */
  photoGrid(items, { cols, ratio = 0.72, numbered = true, capLines = 2 } = {}) {
    if (!items.length) return;
    const n = items.length;
    const c = cols || (n === 1 ? 1 : n <= 4 ? 2 : 3);
    const gap = 5;
    const w = (this.cw - gap * (c - 1)) / c;
    const imgH = Math.min(w * ratio, c === 1 ? 105 : 200);
    const capSize = 7.4;
    const capLh = this.lh(capSize, 1.3);
    const hasCap = items.some((it) => it.title || it.sub);
    const capH = hasCap ? 4 + capLines * capLh + 2 : 0;
    for (let i = 0; i < n; i += c) {
      const row = items.slice(i, i + c);
      const captions = row.map((it) => {
        const t = this.wrap(it.title || '', w - 2, capSize, 'bold').slice(0, capLines);
        const s = it.sub ? this.wrap(it.sub, w - 2, capSize - 0.6).slice(0, 2) : [];
        return { t, s };
      });
      const extra = hasCap ? Math.max(...captions.map((cp) => Math.max(0, cp.t.length + cp.s.length - capLines))) * capLh : 0;
      const rowH = imgH + capH + extra + 3;
      this.ensure(rowH);
      row.forEach((it, j) => {
        const x = this.x0 + j * (w + gap);
        this.image(it.src, x, this.y, w, imgH, { pad: 1 });
        if (numbered) {
          this.fillRect(x + 1.6, this.y + 1.6, 6.2, 6.2, THEME.tealDark, 3.1);
          this.text(String(i + j + 1), x + 4.7, this.y + 5.9, { size: 7, style: 'bold', color: THEME.white, align: 'center' });
        }
        let cy = this.y + imgH + 4.2;
        this.font(capSize, 'bold', THEME.ink);
        captions[j].t.forEach((l) => { this.pdf.text(l, x + 0.5, cy); cy += capLh; });
        this.font(capSize - 0.6, 'normal', THEME.muted);
        captions[j].s.forEach((l) => { this.pdf.text(l, x + 0.5, cy); cy += capLh * 0.95; });
      });
      this.advance(rowH);
    }
    this.y += 2;
  }

  // ---- header / footer ----------------------------------------------------
  finalize() {
    const pdf = this.pdf;
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      if (this.noChrome.has(i)) continue;
      // aksen atas
      this.fillRect(0, 0, PAGE.w, 1.4, THEME.teal);
      // header
      const hy = 11.5;
      if (this.headerTitle) {
        this.text(this.fit(this.headerTitle.toUpperCase(), CONTENT_W * 0.62, 6.8, 'bold'), PAGE.mx, hy, { size: 6.8, style: 'bold', color: THEME.teal });
      }
      if (this.headerRight) {
        this.text(this.fit(this.headerRight, CONTENT_W * 0.36, 7.4), PAGE.w - PAGE.mx, hy, { size: 7.4, color: THEME.muted, align: 'right' });
      }
      this.hline(PAGE.mx, PAGE.w - PAGE.mx, hy + 3.6, THEME.line, 0.25);
      // footer
      const fy = PAGE.h - 11;
      this.hline(PAGE.mx, PAGE.w - PAGE.mx, fy - 4.4, THEME.line, 0.25);
      if (this.footerLeft) {
        this.text(this.fit(this.footerLeft, CONTENT_W * 0.7, 7), PAGE.mx, fy, { size: 7, color: THEME.muted });
      }
      this.text(`Halaman ${i} dari ${total}`, PAGE.w - PAGE.mx, fy, { size: 7, color: THEME.muted, align: 'right' });
    }
    pdf.setTextColor(0, 0, 0);
  }
}
