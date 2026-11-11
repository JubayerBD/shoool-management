import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';

export default function CurrentBalanceCard({ data: supplied, onRefresh, refreshing = false }) {
  const { i18n } = useTranslation();
  const bn = i18n.language?.startsWith('bn');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true); setError('');
    try { setData((await api.get('/finance/balance', { params: { limit: 1 } })).data); }
    catch (err) { setError(err.response?.data?.error?.message || err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!supplied) refresh(); }, [Boolean(supplied)]);
  const value = supplied || data;
  return <section className="rounded-xl border border-brand-200 bg-white p-5 shadow-sm" aria-label={bn ? 'বর্তমান ব্যালেন্স' : 'Current balance'}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-medium text-slate-600">{bn ? 'বর্তমান ব্যালেন্স' : 'Current balance'}</h2>
      <p className={`mt-1 text-3xl font-bold ${value?.currentBalance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
        {value ? `৳ ${Number(value.currentBalance).toLocaleString(bn ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : loading ? (bn ? 'লোড হচ্ছে…' : 'Loading…') : '—'}
      </p></div><div className="flex gap-4 text-sm text-brand-600">{!supplied && <Link to="/finance?tab=overview">{bn ? 'অর্থ ব্যবস্থাপনা দেখুন' : 'View finance'}</Link>}{(!supplied || onRefresh) && <button type="button" disabled={loading || refreshing} onClick={onRefresh || refresh}>{bn ? 'হালনাগাদ' : 'Refresh'}</button>}</div></div>
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    {value?.undatedFeeCollections > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      {bn ? 'প্রকৃত আদায়ের তারিখ ছাড়া পূর্বের ফি আদায়' : 'Historical fee collections without actual collection dates'}: ৳ {Number(value.undatedFeeCollections).toLocaleString(bn ? 'bn-BD' : 'en-BD')}.
      {' '}{bn ? 'এই অর্থ শিক্ষার্থীর হিসাবে আছে; তারিখভিত্তিক ব্যালেন্স ও প্রতিবেদনে অন্তর্ভুক্ত নয়।' : 'These amounts are in student accounts but excluded from the dated balance and date-filtered reports.'}
    </p>}
    {value?.undatedExpensePayments > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      {bn ? 'প্রকৃত পরিশোধের তারিখ ছাড়া পূর্বের খরচ' : 'Historical expenses without actual payment dates'}: ৳ {Number(value.undatedExpensePayments).toLocaleString(bn ? 'bn-BD' : 'en-BD')}.
      {' '}{bn ? 'সর্বমোট খরচে অন্তর্ভুক্ত; তারিখভিত্তিক ব্যালেন্স ও প্রতিবেদনে অন্তর্ভুক্ত নয়।' : 'Included in all-time expenses; excluded from the dated balance and date-filtered reports.'}
    </p>}
    {value?.undatedCapitalReturns > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      {bn ? 'প্রকৃত তারিখ ছাড়া মূলধন ফেরত' : 'Capital returns without actual payment dates'}: ৳ {Number(value.undatedCapitalReturns).toLocaleString(bn ? 'bn-BD' : 'en-BD')}.
      {' '}{bn ? 'আলাদা ইতিহাসে সংরক্ষিত; তারিখভিত্তিক ব্যালেন্স ও পরিচালন খরচে অন্তর্ভুক্ত নয়।' : 'Recorded in separate history; excluded from the dated balance and operating expenses.'}
    </p>}
    <p className="mt-2 text-xs text-slate-500">{bn ? 'সকল নথিভুক্ত প্রাপ্তি ও পরিশোধের ভিত্তিতে মোট ব্যালেন্স; মূলধনসহ। ব্যাংকের সাথে মিলানো ব্যালেন্স নয়।' : 'Combined balance from all recorded receipts and payments, including capital. Not a bank-reconciled balance.'} {value && `${bn ? 'তারিখ' : 'As of'} ${value.asOf}`}</p>
  </section>;
}
