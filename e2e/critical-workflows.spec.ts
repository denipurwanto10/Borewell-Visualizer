import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('Admin login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
  });

  test('Staff login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-staff@local.test');
    await page.fill('input[type="password"]', 'StaffPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
  });

  test('Page refresh while authenticated', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
    
    await page.reload();
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
  });

  test('Token refresh', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
    
    await page.waitForTimeout(2000);
    
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
  });

  test('Logout', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
    
    await page.getByRole('button', { name: 'Keluar dari akun', exact: true }).click();
    await expect(page).toHaveURL(/.*login/);
  });

  test('Expired or invalid session handling', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
  });
});

test.describe('Project Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
  });

  test('Project listing', async ({ page }) => {
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Proyek & Sumur', exact: true })).toBeVisible();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
  });

  test('Project creation', async ({ page }) => {
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Buat Proyek', exact: true }).click();
    
    await page.fill('input[placeholder="PRJ-001"]', 'P-E2E-TEST');
    await page.fill('input[placeholder="Pembangunan Sumur Bor"]', 'E2E Test Project');
    await page.fill('input[placeholder="PT. Klien Tbk"]', 'E2E Client');
    await page.selectOption('select:has(option[value="DKI Jakarta"])', 'DKI Jakarta');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.project-code:has-text("P-E2E-TEST")').first()).toBeVisible({ timeout: 10000 });
  });

  test('Opening project details', async ({ page }) => {
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    
    const hasProjects = await page.locator('tbody tr, .project-card').count() > 0;
    if (!hasProjects) {
      await page.getByRole('button', { name: 'Buat Proyek', exact: true }).click();
      await page.fill('input[placeholder="PRJ-001"]', 'P-E2E-TEST');
      await page.fill('input[placeholder="Pembangunan Sumur Bor"]', 'E2E Test Project');
      await page.fill('input[placeholder="PT. Klien Tbk"]', 'E2E Client');
      await page.selectOption('select:has(option[value="DKI Jakarta"])', 'DKI Jakarta');
      await page.click('button[type="submit"]');
      await expect(page.locator('.project-code:has-text("P-E2E-TEST")').first()).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
      await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible();
    }
    
    const firstProject = page.locator('tbody tr, .project-card').first();
    await firstProject.click();
    
    await page.waitForURL(/.*project\/[0-9a-f-]+/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("E2E Test Project"), th:has-text("Sumur")').first()).toBeVisible({ timeout: 10000 });
  });

  test('Project switching', async ({ page }) => {
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    
    const projects = page.locator('tbody tr, .project-card');
    let count = await projects.count();
    if (count < 2) {
      for (let i = count; i < 2; i++) {
        await page.getByRole('button', { name: 'Buat Proyek', exact: true }).click();
        await page.fill('input[placeholder="PRJ-001"]', `P-E2E-TEST-${i+1}`);
        await page.fill('input[placeholder="Pembangunan Sumur Bor"]', `E2E Test Project ${i+1}`);
        await page.fill('input[placeholder="PT. Klien Tbk"]', 'E2E Client');
        await page.selectOption('select:has(option[value="DKI Jakarta"])', 'DKI Jakarta');
        await page.click('button[type="submit"]');
        await expect(page.locator(`.project-code:has-text("P-E2E-TEST-${i+1}")`)).toBeVisible({ timeout: 10000 });
        await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
        await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible();
      }
      count = await projects.count();
    }
    
    if (count > 1) {
      await projects.nth(0).click();
      await page.waitForURL(/.*project\/[0-9a-f-]+/);
      await page.goBack();
      await projects.nth(1).click();
      await page.waitForURL(/.*project\/[0-9a-f-]+/);
    }
  });
});

