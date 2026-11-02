import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

let mongo, server, base, m, admin, accountant, teacher, signToken, today;
const privateDir = path.resolve('../.data', `qa-controls-${randomUUID()}`);
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('financial_controls'); process.env.JWT_SECRET = 'isolated-controls-test'; process.env.NODE_ENV = 'test'; process.env.BACKUP_DIR = path.join(privateDir, 'backups');
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = await import('../src/app.js'); m = mongoose.models;
  ({ signToken } = await import('../src/utils/jwt.js')); const { schoolDate } = await import('../src/utils/financeDates.js'); today = schoolDate();
  await Promise.all(Object.values(m).map((model) => model.init()));
  const user = (role) => m.User.create({ name: { en: role }, email: `${role}@controls.test`, role, passwordHash: 'unused' });
  admin = await user('admin'); accountant = await user('accountant'); teacher = await user('teacher');
  server = createApp().listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 120000 });
beforeEach(async () => { for (const Model of Object.values(m)) if (Model.modelName !== 'User') await Model.deleteMany({}); });
after(async () => { if (server) await new Promise((r) => server.close(r)); await mongoose.disconnect(); await mongo?.stop(); });
async function request(route, body, user = admin, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + route, { method, headers: { Authorization: `Bearer ${signToken({ sub: user.id })}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, ...await r.json() };
}
const entry = (extra = {}) => ({ amount: 100, reference: `INV-${randomUUID()}`, date: today, requestKey: randomUUID(), ...extra });
async function correction(type, targetId, extra = {}) {
  return request('/finance/corrections', { targetType: type, targetId, operation: 'reverse', reason: 'Original entry was recorded incorrectly', requestKey: randomUUID(), ...extra }, accountant);
}
const approve = (item) => request(`/finance/corrections/${item.id}/review`, { decision: 'approved', note: 'Checked original documents and approved' });

test('duplicate document warnings allow legitimate repeats only after explicit acknowledgment and protect retries', async () => {
  const original = await request('/finance/income', entry({ reference: 'INV 001', source: 'Vendor A' })); assert.equal(original.status, 201);
  const repeat = entry({ reference: 'inv 001', source: 'Vendor B', amount: 200 });
  const warning = await request('/finance/income', repeat); assert.equal(warning.status, 409); assert.equal(warning.error.details.code, 'DUPLICATE_DOCUMENT');
  assert.equal(warning.error.details.matches[0].party, 'Vendor A');
  const confirmed = await request('/finance/income', { ...repeat, duplicateConfirmed: true }); assert.equal(confirmed.status, 201); assert.equal(confirmed.item.duplicateAcknowledged, true);
  const retry = await request('/finance/income', { ...repeat, duplicateConfirmed: true }); assert.equal(retry.item.id, confirmed.item.id); assert.equal(await m.Income.countDocuments(), 2);
  const concurrent = await Promise.all([0, 1].map(() => request('/finance/expenses', entry({ reference: 'VCH-RACE' }))));
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await request('/finance/document-check?type=income&reference=INV%20001')).matches.length, 2);
});

test('replacement requires approval, retains original values, and reconciles balance, profit, lists and reports', async () => {
  const original = await request('/finance/income', entry());
  assert.equal((await request(`/finance/income/${original.item.id}`, { amount: 60, reference: 'CHANGED' }, admin, 'PUT')).status, 409);
  assert.equal((await request(`/finance/income/${original.item.id}`, undefined, admin, 'DELETE')).status, 409);
  const pending = await correction('income', original.item.id, { operation: 'replace', proposed: entry({ amount: 60, reference: original.item.reference }) }); assert.equal(pending.status, 201);
  assert.equal((await request('/finance/balance')).currentBalance, 100);
  assert.equal((await request(`/finance/corrections/${pending.item.id}/review`, { decision: 'approved', note: 'Not permitted' }, accountant)).status, 403);
  assert.equal((await approve(pending.item)).status, 200);
  const unchanged = await m.Income.findById(original.item.id); assert.equal(unchanged.amount, 100); assert.equal(unchanged.reference, original.item.reference); assert.equal(unchanged.isReversed, true);
  assert.equal((await request('/finance/balance')).currentBalance, 60);
  assert.equal((await request('/finance/summary')).summary.income.total, 60);
  const analytics = await request('/finance/analytics'); assert.equal(analytics.monthly.reduce((n, r) => n + r.income, 0), 60);
  assert.equal((await request('/finance/income')).items.reduce((n, r) => n + r.amount, 0), 60);
  assert.equal((await request('/finance/transactions')).transactions.reduce((n, r) => n + r.amount, 0), 60);
  const preview = await request('/finance/profit/preview', { from: today.slice(0, 7) + '-01', to: today, incomeCategories: ['uncategorized-income'], expenseCategories: [] }); assert.equal(preview.report.netProfit, 60);
  await approve(pending.item); assert.equal(await m.Income.countDocuments(), 2, 'review retries cannot create a second replacement');
});

test('rejected reversals do not change totals; approved expense reversals are posted once under concurrent approval', async () => {
  await request('/finance/income', entry()); const expense = await request('/finance/expenses', entry({ amount: 40 }));
  const first = await correction('expense', expense.item.id);
  assert.equal((await request(`/finance/corrections/${first.item.id}/review`, { decision: 'rejected', note: 'Invoice is correct' })).status, 200);
  assert.equal((await request('/finance/balance')).currentBalance, 60);
  const second = await correction('expense', expense.item.id); assert.equal(second.status, 201);
  const attempts = await Promise.all([0, 1].map(() => approve(second.item))); assert.ok(attempts.every((r) => r.status === 200), JSON.stringify(attempts));
  assert.equal((await request('/finance/balance')).currentBalance, 100);
  assert.equal((await request('/finance/summary')).summary.expense.total, 0);
  assert.equal((await request('/finance/expenses')).items.reduce((n, r) => n + r.amount, 0), 0);
  assert.equal(await m.FinancialCorrection.countDocuments({ status: 'approved' }), 1);
  assert.equal((await correction('expense', expense.item.id)).status, 409);
});

test('salary reversals preserve history and allow the correct payment for the same staff/month', async () => {
  const staff = await m.Teacher.create({ name: { en: 'Staff' }, employeeId: 'SAL-CONTROL' });
  const body = { staff: staff.id, month: today.slice(0, 7), basic: 100, paidAt: today };
  const paid = await request('/finance/salaries', body); assert.equal(paid.status, 201);
  const reverse = await correction('salary', paid.item.id); assert.equal((await approve(reverse.item)).status, 200);
  assert.equal((await request('/finance/salaries', { ...body, basic: 80 })).status, 201);
  assert.equal((await request('/finance/salaries')).items.reduce((n, r) => n + r.net, 0), 80);
  assert.equal((await request('/finance/summary')).summary.expense.salary, 80);
  assert.equal((await m.SalaryPayment.findById(paid.item.id)).net, 100);
});

test('partner and profit-payment reversals update capital and unpaid profit without rewriting saved allocations', async () => {
  const p = await m.Partner.create({ name: 'Investor', phone: '01700000000', address: 'Dhaka' });
  const deposit = await m.PartnerDeposit.create({ partner: p.id, amountCents: 100000, date: today, requestKey: randomUUID(), recordedBy: admin.id });
  await request('/finance/income', entry());
  const distribution = await m.ProfitDistribution.create({ from: today, to: today, previewHash: 'saved', requestKey: randomUUID(), recordedBy: admin.id, report: { allocations: [{ id: p.id, name: p.name, profit: 100, percentage: 100, capital: 1000 }] } });
  const payment = await request('/finance/balance/profit-payments', { distribution: distribution.id, partner: p.id, amount: 20, date: today, method: 'cash', requestKey: randomUUID() }); assert.equal(payment.status, 201);
  assert.equal((await correction('partnerDeposit', deposit.id)).status, 403);
  const capitalReverse = await request('/finance/corrections', { targetType: 'partnerDeposit', targetId: deposit.id, operation: 'reverse', reason: 'Duplicate capital entry', requestKey: randomUUID() });
  assert.equal((await approve(capitalReverse.item)).status, 200);
  assert.equal((await request('/partners')).items[0].capital, 0);
  const paymentReverse = await request('/finance/corrections', { targetType: 'profitPayment', targetId: payment.item.id, operation: 'reverse', reason: 'Payment recorded in error', requestKey: randomUUID() });
  assert.equal((await approve(paymentReverse.item)).status, 200);
  const balance = await request('/finance/balance'); assert.equal(balance.currentBalance, 100); assert.equal(balance.unpaidProfit, 100);
  assert.equal((await m.ProfitDistribution.findById(distribution.id)).report.allocations[0].profit, 100);
  assert.equal((await request('/finance/balance/profit-payments', { distribution: distribution.id, partner: p.id, amount: 100, date: today, method: 'cash', requestKey: randomUUID() })).status, 201);
});

test('backup restore preserves BSON types, indexes, uploads and refuses overwrite or corrupted files', async () => {
  const { createBackup, restoreBackup, backupIfDue } = await import('../src/services/backups.js');
  const { ObjectId, Decimal128, Long } = mongoose.mongo.BSON;
  const records = mongoose.connection.db.collection('bson_restore_check');
  const original = { _id: new ObjectId(), date: new Date(), decimal: Decimal128.fromString('12.34'), long: Long.fromString('9007199254740993'), uniqueCode: 'ONE' };
  await records.insertOne(original); await records.createIndex({ uniqueCode: 1 }, { unique: true });
  const uploads = path.join(privateDir, 'uploads'); await mkdir(uploads, { recursive: true }); await writeFile(path.join(uploads, 'sample.txt'), 'backup attachment');
  const saved = await createBackup(mongoose.connection, { directory: process.env.BACKUP_DIR, uploads });
  assert.equal(await backupIfDue(mongoose.connection, { directory: process.env.BACKUP_DIR, uploads }), null, 'a fresh backup must not be repeated immediately');
  const scheduled = await backupIfDue(mongoose.connection, { directory: process.env.BACKUP_DIR, uploads, now: Date.now() + 25 * 3600000 }); assert.equal(scheduled.kind, 'automatic');
  const source = path.join(process.env.BACKUP_DIR, saved.id), target = await mongoose.createConnection(mongo.getUri('restored_controls')).asPromise();
  try {
    const result = await restoreBackup(target, source, { uploads: path.join(privateDir, 'restored-uploads') }); assert.ok(result.documents > 0);
    const restored = await target.db.collection('bson_restore_check').findOne();
    assert.equal(restored._id.toString(), original._id.toString()); assert.equal(+restored.date, +original.date); assert.equal(restored.decimal.toString(), '12.34'); assert.equal(restored.long.toString(), '9007199254740993');
    assert.ok((await target.db.collection('bson_restore_check').indexes()).some((r) => r.unique));
    assert.equal(await readFile(path.join(privateDir, 'restored-uploads', 'sample.txt'), 'utf8'), 'backup attachment');
    await assert.rejects(restoreBackup(target, source, { uploads: path.join(privateDir, 'restored-uploads') }), /empty database/);
  } finally { await target.close(); }
  await writeFile(path.join(source, 'database.ejson.gz'), 'corrupted');
  const empty = await mongoose.createConnection(mongo.getUri('corrupt_restore_check')).asPromise();
  try { await assert.rejects(restoreBackup(empty, source), /checksum/); assert.equal((await empty.db.listCollections().toArray()).length, 0); } finally { await empty.close(); }
  assert.equal((await request('/backups', undefined, accountant)).status, 403);
  assert.equal((await request('/finance/corrections', undefined, teacher)).status, 403);
});
