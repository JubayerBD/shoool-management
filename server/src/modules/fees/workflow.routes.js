import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { FeePlan, BillingSchedule, FeeAdjustment } from '../../models/FeeWorkflow.js';
import { Invoice, Payment, FeeStructure } from '../../models/Fees.js';
import { Student } from '../../models/People.js';
import { paginated } from '../../utils/pagination.js';
import { ApiError } from '../../utils/ApiError.js';
import { studentScope, amountDue, money, updateInvoiceStatus } from '../../utils/feeAccess.js';
import { parseDay, schoolDate } from '../../utils/financeDates.js';
import { planDetails, previewSchedule, generateScheduleInvoices } from '../../services/feeSchedules.js';
import { withBillingTransaction } from '../../services/billing.js';

const router = Router();
const managers = [requireAuth, requireRole('admin', 'accountant')];
const admins = [requireAuth, requireRole('admin')];
const id = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record');
const currency = z.number().finite().min(0).multipleOf(0.01);
const name = z.object({ en: z.string().trim().min(1), bn: z.string().default('') });
const planSchema = z.object({ name, class: id, academicYear: id, isActive: z.boolean().default(true),
  items: z.array(z.object({ feeType: id, amount: currency, optional: z.boolean().default(false) })).min(1) });
const scheduleSchema = z.object({ name: z.string().trim().min(1), plan: id,
  feeTypes: z.array(id).min(1),
  componentRules: z.array(z.object({ feeType: id, startDate: z.string(), intervalMonths: z.number().int().min(0).max(12) })).default([]),
  students: z.array(id).min(1), startDate: z.string(), endDate: z.string(),
  frequency: z.enum(['one_time', 'monthly', 'quarterly', 'yearly']), dueDays: z.number().int().min(0).max(90),
  optionalAssignments: z.array(z.object({ feeType: id, students: z.array(id) })).default([]),
  concessions: z.array(z.object({ student: id, feeType: id.optional(), mode: z.enum(['fixed', 'percent']),
    value: currency, reason: z.string().trim().min(1) })).default([]),
});

router.get('/plans', ...managers, async (req, res) => {
  const filter = {};
  for (const key of ['class', 'academicYear']) if (req.query[key]) filter[key] = req.query[key];
  res.json(await paginated(FeePlan, filter, req.query, ['class', 'academicYear'], { createdAt: -1 }));
});
router.post('/plans', ...managers, validate(planSchema), async (req, res) => {
  res.status(201).json({ item: await FeePlan.create({ ...await planDetails(req.body), createdBy: req.user._id }) });
});
router.put('/plans/:id', ...managers, validate(planSchema), async (req, res) => {
  const item = await FeePlan.findByIdAndUpdate(req.params.id, await planDetails(req.body), { new: true, runValidators: true });
  if (!item) throw ApiError.notFound('Fee plan not found');
  res.json({ item });
});
router.post('/structures/:id/stop-automation', ...managers, async (req, res) => {
  const item = await FeeStructure.findByIdAndUpdate(req.params.id, { autoGenerate: false }, { new: true });
  if (!item) throw ApiError.notFound('Fee type not found');
  res.json({ item });
});

