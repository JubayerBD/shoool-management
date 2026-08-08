import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { crudController } from '../../utils/crudController.js';
import { Student, Teacher } from '../../models/People.js';
import { importStudents, importUpload } from './students.import.js';

const router = Router();

const students = crudController(Student, {
  populate: ['class', 'section', 'academicYear'],
  searchable: ['name.en', 'name.bn', 'admissionNo'],
  filterable: ['class', 'section', 'academicYear', 'status', 'gender'],
  defaultSort: { roll: 1 },
});

const teachers = crudController(Teacher, {
  populate: ['subjects'],
  searchable: ['name.en', 'name.bn', 'employeeId', 'email'],
  filterable: ['status', 'gender'],
  defaultSort: { 'name.en': 1 },
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
router.get('/students/:id', requireAuth, students.get);
router.post('/students', requireAuth, requireRole('admin'), students.create);
router.put('/students/:id', requireAuth, requireRole('admin'), students.update);
router.delete('/students/:id', requireAuth, requireRole('admin'), students.remove);

// Teachers.
router.get('/teachers', requireAuth, teachers.list);
router.get('/teachers/:id', requireAuth, teachers.get);
router.post('/teachers', requireAuth, requireRole('admin'), teachers.create);
router.put('/teachers/:id', requireAuth, requireRole('admin'), teachers.update);
router.delete('/teachers/:id', requireAuth, requireRole('admin'), teachers.remove);

export default router;
