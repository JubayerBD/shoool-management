import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { crudController } from '../../utils/crudController.js';
import { Exam, Mark } from '../../models/Exam.js';
import { Student } from '../../models/People.js';
import { Section, Subject } from '../../models/Academic.js';
import { gradeFromMarks } from '../../utils/grading.js';
import { ApiError } from '../../utils/ApiError.js';
import { blockIfInUse } from '../../utils/inUse.js';
import { assertStudentAccess, isSelfService, ownStudentIds, requireAcademicAccess } from '../../utils/access.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const router = Router();

/* ---- Exam terms (admin-managed) ---- */
const exams = crudController(Exam, {
  populate: ['academicYear'],
  searchable: ['name.en', 'name.bn'],
  filterable: ['academicYear', 'isPublished'],
  defaultSort: { startDate: -1 },
  guardRemove: blockIfInUse([[Mark, 'exam', 'entered marks']]),
});

// Students/parents only see exams whose results have been published.
const publishedOnly = (req, _res, next) => {
  if (isSelfService(req.user)) req.query.isPublished = 'true';
  next();
};
router.get('/exams', requireAuth, publishedOnly, exams.list);
router.get('/exams/:id', requireAuth, async (req, res, next) => {
  if (isSelfService(req.user) && !(await Exam.exists({ _id: req.params.id, isPublished: true }))) {
    throw ApiError.notFound('Exam not found');
  }
  next();
}, exams.get);
router.post('/exams', requireAuth, requireRole('admin'), exams.create);
router.put('/exams/:id', requireAuth, requireRole('admin'), exams.update);
router.delete('/exams/:id', requireAuth, requireRole('admin'), exams.remove);

/* ---- Marks entry ---- */
const marksSchema = z.object({
  exam: objectId,
  marks: z
    .array(
      z
        .object({
          student: objectId,
          subject: objectId,
          marksObtained: z.number().min(0),
          fullMarks: z.number().min(1).default(100),
          remark: z.string().optional(),
        })
        .refine((m) => m.marksObtained <= m.fullMarks, { message: 'Marks obtained cannot exceed full marks', path: ['marksObtained'] })
    )
    .min(1),
});

// Bulk enter/update marks; grade + gradePoint are computed server-side.
router.post(
  '/marks',
  requireAuth,
  requireRole('admin', 'teacher'),
  validate(marksSchema),
  async (req, res) => {
    const { exam, marks } = req.body;
    if (!(await Exam.exists({ _id: exam }))) throw ApiError.badRequest('Exam not found');
    const ops = marks.map((m) => {
      const { grade, gradePoint } = gradeFromMarks(m.marksObtained, m.fullMarks);
      return {
        updateOne: {
          filter: { exam, student: m.student, subject: m.subject },
          update: {
            $set: {
              exam,
              student: m.student,
              subject: m.subject,
              marksObtained: m.marksObtained,
              fullMarks: m.fullMarks,
              grade,
              gradePoint,
              remark: m.remark || '',
              enteredBy: req.user.id,
            },
          },
          upsert: true,
        },
      };
    });
    const result = await Mark.bulkWrite(ops);
    res.json({ ok: true, upserted: result.upsertedCount, modified: result.modifiedCount });
  }
);

// Raw marks list (e.g. mark-entry grid), filter by exam/student/subject.
router.get('/marks', requireAuth, async (req, res) => {
  const { exam, student, subject } = req.query;
  requireAcademicAccess(req.user);
  const filter = {};
  if (exam) filter.exam = exam;
  if (subject) filter.subject = subject;
  if (isSelfService(req.user)) {
    // Own family only, and only for exams whose results are published.
    if (student) assertStudentAccess(req.user, student);
    filter.student = student || { $in: ownStudentIds(req.user) };
    const published = await Exam.find({ isPublished: true }).distinct('_id');
    filter.exam = exam ? { $in: published.filter((id) => String(id) === String(exam)) } : { $in: published };
  } else if (student) filter.student = student;
  const items = await Mark.find(filter)
    .populate('subject', 'name code fullMarks')
    .populate('student', 'name admissionNo roll');
  res.json({ items });
});

