/**
 * Screenshot 1440x900 (desktop) — Login, Visualisasi Pipa, Desain Konstruksi.
 * Data API dimock agar tampilan terisi data engineering yang representatif.
 *
 * Jalankan: npx playwright (sudah terpasang) -> node screenshot-1440x900.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'screenshots');

const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const WELL_ID = '33333333-3333-3333-3333-333333333333';

const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'deni.purwanto@geoteknindo.co.id',
  full_name: 'Deni Purwanto',
  role: 'engineer',
  status: 'approved',
  created_at: '2025-11-04T02:10:00Z',
};

const PROJECTS = [
  {
    id: PROJECT_ID,
    project_code: 'PRJ-2026-014',
    project_name: 'Penyediaan Air Baku Sumur Bor Dalam Cikarang',
    client_name: 'PT Kawasan Industri Cikarang Sejahtera',
    contractor_name: 'PT Geoteknindo Nusantara',
    location: 'Jl. Industri Selatan Blok C-7, Cikarang',
    province: 'Jawa Barat',
    district: 'Kab. Bekasi',
    village: 'Cikarang Barat',
    latitude: '-6.286312',
    longitude: '107.156204',
    description:
      'Pengeboran dan konstruksi sumur bor dalam kapasitas 25 L/detik untuk penyediaan air baku kawasan industri.',
    start_date: '2026-01-12',
    end_date: '2026-07-30',
    status: 'active',
    created_at: '2026-01-08T03:00:00Z',
    updated_at: '2026-03-18T09:30:00Z',
    archived_at: null,
    well_count: 3,
  },
];

const WELLS = [
  {
    id: WELL_ID,
    well_code: 'SB-07',
    well_name: 'Sumur Bor Dalam SB-07',
    well_type: 'production',
    location: 'Jl. Industri Selatan Blok C-7, Cikarang Barat',
    latitude: '-6.286312',
    longitude: '107.156204',
    planned_depth: 80,
    actual_depth: 80,
    drilling_date: '2026-02-03',
    completion_date: '2026-03-18',
    status: 'completed',
    description:
      'Sumur produksi dengan konstruksi casing bertingkat 12" dan 10", saringan 12 m pada akuifer pasir dalam.',
    project_id: PROJECT_ID,
    created_at: '2026-01-20T02:00:00Z',
    updated_at: '2026-03-18T09:30:00Z',
    borehole_images: {},
  },
  {
    id: '33333333-3333-3333-3333-333333333334',
    well_code: 'SB-08',
    well_name: 'Sumur Bor Dalam SB-08',
    well_type: 'production',
    location: 'Jl. Industri Selatan Blok C-9, Cikarang Barat',
    latitude: '-6.287044',
    longitude: '107.157311',
    planned_depth: 90,
    actual_depth: 90,
    drilling_date: '2026-03-02',
    completion_date: '2026-04-11',
    status: 'completed',
    description: 'Sumur produksi cadangan untuk menjaga kontinuitas suplai air baku kawasan.',
    project_id: PROJECT_ID,
    created_at: '2026-02-25T02:00:00Z',
    updated_at: '2026-04-11T08:15:00Z',
    borehole_images: {},
  },
  {
    id: '33333333-3333-3333-3333-333333333335',
    well_code: 'OW-02',
    well_name: 'Sumur Pantau OW-02',
    well_type: 'observation',
    location: 'Jl. Industri Selatan Blok C-5, Cikarang Barat',
    latitude: '-6.285711',
    longitude: '107.155802',
    planned_depth: 45,
    actual_depth: 45,
    drilling_date: '2026-02-18',
    completion_date: '2026-02-27',
    status: 'completed',
    description: 'Sumur pantau muka air tanah pada zona industri.',
    project_id: PROJECT_ID,
    created_at: '2026-02-10T02:00:00Z',
    updated_at: '2026-02-27T07:40:00Z',
    borehole_images: {},
  },
];

// Konstruksi desainer: tanpa tumpang tindih kedalaman -> panel validasi bersih.
const DESIGNER = {
  version: 3,
  components: [
    { id: 'comp-cap', type: 'well_cap', name: 'Tutup Sumur Baja', startDepth: 2.5, endDepth: 2.5, outerDiameter: 200, innerDiameter: null, material: 'Baja Karbon', color: '#1e293b', description: 'Well cap tipe flange 8".', visible: true, zOrder: 6 },
    { id: 'comp-surface', type: 'surface_casing', name: 'Casing Permukaan 8"', startDepth: 2.5, endDepth: 14, outerDiameter: 200, innerDiameter: 180, material: 'PVC SNI', color: '#475569', description: 'Casing permukaan 8 inci, tebal dinding 10 mm.', visible: true, zOrder: 1 },
    { id: 'comp-prod', type: 'production_casing', name: 'Casing Produksi 6"', startDepth: 14, endDepth: 60, outerDiameter: 150, innerDiameter: 130, material: 'PVC SNI', color: '#475569', description: 'Casing produksi 6 inci hingga kedalaman 60 m.', visible: true, zOrder: 2 },
    { id: 'comp-screen', type: 'screen_pipe', name: 'Pipa Saring 6"', startDepth: 60, endDepth: 72, outerDiameter: 150, innerDiameter: 130, material: 'Stainless SS304', color: '#b45309', description: 'Saringan slot 1,5 mm pada akuifer pasir dalam.', visible: true, zOrder: 3 },
    { id: 'comp-open', type: 'open_hole', name: 'Open Hole 8,5"', startDepth: 72, endDepth: 80, outerDiameter: 200, innerDiameter: 200, material: 'Formasi Asli', color: '#7c5a3c', description: 'Lubang terbuka sebagai penampung pasir di dasar sumur.', visible: true, zOrder: 4 },
    { id: 'comp-pump', type: 'submersible_pump', name: 'Pompa Submersible 15 kW', startDepth: 52, endDepth: 52, outerDiameter: 100, innerDiameter: null, material: 'Baja Tahan Karat', color: '#3b82f6', description: 'Pompa submersible 15 kW, head 90 m.', visible: true, zOrder: 5 },
    { id: 'comp-water', type: 'water_level_marker', name: 'Muka Air Tanah Statis', startDepth: 7.5, endDepth: 7.5, outerDiameter: null, innerDiameter: null, material: '—', color: '#0891b2', description: 'MAT statis terukur 5 m di bawah muka tanah.', visible: true, zOrder: 7 },
  ],
  config: { totalWellDepth: 80, groundLevel: 2.5, matLevel: 5 },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  let authenticated = false;
  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const p = new URL(url).pathname;

    if (p.endsWith('/auth/refresh')) {
      if (!authenticated) return json(route, { detail: 'no session' }, 401);
      return json(route, { access_token: 'demo-token' });
    }
    if (p.endsWith('/auth/login') && method === 'POST') {
      authenticated = true;
      return json(route, { access_token: 'demo-token', user: USER });
    }
    if (p.endsWith('/auth/me')) return json(route, { data: USER });
    if (p.endsWith('/auth/logout')) return route.fulfill({ status: 204 });

    if (p.endsWith('/projects') && method === 'GET') return json(route, { data: PROJECTS });
    if (/\/projects\/[^/]+\/wells$/.test(p) && method === 'GET') return json(route, { data: WELLS });
    if (/\/wells\/[^/]+\/designer$/.test(p))
      return method === 'GET' ? json(route, { data: DESIGNER }) : json(route, { data: { version: DESIGNER.version } });
    if (/\/wells\/[^/]+\/geology$/.test(p)) return json(route, { data: { version: 1, layers: [] } });
    if (/\/wells\/[^/]+\/monitoring$/.test(p)) return json(route, { data: { version: 1, measurements: [] } });
    if (/\/wells\/[^/]+\/(photos|documents)$/.test(p)) return json(route, { data: [] });
    if (/\/wells\/[^/]+$/.test(p)) {
      const id = p.split('/').pop();
      const well = WELLS.find((w) => w.id === id) || WELLS[0];
      return method === 'GET' ? json(route, { data: well }) : json(route, { data: well });
    }
    return json(route, { data: [] });
  });

  try {
    // ── 1. Halaman Login (form kosong) ─────────────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-card', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '01-login-1440x900.png'), animations: 'disabled' });
    console.log('✓ 01-login-1440x900.png');

    // ── Masuk (API dimock) ─────────────────────────────────────────────
    await page.fill('#email', 'deni.purwanto@geoteknindo.co.id');
    await page.fill('#password', 'Borewell#2026');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.app-shell, .shell, nav', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // ── Pilih proyek & sumur ───────────────────────────────────────────
    await page.evaluate(() => { window.location.hash = '/projects'; });
    await page.waitForTimeout(1200);
    await page.locator('tr:has-text("PRJ-2026-014")').first().click();
    await page.waitForTimeout(1200);
    await page.locator('tr:has-text("SB-07")').first().click();
    await page.waitForSelector('.viz', { timeout: 20000 });
    await page.waitForTimeout(1200);

    // ── 2. Isi data konstruksi pipa ────────────────────────────────────
    const openStep = async (title) => {
      const head = page.locator(`button.step-head:has-text("${title}")`).first();
      const isOpen = await head.evaluate((el) => el.getAttribute('aria-expanded') === 'true');
      if (!isOpen) await head.click();
      await page.waitForTimeout(350);
    };

    await openStep('Pipa');
    const pipeInputs = page.locator('.step.is-open input');
    await pipeInputs.nth(0).fill('45');
    await pipeInputs.nth(1).fill('12');
    await page.locator('button:has-text("Tambah pipa")').click();
    await page.waitForTimeout(400);
    await pipeInputs.nth(0).fill('25');
    await pipeInputs.nth(1).fill('10');
    await page.locator('button:has-text("Tambah pipa")').click();
    await page.waitForTimeout(400);

    await openStep('Permukaan tanah');
    await page.locator('.step.is-open input').first().fill('2.5');
    await page.locator('button:has-text("Atur titik acuan")').click();
    await page.waitForTimeout(400);

    await openStep('Muka air tanah');
    await page.locator('.step.is-open input').first().fill('5');
    await page.locator('button:has-text("Atur muka air tanah")').click();
    await page.waitForTimeout(400);

    await openStep('Saringan');
    const screenInputs = page.locator('.step.is-open input');
    await screenInputs.nth(0).fill('52');
    await screenInputs.nth(1).fill('12');
    await page.locator('button:has-text("Tambah saringan")').click();
    await page.waitForTimeout(400);

    await openStep('Open hole');
    await page.locator('.step.is-open input').first().fill('10');
    await page.locator('button:has-text("Atur open hole")').click();
    await page.waitForTimeout(400);

    // Tampilkan kembali daftar pipa agar ringkasan & diagram terlihat lengkap.
    await openStep('Pipa');
    await page.waitForTimeout(4200); // biarkan toast hilang
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(600);
    const vizMetrics = await page.evaluate(() => {
      const sheet = document.querySelector('.diagram-sheet');
      const stage = document.querySelector('.viz-stage');
      const r = sheet?.getBoundingClientRect();
      return { sheet: r && { top: r.top, bottom: r.bottom, h: r.height, w: r.width }, stageBottom: stage?.getBoundingClientRect().bottom, docH: document.documentElement.scrollHeight, vh: window.innerHeight };
    });
    console.log('viz metrics', JSON.stringify(vizMetrics));
    await page.screenshot({ path: path.join(OUT, '02-visualisasi-pipa-1440x900.png'), animations: 'disabled' });
    console.log('✓ 02-visualisasi-pipa-1440x900.png');

    // ── 3. Halaman Desain Konstruksi ───────────────────────────────────
    await page.evaluate(() => { window.location.hash = '/desain'; });
    await page.waitForSelector('.designer-page .canvas-stage canvas', { timeout: 20000 });
    await page.waitForTimeout(1800);

    // Pilih casing produksi pada kanvas agar panel properti terisi.
    // Geser halaman agar seluruh kanvas desain (0–80 m) + panel validasi masuk viewport 900 px.
    const designMetrics = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas-stage canvas');
      const topbar = document.querySelector('.topbar, header');
      return {
        canvasTop: canvas?.getBoundingClientRect().top,
        canvasH: canvas?.getBoundingClientRect().height,
        topbarH: topbar?.getBoundingClientRect().height || 64,
        docH: document.documentElement.scrollHeight,
        vh: window.innerHeight,
      };
    });
    console.log('design metrics', JSON.stringify(designMetrics));
    await page.evaluate((m) => window.scrollBy(0, m.canvasTop - m.topbarH - 10), designMetrics);
    await page.waitForTimeout(600);

    const canvas = page.locator('.canvas-stage canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height * 0.45, 400));
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '03-desain-konstruksi-1440x900.png'), animations: 'disabled' });
    console.log('✓ 03-desain-konstruksi-1440x900.png');
  } catch (err) {
    console.error('GAGAL:', err.message);
    await page.screenshot({ path: path.join(OUT, 'error-debug-1440x900.png'), animations: 'disabled' });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
