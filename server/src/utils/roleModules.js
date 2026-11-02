import { ApiError } from './ApiError.js';

// Financial forms need student/staff/academic pickers. These are read-only
// supporting lookups, not permission to manage the corresponding modules.
export function assertRoleModuleAccess(req, user) {
  if (!['teacher', 'accountant'].includes(user.role)) return;
  const path = req.originalUrl.split('?')[0];
  const module = path.split('/')[2];
  const read = req.method === 'GET';
  if (module === 'auth' || module === 'uploads') return;
  if (user.role === 'teacher' && read && module === 'calendar') return;
  if (user.role === 'teacher' && (['attendance', 'exams'].includes(module) || (read && ['academics', 'people'].includes(module)))) return;
  if (user.role === 'accountant' && (['fees', 'finance'].includes(module) || (read && ['academics', 'people'].includes(module)))) return;
  throw ApiError.forbidden('Your account does not have access to this module');
}
