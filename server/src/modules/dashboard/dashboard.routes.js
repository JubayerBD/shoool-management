import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { Student, Teacher } from '../../models/People.js';
import { Class } from '../../models/Academic.js';
import { Invoice, Payment } from '../../models/Fees.js';
import { Attendance } from '../../models/Attendance.js';
import { Notice } from '../../models/Schedule.js';

const router = Router();

// High-level counts for the admin/staff dashboard cards.
router.get('/stats', requireAuth, async (_req, res) => {
  const [students, teachers, classes, unpaid, recentNotices] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    Teacher.countDocuments({ status: 'active' }),
    Class.countDocuments(),
    Invoice.countDocuments({ status: { $in: ['unpaid', 'partial'] } }),
    Notice.find().sort({ isPinned: -1, publishedAt: -1 }).limit(5),
  ]);

  const dueAgg = await Invoice.aggregate([
    { $match: { status: { $in: ['unpaid', 'partial'] } } },
    { $group: { _id: null, due: { $sum: { $subtract: ['$totalAmount', '$paidAmount'] } } } },
  ]);

  res.json({
    stats: {
      students,
      teachers,
      classes,
      unpaidInvoices: unpaid,
      totalDue: dueAgg[0]?.due || 0,
    },
    recentNotices,
  });
});

// Chart data for the dashboard.
router.get('/analytics', requireAuth, async (_req, res) => {
  // Students per class (with bilingual class name).
  const perClassAgg = await Student.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$class', count: { $sum: 1 } } },
  ]);
  const classDocs = await Class.find().sort({ numericLevel: 1 }).lean();
  const studentsPerClass = classDocs.map((c) => ({
    label: c.name,
    count: perClassAgg.find((r) => String(r._id) === String(c._id))?.count || 0,
  }));

  // Attendance status breakdown (last 30 days).
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const attRows = await Attendance.aggregate([
    { $match: { date: { $gte: since } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const attendanceBreakdown = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const r of attRows) attendanceBreakdown[r._id] = r.count;

  // Fee collection per month (last 6 months).
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const payRows = await Payment.aggregate([
    { $match: { paidAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const feeCollection = payRows.map((r) => ({
    label: `${String(r._id.m).padStart(2, '0')}/${r._id.y}`,
    total: r.total,
  }));

  res.json({ studentsPerClass, attendanceBreakdown, feeCollection });
});

export default router;
