import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';
import ClassSectionSelects, { useClassSections, examYearId } from './ClassSectionSelects.jsx';
import ExamPapers from './ExamPapers.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiError } from '../../utils/apiError.js';

export default function MarkEntry() {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [exams, setExams] = useState([]);
  const { classes, sections } = useClassSections();
  const [subjects, setSubjects] = useState([]);

  const [exam, setExam] = useState('');
  const [klass, setKlass] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');

  const [rows, setRows] = useState([]); // [{ student, roll, name, marksObtained }]
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paper, setPaper] = useState(null); // { fullMarks, passMarks, configured } for this exam, class and subject
  const [papersOpen, setPapersOpen] = useState(false);

  useEffect(() => {
    api.get('/exams/exams', { params: { limit: 200 } }).then((r) => setExams(r.data.items));
    api.get('/academics/subjects', { params: { limit: 500 } }).then((r) => setSubjects(r.data.items));
  }, []);

  const subjectOptions = useMemo(
    () =>
      subjects.filter((s) => {
        const cls = s.class?.id || s.class?._id || s.class;
        return !cls || cls === klass;
      }),
    [subjects, klass]
  );

  const fullMarks = paper?.fullMarks ?? 100;
  const passMarks = paper?.passMarks ?? Math.round(fullMarks * 0.33);
  const examDoc = exams.find((x) => (x.id || x._id) === exam);

  const load = async () => {
    if (!exam || !klass || !subject) return;
    setLoading(true);
    setLoaded(false);
    try {
      const [studentsRes, marksRes, papersRes] = await Promise.all([
        api.get('/exams/roster', { params: { exam, class: klass, ...(section ? { section } : {}) } }),
        api.get('/exams/marks', { params: { exam, subject } }),
        api.get('/exams/papers', { params: { exam, class: klass } }),
      ]);
      setPaper(papersRes.data.items.find((row) => row.subject === subject) || null);
      const existing = {};
      for (const m of marksRes.data.items) {
        existing[m.student?.id || m.student?._id || m.student] = m.marksObtained;
      }
      setRows(
        studentsRes.data.items.map((s) => ({
          student: s.student,
          roll: s.roll,
          name: s.name,
          admissionNo: s.admissionNo,
          marksObtained: existing[s.student] ?? '',
        }))
      );
      setLoaded(true);
    } catch (err) {
      push(apiError(err, t('attendance.rosterError')), 'error');
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
    if (marks.some((m) => m.marksObtained > fullMarks)) { push(t('exams.aboveFull', { full: fullMarks }), 'error'); return; }
    setSaving(true);
    try {
      await api.post('/exams/marks', { exam, class: klass, marks });
      push(t('exams.saved'));
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const failing = rows.filter((r) => r.marksObtained !== '' && r.marksObtained !== null && Number(r.marksObtained) < passMarks).length;

  return (
    <div className="space-y-5">
      <ExamPapers
        open={papersOpen}
        exam={examDoc}
        classes={classes}
        initialClass={klass}
        onClose={() => setPapersOpen(false)}
        onSaved={() => load()}
      />
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('exams.tabs.terms')}
          </label>
          <Select value={exam} onChange={(e) => { setExam(e.target.value); setLoaded(false); }}>
            <option value="">{t('exams.selectExam')}</option>
            {exams.map((x) => (
              <option key={x.id || x._id} value={x.id || x._id}>
                {bt(x.name, lang)}
              </option>
            ))}
          </Select>
        </div>
        <ClassSectionSelects
          classes={classes}
          sections={sections}
          klass={klass}
          section={section}
          yearId={examYearId(exams, exam)}
          lang={lang}
          onChange={(next) => {
            if (next.klass !== klass) setSubject('');
            setKlass(next.klass);
            setSection(next.section);
            setLoaded(false);
          }}
        />
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('exams.subject')}
          </label>
          <Select value={subject} onChange={(e) => { setSubject(e.target.value); setLoaded(false); }} disabled={!klass}>
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
          disabled={!exam || !klass || !subject || loading}
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="font-semibold">{t('attendance.studentCount', { count: rows.length })}</span>
              <span>{t('exams.fullMarks')}: <span className="font-semibold">{fullMarks}</span></span>
              <span>{t('exams.passMarks')}: <span className="font-semibold">{passMarks}</span></span>
              {failing > 0 && <span className="font-medium text-red-600">{t('exams.belowPass', { count: failing })}</span>}
              {isAdmin && <button type="button" onClick={() => setPapersOpen(true)} className="text-brand-600 underline">{t('exams.setMarks')}</button>}
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

          {paper && !paper.configured && (
            <div role="status" className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              {t(isAdmin ? 'exams.notConfiguredAdmin' : 'exams.notConfigured', { full: fullMarks, pass: passMarks })}
            </div>
          )}

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
                    <th className="w-48 px-4 py-3 text-right">{t('exams.marksObtained')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.student} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{r.roll ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{bt(r.name, lang)}<span className="mt-0.5 block text-xs font-normal text-slate-500">{r.admissionNo}</span></td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max={fullMarks}
                          value={r.marksObtained}
                          onChange={(e) => setMark(r.student, e.target.value)}
                          aria-invalid={r.marksObtained !== '' && Number(r.marksObtained) > fullMarks}
                          className={`w-24 rounded-lg border px-3 py-1.5 text-right outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
                            r.marksObtained === '' ? 'border-slate-300'
                              : Number(r.marksObtained) > fullMarks ? 'border-red-500 bg-red-50'
                              : Number(r.marksObtained) < passMarks ? 'border-red-300 text-red-600' : 'border-slate-300'
                          }`}
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
