import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

export default function MarkEntry() {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [exams, setExams] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [exam, setExam] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');

  const [rows, setRows] = useState([]); // [{ student, roll, name, marksObtained }]
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/exams/exams', { params: { limit: 200 } }).then((r) => setExams(r.data.items));
    api.get('/academics/sections', { params: { limit: 500 } }).then((r) => setSections(r.data.items));
    api.get('/academics/subjects', { params: { limit: 500 } }).then((r) => setSubjects(r.data.items));
  }, []);

  // The class of the chosen section, used to filter subjects.
  const sectionClassId = useMemo(() => {
    const s = sections.find((x) => (x.id || x._id) === section);
    return s?.class?.id || s?.class?._id || s?.class || '';
  }, [sections, section]);

  const subjectOptions = useMemo(
    () =>
      subjects.filter((s) => {
        const cls = s.class?.id || s.class?._id || s.class;
        return !cls || cls === sectionClassId;
      }),
    [subjects, sectionClassId]
  );

  const selectedSubject = subjects.find((s) => (s.id || s._id) === subject);
  const fullMarks = selectedSubject?.fullMarks || 100;

  const load = async () => {
    if (!exam || !section || !subject) return;
    setLoading(true);
    setLoaded(false);
    try {
      const [studentsRes, marksRes] = await Promise.all([
        api.get('/people/students', { params: { section, limit: 200 } }),
        api.get('/exams/marks', { params: { exam, subject } }),
      ]);
      const existing = {};
      for (const m of marksRes.data.items) {
        existing[m.student?.id || m.student?._id || m.student] = m.marksObtained;
      }
      setRows(
        studentsRes.data.items.map((s) => ({
          student: s.id || s._id,
          roll: s.roll,
          name: s.name,
          marksObtained: existing[s.id || s._id] ?? '',
        }))
      );
      setLoaded(true);
    } catch {
      push('Error loading students', 'error');
    } finally {
      setLoading(false);
    }
  };

  const setMark = (studentId, value) =>
    setRows((r) => r.map((x) => (x.student === studentId ? { ...x, marksObtained: value } : x)));

  const save = async () => {
    const marks = rows
      .filter((r) => r.marksObtained !== '' && r.marksObtained !== null)
      .map((r) => ({
        student: r.student,
        subject,
        marksObtained: Number(r.marksObtained),
        fullMarks,
      }));
    if (!marks.length) return;
    setSaving(true);
    try {
      await api.post('/exams/marks', { exam, marks });
      push(t('exams.saved'));
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
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
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('students.section')}
          </label>
          <Select
            value={section}
            onChange={(e) => {
              setSection(e.target.value);
              setSubject('');
            }}
          >
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
            {t('exams.subject')}
          </label>
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!section}>
            <option value="">{t('exams.selectSubject')}</option>
            {subjectOptions.map((s) => (
              <option key={s.id || s._id} value={s.id || s._id}>
                {bt(s.name, lang)}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={!exam || !section || !subject || loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('exams.load')}
        </button>
      </div>

      {!loaded && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('exams.chooseFilters')}
        </div>
      )}

      {loaded && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {t('exams.fullMarks')}: <span className="font-semibold">{fullMarks}</span>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={saving || rows.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('exams.save')}
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
              {t('exams.noStudents')}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-16 px-4 py-3">{t('attendance.roll')}</th>
                    <th className="px-4 py-3">{t('attendance.name')}</th>
                    <th className="w-40 px-4 py-3 text-right">{t('exams.marksObtained')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.student} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{r.roll ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{bt(r.name, lang)}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max={fullMarks}
                          value={r.marksObtained}
                          onChange={(e) => setMark(r.student, e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-right outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="ml-1 text-slate-400">/ {fullMarks}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