router.get('/schedules', ...managers, async (req, res) => {
  res.json(await paginated(BillingSchedule, {}, req.query, [{ path: 'plan', select: 'name' }, { path: 'approvedBy', select: 'name' }], { createdAt: -1 }));
});
router.post('/schedules', ...managers, validate(scheduleSchema), async (req, res) => {
  await previewSchedule(req.body);
  res.status(201).json({ item: await BillingSchedule.create({ ...req.body, createdBy: req.user._id }) });
});
router.put('/schedules/:id', ...managers, validate(scheduleSchema), async (req, res) => {
  await previewSchedule(req.body);
  const item = await BillingSchedule.findOneAndUpdate({ _id: req.params.id, status: 'draft' }, req.body, { new: true, runValidators: true });
  if (!item) throw ApiError.conflict('Only draft schedules can be edited');
  res.json({ item });
});
router.get('/schedules/:id/preview', ...managers, async (req, res) => {
  const item = await BillingSchedule.findById(req.params.id);
  if (!item) throw ApiError.notFound('Schedule not found');
  res.json(await previewSchedule(item));
});
router.post('/schedules/:id/activate', ...admins, validate(z.object({ token: z.string().length(64) })), async (req, res) => {
  const item = await withBillingTransaction(async (session) => {
    const schedule = await BillingSchedule.findOne({ _id: req.params.id, status: 'draft' }).session(session);
    if (!schedule) throw ApiError.conflict('Only draft schedules can be activated');
    const preview = await previewSchedule(schedule, new Date(), session);
    if (preview.token !== req.body.token) throw ApiError.conflict('The schedule, plan or students changed. Review a new preview before activation.');
    // Serialize approvals of the same plan, including multiple app instances.
    await FeePlan.updateOne({ _id: schedule.plan }, { $inc: { approvalRevision: 1 } }, { session });
    const overlap = await BillingSchedule.exists({ _id: { $ne: schedule.id }, plan: schedule.plan,
      status: { $nin: ['draft', 'cancelled'] }, startDate: { $lte: schedule.endDate }, endDate: { $gte: schedule.startDate },
      feeTypes: { $in: schedule.feeTypes },
      students: { $in: schedule.students } }).session(session);
    if (overlap) throw ApiError.conflict('Another approved schedule covers these students and dates for the same plan');
    schedule.items = preview.selectedItems;
    schedule.class = preview.plan.class;
    schedule.academicYear = preview.plan.academicYear;
    schedule.status = 'active';
    schedule.approvedBy = req.user._id;
    schedule.approvedAt = new Date();
    await schedule.save({ session });
    return schedule;
  });
  // Scheduled job retries safely if generation is interrupted after approval.
  let billingError;
  try { await generateScheduleInvoices(item); }
  catch (err) { billingError = 'Schedule approved; invoice generation will retry automatically.'; console.error('[billing]', err.message); }
  res.json({ item, billingError });
});
router.post('/schedules/:id/status', ...admins, validate(z.object({ status: z.enum(['active', 'paused']) })), async (req, res) => {
  const item = await BillingSchedule.findOneAndUpdate({ _id: req.params.id, status: { $in: ['active', 'paused'] } },
    { status: req.body.status }, { new: true });
  if (!item) throw ApiError.conflict('Only approved, unfinished schedules can be paused or resumed');
  res.json({ item });
});

router.get('/schedules/:id/cancellation-preview', ...admins, async (req, res) => {
  const item = await BillingSchedule.findById(req.params.id);
  if (!item) throw ApiError.notFound('Schedule not found');
  const invoices = await Invoice.find({ billingSchedule: item.id, status: { $ne: 'cancelled' } });
  res.json({ invoiceCount: invoices.length, outstanding: money(invoices.reduce((sum, bill) => sum + amountDue(bill), 0)),
    paidInvoices: invoices.filter((bill) => bill.paidAmount > 0).length });
});
router.post('/schedules/:id/cancel', ...admins, validate(z.object({ reason: z.string().trim().min(3) })), async (req, res) => {
  const item = await withBillingTransaction(async (session) => {
    const schedule = await BillingSchedule.findOneAndUpdate({ _id: req.params.id, status: { $ne: 'cancelled' } },
      { $inc: { billingRevision: 1 } }, { session, new: true });
    if (!schedule) throw ApiError.conflict('Schedule is unavailable or already cancelled');
    await FeePlan.updateOne({ _id: schedule.plan }, { $inc: { approvalRevision: 1 } }, { session });
    const invoices = await Invoice.find({ billingSchedule: schedule.id, status: { $ne: 'cancelled' } }).session(session);
    if (invoices.some((bill) => bill.paidAmount > 0)) throw ApiError.conflict('Refund retained payments through Adjustments & refunds before cancelling this schedule. You can pause it in the meantime.');
    for (const bill of invoices) {
      await FeeAdjustment.create([{ invoice: bill.id, student: bill.student, type: 'cancellation', amount: amountDue(bill),
        reason: req.body.reason, status: 'approved', requestedBy: req.user._id, reviewedBy: req.user._id,
        reviewedAt: new Date(), reviewNote: `Schedule cancelled: ${schedule.name}` }], { session });
      bill.status = 'cancelled';
      await bill.save({ session });
      await FeeAdjustment.updateMany({ invoice: bill.id, status: 'pending' }, { status: 'rejected', reviewedBy: req.user._id,
        reviewedAt: new Date(), reviewNote: 'Invoice cancelled with its billing schedule' }, { session });
    }
    schedule.status = 'cancelled'; schedule.cancelledBy = req.user._id; schedule.cancelledAt = new Date();
    schedule.cancellationReason = req.body.reason;
    await schedule.save({ session });
    return schedule;
  });
  res.json({ item });
});

