import { ApiError } from './ApiError.js';

export async function validateReferences(doc) {
  const groups = new Map();
  doc.schema.eachPath((path, schemaType) => {
    const ref = schemaType.options?.ref || schemaType.caster?.options?.ref;
    if (!ref || typeof ref !== 'string') return;
    const value = doc.get(path);
    const ids = (Array.isArray(value) ? value : [value]).filter(Boolean).map(String);
    if (!ids.length) return;
    if (!groups.has(ref)) groups.set(ref, new Set());
    for (const id of ids) groups.get(ref).add(id);
  });
  for (const [ref, ids] of groups) {
    if (await doc.db.model(ref).countDocuments({ _id: { $in: [...ids] } }) !== ids.size) throw ApiError.badRequest(`Referenced ${ref} not found`);
  }
  if (doc.constructor.modelName === 'Student' && doc.section) {
    const section = await doc.db.model('Section').findById(doc.section).lean();
    if (!doc.class || String(section.class) !== String(doc.class)) throw ApiError.badRequest('Section must belong to the selected class');
  }
  if (doc.constructor.modelName === 'Student' && doc.class && doc.academicYear) {
    const grade = await doc.db.model('Class').findById(doc.class).lean();
    if (grade.academicYear && String(grade.academicYear) !== String(doc.academicYear)) throw ApiError.badRequest('Class must belong to the selected academic year');
  }
  if (doc.constructor.modelName === 'TimetableSlot') {
    const section = await doc.db.model('Section').findById(doc.section).lean();
    const subject = await doc.db.model('Subject').findById(doc.subject).lean();
    if (subject.class && String(subject.class) !== String(section.class)) throw ApiError.badRequest('Subject must belong to the section’s class');
  }
  if (doc.startDate && doc.endDate && doc.endDate < doc.startDate) throw ApiError.badRequest('End date must not be before the start date');
}
