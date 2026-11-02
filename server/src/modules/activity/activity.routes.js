import { Router } from 'express';
import { ActivityLog } from '../../models/ActivityLog.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { rangeFilter } from '../../utils/financeDates.js';
import { pagination } from '../../utils/pagination.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/', async (req, res) => {
  for (const key of ['from', 'to', 'module', 'action', 'outcome', 'search']) {
    if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || req.query[key].length > 200)) throw ApiError.badRequest('Invalid activity filter');
  }
  const filter = rangeFilter('createdAt', req.query.from, req.query.to);
  if (req.query.module) filter.module = req.query.module;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.outcome) {
    if (!['success', 'failed'].includes(req.query.outcome)) throw ApiError.badRequest('Invalid outcome');
    filter.outcome = req.query.outcome;
  }
  if (req.query.search) {
    const regex = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = ['actorName.en', 'actorName.bn', 'actorEmail', 'attemptedEmail', 'recordId', 'resource'].map((key) => ({ [key]: regex }));
  }
  const { page, limit, skip } = pagination({ ...req.query, limit: req.query.limit || 25 });
  const [items, total, modules, actions] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit), ActivityLog.countDocuments(filter),
    ActivityLog.distinct('module'), ActivityLog.distinct('action'),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit), modules: modules.sort(), actions: actions.sort() });
});
export default router;