router.get('/accounts/:student', requireAuth, async (req, res) => {
  const scope = studentScope(req.user, req.params.student);
  const student = await Student.findById(req.params.student).populate('class', 'name').populate('section', 'name');
  if (!student) throw ApiError.notFound('Student not found');
  const [invoices, payments, adjustments] = await Promise.all([
    Invoice.find(scope).sort({ createdAt: 1 }), Payment.find(scope).sort({ paidAt: 1 }).populate('receivedBy', 'name'),
    FeeAdjustment.find({ ...scope, status: 'approved' }).sort({ reviewedAt: 1 }),
  ]);
  const totals = { billed: 0, discounts: 0, waived: 0, collected: 0, refunded: 0, due: 0 };
  const ledger = [];
  for (const bill of invoices) {
    totals.billed += bill.grossAmount ?? bill.totalAmount;
    totals.discounts += bill.discountAmount || 0;
    totals.waived += bill.waivedAmount || 0;
    totals.due += amountDue(bill);
    ledger.push({ id: bill.id, date: bill.createdAt, type: 'invoice', reference: bill.invoiceNo,
      debit: bill.grossAmount ?? bill.totalAmount, credit: 0 });
    if (bill.discountAmount) ledger.push({ id: `${bill.id}-discount`, date: bill.createdAt, type: 'concession',
      reference: bill.concessionReason, debit: 0, credit: bill.discountAmount });
  }
  for (const payment of payments) {
    totals.collected += payment.amount;
    ledger.push({ id: payment.id, date: payment.paidAt, type: 'payment', reference: payment.receiptNo || `REC-${payment.id}`,
      debit: 0, credit: payment.amount });
  }
  for (const entry of adjustments) {
    if (entry.type === 'refund') totals.refunded += entry.amount;
    ledger.push({ id: entry.id, date: entry.reviewedAt, type: entry.type, reference: entry.reason,
      debit: entry.type === 'refund' ? entry.amount : 0, credit: ['refund', 'payment_correction'].includes(entry.type) ? 0 : entry.amount });
  }
  ledger.sort((a, b) => +new Date(a.date) - +new Date(b.date) || a.id.localeCompare(b.id));
  let balance = 0;
  for (const entry of ledger) { balance = money(balance + entry.debit - entry.credit); entry.balance = balance; }
  for (const key of Object.keys(totals)) totals[key] = money(totals[key]);
  res.json({ student, invoices, payments, adjustments, totals, ledger });
});

router.get('/dues-report', ...managers, async (req, res) => {
  const filter = { status: { $ne: 'cancelled' } };
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.class) filter.student = { $in: await Student.find({ class: req.query.class }).distinct('_id') };
  const invoices = await Invoice.find(filter).populate('student', 'name admissionNo class');
  const todayEnd = parseDay(schoolDate(), true);
  const totals = { billed: 0, discounts: 0, waived: 0, paid: 0, due: 0, overdue: 0 };
  const rows = new Map();
  for (const bill of invoices) {
    if (!bill.student) continue;
    const sid = bill.student.id;
    if (!rows.has(sid)) rows.set(sid, { student: bill.student, billed: 0, discounts: 0, waived: 0, paid: 0, due: 0, overdue: 0 });
    const amounts = { billed: bill.grossAmount ?? bill.totalAmount, discounts: bill.discountAmount || 0,
      waived: bill.waivedAmount || 0, paid: bill.paidAmount, due: amountDue(bill),
      overdue: bill.dueDate && bill.dueDate < parseDay(schoolDate()) ? amountDue(bill) : 0 };
    for (const key of Object.keys(totals)) { totals[key] = money(totals[key] + amounts[key]); rows.get(sid)[key] = money(rows.get(sid)[key] + amounts[key]); }
  }
  res.json({ totals, items: [...rows.values()], asOf: schoolDate(todayEnd) });
});

const adjustmentSchema = z.object({ invoice: id, payment: id.optional(), type: z.enum(['waiver', 'cancellation', 'refund', 'payment_correction']),
  amount: currency, reason: z.string().trim().min(3) });
