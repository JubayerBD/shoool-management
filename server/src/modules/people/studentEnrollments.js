import mongoose from 'mongoose';
import { Enrollment } from '../../models/Enrollment.js';
import { Student } from '../../models/People.js';
import { ApiError } from '../../utils/ApiError.js';

export async function attachEnrollments(items) {
  const records = await Enrollment.find({ student: { $in: items.map(s => s.id || s._id) } })
    .populate('academicYear class section').sort({ createdAt: 1 }).lean();
  return items.map(item => {
    const plain = item.toJSON ? item.toJSON() : item;
    return { ...plain, enrollments: records.filter(e => String(e.student) === String(plain.id || plain._id)) };
  });
}

export async function listStudents(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const filter = {}, enrollmentFilter = {};
  for (const field of ['class', 'academicYear', 'section']) {
    if (typeof req.query[field] !== 'string' || !req.query[field]) continue;
    if (!mongoose.isObjectIdOrHexString(req.query[field])) throw ApiError.badRequest(`Invalid ${field}`);
    enrollmentFilter[field] = req.query[field];
  }
  if (Object.keys(enrollmentFilter).length) {
    const studentIds = await Enrollment.distinct('student', enrollmentFilter);
    filter.$and = [{ $or: [enrollmentFilter, { _id: { $in: studentIds } }] }];
  }
  for (const field of ['status', 'gender']) if (typeof req.query[field] === 'string' && req.query[field]) filter[field] = req.query[field];
  if (typeof req.query.search === 'string' && req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = ['name.en', 'name.bn', 'admissionNo'].map(field => ({ [field]: rx }));
  }
  const sort = typeof req.query.sort === 'string' && /^-?[A-Za-z_][\w.]*$/.test(req.query.sort) ? req.query.sort : { roll: 1, admissionNo: 1, _id: 1 };
  const [students, total] = await Promise.all([
    Student.find(filter).populate('class section academicYear').sort(sort).skip((page - 1) * limit).limit(limit),
    Student.countDocuments(filter),
  ]);
  res.json({ items: await attachEnrollments(students), total, page, limit, pages: Math.ceil(total / limit) });
}

export async function getStudent(req, res) {
  const student = await Student.findById(req.params.id).populate('class section academicYear');
  if (!student) throw ApiError.notFound('Student not found');
  const [item] = await attachEnrollments([student]);
  res.json({ item });
}
