const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`Console: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', error => console.error(`Page error: ${error.message}`));

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

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
      await route.fulfill({ status: 200, contentType: 'application.json', body: JSON.stringify({ data: { id: '11111111-1111-1111-1111-111111111111', email: 'engineer@borewell.com', full_name: 'Ir. Budi Santoso, MT', role: 'engineer', status: 'approved', created_at: new Date().toISOString() } }) });
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
    // STEP 1: LOGIN PAGE
    console.log('=== STEP 1: Login Page ===');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.fill('input[type="email"]', 'engineer@borewell.com');
    await page.fill('input[type="password"]', 'SecurePass123!');
    
    await page.screenshot({ path: path.join(screenshotsDir, '01-login-page.png'), fullPage: true, animations: 'disabled' });
    console.log('✓ Login page screenshot saved');

    // Enable auth mocking and submit
    mockAuth = true;
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // STEP 2: Go to Projects page to select well
    console.log('\n=== STEP 2: Projects Page - Select Well ===');
    await page.locator('button:has-text("Proyek & Sumur")').first().click();
    await page.waitForTimeout(2500);
    
    // Click on the well row
    const wellRow = page.locator('tr:has-text("SB-01"), .well-card:has-text("SB-01"), tbody tr').first();
    if (await wellRow.isVisible().catch(() => false)) {
      await wellRow.click();
      await page.waitForTimeout(1500);
      console.log('Selected well SB-01');
    }

    // STEP 3: VISUALIZATION PAGE
    console.log('\n=== STEP 3: Visualization Page ===');
    await page.locator('button:has-text("Visualisasi Pipa")').first().click();
    await page.waitForTimeout(3000);  // Wait for page to fully render

    // Verify active page
    const activePageId = await page.locator('.page.is-active').getAttribute('id').catch(() => '');
    console.log('Active page:', activePageId);
    
    // Add professional test data
    try {
      const depthInput = page.locator('input[placeholder="45"], input[placeholder*="Panjang" i]').first();
      const diameterInput = page.locator('input[placeholder="6"], input[placeholder*="Diameter" i]').first();
      const addPipeBtn = page.locator('button:has-text("Tambah pipa")').first();
      
      if (await depthInput.isVisible().catch(() => false)) {
        await depthInput.fill('50');
        await diameterInput.fill('8');
        await addPipeBtn.click();
        await page.waitForTimeout(800);
        
        await depthInput.fill('30');
        await diameterInput.fill('6');
        await addPipeBtn.click();
        await page.waitForTimeout(800);
        
        // Ground reference
        const groundInput = page.locator('input[placeholder="2.5"], input[placeholder*="Titik acuan" i]').first();
        if (await groundInput.isVisible().catch(() => false)) {
          await groundInput.fill('2.5');
          await page.locator('button:has-text("Atur titik acuan")').first().click();
          await page.waitForTimeout(800);
        }
        
        // MAT
        const matInput = page.locator('input[placeholder="5"], input[placeholder*="Level MAT" i]').first();
        if (await matInput.isVisible().catch(() => false)) {
          await matInput.fill('5');
          await page.locator('button:has-text("Atur muka air tanah")').first().click();
          await page.waitForTimeout(800);
        }
        
        // Screen
        const screenDepthInput = page.locator('input[placeholder="15"]').first();
        const screenSizeInput = page.locator('input[placeholder*="Panjang" i]').nth(1);
        if (await screenDepthInput.isVisible().catch(() => false)) {
          await screenDepthInput.fill('45');
          await screenSizeInput.fill('10');
          await page.locator('button:has-text("Tambah saringan")').first().click();
          await page.waitForTimeout(800);
        }
        
        // Switch to diagram view
        const diagramTab = page.locator('button[role="tab"]:has-text("Diagram")').first();
        if (await diagramTab.isVisible().catch(() => false)) {
          await diagramTab.click();
          await page.waitForTimeout(2000);
        }
      }
    } catch (e) {
      console.log('Data entry error:', e.message);
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '02-visualization-page.png'), fullPage: true, animations: 'disabled' });
    console.log('✓ Visualization page screenshot saved');

    // STEP 4: DESIGNER PAGE
    console.log('\n=== STEP 4: Designer Page ===');
    await page.locator('button:has-text("Desain Konstruksi")').first().click();
    await page.waitForTimeout(4000);  // Wait for designer canvas to render

    // Verify active page
    const activePageId2 = await page.locator('.page.is-active').getAttribute('id').catch(() => '');
    console.log('Active page:', activePageId2);

    // The designer should have pre-loaded data from the mocked API
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: path.join(screenshotsDir, '03-designer-page.png'), fullPage: true, animations: 'disabled' });
    console.log('✓ Designer page screenshot saved');

    console.log('\n✅ All screenshots completed!');
    console.log('📁 Screenshots saved to:', screenshotsDir);

  } catch (error) {
    console.error('Error during screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch(console.error);