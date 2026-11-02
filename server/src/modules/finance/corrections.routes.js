import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { FinancialCorrection } from '../../models/FinancialCorrection.js';
import { requestCorrection, reviewCorrection, duplicateDocuments } from '../../services/financialOperations.js';
import { paginated } from '../../utils/pagination.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'accountant'));
router.get('/document-check', async (req, res) => res.json({ matches: await duplicateDocuments(req.query.type, req.query.reference, req.query.excludeId) }));
router.get('/corrections', async (req, res) => {
  const filter = {};
  if (req.query.status) { if (!['pending', 'approved', 'rejected'].includes(req.query.status)) throw ApiError.badRequest('Invalid status'); filter.status = req.query.status; }
  if (req.query.targetType) { if (!['income', 'expense', 'salary', 'partnerDeposit', 'profitPayment'].includes(req.query.targetType)) throw ApiError.badRequest('Invalid transaction type'); filter.targetType = req.query.targetType; }
  res.json(await paginated(FinancialCorrection, filter, req.query, [{ path: 'requestedBy', select: 'name' }, { path: 'reviewedBy', select: 'name' }], { createdAt: -1 }));
});
router.post('/corrections', async (req, res) => {
  if (['partnerDeposit', 'profitPayment'].includes(req.body.targetType) && req.user.role !== 'admin') throw ApiError.forbidden();
  res.status(201).json({ item: await requestCorrection(req.body, req.user) });
});
router.post('/corrections/:id/review', requireRole('admin'), async (req, res) => res.json({ item: await reviewCorrection(req.params.id, req.body, req.user) }));
export default router;
