import { schoolDate } from '../../utils/schoolDate.js';
import { getAll } from '../../api/getAll.js';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { t as bt } from '../../utils/bilingual.js';
import { Select } from '../../components/ui/Field.jsx';
import { SummaryCards, HeadCharts } from './FinanceCharts.jsx';

function presets() {
  const today = schoolDate();
  return {
    month: { from: today.slice(0, 7) + '-01', to: today },
    year: { from: today.slice(0, 4) + '-01-01', to: today },
    all: { from: '', to: '' },
  };
}

export default function FinanceReports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');

  const P = presets();
  const [range, setRange] = useState(P.month);
  const [typeFilter, setTypeFilter] = useState('');
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const txParams = { ...params };
      if (typeFilter) txParams.type = typeFilter;
      const [s, a, tx] = await Promise.all([
        api.get('/finance/summary', { params }),
        api.get('/finance/analytics', { params }),
        getAll('/finance/transactions', { params: txParams }, 'transactions'),
      ]);
      setSummary(s.data.summary);
      setAnalytics(a.data);
      setTxns(tx.data.transactions);
    } finally {
      setLoading(false);
    }
  }, [range, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (key) => setRange(P[key]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            <button type="button" onClick={() => applyPreset('month')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('finance.thisMonth')}
            </button>
            <button type="button" onClick={() => applyPreset('year')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('finance.thisYear')}
            </button>
            <button type="button" onClick={() => applyPreset('all')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('finance.allTime')}
            </button>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.from')}</span>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.to')}</span>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          🖨 {t('common.print')}
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : (
        <div className="print-area space-y-5">
          <div className="print-only text-center">
            <div className="text-xl font-bold">{t('app.name')}</div>
            <div className="text-sm">
              {t('finance.reports.summary')}
              {range.from || range.to ? ` · ${range.from || '…'} → ${range.to || '…'}` : ` · ${t('finance.allTime')}`}
            </div>
          </div>

          <SummaryCards summary={summary} />
          {analytics && <HeadCharts incomeByHead={analytics.incomeByHead} expenseByHead={analytics.expenseByHead} />}

          {/* Ledger */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-700">{t('finance.reports.ledger')}</h3>
              <div className="w-36 no-print">
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="!py-1.5 text-sm">
                  <option value="">{t('finance.reports.all')}</option>
                  <option value="income">{t('finance.income')}</option>
                  <option value="expense">{t('finance.expense')}</option>
                </Select>
              </div>
            </div>
            {txns.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-400">{t('finance.reports.noData')}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">{t('finance.date')}</th>
                    <th className="px-4 py-2">{t('finance.reports.type')}</th>
                    <th className="px-4 py-2">{t('finance.category')}</th>
                    <th className="px-4 py-2">{t('finance.reports.party')}</th>
                    <th className="px-4 py-2 text-right">{t('finance.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.map((r) => (
                    <tr key={`${r.source}-${r.id}`}>
                      <td className="px-4 py-2 text-slate-500">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.direction === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {r.direction === 'income' ? t('finance.income') : t('finance.expense')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-700">{bt(r.category, lang) || '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{bt(r.party, lang) || '—'}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${r.direction === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
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
      )}
    </div>
  );
}
