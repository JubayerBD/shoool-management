import { Router } from 'express';
import { createManualEntry, correctionEvents, correctionRows } from '../../services/financialOperations.js';
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
import { Teacher } from '../../models/People.js';
import { FeeAdjustment } from '../../models/FeeWorkflow.js';
import { rangeFilter, schoolDate, parseDay } from '../../utils/financeDates.js';
import { pagination, paginated } from '../../utils/pagination.js';
import { PartnerDeposit } from '../../models/Partner.js';
import { partnerIncome, PARTNER_INCOME_CATEGORY } from '../../services/partnerIncome.js';

const router = Router();
const finance = [requireAuth, requireRole('admin', 'accountant')];

function documentNumber(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw ApiError.badRequest(`${label} is required`);
  if (value.trim().length > 200) throw ApiError.badRequest(`${label} must be at most 200 characters`);
  return value.trim();
}

/* ----------------------------- helpers ----------------------------- */

/** A positive taka amount with at most 2 decimal places. */
function parseAmount(raw, label = 'Amount') {
  if (!['string', 'number'].includes(typeof raw)) throw ApiError.badRequest(`${label} must be a valid amount`);
  const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw ApiError.badRequest(`${label} must be greater than zero`);
  if (!Number.isSafeInteger(Math.round(n * 100))) throw ApiError.badRequest(`${label} exceeds the supported limit`);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw ApiError.badRequest(`${label} can have at most 2 decimal places`);
  return n;
}

/** A zero-or-positive amount with at most 2 decimal places (salary parts). */
function parseNonNegative(raw, label) {
  if (raw !== undefined && raw !== null && !['string', 'number'].includes(typeof raw)) throw ApiError.badRequest(`${label} must be a valid amount`);
  const n = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(n) || n < 0) throw ApiError.badRequest(`${label} cannot be negative`);
  if (!Number.isSafeInteger(Math.round(n * 100))) throw ApiError.badRequest(`${label} exceeds the supported limit`);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw ApiError.badRequest(`${label} can have at most 2 decimal places`);
  return n;
}

/** Category (when given) must exist and match the entry type. */
async function checkCategory(categoryId, type) {
  if (!categoryId) return;
  if (categoryId === PARTNER_INCOME_CATEGORY.id) throw ApiError.badRequest('Record partner investments from the partner profile');
  const category = await FinanceCategory.findById(categoryId).select('type');
  if (!category) throw ApiError.badRequest('Category not found');
  if (category.type !== type) throw ApiError.badRequest(`Choose an ${type} category`);
}

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
  if (req.query.type === 'income') items.push(PARTNER_INCOME_CATEGORY);
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
  const item = await FinanceCategory.findById(req.params.id);
  if (!item) throw ApiError.notFound('Category not found');
  if (req.body.type !== undefined && req.body.type !== item.type && (await Income.exists({ category: item._id }) || await Expense.exists({ category: item._id }))) {
    throw ApiError.conflict('The type of a category with existing transactions cannot be changed');
  }
  for (const key of ['type', 'name', 'isActive']) if (req.body[key] !== undefined) item.set(key, req.body[key]);
  await item.save();
  res.json({ item });
});

router.delete('/categories/:id', ...finance, async (req, res) => {
  const [usedIncome, usedExpense] = await Promise.all([
    Income.exists({ category: req.params.id }),
    Expense.exists({ category: req.params.id }),
  ]);
  if (usedIncome || usedExpense) {
    throw ApiError.conflict('This category has entries. Deactivate it instead of deleting it.');
  }
  const item = await FinanceCategory.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Category not found');
  res.json({ ok: true, id: req.params.id });
});

/* ----------------------------- income ----------------------------- */

router.get('/income', ...finance, async (req, res) => {
  const { from, to, category, method, search } = req.query;
  const { page, limit, skip } = pagination(req.query);
  const filter = { ...rangeFilter('date', from, to) };
  if (category) filter.category = category;
  if (method) filter.method = method;
  if (search) filter.source = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [manual, deposits] = await Promise.all([
    category === PARTNER_INCOME_CATEGORY.id ? [] : Income.find(filter).populate('category', 'name'),
    (!category || category === PARTNER_INCOME_CATEGORY.id) && !method ? partnerIncome(rangeFilter('date', from, to)) : [],
  ]);
  const reversals = await correctionRows('income', rangeFilter('effectiveAt', from, to), req.query);
  const items = [...manual.map((r) => r.toJSON()), ...deposits.filter((r) => !search || r.source.toLowerCase().includes(String(search).toLowerCase())), ...reversals];
  items.sort((a, b) => new Date(b.date) - new Date(a.date) || String(b.id).localeCompare(String(a.id)));
  res.json({ items: items.slice(skip, skip + limit), total: items.length, page, limit, pages: Math.ceil(items.length / limit) });
});

