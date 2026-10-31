import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { Student, Teacher } from '../../models/People.js';
import { Class } from '../../models/Academic.js';
import { Invoice, Payment } from '../../models/Fees.js';
import { Attendance } from '../../models/Attendance.js';
import { Notice } from '../../models/Schedule.js';

import { FeeAdjustment } from '../../models/FeeWorkflow.js';
import { studentScope } from '../../utils/feeAccess.js';
import { noticeScopeFor } from '../../utils/access.js';
const financialScope = (user) => ['admin', 'accountant', 'student', 'parent'].includes(user.role) ? studentScope(user) : { _id: null };
const router = Router();

// High-level counts for the admin/staff dashboard cards.
router.get('/stats', requireAuth, async (req, res) => {
  const [students, teachers, classes, unpaid, recentNotices] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    Teacher.countDocuments({ status: 'active' }),
    Class.countDocuments(),
    Invoice.countDocuments({ ...financialScope(req.user), status: { $in: ['unpaid', 'partial'] } }),
    Notice.find(noticeScopeFor(req.user) || {}).sort({ isPinned: -1, publishedAt: -1 }).limit(5),
  ]);

  const dueAgg = await Invoice.aggregate([
    { $match: { ...financialScope(req.user), status: { $in: ['unpaid', 'partial'] } } },
    { $group: { _id: null, due: { $sum: { $subtract: [{ $subtract: ['$totalAmount', { $ifNull: ['$waivedAmount', 0] }] }, '$paidAmount'] } } } },
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
router.get('/analytics', requireAuth, async (req, res) => {
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
    { $match: { ...financialScope(req.user), paidAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { y: { $year: { date: '$paidAt', timezone: 'Asia/Dhaka' } }, m: { $month: { date: '$paidAt', timezone: 'Asia/Dhaka' } } },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const refunds = await FeeAdjustment.aggregate([
    { $match: { ...financialScope(req.user), type: 'refund', status: 'approved', reviewedAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { y: { $year: { date: '$reviewedAt', timezone: 'Asia/Dhaka' } }, m: { $month: { date: '$reviewedAt', timezone: 'Asia/Dhaka' } } }, total: { $sum: '$amount' } } },
  ]);
  const months = new Map();
  for (const r of payRows) months.set(`${r._id.y}-${String(r._id.m).padStart(2, '0')}`, r.total);
  for (const r of refunds) {
    const key = `${r._id.y}-${String(r._id.m).padStart(2, '0')}`;
    months.set(key, (months.get(key) || 0) - r.total);
  }
  const feeCollection = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([key, total]) => ({ label: `${key.slice(5)}/${key.slice(0, 4)}`, total }));

  res.json({ studentsPerClass, attendanceBreakdown, feeCollection });
});

export default router;
