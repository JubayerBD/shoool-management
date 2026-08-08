import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Resolve the student record tied to the current user:
 * - student role  -> their own linked student
 * - parent role   -> their first child
 * Returns { studentId, student, loading }. `student` is populated (class/section).
 */
export function useOwnStudent() {
  const { user } = useAuth();
  const studentId =
    user.role === 'student' ? user.student : user.role === 'parent' ? user.children?.[0] : null;

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(Boolean(studentId));

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`/people/students/${studentId}`)
      .then((r) => setStudent(r.data.item))
      .catch(() => setStudent(null))
      .finally(() => setLoading(false));
  }, [studentId]);

  return { studentId, student, loading };
}
