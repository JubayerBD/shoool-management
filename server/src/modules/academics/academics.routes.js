import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { crudController } from '../../utils/crudController.js';
import { AcademicYear, Class, Section, Subject } from '../../models/Academic.js';
import { Student } from '../../models/People.js';
import { Exam, Mark } from '../../models/Exam.js';
import { TimetableSlot } from '../../models/Schedule.js';
import { Attendance } from '../../models/Attendance.js';
import { FeeStructure } from '../../models/Fees.js';
import { FeePlan } from '../../models/FeeWorkflow.js';
import { blockIfInUse } from '../../utils/inUse.js';

const router = Router();

// Everyone signed-in can read academic structure; only admins can mutate.
const admin = requireRole('admin');

function mount(path, Model, opts) {
  const c = crudController(Model, opts);
  router.get(`${path}`, requireAuth, c.list);
  router.get(`${path}/:id`, requireAuth, c.get);
  router.post(`${path}`, requireAuth, admin, c.create);
  router.put(`${path}/:id`, requireAuth, admin, c.update);
  router.delete(`${path}/:id`, requireAuth, admin, c.remove);
}

mount('/academic-years', AcademicYear, {
  searchable: ['name.en', 'name.bn'],
  filterable: ['isCurrent'],
  defaultSort: { startDate: -1 },
  guardRemove: blockIfInUse([[Class, 'academicYear', 'classes'], [Student, 'academicYear', 'students'], [Exam, 'academicYear', 'exams'], [FeePlan, 'academicYear', 'fee plans']]),
});

mount('/classes', Class, {
  populate: ['academicYear'],
  searchable: ['name.en', 'name.bn'],
  filterable: ['academicYear'],
  defaultSort: { numericLevel: 1 },
  guardRemove: blockIfInUse([[Section, 'class', 'sections'], [Student, 'class', 'students'], [Subject, 'class', 'subjects'], [FeePlan, 'class', 'fee plans'], [FeeStructure, 'class', 'fee types']]),
});

mount('/sections', Section, {
  populate: ['class', 'classTeacher'],
  searchable: ['name.en', 'name.bn'],
  filterable: ['class'],
  defaultSort: { 'name.en': 1 },
  guardRemove: blockIfInUse([[Student, 'section', 'students'], [TimetableSlot, 'section', 'timetable slots'], [Attendance, 'section', 'attendance records']]),
});

mount('/subjects', Subject, {
  populate: ['class'],
  searchable: ['name.en', 'name.bn', 'code'],
  filterable: ['class', 'isOptional'],
  defaultSort: { 'name.en': 1 },
  guardRemove: blockIfInUse([[Mark, 'subject', 'exam marks'], [TimetableSlot, 'subject', 'timetable slots']]),
});

export default router;
