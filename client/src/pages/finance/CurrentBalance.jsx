import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import CurrentBalanceCard from './CurrentBalanceCard.jsx';

const panel = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
export default function CurrentBalance() {
  const { i18n } = useTranslation();
  const bn = i18n.language?.startsWith('bn');
  const tr = (en, bangla) => bn ? bangla : en;
  const money = (n) => `৳ ${Number(n || 0).toLocaleString(bn ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const kind = (value) => ({ correction: tr('Approved corrections', 'অনুমোদিত সংশোধন'), opening: tr('Opening balance', 'প্রারম্ভিক ব্যালেন্স'), fees: tr('Fee receipts', 'ফি আদায়'), income: tr('Other income', 'অন্যান্য আয়'), capital: tr('Partner deposits', 'অংশীদারের জমা'), expense: tr('Expenses paid', 'পরিশোধিত ব্যয়'), salary: tr('Salaries paid', 'পরিশোধিত বেতন'), refund: tr('Fee refunds', 'ফি ফেরত'), 'profit-payment': tr('Partner profit paid', 'অংশীদারকে লাভ পরিশোধ') })[value] || value;
  const message = (err) => err.response?.data?.error?.message || err.message;
  async function load(e) {
    e?.preventDefault(); setLoading(true); setError('');
    try { setData((await api.get('/finance/balance', { params: { limit: 1 } })).data); }
    catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  if (!data && loading) return <p role="status">{tr('Loading…', 'লোড হচ্ছে…')}</p>;
  if (!data) return <div role="alert" className={panel}><p>{error}</p><button className={button} onClick={load}>{tr('Retry', 'আবার চেষ্টা করুন')}</button></div>;
  return <div className="space-y-5">
    <CurrentBalanceCard data={data} onRefresh={load} refreshing={loading} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{[[tr('Unpaid allocated profit', 'বরাদ্দকৃত অপরিশোধিত লাভ'), data.unpaidProfit], [tr('Balance after unpaid profit', 'অপরিশোধিত লাভ বাদে ব্যালেন্স'), data.balanceAfterUnpaidProfit]].map(([label, amount]) => <div key={label} className={panel}><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold ${amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>{money(amount)}</p></div>)}</div>
    <p className="text-sm text-slate-500">{tr('Unpaid profit is an obligation, not money already paid. The balance after unpaid profit does not account for other unrecorded bills or reserves.', 'অপরিশোধিত লাভ একটি দায়; এটি এখনো পরিশোধিত অর্থ নয়। এই হিসাব অন্যান্য অনথিভুক্ত বিল বা সংরক্ষিত অর্থ অন্তর্ভুক্ত করে না।')}</p>
    <details className={panel}><summary className="cursor-pointer font-semibold">{tr('All-time balance breakdown', 'সর্বমোট ব্যালেন্সের বিবরণ')}</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{['fees', 'income', 'capital', 'expense', 'salary', 'refund', 'profit-payment', 'correction'].map((key) => <div className="flex justify-between gap-3 border-b py-2 text-sm" key={key}><span>{kind(key)}</span><strong>{money(data.totals[key])}</strong></div>)}</div></details>
  </div>;
}
