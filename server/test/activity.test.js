import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongo, server, base, User, ActivityLog, signToken, admin, accountant;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('activity_tests');
  process.env.JWT_SECRET = 'isolated-activity-test-secret';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = await import('../src/app.js');
  ({ User } = await import('../src/models/User.js'));
  ({ ActivityLog } = await import('../src/models/ActivityLog.js'));
  ({ signToken } = await import('../src/utils/jwt.js'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  admin = new User({ name: { en: 'System Admin' }, email: 'admin@activity.test', role: 'admin' });
  await admin.setPassword('private-admin-password'); await admin.save();
  accountant = new User({ name: { en: 'Finance Staff' }, email: 'accountant@activity.test', role: 'accountant' });
  await accountant.setPassword('private-accountant-password'); await accountant.save();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 120000 });
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect(); await mongo?.stop();
});
async function request(path, user = admin, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${signToken({ sub: user.id })}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, ...await r.json() };
}

test('only admins can list logs; direct API access is denied for all other roles and anonymous callers', async () => {
  assert.equal((await request('/activity-logs')).status, 200);
  assert.equal((await request('/activity-logs', undefined)).status, 200); // default helper user
  assert.equal((await request('/activity-logs', null)).status, 401);
  for (const role of ['accountant', 'teacher', 'student', 'parent']) {
    const user = role === 'accountant' ? accountant : await User.create({ name: { en: role }, email: `${role}@activity.test`, role, passwordHash: 'unused' });
    assert.equal((await request('/activity-logs', user)).status, 403);
  }
});

test('creates, edits, deletes and rejected financial writes retain actor snapshots and safe record details', async () => {
  const created = await request('/finance/income', accountant, { amount: 123.45, source: 'Donor', reference: '000-INV', note: 'private free text is not copied into logs' });
  assert.equal(created.status, 201);
  let log = await ActivityLog.findOne({ recordId: created.item.id, action: 'create' }).lean();
  assert.equal(String(log.actor), accountant.id);
  assert.equal(log.actorName.en, 'Finance Staff');
  assert.equal(log.actorEmail, accountant.email);
  assert.equal(log.details.amount, 123.45);
  assert.equal(log.details.reference, '000-INV');
  assert.equal(log.details.note, undefined);
  assert.equal((await request(`/finance/income/${created.item.id}`, accountant, { amount: 150, reference: '000-INV-EDIT' }, 'PUT')).status, 409);
  assert.equal((await request(`/finance/income/${created.item.id}`, accountant, undefined, 'DELETE')).status, 409);
  assert.equal(await ActivityLog.countDocuments({ recordId: created.item.id }), 3);
  assert.equal((await request('/finance/expenses', accountant, { amount: 10, reference: ' ' })).status, 400);
  assert.ok(await ActivityLog.exists({ actor: accountant.id, outcome: 'failed', module: 'finance', status: 400 }));
  await User.updateOne({ _id: accountant.id }, { 'name.en': 'Renamed User' });
  log = await ActivityLog.findById(log._id).lean();
  assert.equal(log.actorName.en, 'Finance Staff', 'historic actor name must not change with profile edits');
});

test('login and password-reset events never persist credentials, hashes, tokens, or arbitrary payloads', async () => {
  const login = await request('/auth/login', null, { email: admin.email, password: 'private-admin-password' });
  assert.equal(login.status, 200);
  assert.equal((await request('/auth/login', null, { email: admin.email, password: 'wrong-secret-password' })).status, 401);
  assert.equal((await request(`/users/${accountant.id}/password`, admin, { password: 'new-private-password' })).status, 200);
  const successful = await ActivityLog.findOne({ action: 'login', outcome: 'success' }).lean();
  const failed = await ActivityLog.findOne({ action: 'login', outcome: 'failed' }).lean();
  assert.equal(String(successful.actor), admin.id);
  assert.equal(failed.attemptedEmail, admin.email);
  assert.ok(await ActivityLog.exists({ action: 'password-reset', actor: admin.id, recordId: accountant.id }));
  const serialized = JSON.stringify(await ActivityLog.find().lean());
  for (const secret of ['private-admin-password', 'wrong-secret-password', 'new-private-password', login.token, 'passwordHash', 'private free text is not copied into logs']) assert.ok(!serialized.includes(secret));
});

test('filters and pagination work without logging successful reads; logs have no edit or delete endpoints', async () => {
  const beforeCount = await ActivityLog.countDocuments();
  const list = await request('/activity-logs?module=finance&action=create&outcome=success&search=000');
  // Search targets users/resources/record IDs, not transaction values.
  assert.equal(list.status, 200);
  const matched = await request('/activity-logs?module=finance&action=create&outcome=success&search=accountant%40activity.test');
  assert.ok(matched.total >= 1);
  assert.ok(matched.items.every((r) => r.module === 'finance' && r.action === 'create' && r.outcome === 'success'));
  const first = await request('/activity-logs?limit=2&page=1');
  const second = await request('/activity-logs?limit=2&page=2');
  assert.equal(first.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map((r) => r.id)).size, 4);
  assert.equal(await ActivityLog.countDocuments(), beforeCount, 'viewing logs must not create more successful activity entries');
  assert.equal((await request('/activity-logs?from=2026-02-30')).status, 400);
  assert.equal((await request('/activity-logs?module[$ne]=finance')).status, 400);
  assert.equal((await request('/activity-logs?outcome=invalid')).status, 400);
  assert.equal((await request(`/activity-logs/${first.items[0].id}`, admin, { details: {} }, 'PUT')).status, 404);
  assert.equal((await request(`/activity-logs/${first.items[0].id}`, admin, undefined, 'DELETE')).status, 404);
  assert.ok(await ActivityLog.exists({ _id: first.items[0].id }));
});
