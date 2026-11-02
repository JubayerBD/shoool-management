import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { Income, Expense, SalaryPayment, FinanceCategory, FINANCE_METHODS } from '../models/Finance.js';
import { PartnerDeposit } from '../models/Partner.js';
import { ProfitPayment } from '../models/CashBalance.js';
import { FinancialCorrection, FinancialLock } from '../models/FinancialCorrection.js';
import { ApiError } from '../utils/ApiError.js';
import { moneyCents } from '../utils/partnerCapital.js';
import { schoolDate, parseDay } from '../utils/financeDates.js';
import { Teacher } from '../models/People.js';
import { PARTNER_INCOME_CATEGORY } from './partnerIncome.js';

const models = { income: Income, expense: Expense, salary: SalaryPayment, partnerDeposit: PartnerDeposit, profitPayment: ProfitPayment };
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export function requestKey(value = randomUUID()) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) throw ApiError.badRequest('A valid request key is required');
  return value;
}
function shortText(value, label, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) throw ApiError.badRequest(`${label} must be ${required ? 'nonblank ' : ''}text of at most ${max} characters`);
  return value.trim();
}
export async function manualEntry(type, raw, session = null) {
  if (!['income', 'expense'].includes(type)) throw ApiError.badRequest('Choose income or expense');
  const amount = moneyCents(raw.amount) / 100;
  const reference = shortText(raw.reference, type === 'income' ? 'Invoice no.' : 'Voucher no.', 200, true);
  const date = raw.date === undefined ? new Date() : /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? parseDay(raw.date) : new Date(raw.date);
  if (!Number.isFinite(+date)) throw ApiError.badRequest('Invalid transaction date');
  const body = { amount, reference, date, method: raw.method || 'cash', note: shortText(raw.note, 'Note', 2000), receiptUrl: shortText(raw.receiptUrl, 'Receipt URL', 2000),
    [type === 'income' ? 'source' : 'payee']: shortText(raw[type === 'income' ? 'source' : 'payee'], 'Party', 1000) };
  if (!FINANCE_METHODS.includes(body.method)) throw ApiError.badRequest('Invalid payment method');
  if (raw.category) {
    if (!id(String(raw.category))) throw ApiError.badRequest('Choose a valid category');
    const category = await FinanceCategory.findById(raw.category).session(session);
    if (!category || category.type !== type) throw ApiError.badRequest(`Choose an ${type} category`);
    body.category = category._id;
  }
  if (type === 'expense') {
    if (raw.recurring?.frequency && !['monthly', 'quarterly', 'yearly'].includes(raw.recurring.frequency)) throw ApiError.badRequest('Invalid recurring frequency');
    body.recurring = { enabled: raw.recurring?.enabled === true, frequency: raw.recurring?.frequency || 'monthly' };
  }
  return body;
}

export async function duplicateDocuments(type, reference, excludeId, session = null) {
  if (!['income', 'expense'].includes(type)) throw ApiError.badRequest('Choose income or expense');
  const cleaned = shortText(reference, 'Document no.', 200, true);
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).join('\\s+');
  const filter = { reference: new RegExp(`^${escaped}$`, 'i') };
  if (excludeId) { if (!id(String(excludeId))) throw ApiError.badRequest('Invalid record ID'); filter._id = { $ne: excludeId }; }
  const matches = await models[type].find(filter).sort({ date: -1 }).limit(6).session(session).lean();
  return matches.map((r) => ({ id: String(r._id), reference: r.reference, amount: r.amount, date: r.date, party: r.source || r.payee || '', reversed: r.isReversed === true }));
}
export function duplicateWarning(matches) {
  throw new ApiError(409, 'This document number has already been used. Check the existing entries before saving.', { code: 'DUPLICATE_DOCUMENT', matches });
}
async function lockDocument(type, reference, session) {
  const key = `document:${type}:${digest(reference.trim().toLowerCase().replace(/\s+/g, ' '))}`;
  await FinancialLock.updateOne({ _id: key }, { $inc: { revision: 1 } }, { upsert: true, session });
}
export async function createManualEntry(type, raw, user) {
  const body = await manualEntry(type, raw), key = requestKey(raw.requestKey), inputHash = digest(body);
  let item;
  // Initialize the lock outside the transaction to avoid concurrent-upsert races.
  const lockKey = `document:${type}:${digest(body.reference.trim().toLowerCase().replace(/\s+/g, ' '))}`;
  try { await FinancialLock.updateOne({ _id: lockKey }, { $setOnInsert: { revision: 0 } }, { upsert: true }); } catch (err) { if (err.code !== 11000) throw err; }
  await mongoose.connection.transaction(async (session) => {
    await lockDocument(type, body.reference, session);
    const previous = await models[type].findOne({ requestKey: key }).session(session);
    if (previous) { if (previous.requestHash !== inputHash) throw ApiError.conflict('Request key already used for a different entry'); item = previous; return; }
    const matches = await duplicateDocuments(type, body.reference, null, session);
    if (matches.length && raw.duplicateConfirmed !== true) duplicateWarning(matches);
    [item] = await models[type].create([{ ...body, requestKey: key, requestHash: inputHash, duplicateAcknowledged: matches.length > 0, recordedBy: user._id }], { session });
  });
  return item;
}

