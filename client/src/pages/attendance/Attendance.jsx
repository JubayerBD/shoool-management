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

  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [date, setDate] = useState(today());

  const [roster, setRoster] = useState([]); // [{ student, roll, name, status }]
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAll('/academics/sections').then((r) => setSections(r.data.items)).catch(() => push('Error loading sections', 'error'));
  }, []);

  const loadRoster = async () => {
    if (!section) return;
    setLoading(true);
    setLoaded(false);
    try {
      const [studentsRes, attendanceRes] = await Promise.all([
        getAll('/people/students', { params: { section, status: 'active' } }),
        getAll('/attendance', { params: { section, from: date, to: date } }),
      ]);
      // Map existing attendance by student id.
      const existing = {};
      for (const a of attendanceRes.data.items) {
        existing[a.student?.id || a.student?._id || a.student] = a.status;
      }
      const rows = studentsRes.data.items.map((s) => ({
        student: s.id || s._id,
        roll: s.roll,
        name: s.name,
        status: existing[s.id || s._id] || 'present',
      }));
      setRoster(rows);
      setLoaded(true);
    } catch {
      push('Error loading roster', 'error');
    } finally {
      setLoading(false);
    }
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
        section,
        date,
        records: roster.map((r) => ({ student: r.student, status: r.status })),
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
        <div className="w-56">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('students.section')}
          </label>
          <Select value={section} onChange={(e) => { setSection(e.target.value); setLoaded(false); setRoster([]); }}>
            <option value="">{t('attendance.selectSection')}</option>
            {sections.map((s) => (
              <option key={s.id || s._id} value={s.id || s._id}>
                {bt(s.class?.name, lang)} — {bt(s.name, lang)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('attendance.date')}
          </label>
          <input
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
          disabled={!section || loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('attendance.load')}
        </button>
      </div>

      {!loaded && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('attendance.chooseSectionDate')}
        </div>
      )}

      {loaded && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {t('attendance.summary', summary)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={markAllPresent}
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
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <table className="w-full text-left text-sm">
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
                      <td className="px-4 py-2.5 font-medium text-slate-800">{bt(r.name, lang)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {STATUSES.map((s) => (
                            <button
                              type="button"
                              key={s}
                              onClick={() => setStatus(r.student, s)}
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
