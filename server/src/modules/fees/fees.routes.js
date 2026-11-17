import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { crudController } from '../../utils/crudController.js';
import { FeeStructure, Invoice, Payment } from '../../models/Fees.js';
import { ApiError } from '../../utils/ApiError.js';
import { Student } from '../../models/People.js';
import { createInvoice, nextReceiptNo, withBillingTransaction } from '../../services/billing.js';
import { paginated } from '../../utils/pagination.js';
import { parseDay, rangeFilter, schoolDate } from '../../utils/financeDates.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD');
/** A date the office picks (the money received date): a real day, not in the future. */
function pickedDay(value, label) {
  parseDay(value);
  if (value > schoolDate()) throw ApiError.badRequest(`${label} cannot be in the future`);
  if (value < '2000-01-01') throw ApiError.badRequest(`${label} is too far in the past`);
  return value;
}
/** Money received today keeps the current time; an earlier day is stored at midday (Bangladesh time) of that day. */
function receivedAt(value) {
  pickedDay(value, 'Received date');
  return value === schoolDate() ? new Date() : new Date(`${value}T12:00:00.000+06:00`);
}

import workflowRoutes from './workflow.routes.js';
import { FeePlan, BillingSchedule } from '../../models/FeeWorkflow.js';
import { blockIfInUse } from '../../utils/inUse.js';
import { studentScope, amountDue, updateInvoiceStatus } from '../../utils/feeAccess.js';

const router = Router();
router.use(workflowRoutes);
const finance = requireRole('admin', 'accountant');

/* ---- Fee structures ---- */
const structures = crudController(FeeStructure, {
  populate: ['class', 'academicYear'],
  searchable: ['name.en', 'name.bn'],
  filterable: ['class', 'academicYear', 'frequency', 'isActive'],
  guardRemove: blockIfInUse([[FeePlan, 'items.feeType', 'fee plans'], [BillingSchedule, 'feeTypes', 'billing schedules']]),
});

