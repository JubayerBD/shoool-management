import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { Partner, PartnerDeposit } from '../../models/Partner.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseDay, schoolDate } from '../../utils/financeDates.js';
import { capitalShares, moneyCents } from '../../utils/partnerCapital.js';
import { ProfitDistribution } from '../../models/ProfitDistribution.js';
import { ProfitPayment } from '../../models/CashBalance.js';
import { correctionEvents } from '../../services/financialOperations.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
function profile(body) {
  const result = {};
  for (const [key, limit] of Object.entries({ name: 200, phone: 50, address: 1000, email: 254 })) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > limit || (key !== 'email' && !value.trim())) throw ApiError.badRequest(`Invalid ${key}`);
    result[key] = value.trim();
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw ApiError.badRequest('Invalid email');
  return result;
}
async function partner(id) {
  const item = await Partner.findById(id);
  if (!item) throw ApiError.notFound('Partner not found');
  return item;
}
router.get('/', async (req, res) => {
  const profit = req.query.profit === undefined ? 0 : moneyCents(req.query.profit);
  const [partners, totals] = await Promise.all([Partner.find().sort({ name: 1, _id: 1 }), PartnerDeposit.aggregate([{ $group: { _id: '$partner', total: { $sum: '$amountCents' } } }])]);
  const capital = new Map(totals.map((p) => [String(p._id), p.total]));
  for (const reversal of await correctionEvents({ targetType: 'partnerDeposit' })) capital.set(String(reversal.partner), (capital.get(String(reversal.partner)) || 0) - reversal.amountCents);
  res.json(capitalShares(partners.map((p) => ({ ...p.toJSON(), capitalCents: capital.get(p.id) || 0 })), profit));
});
router.post('/', async (req, res) => res.status(201).json({ item: await Partner.create(profile(req.body)) }));
router.get('/:id', async (req, res) => {
  const item = await partner(req.params.id);
  const deposits = await PartnerDeposit.find({ partner: item._id }).sort({ date: -1, createdAt: -1 });
  const distributions = await ProfitDistribution.find({ 'report.allocations.id': item.id }).sort({ createdAt: -1, _id: -1 });
  const payments = await ProfitPayment.find({ partner: item._id }).sort({ date: -1, createdAt: -1 });
  const profits = distributions.map((d) => {
    const allocation = d.report.allocations.find((p) => p.id === item.id);
    const paidCents = payments.filter((p) => String(p.distribution) === d.id && !p.isReversed).reduce((sum, p) => sum + p.amountCents, 0);
    return { ...allocation, id: d.id, date: d.createdAt, from: d.from, to: d.to, paid: paidCents / 100, unpaid: (Math.round(allocation.profit * 100) - paidCents) / 100 };
  });
  res.json({ item, deposits: deposits.map((d) => ({ ...d.toJSON(), amount: d.amountCents / 100 })), profits,
    profitPayments: payments.map((p) => ({ ...p.toJSON(), amount: p.amountCents / 100 })) });
});
router.put('/:id', async (req, res) => {
  const item = await partner(req.params.id);
  Object.assign(item, profile(req.body));
  await item.save();
  res.json({ item });
});
router.post('/:id/deposits', async (req, res) => {
  const item = await partner(req.params.id);
  const amountCents = moneyCents(req.body.amount);
  const date = parseDay(req.body.date);
  if (req.body.date > schoolDate()) throw ApiError.badRequest('Deposit date cannot be in the future');
  const { note = '', requestKey } = req.body;
  if (typeof note !== 'string' || note.length > 1000) throw ApiError.badRequest('Note must be at most 1000 characters');
  if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) throw ApiError.badRequest('A valid request key is required');
  let deposit;
  try {
    deposit = await PartnerDeposit.create({ partner: item._id, amountCents, date, note: note.trim(), requestKey, recordedBy: req.user._id });
  } catch (err) {
    if (err.code !== 11000) throw err;
    deposit = await PartnerDeposit.findOne({ requestKey });
    if (!deposit || String(deposit.partner) !== item.id || deposit.amountCents !== amountCents || +deposit.date !== +date || deposit.note !== note.trim()) throw ApiError.conflict('Request key already used for a different deposit');
  }
  res.status(201).json({ item: { ...deposit.toJSON(), amount: deposit.amountCents / 100 } });
});
export default router;
