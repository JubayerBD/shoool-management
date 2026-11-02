// Read-only regression check against the running development site.
// PLAYWRIGHT_PATH may point to a shared Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.PARTNERS_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const login = await page.request.post(`${base}/api/auth/login`, { data: {
    email: process.env.PARTNERS_TEST_EMAIL || 'admin@school.test',
    password: process.env.PARTNERS_TEST_PASSWORD || 'admin1234',
  } });
  assert.equal(login.status(), 200);
  const { token } = await login.json();
  await page.goto(base);
  await page.evaluate((token) => { localStorage.setItem('token', token); localStorage.setItem('i18nextLng', 'en'); }, token);
  await page.goto(`${base}/partners`);
  const partners = await page.request.get(`${base}/api/partners`, { headers: { Authorization: `Bearer ${token}` } });
  const { items } = await partners.json();
  assert.ok(items.length >= 2, 'Create at least two partners before running this read-only check');
  for (const partner of items.slice(0, 2)) {
    await page.locator(`a[href="/partners/${partner.id}"]`).click();
    await page.getByRole('heading', { name: partner.name, exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Deposit history', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Record deposit', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Back to partners' }).click();
    await page.getByRole('heading', { name: 'Partners', exact: true }).waitFor();
  }
  await page.goto(`${base}/partners/${items[0].id}`);
  await page.getByRole('heading', { name: items[0].name, exact: true }).waitFor();
  await page.goto(`${base}/finance`);
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  const categoryFilter = page.locator('select').first();
  await categoryFilter.locator('option[value="partner-investment"]').waitFor({ state: 'attached' });
  await categoryFilter.selectOption('partner-investment');
  const incomeResponse = await page.request.get(`${base}/api/finance/income?category=partner-investment`, { headers: { Authorization: `Bearer ${token}` } });
  const income = await incomeResponse.json();
  assert.equal(income.items.reduce((sum, row) => sum + row.amount, 0), items.reduce((sum, p) => sum + p.capital, 0));
  for (const row of income.items) {
    await page.locator(`a[href="/partners/${row.partner}"]`).last().waitFor();
  }
  await page.getByRole('button', { name: 'Add income', exact: false }).click();
  await page.locator('#txn-form').waitFor();
  assert.equal(await page.locator('#txn-form option[value="partner-investment"]').count(), 0, 'Investments must be recorded through partner deposits');
  assert.deepEqual(errors, [], 'Partner navigation must not produce browser errors');
  console.log('PASS: partner navigation, income investment filter and totals, linked profiles, and manual-income form; no browser errors or data changes.');
} finally { await browser.close(); }
