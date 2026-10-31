import { FeeStructure, Invoice } from '../models/Fees.js';
import { Expense } from '../models/Finance.js';
import { Student } from '../models/People.js';
import { AcademicYear } from '../models/Academic.js';
import { addMonths, parseDay, schoolDate } from '../utils/financeDates.js';
import { createInvoice } from './billing.js';
import { BillingSchedule } from '../models/FeeWorkflow.js';
import { generateScheduleInvoices } from './feeSchedules.js';

const months = { monthly: 1, quarterly: 3, yearly: 12 };

async function once(key, Model, create) {
  if (await Model.exists({ generationKey: key })) return;
  try { await create(); } catch (err) {
    // A second server may have generated the same occurrence concurrently.
    if (err.code !== 11000 || !await Model.exists({ generationKey: key })) throw err;
  }
}

export async function runRecurringBilling(now = new Date()) {
  const today = schoolDate(now);
  for await (const schedule of BillingSchedule.find({ status: 'active' })) {
    await generateScheduleInvoices(schedule, now);
  }
  for await (const fee of FeeStructure.find({ isActive: true, autoGenerate: true })) {
    if (!fee.billingStart) continue;
    parseDay(fee.billingStart);
    const year = fee.academicYear ? await AcademicYear.findById(fee.academicYear) : null;
    if (fee.academicYear && !year) continue;
    for (let occurrence = 0; ; occurrence++) {
      if (occurrence && !months[fee.frequency]) break;
      const day = addMonths(fee.billingStart, occurrence * (months[fee.frequency] || 1));
      if (day > today || (year && day > schoolDate(year.endDate))) break;
      if (year && day < schoolDate(year.startDate)) continue;
      const filter = { status: 'active', admissionDate: { $lte: parseDay(day, true) } };
      if (fee.class) filter.class = fee.class;
      if (fee.academicYear) filter.academicYear = fee.academicYear;
      for await (const student of Student.find(filter)) {
        const key = `fee:${fee.id}:${student.id}:${day}`;
        await once(key, Invoice, () => createInvoice({
          generationKey: key, student: student._id, academicYear: fee.academicYear,
          dueDate: parseDay(day), period: { en: day, bn: '' },
          items: [{ feeStructure: fee._id, title: fee.name, amount: fee.amount }],
        }));
      }
    }
  }
  for await (const expense of Expense.find({ 'recurring.enabled': true, recurringSource: { $exists: false } })) {
    const start = schoolDate(expense.date);
    const interval = months[expense.recurring.frequency];
    if (!interval) continue;
    for (let occurrence = 1; ; occurrence++) {
      const day = addMonths(start, occurrence * interval);
      if (day > today) break;
      const key = `expense:${expense.id}:${day}`;
      await once(key, Expense, () => Expense.create({
        generationKey: key, recurringSource: expense._id, category: expense.category,
        payee: expense.payee, amount: expense.amount, date: parseDay(day),
        method: expense.method, note: expense.note, recordedBy: expense.recordedBy,
        // A repeated entry must not copy a past bank reference or receipt.
        recurring: { enabled: false, frequency: expense.recurring.frequency },
      }));
    }
  }
}

export function startRecurringBilling() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runRecurringBilling(); }
    catch (err) { console.error('[billing] Recurring billing failed:', err.message); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
