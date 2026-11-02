import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ProfitDistribution, ProfitDistributionLock } from '../../models/ProfitDistribution.js';
import { calculateNetProfit, profitOptions } from '../../services/netProfit.js';
import { ApiError } from '../../utils/ApiError.js';
import { pagination } from '../../utils/pagination.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'accountant'));
router.get('/options', async (_req, res) => res.json(await profitOptions()));
router.post('/preview', requireRole('admin'), async (req, res) => {
  const report = await calculateNetProfit(req.body);
  const overlap = await ProfitDistribution.findOne({ from: { $lte: report.config.to }, to: { $gte: report.config.from } });
  res.json({ report, alreadyDistributed: Boolean(overlap) });
});
router.get('/distributions', async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const items = await ProfitDistribution.find().sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit);
  const total = await ProfitDistribution.countDocuments();
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
});
router.post('/distributions', requireRole('admin'), async (req, res) => {
  const { requestKey, previewHash } = req.body;
  if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(requestKey) || typeof previewHash !== 'string' || !/^[a-f0-9]{64}$/.test(previewHash)) throw ApiError.badRequest('Calculate net profit before distributing');
  // Serialize all distributions so simultaneous, overlapping requests cannot
  // each commit a distribution against an empty snapshot.
  try {
    await ProfitDistributionLock.updateOne({ _id: 'distribution' }, { $setOnInsert: { version: 0 } }, { upsert: true });
  } catch (err) { if (err.code !== 11000) throw err; }
  let item;
  await mongoose.connection.transaction(async (session) => {
    await ProfitDistributionLock.updateOne({ _id: 'distribution' }, { $inc: { version: 1 } }, { session });
    const previous = await ProfitDistribution.findOne({ requestKey }).session(session);
    if (previous) {
      const config = previous.report.config;
      const sameSelection = (key) => Array.isArray(req.body[key]) && JSON.stringify([...req.body[key]].sort()) === JSON.stringify(config[key]);
      if (previous.previewHash !== previewHash || req.body.from !== config.from || req.body.to !== config.to || !sameSelection('incomeCategories') || !sameSelection('expenseCategories')) throw ApiError.conflict('Request key already used for another calculation');
      item = previous;
      return;
    }
    const report = await calculateNetProfit(req.body, session);
    if (report.previewHash !== previewHash) throw ApiError.conflict('Income, expenses, or capital changed. Calculate net profit again before distributing.');
    if (report.netProfit <= 0) throw ApiError.badRequest('Only positive net profit can be distributed');
    if (report.totalCapital <= 0) throw ApiError.badRequest('Record partner deposits before distributing profit');
    if (await ProfitDistribution.exists({ from: { $lte: report.config.to }, to: { $gte: report.config.from } }).session(session)) throw ApiError.conflict('This period overlaps an existing profit distribution');
    [item] = await ProfitDistribution.create([{ from: report.config.from, to: report.config.to, requestKey, previewHash, report, recordedBy: req.user._id }], { session });
  });
  res.status(201).json({ item });
});
export default router;
