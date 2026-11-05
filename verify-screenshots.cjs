const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function verifyScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`Console: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', error => console.error(`Page error: ${error.message}`));

  try {
    // Load app with mock auth
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      window.__borewell_access_token = 'mock-access-token-for-screenshots';
      localStorage.setItem('borewell_user', JSON.stringify({
        id: 'test-user-001',
        email: 'engineer@borewell.com',
        full_name: 'Ir. Budi Santoso, MT',
        role: 'engineer',
        status: 'approved',
        created_at: new Date().toISOString(),
      }));
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Check visualization page - see what's actually rendered
    await page.goto('http://localhost:5173/#visualisasi', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for empty state
    const emptyState = await page.locator('.empty-state.page-empty').isVisible().catch(() => false);
    console.log('Visualization empty state visible:', emptyState);
    
    // Check for diagram canvas
    const diagramCanvas = await page.locator('canvas').isVisible().catch(() => false);
    console.log('Diagram canvas visible:', diagramCanvas);
    
    // Check for viz controls
    const vizControls = await page.locator('.viz-controls').isVisible().catch(() => false);
    console.log('Viz controls visible:', vizControls);

    // Check for stats
    const stats = await page.locator('.stats').isVisible().catch(() => false);
    console.log('Stats visible:', stats);

    // Take a quick screenshot to verify
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'verify-viz.png'),
      fullPage: true,
      animations: 'disabled'
    });

    // Check designer page
    await page.goto('http://localhost:5173/#desain', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const designerEmpty = await page.locator('.empty-state.page-empty').isVisible().catch(() => false);
    console.log('Designer empty state visible:', designerEmpty);
    
    const designerCanvas = await page.locator('canvas').isVisible().catch(() => false);
    console.log('Designer canvas visible:', designerCanvas);
    
    const designerToolbar = await page.locator('.toolbar-col, aside.toolbar').isVisible().catch(() => false);
    console.log('Designer toolbar visible:', designerToolbar);

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'verify-designer.png'),
      fullPage: true,
      animations: 'disabled'
    });

    // Check login page
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const loginForm = await page.locator('form').isVisible().catch(() => false);
    console.log('Login form visible:', loginForm);

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'verify-login.png'),
      fullPage: true,
      animations: 'disabled'
    });

  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await browser.close();
  }
}

verifyScreenshots().catch(console.error);