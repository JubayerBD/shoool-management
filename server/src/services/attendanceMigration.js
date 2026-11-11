import { Attendance } from '../models/Attendance.js';
import { Class, Section } from '../models/Academic.js';
import { Student } from '../models/People.js';

export async function migrateAttendanceIndex() {
  for await (const record of Attendance.find({ class: null })) {
    const section = record.section ? await Section.findById(record.section) : null;
    const student = section ? null : await Student.findById(record.student);
    const grade = await Class.findById(section?.class || student?.class);
    if (!grade) throw new Error('An old attendance record has no class; repair it before migrating');
    await Attendance.updateOne({ _id: record._id, class: null }, { $set: { class: grade._id, ...(grade.academicYear ? { academicYear: grade.academicYear } : {}) } });
  }
  await Attendance.collection.createIndex({ student: 1, class: 1, date: 1 }, { unique: true, background: true });
  const indexes = await Attendance.collection.indexes();
  for (const index of indexes) {
    if (index.unique && Object.keys(index.key).length === 2 && index.key.student === 1 && index.key.date === 1) await Attendance.collection.dropIndex(index.name);
  }
}
