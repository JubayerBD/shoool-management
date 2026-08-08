import multer from 'multer';
import { parseCsv } from '../../utils/csv.js';
import { Student } from '../../models/People.js';
import { Class, Section } from '../../models/Academic.js';
import { ApiError } from '../../utils/ApiError.js';

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

/**
 * Expected CSV headers (case-sensitive):
 * admissionNo, roll, nameEn, nameBn, gender, className, sectionName,
 * guardianName, guardianPhone
 *
 * className / sectionName are matched against English names (case-insensitive).
 */
export async function importStudents(req, res) {
  if (!req.file) throw ApiError.badRequest('No CSV file uploaded (field name "file")');

  const text = req.file.buffer.toString('utf8');
  const rows = parseCsv(text);
  if (!rows.length) throw ApiError.badRequest('CSV has no data rows');
  if (rows.length > 1000) throw ApiError.badRequest('Too many rows (max 1000 per import)');

  // Preload classes/sections for name lookups.
  const [classes, sections] = await Promise.all([Class.find().lean(), Section.find().lean()]);
  const findClass = (name) =>
    classes.find((c) => c.name?.en?.toLowerCase() === String(name).toLowerCase());
  const findSection = (name, classId) =>
    sections.find(
      (s) =>
        s.name?.en?.toLowerCase() === String(name).toLowerCase() &&
        (!classId || String(s.class) === String(classId))
    );

  const created = [];
  const failed = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rowNo = i + 2; // +1 header, +1 to 1-index
    try {
      if (!r.admissionNo) throw new Error('admissionNo is required');
      if (!r.nameEn) throw new Error('nameEn is required');

      const cls = r.className ? findClass(r.className) : null;
      if (r.className && !cls) throw new Error(`Unknown class "${r.className}"`);
      const section = r.sectionName ? findSection(r.sectionName, cls?._id) : null;
      if (r.sectionName && !section) throw new Error(`Unknown section "${r.sectionName}"`);

      const doc = {
        admissionNo: r.admissionNo,
        name: { en: r.nameEn, bn: r.nameBn || '' },
        gender: ['male', 'female', 'other'].includes(r.gender) ? r.gender : 'male',
      };
      if (r.roll) doc.roll = Number(r.roll);
      if (cls) doc.class = cls._id;
      if (section) doc.section = section._id;
      if (r.guardianName) {
        doc.guardians = [{ name: { en: r.guardianName, bn: '' }, phone: r.guardianPhone || '' }];
      }

      // eslint-disable-next-line no-await-in-loop
      const student = await Student.create(doc);
      created.push({ row: rowNo, id: student.id, admissionNo: student.admissionNo });
    } catch (err) {
      const reason = err.code === 11000 ? 'Duplicate admissionNo' : err.message;
      failed.push({ row: rowNo, admissionNo: r.admissionNo || '', name: r.nameEn || '', reason });
    }
  }

  res.status(201).json({ total: rows.length, created: created.length, failed });
}
