import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import PartnerProfitHistory from './PartnerProfitHistory.jsx';
import RequestReversal from '../finance/FinancialControls.jsx';

const labels = {
  en: { title: 'Partners', add: 'Add partner', name: 'Name', phone: 'Phone', address: 'Address', email: 'Email (optional)', save: 'Save partner', edit: 'Edit profile', cancel: 'Cancel', capital: 'Capital deposited', total: 'Total partner capital', share: 'Capital share', profit: 'Profit calculator', profitAmount: 'Profit to divide (৳)', preview: 'Calculate shares', allocation: 'Profit share', explain: 'Shares use all recorded deposits. New deposits update everyone’s percentage. This calculator previews a division of profit; it does not record payouts.', noCapital: 'Add capital deposits to calculate profit shares.', empty: 'No partners yet. Add your first partner below.', back: 'Back to partners', deposit: 'Add deposit', amount: 'Amount (৳)', date: 'Deposit date', note: 'Note (optional)', record: 'Record deposit', history: 'Deposit history', noDeposits: 'No deposits recorded yet.', loading: 'Loading…', retry: 'Retry', saved: 'Saved successfully', count: 'Partners', saving: 'Saving…', optional: 'Optional', contact: 'Contact details' },
  bn: { title: 'অংশীদার', add: 'অংশীদার যোগ করুন', name: 'নাম', phone: 'ফোন', address: 'ঠিকানা', email: 'ইমেইল (ঐচ্ছিক)', save: 'সংরক্ষণ করুন', edit: 'তথ্য সম্পাদনা', cancel: 'বাতিল', capital: 'জমাকৃত মূলধন', total: 'মোট মূলধন', share: 'মূলধনের অংশ', profit: 'লাভের হিসাব', profitAmount: 'বণ্টনযোগ্য লাভ (৳)', preview: 'অংশ হিসাব করুন', allocation: 'লাভের অংশ', explain: 'সকল জমার ভিত্তিতে অংশ হিসাব করা হয়। নতুন জমায় সবার শতাংশ বদলাবে। এটি শুধু লাভের হিসাব দেখায়, অর্থ প্রদান রেকর্ড করে না।', noCapital: 'লাভের অংশ হিসাব করতে মূলধন জমা দিন।', empty: 'এখনো কোনো অংশীদার নেই। নিচে যোগ করুন।', back: 'অংশীদার তালিকায় ফিরুন', deposit: 'জমা যোগ করুন', amount: 'পরিমাণ (৳)', date: 'জমার তারিখ', note: 'মন্তব্য (ঐচ্ছিক)', record: 'জমা সংরক্ষণ করুন', history: 'জমার ইতিহাস', noDeposits: 'এখনো কোনো জমা নেই।', loading: 'লোড হচ্ছে…', retry: 'আবার চেষ্টা করুন', saved: 'সংরক্ষণ হয়েছে', count: 'অংশীদার', saving: 'সংরক্ষণ হচ্ছে…', contact: 'যোগাযোগের তথ্য' },
};
const blank = { name: '', phone: '', address: '', email: '' };
const panel = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';

