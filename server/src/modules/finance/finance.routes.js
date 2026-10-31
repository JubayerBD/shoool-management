import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  FinanceCategory,
  Income,
  Expense,
  SalaryStructure,
  SalaryPayment,
} from '../../models/Finance.js';
import { Payment } from '../../models/Fees.js';
import { FeeAdjustment } from '../../models/FeeWorkflow.js';
import { rangeFilter, schoolDate, parseDay } from '../../utils/financeDates.js';
import { pagination, paginated } from '../../utils/pagination.js';

const router = Router();
const finance = [requireAuth, requireRole('admin', 'accountant')];

/* ----------------------------- helpers ----------------------------- */

async function sum(Model, match, field = 'amount') {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return rows[0]?.total || 0;
}

/* ----------------------------- categories ----------------------------- */

router.get('/categories', ...finance, async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  const items = await FinanceCategory.find(filter).sort({ 'name.en': 1 });
  res.json({ items });
});

router.post('/categories', ...finance, async (req, res) => {
  const { type, name, isActive } = req.body;
  if (!['income', 'expense'].includes(type)) throw ApiError.badRequest('Invalid category type');
  if (!name?.en) throw ApiError.badRequest('English name is required');
  const item = await FinanceCategory.create({ type, name, isActive: isActive !== false });
  res.status(201).json({ item });
});

router.put('/categories/:id', ...finance, async (req, res) => {
  const item = await FinanceCategory.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!item) throw ApiError.notFound('Category not found');
  res.json({ item });
});

router.delete('/categories/:id', ...finance, async (req, res) => {
  const item = await FinanceCategory.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Category not found');
  res.json({ ok: true, id: req.params.id });
});

/* ----------------------------- income ----------------------------- */

router.get('/income', ...finance, async (req, res) => {
  const { from, to, category, method, search } = req.query;
  const filter = { ...rangeFilter('date', from, to) };
  if (category) filter.category = category;
  if (method) filter.method = method;
  if (search) filter.source = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  res.json(await paginated(Income, filter, req.query, { path: 'category', select: 'name' }, { date: -1 }));
});

router.post('/income', ...finance, async (req, res) => {
  const body = { ...req.body, amount: Number(req.body.amount), recordedBy: req.user._id };
  if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) body.date = parseDay(body.date);
  delete body.generationKey;
  delete body.recurringSource;
  const item = await Income.create(body);
  res.status(201).json({ item });
});

router.put('/income/:id', ...finance, async (req, res) => {
  if (req.body.amount !== undefined) req.body.amount = Number(req.body.amount);
  if (typeof req.body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)) req.body.date = parseDay(req.body.date);
  delete req.body.generationKey;
  delete req.body.recurringSource;
  delete req.body.recordedBy;
  const item = await Income.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) throw ApiError.notFound('Income not found');
  res.json({ item });
});

router.delete('/income/:id', ...finance, async (req, res) => {
  const item = await Income.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Income not found');
  res.json({ ok: true, id: req.params.id });
});

/* ----------------------------- expenses ----------------------------- */

router.get('/expenses', ...finance, async (req, res) => {
  const { from, to, category, method, search } = req.query;
  const filter = { ...rangeFilter('date', from, to) };
  if (category) filter.category = category;
  if (method) filter.method = method;
  if (search) filter.payee = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  res.json(await paginated(Expense, filter, req.query, { path: 'category', select: 'name' }, { date: -1 }));
});

router.post('/expenses', ...finance, async (req, res) => {
  const body = { ...req.body, amount: Number(req.body.amount), recordedBy: req.user._id };
  if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) body.date = parseDay(body.date);
  delete body.generationKey;
  delete body.recurringSource;
  const item = await Expense.create(body);
  res.status(201).json({ item });
});

router.put('/expenses/:id', ...finance, async (req, res) => {
  if (req.body.amount !== undefined) req.body.amount = Number(req.body.amount);
  if (typeof req.body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)) req.body.date = parseDay(req.body.date);
  delete req.body.generationKey;
  delete req.body.recurringSource;
  delete req.body.recordedBy;
  const item = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) throw ApiError.notFound('Expense not found');
  res.json({ item });
});

router.delete('/expenses/:id', ...finance, async (req, res) => {
  const item = await Expense.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Expense not found');
  res.json({ ok: true, id: req.params.id });
});

/* ----------------------------- salary structures ----------------------------- */

