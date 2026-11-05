const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function debugNav() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`Console: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', error => console.error(`Page error: ${error.message}`));

  let mockAuth = false;

  await page.route('**/api/v1/**', async route => {
    if (!mockAuth) { await route.continue(); return; }
    const url = route.request().url();
    const method = route.request().method();
    console.log(`Mocking API: ${method} ${url}`);
    
    if (url.includes('/auth/login') && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-access-token-12345', user: { id: '11111111-1111-1111-1111-111111111111', email: 'engineer@borewell.com', full_name: 'Ir. Budi Santoso, MT', role: 'engineer', status: 'approved', created_at: new Date().toISOString() } }) });
      return;
    }
    if (url.includes('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: '11111111-1111-1111-1111-111111111111', email: 'engineer@borewell.com', full_name: 'Ir. Budi Santoso, MT', role: 'engineer', status: 'approved', created_at: new Date().toISOString() } }) });
      return;
    }
    if (url.includes('/auth/refresh') && method === 'POST') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-access-token-12345' }) }); return; }
    if (url.includes('/auth/logout') && method === 'POST') { await route.fulfill({ status: 204 }); return; }
    if (url.includes('/projects') && method === 'GET' && !url.includes('/wells')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '22222222-2222-2222-2222-222222222222', project_code: 'PRJ-2024-001', project_name: 'Proyek Sumur Bor Jakarta Utara', client_name: 'PT. Jaya Konstruksi', contractor_name: 'CV. Borewell Engineering', location: 'Jl. Raya Bekasi KM 21, Jakarta Utara', province: 'DKI Jakarta', district: 'Kec. Cilincing', village: 'Kel. Rorotan', latitude: '-6.1754', longitude: '106.8272', description: 'Proyek pemboran sumur bor untuk monitoring air tanah dan penyediaan air bersih di wilayah Jakarta Utara.', start_date: '2024-01-15', end_date: '2024-06-30', status: 'active', created_at: '2024-01-10T08:00:00Z', updated_at: '2024-01-10T08:00:00Z', archived_at: null, well_count: 1 }] }) }); return; }
    if (url.includes('/projects/') && url.includes('/wells') && method === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '33333333-3333-3333-3333-333333333333', well_code: 'SB-01', well_name: 'Sumur Bor Utama (SB-01)', well_type: 'production', location: 'Jl. Raya Bekasi KM 21, Jakarta Utara', latitude: '-6.1754', longitude: '106.8272', planned_depth: 80, actual_depth: 80, drilling_date: '2024-02-01', completion_date: '2024-02-15', status: 'completed', description: 'Sumur bor utama untuk produksi air bersih', project_id: '22222222-2222-2222-2222-222222222222', created_at: '2024-02-01T08:00:00Z', updated_at: '2024-02-15T17:00:00Z', borehole_images: {} }] }) }); return; }
    if (url.includes('/wells/33333333-3333-3333-3333-333333333333') && !url.includes('/designer') && !url.includes('/geology') && !url.includes('/monitoring')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: '33333333-3333-3333-3333-333333333333', well_code: 'SB-01', well_name: 'Sumur Bor Utama (SB-01)', well_type: 'production', location: 'Jl. Raya Bekasi KM 21, Jakarta Utara', latitude: '-6.1754', longitude: '106.8272', planned_depth: 80, actual_depth: 80, drilling_date: '2024-02-01', completion_date: '2024-02-15', status: 'completed', description: 'Sumur bor utama untuk produksi air bersih', project_id: '22222222-2222-2222-2222-222222222222', created_at: '2024-02-01T08:00:00Z', updated_at: '2024-02-15T17:00:00Z', borehole_images: {} } }) }); return; }
    if (url.includes('/designer')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { version: 1, components: [{ id: 'comp-1', type: 'casing', name: 'Kasing 12"', depth: 0, length: 30, diameter: 12, wallThickness: 0.5, material: 'Steel', visible: true }, { id: 'comp-2', type: 'screen', name: 'Saringan 12"', depth: 30, length: 15, diameter: 12, slotSize: 1.5, material: 'SS304', visible: true }, { id: 'comp-3', type: 'casing', name: 'Kasing 10"', depth: 45, length: 25, diameter: 10, wallThickness: 0.5, material: 'Steel', visible: true }, { id: 'comp-4', type: 'open_hole', name: 'Open Hole 8.5"', depth: 70, length: 10, diameter: 8.5, visible: true }], config: { totalWellDepth: 80, groundLevel: 2.5, matLevel: 5 } } }) }); return; }
    if (url.includes('/geology') || url.includes('/monitoring') || url.includes('/photos') || url.includes('/documents') || url.includes('/backup') || url.includes('/migration')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }); return; }
    await route.continue();
  });

  try {
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.fill('input[type="email"]', 'engineer@borewell.com');
    await page.fill('input[type="password"]', 'SecurePass123!');
    mockAuth = true;
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Check active page title
    const activeTitle = await page.locator('.page.is-active h1, .page.is-active .page-head-title').first().textContent().catch(() => '');
    console.log('Active page title:', activeTitle);
    
    const allPageTitles = await page.locator('.page h1, .page .page-head-title').all();
    for (const t of allPageTitles) {
      const text = await t.textContent().catch(() => '');
      const parent = await t.locator('..').getAttribute('class').catch(() => '');
      console.log(`Page title: "${text}" | Parent class: ${parent}`);
    }

    // Check which page has is-active
    const activePage = await page.locator('.page.is-active').getAttribute('id').catch(() => '');
    console.log('Active page ID:', activePage);

    // Click Visualisasi Pipa
    console.log('\n=== Clicking Visualisasi Pipa ===');
    await page.locator('button:has-text("Visualisasi Pipa")').first().click();
    await page.waitForTimeout(2000);

    const activeTitle2 = await page.locator('.page.is-active h1, .page.is-active .page-head-title').first().textContent().catch(() => '');
    console.log('Active page title after click:', activeTitle2);
    const activePage2 = await page.locator('.page.is-active').getAttribute('id').catch(() => '');
    console.log('Active page ID after click:', activePage2);
    const hash2 = await page.evaluate(() => window.location.hash);
    console.log('Hash after click:', hash2);

    // Click Desain Konstruksi
    console.log('\n=== Clicking Desain Konstruksi ===');
    await page.locator('button:has-text("Desain Konstruksi")').first().click();
    await page.waitForTimeout(2000);

    const activeTitle3 = await page.locator('.page.is-active h1, .page.is-active .page-head-title').first().textContent().catch(() => '');
    console.log('Active page title after click:', activeTitle3);
    const activePage3 = await page.locator('.page.is-active').getAttribute('id').catch(() => '');
    console.log('Active page ID after click:', activePage3);
    const hash3 = await page.evaluate(() => window.location.hash);
    console.log('Hash after click:', hash3);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

debugNav().catch(console.error);