export async function requestCorrection(raw, user) {
  const { targetType, targetId, operation } = raw;
  const Model = models[targetType];
  if (!Model || !id(targetId) || !['reverse', 'replace'].includes(operation)) throw ApiError.badRequest('Choose a valid transaction and correction type');
  if (operation === 'replace' && !['income', 'expense'].includes(targetType)) throw ApiError.badRequest('Reverse this entry first, then record the correct transaction');
  const reason = shortText(raw.reason, 'Correction reason', 1000, true), key = requestKey(raw.requestKey);
  const proposed = operation === 'replace' ? await manualEntry(targetType, raw.proposed || {}) : undefined;
  const inputHash = digest({ targetType, targetId, operation, reason, proposed });
  const previous = await FinancialCorrection.findOne({ requestKey: key });
  if (previous) { if (previous.requestHash !== inputHash) throw ApiError.conflict('Request key already used for another correction'); return previous; }
  const target = await Model.findById(targetId);
  if (!target) throw ApiError.notFound('Original transaction not found');
  if (target.isReversed) throw ApiError.conflict('This transaction has already been reversed');
  if (proposed) {
    const matches = await duplicateDocuments(targetType, proposed.reference, targetId);
    if (matches.length && raw.duplicateConfirmed !== true) duplicateWarning(matches);
  }
  const before = target.toObject({ virtuals: false });
  try {
    return await FinancialCorrection.create({ targetType, targetId, operation, reason, proposed, before, beforeHash: digest(before), requestKey: key, requestHash: inputHash,
      activeTargetKey: `${targetType}:${targetId}`, requestedBy: user._id });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const retry = await FinancialCorrection.findOne({ requestKey: key });
    if (retry?.requestHash === inputHash) return retry;
    throw ApiError.conflict('This transaction already has a pending or approved correction');
  }
}
export async function reviewCorrection(correctionId, raw, user) {
  const decision = raw.decision;
  if (!['approved', 'rejected'].includes(decision)) throw ApiError.badRequest('Choose approve or reject');
  const reviewNote = shortText(raw.note, 'Review note', 1000, true);
  let item;
  await mongoose.connection.transaction(async (session) => {
    item = await FinancialCorrection.findById(correctionId).session(session);
    if (!item) throw ApiError.notFound('Correction request not found');
    if (item.status !== 'pending') { if (item.status === decision) return; throw ApiError.conflict('This request has already been reviewed'); }
    item.status = decision; item.reviewedBy = user._id; item.reviewedAt = new Date(); item.reviewNote = reviewNote;
    if (decision === 'rejected') { item.activeTargetKey = undefined; await item.save({ session }); return; }
    const Model = models[item.targetType], target = await Model.findById(item.targetId).session(session);
    if (!target || target.isReversed || digest(target.toObject({ virtuals: false })) !== item.beforeHash) throw ApiError.conflict('Original entry changed. Reject this request and submit a new one.');
    const originalDay = schoolDate(target.date || target.paidAt);
    item.effectiveAt = parseDay(originalDay > schoolDate() ? originalDay : schoolDate());
    if (item.operation === 'replace') {
      const body = await manualEntry(item.targetType, item.proposed, session);
      await lockDocument(item.targetType, body.reference, session);
      const matches = await duplicateDocuments(item.targetType, body.reference, String(item.targetId), session);
      if (matches.length && raw.duplicateConfirmed !== true) duplicateWarning(matches);
      const [replacement] = await Model.create([{ ...body, date: item.effectiveAt, sourceCorrection: item._id, recordedBy: user._id }], { session });
      item.replacementId = replacement._id;
    }
    target.isReversed = true; target.reversalCorrection = item._id;
    await target.save({ session });
    await item.save({ session });
  });
  return item;
}

