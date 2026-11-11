import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongo, server, base, admin, accountant, studentUser, models, signToken, parseDay, schoolDate;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('cash_balance_tests');
  process.env.JWT_SECRET = 'isolated-cash-balance-test-secret';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = await import('../src/app.js');
  models = mongoose.models;
  ({ signToken } = await import('../src/utils/jwt.js'));
  ({ parseDay, schoolDate } = await import('../src/utils/financeDates.js'));
  await Promise.all(Object.values(models).map((model) => model.init()));
  admin = await models.User.create({ name: { en: 'Administrator' }, email: 'admin@balance.test', role: 'admin', passwordHash: 'unused' });
  accountant = await models.User.create({ name: { en: 'Accountant' }, email: 'accountant@balance.test', role: 'accountant', passwordHash: 'unused' });
  studentUser = await models.User.create({ name: { en: 'Student' }, email: 'student@balance.test', role: 'student', passwordHash: 'unused' });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 120000 });
beforeEach(async () => {
  for (const model of Object.values(models)) if (model.modelName !== 'User') await model.deleteMany({});
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});
async function request(path, body, user = admin, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${signToken({ sub: user.id })}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, ...await r.json() };
}
async function partner(name = 'Investor') {
  return models.Partner.create({ name, phone: '01700000000', address: 'Dhaka' });
}
async function capital(p, amountCents, day = schoolDate()) {
  return models.PartnerDeposit.create({ partner: p.id, amountCents, date: parseDay(day), requestKey: randomUUID(), recordedBy: admin.id });
}
async function allocation() {
  const a = await partner('Investor A'), b = await partner('Investor B');
  await capital(a, 50000);
  await models.Income.create({ amount: 100, date: parseDay(schoolDate()) });
  const distribution = await models.ProfitDistribution.create({ from: schoolDate(), to: schoolDate(), requestKey: randomUUID(), previewHash: 'test', recordedBy: admin.id,
    report: { allocations: [{ id: a.id, name: a.name, profit: 60 }, { id: b.id, name: b.name, profit: 40 }], netProfit: 100 } });
  return { a, b, distribution, body: { distribution: distribution.id, partner: a.id, date: schoolDate(), amount: 20, method: 'bank', reference: 'BANK-123', requestKey: randomUUID() } };
}

test('historical salary months and separately dated allowances count once in expenses and cash balance', async () => {
  const {Teacher,SalaryPayment,Expense,FinanceCategory}=models;
  const teacher=await Teacher.create({employeeId:'PAYROLL-QA',name:{en:'Payroll QA'}});
  const category=await FinanceCategory.create({type:'expense',name:{en:'Teacher coaching allowances'}});
  const paidAt=parseDay('2026-07-05');
  const salary=await SalaryPayment.create({staff:teacher.id,month:'2026-06',basic:3000,allowances:4000,deductions:0,net:7000,paidAt,
    method:'unknown',historicalImport:true,importKey:'qa-teacher-payroll-2026-06',recordedBy:admin.id});
  await assert.rejects(SalaryPayment.create({staff:teacher.id,month:'2026-06',net:7000,paidAt}),e=>e.code===11000);
  await assert.rejects(SalaryPayment.create({staff:teacher.id,month:'2026-07',net:7000,paidAt,importKey:salary.importKey}),e=>e.code===11000);
  await Expense.create({staff:teacher.id,category:category.id,payee:'Payroll QA',amount:6100,date:paidAt,method:'unknown',historicalImport:true,
    coveredPeriod:'2026-04 / 2026-05',generationKey:'qa-coaching-2026-apr-may'});
  const balance=await request('/finance/balance');assert.equal(balance.currentBalance,-13100);
  const salaries=await request('/finance/salaries?month=2026-06');assert.equal(salaries.total,1);assert.equal(salaries.items[0].method,'unknown');
  const summary=await request('/finance/summary?from=2026-07-01&to=2026-07-31');
  assert.equal(summary.summary.expense.salary,7000);assert.equal(summary.summary.expense.general,6100);assert.equal(summary.summary.expense.total,13100);
  assert.equal((await request('/finance/summary?from=2026-06-01&to=2026-06-30')).summary.expense.total,0,'Salary month is not its payment date');
});

