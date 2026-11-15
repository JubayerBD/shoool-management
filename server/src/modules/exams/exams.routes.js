import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { crudController } from '../../utils/crudController.js';
import mongoose from 'mongoose';
import { Exam, ExamPaper, Mark } from '../../models/Exam.js';
import { Student } from '../../models/People.js';
import { Class, Section, Subject } from '../../models/Academic.js';
import { Enrollment } from '../../models/Enrollment.js';
import { defaultPassMarks, gradeFromMarks } from '../../utils/grading.js';
import { ApiError } from '../../utils/ApiError.js';
import { blockIfInUse } from '../../utils/inUse.js';
import { assertStudentAccess, isSelfService, ownStudentIds, requireAcademicAccess } from '../../utils/access.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const router = Router();

/**
 * Students of one class for the exam screens. Section is optional: without it the whole
 * class is returned. Includes students attending the class as an additional enrollment,
 * and keeps anyone who already has marks in the exam even if they have since left.
 */
async function classRoster({ exam, class: classId, section }) {
  for (const value of [exam, classId, section]) {
    if (value && !objectId.safeParse(value).success) throw ApiError.badRequest('Invalid id');
  }
  if (!classId && !section) throw ApiError.badRequest('Choose a class');
  const sectionDoc = section ? await Section.findById(section).lean() : null;
  const examDoc = exam ? await Exam.findById(exam).lean() : null;
  if ((section && !sectionDoc) || (exam && !examDoc)) throw ApiError.notFound('Exam or section not found');
  const grade = await Class.findById(classId || sectionDoc.class).lean();
  if (!grade) throw ApiError.notFound('Class not found');
  if (sectionDoc && String(sectionDoc.class) !== String(grade._id)) throw ApiError.badRequest('Section does not belong to the selected class');

  const yearId = examDoc?.academicYear || grade.academicYear || null;
  const memberships = await Enrollment.find({ class: grade._id, ...(yearId ? { academicYear: yearId } : {}) }).lean();
  const byStudent = new Map(memberships.map((record) => [String(record.student), record]));
  const candidates = await Student.find({ $or: [{ class: grade._id }, { _id: { $in: memberships.map((record) => record.student) } }] })
    .select('name admissionNo roll class section academicYear status')
    .lean();
  const marked = exam
    ? new Set((await Mark.distinct('student', { exam, student: { $in: candidates.map((s) => s._id) } })).map(String))
    : new Set();

  const students = candidates.flatMap((s) => {
    const id = String(s._id);
    const membership = byStudent.get(id);
    const primary = String(s.class) === String(grade._id) && (!yearId || !s.academicYear || String(s.academicYear) === String(yearId));
    if (!membership && !primary) return [];
    const current = s.status === 'active' && membership?.status !== 'withdrawn';
    if (!current && !marked.has(id)) return [];
    const assignedSection = membership ? membership.section : s.section;
    if (sectionDoc && String(assignedSection) !== String(sectionDoc._id)) return [];
    return [{ _id: s._id, name: s.name, admissionNo: s.admissionNo, roll: membership?.roll ?? s.roll }];
  });
  students.sort((a, b) => (a.roll ?? Infinity) - (b.roll ?? Infinity) || String(a.admissionNo).localeCompare(String(b.admissionNo)));
  return { students, grade };
}

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
router.delete('/exams/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await exams.remove(req, res); // refuses while marks exist
  await ExamPaper.deleteMany({ exam: req.params.id });
});

/* ---- Full and pass marks per exam term, class and subject ---- */

/** Subjects a class sits: its own subjects plus subjects shared by every class. */
const classSubjects = (classId) => Subject.find({ $or: [{ class: classId }, { class: null }] }).sort({ 'name.en': 1 }).lean();