export async function correctionEvents(filter = {}, session = null) {
  const rows = await FinancialCorrection.find({ status: 'approved', ...filter }).session(session).lean();
  return rows.map((r) => {
    const b = r.before, amountCents = ['partnerDeposit', 'profitPayment'].includes(r.targetType) ? b.amountCents : Math.round((r.targetType === 'salary' ? b.net : b.amount) * 100);
    const incomeCents = ['income', 'partnerDeposit'].includes(r.targetType) ? -amountCents : 0;
    const expenseCents = ['expense', 'salary'].includes(r.targetType) ? -amountCents : 0;
    return { id: String(r._id), targetId: String(r.targetId), targetType: r.targetType, date: r.effectiveAt, amountCents,
      cashCents: incomeCents - expenseCents + (r.targetType === 'profitPayment' ? amountCents : 0), incomeCents, expenseCents,
      category: b.category, partner: b.partner, distribution: b.distribution, party: b.source || b.payee || '', reason: r.reason, reference: b.reference || '', before: b };
  });
}

export async function migrateSalaryIndex() {
  await SalaryPayment.updateMany({ isReversed: { $exists: false } }, { $set: { isReversed: false } });
  await SalaryPayment.collection.createIndex({ staff: 1, month: 1 }, { name: 'active_salary_month', unique: true, partialFilterExpression: { isReversed: false } });
  try { await SalaryPayment.collection.dropIndex('staff_1_month_1'); } catch (err) { if (![26, 27].includes(err.code)) throw err; }
}

export async function correctionRows(type, range, query = {}) {
  const events = (await correctionEvents(range)).filter((r) => type === 'income' ? ['income', 'partnerDeposit'].includes(r.targetType) : r.targetType === type);
  const categories = await FinanceCategory.find({ _id: { $in: events.map((r) => r.category).filter(Boolean) } }).lean();
  const rows = [];
  for (const r of events) {
    const category = r.targetType === 'partnerDeposit' ? PARTNER_INCOME_CATEGORY : categories.find((c) => String(c._id) === String(r.category));
    if (query.category && String(category?.id || category?._id || '') !== query.category) continue;
    if (query.method && r.before.method !== query.method) continue;
    if (query.search && !r.party.toLowerCase().includes(String(query.search).toLowerCase())) continue;
    if (query.staff && String(r.before.staff) !== query.staff) continue;
    if (query.month && r.before.month !== query.month) continue;
    const row = { id: `reversal-${r.id}`, correctionId: r.id, isCorrection: true, date: r.date, amount: -r.amountCents / 100,
      category: category ? { id: String(category.id || category._id), name: category.name } : null,
      source: r.party || 'Partner investment reversal', payee: r.party, reference: r.reference, method: r.before.method || '', note: r.reason };
    if (type === 'salary') Object.assign(row, { staff: await Teacher.findById(r.before.staff).select('name employeeId'), month: r.before.month,
      paidAt: r.date, net: -r.amountCents / 100, basic: -(r.before.basic || 0), allowances: -(r.before.allowances || 0), deductions: -(r.before.deductions || 0) });
    rows.push(row);
  }
  return rows;
}
