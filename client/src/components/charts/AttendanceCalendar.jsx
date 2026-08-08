import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const statusBg = {
  present: 'bg-emerald-500 text-white',
  absent: 'bg-red-500 text-white',
  late: 'bg-amber-400 text-white',
  leave: 'bg-slate-400 text-white',
};

const toKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Month calendar heatmap.
 * @param {{date:string,status:string}[]} records
 */
export default function AttendanceCalendar({ records }) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() }; // month 0-11
  });

  const byDay = useMemo(() => {
    const map = {};
    for (const r of records) map[toKey(r.date)] = r.status;
    return map;
  }, [records]);

  const { year, month } = cursor;
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const shift = (delta) =>
    setCursor(({ year: y, month: m }) => {
      const nm = m + delta;
      return { year: y + Math.floor(nm / 12), month: ((nm % 12) + 12) % 12 };
    });

  const dayHeaders = [0, 1, 2, 3, 4, 5, 6].map((d) => t(`timetable.days.${d}`).slice(0, 3));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          ‹
        </button>
        <div className="text-sm font-semibold text-slate-700">{monthLabel}</div>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {dayHeaders.map((h, i) => (
          <div key={i} className="pb-1 text-xs font-medium text-slate-400">
            {h}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const status = byDay[key];
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-md text-xs ${
                status ? statusBg[status] : 'bg-slate-100 text-slate-500'
              }`}
              title={status ? t(`attendance.${status}`) : ''}
            >
              {d}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        {['present', 'absent', 'late', 'leave'].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${statusBg[s]}`} />
            {t(`attendance.${s}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