router.get('/structures', requireAuth, structures.list);
router.get('/structures/:id', requireAuth, structures.get);
const structureSchema = z.object({
  name: z.object({ en: z.string().min(1), bn: z.string().default('') }),
  amount: z.number().finite().min(0).multipleOf(0.01),
  frequency: z.enum(['one_time', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  class: z.string().optional(), academicYear: z.string().optional(),
  isActive: z.boolean().default(true), autoGenerate: z.boolean().default(false),
  billingStart: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.autoGenerate && !data.billingStart) ctx.addIssue({ code: 'custom', path: ['billingStart'], message: 'Choose a billing start date' });
});
function validateBillingStart(req, _res, next) {
  if (req.body.billingStart) parseDay(req.body.billingStart);
  else delete req.body.billingStart;
  next();
}
router.post('/structures', requireAuth, finance, validate(structureSchema), validateBillingStart, structures.create);
router.put('/structures/:id', requireAuth, finance, validate(structureSchema), validateBillingStart, structures.update);
router.delete('/structures/:id', requireAuth, finance, structures.remove);

/* ---- Invoices ---- */
const bilingual = z.object({ en: z.string().default(''), bn: z.string().default('') }).partial();

const invoiceSchema = z.object({
  student: z.string().min(1),
  academicYear: z.string().optional(),
  period: bilingual.optional(),
  dueDate: z.coerce.date().optional(),
  items: z
    .array(
      z.object({
        feeStructure: z.string().optional(),
        title: z.object({ en: z.string().min(1), bn: z.string().default('') }),
        amount: z.number().finite().min(0).multipleOf(0.01),
      })
    )
    .min(1),
});

router.post(
  '/invoices',
  requireAuth,
  finance,
  validate(invoiceSchema),
  async (req, res) => {
    if (!await Student.exists({ _id: req.body.student })) throw ApiError.notFound('Student not found');
    const invoice = await createInvoice(req.body);
    res.status(201).json({ item: invoice });
  }
);

router.get('/invoices', requireAuth, async (req, res) => {
  const { student, status } = req.query;
  const filter = studentScope(req.user, student);
  if (status) filter.status = status;
  res.json(await paginated(Invoice, filter, req.query, { path: 'student', select: 'name admissionNo roll' }, { createdAt: -1 }));
});

router.get('/invoices/:id', requireAuth, async (req, res) => {
  const item = await Invoice.findOne({ _id: req.params.id, ...studentScope(req.user) }).populate('class', 'name').populate({ path: 'student', select: 'name admissionNo roll class section', populate: [{ path: 'class', select: 'name' }, { path: 'section', select: 'name' }] });
  if (!item) throw ApiError.notFound('Invoice not found');
  const payments = await Payment.find({ invoice: item.id }).sort({ paidAt: -1 }).populate('receivedBy', 'name');
  res.json({ item, payments });
});

/* ---- Payments ---- */
const paymentSchema = z.object({
  // Receipt-book number: optional. Left blank, it is not stored (the number must be unique when given).
  invoiceNo: z.string().trim().max(100).optional().transform((value) => value || undefined),
  invoice: z.string().min(1),
  amount: z.number().finite().min(0.01).multipleOf(0.01),
  idempotencyKey: z.string().uuid().optional(),
  method: z.enum(['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank']).default('cash'),
  transactionRef: z.string().optional(),
  note: z.string().optional(),
  paidAt: day.optional(), // the day the money was received; today when left out
});

router.post(
  '/payments',
  requireAuth,
  finance,
  validate(paymentSchema),
  async (req, res) => {
    const replay = async (session) => {
      if (req.body.idempotencyKey) {
        let query = Payment.findOne({ idempotencyKey: req.body.idempotencyKey });
        if (session) query = query.session(session);
        const existing = await query;
        if (existing) {
          if (String(existing.invoice) !== req.body.invoice || (existing.originalAmount ?? existing.amount) !== req.body.amount || existing.method !== req.body.method || existing.invoiceNo !== req.body.invoiceNo) {
            throw ApiError.conflict('Payment request key was already used for a different payment');
          }
          const invoiceQuery = Invoice.findById(existing.invoice);
          return { item: existing, invoice: await (session ? invoiceQuery.session(session) : invoiceQuery) };
        }
      }
      return null;
    };
    const paidAt = req.body.paidAt ? receivedAt(req.body.paidAt) : new Date();
    let result;
    try {
      result = await withBillingTransaction(async (session) => {
      const existing = await replay(session);
      if (existing) return existing;
      const invoice = await Invoice.findById(req.body.invoice).session(session);
      if (!invoice) throw ApiError.notFound('Invoice not found');
      if (invoice.status === 'cancelled') throw ApiError.badRequest('Invoice is cancelled');

      const balance = amountDue(invoice);
      if (req.body.amount > balance + 0.001) {
        throw ApiError.badRequest(`Payment exceeds outstanding balance (${balance})`);
      }

      const [payment] = await Payment.create([{
        ...req.body,
        paidAt,
        student: invoice.student,
        receivedBy: req.user._id,
        receiptNo: await nextReceiptNo(),
      }], { session });

      invoice.paidAmount = Math.round((invoice.paidAmount + req.body.amount) * 100) / 100;
      updateInvoiceStatus(invoice);
      await invoice.save({ session });

      return { item: payment, invoice };
      });
    } catch (err) {
      // A concurrent retry can race on the unique request key before touching the invoice.
      if (err.code !== 11000 || !req.body.idempotencyKey) throw err;
      result = await replay();
      if (!result) throw err;
    }
    res.status(201).json(result);
  }
);

// Fix the received date of a payment that was recorded with the wrong day. Finance reports follow it.
router.patch('/payments/:id/date', requireAuth, requireRole('admin'), validate(z.object({ paidAt: day })), async (req, res) => {
  const paidAt = receivedAt(req.body.paidAt);
  const item = await Payment.findById(req.params.id);
  if (!item) throw ApiError.notFound('Payment not found');
  if (item.voidedAt) throw ApiError.badRequest('A voided payment cannot be changed');
  item.paidAt = paidAt;
  await item.save();
  res.json({ item });
});

router.get('/payments', requireAuth, async (req, res) => {
  const { student, invoice, from, to } = req.query;
  const filter = { ...studentScope(req.user, student), ...rangeFilter('paidAt', from, to) }; // by received date
  if (invoice) filter.invoice = invoice;
  res.json(await paginated(Payment, filter, req.query, { path: 'student', select: 'name admissionNo' }, { paidAt: -1 }));
});

export default router;
