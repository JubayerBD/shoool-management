import { createHash } from 'node:crypto';
import { FinanceCategory, Income, Expense, SalaryPayment } from '../models/Finance.js';
import { Payment } from '../models/Fees.js';
import { FeeAdjustment } from '../models/FeeWorkflow.js';
import { Partner, PartnerDeposit } from '../models/Partner.js';
import { ApiError } from '../utils/ApiError.js';
import { rangeFilter, schoolDate, parseDay } from '../utils/financeDates.js';
import { capitalShares } from '../utils/partnerCapital.js';
import { correctionEvents } from './financialOperations.js';

export async function profitOptions(session = null) {
  const categories = await FinanceCategory.find().sort({ _id: 1 }).session(session).lean();
  const income = [
    { id: 'fees', name: { en: 'Fee collections (less refunds)', bn: 'ফি আদায় (ফেরত বাদে)' } },
    { id: 'uncategorized-income', name: { en: 'Uncategorized income', bn: 'শ্রেণিবিহীন আয়' } },
    ...categories.filter((c) => c.type === 'income').map((c) => ({ id: String(c._id), name: c.name })),
  ];
  const expense = [
    { id: 'salaries', name: { en: 'Staff salaries', bn: 'কর্মচারীদের বেতন' } },
    { id: 'uncategorized-expense', name: { en: 'Uncategorized expenses', bn: 'শ্রেণিবিহীন ব্যয়' } },
    ...categories.filter((c) => c.type === 'expense').map((c) => ({ id: String(c._id), name: c.name })),
  ];
  return { income, expense };
}

function selection(raw, available) {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !available.some((c) => c.id === id)) || new Set(raw).size !== raw.length) {
    throw ApiError.badRequest('Choose valid categories; partner deposits cannot be included in net profit');
  }
  return [...raw].sort();
}
const cents = (amount) => {
  const result = Math.round(amount * 100);
  if (!Number.isSafeInteger(result)) throw ApiError.badRequest('Amount exceeds the supported limit');
  return result;
};

export async function calculateNetProfit(body, session = null) {
  const { from, to } = body;
  // Require explicit, closed periods so overlap checks have a precise meaning.
  if (!from || !to) throw ApiError.badRequest('Choose a start and end date');
  const dateRange = rangeFilter('date', from, to);
  if (to > schoolDate()) throw ApiError.badRequest('Profit period cannot end in the future');
  const options = await profitOptions(session);
  const incomeCategories = selection(body.incomeCategories, options.income);
  const expenseCategories = selection(body.expenseCategories, options.expense);
  const config = { from, to, incomeCategories, expenseCategories };
  const incomeBuckets = new Map(options.income.map((c) => [c.id, { ...c, amountCents: 0, included: incomeCategories.includes(c.id) }]));
  const expenseBuckets = new Map(options.expense.map((c) => [c.id, { ...c, amountCents: 0, included: expenseCategories.includes(c.id) }]));
  const add = (buckets, id, amount) => { buckets.get(id).amountCents += cents(amount); };
  const incomes = await Income.find(dateRange).session(session).lean();
  for (const row of incomes) add(incomeBuckets, incomeBuckets.has(String(row.category)) ? String(row.category) : 'uncategorized-income', row.amount);
  const expenses = await Expense.find(dateRange).session(session).lean();
  for (const row of expenses) add(expenseBuckets, expenseBuckets.has(String(row.category)) ? String(row.category) : 'uncategorized-expense', row.amount);
  const fees = await Payment.find(rangeFilter('paidAt', from, to)).session(session).lean();
  for (const row of fees) add(incomeBuckets, 'fees', row.amount);
  const refunds = await FeeAdjustment.find({ status: 'approved', type: 'refund', ...rangeFilter('reviewedAt', from, to) }).session(session).lean();
  for (const row of refunds) add(incomeBuckets, 'fees', -row.amount);
  const salaries = await SalaryPayment.find(rangeFilter('paidAt', from, to)).session(session).lean();
  for (const row of salaries) add(expenseBuckets, 'salaries', row.net);
  const corrections = await correctionEvents(rangeFilter('effectiveAt', from, to), session);
  for (const row of corrections) {
    if (row.targetType === 'income') add(incomeBuckets, incomeBuckets.has(String(row.category)) ? String(row.category) : 'uncategorized-income', row.incomeCents / 100);
    if (row.targetType === 'expense') add(expenseBuckets, expenseBuckets.has(String(row.category)) ? String(row.category) : 'uncategorized-expense', row.expenseCents / 100);
    if (row.targetType === 'salary') add(expenseBuckets, 'salaries', row.expenseCents / 100);
  }
  const sum = (buckets) => [...buckets.values()].reduce((total, row) => total + (row.included ? row.amountCents : 0), 0);
  const incomeCents = sum(incomeBuckets), expenseCents = sum(expenseBuckets);
  const netCents = incomeCents - expenseCents;
  if (![incomeCents, expenseCents, netCents].every(Number.isSafeInteger)) throw ApiError.badRequest('Totals exceed the supported limit');
  const partners = await Partner.find().sort({ _id: 1 }).session(session).lean();
  const deposits = await PartnerDeposit.find({ date: { $lte: parseDay(to, true) } }).session(session).lean();
  const capital = new Map(partners.map((p) => [String(p._id), 0]));
  for (const row of deposits) capital.set(String(row.partner), (capital.get(String(row.partner)) || 0) + row.amountCents);
  const capitalReversals = await correctionEvents({ targetType: 'partnerDeposit', effectiveAt: { $lte: parseDay(to, true) } }, session);
  for (const row of capitalReversals) capital.set(String(row.partner), (capital.get(String(row.partner)) || 0) - row.amountCents);
  if ([...capital.values()].some((n) => !Number.isSafeInteger(n))) throw ApiError.badRequest('Capital exceeds the supported limit');
  const shares = capitalShares(partners.map((p) => ({ id: String(p._id), name: p.name, capitalCents: capital.get(String(p._id)) || 0 })), Math.max(0, netCents));
  const breakdown = (buckets) => [...buckets.values()].map(({ amountCents, ...row }) => ({ ...row, amount: amountCents / 100 }));
  const report = { config, income: incomeCents / 100, expense: expenseCents / 100, netProfit: netCents / 100,
    incomeBreakdown: breakdown(incomeBuckets), expenseBreakdown: breakdown(expenseBuckets),
    totalCapital: shares.totalCapital, allocations: shares.items };
  return { ...report, previewHash: createHash('sha256').update(JSON.stringify(report)).digest('hex') };
}