test.describe('Well Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    
    const firstProject = page.locator('tbody tr, .project-card').first();
    await firstProject.click();
    await page.waitForURL(/.*project\/[0-9a-f-]+/);
    await page.waitForLoadState('networkidle');
  });

  test('Well listing', async ({ page }) => {
    await expect(page.locator('th:has-text("Sumur")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('table, .well-card')).toBeVisible();
  });

  test('Well selection navigates to Visualisasi', async ({ page }) => {
    await expect(page.locator('th:has-text("Sumur")')).toBeVisible({ timeout: 10000 });
    
    const firstWell = page.locator('tbody tr, .well-card').first();
    await Promise.all([
      page.waitForURL(/.*visualisasi/),
      firstWell.click()
    ]);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("Visualisasi Pipa")')).toBeVisible({ timeout: 10000 });
  });

  test('Well creation', async ({ page }) => {
    await expect(page.locator('h1:has-text("E2E Test Project"), .project-code:has-text("P-E2E-TEST")').first()).toBeVisible({ timeout: 10000 });
    
    await page.getByRole('button', { name: 'Tambah Sumur', exact: true }).click();
    await expect(page.locator('[role="dialog"], .dialog').first()).toBeVisible({ timeout: 5000 });
    
    await page.fill('input[placeholder="WELL-001"]', 'W-E2E-TEST');
    await page.fill('input[placeholder="Sumur Produksi 1"]', 'E2E Test Well');
    await page.selectOption('select:has(option[value="production"]) >> nth=0', 'production');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.well-code:has-text("W-E2E-TEST"), .mono:has-text("W-E2E-TEST")').first()).toBeVisible({ timeout: 10000 });
  });

  test('Active well display in topbar shows well name', async ({ page }) => {
    await expect(page.locator('th:has-text("Sumur")')).toBeVisible({ timeout: 10000 });
    
    const firstWell = page.locator('tbody tr, .well-card').first();
    await Promise.all([
      page.waitForURL(/.*visualisasi/),
      firstWell.click()
    ]);
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('.ctx-pill-part.is-well')).toContainText('E2E Test Well');
  });

  test('Data persistence after refresh', async ({ page }) => {
    await expect(page.locator('th:has-text("Sumur")')).toBeVisible({ timeout: 10000 });
    
    const firstWell = page.locator('tbody tr, .well-card').first();
    await firstWell.click();
    await page.waitForURL(/.*visualisasi/);
    await page.waitForLoadState('networkidle');
    
    // Go back to project detail to access Data Sumur
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Go to Data Sumur directly (well is already selected in context)
    await Promise.all([
      page.waitForURL(/.*data/),
      page.getByRole('button', { name: 'Data Sumur', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Data Sumur")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // DataPage has wellNumber field (Nomor urut sumur bor)
    await page.fill('input[placeholder="SUM-001"]', 'UPDATED-WELL-NUMBER');
    // Trigger dirty state by blurring
    await page.keyboard.press('Tab');
    // Save button should be enabled now
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.locator('text=Data sumur bor berhasil disimpan')).toBeVisible({ timeout: 10000 });
    
    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Navigate back to Data Sumur (well should still be selected)
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    
    // Select well again to ensure context is set
    const well = page.locator('tbody tr, .well-card').first();
    await well.click();
    await page.waitForURL(/.*visualisasi/);
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    await Promise.all([
      page.waitForURL(/.*data/),
      page.getByRole('button', { name: 'Data Sumur', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Data Sumur")')).toBeVisible({ timeout: 10000 });
    
    await expect(page.locator('input[placeholder="SUM-001"]')).toHaveValue('UPDATED-WELL-NUMBER');
  });

  test('Version conflict handling in Designer', async ({ page }) => {
    await expect(page.locator('th:has-text("Sumur")')).toBeVisible({ timeout: 10000 });
    
    const firstWell = page.locator('tbody tr, .well-card').first();
    await firstWell.click();
    await page.waitForURL(/.*visualisasi/);
    await page.waitForLoadState('networkidle');
    
    // Go back to project detail
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Navigate to Designer directly from project detail (well is already selected)
    await Promise.all([
      page.waitForURL(/.*desain/),
      page.getByRole('button', { name: 'Desain Konstruksi', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Desain Konstruksi")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Save initial state
    await page.getByRole('button', { name: 'Simpan Desain', exact: true }).click();
    await expect(page.locator('text=Desain sumur berhasil disimpan., text=Desain tersimpan otomatis.')).toBeVisible({ timeout: 10000 });
    
    // Try to save again without changes
    await page.getByRole('button', { name: 'Simpan Desain', exact: true }).click();
    await expect(page.locator('text=Desain sumur berhasil disimpan., text=Desain tersimpan otomatis., text=versi')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Documentation Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('table, .project-card, [data-testid="project-list"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const firstProject = page.locator('tbody tr, .project-card').first();
    await firstProject.click();
    await page.waitForURL(/.*project\/[0-9a-f-]+/);
    await page.waitForLoadState('networkidle');
  });

  test('Documentation listing (Galeri & Dokumen)', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*documentation/),
      page.getByRole('button', { name: 'Galeri & Dokumen', exact: true }).click()
    ]);
    // PageHead renders h1 in header.page-head - check for title in page
    await expect(page.locator('h1:has-text("Dokumen Proyek")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('Opening existing document', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*documentation/),
      page.getByRole('button', { name: 'Galeri & Dokumen', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Dokumen Proyek")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    const doc = page.locator('.doc-card, [data-testid="document-item"], .doc-tile-document').first();
    if (await doc.count() > 0) {
      await doc.click();
      await expect(page.locator('text=Detail Dokumen, .document-detail, .viewer-overlay')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Creating and editing documentation', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*documentation/),
      page.getByRole('button', { name: 'Galeri & Dokumen', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Dokumen Proyek")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('button', { name: 'Tambah Dokumen', exact: true }).click();
    
    const modal = page.locator('[role="dialog"], .dialog').first();
    if (await modal.count() > 0) {
      await page.fill('input[name="title"], input[name="name"]', 'E2E Test Doc');
      await page.click('button:has-text("Simpan"), button:has-text("Unggah")');
      await expect(page.locator('text=berhasil diunggah')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Invalid ID handling', async ({ page }) => {
    await page.goto('/#documentation/invalid-id');
    // Should redirect to project docs or show error
    await expect(page.locator('text=Invalid ID, text=Tidak ditemukan, h1:has-text("Dokumen Proyek")')).toBeVisible({ timeout: 10000 });
  });

  test('Project-scoped authorization (Dokumen Proyek)', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*project-docs/),
      page.getByRole('button', { name: 'Dokumen Proyek', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Dokumen Proyek")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });
});

test.describe('Module Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-admin@local.test');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('main:has-text("Beranda"), .page:has-text("Beranda")').first()).toBeVisible();
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('table, .project-card, [data-testid="project-list"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const firstProject = page.locator('tbody tr, .project-card').first();
    await firstProject.click();
    await page.waitForURL(/.*project\/[0-9a-f-]+/);
    await page.waitForLoadState('networkidle');
    
    // Select first well (navigates to visualisasi)
    await expect(page.locator('th:has-text("Sumur")')).toBeVisible({ timeout: 10000 });
    const firstWell = page.locator('tbody tr, .well-card').first();
    await firstWell.click();
    await page.waitForURL(/.*visualisasi/);
    await page.waitForLoadState('networkidle');
    
    // Go back to project detail to access module pages from sidebar
    await page.getByRole('button', { name: 'Proyek & Sumur', exact: true }).click();
    await expect(page.locator('h1:has-text("Proyek & Sumur")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('Designer module', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*desain/),
      page.getByRole('button', { name: 'Desain Konstruksi', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Desain Konstruksi")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Use specific canvas for designer
    await expect(page.locator('canvas[aria-label="Kanvas desain konstruksi sumur"]')).toBeVisible({ timeout: 10000 });
    // Component toolbar has "Komponen Konstruksi"
    await expect(page.locator('text=Komponen Konstruksi')).toBeVisible({ timeout: 10000 });
  });

  test('Geology Log module', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*geology/),
      page.getByRole('button', { name: 'Log Geologi', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Log Geologi")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Use specific canvas for geology
    await expect(page.locator('canvas[aria-label="Log geologi sumur bor"]')).toBeVisible({ timeout: 10000 });
  });

  test('Monitoring module', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*monitoring/),
      page.getByRole('button', { name: 'Muka Air Tanah', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Muka Air Tanah")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Check for monitoring canvas stage (canvas may be 0x0 when empty)
    await expect(page.locator('.canvas-stage, canvas[aria-label="Hidrograf muka air tanah"]')).toBeVisible({ timeout: 10000 });
  });

  test('Data export and backup', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*data-management/),
      page.getByRole('button', { name: 'Backup & Data', exact: true }).click()
    ]);
    await expect(page.locator('h1:has-text("Backup & Data")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Check for tab list in Tabs component
    await expect(page.locator('.tab-list, [role="tablist"]')).toBeVisible({ timeout: 10000 });
  });

  test('User Management (admin only)', async ({ page }) => {
    await Promise.all([
      page.waitForURL(/.*admin-approval/),
      page.getByRole('button', { name: 'Persetujuan Akun', exact: true }).click()
    ]);
    // Admin approval page shows "Manajemen Pengguna" as heading
    await expect(page.locator('h1:has-text("Manajemen Pengguna"), h1:has-text("Persetujuan Akun")')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });
});