/* ---- Tabulation: whole section across one exam (marks grid + rank) ---- */
router.get('/tabulation', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const { exam, section } = req.query;
  if (!exam || !section) throw ApiError.badRequest('exam and section are required');

  const sectionDoc = await Section.findById(section).lean();
  const classId = sectionDoc?.class;

  const [students, subjects] = await Promise.all([
    Student.find({ section }).sort({ roll: 1 }).select('name admissionNo roll').lean(),
    Subject.find(classId ? { $or: [{ class: classId }, { class: null }] } : {})
      .sort({ 'name.en': 1 })
      .lean(),
  ]);

  const studentIds = students.map((s) => s._id);
  const marks = await Mark.find({ exam, student: { $in: studentIds } }).lean();

  // Index marks by student -> subject.
  const byStudent = {};
  for (const m of marks) {
    const sid = String(m.student);
    (byStudent[sid] ||= {})[String(m.subject)] = m;
  }

  const rows = students.map((s) => {
    const sid = String(s._id);
    const smarks = byStudent[sid] || {};
    let totalObtained = 0;
    let totalFull = 0;
    let gpSum = 0;
    let counted = 0;
    let failed = false;
    const perSubject = subjects.map((sub) => {
      const m = smarks[String(sub._id)];
      if (m) {
        totalObtained += m.marksObtained;
        totalFull += m.fullMarks;
        gpSum += m.gradePoint;
        counted += 1;
        if (m.grade === 'F') failed = true;
      }
      return { subject: sub._id, marksObtained: m ? m.marksObtained : null, grade: m ? m.grade : null };
    });
    const gpa = counted ? Number((gpSum / counted).toFixed(2)) : 0;
    return {
      student: { id: s._id, name: s.name, admissionNo: s.admissionNo, roll: s.roll },
      perSubject,
      totalObtained,
      totalFull,
      percentage: totalFull ? Math.round((totalObtained / totalFull) * 100) : 0,
      gpa: failed ? 0 : gpa,
      result: counted === 0 ? '-' : failed ? 'Fail' : 'Pass',
    };
  });

  // Rank by total obtained (desc); ties share a rank.
  const ranked = [...rows].sort((a, b) => b.totalObtained - a.totalObtained);
  let lastTotal = null;
  let lastRank = 0;
  ranked.forEach((row, idx) => {
    if (row.totalObtained !== lastTotal) {
      lastRank = idx + 1;
      lastTotal = row.totalObtained;
    }
    row.rank = row.totalObtained > 0 ? lastRank : null;
  });

  res.json({
    subjects: subjects.map((s) => ({ id: s._id, name: s.name, code: s.code })),
    rows,
  });
});

/* ---- Batch report cards: every student in a section for one exam ---- */
router.get('/report-cards', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const { exam, section } = req.query;
  if (!exam || !section) throw ApiError.badRequest('exam and section are required');

  const students = await Student.find({ section })
    .sort({ roll: 1 })
    .select('name admissionNo roll')
    .lean();
  const ids = students.map((s) => s._id);
  const marks = await Mark.find({ exam, student: { $in: ids } })
    .populate('subject', 'name code fullMarks')
    .lean();

  const byStudent = {};
  for (const m of marks) (byStudent[String(m.student)] ||= []).push(m);

  const cards = students.map((s) => {
    const smarks = byStudent[String(s._id)] || [];
    const totalObtained = smarks.reduce((sum, m) => sum + m.marksObtained, 0);
    const totalFull = smarks.reduce((sum, m) => sum + m.fullMarks, 0);
    const failed = smarks.some((m) => m.grade === 'F');
    const gpa = smarks.length
      ? Number((smarks.reduce((sum, m) => sum + m.gradePoint, 0) / smarks.length).toFixed(2))
      : 0;
    return {
      student: s,
      subjects: smarks,
      totalObtained,
      totalFull,
      percentage: totalFull ? Math.round((totalObtained / totalFull) * 100) : 0,
      gpa: failed ? 0 : gpa,
      result: smarks.length === 0 ? '-' : failed ? 'Fail' : 'Pass',
    };
  });

  res.json({ cards });
});

/* ---- Report card: one student across one exam ---- */
router.get('/report-card', requireAuth, async (req, res) => {
  const { exam, student } = req.query;
  if (!exam || !student) throw ApiError.badRequest('exam and student are required');
  assertStudentAccess(req.user, student);
  if (isSelfService(req.user) && !(await Exam.exists({ _id: exam, isPublished: true }))) {
    throw ApiError.forbidden('Results for this exam have not been published yet');
  }
  const marks = await Mark.find({ exam, student }).populate('subject', 'name code fullMarks');

  const totalObtained = marks.reduce((s, m) => s + m.marksObtained, 0);
  const totalFull = marks.reduce((s, m) => s + m.fullMarks, 0);
  const failed = marks.some((m) => m.grade === 'F');
  const gpa = marks.length
    ? Number((marks.reduce((s, m) => s + m.gradePoint, 0) / marks.length).toFixed(2))
    : 0;

  res.json({
    reportCard: {
      exam,
      student,
      subjects: marks,
      totalObtained,
      totalFull,
      percentage: totalFull ? Math.round((totalObtained / totalFull) * 100) : 0,
      gpa: failed ? 0 : gpa,
      result: marks.length === 0 ? '-' : failed ? 'Fail' : 'Pass',
    },
  });
});

export default router;
