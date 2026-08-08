/**
 * Sidebar items per role. `key` maps to an i18n label under nav.*,
 * `to` is the route path. Order matters.
 */
const ALL = [
  { key: 'dashboard', to: '/' },
  { key: 'students', to: '/students' },
  { key: 'teachers', to: '/teachers' },
  { key: 'classes', to: '/classes' },
  { key: 'sections', to: '/sections' },
  { key: 'subjects', to: '/subjects' },
  { key: 'attendance', to: '/attendance' },
  { key: 'exams', to: '/exams' },
  { key: 'fees', to: '/fees' },
  { key: 'timetable', to: '/timetable' },
  { key: 'notices', to: '/notices' },
  { key: 'accounts', to: '/accounts' },
];

const pick = (keys) => ALL.filter((item) => keys.includes(item.key));

export const NAV_BY_ROLE = {
  admin: ALL,
  accountant: pick(['dashboard', 'students', 'fees', 'notices']),
  teacher: pick(['dashboard', 'students', 'attendance', 'exams', 'timetable', 'notices']),
  student: pick(['dashboard', 'attendance', 'exams', 'fees', 'timetable', 'notices']),
  parent: pick(['dashboard', 'attendance', 'exams', 'fees', 'notices']),
};

export function navForRole(role) {
  return NAV_BY_ROLE[role] || pick(['dashboard', 'notices']);
}
