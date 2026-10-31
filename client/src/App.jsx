import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
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
import Notices from './pages/notices/Notices.jsx';
import Accounts from './pages/accounts/Accounts.jsx';
import Finance from './pages/finance/Finance.jsx';
import Classes from './pages/academics/Classes.jsx';
import Sections from './pages/academics/Sections.jsx';
import Subjects from './pages/academics/Subjects.jsx';
// Admin-only academic-setup screens.
const ACADEMIC_ROUTES = [
  { path: 'classes', element: <Classes /> },
  { path: 'sections', element: <Sections /> },
  { path: 'subjects', element: <Subjects /> },
];

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
              <Route index element={<Dashboard />} />
              <Route
                path="students"
                element={
                  <ProtectedRoute roles={['admin', 'teacher', 'accountant']}>
                    <Students />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teachers"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
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
              <Route path="exams" element={<Exams />} />
              <Route path="fees" element={<Fees />} />
              <Route
                path="timetable"
                element={<Timetable />}
              />
              <Route path="notices" element={<Notices />} />
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
                  element={<ProtectedRoute roles={['admin']}>{r.element}</ProtectedRoute>}
                />
              ))}
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
