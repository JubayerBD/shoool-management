import { AcademicYear, Class, Section } from '../models/Academic.js';
import { Enrollment } from '../models/Enrollment.js';
import { Student } from '../models/People.js';
import { ApiError } from '../utils/ApiError.js';

export async function attendanceContext(input) {
  const section = input.section ? await Section.findById(input.section) : null;
  if (input.section && !section) throw ApiError.badRequest('Section not found');
  const grade = await Class.findById(input.class || section?.class);
  if (!grade) throw ApiError.badRequest('Choose a valid class');
  if (section && String(section.class) !== grade.id) throw ApiError.badRequest('Section does not belong to the selected class');
  const year = await AcademicYear.findById(input.academicYear || grade.academicYear);
  if (!year || (grade.academicYear && String(grade.academicYear) !== year.id)) throw ApiError.badRequest('Class does not belong to the selected academic year');
  const first = year.startDate.toISOString().slice(0, 10), last = year.endDate.toISOString().slice(0, 10);
  if (input.date < first || input.date > last) throw ApiError.badRequest('Attendance date must fall within the academic year');
  return { grade, year, section };
}

export async function attendanceStudents({ grade, year, section }) {
  const memberships = await Enrollment.find({ class: grade.id, academicYear: year.id }).lean();
  const byStudent = new Map(memberships.map(record => [String(record.student), record]));
  const students = await Student.find({ status: 'active', $or: [
    { class: grade.id, academicYear: year.id },
    { _id: { $in: memberships.filter(record => record.status !== 'withdrawn').map(record => record.student) } },
  ] }).sort({ roll: 1, admissionNo: 1, _id: 1 }).lean();
  return students.flatMap(student => {
    const membership = byStudent.get(String(student._id));
    if (membership?.status === 'withdrawn') return [];
    const primary = String(student.class) === grade.id && String(student.academicYear) === year.id;
    const assignedSection = membership ? membership.section : primary ? student.section : null;
    if (section && String(assignedSection) !== section.id) return [];
    return [{ ...student, section: assignedSection || null, roll: membership?.roll ?? student.roll }];
  });
}