export default function Partners() {
  const { id } = useParams();
  const { i18n } = useTranslation();
  const l = labels[i18n.language?.startsWith('bn') ? 'bn' : 'en'];
  const { push } = useToast();
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(blank);
  const [deposit, setDeposit] = useState({ amount: '', date: schoolDate(), note: '', requestKey: crypto.randomUUID() });
  const [profit, setProfit] = useState('');
  const [calculated, setCalculated] = useState('');
  const money = (n) => `৳ ${Number(n).toLocaleString(i18n.language?.startsWith('bn') ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const message = (err) => err.response?.data?.error?.message || err.message;
  async function load() {
    setLoading(true); setError('');
    try {
      const [list, selected] = await Promise.all([api.get('/partners', { params: calculated ? { profit: calculated } : {} }), id ? api.get(`/partners/${id}`) : Promise.resolve(null)]);
      setSummary(list.data); setDetail(selected?.data || null);
    } catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { setEditing(false); setProfile(blank); load(); }, [id, calculated]);
  async function saveProfile(e) {
    e.preventDefault(); setBusy(true);
    try {
      if (id) await api.put(`/partners/${id}`, profile);
      else await api.post('/partners', profile);
      setProfile(blank); setEditing(false); push(l.saved); await load();
    } catch (err) { push(message(err), 'error'); }
    finally { setBusy(false); }
  }
  async function saveDeposit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api.post(`/partners/${id}/deposits`, deposit);
      setDeposit({ amount: '', date: schoolDate(), note: '', requestKey: crypto.randomUUID() });
      push(l.saved); await load();
    } catch (err) { push(message(err), 'error'); }
    finally { setBusy(false); }
  }
  const profileForm = <form onSubmit={saveProfile} className={`${panel} space-y-4`}>
    <h2 className="text-lg font-semibold">{id ? l.edit : l.add}</h2>
    <div className="grid gap-4 sm:grid-cols-2">{['name', 'phone', 'address', 'email'].map((key) => <Field key={key} label={l[key]} required={key !== 'email'}><TextInput type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} maxLength={key === 'address' ? 1000 : key === 'name' ? 200 : key === 'phone' ? 50 : 254} required={key !== 'email'} value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} /></Field>)}</div>
    <button disabled={busy} className={button}>{busy ? l.saving : l.save}</button>
    {id && <button type="button" className="ml-4 text-sm" onClick={() => setEditing(false)}>{l.cancel}</button>}
  </form>;
  if (error) return <div role="alert" className={panel}><p className="text-red-600">{error}</p><button className={button} onClick={load}>{l.retry}</button></div>;
  // React reuses this component when navigating from the list to a profile.
  // The URL changes before the effect fetches that partner's detail data.
  if (loading || !summary || (id && detail?.item?.id !== id)) return <p role="status">{l.loading}</p>;
  const current = summary.items.find((p) => p.id === id);
  return <div className="space-y-5">
    {id && <Link to="/partners" className="text-sm text-brand-600">← {l.back}</Link>}
    <h1 className="text-2xl font-bold text-slate-800">{id ? detail.item.name : l.title}</h1>
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label={id ? l.capital : l.total} value={money(id ? current?.capital || 0 : summary.totalCapital)} />
      <Stat label={id ? l.share : l.count} value={id ? `${(current?.percentage || 0).toFixed(2)}%` : summary.items.length} />
      {id && <Stat label={l.total} value={money(summary.totalCapital)} />}
    </div>
    {!id ? <>
      <form className={`${panel} space-y-3`} onSubmit={(e) => { e.preventDefault(); setCalculated(profit); }}>
        <h2 className="text-lg font-semibold">{l.profit}</h2><p className="text-sm text-slate-500">{l.explain}</p>
        {!summary.totalCapital && <p className="text-sm text-amber-700">{l.noCapital}</p>}
        <div className="flex flex-wrap items-end gap-3"><Field label={l.profitAmount}><TextInput type="number" min="0.01" max="10000000000" step="0.01" required value={profit} onChange={(e) => setProfit(e.target.value)} /></Field><button className={button} disabled={!summary.totalCapital}>{l.preview}</button></div>
        {calculated && <p className="font-medium">{l.profitAmount}: {money(calculated)}</p>}
      </form>
      <div className={`${panel} overflow-x-auto`}><table className="w-full text-left text-sm"><thead><tr>{[l.name, l.phone, l.capital, l.share, ...(calculated ? [l.allocation] : [])].map((text) => <th className="border-b p-3" key={text}>{text}</th>)}</tr></thead><tbody>{summary.items.map((p) => <tr key={p.id}><td className="border-b p-3"><Link className="font-medium text-brand-600 hover:underline" to={`/partners/${p.id}`}>{p.name}</Link></td><td className="border-b p-3">{p.phone}</td><td className="border-b p-3">{money(p.capital)}</td><td className="border-b p-3">{p.percentage.toFixed(2)}%</td>{calculated && <td className="border-b p-3">{money(p.profit)}</td>}</tr>)}</tbody></table>{!summary.items.length && <p className="py-5 text-slate-500">{l.empty}</p>}</div>
      {profileForm}
    </> : <>
      <div className={`${panel} space-y-2`}><h2 className="font-semibold">{l.contact}</h2><p>{l.phone}: {detail.item.phone}</p><p className="whitespace-pre-wrap">{l.address}: {detail.item.address}</p>{detail.item.email && <p>{detail.item.email}</p>}<button className="text-sm text-brand-600" onClick={() => { setProfile({ name: detail.item.name, phone: detail.item.phone, address: detail.item.address, email: detail.item.email }); setEditing(true); }}>{l.edit}</button></div>
      {editing && profileForm}
      <PartnerProfitHistory profits={detail.profits} payments={detail.profitPayments} onRequested={load} />
      <form className={`${panel} space-y-4`} onSubmit={saveDeposit}><h2 className="text-lg font-semibold">{l.deposit}</h2><div className="grid gap-4 sm:grid-cols-3"><Field label={l.amount} required><TextInput type="number" min="0.01" max="10000000000" step="0.01" required value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value, requestKey: crypto.randomUUID() })} /></Field><Field label={l.date} required><TextInput type="date" required max={schoolDate()} value={deposit.date} onChange={(e) => setDeposit({ ...deposit, date: e.target.value, requestKey: crypto.randomUUID() })} /></Field><Field label={l.note}><TextInput maxLength={1000} value={deposit.note} onChange={(e) => setDeposit({ ...deposit, note: e.target.value, requestKey: crypto.randomUUID() })} /></Field></div><button disabled={busy} className={button}>{busy ? l.saving : l.record}</button></form>
      <div className={`${panel} overflow-x-auto`}><h2 className="mb-3 text-lg font-semibold">{l.history}</h2><table className="w-full text-left text-sm"><thead><tr>{[l.date, l.amount, l.note, i18n.language?.startsWith('bn') ? '\u09b8\u0982\u09b6\u09cb\u09a7\u09a8' : 'Correction'].map((text) => <th key={text} className="border-b p-3">{text}</th>)}</tr></thead><tbody>{detail.deposits.map((d) => <tr key={d.id}><td className="border-b p-3">{schoolDate(d.date)}</td><td className="border-b p-3">{money(d.amount)}</td><td className="border-b p-3 whitespace-pre-wrap">{d.note || '—'}</td><td className="border-b p-3">{d.isReversed ? 'Reversed' : <RequestReversal type="partnerDeposit" id={d.id} summary={`${d.amount}`} onRequested={load} />}</td></tr>)}</tbody></table>{!detail.deposits.length && <p className="py-5 text-slate-500">{l.noDeposits}</p>}</div>
    </>}
  </div>;
}
function Stat({ label, value }) { return <div className={panel}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-800">{value}</p></div>; }
