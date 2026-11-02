// Role-by-role screen and form QA in an isolated database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { navForRole } from '../../client/src/config/nav.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
let mongo, server, browser;
const errors = [], checks = [];
try {
  const output = path.resolve('../artifacts/school-qa'); await mkdir(output, { recursive: true });
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('school_screens_qa'); process.env.JWT_SECRET = 'isolated-school-screens'; process.env.NODE_ENV = 'test'; process.env.SERVE_CLIENT = 'true'; process.env.BACKUP_DIR = path.resolve('../.data/qa-school-backups');
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = await import('../src/app.js'); const m = mongoose.models;
  const { schoolDate, parseDay } = await import('../src/utils/financeDates.js');
  await Promise.all(Object.values(m).map((model) => model.init()));
  const year = await m.AcademicYear.create({ name: { en: '2026', bn: '২০২৬' }, startDate: '2026-01-01', endDate: '2026-12-31' });
  const grade = await m.Class.create({ name: { en: 'Class 6', bn: 'ষষ্ঠ শ্রেণি' }, academicYear: year.id });
  const section = await m.Section.create({ name: { en: 'A', bn: 'ক' }, class: grade.id });
  const subject = await m.Subject.create({ name: { en: 'Mathematics', bn: 'গণিত' }, class: grade.id });
  const staff = await m.Teacher.create({ name: { en: 'QA Teacher' }, employeeId: 'UI-QA-T', subjects: [subject.id] });
  const student = await m.Student.create({ name: { en: 'QA Learner', bn: 'পরীক্ষামূলক শিক্ষার্থী' }, admissionNo: 'UI-QA-S', class: grade.id, section: section.id, academicYear: year.id, admissionDate: '2026-01-01' });
  const exam = await m.Exam.create({ name: { en: 'Final', bn: 'বার্ষিক' }, academicYear: year.id, isPublished: true });
  await m.Mark.create({ exam: exam.id, student: student.id, subject: subject.id, marksObtained: 85, fullMarks: 100, grade: 'A+', gradePoint: 5 });
  await m.TimetableSlot.create({ section: section.id, subject: subject.id, teacher: staff.id, dayOfWeek: 1, startTime: '09:00', endTime: '09:45' });
  await m.Notice.create({ title: { en: 'QA Announcement', bn: 'পরীক্ষামূলক বিজ্ঞপ্তি' }, body: { en: 'School notices are working.' }, audience: ['all'] });
  const date = parseDay(schoolDate());
  await m.Income.create({ amount: 1000, date, reference: 'QA-INCOME' }); await m.Expense.create({ amount: 100, date, reference: 'QA-EXPENSE' });
  const users = {};
  for (const role of ['admin', 'teacher', 'accountant', 'student', 'parent']) {
    const user = new m.User({ name: { en: `QA ${role}` }, email: `${role}@school-ui.test`, role, ...(role === 'teacher' ? { teacher: staff.id } : role === 'student' ? { student: student.id } : role === 'parent' ? { children: [student.id] } : {}) });
    await user.setPassword('school-ui-password'); await user.save(); users[role] = user;
  }
  server = createApp().listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  for (const role of Object.keys(users)) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, timezoneId: 'Asia/Dhaka' });
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(`${role}: ${error.message}`));
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${role}: ${r.status()} ${new URL(r.url()).pathname}`); });
    const login = await page.request.post(base + '/api/auth/login', { data: { email: users[role].email, password: 'school-ui-password' } });
    assert.equal(login.status(), 200); const token = (await login.json()).token;
    await page.addInitScript((token) => { localStorage.setItem('token', token); localStorage.setItem('lang', 'en'); localStorage.setItem('i18nextLng', 'en'); }, token);
    for (const item of navForRole(role)) {
      await page.goto(base + item.to); await page.waitForLoadState('networkidle');
      try {
        assert.equal(new URL(page.url()).pathname, item.to, `${role} must open ${item.to}`);
        assert.ok(await page.locator('h1').count(), `${role}: heading missing at ${item.to}`);
        const tabs = item.to === '/finance' ? ['Overview', 'Income', 'Expenses', 'Salaries', 'Reports', 'Net profit', 'Settings'] : item.to === '/exams' && ['admin', 'teacher'].includes(role) ? ['Exam terms', 'Mark entry', 'Result sheet', 'Report card'] : [];
        for (const title of tabs) {
          const tab = page.getByRole('button', { name: title, exact: true });
          assert.equal(await tab.count(), 1, `${role}: missing ${title} tab`);
          await tab.click(); await page.waitForLoadState('networkidle'); checks.push(`${role}: ${item.to} / ${title}`);
        }
        checks.push(`${role}: ${item.to}`);
      } catch (error) { errors.push(error.message); await page.screenshot({ path: path.join(output, `${role}-${item.key}-failure.png`), fullPage: true }); }
    }
    if (role === 'admin') {
      for (const [tab, field, ref] of [['income', 'Invoice no.', '000-INVOICE-UI'], ['expenses', 'Voucher no.', '000-VOUCHER-UI']]) {
        await page.goto(`${base}/finance?tab=${tab}`); await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: tab === 'income' ? /Add income$/ : /Add expense$/ }).click();
        const modal = page.getByRole('dialog'); const input = modal.getByLabel(new RegExp(`^${field.replace('.', '\\.')}`));
        assert.equal(await input.evaluate((el) => el.required), true);
        await input.fill('   '); assert.equal(await input.evaluate((el) => el.checkValidity()), false);
        await modal.locator('input[type=number]').fill('12.34'); await input.fill(ref);
        const saved = page.waitForResponse((r) => r.url().endsWith(`/api/finance/${tab}`) && r.request().method() === 'POST');
        await modal.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal((await saved).status(), 201);
        await modal.waitFor({ state: 'hidden' });
        const row = page.getByRole('row').filter({ hasText: ref }); await row.waitFor();
        await row.getByRole('button', { name: 'Edit', exact: true }).click();
        assert.equal(await input.inputValue(), ref); await input.fill(`${ref}-EDIT`);
        await modal.getByLabel('Correction reason', { exact: false }).fill('Correct physical document number');
        const correctionResponse = page.waitForResponse((r) => r.url().endsWith('/api/finance/corrections') && r.request().method() === 'POST');
        await modal.getByRole('button', { name: 'Request correction', exact: true }).click();
        const pending = (await (await correctionResponse).json()).item;
        await modal.waitFor({ state: 'hidden' });
        const reviewed = await page.request.post(`${base}/api/finance/corrections/${pending.id}/review`, { headers: { Authorization: `Bearer ${token}` }, data: { decision: 'approved', note: 'Verified document correction' } });
        assert.equal(reviewed.status(), 200);
        await page.goto(`${base}/finance?tab=${tab}`); await page.waitForLoadState('networkidle');
        const updated = page.getByRole('row').filter({ hasText: `${ref}-EDIT` });
        await updated.getByRole('button', { name: tab === 'income' ? /Receipt$/ : /Voucher$/ }).click();
        await modal.getByText(`${ref}-EDIT`, { exact: true }).first().waitFor();
        await modal.getByRole('button', { name: 'Close', exact: true }).click(); checks.push(`admin: ${tab} create/edit/required document number/print`);
      }
      for (const route of ['/exams', '/students', '/teachers', '/classes', '/sections', '/subjects', '/attendance', '/timetable', '/notices', '/accounts', '/activity-logs', '/finance']) {
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + route); await page.waitForLoadState('networkidle');
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) { errors.push(`Mobile horizontal overflow: ${route}`); await page.screenshot({ path: path.join(output, `${route.slice(1)}-mobile-overflow.png`), fullPage: true }); }
        checks.push(`mobile: ${route}`);
      }
      await page.getByRole('button', { name: 'বাংলা', exact: true }).click(); await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(output, 'finance-bangla.png'), fullPage: true }); checks.push('Bangla language switch');
    }
    if (role !== 'admin') {
      assert.equal(await page.getByRole('link', { name: 'Activity logs', exact: true }).count(), 0);
      await page.goto(base + '/activity-logs'); await page.waitForURL(base + (role === 'teacher' ? '/students' : role === 'accountant' ? '/fees' : '/'));
    }
    if (['teacher', 'accountant'].includes(role)) {
      const landing = role === 'teacher' ? '/students' : '/fees';
      const forbidden = role === 'teacher' ? ['/fees', '/finance', '/partners', '/accounts', '/teachers', '/notices', '/timetable'] : ['/students', '/classes', '/sections', '/subjects', '/attendance', '/exams', '/partners', '/accounts', '/teachers', '/notices', '/timetable'];
      for (const route of forbidden) { await page.goto(base + route); await page.waitForURL(base + landing); checks.push(`${role}: blocked ${route}`); }
    }
    console.log(`Checked ${role} screens.`); await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${checks.length} screen/form/role checks. Screenshots: ${output}`);
} catch (error) { if (errors.length) console.error(errors); throw error; }
finally { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await mongo?.stop(); }
