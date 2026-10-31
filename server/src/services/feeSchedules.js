import { createHash } from 'node:crypto';
import { FeePlan, BillingSchedule } from '../models/FeeWorkflow.js';
import { Invoice, FeeStructure } from '../models/Fees.js';
import { Student } from '../models/People.js';
import { AcademicYear, Class } from '../models/Academic.js';
import { parseDay, schoolDate, addMonths } from '../utils/financeDates.js';
import { ApiError } from '../utils/ApiError.js';
import { money } from '../utils/feeAccess.js';
import { createInvoice, withBillingTransaction } from './billing.js';

const same = (a, b) => String(a) === String(b);
const querySession = (query, session) => session ? query.session(session) : query;

export async function planDetails(body) {
  const year = await AcademicYear.findById(body.academicYear);
  const grade = await Class.findById(body.class);
  if (!year || !grade) throw ApiError.badRequest('Choose a valid academic year and class');
  if (grade.academicYear && !same(grade.academicYear, year.id)) throw ApiError.badRequest('Class belongs to a different academic year');
  const ids = body.items.map((item) => item.feeType);
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each fee type can appear only once in a plan');
  const types = await FeeStructure.find({ _id: { $in: ids }, isActive: true });
  if (types.length !== ids.length) throw ApiError.badRequest('Choose active fee types for every line');
  return { ...body, items: body.items.map((item) => ({ ...item, title: types.find((type) => same(type.id, item.feeType)).name })) };
}

export function scheduleDates(schedule) {
  if (schedule.componentRules?.length) return [...new Set(schedule.componentRules.flatMap((rule) =>
    scheduleDates({ startDate: rule.startDate, endDate: schedule.endDate, intervalMonths: rule.intervalMonths })))].sort();
  parseDay(schedule.startDate);
  parseDay(schedule.endDate);
  if (schedule.startDate > schedule.endDate) throw ApiError.badRequest('Billing start must be before billing end');
  const interval = schedule.intervalMonths ?? { monthly: 1, quarterly: 3, yearly: 12 }[schedule.frequency];
  const dates = [];
  for (let n = 0; n <= 120; n++) {
    if (n && !interval) break;
    const day = addMonths(schedule.startDate, n * (interval || 1));
    if (day > schedule.endDate) return dates;
    if (n === 120) break;
    dates.push(day);
    if (!interval) return dates;
  }
  throw ApiError.badRequest('Schedules can cover at most 120 billing occurrences');
}

export function itemsForDate(schedule, items, day) {
  if (!schedule.componentRules?.length) return items;
  return items.filter((item) => {
    const rule = schedule.componentRules.find((entry) => same(entry.feeType, item.feeType));
    return rule && scheduleDates({ startDate: rule.startDate, endDate: schedule.endDate, intervalMonths: rule.intervalMonths }).includes(day);
  });
}

export function studentBill(schedule, student, items) {
  const included = items.filter((item) => !item.optional || schedule.optionalAssignments.some((assignment) =>
    same(assignment.feeType, item.feeType) && assignment.students.some((id) => same(id, student._id))));
  const grossAmount = money(included.reduce((total, item) => total + item.amount, 0));
  const concession = schedule.concessions.find((entry) => same(entry.student, student._id));
  let discountAmount = 0;
  if (concession) {
    const base = concession.feeType ? included.find((item) => same(item.feeType, concession.feeType))?.amount || 0 : grossAmount;
    discountAmount = base ? money(concession.mode === 'percent' ? base * concession.value / 100 : concession.value) : 0;
    if (discountAmount > base) throw ApiError.badRequest(`Concession exceeds the applicable fee for ${student.admissionNo}`);
  }
  return { items: included.map((item) => ({ feeStructure: item.feeType, title: item.title, amount: item.amount })),
    grossAmount, discountAmount, totalAmount: money(grossAmount - discountAmount), concessionReason: concession?.reason || '' };
}

