import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { crudController } from '../../utils/crudController.js';
import { Student, Teacher } from '../../models/People.js';
import { Invoice, Payment } from '../../models/Fees.js';
import { Attendance } from '../../models/Attendance.js';
import { Mark } from '../../models/Exam.js';
import { Section } from '../../models/Academic.js';
import { TimetableSlot } from '../../models/Schedule.js';
import { SalaryPayment, SalaryStructure } from '../../models/Finance.js';
import { blockIfInUse } from '../../utils/inUse.js';
import { importStudents, importUpload } from './students.import.js';
import { isSelfService, ownStudentIds } from '../../utils/access.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();

const students = crudController(Student, {
  populate: ['class', 'section', 'academicYear'],
  searchable: ['name.en', 'name.bn', 'admissionNo'],
  filterable: ['class', 'section', 'academicYear', 'status', 'gender'],
  defaultSort: { roll: 1 },
  // Money and results history must survive: mark the student inactive/graduated instead.
  guardRemove: blockIfInUse([[Invoice, 'student', 'fee invoices'], [Payment, 'student', 'fee payments'], [Attendance, 'student', 'attendance records'], [Mark, 'student', 'exam marks']]),
});

const teachers = crudController(Teacher, {
  populate: ['subjects'],
  searchable: ['name.en', 'name.bn', 'employeeId', 'email'],
  filterable: ['status', 'gender'],
  defaultSort: { 'name.en': 1 },
  guardRemove: blockIfInUse([[SalaryPayment, 'staff', 'salary payments'], [SalaryStructure, 'staff', 'a salary structure'], [TimetableSlot, 'teacher', 'timetable slots'], [Section, 'classTeacher', 'class-teacher assignments']]),
});

// Bulk CSV import (admin). Declared before "/students/:id" so it isn't shadowed.
router.post(
  '/students/import',
  requireAuth,
  requireRole('admin'),
  importUpload.single('file'),
  importStudents
);

// Students: staff can read; admins manage.
router.get('/students', requireAuth, requireRole('admin', 'teacher', 'accountant'), students.list);
router.get('/students/:id', requireAuth, (req, _res, next) => {
  // Students see only themselves; parents only their children.
  if (isSelfService(req.user) && !ownStudentIds(req.user).includes(String(req.params.id))) {
    throw ApiError.forbidden('You do not have permission to view this student');
  }
  next();
}, students.get);
router.post('/students', requireAuth, requireRole('admin'), students.create);
router.put('/students/:id', requireAuth, requireRole('admin'), students.update);
router.delete('/students/:id', requireAuth, requireRole('admin'), students.remove);

// Teachers.
// Students and parents get the staff directory without private contact details.
const hideTeacherContacts = (req, res, next) => {
  if (!isSelfService(req.user)) return next();
  const json = res.json.bind(res);
  const strip = (t) => {
    const plain = typeof t.toJSON === 'function' ? t.toJSON() : { ...t };
    delete plain.phone; delete plain.email; delete plain.address;
    return plain;
  };
  res.json = (body) => json({ ...body, ...(body.items && { items: body.items.map(strip) }), ...(body.item && { item: strip(body.item) }) });
  next();
};
router.get('/teachers', requireAuth, hideTeacherContacts, teachers.list);
router.get('/teachers/:id', requireAuth, hideTeacherContacts, teachers.get);
router.post('/teachers', requireAuth, requireRole('admin'), teachers.create);
router.put('/teachers/:id', requireAuth, requireRole('admin'), teachers.update);
router.delete('/teachers/:id', requireAuth, requireRole('admin'), teachers.remove);

export default router;