/** The marks that apply to each subject of a class in an exam: the saved setup, else the subject's defaults. */
async function effectivePapers(exam, classId) {
  const [subjects, saved] = await Promise.all([classSubjects(classId), ExamPaper.find({ exam, class: classId }).lean()]);
  const bySubject = new Map(saved.map((paper) => [String(paper.subject), paper]));
  return subjects.map((subject) => {
    const paper = bySubject.get(String(subject._id));
    const fullMarks = paper?.fullMarks ?? subject.fullMarks ?? 100;
    return {
      subject: subject._id, name: subject.name, code: subject.code,
      fullMarks, passMarks: paper?.passMarks ?? subject.passMarks ?? defaultPassMarks(fullMarks),
      configured: Boolean(paper),
    };
  });
}

const papersQuery = z.object({ exam: objectId, class: objectId });
router.get('/papers', requireAuth, requireRole('admin', 'teacher'), validate(papersQuery, 'query'), async (req, res) => {
  const { exam, class: classId } = req.query;
  if (!await Exam.exists({ _id: exam }) || !await Class.exists({ _id: classId })) throw ApiError.notFound('Exam or class not found');
  res.json({ items: await effectivePapers(exam, classId) });
});

const marksValue = z.number().finite().min(0).max(1000);
const papersSchema = z.object({
  exam: objectId,
  class: objectId,
  papers: z.array(z.object({ subject: objectId, fullMarks: marksValue.min(1), passMarks: marksValue })
    .refine((p) => p.passMarks <= p.fullMarks, { message: 'Pass marks cannot exceed full marks', path: ['passMarks'] })).min(1).max(100),
});

// Save the setup and re-grade marks already entered, so results always follow the current setup.
router.put('/papers', requireAuth, requireRole('admin'), validate(papersSchema), async (req, res) => {
  const { exam, class: classId, papers } = req.body;
  if (!await Exam.exists({ _id: exam }) || !await Class.exists({ _id: classId })) throw ApiError.notFound('Exam or class not found');
  const allowed = new Set((await classSubjects(classId)).map((s) => String(s._id)));
  if (new Set(papers.map((p) => p.subject)).size !== papers.length) throw ApiError.badRequest('Each subject can appear only once');
  if (papers.some((p) => !allowed.has(p.subject))) throw ApiError.badRequest('Every subject must belong to the selected class');

  const { students } = await classRoster({ exam, class: classId });
  const studentIds = students.map((s) => s._id);
  const entered = await Mark.find({ exam, subject: { $in: papers.map((p) => p.subject) }, $or: [{ class: classId }, { class: null, student: { $in: studentIds } }] }).lean();
  const bySubject = new Map(papers.map((p) => [p.subject, p]));
  const tooHigh = entered.filter((m) => m.marksObtained > bySubject.get(String(m.subject)).fullMarks);
  if (tooHigh.length) {
    const top = Math.max(...tooHigh.map((m) => m.marksObtained));
    throw ApiError.badRequest(`${tooHigh.length} entered mark(s) are higher than the new full marks (highest is ${top}). Correct those marks first.`);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ExamPaper.bulkWrite(papers.map((p) => ({ updateOne: {
        filter: { exam, class: classId, subject: p.subject },
        update: { $set: { fullMarks: p.fullMarks, passMarks: p.passMarks } }, upsert: true,
      } })), { session });
      if (entered.length) {
        await Mark.bulkWrite(entered.map((m) => {
          const paper = bySubject.get(String(m.subject));
          return { updateOne: { filter: { _id: m._id }, update: { $set: {
            fullMarks: paper.fullMarks, passMarks: paper.passMarks, class: classId,
            ...gradeFromMarks(m.marksObtained, paper.fullMarks, paper.passMarks),
          } } } };
        }), { session });
      }
    });
  } finally { await session.endSession(); }
  res.json({ items: await effectivePapers(exam, classId), regraded: entered.length });
});

