import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useOwnStudent } from '../../hooks/useOwnStudent.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

const gradeColor = (grade) => {
  if (grade === 'F') return 'text-red-600';
  if (grade === 'A+' || grade === 'A') return 'text-emerald-600';
  return 'text-slate-700';
};

export default function ReportCard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  // Students/parents only ever see their own card — hide the pickers.
  const selfService = ['student', 'parent'].includes(user.role);
  const own = useOwnStudent();

  const [exams, setExams] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);

  const [exam, setExam] = useState('');
  const [section, setSection] = useState('');
  const [student, setStudent] = useState('');

  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/exams/exams', { params: { limit: 200 } }).then((r) => setExams(r.data.items));
    if (!selfService) {
      api.get('/academics/sections', { params: { limit: 500 } }).then((r) => setSections(r.data.items));
    }
  }, [selfService]);

  // In self-service mode lock the student to the logged-in user's own student.
  useEffect(() => {
    if (selfService && own.studentId) setStudent(own.studentId);
  }, [selfService, own.studentId]);

  // Reload students when the section changes (staff picker only).
  useEffect(() => {
    if (selfService) return;
    setStudent('');
    setStudents([]);
    setCard(null);
    if (!section) return;
    api
      .get('/people/students', { params: { section, limit: 200 } })
      .then((r) => setStudents(r.data.items));
  }, [section, selfService]);

  const selectedStudent = selfService
    ? own.student
    : students.find((s) => (s.id || s._id) === student);

  const view = async () => {
    if (!exam || !student) return;
    setLoading(true);
    setCard(null);
    try {
      const res = await api.get('/exams/report-card', { params: { exam, student } });
      setCard(res.data.reportCard);
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const examName = useMemo(() => {
    const e = exams.find((x) => (x.id || x._id) === exam);
    return e ? bt(e.name, lang) : '';
  }, [exams, exam, lang]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm no-print">
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('exams.tabs.terms')}
          </label>
          <Select value={exam} onChange={(e) => setExam(e.target.value)}>
            <option value="">{t('exams.selectExam')}</option>
            {exams.map((x) => (
              <option key={x.id || x._id} value={x.id || x._id}>
                {bt(x.name, lang)}
              </option>
            ))}
          </Select>
        </div>
        {!selfService && (
          <>
            <div className="w-52">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('students.section')}
              </label>
              <Select value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">{t('exams.selectSection')}</option>
                {sections.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>
                    {bt(s.class?.name, lang)} — {bt(s.name, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-52">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('students.title')}
              </label>
              <Select value={student} onChange={(e) => setStudent(e.target.value)} disabled={!section}>
                <option value="">{t('exams.selectStudent')}</option>
                {students.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>
                    {bt(s.name, lang)}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={view}
          disabled={!exam || !student || loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('exams.view')}
        </button>
      </div>

      {!card && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('exams.chooseExamStudent')}
        </div>
      )}

      {card && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm print-area">
          <div className="flex items-center justify-end px-6 pt-4 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              🖨 {t('common.print')}
            </button>
          </div>

          {/* Print-only school header */}
          <div className="print-only px-6 pt-4 text-center">
            <div className="text-xl font-bold">{t('app.name')}</div>
            <div className="text-sm">{t('exams.tabs.reportCard')}</div>
          </div>

          {/* Header */}
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="text-lg font-bold text-slate-800">
              {selectedStudent ? bt(selectedStudent.name, lang) : ''}
            </div>
            <div className="text-sm text-slate-500">
              {examName}
              {selectedStudent?.admissionNo ? ` · ${selectedStudent.admissionNo}` : ''}
            </div>
          </div>

          {/* Subjects */}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">{t('exams.subject')}</th>
                <th className="px-4 py-3 text-right">{t('exams.fullMarks')}</th>
                <th className="px-4 py-3 text-right">{t('exams.marksObtained')}</th>
                <th className="px-4 py-3 text-center">{t('exams.grade')}</th>
                <th className="px-4 py-3 text-right">{t('exams.gradePoint')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {card.subjects.map((m) => (
                <tr key={m.id || m._id}>
                  <td className="px-6 py-2.5 font-medium text-slate-800">
                    {bt(m.subject?.name, lang)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{m.fullMarks}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                    {m.marksObtained}
                  </td>
                  <td className={`px-4 py-2.5 text-center font-bold ${gradeColor(m.grade)}`}>
                    {m.grade}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {m.gradePoint.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-6 py-3">{t('exams.total')}</td>
                <td className="px-4 py-3 text-right">{card.totalFull}</td>
                <td className="px-4 py-3 text-right">{card.totalObtained}</td>
                <td colSpan={2} className="px-4 py-3 text-right">
                  {card.percentage}%
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Summary */}
          <div className="flex flex-wrap items-center gap-6 border-t border-slate-200 px-6 py-4">
            <div>
              <span className="text-sm text-slate-500">{t('exams.gpa')}: </span>
              <span className="text-xl font-bold text-slate-800">{card.gpa.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-sm text-slate-500">{t('exams.result')}: </span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${
                  card.result === 'Pass'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {card.result === 'Pass' ? t('exams.pass') : t('exams.fail')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
