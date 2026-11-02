import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { OpeningBalance, ProfitPayment } from '../../models/CashBalance.js';
import { ProfitDistribution, ProfitDistributionLock } from '../../models/ProfitDistribution.js';
import { FINANCE_METHODS } from '../../models/Finance.js';
import { cashBalance, balanceStatement, checkedCents } from '../../services/cashBalance.js';
import { moneyCents } from '../../utils/partnerCapital.js';
import { parseDay, schoolDate } from '../../utils/financeDates.js';
import { pagination } from '../../utils/pagination.js';
import { ApiError } from '../../utils/ApiError.js';
import { correctionEvents } from '../../services/financialOperations.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'accountant'));
router.get('/', async (req, res) => {
  let result;
  await mongoose.connection.transaction(async (session) => {
    const data = await cashBalance(session);
    const from = req.query.from || `${data.asOf.slice(0, 7)}-01`, to = req.query.to || data.asOf;
    const { rows, ...statement } = balanceStatement(data, from, to);
    const { page, limit, skip } = pagination(req.query);
    const { events, ...summary } = data;
    result = { ...summary, statement, items: rows.slice(skip, skip + limit), total: rows.length, page, limit, pages: Math.ceil(rows.length / limit) };
  }, { readConcern: { level: 'snapshot' } });
  res.json(result);
});
router.post('/opening', requireRole('admin'), async (req, res) => {
  const date = parseDay(req.body.date);
  if (req.body.date > schoolDate()) throw ApiError.badRequest('Opening date cannot be in the future');
  if (!['string', 'number'].includes(typeof req.body.amount) || !String(req.body.amount).trim()) throw ApiError.badRequest('Enter an opening balance');
  const amount = Number(req.body.amount), amountCents = checkedCents(amount);
  if (!Number.isFinite(amount) || Math.abs(amount * 100 - amountCents) > 1e-6 || Math.abs(amountCents) > 1e12) throw ApiError.badRequest('Enter an amount with at most 2 decimal places');
  const note = req.body.note;
  if (typeof note !== 'string' || !note.trim() || note.length > 1000) throw ApiError.badRequest('An explanation is required (at most 1000 characters)');
  let item;
  await mongoose.connection.transaction(async (session) => {
    if (await OpeningBalance.exists({ key: 'opening' }).session(session)) throw ApiError.conflict('An opening balance is already recorded');
    const data = await cashBalance(session);
    if (data.events.some((r) => +new Date(r.date) < +date)) throw ApiError.badRequest('Opening date must be on or before the earliest recorded transaction');
    [item] = await OpeningBalance.create([{ key: 'opening', amountCents, date, note: note.trim(), recordedBy: req.user._id }], { session });
  });
  res.status(201).json({ item });
});
router.post('/profit-payments', requireRole('admin'), async (req, res) => {
  const { distribution, partner, method, requestKey, reference = '', note = '' } = req.body;
  if (![distribution, partner].every((v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v))) throw ApiError.badRequest('Choose a valid partner allocation');
  if (!FINANCE_METHODS.includes(method) || typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) throw ApiError.badRequest('A payment method and request key are required');
  if (typeof reference !== 'string' || reference.length > 200 || typeof note !== 'string' || note.length > 1000) throw ApiError.badRequest('Invalid reference or note');
  const amountCents = moneyCents(req.body.amount), date = parseDay(req.body.date);
  if (req.body.date > schoolDate()) throw ApiError.badRequest('Payment date cannot be in the future');
  let item;
  await mongoose.connection.transaction(async (session) => {
    // Shares the distribution lock; concurrent retries cannot overpay a partner.
    await ProfitDistributionLock.updateOne({ _id: 'distribution' }, { $inc: { version: 1 } }, { session, upsert: true });
    const previous = await ProfitPayment.findOne({ requestKey }).session(session);
    if (previous) {
      if (String(previous.distribution) !== distribution || String(previous.partner) !== partner || previous.amountCents !== amountCents || +previous.date !== +date || previous.method !== method || previous.reference !== reference.trim() || previous.note !== note.trim()) throw ApiError.conflict('Request key already used for another payment');
      item = previous; return;
    }
    const record = await ProfitDistribution.findById(distribution).session(session);
    const allocation = record?.report.allocations.find((p) => p.id === partner);
    if (!allocation) throw ApiError.notFound('Partner allocation not found');
    if (req.body.date < schoolDate(record.createdAt)) throw ApiError.badRequest('Payment cannot predate the distribution');
    const payments = await ProfitPayment.find({ distribution, partner }).session(session).lean();
    const paid = payments.reduce((sum, p) => sum + p.amountCents, 0);
    const reversed = (await correctionEvents({ targetType: 'profitPayment', targetId: { $in: payments.map((p) => p._id) } }, session)).reduce((sum, p) => sum + p.amountCents, 0);
    if (paid - reversed + amountCents > checkedCents(allocation.profit)) throw ApiError.badRequest('Payment exceeds this partner’s unpaid allocated profit');
    [item] = await ProfitPayment.create([{ distribution, partner, amountCents, date, method, reference: reference.trim(), note: note.trim(), requestKey, recordedBy: req.user._id }], { session });
  });
  res.status(201).json({ item: { ...item.toJSON(), amount: item.amountCents / 100 } });
});
export default router;
