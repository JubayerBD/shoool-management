import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { Attendance } from '../../models/Attendance.js';

const router = Router();

const bulkSchema = z.object({
  section: z.string().min(1),
  date: z.coerce.date(),
  records: z
    .array(
      z.object({
        student: z.string().min(1),
        status: z.enum(['present', 'absent', 'late', 'leave']).default('present'),
        remark: z.string().optional(),
      })
    )
    .min(1),
});

/** Normalize a date to midnight UTC so one record maps to one calendar day. */
function dayStart(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
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
  const filter = {};
  if (section) filter.section = section;
  if (student) filter.student = student;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = dayStart(from);
    if (to) filter.date.$lte = dayStart(to);
  }
  const items = await Attendance.find(filter)
    .populate('student', 'name admissionNo roll')
    .sort({ date: -1 })
    .limit(500);
  res.json({ items });
});

// Per-student summary counts (for dashboards / report cards).
router.get('/summary/:studentId', requireAuth, async (req, res) => {
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