router.post('/income', ...finance, async (req, res) => {
  const item = await createManualEntry('income', req.body, req.user);
  res.status(201).json({ item });
});

router.put('/income/:id', ...finance, async (_req, _res) => {
  throw ApiError.conflict('Original financial entries cannot be edited or deleted. Submit a correction or reversal for admin approval.');
});

router.delete('/income/:id', ...finance, async (_req, _res) => {
  throw ApiError.conflict('Original financial entries cannot be edited or deleted. Submit a correction or reversal for admin approval.');
});

/* ----------------------------- expenses ----------------------------- */

router.get('/expenses', ...finance, async (req, res) => {
  const { from, to, category, method, search } = req.query;
  const filter = { ...rangeFilter('date', from, to) };
  if (category) filter.category = category;
  if (method) filter.method = method;
  if (search) filter.payee = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const { page, limit, skip } = pagination(req.query);
  const original = await Expense.find(filter).populate('category', 'name');
  const items = [...original.map((r) => r.toJSON()), ...await correctionRows('expense', rangeFilter('effectiveAt', from, to), req.query)];
  items.sort((a, b) => +new Date(b.date) - +new Date(a.date) || String(b.id).localeCompare(String(a.id)));
  res.json({ items: items.slice(skip, skip + limit), total: items.length, page, limit, pages: Math.ceil(items.length / limit) });
});

router.post('/expenses', ...finance, async (req, res) => {
  const item = await createManualEntry('expense', req.body, req.user);
  res.status(201).json({ item });
});

router.put('/expenses/:id', ...finance, async (_req, _res) => {
  throw ApiError.conflict('Original financial entries cannot be edited or deleted. Submit a correction or reversal for admin approval.');
});

router.delete('/expenses/:id', ...finance, async (_req, _res) => {
  throw ApiError.conflict('Original financial entries cannot be edited or deleted. Submit a correction or reversal for admin approval.');
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
  if (!(await Teacher.exists({ _id: staff }))) throw ApiError.badRequest('Staff member not found');
  const item = await SalaryStructure.findOneAndUpdate(
    { staff },
    { staff, basic: parseNonNegative(basic, 'Basic salary'), allowances: parseNonNegative(allowances, 'Allowances'), isActive: isActive !== false },
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
  const { page, limit, skip } = pagination(req.query);
  const originals = await SalaryPayment.find(filter).populate('staff', 'name employeeId designation');
  const items = [...originals.map((r) => r.toJSON()), ...await correctionRows('salary', rangeFilter('effectiveAt', from, to), req.query)];
  items.sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt) || String(b.id).localeCompare(String(a.id)));
  res.json({ items: items.slice(skip, skip + limit), total: items.length, page, limit, pages: Math.ceil(items.length / limit) });
});

router.post('/salaries', ...finance, async (req, res) => {
  const { staff, month, basic = 0, allowances = 0, deductions = 0, method, note, paidAt } = req.body;
  if (!staff || !month) throw ApiError.badRequest('Staff and month are required');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw ApiError.badRequest('Month must look like 2026-10');
  if (!(await Teacher.exists({ _id: staff }))) throw ApiError.badRequest('Staff member not found');
  const parts = {
    basic: parseNonNegative(basic, 'Basic salary'),
    allowances: parseNonNegative(allowances, 'Allowances'),
    deductions: parseNonNegative(deductions, 'Deductions'),
  };
  const net = Math.round((parts.basic + parts.allowances - parts.deductions) * 100) / 100;
  if (net < 0) throw ApiError.badRequest('Net salary cannot be negative');
  const existing = await SalaryPayment.findOne({ staff, month, isReversed: { $ne: true } });
  if (existing) throw ApiError.conflict('Salary for this staff and month is already paid');
  const item = await SalaryPayment.create({
    staff,
    month,
    ...parts,
    net,
    method: method || 'cash',
    note: note || '',
    paidAt: typeof paidAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? parseDay(paidAt) : paidAt || Date.now(),
    recordedBy: req.user._id,
  });
  const populated = await item.populate('staff', 'name employeeId designation');
  res.status(201).json({ item: populated });
});

router.delete('/salaries/:id', ...finance, async (_req, _res) => {
  throw ApiError.conflict('Salary payments cannot be deleted. Submit a reversal for admin approval.');
});

/* ----------------------------- reports ----------------------------- */

