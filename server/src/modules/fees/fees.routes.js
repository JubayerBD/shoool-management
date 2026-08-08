import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { crudController } from '../../utils/crudController.js';
import { FeeStructure, Invoice, Payment } from '../../models/Fees.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();
const finance = requireRole('admin', 'accountant');

/* ---- Fee structures ---- */
const structures = crudController(FeeStructure, {
  populate: ['class', 'academicYear'],
  searchable: ['name.en', 'name.bn'],
  filterable: ['class', 'academicYear', 'frequency', 'isActive'],
});

router.get('/structures', requireAuth, structures.list);
router.get('/structures/:id', requireAuth, structures.get);
router.post('/structures', requireAuth, finance, structures.create);
router.put('/structures/:id', requireAuth, finance, structures.update);
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
        amount: z.number().min(0),
      })
    )
    .min(1),
});

async function nextInvoiceNo() {
  const count = await Invoice.countDocuments();
  return `INV-${String(count + 1).padStart(6, '0')}`;
}

router.post(
  '/invoices',
  requireAuth,
  finance,
  validate(invoiceSchema),
  async (req, res) => {
    const { items } = req.body;
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const invoice = await Invoice.create({
      ...req.body,
      invoiceNo: await nextInvoiceNo(),
      totalAmount,
      paidAmount: 0,
      status: 'unpaid',
    });
    res.status(201).json({ item: invoice });
  }
);

router.get('/invoices', requireAuth, async (req, res) => {
  const { student, status } = req.query;
  const filter = {};
  if (student) filter.student = student;
  if (status) filter.status = status;
  const items = await Invoice.find(filter)
    .populate('student', 'name admissionNo roll')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ items });
});

router.get('/invoices/:id', requireAuth, async (req, res) => {
  const item = await Invoice.findById(req.params.id).populate('student', 'name admissionNo roll');
  if (!item) throw ApiError.notFound('Invoice not found');
  const payments = await Payment.find({ invoice: item.id }).sort({ paidAt: -1 });
  res.json({ item, payments });
});

/* ---- Payments ---- */
const paymentSchema = z.object({
  invoice: z.string().min(1),
  amount: z.number().min(0.01),
  method: z.enum(['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank']).default('cash'),
  transactionRef: z.string().optional(),
  note: z.string().optional(),
});

router.post(
  '/payments',
  requireAuth,
  finance,
  validate(paymentSchema),
  async (req, res) => {
    const invoice = await Invoice.findById(req.body.invoice);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.status === 'cancelled') throw ApiError.badRequest('Invoice is cancelled');

    const balance = invoice.totalAmount - invoice.paidAmount;
    if (req.body.amount > balance + 0.001) {
      throw ApiError.badRequest(`Payment exceeds outstanding balance (${balance})`);
    }

    const payment = await Payment.create({
      ...req.body,
      student: invoice.student,
      receivedBy: req.user.id,
    });

    invoice.paidAmount += req.body.amount;
    invoice.status =
      invoice.paidAmount >= invoice.totalAmount - 0.001 ? 'paid' : 'partial';
    await invoice.save();

    res.status(201).json({ item: payment, invoice });
  }
);

router.get('/payments', requireAuth, async (req, res) => {
  const { student, invoice } = req.query;
  const filter = {};
  if (student) filter.student = student;
  if (invoice) filter.invoice = invoice;
  const items = await Payment.find(filter)
    .populate('student', 'name admissionNo')
    .sort({ paidAt: -1 })
    .limit(500);
  res.json({ items });
});

export default router;
