import { ApiError } from './ApiError.js';

/** Roles that only ever see their own (student) or their children's (parent) records. */
export const isSelfService = (user) => ['student', 'parent'].includes(user.role);

/** Student ids a student/parent account may read. */
export function ownStudentIds(user) {
  if (user.role === 'student') return [user.student].filter(Boolean).map(String);
  if (user.role === 'parent') return (user.children || []).map(String);
  return [];
}

/** Academic data (marks, attendance) is for admins, teachers and the student's own family. */
export function requireAcademicAccess(user) {
  if (user.role === 'accountant') throw ApiError.forbidden('You do not have permission to view this data');
}

/** Throws unless the user may read this student's records. */
export function assertStudentAccess(user, studentId) {
  requireAcademicAccess(user);
  if (!isSelfService(user)) return;
  if (!ownStudentIds(user).includes(String(studentId))) {
    throw ApiError.forbidden('You do not have permission to view this student');
  }
}

/** Mongo filter for notices a non-admin may see: addressed to their role (or all) and not expired. */
export function noticeScopeFor(user) {
  if (user.role === 'admin') return null;
  return {
    $and: [
      { $or: [{ audience: { $size: 0 } }, { audience: { $in: ['all', user.role] } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
    ],
  };
}