test('undated historical expenses and capital returns stay separate from dated cash and operating profit', async () => {
  const {Expense,PartnerCapitalReturn}=models;
  await assert.rejects(Expense.create({amount:5000,date:null}),/date/);
  await Expense.create({amount:5000,date:null,historicalImport:true,coveredPeriod:'2026-08',method:'unknown',generationKey:'QA-UNDATED-EXPENSE',internalImportRef:'QA-INTERNAL',reference:''});
  await PartnerCapitalReturn.create({recipientName:'Former partner',generationKey:'QA-CAPITAL-RETURN-UNDATED',amountCents:100000,coveredPeriod:'2026-09',historicalImport:true,paidAt:null,recordedBy:admin.id});
  await PartnerCapitalReturn.create({recipientName:'Other former partner',generationKey:'QA-CAPITAL-RETURN-DATED',amountCents:200000,coveredPeriod:'2026-09',paidAt:parseDay('2026-10-05'),reference:'000017',recordedBy:admin.id});
  const balance=await request('/finance/balance');
  assert.equal(balance.currentBalance,-2000);
  assert.equal(balance.undatedExpensePayments,5000);
  assert.equal(balance.undatedCapitalReturns,1000);
  assert.equal(balance.returnedCapitalTotal,3000);
  assert.equal(balance.capitalReturns.length,2);
  const all=await request('/finance/summary');assert.equal(all.summary.expense.total,5000,'Capital returns must not be operating expenses');
  const dated=await request('/finance/summary?from=2026-01-01&to=2026-12-31');assert.equal(dated.summary.expense.total,0);
  const analytics=await request('/finance/analytics');assert.equal(analytics.monthly.find(m=>m.label==='Undated').expense,5000);
  const expense=await Expense.findOne({generationKey:'QA-UNDATED-EXPENSE'});assert.equal(expense.reference,'');assert.equal(expense.date,null);
});

test('current balance includes prior funds, capital and paid activity; excludes unpaid invoices, unapproved refunds and future activity', async () => {
  const day = parseDay(schoolDate()), old = parseDay('2010-01-02');
  await models.OpeningBalance.create({ key: 'opening', amountCents: 10000, date: parseDay('2010-01-01'), note: 'Funds held before records', recordedBy: admin.id });
  await models.Income.create({ amount: 1000.10, date: old });
  const p = await partner(); await capital(p, 100000);
  const learner = await models.Student.create({ name: { en: 'Learner' }, admissionNo: 'BAL-1' });
  const bill = await models.Invoice.create({ invoiceNo: 'BAL-INV', student: learner.id, totalAmount: 99999 });
  const payment = await models.Payment.create({ invoice: bill.id, student: learner.id, amount: 500.20, paidAt: day });
  await models.Expense.create({ amount: 200.30, date: day });
  await models.SalaryPayment.create({ staff: new mongoose.Types.ObjectId(), month: schoolDate().slice(0, 7), net: 100.40, paidAt: day });
  await models.FeeAdjustment.create({ invoice: bill.id, payment: payment.id, student: learner.id, type: 'refund', status: 'approved', amount: 50.05, reason: 'Refund paid', requestedBy: admin.id, reviewedAt: day });
  await models.FeeAdjustment.create({ invoice: bill.id, student: learner.id, type: 'refund', status: 'pending', amount: 999, reason: 'Not approved', requestedBy: admin.id });
  await models.Income.create({ amount: 9999, date: parseDay('2099-01-01') });
  await models.Expense.create({ amount: 9999, date: parseDay('2099-01-01') });
  const result = await request(`/finance/balance?from=${schoolDate()}&to=${schoolDate()}`);
  assert.equal(result.status, 200);
  assert.equal(result.currentBalance, 2249.55);
  assert.equal(result.statement.openingBalance, 1100.10);
  assert.equal(result.statement.inflow, 1500.20);
  assert.equal(result.statement.outflow, 350.75);
  assert.equal(result.statement.closingBalance, result.currentBalance);
  assert.equal(result.items.at(-1).balance, 2249.55);
  assert.equal(result.totals.capital, 1000);
  assert.equal(result.totals.refund, -50.05);
  const past = await request('/finance/balance?from=2011-01-01&to=2011-01-31');
  assert.equal(past.currentBalance, 2249.55, 'statement dates cannot change today’s balance');
  assert.equal(past.statement.openingBalance, 1100.10);
  assert.equal(past.statement.closingBalance, 1100.10);
  assert.equal(past.total, 0);
});

