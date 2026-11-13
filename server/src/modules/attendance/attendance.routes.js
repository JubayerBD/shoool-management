import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { Attendance } from '../../models/Attendance.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertStudentAccess, isSelfService, ownStudentIds, requireAcademicAccess } from '../../utils/access.js';
import { parseDay, schoolDate } from '../../utils/financeDates.js';
import { paginated } from '../../utils/pagination.js';
import { attendanceContext, attendanceStudents } from '../../services/attendanceRoster.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const router = Router();

const bulkSchema = z.object({
  section: objectId.optional(),
  class: objectId.optional(),
  academicYear: objectId.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z
    .array(
      z.object({
        student: objectId,
        status: z.enum(['present', 'absent', 'late', 'leave']).default('present'),
        remark: z.string().optional(),
      })
    )
    .min(1),
}).refine(body => body.class || body.section, { message: 'Choose a class' });

/** Normalize a date to midnight UTC so one record maps to one calendar day. */
function dayStart(date) {
  parseDay(date); // Reject impossible calendar dates before UTC normalization.
  return new Date(`${date}T00:00:00.000Z`);
}

// Save attendance for a class, optionally narrowed to one section.
router.post(
  '/bulk',
  requireAuth,
  requireRole('admin', 'teacher'),
  validate(bulkSchema),
  async (req, res) => {
    const { date, records } = req.body;
    const day = dayStart(date);

    // Bangladesh is UTC+6; allow "today" there but never a future day.
    if (date > schoolDate()) throw ApiError.badRequest('Attendance cannot be marked for a future date');
    const context = await attendanceContext(req.body);
    const roster = await attendanceStudents(context);
    const byId = new Map(roster.map(student => [String(student._id), student]));
    const ids = [...new Set(records.map((r) => r.student))];
    if (ids.length !== records.length) throw ApiError.badRequest('A student can appear only once in an attendance batch');
    if (ids.some(id => !byId.has(id))) {
      throw ApiError.badRequest('Every student must be active and belong to the selected class, academic year and section');
    }

    const ops = records.map((r) => ({
      updateOne: {
        filter: { student: r.student, class: context.grade.id, date: day },
        update: {
          $set: {
            student: r.student,
            class: context.grade.id,
            academicYear: context.year.id,
            section: byId.get(r.student).section,
            date: day,
            status: r.status,
            remark: r.remark || '',
            markedBy: req.user.id,
          },
        },
        upsert: true,
      },
    }));

    const result = await Attendance.bulkWrite(ops);
    res.json({
      ok: true,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  }
);

router.get('/roster', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const parsed = z.object({ class: objectId, academicYear: objectId, section: objectId.optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest('Choose an academic year, class and valid date');
  const input = parsed.data;
  const day = dayStart(input.date);
  if (input.date > schoolDate()) throw ApiError.badRequest('Attendance cannot be marked for a future date');
  const context = await attendanceContext(input);
  const students = await attendanceStudents(context);
  const saved = await Attendance.find({ class: context.grade.id, date: day, student: { $in: students.map(s => s._id) } }).lean();
  const byStudent = new Map(saved.map(row => [String(row.student), row]));
  // `marked` tells the screen whether this day was already saved or is still a fresh sheet.
  res.json({ items: students.map(student => ({ student: student._id, name: student.name, admissionNo: student.admissionNo, roll: student.roll, status: byStudent.get(String(student._id))?.status || 'present', remark: byStudent.get(String(student._id))?.remark || '' })), total: students.length, marked: saved.length > 0 });
});

// Monthly register: one row per student, one column per day, plus per-day totals.
router.get('/report', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const parsed = z.object({ class: objectId, academicYear: objectId, section: objectId.optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest('Choose an academic year, class and valid month');
  const input = parsed.data;
  const [y, mo] = input.month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const from = `${input.month}-01`, to = `${input.month}-${String(lastDay).padStart(2, '0')}`;
  const context = await attendanceContext({ ...input, date: undefined });
  const roster = await attendanceStudents(context);
  const filter = { class: context.grade.id, date: { $gte: dayStart(from), $lte: dayStart(to) } };
  if (context.section) filter.section = context.section.id;
  const records = await Attendance.find(filter).populate({ path: 'student', select: 'name admissionNo roll' }).lean();

  const blank = () => ({ present: 0, absent: 0, late: 0, leave: 0 });
  const rows = new Map(roster.map(s => [String(s._id), { student: s._id, name: s.name, admissionNo: s.admissionNo, roll: s.roll, days: {}, counts: blank() }]));
  const daily = new Map();
  for (const record of records) {
    if (!record.student) continue; // Student was deleted; nothing meaningful to show.
    const key = String(record.student._id), day = record.date.toISOString().slice(0, 10);
    // Students who have since left the class still appear for the days they were marked.
    if (!rows.has(key)) rows.set(key, { student: record.student._id, name: record.student.name, admissionNo: record.student.admissionNo, roll: record.student.roll, days: {}, counts: blank(), former: true });
    const row = rows.get(key);
    row.days[day] = record.status; row.counts[record.status] += 1;
    if (!daily.has(day)) daily.set(day, { date: day, ...blank(), total: 0 });
    const tally = daily.get(day); tally[record.status] += 1; tally.total += 1;
  }
  const students = [...rows.values()].map(row => {
    const marked = row.counts.present + row.counts.absent + row.counts.late + row.counts.leave;
    return { ...row, marked, percentage: marked ? Math.round(((row.counts.present + row.counts.late) / marked) * 100) : null };
  });
  res.json({ month: input.month, from, to, today: schoolDate(), students, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)) });
});

// List attendance, filterable by section/student/date range.
router.get('/', requireAuth, async (req, res) => {
  const { section, student, from, to } = req.query;
  requireAcademicAccess(req.user);
  const filter = {};
  for (const key of ['class', 'academicYear']) if (req.query[key]) {
    if (!objectId.safeParse(req.query[key]).success) throw ApiError.badRequest(`Invalid ${key}`);
    filter[key] = req.query[key];
  }
  if (section) filter.section = section;
  if (isSelfService(req.user)) {
    // Students/parents can only ever see their own family's records.
    if (student) assertStudentAccess(req.user, student);
    filter.student = student || { $in: ownStudentIds(req.user) };
  } else if (student) filter.student = student;
  if (from || to) {
    if (from && to && from > to) throw ApiError.badRequest('From date must not be after to date');
    filter.date = {};
    if (from) filter.date.$gte = dayStart(from);
    if (to) filter.date.$lte = dayStart(to);
  }
  res.json(await paginated(Attendance, filter, req.query, { path: 'student', select: 'name admissionNo roll' }, { date: -1 }));
});

// Per-student summary counts (for dashboards / report cards).
router.get('/summary/:studentId', requireAuth, async (req, res) => {
  if (!objectId.safeParse(req.params.studentId).success) throw ApiError.badRequest('Invalid student id');
  assertStudentAccess(req.user, req.params.studentId);
  const rows = await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(req.params.studentId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const summary = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const r of rows) summary[r._id] = r.count;
  summary.total = summary.present + summary.absent + summary.late + summary.leave;
  summary.percentage = summary.total
    ? Math.round(((summary.present + summary.late) / summary.total) * 100)
    : 0;
  res.json({ summary });
});

export default router;
