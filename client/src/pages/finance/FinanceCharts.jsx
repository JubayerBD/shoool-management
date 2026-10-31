import { useTranslation } from 'react-i18next';
import { t as bt } from '../../utils/bilingual.js';
import BarChart from '../../components/charts/BarChart.jsx';
import DonutChart from '../../components/charts/DonutChart.jsx';

const PALETTE = [
  '#2563eb', '#059669', '#f59e0b', '#dc2626', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569',
];

export function SummaryCards({ summary }) {
  const { t } = useTranslation();
  const taka = t('common.taka');
  if (!summary) return null;
  const money = (n) => `${taka}${Number(n || 0).toLocaleString()}`;
  const net = summary.net || 0;

  const Card = ({ label, value, sub, accent }) => (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card
        label={t('finance.totalIncome')}
        value={money(summary.income?.total)}
        accent="text-emerald-600"
        sub={`${t('finance.fees')}: ${money(summary.income?.fees)} · ${t('finance.other')}: ${money(summary.income?.other)}`}
      />
      <Card
        label={t('finance.totalExpense')}
        value={money(summary.expense?.total)}
        accent="text-red-600"
        sub={`${t('finance.salary')}: ${money(summary.expense?.salary)} · ${t('finance.general')}: ${money(summary.expense?.general)}`}
      />
      <Card
        label={t('finance.net')}
        value={money(net)}
        accent={net >= 0 ? 'text-brand-600' : 'text-red-600'}
      />
    </div>
  );
}

export function HeadCharts({ incomeByHead = [], expenseByHead = [] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const toSegments = (arr) =>
    arr
      .filter((x) => x.total > 0)
      .map((x, i) => ({ label: bt(x.label, lang) || '—', value: Math.round(x.total), color: PALETTE[i % PALETTE.length] }));

  const inc = toSegments(incomeByHead);
  const exp = toSegments(expenseByHead);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('finance.reports.incomeByHead')}</h3>
        {inc.length ? <DonutChart segments={inc} /> : <p className="text-sm text-slate-400">{t('finance.reports.noData')}</p>}
      </div>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('finance.reports.expenseByHead')}</h3>
        {exp.length ? <DonutChart segments={exp} /> : <p className="text-sm text-slate-400">{t('finance.reports.noData')}</p>}
      </div>
    </div>
  );
}

export function MonthlyCharts({ monthly = [] }) {
  const { t } = useTranslation();
  const hasData = monthly.some((m) => m.income > 0 || m.expense > 0);
  if (!hasData) return null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('finance.reports.monthlyIncome')}</h3>
        <BarChart data={monthly.map((m) => ({ label: m.label.slice(5), value: Math.round(m.income) }))} unit={t('common.taka')} />
      </div>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('finance.reports.monthlyExpense')}</h3>
        <BarChart data={monthly.map((m) => ({ label: m.label.slice(5), value: Math.round(m.expense) }))} unit={t('common.taka')} />
      </div>
    </div>
  );
}