router.get('/salary-structures', ...finance, async (_req, res) => {
  const items = await SalaryStructure.find().populate('staff', 'name employeeId');
  res.json({ items });
});

// Upsert a staff member's salary structure.
router.post('/salary-structures', ...finance, async (req, res) => {
  const { staff, basic, allowances, isActive } = req.body;
  if (!staff) throw ApiError.badRequest('Staff is required');
  const item = await SalaryStructure.findOneAndUpdate(
    { staff },
    { staff, basic: Number(basic) || 0, allowances: Number(allowances) || 0, isActive: isActive !== false },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate('staff', 'name employeeId');
  res.json({ item });
});

/* ----------------------------- salary payments ----------------------------- */

router.get('/salaries', ...finance, async (req, res) => {
  const { from, to, staff, month } = req.query;
  const filter = { ...rangeFilter('paidAt', from, to) };
  if (staff) filter.staff = staff;
  if (month) filter.month = month;
  res.json(await paginated(SalaryPayment, filter, req.query, { path: 'staff', select: 'name employeeId designation' }, { paidAt: -1 }));
});

router.post('/salaries', ...finance, async (req, res) => {
  const { staff, month, basic = 0, allowances = 0, deductions = 0, method, note, paidAt } = req.body;
  if (!staff || !month) throw ApiError.badRequest('Staff and month are required');
  const net = Number(basic) + Number(allowances) - Number(deductions);
  if (net < 0) throw ApiError.badRequest('Net salary cannot be negative');
  const existing = await SalaryPayment.findOne({ staff, month });
  if (existing) throw ApiError.conflict('Salary for this staff and month is already paid');
  const item = await SalaryPayment.create({
    staff,
    month,
    basic: Number(basic),
    allowances: Number(allowances),
    deductions: Number(deductions),
    net,
    method: method || 'cash',
    note: note || '',
    paidAt: typeof paidAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? parseDay(paidAt) : paidAt || Date.now(),
    recordedBy: req.user._id,
  });
  const populated = await item.populate('staff', 'name employeeId designation');
  res.status(201).json({ item: populated });
});

router.delete('/salaries/:id', ...finance, async (req, res) => {
  const item = await SalaryPayment.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Salary payment not found');
  res.json({ ok: true, id: req.params.id });
});

/* ----------------------------- reports ----------------------------- */

// Headline totals for a period (fees + other income vs general + salary expense).
router.get('/summary', ...finance, async (req, res) => {
  const { from, to } = req.query;
  const incRange = rangeFilter('date', from, to);
  const payRange = rangeFilter('paidAt', from, to);

  const [feeCollected, otherIncome, generalExpense, salaryExpense, feeRefunds] = await Promise.all([
    sum(Payment, payRange),
    sum(Income, incRange),
    sum(Expense, incRange),
    sum(SalaryPayment, payRange, 'net'),
    sum(FeeAdjustment, { status: 'approved', type: 'refund', ...rangeFilter('reviewedAt', from, to) }),
  ]);
  const feeIncome = feeCollected - feeRefunds;

  const income = feeIncome + otherIncome;
  const expense = generalExpense + salaryExpense;
  res.json({
    summary: {
      income: { fees: feeIncome, other: otherIncome, total: income },
      expense: { general: generalExpense, salary: salaryExpense, total: expense },
      net: income - expense,
    },
  });
});

// Category-wise breakdown + monthly income-vs-expense for charts.
router.get('/analytics', ...finance, async (req, res) => {
  const { from, to } = req.query;
  const incRange = rangeFilter('date', from, to);
  const payRange = rangeFilter('paidAt', from, to);

  const cats = await FinanceCategory.find().lean();
  const catName = (id) => cats.find((c) => String(c._id) === String(id))?.name || null;

  // Income by head (manual) + a Fees bucket.
  const incomeAgg = await Income.aggregate([
    { $match: incRange },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  const feeTotal = await sum(Payment, payRange) - await sum(FeeAdjustment, { status: 'approved', type: 'refund', ...rangeFilter('reviewedAt', from, to) });
  const incomeByHead = incomeAgg.map((r) => ({ label: catName(r._id), total: r.total }));
  if (feeTotal !== 0) incomeByHead.unshift({ label: { en: 'Fees', bn: 'ফি' }, total: feeTotal });

  // Expense by head + a Salary bucket.
  const expenseAgg = await Expense.aggregate([
    { $match: incRange },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  const salaryTotal = await sum(SalaryPayment, payRange, 'net');
  const expenseByHead = expenseAgg.map((r) => ({ label: catName(r._id), total: r.total }));
  if (salaryTotal > 0) expenseByHead.unshift({ label: { en: 'Salary', bn: 'বেতন' }, total: salaryTotal });

  // The chart uses exactly the same range as the headline and category totals.
  const monthKey = (d) => schoolDate(d).slice(0, 7);
  const buckets = {};
  const ensure = (k) => (buckets[k] ||= { label: k, income: 0, expense: 0 });

  const [incs, fees, exps, sals, refunds] = await Promise.all([
    Income.find(incRange).select('date amount').lean(),
    Payment.find(payRange).select('paidAt amount').lean(),
    Expense.find(incRange).select('date amount').lean(),
    SalaryPayment.find(payRange).select('paidAt net').lean(),
    FeeAdjustment.find({ status: 'approved', type: 'refund', ...rangeFilter('reviewedAt', from, to) }).select('reviewedAt amount').lean(),
  ]);
  for (const r of incs) ensure(monthKey(r.date)).income += r.amount;
  for (const r of fees) ensure(monthKey(r.paidAt)).income += r.amount;
  for (const r of exps) ensure(monthKey(r.date)).expense += r.amount;
  for (const r of sals) ensure(monthKey(r.paidAt)).expense += r.net;
  for (const r of refunds) ensure(monthKey(r.reviewedAt)).income -= r.amount;

  const monthly = Object.values(buckets).sort((a, b) => a.label.localeCompare(b.label));

  res.json({ incomeByHead, expenseByHead, monthly });
});

// Unified ledger of every money movement, newest first.
router.get('/transactions', ...finance, async (req, res) => {
  const { from, to, type } = req.query;
  const incRange = rangeFilter('date', from, to);
  const payRange = rangeFilter('paidAt', from, to);

  const wantIncome = !type || type === 'income';
  const wantExpense = !type || type === 'expense';

  const out = [];

  if (wantIncome) {
    const incs = await Income.find(incRange).populate('category', 'name').lean();
    for (const r of incs)
      out.push({
        id: String(r._id),
        date: r.date,
        direction: 'income',
        source: 'manual',
        category: r.category?.name || null,
        party: r.source || '',
        amount: r.amount,
        method: r.method,
        note: r.note || '',
      });
    const refunds = await FeeAdjustment.find({ status: 'approved', type: 'refund', ...rangeFilter('reviewedAt', from, to) }).populate('student', 'name admissionNo').lean();
    for (const r of refunds) out.push({ id: String(r._id), date: r.reviewedAt, direction: 'income', source: 'refund',
      category: { en: 'Fee refunds', bn: '' }, party: r.student?.name || '', amount: -r.amount, method: '', note: r.reason });
    const fees = await Payment.find(payRange).populate('student', 'name admissionNo').lean();
    for (const r of fees)
      out.push({
        id: String(r._id),
        date: r.paidAt,
        direction: 'income',
        source: 'fee',
        category: { en: 'Fees', bn: 'ফি' },
        party: r.student?.name || '',
        amount: r.amount,
        method: r.method,
        note: r.note || '',
      });
  }

  if (wantExpense) {
    const exps = await Expense.find(incRange).populate('category', 'name').lean();
    for (const r of exps)
      out.push({
        id: String(r._id),
        date: r.date,
        direction: 'expense',
        source: 'manual',
        category: r.category?.name || null,
        party: r.payee || '',
        amount: r.amount,
        method: r.method,
        note: r.note || '',
      });
    const sals = await SalaryPayment.find(payRange).populate('staff', 'name employeeId').lean();
    for (const r of sals)
      out.push({
        id: String(r._id),
        date: r.paidAt,
        direction: 'expense',
        source: 'salary',
        category: { en: 'Salary', bn: 'বেতন' },
        party: r.staff?.name || '',
        amount: r.net,
        method: r.method,
        note: `${r.month}${r.note ? ' · ' + r.note : ''}`,
      });
  }

  out.sort((a, b) => new Date(b.date) - new Date(a.date) || a.id.localeCompare(b.id));
  const { page, limit, skip } = pagination(req.query);
  res.json({ transactions: out.slice(skip, skip + limit), total: out.length, page, limit, pages: Math.ceil(out.length / limit) });
});

export default router;
