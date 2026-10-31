import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { t as bt } from '../../utils/bilingual.js';
import { SummaryCards, HeadCharts, MonthlyCharts } from './FinanceCharts.jsx';

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default function FinanceOverview() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');

  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = monthRange();
    Promise.all([
      api.get('/finance/summary', { params: { from, to } }),
      api.get('/finance/analytics', { params: { from, to } }),
      api.get('/finance/transactions', { params: { from, to } }),
    ])
      .then(([s, a, tx]) => {
        setSummary(s.data.summary);
        setAnalytics(a.data);
        setRecent(tx.data.transactions.slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-5">
      <div className="text-sm font-medium text-slate-500">{t('finance.thisMonth')}</div>
      <SummaryCards summary={summary} />
      {analytics && <MonthlyCharts monthly={analytics.monthly} />}
      {analytics && <HeadCharts incomeByHead={analytics.incomeByHead} expenseByHead={analytics.expenseByHead} />}

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('finance.reports.ledger')}</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">{t('finance.reports.noData')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-slate-100">
              {recent.map((r) => (
                <tr key={`${r.source}-${r.id}`}>
                  <td className="py-2 text-slate-500">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="py-2 text-slate-700">{bt(r.category, lang) || '—'}</td>
                  <td className="py-2 text-slate-500">{bt(r.party, lang) || '—'}</td>
                  <td
                    className={`py-2 text-right font-semibold ${
                      r.direction === 'income' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {r.direction === 'income' ? '+' : '−'}
                    {taka}
                    {Number(r.amount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
