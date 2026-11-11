import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';
import { schoolDate } from '../../utils/schoolDate.js';
import { getAll } from '../../api/getAll.js';

const STATUSES = ['present', 'absent', 'late', 'leave'];

const statusStyle = {
  present: 'bg-emerald-600 text-white',
  absent: 'bg-red-600 text-white',
  late: 'bg-amber-500 text-white',
  leave: 'bg-slate-500 text-white',
};

function today() {
  return schoolDate();
}

export default function Attendance() {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [years, setYears] = useState([]), [classes, setClasses] = useState([]);
  const [year, setYear] = useState(''), [grade, setGrade] = useState('');
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [date, setDate] = useState(today());

  const [roster, setRoster] = useState([]); // [{ student, roll, name, status }]
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const id = item => String(item?.id || item?._id || item || '');
  const availableClasses = classes.filter(item => !item.academicYear || id(item.academicYear) === year);
  const availableSections = sections.filter(item => id(item.class) === grade);
  const reset = () => { setLoaded(false); setRoster([]); };
  useEffect(() => {
    Promise.all([getAll('/academics/academic-years'), getAll('/academics/classes'), getAll('/academics/sections')])
      .then(([y,c,s]) => { setYears(y.data.items); setClasses(c.data.items); setSections(s.data.items); setYear(id(y.data.items.find(item => item.isCurrent) || y.data.items[0])); })
      .catch(() => push(t('attendance.setupError'), 'error'));
  }, []);

  const loadRoster = async () => {
    if (!grade || !year || !date) return;
    setLoading(true); setLoaded(false);
    try {
      const response = await api.get('/attendance/roster', { params: { class: grade, academicYear: year, date, ...(section ? { section } : {}) } });
      setRoster(response.data.items); setLoaded(true);
    } catch (err) { push(err.response?.data?.error?.message || t('attendance.rosterError'), 'error'); }
    finally { setLoading(false); }
  };

  const setStatus = (studentId, status) =>
    setRoster((rows) => rows.map((r) => (r.student === studentId ? { ...r, status } : r)));

  const markAllPresent = () =>
    setRoster((rows) => rows.map((r) => ({ ...r, status: 'present' })));

  const summary = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const r of roster) c[r.status] += 1;
    return c;
  }, [roster]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/attendance/bulk', {
        class: grade,
        academicYear: year,
        ...(section ? { section } : {}),
        date,
        records: roster.map((r) => ({ student: r.student, status: r.status, remark: r.remark || '' })),
      });
      push(t('attendance.saved'));
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">{t('attendance.title')}</h1>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="w-full sm:w-44">
          <label htmlFor="attendance-year" className="mb-1 block text-sm font-medium text-slate-700">{t('academics.year')}</label>
          <Select id="attendance-year" disabled={loading || saving} value={year} onChange={e => { setYear(e.target.value); setGrade(''); setSection(''); reset(); }}>
            <option value="">{t('academics.selectYear')}</option>
            {years.map(item => <option key={id(item)} value={id(item)}>{bt(item.name, lang)}</option>)}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <label htmlFor="attendance-class" className="mb-1 block text-sm font-medium text-slate-700">{t('academics.class')}</label>
          <Select id="attendance-class" disabled={!year || loading || saving} value={grade} onChange={e => { setGrade(e.target.value); setSection(''); reset(); }}>
            <option value="">{t('attendance.selectClass')}</option>
            {availableClasses.map(item => <option key={id(item)} value={id(item)}>{bt(item.name, lang)}</option>)}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="attendance-section" className="mb-1 block text-sm font-medium text-slate-700">{t('attendance.optionalSection')}</label>
          <Select id="attendance-section" disabled={!grade || !availableSections.length || loading || saving} value={section} onChange={e => { setSection(e.target.value); reset(); }}>
            <option value="">{t(availableSections.length ? 'attendance.allSections' : 'attendance.noSection')}</option>
            {availableSections.map(item => <option key={id(item)} value={id(item)}>{bt(item.name, lang)}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <label htmlFor="attendance-date" className="mb-1 block text-sm font-medium text-slate-700">
            {t('attendance.date')}
          </label>
          <input
            id="attendance-date" disabled={loading || saving}
            type="date"
            value={date}
            max={today()}
            onChange={(e) => { setDate(e.target.value); setLoaded(false); setRoster([]); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={loadRoster}
          disabled={!grade || !year || !date || loading || saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('attendance.load')}
        </button>
      </div>

      {!loaded && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('attendance.chooseClassDate')}
        </div>
      )}

      {loaded && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              <span className="mr-3 font-semibold">{t('attendance.studentCount', { count: roster.length })}</span>{t('attendance.summary', summary)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving} onClick={markAllPresent}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {t('attendance.markAll')}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || roster.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('attendance.save')}
              </button>
            </div>
          </div>

          {roster.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
              {t('attendance.noStudents')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-16 px-4 py-3">{t('attendance.roll')}</th>
                    <th className="px-4 py-3">{t('attendance.name')}</th>
                    <th className="px-4 py-3 text-right">{t('students.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roster.map((r) => (
                    <tr key={r.student} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{r.roll ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{bt(r.name, lang)}<span className="mt-1 block text-xs font-normal text-slate-500">{r.admissionNo}</span></td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {STATUSES.map((s) => (
                            <button
                              type="button"
                              key={s}
                              disabled={saving} aria-pressed={r.status === s} onClick={() => setStatus(r.student, s)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                r.status === s
                                  ? statusStyle[s]
                                  : 'border border-slate-300 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              {t(`attendance.${s}`)}
                            </button>
                          ))}
                        </div>
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
