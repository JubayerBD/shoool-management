import { useAuth } from '../../context/AuthContext.jsx';
import Attendance from './Attendance.jsx';
import MyAttendance from './MyAttendance.jsx';

/** Staff mark attendance; students/parents see their own summary. */
export default function AttendanceView() {
  const { user } = useAuth();
  const isStaff = ['admin', 'teacher'].includes(user.role);
  return isStaff ? <Attendance /> : <MyAttendance />;
}
