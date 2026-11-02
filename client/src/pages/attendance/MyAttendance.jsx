import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { getAll } from '../../api/getAll.js';
import { useOwnStudent } from '../../hooks/useOwnStudent.js';
import { t as bt } from '../../utils/bilingual.js';
import AttendanceCalendar from '../../components/charts/AttendanceCalendar.jsx';

const statusColor = {
  present: 'text-emerald-600',
  absent: 'text-red-600',
  late: 'text-amber-600',
  leave: 'text-slate-500',
};

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

export default function MyAttendance() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const { studentId, student } = useOwnStudent();

  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get(`/attendance/summary/${studentId}`),
      getAll('/attendance', { params: { student: studentId } }),
    ])
      .then(([s, r]) => {
        setSummary(s.data.summary);
        setRecords(r.data.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('attendance.myTitle')}</h1>
        {student && <p className="text-sm text-slate-500">{bt(student.name, lang)}</p>}
      </div>

      {loading ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatCard
                label={t('attendance.percentage')}
                value={`${summary.percentage}%`}
                accent="text-brand-600"
              />
              <StatCard label={t('attendance.present')} value={summary.present} accent="text-emerald-600" />
              <StatCard label={t('attendance.absent')} value={summary.absent} accent="text-red-600" />
              <StatCard label={t('attendance.late')} value={summary.late} accent="text-amber-600" />
              <StatCard label={t('attendance.total')} value={summary.total} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <AttendanceCalendar records={records} />
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-800">{t('attendance.recent')}</h2>
            {records.length === 0 ? (
              <p className="text-sm text-slate-400">{t('attendance.noRecords')}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">{t('attendance.date')}</th>
                    <th className="py-2 text-right">{t('students.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id || r._id}>
                      <td className="py-2 text-slate-600">{new Date(r.date).toLocaleDateString()}</td>
                      <td className={`py-2 text-right font-medium ${statusColor[r.status] || ''}`}>
                        {t(`attendance.${r.status}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
