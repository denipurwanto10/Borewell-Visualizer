const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    // ===== SCREENSHOT 1: LOGIN PAGE =====
    console.log('Capturing Login Page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Masuk")', { timeout: 10000 });
    
    await page.fill('input[type="email"]', 'engineer@borewell-pro.com');
    await page.fill('input[type="password"]', 'SecurePass2024!');
    await page.waitForTimeout(500);
    
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-login-page.png'),
      fullPage: false,
    });
    console.log('Login page captured');

    // ===== SCREENSHOT 2: VISUALIZATION PAGE =====
    console.log('Capturing Visualization Page...');
    
    // Login
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await page.waitForSelector('main:has-text("Beranda"), .page:has-text("Beranda")', { timeout: 10000 });
    
    // Navigate to Projects page
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await page.waitForSelector('h1:has-text("Proyek & Sumur")', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Click first project
    const firstProject = page.locator('tbody tr, .project-card').first();
    await firstProject.click();
    await page.waitForURL(/.*project\/[0-9a-f-]+/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check if wells exist
    await page.waitForSelector('th:has-text("Sumur")', { timeout: 10000 });
    
    const wellRows = page.locator('tbody tr');
    const wellCount = await wellRows.count();
    console.log('Initial well count:', wellCount);
    
    const firstRowText = await wellRows.first().innerText();
    console.log('First row text:', firstRowText);
    
    if (wellCount === 1 && firstRowText.includes('Tidak ada sumur')) {
      console.log('No wells found, creating one...');
      await page.getByRole('button', { name: 'Tambah Sumur', exact: true }).click();
      await page.waitForSelector('[role="dialog"], .dialog', { timeout: 5000 });
      
      await page.fill('input[placeholder="WELL-001"]', 'WELL-PRO-001');
      await page.fill('input[placeholder="Sumur Produksi 1"]', 'Sumur Produksi Professional-1');
      await page.selectOption('select:has(option[value="production"]) >> nth=0', 'production');
      await page.click('button[type="submit"]');
      await page.waitForSelector('.well-code:has-text("WELL-PRO-001")', { timeout: 10000 });
      await page.waitForTimeout(1000);
      
      await page.waitForSelector('th:has-text("Sumur")', { timeout: 10000 });
    }
    
    // Click the first well
    await page.locator('tbody tr').first().click();
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    console.log('Current URL after well click:', currentUrl);
    
    const visTitle = page.locator('h1:has-text("Visualisasi Pipa")');
    const visCount = await visTitle.count();
    console.log('Visualisasi title count:', visCount);
    
    if (visCount === 0) {
      await page.goto('http://localhost:5173/login#/visualisasi');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await page.waitForSelector('h1:has-text("Visualisasi Pipa")', { timeout: 15000 });
    }
    
    await page.waitForTimeout(500);
    
    console.log('On Visualization page, filling data via JavaScript...');
    
    // Fill all data using JavaScript to avoid visibility issues
    await page.evaluate(() => {
      // Helper to find input by placeholder and index
      const getInput = (placeholder, index = 0) => {
        const inputs = document.querySelectorAll(`input[placeholder="${placeholder}"]`);
        return inputs[index];
      };
      
      // Helper to click button by text
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      
      // Helper to fill input and trigger events
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      
      // First pipe - 8 inch, 50m
      const depthInput = getInput('45', 0);
      const diamInput = document.querySelector('input[inputmode="decimal"][step="0.5"]');
      fillInput(depthInput, '50');
      fillInput(diamInput, '8');
      clickButton('Tambah pipa');
    });
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
      const getInput = (placeholder, index = 0) => {
        const inputs = document.querySelectorAll(`input[placeholder="${placeholder}"]`);
        return inputs[index];
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      
      // Second pipe - 6 inch, 45m
      const depthInput = getInput('45', 0);
      const diamInput = document.querySelector('input[inputmode="decimal"][step="0.5"]');
      fillInput(depthInput, '45');
      fillInput(diamInput, '6');
      clickButton('Tambah pipa');
    });
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
      const getInput = (placeholder, index = 0) => {
        const inputs = document.querySelectorAll(`input[placeholder="${placeholder}"]`);
        return inputs[index];
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      
      // Third pipe - 4 inch, 40m
      const depthInput = getInput('45', 0);
      const diamInput = document.querySelector('input[inputmode="decimal"][step="0.5"]');
      fillInput(depthInput, '40');
      fillInput(diamInput, '4');
      clickButton('Tambah pipa');
    });
    await page.waitForTimeout(500);
    
    // Set ground level reference - 2.5m
    await page.evaluate(() => {
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      
      clickButton('Permukaan tanah');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      
      const input = document.querySelector('input[placeholder="2.5"]');
      fillInput(input, '2.5');
      clickButton('Atur titik acuan');
    });
    await page.waitForTimeout(500);
    
    // Set MAT - 5.0m
    await page.evaluate(() => {
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      clickButton('Muka air tanah');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      
      const inputs = document.querySelectorAll('input[placeholder="5"]');
      if (inputs.length > 0) fillInput(inputs[0], '5.0');
      clickButton('Atur muka air tanah');
    });
    await page.waitForTimeout(500);
    
    // Add screen 1 - starts at 20m, length 10m
    await page.evaluate(() => {
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      clickButton('Saringan');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      
      const inputs = document.querySelectorAll('input[placeholder="15"]');
      if (inputs.length > 0) fillInput(inputs[0], '20');
      if (inputs.length > 1) fillInput(inputs[1], '10');
      clickButton('Tambah saringan');
    });
    await page.waitForTimeout(500);
    
    // Add screen 2 - starts at 60m, length 8m
    await page.evaluate(() => {
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      
      const inputs = document.querySelectorAll('input[placeholder="15"]');
      if (inputs.length > 0) fillInput(inputs[0], '60');
      if (inputs.length > 1) fillInput(inputs[1], '8');
      clickButton('Tambah saringan');
    });
    await page.waitForTimeout(500);
    
    // Set open hole - 5.0m
    await page.evaluate(() => {
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      clickButton('Open hole');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const fillInput = (input, value) => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const clickButton = (text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text));
        if (btn) btn.click();
      };
      
      const inputs = document.querySelectorAll('input[placeholder="5"]');
      if (inputs.length > 1) fillInput(inputs[1], '5.0');
      clickButton('Atur open hole');
    });
    await page.waitForTimeout(800);
    
    // Switch to Diagram view
    await page.click('button[role="tab"]:has-text("Diagram")');
    await page.waitForTimeout(1500);
    
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-visualization-page.png'),
      fullPage: false,
    });
    console.log('Visualization page captured');

    // ===== SCREENSHOT 3: DESIGNER PAGE =====
    console.log('Capturing Designer Page...');
    
    // Navigate directly to designer
    await page.goto('http://localhost:5173/login#/desain');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.waitForSelector('h1:has-text("Desain Konstruksi")', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check toolbar buttons
    const toolbarButtons = page.locator('.toolbar-col button, aside:has-text("Komponen Konstruksi") button');
    const buttonCount = await toolbarButtons.count();
    console.log('Toolbar button count:', buttonCount);
    
    for (let i = 0; i < buttonCount; i++) {
      const text = await toolbarButtons.nth(i).innerText();
      console.log('Button ' + i + ':', text);
    }
    
    // Take screenshot of designer page
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-designer-page.png'),
      fullPage: false,
    });
    console.log('Designer page captured');

    console.log('All screenshots captured successfully!');
    console.log('Saved to: ' + SCREENSHOT_DIR);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'error-debug.png'),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch(console.error);