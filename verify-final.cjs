const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function verifyFinal() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`Console: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', error => console.error(`Page error: ${error.message}`));

  // Mock all API responses
  await page.route('**/api/v1/**', async route => {
    const url = route.request().url();
    const method = route.request().method();
    
    // Auth endpoints
    if (url.includes('/auth/login') && method === 'POST') {
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
      return;
    }
    
    if (url.includes('/auth/me')) {
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
      return;
    }

    // Projects list
    if (url.includes('/projects') && !url.includes('/wells') && !url.includes('/assignments') && !url.includes('/photos') && !url.includes('/documents') && !url.includes('/archive') && !url.includes('/restore') && !url.includes('/duplicate')) {
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
      return;
    }

    // Wells for project
    if (url.includes('/projects/') && url.includes('/wells')) {
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
      return;
    }

    // Well detail
    if (url.includes('/wells/33333333-3333-3333-3333-333333333333') && !url.includes('/designer') && !url.includes('/geology') && !url.includes('/monitoring') && !url.includes('/photos') && !url.includes('/documents')) {
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
      return;
    }

    // Designer data
    if (url.includes('/designer')) {
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
      return;
    }

    // Geology data
    if (url.includes('/geology')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { version: 1, layers: [] },
        }),
      });
      return;
    }

    // Monitoring data
    if (url.includes('/monitoring')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { version: 1, measurements: [] },
        }),
      });
      return;
    }

    // Photos/Documents
    if (url.includes('/photos') || url.includes('/documents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    // Default: pass through
    await route.continue();
  });

  try {
    // Load app
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1. LOGIN PAGE
    console.log('=== LOGIN PAGE ===');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    // Fill credentials
    await page.fill('input[type="email"]', 'engineer@borewell.com');
    await page.fill('input[type="password"]', 'SecurePass123!');
    
    // Check if form elements are visible
    const emailVisible = await page.locator('input[type="email"]').isVisible().catch(() => false);
    const passwordVisible = await page.locator('input[type="password"]').isVisible().catch(() => false);
    const submitVisible = await page.locator('button[type="submit"]').isVisible().catch(() => false);
    console.log('Email field visible:', emailVisible);
    console.log('Password field visible:', passwordVisible);
    console.log('Submit button visible:', submitVisible);
    
    // Check branding
    const title = await page.locator('h1').textContent().catch(() => '');
    console.log('Page title:', title);
    
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'final-01-login.png'), fullPage: true, animations: 'disabled' });

    // 2. Submit login and go to visualization
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // 3. VISUALIZATION PAGE
    console.log('\n=== VISUALIZATION PAGE ===');
    await page.goto('http://localhost:5173/#visualisasi', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for elements
    const vizTitle = await page.locator('h1, .page-head-title').first().textContent().catch(() => '');
    console.log('Viz page title:', vizTitle);
    
    const hasEmptyState = await page.locator('.empty-state.page-empty').isVisible().catch(() => false);
    console.log('Empty state visible:', hasEmptyState);
    
    const hasVizControls = await page.locator('.viz-controls').isVisible().catch(() => false);
    console.log('Viz controls visible:', hasVizControls);
    
    const hasCanvas = await page.locator('canvas').isVisible().catch(() => false);
    console.log('Canvas visible:', hasCanvas);
    
    const hasStats = await page.locator('.stats').isVisible().catch(() => false);
    console.log('Stats visible:', hasStats);
    
    // Add test data
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
        
        // Ground
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
        
        // Switch to diagram
        const diagramTab = page.locator('button[role="tab"]:has-text("Diagram")').first();
        if (await diagramTab.isVisible().catch(() => false)) {
          await diagramTab.click();
          await page.waitForTimeout(1500);
        }
      }
    } catch (e) {
      console.log('Data entry error:', e.message);
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'final-02-visualization.png'), fullPage: true, animations: 'disabled' });
    console.log('Visualization screenshot saved');

    // 4. DESIGNER PAGE
    console.log('\n=== DESIGNER PAGE ===');
    await page.goto('http://localhost:5173/#desain', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const designerTitle = await page.locator('h1, .page-head-title').first().textContent().catch(() => '');
    console.log('Designer page title:', designerTitle);
    
    const hasDesignerEmpty = await page.locator('.empty-state.page-empty').isVisible().catch(() => false);
    console.log('Designer empty state visible:', hasDesignerEmpty);
    
    const hasDesignerCanvas = await page.locator('canvas').isVisible().catch(() => false);
    console.log('Designer canvas visible:', hasDesignerCanvas);
    
    const hasToolbar = await page.locator('.toolbar-col, aside[class*="toolbar"]').isVisible().catch(() => false);
    console.log('Designer toolbar visible:', hasToolbar);
    
    const hasProperties = await page.locator('.properties-col, aside[class*="properties"]').isVisible().catch(() => false);
    console.log('Designer properties panel visible:', hasProperties);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'final-03-designer.png'), fullPage: true, animations: 'disabled' });
    console.log('Designer screenshot saved');

    console.log('\n✅ All final screenshots completed!');
    console.log('📁 Screenshots saved to:', path.join(__dirname, 'screenshots'));

  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await browser.close();
  }
}

verifyFinal().catch(console.error);