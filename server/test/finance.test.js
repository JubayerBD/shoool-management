import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongo, server, base, Invoice, Payment, FeeStructure, Income, Expense, Student, User;
let runRecurringBilling, createInvoice, signToken, schoolDate;
let admin, studentUser, parent, unlinked, teacher, students;

async function request(path, user = admin, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: {
    Authorization: `Bearer ${signToken({ sub: user.id, role: user.role })}`,
    'Content-Type': 'application/json',
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, ...await response.json() };
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('finance_tests');
  process.env.JWT_SECRET = 'isolated-finance-test-secret';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGO_URI);
  ({ Invoice, Payment, FeeStructure } = await import('../src/models/Fees.js'));
  ({ Income, Expense } = await import('../src/models/Finance.js'));
  ({ Student } = await import('../src/models/People.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ createInvoice } = await import('../src/services/billing.js'));
  ({ runRecurringBilling } = await import('../src/services/recurringBilling.js'));
  ({ schoolDate } = await import('../src/utils/financeDates.js'));
  ({ signToken } = await import('../src/utils/jwt.js'));
  const { createApp } = await import('../src/app.js');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  students = await Student.create([0, 1, 2].map((n) => ({ name: { en: `Student ${n}` }, admissionNo: `TEST-${n}`, admissionDate: new Date('2020-01-01') })));
  const makeUser = (role, extra = {}) => User.create({ name: { en: role }, email: `${role}-${randomUUID()}@test.local`, passwordHash: 'unused', role, ...extra });
  admin = await makeUser('admin');
  studentUser = await makeUser('student', { student: students[0]._id });
  parent = await makeUser('parent', { children: students.slice(0, 2).map((s) => s._id) });
  unlinked = await makeUser('student');
  teacher = await makeUser('teacher');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 120_000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

const invoiceBody = (student, amount = 100) => ({ student: student.id, items: [{ title: { en: 'Tuition' }, amount }] });

test('manual income and expenses require a nonblank physical document number on create and edit', async () => {
  for (const [endpoint, reference] of [['income', '000123-INV'], ['expenses', '000456-VCH']]) {
    const path = `/finance/${endpoint}`;
    for (const value of [undefined, '', '   ', 123, 'x'.repeat(201)]) {
      assert.equal((await request(path, admin, { amount: 10, reference: value })).status, 400);
    }
    const created = await request(path, admin, { amount: 10, reference: `  ${reference}  `, date: '2000-01-01' });
    assert.equal(created.status, 201);
    assert.equal(created.item.reference, reference, 'preserve leading zeros and trim whitespace');
    const itemPath = `${path}/${created.item.id}`;
    assert.equal((await request(itemPath, admin, { amount: 11, reference: ' ' }, 'PUT')).status, 409);
    assert.equal((await request(itemPath, admin, undefined, 'DELETE')).status, 409);
    const change = { targetType: endpoint === 'income' ? 'income' : 'expense', targetId: created.item.id, operation: 'replace', reason: 'Correct document no.', requestKey: randomUUID(), proposed: { amount: 11, reference: `${reference}-EDIT`, date: '2000-01-01' } };
    const pending = await request('/finance/corrections', admin, change);
    assert.equal(pending.status, 201); assert.equal(pending.item.proposed.reference, `${reference}-EDIT`);
    const { FinancialCorrection } = await import('../src/models/FinancialCorrection.js');
    await FinancialCorrection.findByIdAndDelete(pending.item.id); // Isolated fixture cleanup, not an application action.
    await (endpoint === 'income' ? Income : Expense).findByIdAndDelete(created.item.id);
  }
});

test('partner capital controls shares, preserves deposit history, and safely retries deposits', async () => {
  assert.equal((await request('/partners', studentUser)).status, 403);
  assert.equal((await request('/partners', teacher, { name: 'Denied' })).status, 403);
  assert.equal((await request('/partners', admin, { name: 'Missing fields' })).status, 400);
  const body = { name: 'Partner A', phone: '01700000000', address: 'Dhaka', email: '' };
  const a = (await request('/partners', admin, body)).item;
  const b = (await request('/partners', admin, { ...body, name: 'Partner B' })).item;
  const empty = await request('/partners?profit=100');
  assert.equal(empty.totalCapital, 0);
  assert.ok(empty.items.every((p) => p.percentage === 0 && p.profit === 0));
  const deposit = { amount: 100000, date: schoolDate(), requestKey: randomUUID() };
  const results = await Promise.all([0, 1].map(() => request(`/partners/${a.id}/deposits`, admin, deposit)));
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(results[0].item.id, results[1].item.id);
  assert.equal((await request(`/partners/${a.id}/deposits`, admin, { ...deposit, amount: 2 })).status, 409);
  assert.equal((await request(`/partners/${b.id}/deposits`, admin, { ...deposit, requestKey: randomUUID(), amount: -1 })).status, 400);
  assert.equal((await request(`/partners/${b.id}/deposits`, admin, { ...deposit, requestKey: randomUUID(), amount: 1.001 })).status, 400);
  assert.equal((await request(`/partners/${b.id}/deposits`, admin, { ...deposit, requestKey: randomUUID(), date: '2025-02-30' })).status, 400);
  await request(`/partners/${b.id}/deposits`, admin, { ...deposit, requestKey: randomUUID(), amount: 50000 });
  const summary = await request('/partners?profit=100');
  assert.equal(summary.totalCapital, 150000);
  assert.equal(summary.items.find((p) => p.id === a.id).profit, 66.67);
  assert.equal(summary.items.find((p) => p.id === b.id).profit, 33.33);
  const history = await request(`/partners/${a.id}`);
  assert.equal(history.deposits.length, 1);
  assert.equal(history.deposits[0].amount, 100000);
  assert.equal(history.deposits[0].recordedBy, admin.id);
  await request(`/partners/${b.id}/deposits`, admin, { ...deposit, requestKey: randomUUID(), amount: 50000 });
  const equal = await request('/partners?profit=100');
  assert.ok(equal.items.every((p) => p.percentage === 50 && p.profit === 50));
  const investments = await request('/finance/income?category=partner-investment');
  assert.equal(investments.total, 3, 'retry must not add a second income entry');
  assert.equal(investments.items.reduce((sum, r) => sum + r.amount, 0), 200000);
  const incomeEntry = investments.items.find((r) => r.partner === a.id);
  assert.equal(incomeEntry.source, 'Partner A');
  assert.equal(incomeEntry.category.name.en, 'Partner investment');
  assert.equal((await request('/finance/income?category=partner-investment&search=Partner%20B')).total, 2);
  const paged = await request('/finance/income?category=partner-investment&limit=2&page=2');
  assert.equal(paged.items.length, 1);
  assert.equal(paged.total, 3);
  const finance = (await request('/finance/summary')).summary;
  assert.equal(finance.income.other, 200000);
  const analytics = await request('/finance/analytics');
  assert.equal(analytics.incomeByHead.find((r) => r.label?.en === 'Partner investment').total, 200000);
  assert.equal(analytics.monthly.reduce((sum, r) => sum + r.income, 0), finance.income.total);
  const ledger = await request('/finance/transactions?type=income');
  assert.equal(ledger.transactions.filter((r) => r.source === 'partner').length, 3);
  assert.equal((await request(`/finance/income/${incomeEntry.id}`, admin, { amount: 1 }, 'PUT')).status, 409);
  assert.equal((await request(`/finance/income/${incomeEntry.id}`, admin, undefined, 'DELETE')).status, 409);
  assert.equal((await request('/finance/income', admin, { amount: 1, category: 'partner-investment' })).status, 400);
  assert.equal((await request('/finance/income?from=2027-01-01&category=partner-investment')).total, 0);
});

test('server scopes invoice lists, details and payments to all linked children', async () => {
  const bills = await Promise.all(students.map((s) => createInvoice(invoiceBody(s))));
  await Payment.create(bills.map((bill) => ({ invoice: bill.id, student: bill.student, amount: 1 })));
  await Invoice.updateMany({ _id: { $in: bills.map((bill) => bill.id) } }, { paidAmount: 1, status: 'partial' });
  const own = await request('/fees/invoices', studentUser);
  assert.equal(own.total, 1);
  assert.equal((await request('/fees/invoices', parent)).total, 2);
  assert.equal((await request('/fees/invoices', unlinked)).total, 0);
  assert.equal((await request(`/fees/invoices?student=${students[2].id}`, studentUser)).status, 403);
  assert.equal((await request(`/fees/invoices/${bills[2].id}`, parent)).status, 404);
  assert.equal((await request('/fees/payments', studentUser)).total, 1);
  assert.equal((await request(`/fees/payments?invoice=${bills[2].id}`, studentUser)).total, 0);
  assert.equal((await request('/fees/invoices', teacher)).status, 403);
  assert.equal((await request('/finance/summary', studentUser)).status, 403);
});

test('simultaneous payments cannot overpay and capture the receiving user', async () => {
  const bill = await createInvoice(invoiceBody(students[0]));
  const results = await Promise.all([0, 1].map(() => request('/fees/payments', admin, { invoice: bill.id, amount: 60 })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
  const saved = await Invoice.findById(bill.id);
  assert.equal(saved.paidAmount, 60);
  assert.equal(saved.status, 'partial');
  const payments = await Payment.find({ invoice: bill.id });
  assert.equal(payments.length, 1);
  assert.equal(String(payments[0].receivedBy), admin.id);
  assert.equal((await request('/fees/payments', admin, { invoice: bill.id, amount: 40 })).invoice.status, 'paid');
});

test('retry keys prevent duplicate collections and reject changed payment amounts', async () => {
  const bill = await createInvoice(invoiceBody(students[0]));
  const body = { invoice: bill.id, amount: 25, idempotencyKey: randomUUID() };
  const first = await request('/fees/payments', admin, body);
  const second = await request('/fees/payments', admin, body);
  assert.equal(first.status, 201);
  assert.equal(second.item.id, first.item.id);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 25);
  assert.equal((await request('/fees/payments', admin, { ...body, amount: 26 })).status, 409);
  const concurrent = { invoice: bill.id, amount: 10, idempotencyKey: randomUUID() };
  const retries = await Promise.all([0, 1, 2].map(() => request('/fees/payments', admin, concurrent)));
  assert.ok(retries.every((r) => r.status === 201));
  assert.equal(new Set(retries.map((r) => r.item.id)).size, 1);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 35);
});

test('invoice save failure rolls back the payment insert', async () => {
  const bill = await createInvoice(invoiceBody(students[0]));
  const original = Invoice.prototype.save;
  Invoice.prototype.save = async function (...args) {
    if (this.id === bill.id) throw new Error('Injected invoice write failure');
    return original.apply(this, args);
  };
  try { assert.equal((await request('/fees/payments', admin, { invoice: bill.id, amount: 25 })).status, 500); }
  finally { Invoice.prototype.save = original; }
  assert.equal(await Payment.countDocuments({ invoice: bill.id }), 0);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 0);
});

test('invoice sequence survives legacy gaps and concurrent creates', async () => {
  await Invoice.create({ ...invoiceBody(students[0]), invoiceNo: 'INV-900000', totalAmount: 100 });
  const bills = await Promise.all(Array.from({ length: 20 }, () => createInvoice(invoiceBody(students[0]))));
  assert.equal(new Set(bills.map((b) => b.invoiceNo)).size, 20);
  assert.ok(bills.every((b) => Number(b.invoiceNo.slice(4)) > 900000));
});

test('recurring fees and expenses catch up once, clamp month ends and respect opt-in', async () => {
  const disabled = await FeeStructure.create({ name: { en: 'Manual only' }, amount: 10, frequency: 'monthly' });
  const monthly = await FeeStructure.create({ name: { en: 'Monthly' }, amount: 15, frequency: 'monthly', autoGenerate: true, billingStart: '2026-01-31' });
  const quarterly = await FeeStructure.create({ name: { en: 'Quarterly' }, amount: 20, frequency: 'quarterly', autoGenerate: true, billingStart: '2026-01-31' });
  const expense = await Expense.create({ amount: 30, date: new Date('2026-01-31T00:00:00+06:00'), recurring: { enabled: true, frequency: 'monthly' }, reference: 'old-reference', receiptUrl: '/old-receipt' });
  await Promise.all([0, 1].map(() => runRecurringBilling(new Date('2026-04-30T18:00:00Z'))));
  await runRecurringBilling(new Date('2026-04-30T18:00:00Z'));
  assert.equal(await Invoice.countDocuments({ 'items.feeStructure': disabled.id }), 0);
  assert.equal(await Invoice.countDocuments({ 'items.feeStructure': monthly.id }), 4 * students.length);
  assert.equal(await Invoice.countDocuments({ 'items.feeStructure': quarterly.id }), 2 * students.length);
  const copies = await Expense.find({ recurringSource: expense.id }).sort({ date: 1 });
  assert.deepEqual(copies.map((e) => schoolDate(e.date)), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.ok(copies.every((e) => !e.reference && !e.receiptUrl && !e.recurring.enabled));
  await FeeStructure.updateMany({ autoGenerate: true }, { autoGenerate: false });
  await Expense.updateOne({ _id: expense.id }, { 'recurring.enabled': false });
  await runRecurringBilling(new Date('2026-06-30'));
  assert.equal(await Expense.countDocuments({ recurringSource: expense.id }), 3);
});

test('annual and one-time fees honor class, admission and academic-year bounds', async () => {
  const { AcademicYear, Class } = await import('../src/models/Academic.js');
  const year = await AcademicYear.create({ name: { en: '2026' }, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') });
  const grade = await Class.create({ name: { en: 'Test class' }, academicYear: year.id });
  const eligible = await Student.create({ name: { en: 'Eligible' }, admissionNo: 'ANNUAL', class: grade.id, academicYear: year.id, admissionDate: new Date('2025-01-01') });
  await Student.create({ name: { en: 'Admitted later' }, admissionNo: 'LATER', class: grade.id, academicYear: year.id, admissionDate: new Date('2026-06-01') });
  for (const frequency of ['yearly', 'one_time']) {
    const fee = await FeeStructure.create({ name: { en: frequency }, amount: 5, frequency, autoGenerate: true, billingStart: '2025-02-01', class: grade.id, academicYear: year.id });
    await runRecurringBilling(new Date('2028-01-01'));
    const bills = await Invoice.find({ 'items.feeStructure': fee.id });
    assert.equal(bills.length, frequency === 'yearly' ? 1 : 0);
    if (bills.length) assert.equal(String(bills[0].student), eligible.id);
  }
});

test('report charts and headline totals use identical Dhaka date boundaries', async () => {
  await Income.create([
    { amount: 123, date: new Date('2027-01-31T18:00:00Z') },
    { amount: 456, date: new Date('2027-02-28T17:59:59.999Z') },
    { amount: 999, date: new Date('2027-02-28T18:00:00Z') },
  ]);
  const range = '?from=2027-02-01&to=2027-02-28';
  const summary = await request('/finance/summary' + range);
  const analytics = await request('/finance/analytics' + range);
  assert.equal(summary.summary.income.total, 579);
  assert.deepEqual(analytics.monthly, [{ label: '2027-02', income: 579, expense: 0 }]);
  assert.equal((await request('/finance/summary?from=2027-02-30')).status, 400);
  assert.equal((await request('/finance/summary?from=2027-03-01&to=2027-02-01')).status, 400);
});

test('large lists and ledger expose every record across pages', async () => {
  await Income.insertMany(Array.from({ length: 1005 }, () => ({ amount: 1, date: new Date('2028-01-15') })));
  for (const endpoint of ['/finance/income', '/finance/transactions']) {
    const seen = new Set();
    let page = 1, result;
    do {
      result = await request(`${endpoint}?from=2028-01-01&to=2028-01-31&limit=200&page=${page++}`);
      assert.equal(result.status, 200);
      for (const item of result.items || result.transactions) seen.add(item.id);
    } while (page <= result.pages);
    assert.equal(seen.size, 1005);
    assert.equal(result.total, 1005);
  }
  assert.equal((await request('/finance/income?limit=999')).status, 400);
});

test('fee plans and schedules preview concessions, optional services, approvals and frozen rates', async () => {
  const { AcademicYear, Class } = await import('../src/models/Academic.js');
  const { BillingSchedule } = await import('../src/models/FeeWorkflow.js');
  const { generateScheduleInvoices } = await import('../src/services/feeSchedules.js');
  const year = await AcademicYear.create({ name: { en: '2030' }, startDate: new Date('2030-01-01'), endDate: new Date('2030-12-31') });
  const grade = await Class.create({ name: { en: 'Workflow class' }, academicYear: year.id });
  const learners = await Student.create([0, 1].map((n) => ({ name: { en: `Workflow ${n}` }, admissionNo: `FLOW-${n}`, class: grade.id, academicYear: year.id, admissionDate: new Date('2029-01-01') })));
  const tuition = await FeeStructure.create({ name: { en: 'Workflow tuition' }, amount: 1000 });
  const transport = await FeeStructure.create({ name: { en: 'Workflow transport' }, amount: 800 });
  const annual = await FeeStructure.create({ name: { en: 'Workflow annual' }, amount: 5000 });
  const planBody = { name: { en: 'Class plan' }, class: grade.id, academicYear: year.id,
    items: [{ feeType: tuition.id, amount: 1000 }, { feeType: transport.id, amount: 800, optional: true }, { feeType: annual.id, amount: 5000 }] };
  const plan = await request('/fees/plans', admin, planBody);
  assert.equal(plan.status, 201);
  const body = { name: 'Monthly tuition and transport', plan: plan.item.id, feeTypes: [tuition.id, transport.id], students: learners.map((s) => s.id),
    startDate: '2030-01-01', endDate: '2030-12-31', frequency: 'monthly', dueDays: 9,
    optionalAssignments: [{ feeType: transport.id, students: [learners[0].id] }],
    concessions: [{ student: learners[0].id, feeType: tuition.id, mode: 'percent', value: 20, reason: 'Approved scholarship' },
      { student: learners[1].id, mode: 'fixed', value: 100, reason: 'Sibling concession' }] };
  const created = await request('/fees/schedules', admin, body);
  assert.equal(created.status, 201);
  const path = `/fees/schedules/${created.item.id}`;
  assert.equal(await Invoice.countDocuments({ billingSchedule: created.item.id }), 0, 'drafts do not bill students');
  let preview = await request(path + '/preview');
  assert.equal(preview.summary.invoiceCount, 24);
  assert.equal(preview.summary.total, 30000);
  assert.deepEqual(preview.rows.map((row) => row.totalAmount).sort((a, b) => a - b), [900, 1600]);
  const accountant = await User.create({ name: { en: 'Accountant' }, email: 'workflow-accountant@test.local', passwordHash: 'unused', role: 'accountant' });
  assert.equal((await request(path + '/activate', accountant, { token: preview.token })).status, 403);
  await request(`/fees/plans/${plan.item.id}`, admin, { ...planBody, name: { en: 'Updated name' } }, 'PUT');
  assert.equal((await request(path + '/activate', admin, { token: preview.token })).status, 409, 'changed plans invalidate preview');
  preview = await request(path + '/preview');
  const active = await request(path + '/activate', admin, { token: preview.token });
  assert.equal(active.status, 200, JSON.stringify(active.error));
  assert.equal(active.item.status, 'active');
  // Editing a fee plan must not rewrite rates of an already approved schedule.
  await request(`/fees/plans/${plan.item.id}`, admin, { ...planBody, items: [{ feeType: tuition.id, amount: 2000 }, { feeType: transport.id, amount: 900, optional: true }, { feeType: annual.id, amount: 5000 }] }, 'PUT');
  const schedule = await BillingSchedule.findById(created.item.id);
  await Promise.all([0, 1].map(() => generateScheduleInvoices(schedule, new Date('2030-02-01T06:00:00Z'))));
  const bills = await Invoice.find({ billingSchedule: schedule.id });
  assert.equal(bills.length, 4);
  assert.ok(bills.every((bill) => !bill.items.some((item) => String(item.feeStructure) === annual.id)));
  const first = bills.find((bill) => String(bill.student) === learners[0].id);
  assert.equal(first.totalAmount, 1600);
  assert.equal(first.discountAmount, 200);
  assert.equal(schoolDate(first.dueDate), '2030-01-10');
  assert.equal((await request(path + '/status', admin, { status: 'paused' })).item.status, 'paused');
  await runRecurringBilling(new Date('2030-03-01'));
  assert.equal(await Invoice.countDocuments({ billingSchedule: schedule.id }), 4);
  const duplicate = await request('/fees/schedules', admin, { ...body, name: 'Duplicate schedule' });
  const duplicatePreview = await request(`/fees/schedules/${duplicate.item.id}/preview`);
  assert.equal((await request(`/fees/schedules/${duplicate.item.id}/activate`, admin, { token: duplicatePreview.token })).status, 409);
  const annualSchedule = await request('/fees/schedules', admin, { ...body, name: 'Annual development fee', feeTypes: [annual.id],
    frequency: 'one_time', startDate: '2030-01-01', endDate: '2030-01-01', optionalAssignments: [], concessions: [] });
  const annualPreview = await request(`/fees/schedules/${annualSchedule.item.id}/preview`);
  assert.equal((await request(`/fees/schedules/${annualSchedule.item.id}/activate`, admin, { token: annualPreview.token })).status, 200, 'distinct components may have independent schedules');
  await generateScheduleInvoices(await BillingSchedule.findById(annualSchedule.item.id), new Date('2030-01-01T06:00:00Z'));
  assert.equal(await Invoice.countDocuments({ billingSchedule: annualSchedule.item.id }), 2);
  assert.equal((await request('/fees/schedules', admin, { ...body, endDate: '2031-01-01' })).status, 400);
  assert.equal((await request('/fees/schedules', admin, { ...body, students: [students[0].id] })).status, 400);
});

test('approved refunds, waivers and cancellations reconcile receipts, student ledger and finance', async () => {
  const { FeeAdjustment } = await import('../src/models/FeeWorkflow.js');
  const bill = await createInvoice(invoiceBody(students[2], 1000));
  const paid = await request('/fees/payments', admin, { invoice: bill.id, amount: 600, method: 'bank', transactionRef: 'TEST-BANK' });
  assert.equal(paid.status, 201);
  assert.match(paid.item.receiptNo, /^REC-\d+$/);
  const totalsBefore = (await request('/finance/summary')).summary.income.fees;
  const refund = await request('/fees/adjustments', admin, { invoice: bill.id, payment: paid.item.id, type: 'refund', amount: 100, reason: 'Bank transfer returned to parent' });
  assert.equal(refund.status, 201);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 600, 'pending refunds do not affect balances');
  const accountant = await User.findOne({ role: 'accountant' });
  assert.equal((await request(`/fees/adjustments/${refund.item.id}/review`, accountant, { decision: 'approved', note: 'Checked receipt' })).status, 403);
  const approved = await request(`/fees/adjustments/${refund.item.id}/review`, admin, { decision: 'approved', note: 'Returned outside the app and verified' });
  assert.equal(approved.status, 200);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 500);
  assert.equal((await Payment.findById(paid.item.id)).refundedAmount, 100);
  assert.equal((await request('/finance/summary')).summary.income.fees, totalsBefore - 100);
  assert.equal((await request(`/fees/adjustments/${refund.item.id}/review`, admin, { decision: 'approved', note: 'Attempt twice' })).status, 409);
  const waiver = await request('/fees/adjustments', admin, { invoice: bill.id, type: 'waiver', amount: 500, reason: 'Principal approved hardship waiver' });
  assert.equal((await request(`/fees/adjustments/${waiver.item.id}/review`, admin, { decision: 'approved', note: 'Verified principal approval' })).status, 200);
  const saved = await Invoice.findById(bill.id);
  assert.equal(saved.status, 'paid'); assert.equal(saved.balance, 0);
  assert.equal((await request('/fees/payments', admin, { invoice: bill.id, amount: 1 })).status, 400);
  const account = await request(`/fees/accounts/${students[2].id}`);
  assert.equal(account.status, 200);
  assert.equal(account.ledger.at(-1).balance, account.totals.due);
  assert.ok(account.adjustments.some((entry) => entry.type === 'refund'));
  assert.equal((await request(`/fees/accounts/${students[2].id}`, studentUser)).status, 403);
  const unpaid = await createInvoice(invoiceBody(students[2], 123));
  const cancel = await request('/fees/adjustments', admin, { invoice: unpaid.id, type: 'cancellation', amount: 0, reason: 'Invoice created in error' });
  assert.equal((await request(`/fees/adjustments/${cancel.item.id}/review`, admin, { decision: 'approved', note: 'Cancellation confirmed' })).status, 200);
  assert.equal((await Invoice.findById(unpaid.id)).balance, 0);
  assert.equal((await request('/fees/payments', admin, { invoice: unpaid.id, amount: 1 })).status, 400);
  assert.equal(await FeeAdjustment.countDocuments({ invoice: unpaid.id, status: 'approved' }), 1);
});


test('one schedule combines monthly, four-monthly and one-time fees without duplicate charges', async () => {
  const { AcademicYear, Class } = await import('../src/models/Academic.js');
  const { BillingSchedule } = await import('../src/models/FeeWorkflow.js');
  const { generateScheduleInvoices, scheduleDates } = await import('../src/services/feeSchedules.js');
  const year = await AcademicYear.create({ name: { en: '2032' }, startDate: new Date('2032-01-01'), endDate: new Date('2032-12-31') });
  const grade = await Class.create({ name: { en: 'Mixed timing' }, academicYear: year.id });
  const student = await Student.create({ name: { en: 'Mixed learner' }, admissionNo: 'MIXED', class: grade.id, academicYear: year.id, admissionDate: new Date('2031-01-01') });
  const fees = await FeeStructure.create(['Tuition', 'Exam', 'Admission'].map((en) => ({ name: { en }, amount: 100 })));
  const plan = await request('/fees/plans', admin, { name: { en: 'Mixed plan' }, class: grade.id, academicYear: year.id,
    items: fees.map((fee, i) => ({ feeType: fee.id, amount: [800, 500, 1000][i] })) });
  const body = { name: 'All fees', plan: plan.item.id, feeTypes: fees.map((fee) => fee.id), students: [student.id],
    startDate: '2032-01-31', endDate: '2032-12-31', frequency: 'monthly', dueDays: 9,
    componentRules: fees.map((fee, i) => ({ feeType: fee.id, startDate: '2032-01-31', intervalMonths: [1, 4, 0][i] })),
    concessions: [{ student: student.id, feeType: fees[1].id, mode: 'fixed', value: 100, reason: 'Exam concession only' }] };
  for (const componentRules of [body.componentRules.slice(1), [...body.componentRules, body.componentRules[0]],
    body.componentRules.map((rule) => ({ ...rule, intervalMonths: 1.5 })),
    body.componentRules.map((rule) => ({ ...rule, startDate: '2033-01-01' }))]) {
    assert.equal((await request('/fees/schedules', admin, { ...body, componentRules })).status, 400);
  }
  const created = await request('/fees/schedules', admin, body);
  assert.equal(created.status, 201, JSON.stringify(created));
  const path = `/fees/schedules/${created.item.id}`;
  const preview = await request(path + '/preview');
  assert.equal(preview.summary.invoiceCount, 12);
  assert.equal(preview.summary.total, 11800); // 12*800 + 3*(500-100) + 1000
  assert.equal(preview.rows[0].invoices[0].totalAmount, 2200);
  assert.equal(preview.rows[0].invoices[1].totalAmount, 800);
  assert.equal(preview.rows[0].invoices[1].date, '2032-02-29');
  assert.equal((await request(path + '/activate', admin, { token: preview.token })).status, 200);
  const schedule = await BillingSchedule.findById(created.item.id);
  await Promise.all([0, 1].map(() => generateScheduleInvoices(schedule, new Date('2032-12-31T06:00:00Z'))));
  const bills = await Invoice.find({ billingSchedule: schedule.id }).sort({ billingDate: 1 });
  assert.equal(bills.length, 12);
  assert.equal(bills.reduce((sum, bill) => sum + bill.totalAmount, 0), preview.summary.total);
  assert.equal(bills.filter((bill) => bill.items.some((item) => String(item.feeStructure) === fees[2].id)).length, 1);
  assert.deepEqual(bills.filter((bill) => bill.items.some((item) => String(item.feeStructure) === fees[1].id)).map((bill) => bill.billingDate), ['2032-01-31', '2032-05-31', '2032-09-30']);
  assert.deepEqual(scheduleDates({ componentRules: [{ startDate: '2032-04-15', intervalMonths: 4 }], endDate: '2032-12-31' }), ['2032-04-15', '2032-08-15', '2032-12-15']);
  const accountant = await User.findOne({ role: 'accountant' });
  assert.equal((await request(path + '/cancel', accountant, { reason: 'Replace schedule' })).status, 403);
  const payment = await request('/fees/payments', admin, { invoice: bills[0].id, amount: 100 });
  assert.equal(payment.status, 201);
  assert.equal((await request(path + '/cancellation-preview')).paidInvoices, 1);
  assert.equal((await request(path + '/cancel', admin, { reason: 'Replace schedule' })).status, 409);
  assert.equal((await BillingSchedule.findById(schedule.id)).status, 'active');
  const refund = await request('/fees/adjustments', admin, { invoice: bills[0].id, payment: payment.item.id, type: 'refund', amount: 100, reason: 'Return before replacement' });
  assert.equal((await request(`/fees/adjustments/${refund.item.id}/review`, admin, { decision: 'approved', note: 'Return confirmed' })).status, 200);
  assert.equal((await request(path + '/cancel', admin, { reason: 'Replace with corrected schedule' })).status, 200);
  assert.equal(await Invoice.countDocuments({ billingSchedule: schedule.id, status: 'cancelled' }), 12);
  assert.equal((await request(`/fees/accounts/${student.id}`)).totals.due, 0);
  assert.equal((await request(`/fees/accounts/${student.id}`)).ledger.at(-1).balance, 0);
  assert.equal((await request(path + '/status', admin, { status: 'active' })).status, 409);
  assert.equal((await request(path + '/cancel', admin, { reason: 'Repeat cancellation' })).status, 409);
  await generateScheduleInvoices(schedule, new Date('2033-01-01')); // stale worker snapshot
  assert.equal(await Invoice.countDocuments({ billingSchedule: schedule.id, status: { $ne: 'cancelled' } }), 0);
  const replacement = await request('/fees/schedules', admin, { ...body, name: 'Replacement' });
  const replacementPath = `/fees/schedules/${replacement.item.id}`;
  const replacementPreview = await request(replacementPath + '/preview');
  assert.equal((await request(replacementPath + '/activate', admin, { token: replacementPreview.token })).status, 200);
  const replacementSchedule = await BillingSchedule.findById(replacement.item.id);
  await Promise.all([
    generateScheduleInvoices(replacementSchedule, new Date('2032-12-31T06:00:00Z')),
    request(replacementPath + '/cancel', admin, { reason: 'Concurrent cancellation' }).then((result) => assert.equal(result.status, 200)),
  ]);
  assert.equal(await Invoice.countDocuments({ billingSchedule: replacement.item.id, status: { $ne: 'cancelled' } }), 0);

});


test('payment corrections require approval and reconcile receipts, balances and finance', async () => {
  const accountant = await User.findOne({ role: 'accountant' });
  const bill = await createInvoice(invoiceBody(students[0], 1000));
  const key = 'a0a0a0a0-1234-4123-8123-123456789abc';
  const paid = await request('/fees/payments', admin, { invoice: bill.id, amount: 300, idempotencyKey: key });
  assert.equal(paid.status, 201);
  const before = (await request('/finance/summary')).summary.income.fees;
  const body = { invoice: bill.id, payment: paid.item.id, type: 'payment_correction', amount: 500, reason: 'Actually received 500, entered 300' };
  assert.equal((await request('/fees/adjustments', studentUser, body)).status, 403);
  const correction = await request('/fees/adjustments', accountant, body);
  assert.equal(correction.status, 201);
  assert.equal((await Payment.findById(paid.item.id)).amount, 300);
  const path = `/fees/adjustments/${correction.item.id}/review`;
  assert.equal((await request(path, accountant, { decision: 'approved', note: 'Verified cash' })).status, 403);
  const stale = await request('/fees/adjustments', accountant, { ...body, amount: 450 });
  assert.equal((await request(path, admin, { decision: 'approved', note: 'Cash receipt verified' })).status, 200);
  const saved = await Payment.findById(paid.item.id);
  assert.equal(saved.amount, 500); assert.equal(saved.originalAmount, 300);
  assert.equal(saved.receiptNo, paid.item.receiptNo);
  assert.equal(saved.corrections.length, 1);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 500);
  assert.equal((await request('/finance/summary')).summary.income.fees, before + 200);
  assert.equal((await request(path, admin, { decision: 'approved', note: 'Duplicate approval' })).status, 409);
  assert.equal((await request(`/fees/adjustments/${stale.item.id}/review`, admin, { decision: 'approved', note: 'Stale correction' })).status, 409);
  assert.equal((await request('/fees/payments', admin, { invoice: bill.id, amount: 300, idempotencyKey: key })).status, 201);
  assert.equal(await Payment.countDocuments({ invoice: bill.id }), 1);
  assert.equal((await request('/fees/adjustments', accountant, { ...body, amount: 1200 })).status, 400);
  const lower = await request('/fees/adjustments', accountant, { ...body, amount: 200 });
  assert.equal((await request(`/fees/adjustments/${lower.item.id}/review`, admin, { decision: 'approved', note: 'Lower amount verified' })).status, 200);
  assert.equal((await Invoice.findById(bill.id)).paidAmount, 200);
  const account = await request(`/fees/accounts/${students[0].id}`);
  assert.equal(account.ledger.at(-1).balance, account.totals.due);
  const refund = await request('/fees/adjustments', admin, { invoice: bill.id, payment: paid.item.id, type: 'refund', amount: 100, reason: 'Returned actual money' });
  assert.equal((await request(`/fees/adjustments/${refund.item.id}/review`, admin, { decision: 'approved', note: 'Return confirmed' })).status, 200);
  assert.equal((await request('/fees/adjustments', accountant, { ...body, amount: 50 })).status, 400);
});

test('net profit excludes capital, honors categories, snapshots allocations and prevents repeated or overlapping distributions', async () => {
  const { Partner, PartnerDeposit } = await import('../src/models/Partner.js');
  const { FinanceCategory, SalaryPayment } = await import('../src/models/Finance.js');
  const { FeeAdjustment } = await import('../src/models/FeeWorkflow.js');
  const { ProfitDistribution } = await import('../src/models/ProfitDistribution.js');
  const { parseDay } = await import('../src/utils/financeDates.js');
  await PartnerDeposit.deleteMany({});
  await Partner.deleteMany({});
  const day = parseDay('2018-01-15');
  const [inc, excludedInc, exp, excludedExp] = await FinanceCategory.create([
    { type: 'income', name: { en: 'Profit included income' } },
    { type: 'income', name: { en: 'Profit excluded income' } },
    { type: 'expense', name: { en: 'Profit included expense' } },
    { type: 'expense', name: { en: 'Profit excluded expense' } },
  ]);
  await Income.create([{ category: inc.id, amount: 1000, date: day }, { category: excludedInc.id, amount: 200, date: day }, { amount: 50, date: day }]);
  await Expense.create([{ category: exp.id, amount: 100, date: day }, { category: excludedExp.id, amount: 30, date: day }, { amount: 20, date: day }]);
  await SalaryPayment.create({ staff: new mongoose.Types.ObjectId(), month: '2018-01', basic: 80, net: 80, paidAt: day });
  const bill = await createInvoice(invoiceBody(students[0], 300));
  const paid = await Payment.create({ invoice: bill.id, student: students[0].id, amount: 300, paidAt: day });
  await FeeAdjustment.create({ invoice: bill.id, student: students[0].id, payment: paid.id, type: 'refund', status: 'approved', amount: 50, reason: 'Test refund', requestedBy: admin.id, reviewedBy: admin.id, reviewedAt: day });
  const config = { from: '2018-01-01', to: '2018-01-31', incomeCategories: [inc.id, 'fees'], expenseCategories: [exp.id, 'salaries'] };
  const options = await request('/finance/profit/options');
  assert.equal(options.status, 200);
  assert.ok(!options.income.some((c) => c.id === 'partner-investment'));
  const accountant = await User.findOne({ role: 'accountant' });
  assert.equal((await request('/finance/profit/preview', accountant, config)).status, 403);
  assert.equal((await request('/finance/profit/preview', studentUser, config)).status, 403);
  assert.equal((await request('/finance/profit/preview', admin, { ...config, incomeCategories: ['partner-investment'] })).status, 400);
  assert.equal((await request('/finance/profit/preview', admin, { ...config, incomeCategories: [exp.id] })).status, 400);
  assert.equal((await request('/finance/profit/preview', admin, { ...config, to: '2018-02-30' })).status, 400);
  const preview = (await request('/finance/profit/preview', admin, config)).report;
  assert.equal(preview.income, 1250);
  assert.equal(preview.expense, 180);
  assert.equal(preview.netProfit, 1070);
  assert.equal((await request('/finance/profit/distributions', admin, { ...config, previewHash: preview.previewHash, requestKey: randomUUID() })).status, 400, 'no capital cannot be distributed');
  const partners = await Partner.create(['Profit A', 'Profit B', 'Zero capital'].map((name) => ({ name, phone: '01700000000', address: 'Dhaka' })));
  await PartnerDeposit.create([10000000, 5000000].map((amountCents, i) => ({ partner: partners[i].id, amountCents, date: day, requestKey: randomUUID(), recordedBy: admin.id })));
  const selected = (await request('/finance/profit/preview', admin, config)).report;
  assert.equal(selected.netProfit, 1070, '150000 of capital must not count as profit income');
  assert.equal(selected.allocations.find((p) => p.id === partners[0].id).profit, 713.33);
  assert.equal(selected.allocations.find((p) => p.id === partners[1].id).profit, 356.67);
  assert.equal(selected.allocations.find((p) => p.id === partners[2].id).profit, 0);
  const all = (await request('/finance/profit/preview', admin, { ...config, incomeCategories: options.income.map((c) => c.id), expenseCategories: options.expense.map((c) => c.id) })).report;
  assert.equal(all.income, 1500);
  assert.equal(all.expense, 230);
  assert.equal(all.netProfit, 1270);
  const lossConfig = { ...config, incomeCategories: [] };
  const loss = (await request('/finance/profit/preview', admin, lossConfig)).report;
  assert.equal(loss.netProfit, -180);
  assert.equal((await request('/finance/profit/distributions', admin, { ...lossConfig, previewHash: loss.previewHash, requestKey: randomUUID() })).status, 400);
  await Income.create({ category: inc.id, amount: 1, date: day });
  assert.equal((await request('/finance/profit/distributions', admin, { ...config, previewHash: selected.previewHash, requestKey: randomUUID() })).status, 409, 'stale financial preview must be recalculated');
  const fresh = (await request('/finance/profit/preview', admin, config)).report;
  await PartnerDeposit.create({ partner: partners[1].id, amountCents: 1, date: day, requestKey: randomUUID(), recordedBy: admin.id });
  assert.equal((await request('/finance/profit/distributions', admin, { ...config, previewHash: fresh.previewHash, requestKey: randomUUID() })).status, 409, 'capital changes must invalidate preview');
  const ready = (await request('/finance/profit/preview', admin, config)).report;
  const body = { ...config, previewHash: ready.previewHash, requestKey: randomUUID() };
  assert.equal((await request('/finance/profit/distributions', accountant, body)).status, 403);
  const attempts = await Promise.all([0, 1].map(() => request('/finance/profit/distributions', admin, body)));
  assert.ok(attempts.every((r) => r.status === 201), JSON.stringify(attempts));
  assert.equal(attempts[0].item.id, attempts[1].item.id);
  assert.equal(await ProfitDistribution.countDocuments(), 1);
  assert.equal(ready.allocations.reduce((sum, p) => sum + Math.round(p.profit * 100), 0), 107100);
  assert.equal((await request('/finance/profit/distributions', admin, { ...body, requestKey: randomUUID() })).status, 409);
  const overlapConfig = { ...config, from: '2018-01-15', to: '2018-02-01' };
  const overlap = await request('/finance/profit/preview', admin, overlapConfig);
  assert.equal(overlap.alreadyDistributed, true);
  assert.equal((await request('/finance/profit/distributions', admin, { ...overlapConfig, previewHash: overlap.report.previewHash, requestKey: randomUUID() })).status, 409);
  await PartnerDeposit.create({ partner: partners[1].id, amountCents: 9000000, date: day, requestKey: randomUUID(), recordedBy: admin.id });
  const detail = await request(`/partners/${partners[0].id}`);
  assert.equal(detail.profits.length, 1);
  assert.equal(detail.profits[0].profit, ready.allocations.find((p) => p.id === partners[0].id).profit, 'past shares must not change after later deposits');
  assert.deepEqual((await request('/finance/profit/distributions')).items[0].report, ready);
  assert.equal((await request('/finance/profit/distributions', admin, body)).item.id, attempts[0].item.id, 'retry returns original even after capital changes');
  // Two different preview keys racing on an undistributed period must yield one record.
  const next = { ...config, from: '2018-02-01', to: '2018-02-28' };
  await Income.create({ category: inc.id, amount: 100, date: parseDay('2018-02-10') });
  const nextPreview = (await request('/finance/profit/preview', admin, next)).report;
  const raced = await Promise.all([0, 1].map(() => request('/finance/profit/distributions', admin, { ...next, previewHash: nextPreview.previewHash, requestKey: randomUUID() })));
  assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await ProfitDistribution.countDocuments(), 2);
});
