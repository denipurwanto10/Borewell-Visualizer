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

  // Mock API responses
  await page.route('**/api/v1/auth/login', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token-12345',
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'engineer@borewell.com',
          full_name: 'Ir. Budi Santoso, MT',
          role: 'engineer',
          status: 'approved',
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'engineer@borewell.com',
          full_name: 'Ir. Budi Santoso, MT',
          role: 'engineer',
          status: 'approved',
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route('**/api/v1/projects*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          id: '22222222-2222-2222-2222-222222222222',
          project_code: 'PRJ-2024-001',
          project_name: 'Proyek Sumur Bor Jakarta Utara',
          client_name: 'PT. Jaya Konstruksi',
          contractor_name: 'CV. Borewell Engineering',
          location: 'Jl. Raya Bekasi KM 21, Jakarta Utara',
          province: 'DKI Jakarta',
          district: 'Kec. Cilincing',
          village: 'Kel. Rorotan',
          latitude: '-6.1754',
          longitude: '106.8272',
          description: 'Proyek pemboran sumur bor untuk monitoring air tanah dan penyediaan air bersih di wilayah Jakarta Utara.',
          start_date: '2024-01-15',
          end_date: '2024-06-30',
          status: 'active',
          created_at: '2024-01-10T08:00:00Z',
          updated_at: '2024-01-10T08:00:00Z',
          archived_at: null,
          well_count: 1,
        }],
      }),
    });
  });

  await page.route('**/api/v1/projects/22222222-2222-2222-2222-222222222222/wells*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          id: '33333333-3333-3333-3333-333333333333',
          well_code: 'SB-01',
          well_name: 'Sumur Bor Utama (SB-01)',
          well_type: 'production',
          location: 'Jl. Raya Bekasi KM 21, Jakarta Utara',
          latitude: '-6.1754',
          longitude: '106.8272',
          planned_depth: 80,
          actual_depth: 80,
          drilling_date: '2024-02-01',
          completion_date: '2024-02-15',
          status: 'completed',
          description: 'Sumur bor utama untuk produksi air bersih',
          project_id: '22222222-2222-2222-2222-222222222222',
          created_at: '2024-02-01T08:00:00Z',
          updated_at: '2024-02-15T17:00:00Z',
          borehole_images: {},
        }],
      }),
    });
  });

  await page.route('**/api/v1/wells/33333333-3333-3333-3333-333333333333', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: '33333333-3333-3333-3333-333333333333',
          well_code: 'SB-01',
          well_name: 'Sumur Bor Utama (SB-01)',
          well_type: 'production',
          location: 'Jl. Raya Bekasi KM 21, Jakarta Utara',
          latitude: '-6.1754',
          longitude: '106.8272',
          planned_depth: 80,
          actual_depth: 80,
          drilling_date: '2024-02-01',
          completion_date: '2024-02-15',
          status: 'completed',
          description: 'Sumur bor utama untuk produksi air bersih',
          project_id: '22222222-2222-2222-2222-222222222222',
          created_at: '2024-02-01T08:00:00Z',
          updated_at: '2024-02-15T17:00:00Z',
          borehole_images: {},
        },
      }),
    });
  });

  await page.route('**/api/v1/wells/33333333-3333-3333-3333-333333333333/designer', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          version: 1,
          components: [
            { id: 'comp-1', type: 'casing', name: 'Kasing 12"', depth: 0, length: 30, diameter: 12, wallThickness: 0.5, material: 'Steel', visible: true },
            { id: 'comp-2', type: 'screen', name: 'Saringan 12"', depth: 30, length: 15, diameter: 12, slotSize: 1.5, material: 'SS304', visible: true },
            { id: 'comp-3', type: 'casing', name: 'Kasing 10"', depth: 45, length: 25, diameter: 10, wallThickness: 0.5, material: 'Steel', visible: true },
            { id: 'comp-4', type: 'open_hole', name: 'Open Hole 8.5"', depth: 70, length: 10, diameter: 8.5, visible: true },
          ],
          config: { totalWellDepth: 80, groundLevel: 2.5, matLevel: 5 },
        },
      }),
    });
  });

  await page.route('**/api/v1/wells/33333333-3333-3333-3333-333333333333/geology', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { version: 1, layers: [] },
      }),
    });
  });

  await page.route('**/api/v1/wells/33333333-3333-3333-3333-333333333333/monitoring', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { version: 1, measurements: [] },
      }),
    });
  });

  try {
    // 1. LOGIN PAGE - Navigate to login and fill credentials
    console.log('Loading login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Fill in professional test credentials
    await page.fill('input[type="email"]', 'engineer@borewell.com');
    await page.fill('input[type="password"]', 'SecurePass123!');
    
    // Take login page screenshot BEFORE submitting
    await page.screenshot({
      path: path.join(screenshotsDir, '01-login-page.png'),
      fullPage: true,
      animations: 'disabled'
    });
    console.log('✓ Login page screenshot saved');

    // Submit login - this will trigger our mocked API
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);

    // Wait for redirect to dashboard
    await page.waitForURL('**/#dashboard', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 2. VISUALIZATION PAGE - Navigate with mocked API
    console.log('Navigating to visualization page...');
    await page.goto('http://localhost:5173/#visualisasi', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Add professional test data to the visualization
    try {
      // Fill in pipe data - first pipe
      const depthInput = page.locator('input[placeholder="45"], input[placeholder*="Panjang" i]').first();
      if (await depthInput.isVisible().catch(() => false)) {
        await depthInput.fill('50');
      }
      
      const diameterInput = page.locator('input[placeholder="6"], input[placeholder*="Diameter" i]').first();
      if (await diameterInput.isVisible().catch(() => false)) {
        await diameterInput.fill('8');
      }
      
      const addPipeBtn = page.locator('button:has-text("Tambah pipa")').first();
      if (await addPipeBtn.isVisible().catch(() => false)) {
        await addPipeBtn.click();
        await page.waitForTimeout(800);
      }

      // Add second pipe segment
      if (await depthInput.isVisible().catch(() => false)) {
        await depthInput.fill('30');
      }
      if (await diameterInput.isVisible().catch(() => false)) {
        await diameterInput.fill('6');
      }
      if (await addPipeBtn.isVisible().catch(() => false)) {
        await addPipeBtn.click();
        await page.waitForTimeout(800);
      }

      // Set ground reference
      const groundInput = page.locator('input[placeholder="2.5"], input[placeholder*="Titik acuan" i]').first();
      if (await groundInput.isVisible().catch(() => false)) {
        await groundInput.fill('2.5');
        const setGroundBtn = page.locator('button:has-text("Atur titik acuan")').first();
        if (await setGroundBtn.isVisible().catch(() => false)) {
          await setGroundBtn.click();
          await page.waitForTimeout(800);
        }
      }

      // Set MAT
      const matInput = page.locator('input[placeholder="5"], input[placeholder*="Level MAT" i]').first();
      if (await matInput.isVisible().catch(() => false)) {
        await matInput.fill('5');
        const setMatBtn = page.locator('button:has-text("Atur muka air tanah")').first();
        if (await setMatBtn.isVisible().catch(() => false)) {
          await setMatBtn.click();
          await page.waitForTimeout(800);
        }
      }

      // Add screen/filter
      const screenDepthInput = page.locator('input[placeholder="15"]').first();
      const screenSizeInput = page.locator('input[placeholder*="Panjang" i]').nth(1);
      if (await screenDepthInput.isVisible().catch(() => false)) {
        await screenDepthInput.fill('45');
      }
      if (await screenSizeInput.isVisible().catch(() => false)) {
        await screenSizeInput.fill('10');
      }
      const addScreenBtn = page.locator('button:has-text("Tambah saringan")').first();
      if (await addScreenBtn.isVisible().catch(() => false)) {
        await addScreenBtn.click();
        await page.waitForTimeout(800);
      }

      // Switch to diagram view
      const diagramTab = page.locator('button[role="tab"]:has-text("Diagram")').first();
      if (await diagramTab.isVisible().catch(() => false)) {
        await diagramTab.click();
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      console.log('Error adding visualization data:', e.message);
    }

    // Wait for diagram to render
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(screenshotsDir, '02-visualization-page.png'),
      fullPage: true,
      animations: 'disabled'
    });
    console.log('✓ Visualization page screenshot saved');

    // 3. DESIGNER/CONSTRUCTION DESIGN PAGE
    console.log('Navigating to designer page...');
    await page.goto('http://localhost:5173/#desain', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // The designer should already have mocked data from the API
    // Wait for canvas to render
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(screenshotsDir, '03-designer-page.png'),
      fullPage: true,
      animations: 'disabled'
    });
    console.log('✓ Designer page screenshot saved');

    console.log('\n✅ All screenshots completed!');
    console.log(`📁 Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Error during screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch(console.error);