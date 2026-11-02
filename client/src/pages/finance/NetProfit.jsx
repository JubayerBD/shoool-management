import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { getAll } from '../../api/getAll.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { schoolDate } from '../../utils/schoolDate.js';

const panel = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
export default function NetProfit() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const bn = i18n.language?.startsWith('bn');
  const tr = (en, bangla) => bn ? bangla : en;
  const name = (value) => bn ? value?.bn || value?.en : value?.en;
  const money = (value) => `৳ ${Number(value || 0).toLocaleString(bn ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = schoolDate();
  const [options, setOptions] = useState(null);
  const [config, setConfig] = useState({ from: today.slice(0, 7) + '-01', to: today, incomeCategories: [], expenseCategories: [] });
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const message = (err) => err.response?.data?.error?.message || err.message;
  const loadHistory = async () => {
    const r = await getAll('/finance/profit/distributions');
    setHistory(r.data.items);
  };
  async function load() {
    setLoading(true); setError('');
    try {
      const [r] = await Promise.all([api.get('/finance/profit/options'), loadHistory()]);
      setOptions(r.data);
      setConfig((c) => ({ ...c, incomeCategories: r.data.income.map((x) => x.id), expenseCategories: r.data.expense.map((x) => x.id) }));
    } catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  function change(next) { setConfig(next); setPreview(null); setError(''); }
  function toggle(key, id) {
    change({ ...config, [key]: config[key].includes(id) ? config[key].filter((x) => x !== id) : [...config[key], id] });
  }
  async function calculate(e) {
    e.preventDefault(); setBusy(true); setError(''); setPreview(null);
    try {
      const r = await api.post('/finance/profit/preview', config);
      setPreview({ ...r.data, requestKey: crypto.randomUUID() });
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function distribute() {
    setBusy(true); setError('');
    try {
      await api.post('/finance/profit/distributions', { ...preview.report.config, previewHash: preview.report.previewHash, requestKey: preview.requestKey });
      setPreview((p) => ({ ...p, alreadyDistributed: true }));
      push(tr('Profit distributed to partner histories', 'অংশীদারদের ইতিহাসে লাভ বণ্টন সংরক্ষিত হয়েছে'));
      await loadHistory();
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  const totals = (report) => <div className="grid gap-3 sm:grid-cols-3">{[
    [tr('Included income', 'অন্তর্ভুক্ত আয়'), report.income],
    [tr('Included expenses', 'অন্তর্ভুক্ত ব্যয়'), report.expense],
    [tr('Net profit', 'নিট লাভ'), report.netProfit],
  ].map(([label, amount]) => <div key={label} className="rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold ${amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>{money(amount)}</p></div>)}</div>;
  const allocations = (report) => <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[tr('Partner', 'অংশীদার'), tr('Capital', 'মূলধন'), tr('Share', 'অংশ'), tr('Profit allocated', 'বরাদ্দকৃত লাভ')].map((label) => <th key={label} className="border-b p-3">{label}</th>)}</tr></thead><tbody>{report.allocations.map((p) => <tr key={p.id}><td className="border-b p-3">{user.role === 'admin' ? <Link className="text-brand-600 hover:underline" to={`/partners/${p.id}`}>{p.name}</Link> : p.name}</td><td className="border-b p-3">{money(p.capital)}</td><td className="border-b p-3">{p.percentage.toFixed(2)}%</td><td className="border-b p-3 font-semibold">{money(p.profit)}</td></tr>)}</tbody></table></div>;
  const breakdown = (report) => <div className="grid gap-4 sm:grid-cols-2">{[['incomeBreakdown', tr('Income categories', 'আয়ের খাত')], ['expenseBreakdown', tr('Expense categories', 'ব্যয়ের খাত')]].map(([key, title]) => <div key={key}><h3 className="mb-2 font-semibold">{title}</h3>{report[key].map((row) => <div key={row.id} className={`flex justify-between gap-3 py-1 text-sm ${row.included ? '' : 'text-slate-400'}`}><span>{name(row.name)} {!row.included && `(${tr('excluded', 'বাদ')})`}</span><span>{money(row.amount)}</span></div>)}</div>)}</div>;
  if (loading) return <p role="status">{tr('Loading…', 'লোড হচ্ছে…')}</p>;
  if (!options) return <div role="alert" className={panel}><p>{error}</p><button className={button} onClick={load}>{tr('Retry', 'আবার চেষ্টা করুন')}</button></div>;
  return <div className="space-y-5">
    <div><h2 className="text-xl font-bold">{tr('Net profit & distribution', 'নিট লাভ ও বণ্টন')}</h2><p className="mt-2 text-sm text-slate-500">{tr('Selected income − selected expenses = net profit. Partner investments are always excluded.', 'নির্বাচিত আয় − নির্বাচিত ব্যয় = নিট লাভ। অংশীদারদের বিনিয়োগ সর্বদা বাদ থাকবে।')}</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {user.role === 'admin' && <form onSubmit={calculate} className={`${panel} space-y-5`}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={tr('From', 'শুরু')} required><TextInput type="date" required max={today} disabled={busy} value={config.from} onChange={(e) => change({ ...config, from: e.target.value })} /></Field><Field label={tr('To', 'শেষ')} required><TextInput type="date" required max={today} min={config.from} disabled={busy} value={config.to} onChange={(e) => change({ ...config, to: e.target.value })} /></Field></div>
      <div className="grid gap-5 sm:grid-cols-2">{[['income', 'incomeCategories', tr('Income to include', 'অন্তর্ভুক্ত আয়')], ['expense', 'expenseCategories', tr('Expenses to include', 'অন্তর্ভুক্ত ব্যয়')]].map(([type, key, title]) => <fieldset key={key} disabled={busy} className="space-y-2"><legend className="mb-2 font-semibold">{title}</legend><div className="mb-2 flex gap-4 text-xs text-brand-600"><button type="button" onClick={() => change({ ...config, [key]: options[type].map((c) => c.id) })}>{tr('Select all', 'সব নির্বাচন')}</button><button type="button" onClick={() => change({ ...config, [key]: [] })}>{tr('Clear all', 'সব বাদ')}</button></div>{options[type].map((c) => <label className="flex items-center gap-2 text-sm" key={c.id}><input type="checkbox" checked={config[key].includes(c.id)} onChange={() => toggle(key, c.id)} />{name(c.name)}</label>)}</fieldset>)}</div>
      <button className={button} disabled={busy}>{busy ? tr('Working…', 'অপেক্ষা করুন…') : tr('Calculate net profit', 'নিট লাভ হিসাব করুন')}</button>
    </form>}
    {preview && <section className={`${panel} space-y-5`} aria-label={tr('Profit preview', 'লাভের হিসাব')}>
      <h3 className="text-lg font-semibold">{preview.report.config.from} — {preview.report.config.to}</h3>
      {totals(preview.report)}{breakdown(preview.report)}
      <p className="text-sm text-slate-500">{tr('Profit is divided using each partner’s share of deposits dated on or before the selected period end. Amounts are rounded so the allocation total exactly matches net profit. Distribution credits partner profit histories; it does not transfer money or add an operating expense.', 'নির্বাচিত সময়ের শেষ তারিখ পর্যন্ত জমায় অংশীদারের অনুপাত অনুযায়ী লাভ বণ্টিত হবে। মোট বণ্টন নিট লাভের সমান থাকবে। বণ্টন অংশীদারের লাভের ইতিহাসে সংরক্ষিত হবে; অর্থ স্থানান্তর বা পরিচালন ব্যয় যোগ হবে না।')}</p>
      {allocations(preview.report)}
      {preview.alreadyDistributed && <p className="text-sm text-amber-700">{tr('This period overlaps a recorded distribution and cannot be distributed again.', 'এই সময়ের লাভ ইতোমধ্যে বণ্টনের মধ্যে রয়েছে, পুনরায় বণ্টন করা যাবে না।')}</p>}
      {preview.report.netProfit <= 0 && <p className="text-sm text-amber-700">{tr('There is no positive net profit to distribute.', 'বণ্টন করার মতো ধনাত্মক নিট লাভ নেই।')}</p>}
      {!preview.report.totalCapital && <p className="text-sm text-amber-700">{tr('Add partner capital deposits before distributing.', 'বণ্টনের আগে অংশীদারদের মূলধন জমা দিন।')}</p>}
      <button type="button" className={button} onClick={distribute} disabled={busy || preview.alreadyDistributed || preview.report.netProfit <= 0 || !preview.report.totalCapital}>{busy ? tr('Working…', 'অপেক্ষা করুন…') : tr('Distribute profit to all partners', 'সকল অংশীদারকে লাভ বণ্টন করুন')}</button>
    </section>}
    <section className={`${panel} space-y-4`}><h3 className="text-lg font-semibold">{tr('Distribution history', 'লাভ বণ্টনের ইতিহাস')}</h3>{!history.length && <p className="text-sm text-slate-500">{tr('No profit distributed yet.', 'এখনো লাভ বণ্টন করা হয়নি।')}</p>}{history.map((d) => <details key={d.id} className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">{d.from} — {d.to} · {money(d.report.netProfit)} · {tr('Recorded', 'সংরক্ষিত')} {schoolDate(d.createdAt)}</summary><div className="mt-4 space-y-4">{totals(d.report)}{breakdown(d.report)}{allocations(d.report)}</div></details>)}</section>
  </div>;
}