test('opening balance is one-time, admin-only, date checked and separate from profit income', async () => {
  await models.Income.create({ amount: 10, date: parseDay('2010-01-10') });
  assert.equal((await request('/finance/balance/opening', { amount: 100, date: '2010-01-11', note: 'Too late' })).status, 400);
  assert.equal((await request('/finance/balance/opening', { amount: 100.001, date: '2010-01-01', note: 'Invalid precision' })).status, 400);
  assert.equal((await request('/finance/balance/opening', { amount: 100, date: '2010-01-01', note: '' })).status, 400);
  assert.equal((await request('/finance/balance/opening', { amount: 100, date: '2010-01-01', note: 'Start' }, accountant)).status, 403);
  assert.equal((await request('/finance/balance/opening', { amount: -5.50, date: '2010-01-01', note: 'Opening overdraft' })).status, 201);
  assert.equal((await request('/finance/balance/opening', { amount: 100, date: '2010-01-01', note: 'Duplicate' })).status, 409);
  assert.equal((await request('/finance/balance')).currentBalance, 4.50);
  assert.equal((await request('/finance/balance', undefined, accountant)).status, 200);
  assert.equal((await request('/finance/balance', undefined, studentUser)).status, 403);
  assert.equal((await request('/finance/balance?from=2010-02-30')).status, 400);
  assert.equal((await request('/finance/balance?from=2010-02-01&to=2010-01-01')).status, 400);
  assert.equal((await request('/finance/balance?to=2099-01-01')).status, 400);
});

test('balance is derived in integer cents, updates after corrections, preserves negative balances and paginates running totals', async () => {
  const date = parseDay(schoolDate());
  const row = await models.Income.create({ amount: 0.10, date });
  await models.Income.create({ amount: 0.20, date });
  assert.equal((await request('/finance/balance')).currentBalance, 0.30);
  await models.Expense.create({ amount: 1, date });
  assert.equal((await request('/finance/balance')).currentBalance, -0.70);
  row.amount = 0.50; await row.save();
  const first = await request('/finance/balance?limit=2&page=1');
  const second = await request('/finance/balance?limit=2&page=2');
  assert.equal(first.currentBalance, -0.30);
  assert.equal(second.currentBalance, -0.30);
  assert.equal(first.total, 3);
  assert.equal(second.items.at(-1).balance, -0.30);
  assert.equal(new Set([...first.items, ...second.items].map((p) => p.key)).size, 3);
});

test('profit allocations reserve obligations; actual payments reduce cash exactly once and never reduce operating profit', async () => {
  const { a, body } = await allocation();
  const before = await request('/finance/balance');
  assert.equal(before.currentBalance, 600);
  assert.equal(before.unpaidProfit, 100);
  assert.equal(before.balanceAfterUnpaidProfit, 500);
  const attempts = await Promise.all([0, 1].map(() => request('/finance/balance/profit-payments', body)));
  assert.ok(attempts.every((r) => r.status === 201), JSON.stringify(attempts));
  assert.equal(attempts[0].item.id, attempts[1].item.id);
  const after = await request('/finance/balance');
  assert.equal(after.currentBalance, 580);
  assert.equal(after.unpaidProfit, 80);
  assert.equal(after.balanceAfterUnpaidProfit, 500);
  assert.equal(after.totals['profit-payment'], -20);
  assert.equal(after.items.filter((r) => r.kind === 'profit-payment').length, 1);
  const profile = await request(`/partners/${a.id}`);
  assert.equal(profile.profits[0].paid, 20);
  assert.equal(profile.profits[0].unpaid, 40);
  assert.equal(profile.profitPayments[0].reference, 'BANK-123');
  const profit = await request('/finance/profit/preview', { from: schoolDate().slice(0, 7) + '-01', to: schoolDate(), incomeCategories: ['uncategorized-income'], expenseCategories: [] });
  assert.equal(profit.report.netProfit, 100, 'capital and profit payments do not change operating profit');
  assert.equal((await request('/finance/balance/profit-payments', { ...body, amount: 21 })).status, 409);
});

test('profit payments enforce allocation limits, dates, roles and concurrent overpayment protection', async () => {
  const { body } = await allocation();
  assert.equal((await request('/finance/balance/profit-payments', body, accountant)).status, 403);
  assert.equal((await request('/finance/balance/profit-payments', { ...body, amount: 61 })).status, 400);
  assert.equal((await request('/finance/balance/profit-payments', { ...body, amount: 0 })).status, 400);
  assert.equal((await request('/finance/balance/profit-payments', { ...body, date: '2010-01-01' })).status, 400);
  assert.equal((await request('/finance/balance/profit-payments', { ...body, date: '2099-01-01' })).status, 400);
  assert.equal((await request('/finance/balance/profit-payments', { ...body, partner: new mongoose.Types.ObjectId().toString() })).status, 404);
  const raced = await Promise.all([0, 1].map(() => request('/finance/balance/profit-payments', { ...body, amount: 40, requestKey: randomUUID() })));
  assert.deepEqual(raced.map((r) => r.status).sort(), [201, 400]);
  assert.equal(await models.ProfitPayment.countDocuments(), 1);
  assert.equal((await request('/finance/balance')).currentBalance, 560);
});