export async function previewSchedule(schedule, now = new Date(), session) {
  const plan = await querySession(FeePlan.findById(schedule.plan), session);
  if (!plan || !plan.isActive) throw ApiError.badRequest('The selected fee plan is unavailable');
  const year = await querySession(AcademicYear.findById(plan.academicYear), session);
  if (!year) throw ApiError.badRequest('Academic year not found');
  const dates = scheduleDates(schedule);
  const selectedIds = (schedule.feeTypes || []).map(String);
  const selectedItems = plan.items.filter((item) => selectedIds.includes(String(item.feeType)));
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length || selectedIds.length !== selectedItems.length) throw ApiError.badRequest('Select each fee component from this plan once');
  if (schedule.componentRules?.length) {
    const rules = schedule.componentRules;
    if (rules.length !== selectedIds.length || new Set(rules.map((rule) => String(rule.feeType))).size !== rules.length ||
      rules.some((rule) => !selectedIds.includes(String(rule.feeType)) || rule.startDate < schedule.startDate || rule.startDate > schedule.endDate ||
        !Number.isInteger(rule.intervalMonths) || rule.intervalMonths < 0 || rule.intervalMonths > 12)) {
      throw ApiError.badRequest('Set one valid billing rule for each selected fee, within the schedule dates');
    }
  }
  if (schedule.startDate < schoolDate(year.startDate) || schedule.endDate > schoolDate(year.endDate)) {
    throw ApiError.badRequest('The billing schedule must stay within its academic year');
  }
  const ids = schedule.students.map(String);
  if (!ids.length || new Set(ids).size !== ids.length) throw ApiError.badRequest('Select students once each');
  const students = await querySession(Student.find({ _id: { $in: ids }, class: plan.class,
    academicYear: plan.academicYear, status: 'active' }).sort({ _id: 1 }), session);
  if (students.length !== ids.length) throw ApiError.badRequest('Students must be active and belong to the plan class and academic year');
  if (new Set(schedule.concessions.map((entry) => String(entry.student))).size !== schedule.concessions.length) {
    throw ApiError.badRequest('Only one concession per student is allowed in a schedule');
  }
  for (const concession of schedule.concessions) {
    if (!ids.includes(String(concession.student))) throw ApiError.badRequest('Concession student is not assigned to this schedule');
    if (concession.feeType && !selectedItems.some((item) => same(item.feeType, concession.feeType))) throw ApiError.badRequest('Concession fee type is not selected for billing');
    if (concession.mode === 'percent' && concession.value > 100) throw ApiError.badRequest('Percentage concession cannot exceed 100');
  }
  const optional = schedule.optionalAssignments;
  if (new Set(optional.map((entry) => String(entry.feeType))).size !== optional.length) throw ApiError.badRequest('Duplicate optional fee assignment');
  for (const assignment of optional) {
    if (!selectedItems.some((item) => item.optional && same(item.feeType, assignment.feeType)) || assignment.students.some((id) => !ids.includes(String(id)))) {
      throw ApiError.badRequest('Optional fees must be in the plan and assigned only to selected students');
    }
  }
  const today = schoolDate(now);
  const rows = students.map((student) => {
    const bill = studentBill(schedule, student, selectedItems);
    const eligibleDates = dates.filter((day) => day >= schoolDate(student.admissionDate));
    const invoices = eligibleDates.map((day) => ({ date: day, ...studentBill(schedule, student, itemsForDate(schedule, selectedItems, day)) })).filter((entry) => entry.items.length);
    return { student: student.id, name: student.name, admissionNo: student.admissionNo,
      ...bill, invoices, invoiceCount: invoices.length,
      scheduledGross: money(invoices.reduce((sum, entry) => sum + entry.grossAmount, 0)),
      scheduledDiscount: money(invoices.reduce((sum, entry) => sum + entry.discountAmount, 0)),
      scheduledTotal: money(invoices.reduce((sum, entry) => sum + entry.totalAmount, 0)),
      readyCount: invoices.filter((entry) => entry.date <= today).length };
  });
  const summary = rows.reduce((out, row) => ({
    students: out.students + 1, invoiceCount: out.invoiceCount + row.invoiceCount,
    readyCount: out.readyCount + row.readyCount,
    gross: money(out.gross + row.scheduledGross),
    discounts: money(out.discounts + row.scheduledDiscount),
    total: money(out.total + row.scheduledTotal),
  }), { students: 0, invoiceCount: 0, readyCount: 0, gross: 0, discounts: 0, total: 0 });
  const token = createHash('sha256').update(JSON.stringify({ schedule, plan, year, students, today })).digest('hex');
  return { plan, selectedItems, rows, summary, dates, token };
}

export async function generateScheduleInvoices(schedule, now = new Date()) {
  const today = schoolDate(now);
  for (const day of scheduleDates(schedule)) {
    if (day > today) break;
    // Recheck eligibility to stop future charges for withdrawn or transferred students.
    const students = Student.find({ _id: { $in: schedule.students }, class: schedule.class,
      academicYear: schedule.academicYear, status: 'active', admissionDate: { $lte: parseDay(day, true) } });
    for await (const student of students) {
      const generationKey = `schedule:${schedule.id}:${student.id}:${day}`;
      if (await Invoice.exists({ generationKey })) continue;
      const bill = studentBill(schedule, student, itemsForDate(schedule, schedule.items, day));
      if (!bill.items.length) continue;
      const due = new Date(parseDay(day).getTime() + schedule.dueDays * 86400000);
      try {
        await withBillingTransaction(async (session) => {
          // Serialize generation against cancellation, even for a worker holding an old snapshot.
          const live = await BillingSchedule.findOneAndUpdate({ _id: schedule.id, status: 'active' },
            { $inc: { billingRevision: 1 } }, { session, new: true });
          if (!live || await Invoice.exists({ generationKey }).session(session)) return;
          await createInvoice({ ...bill, generationKey, billingSchedule: schedule.id,
          billingDate: day, student: student.id, academicYear: schedule.academicYear,
          period: { en: day, bn: '' }, dueDate: due }, session);
        });
      } catch (err) {
        if (err.code !== 11000 || !await Invoice.exists({ generationKey })) throw err;
      }
    }
  }
  if (today > schedule.endDate) await BillingSchedule.updateOne({ _id: schedule.id, status: 'active' }, { status: 'ended' });
}
