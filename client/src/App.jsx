import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Students from './pages/students/Students.jsx';
import Teachers from './pages/people/Teachers.jsx';
import AttendanceView from './pages/attendance/AttendanceView.jsx';
import Exams from './pages/exams/Exams.jsx';
import Fees from './pages/fees/Fees.jsx';
import Timetable from './pages/timetable/Timetable.jsx';
import AcademicCalendar from './pages/timetable/AcademicCalendar.jsx';
import Notices from './pages/notices/Notices.jsx';
import Accounts from './pages/accounts/Accounts.jsx';
import Finance from './pages/finance/Finance.jsx';
import Partners from './pages/partners/Partners.jsx';
import ActivityLogs from './pages/activity/ActivityLogs.jsx';
import Classes from './pages/academics/Classes.jsx';
import Sections from './pages/academics/Sections.jsx';
import Subjects from './pages/academics/Subjects.jsx';
// Teachers can read academic setup; administrative changes remain admin-only.
const ACADEMIC_ROUTES = [
  { path: 'classes', element: <Classes /> },
  { path: 'sections', element: <Sections /> },
  { path: 'subjects', element: <Subjects /> },
];

function Home() {
  const { user } = useAuth();
  if (user.role === 'teacher') return <Navigate to="/students" replace />;
  if (user.role === 'accountant') return <Navigate to="/fees" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Home />} />
              <Route path="academic-calendar" element={<ProtectedRoute roles={['admin', 'student', 'parent', 'teacher']}><AcademicCalendar /></ProtectedRoute>} />
              <Route path="activity-logs" element={<ProtectedRoute roles={['admin']}><ActivityLogs /></ProtectedRoute>} />
              <Route path="partners" element={<ProtectedRoute roles={['admin']}><Partners /></ProtectedRoute>} />
              <Route path="partners/:id" element={<ProtectedRoute roles={['admin']}><Partners /></ProtectedRoute>} />
              <Route
                path="students"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <Students />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teachers"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <Teachers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="attendance"
                element={
                  <ProtectedRoute roles={['admin', 'teacher', 'student', 'parent']}>
                    <AttendanceView />
                  </ProtectedRoute>
                }
              />
              <Route
                path="exams"
                element={
                  <ProtectedRoute roles={['admin', 'teacher', 'student', 'parent']}>
                    <Exams />
                  </ProtectedRoute>
                }
              />
              <Route
                path="fees"
                element={
                  <ProtectedRoute roles={['admin', 'accountant', 'student', 'parent']}>
                    <Fees />
                  </ProtectedRoute>
                }
              />
              <Route
                path="timetable"
                element={<ProtectedRoute roles={['admin', 'student', 'parent']}><Timetable /></ProtectedRoute>}
              />
              <Route path="notices" element={<ProtectedRoute roles={['admin', 'student', 'parent']}><Notices /></ProtectedRoute>} />
              <Route
                path="accounts"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <Accounts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="finance"
                element={
                  <ProtectedRoute roles={['admin', 'accountant']}>
                    <Finance />
                  </ProtectedRoute>
                }
              />
              {ACADEMIC_ROUTES.map((r) => (
                <Route
                  key={r.path}
                  path={r.path}
                  element={<ProtectedRoute roles={['admin', 'teacher']}>{r.element}</ProtectedRoute>}
                />
              ))}
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
