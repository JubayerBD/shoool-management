import { Income, Expense, SalaryPayment } from '../models/Finance.js';
import { Payment } from '../models/Fees.js';
import { FeeAdjustment } from '../models/FeeWorkflow.js';
import { PartnerDeposit } from '../models/Partner.js';
import { ProfitDistribution } from '../models/ProfitDistribution.js';
import { OpeningBalance, ProfitPayment } from '../models/CashBalance.js';
import { schoolDate, parseDay } from '../utils/financeDates.js';
import { ApiError } from '../utils/ApiError.js';
import { correctionEvents } from './financialOperations.js';

export function checkedCents(value) {
  const amount = Math.round(value * 100);
  if (!Number.isSafeInteger(amount)) throw ApiError.badRequest('Money amount exceeds the supported limit');
  return amount;
}
function checkedSum(total, value) {
  const result = total + value;
  if (!Number.isSafeInteger(result)) throw ApiError.badRequest('Balance exceeds the supported limit');
  return result;
}

export async function cashBalance(session) {
  const today = schoolDate(), cutoff = parseDay(today, true);
  const events = [];
  const add = (row, kind, amountCents, party = '') => events.push({ id: String(row._id), key: `${kind}-${row._id}`, date: row.date || row.paidAt || row.reviewedAt,
    kind, amountCents, party, method: row.method || '', reference: row.reference || row.transactionRef || '', note: row.note || row.reason || '',
    partner: row.partner?._id ? String(row.partner._id) : undefined, recordedAt: row.createdAt });
  const opening = await OpeningBalance.findOne({ key: 'opening' }).session(session).lean();
  if (opening && opening.date <= cutoff) add(opening, 'opening', opening.amountCents);
  const fees = await Payment.find({ paidAt: { $lte: cutoff } }).populate('student', 'name').session(session).lean();
  for (const r of fees) add(r, 'fees', checkedCents(r.amount), r.student?.name);
  const income = await Income.find({ date: { $lte: cutoff } }).session(session).lean();
  for (const r of income) add(r, 'income', checkedCents(r.amount), r.source);
  const capital = await PartnerDeposit.find({ date: { $lte: cutoff } }).populate('partner', 'name').session(session).lean();
  for (const r of capital) add(r, 'capital', r.amountCents, r.partner?.name);
  const expense = await Expense.find({ date: { $lte: cutoff } }).session(session).lean();
  for (const r of expense) add(r, 'expense', -checkedCents(r.amount), r.payee);
  const salaries = await SalaryPayment.find({ paidAt: { $lte: cutoff } }).populate('staff', 'name').session(session).lean();
  for (const r of salaries) add(r, 'salary', -checkedCents(r.net), r.staff?.name);
  const refunds = await FeeAdjustment.find({ status: 'approved', type: 'refund', reviewedAt: { $lte: cutoff } }).populate('student', 'name').session(session).lean();
  for (const r of refunds) add(r, 'refund', -checkedCents(r.amount), r.student?.name);
  const payments = await ProfitPayment.find({ date: { $lte: cutoff } }).populate('partner', 'name').session(session).lean();
  for (const r of payments) add(r, 'profit-payment', -r.amountCents, r.partner?.name);
  const corrections = await correctionEvents({ effectiveAt: { $lte: cutoff } }, session);
  for (const r of corrections) add({ _id: r.id, date: r.date, createdAt: r.date, note: r.reason, reference: r.reference }, 'correction', r.cashCents, r.party);
  events.sort((a, b) => +new Date(a.date) - +new Date(b.date) || +new Date(a.recordedAt) - +new Date(b.recordedAt) || a.key.localeCompare(b.key));
  let balance = 0;
  const totals = {};
  for (const event of events) {
    balance = checkedSum(balance, event.amountCents);
    event.balanceCents = balance;
    totals[event.kind] = checkedSum(totals[event.kind] || 0, event.amountCents);
  }
  const distributions = await ProfitDistribution.find({ createdAt: { $lte: cutoff } }).sort({ createdAt: -1, _id: -1 }).session(session).lean();
  const paidByAllocation = new Map();
  for (const r of payments) {
    const key = `${r.distribution}-${r.partner?._id}`;
    paidByAllocation.set(key, checkedSum(paidByAllocation.get(key) || 0, r.amountCents));
  }
  for (const r of corrections.filter((c) => c.targetType === 'profitPayment')) {
    const key = `${r.distribution}-${r.partner}`;
    paidByAllocation.set(key, checkedSum(paidByAllocation.get(key) || 0, -r.amountCents));
  }
  const allocations = [];
  let unpaidCents = 0;
  for (const d of distributions) for (const p of d.report.allocations) {
    const allocated = checkedCents(p.profit), paid = paidByAllocation.get(`${d._id}-${p.id}`) || 0;
    unpaidCents = checkedSum(unpaidCents, allocated - paid);
    allocations.push({ distribution: String(d._id), partner: p.id, name: p.name, from: d.from, to: d.to,
      recordedDate: schoolDate(d.createdAt), allocated: allocated / 100, paid: paid / 100, unpaid: (allocated - paid) / 100 });
  }
  return { asOf: today, currentBalance: balance / 100, unpaidProfit: unpaidCents / 100, balanceAfterUnpaidProfit: checkedSum(balance, -unpaidCents) / 100,
    opening: opening ? { ...opening, id: String(opening._id), amount: opening.amountCents / 100 } : null,
    totals: Object.fromEntries(Object.entries(totals).map(([key, amount]) => [key, amount / 100])), allocations, events };
}

export function balanceStatement(data, from, to) {
  const start = parseDay(from), end = parseDay(to, true);
  if (from > to || to > data.asOf) throw ApiError.badRequest('Choose a valid date range ending today or earlier');
  const openingCents = data.events.filter((r) => new Date(r.date) < start).reduce((sum, r) => checkedSum(sum, r.amountCents), 0);
  const rows = data.events.filter((r) => new Date(r.date) >= start && new Date(r.date) <= end);
  const inflow = rows.filter((r) => r.amountCents > 0).reduce((sum, r) => checkedSum(sum, r.amountCents), 0);
  const outflow = rows.filter((r) => r.amountCents < 0).reduce((sum, r) => checkedSum(sum, -r.amountCents), 0);
  return { from, to, openingBalance: openingCents / 100, inflow: inflow / 100, outflow: outflow / 100,
    closingBalance: checkedSum(checkedSum(openingCents, inflow), -outflow) / 100,
    rows: rows.map(({ amountCents, balanceCents, ...r }) => ({ ...r, amount: amountCents / 100, balance: balanceCents / 100 })) };
}
