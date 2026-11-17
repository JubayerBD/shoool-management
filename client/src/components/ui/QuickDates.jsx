import { useTranslation } from 'react-i18next';
import { schoolDate } from '../../utils/schoolDate.js';

/** Date ranges for the quick buttons, in Bangladesh time. */
export function quickRange(key) {
  const today = schoolDate();
  if (key === 'today') return { from: today, to: today };
  if (key === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (key === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: '', to: '' };
}

const LABELS = { today: 'finance.today', month: 'finance.thisMonth', year: 'finance.thisYear', all: 'finance.allTime' };

/**
 * Quick date buttons ("Today", "This month", …) for screens with From / To filters.
 * The button matching the current range is highlighted.
 */
export default function QuickDates({ from, to, onChange, options = ['today', 'month', 'all'], disabled = false }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('finance.quickDates')}>
      {options.map((key) => {
        const range = quickRange(key);
        const active = range.from === (from || '') && range.to === (to || '');
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(range)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
          >
            {t(LABELS[key])}
          </button>
        );
      })}
    </div>
  );
}