/* ---- Marks entry ---- */
const marksSchema = z.object({
  exam: objectId,
  class: objectId.optional(), // the class the marks were entered for (picks its full/pass marks)
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
    const { exam, marks, class: entryClass } = req.body;
    const examDoc = await Exam.findById(exam).lean();
    if (!examDoc) throw ApiError.badRequest('Exam not found');
    if (entryClass && !await Class.exists({ _id: entryClass })) throw ApiError.badRequest('Class not found');
    const students = await Student.find({ _id: { $in: marks.map((m) => m.student) } }).lean();
    const subjects = await Subject.find({ _id: { $in: marks.map((m) => m.subject) } }).lean();
    const enrollments = await Enrollment.find({ student: { $in: students.map((s) => s._id) }, status: { $ne: 'withdrawn' } }).lean();
    const attends = (student, classId) => String(student.class) === String(classId)
      || enrollments.some((e) => String(e.student) === String(student._id) && String(e.class) === String(classId));
    const seen = new Set();
    for (const mark of marks) {
      const student = students.find((s) => String(s._id) === mark.student);
      const subject = subjects.find((s) => String(s._id) === mark.subject);
      if (!student || !subject) throw ApiError.badRequest('Every mark must reference an existing student and subject');
      if (entryClass && !attends(student, entryClass)) throw ApiError.badRequest('Every student must belong to the selected class');
      if (subject.class && !attends(student, subject.class)) throw ApiError.badRequest('Subject must belong to the student’s class');
      const inExamYear = !examDoc.academicYear || !student.academicYear || String(examDoc.academicYear) === String(student.academicYear)
        || enrollments.some((e) => String(e.student) === String(student._id) && String(e.academicYear) === String(examDoc.academicYear));
      if (!inExamYear) throw ApiError.badRequest('Exam and student must belong to the same academic year');
      const key = `${mark.student}-${mark.subject}`;
      if (seen.has(key)) throw ApiError.badRequest('A student and subject can appear only once in a marks batch');
      seen.add(key);
    }
    // Full and pass marks come from the exam's setup for that class, not from the browser.
    const classOf = (m) => entryClass || subjects.find((s) => String(s._id) === m.subject).class || students.find((s) => String(s._id) === m.student).class;
    const papers = await ExamPaper.find({ exam, subject: { $in: marks.map((m) => m.subject) } }).lean();
    for (const m of marks) {
      const paper = papers.find((p) => String(p.subject) === m.subject && String(p.class) === String(classOf(m)));
      const subject = subjects.find((s) => String(s._id) === m.subject);
      m.class = classOf(m);
      m.fullMarks = paper?.fullMarks ?? m.fullMarks;
      m.passMarks = paper?.passMarks ?? subject.passMarks ?? defaultPassMarks(m.fullMarks);
      if (m.marksObtained > m.fullMarks) throw ApiError.badRequest(`Marks cannot be more than the full marks (${m.fullMarks})`);
    }
    const ops = marks.map((m) => {
      const { grade, gradePoint } = gradeFromMarks(m.marksObtained, m.fullMarks, m.passMarks);
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
              passMarks: m.passMarks,
              ...(m.class ? { class: m.class } : {}),
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

/* ---- Class list for mark entry and the report-card student picker ---- */
router.get('/roster', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const { students } = await classRoster(req.query);
  res.json({ items: students.map((s) => ({ student: s._id, name: s.name, admissionNo: s.admissionNo, roll: s.roll })), total: students.length });
});

/* ---- Tabulation: whole class (or one section) across one exam (marks grid + rank) ---- */
router.get('/tabulation', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const { exam } = req.query;
  if (!exam) throw ApiError.badRequest('exam is required');
  const { students, grade } = await classRoster(req.query);
  const subjects = await Subject.find({ $or: [{ class: grade._id }, { class: null }] }).sort({ 'name.en': 1 }).lean();

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

/* ---- Batch report cards: every student in a class (or one section) for one exam ---- */
router.get('/report-cards', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const { exam } = req.query;
  if (!exam) throw ApiError.badRequest('exam is required');
  const { students } = await classRoster(req.query);
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
  if (!await Student.exists({ _id: student }) || !await Exam.exists({ _id: exam })) throw ApiError.notFound('Exam or student not found');
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