// Headline totals for a period (fees + other income vs general + salary expense).
router.get('/summary', ...finance, async (req, res) => {
  const { from, to } = req.query;
  const incRange = rangeFilter('date', from, to);
  const payRange = rangeFilter('paidAt', from, to);

  const [feeCollected, manualIncome, generalExpense, salaryExpense, feeRefunds, partnerCents] = await Promise.all([
    sum(Payment, payRange),
    sum(Income, incRange),
    sum(Expense, incRange),
    sum(SalaryPayment, payRange, 'net'),
    sum(FeeAdjustment, { status: 'approved', type: 'refund', ...rangeFilter('reviewedAt', from, to) }),
    sum(PartnerDeposit, incRange, 'amountCents'),
  ]);
  const feeIncome = feeCollected - feeRefunds;
  const corrections = await correctionEvents(rangeFilter('effectiveAt', from, to));
  const incomeAdjustment = corrections.reduce((n, r) => n + r.incomeCents, 0) / 100;
  const generalAdjustment = corrections.filter((r) => r.targetType === 'expense').reduce((n, r) => n + r.expenseCents, 0) / 100;
  const salaryAdjustment = corrections.filter((r) => r.targetType === 'salary').reduce((n, r) => n + r.expenseCents, 0) / 100;
  const otherIncome = manualIncome + partnerCents / 100 + incomeAdjustment;

  const income = feeIncome + otherIncome;
  const expense = generalExpense + salaryExpense + generalAdjustment + salaryAdjustment;
  res.json({
    summary: {
      income: { fees: feeIncome, other: otherIncome, total: income },
      expense: { general: generalExpense + generalAdjustment, salary: salaryExpense + salaryAdjustment, total: expense },
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
  const investments = await partnerIncome(incRange);
  const investmentTotal = investments.reduce((total, r) => total + r.amount, 0);
  if (investmentTotal) incomeByHead.push({ label: PARTNER_INCOME_CATEGORY.name, total: investmentTotal });
  if (feeTotal !== 0) incomeByHead.unshift({ label: { en: 'Fees', bn: 'ফি' }, total: feeTotal });

  // Expense by head + a Salary bucket.
  const expenseAgg = await Expense.aggregate([
    { $match: incRange },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  const salaryTotal = await sum(SalaryPayment, payRange, 'net');
  const expenseByHead = expenseAgg.map((r) => ({ label: catName(r._id), total: r.total }));
  const corrections = await correctionEvents(rangeFilter('effectiveAt', from, to));
  const adjustHead = (heads, label, amount) => {
    const existing = heads.find((h) => JSON.stringify(h.label) === JSON.stringify(label));
    if (existing) existing.total += amount; else heads.push({ label, total: amount });
  };
  for (const r of corrections) {
    if (r.targetType === 'income') adjustHead(incomeByHead, catName(r.category), r.incomeCents / 100);
    if (r.targetType === 'partnerDeposit') adjustHead(incomeByHead, PARTNER_INCOME_CATEGORY.name, r.incomeCents / 100);
    if (r.targetType === 'expense') adjustHead(expenseByHead, catName(r.category), r.expenseCents / 100);
  }
  const correctedSalary = salaryTotal + corrections.filter((r) => r.targetType === 'salary').reduce((n, r) => n + r.expenseCents / 100, 0);
  if (correctedSalary !== 0) expenseByHead.unshift({ label: { en: 'Salary', bn: 'বেতন' }, total: correctedSalary });

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
  for (const r of investments) ensure(monthKey(r.date)).income += r.amount;
  for (const r of fees) ensure(monthKey(r.paidAt)).income += r.amount;
  for (const r of exps) ensure(monthKey(r.date)).expense += r.amount;
  for (const r of sals) ensure(monthKey(r.paidAt)).expense += r.net;
  for (const r of refunds) ensure(monthKey(r.reviewedAt)).income -= r.amount;
  for (const r of corrections) { ensure(monthKey(r.date)).income += r.incomeCents / 100; ensure(monthKey(r.date)).expense += r.expenseCents / 100; }

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
  for (const r of await correctionEvents(rangeFilter('effectiveAt', from, to))) {
    const direction = r.incomeCents ? 'income' : 'expense';
    if (!r.incomeCents && !r.expenseCents || direction === 'income' && !wantIncome || direction === 'expense' && !wantExpense) continue;
    out.push({ id: r.id, date: r.date, direction, source: 'correction', category: { en: 'Approved reversal', bn: 'অনুমোদিত বিপরীত এন্ট্রি' }, party: r.party, amount: (r.incomeCents || r.expenseCents) / 100, method: '', note: r.reason });
  }

  if (wantIncome) {
    const investments = await partnerIncome(incRange);
    for (const r of investments) out.push({ id: r.id, date: r.date, direction: 'income', source: 'partner', category: PARTNER_INCOME_CATEGORY.name, party: r.source, amount: r.amount, method: r.method, note: r.note });
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
