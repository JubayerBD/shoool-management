import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';

const STATUSES = ['present', 'absent', 'late', 'leave'];

const cellStyle = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-500 text-white',
  late: 'bg-amber-300 text-amber-900',
  leave: 'bg-slate-300 text-slate-700',
};
const countColor = {
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

/**
 * Saved attendance for one class and month: a day-by-day list (who was absent)
 * and the full register grid. Clicking a day opens it in the marking tab.
 */
export default function AttendanceSheet({ year, grade, section, month, lang, onOpenDay }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!year || !grade || !month) { setData(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    api.get('/attendance/report', { params: { class: grade, academicYear: year, month, ...(section ? { section } : {}) } })
      .then(response => { if (!cancelled) setData(response.data); })
      .catch(err => { if (!cancelled) { setData(null); push(err.response?.data?.error?.message || t('attendance.reportError'), 'error'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, grade, section, month]);

  const days = useMemo(() => {
    if (!data) return [];
    const [y, m] = data.month.split('-').map(Number);
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => {
      const date = `${data.month}-${String(index + 1).padStart(2, '0')}`;
      return { date, day: index + 1, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), future: date > data.today };
    });
  }, [data]);

  const takenDays = useMemo(() => new Set((data?.daily || []).map(row => row.date)), [data]);
  const letter = status => t(`attendance.short.${status}`);
  const weekdayName = weekday => t(`timetable.days.${weekday}`);
  const totals = useMemo(() => {
    const sum = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
    for (const row of data?.daily || []) { for (const key of STATUSES) sum[key] += row[key]; sum.total += row.total; }
    return { ...sum, percentage: sum.total ? Math.round(((sum.present + sum.late) / sum.total) * 100) : null };
  }, [data]);

  // Names behind each day's absent/late/leave counts, so nobody has to scan the grid.
  const namesFor = (date, status) => (data?.students || []).filter(row => row.days[date] === status).map(row => bt(row.name, lang));

  const exportCsv = () => {
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = [t('attendance.roll'), t('attendance.name'), t('students.admissionNo'), ...days.map(d => d.day), ...STATUSES.map(s => t(`attendance.${s}`)), '%'];
    const lines = data.students.map(row => [row.roll ?? '', bt(row.name, lang), row.admissionNo, ...days.map(d => (row.days[d.date] ? letter(row.days[d.date]) : '')), ...STATUSES.map(s => row.counts[s]), row.percentage ?? '']);
    const csv = [header, ...lines].map(line => line.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `attendance-${data.month}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  if (!grade || !year) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{t('attendance.chooseClassMonth')}</div>;
  if (loading && !data) return <div className="text-slate-500">{t('common.loading')}</div>;
  if (!data) return null;

  return (
    <div className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label={t('attendance.daysTaken')} value={data.daily.length} />
        <StatCard label={t('attendance.percentage')} value={totals.percentage === null ? '—' : `${totals.percentage}%`} accent="text-brand-600" />
        <StatCard label={t('attendance.absent')} value={totals.absent} accent="text-red-600" />
        <StatCard label={t('attendance.late')} value={totals.late} accent="text-amber-600" />
        <StatCard label={t('attendance.leave')} value={totals.leave} accent="text-slate-500" />
      </div>

      {data.daily.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">{t('attendance.noneThisMonth')}</div>
      ) : (
        <>
          {/* Day by day */}
          <div className="rounded-xl bg-white shadow-sm">
            <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">{t('attendance.dayByDay')}</h2>
            <p className="px-4 pb-3 text-sm text-slate-500">{t('attendance.dayByDayHint')}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('attendance.date')}</th>
                    {STATUSES.map(s => <th key={s} className="px-3 py-3 text-center">{t(`attendance.${s}`)}</th>)}
                    <th className="px-4 py-3">{t('attendance.whoMissed')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.daily].reverse().map(row => {
                    const groups = ['absent', 'late', 'leave'].map(s => [s, namesFor(row.date, s)]).filter(([, names]) => names.length);
                    return (
                      <tr key={row.date} className="align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">
                          {row.date}
                          <span className="block text-xs font-normal text-slate-500">{weekdayName(new Date(`${row.date}T00:00:00Z`).getUTCDay())}</span>
                        </td>
                        {STATUSES.map(s => <td key={s} className={`px-3 py-2.5 text-center font-semibold ${row[s] ? countColor[s] : 'text-slate-300'}`}>{row[s]}</td>)}
                        <td className="px-4 py-2.5 text-slate-600">
                          {groups.length === 0 ? <span className="text-emerald-600">{t('attendance.everyonePresent')}</span> : groups.map(([s, names]) => (
                            <div key={s}><span className={`font-medium ${countColor[s]}`}>{t(`attendance.${s}`)}:</span> {names.join(', ')}</div>
                          ))}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button type="button" onClick={() => onOpenDay(row.date)} className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">{t('attendance.openDay')}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly register */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{t('attendance.monthSheet')}</h2>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  {STATUSES.map(s => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${cellStyle[s]}`}>{letter(s)}</span>
                      {t(`attendance.${s}`)}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" onClick={exportCsv} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">{t('attendance.exportCsv')}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0 text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[11rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-left">{t('attendance.name')}</th>
                    {STATUSES.map(s => <th key={s} title={t(`attendance.${s}`)} className={`border-b border-slate-200 bg-slate-50 px-2 py-2 text-center ${countColor[s]}`}>{letter(s)}</th>)}
                    <th className="border-b border-slate-200 bg-slate-50 border-r px-3 py-2 text-center">%</th>
                    {days.map(d => (
                      <th key={d.date} className="border-b border-slate-200 bg-slate-50 px-0.5 py-1 text-center font-medium">
                        {takenDays.has(d.date) ? (
                          <button type="button" title={t('attendance.openDay')} onClick={() => onOpenDay(d.date)} className="w-7 rounded text-brand-700 hover:bg-brand-50">
                            <span className="block text-[10px] font-normal text-slate-400">{weekdayName(d.weekday).slice(0, 2)}</span>{d.day}
                          </button>
                        ) : (
                          <span className="block w-7 text-slate-300"><span className="block text-[10px] font-normal">{weekdayName(d.weekday).slice(0, 2)}</span>{d.day}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.students.map(row => (
                    <tr key={row.student} className="group">
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                        <span className="font-medium text-slate-800">{bt(row.name, lang)}</span>
                        <span className="block text-xs text-slate-500">{t('attendance.roll')} {row.roll ?? '—'} · {row.admissionNo}{row.former ? ` · ${t('attendance.former')}` : ''}</span>
                      </td>
                      {STATUSES.map(s => <td key={s} className={`border-b border-slate-100 px-2 py-1 text-center font-semibold group-hover:bg-slate-50 ${row.counts[s] ? countColor[s] : 'text-slate-300'}`}>{row.counts[s]}</td>)}
                      <td className="border-b border-r border-slate-100 px-3 py-1 text-center font-semibold text-slate-700 group-hover:bg-slate-50">{row.percentage === null ? '—' : `${row.percentage}%`}</td>
                      {days.map(d => {
                        const status = row.days[d.date];
                        return (
                          <td key={d.date} className="border-b border-slate-100 px-0.5 py-1 text-center group-hover:bg-slate-50">
                            {status
                              ? <span title={`${d.date} · ${t(`attendance.${status}`)}`} className={`inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${cellStyle[status]}`}>{letter(status)}</span>
                              : <span className="text-slate-200">·</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