router.get('/adjustments', ...managers, async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  res.json(await paginated(FeeAdjustment, filter, req.query,
    [{ path: 'student', select: 'name admissionNo' }, { path: 'invoice', select: 'invoiceNo' },
      { path: 'payment', select: 'receiptNo' }, { path: 'requestedBy', select: 'name' }, { path: 'reviewedBy', select: 'name' }], { createdAt: -1 }));
});
router.post('/adjustments', ...managers, validate(adjustmentSchema), async (req, res) => {
  const invoice = await Invoice.findById(req.body.invoice);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === 'cancelled') throw ApiError.badRequest('Invoice is already cancelled');
  if (!['cancellation', 'payment_correction'].includes(req.body.type) && req.body.amount <= 0) throw ApiError.badRequest('Enter an amount greater than zero');
  let previousAmount;
  if (req.body.type === 'payment_correction') {
    const payment = await Payment.findOne({ _id: req.body.payment, invoice: invoice.id });
    if (!payment) throw ApiError.badRequest('Choose a payment from this invoice');
    previousAmount = payment.amount;
    if (req.body.amount === payment.amount) throw ApiError.badRequest('Enter a different corrected amount');
    if (req.body.amount < payment.refundedAmount) throw ApiError.badRequest('Corrected amount cannot be below money already refunded');
    if (money(req.body.amount - payment.amount) > amountDue(invoice)) throw ApiError.badRequest('Correction would overpay the invoice');
  }
  if (req.body.type === 'waiver' && req.body.amount > amountDue(invoice)) throw ApiError.badRequest('Waiver exceeds outstanding balance');
  if (req.body.type === 'cancellation' && invoice.paidAmount > 0) throw ApiError.badRequest('Refund retained payments before cancelling this invoice');
  if (req.body.type === 'refund') {
    const payment = await Payment.findOne({ _id: req.body.payment, invoice: invoice.id });
    if (!payment || req.body.amount > money(payment.amount - (payment.refundedAmount || 0))) throw ApiError.badRequest('Select a payment with enough refundable balance');
  }
  const item = await FeeAdjustment.create({ ...req.body, amount: req.body.type === 'cancellation' ? amountDue(invoice) : req.body.amount,
    previousAmount, student: invoice.student, requestedBy: req.user._id });
  res.status(201).json({ item });
});
router.post('/adjustments/:id/review', ...admins,
  validate(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().min(3) })), async (req, res) => {
  const item = await withBillingTransaction(async (session) => {
    const entry = await FeeAdjustment.findOne({ _id: req.params.id, status: 'pending' }).session(session);
    if (!entry) throw ApiError.conflict('This request has already been reviewed');
    if (req.body.decision === 'approved') {
      const invoice = await Invoice.findById(entry.invoice).session(session);
      if (!invoice || invoice.status === 'cancelled') throw ApiError.conflict('Invoice is unavailable or already cancelled');
      if (entry.type === 'payment_correction') {
        const payment = await Payment.findOne({ _id: entry.payment, invoice: invoice.id }).session(session);
        if (!payment || payment.amount !== entry.previousAmount) throw ApiError.conflict('Payment changed. Submit a new correction request.');
        const delta = money(entry.amount - payment.amount);
        if (entry.amount < payment.refundedAmount || delta > amountDue(invoice) || invoice.paidAmount + delta < 0) {
          throw ApiError.conflict('Balance or refunds changed; this correction is no longer valid');
        }
        payment.originalAmount ??= payment.amount;
        payment.corrections.push({ previousAmount: payment.amount, correctedAmount: entry.amount, reason: entry.reason,
          requestedBy: entry.requestedBy, approvedBy: req.user._id, approvedAt: new Date() });
        payment.amount = entry.amount;
        invoice.paidAmount = money(invoice.paidAmount + delta);
        await payment.save({ session });
      } else if (entry.type === 'waiver') {
        if (entry.amount > amountDue(invoice)) throw ApiError.conflict('Outstanding balance changed; request a revised waiver');
        invoice.waivedAmount = money((invoice.waivedAmount || 0) + entry.amount);
      } else if (entry.type === 'cancellation') {
        if (invoice.paidAmount > 0) throw ApiError.conflict('Refund retained payments before cancellation');
        entry.amount = amountDue(invoice);
        invoice.status = 'cancelled';
      } else {
        const payment = await Payment.findOne({ _id: entry.payment, invoice: invoice.id }).session(session);
        if (!payment || entry.amount > money(payment.amount - (payment.refundedAmount || 0)) || entry.amount > invoice.paidAmount) {
          throw ApiError.conflict('Refund exceeds retained payment');
        }
        payment.refundedAmount = money((payment.refundedAmount || 0) + entry.amount);
        invoice.paidAmount = money(invoice.paidAmount - entry.amount);
        await payment.save({ session });
      }
      updateInvoiceStatus(invoice);
      await invoice.save({ session });
    }
    entry.status = req.body.decision;
    entry.reviewNote = req.body.note;
    entry.reviewedBy = req.user._id;
    entry.reviewedAt = new Date();
    await entry.save({ session });
    return entry;
  });
  res.json({ item });
});

export default router;
