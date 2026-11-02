import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { Attendance } from '../../models/Attendance.js';
import { Section } from '../../models/Academic.js';
import { Student } from '../../models/People.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertStudentAccess, isSelfService, ownStudentIds, requireAcademicAccess } from '../../utils/access.js';
import { parseDay, schoolDate } from '../../utils/financeDates.js';
import { paginated } from '../../utils/pagination.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const router = Router();

const bulkSchema = z.object({
  section: objectId,
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
});

/** Normalize a date to midnight UTC so one record maps to one calendar day. */
function dayStart(date) {
  parseDay(date); // Reject impossible calendar dates before UTC normalization.
  return new Date(`${date}T00:00:00.000Z`);
}

// Bulk upsert attendance for a whole section on a given date.
router.post(
  '/bulk',
  requireAuth,
  requireRole('admin', 'teacher'),
  validate(bulkSchema),
  async (req, res) => {
    const { section, date, records } = req.body;
    const day = dayStart(date);

    // Bangladesh is UTC+6; allow "today" there but never a future day.
    if (date > schoolDate()) throw ApiError.badRequest('Attendance cannot be marked for a future date');
    if (!(await Section.exists({ _id: section }))) throw ApiError.badRequest('Section not found');
    const ids = [...new Set(records.map((r) => r.student))];
    if (ids.length !== records.length) throw ApiError.badRequest('A student can appear only once in an attendance batch');
    if ((await Student.countDocuments({ _id: { $in: ids }, section })) !== ids.length) {
      throw ApiError.badRequest('Every student must belong to the selected section');
    }

    const ops = records.map((r) => ({
      updateOne: {
        filter: { student: r.student, date: day },
        update: {
          $set: {
            student: r.student,
            section,
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

// List attendance, filterable by section/student/date range.
router.get('/', requireAuth, async (req, res) => {
  const { section, student, from, to } = req.query;
  requireAcademicAccess(req.user);
  const filter = {};
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
