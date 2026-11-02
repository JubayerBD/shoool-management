import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { t as bilingual } from '../../utils/bilingual.js';

export default function ActivityLogs() {
  const { i18n, t } = useTranslation();
  const bn = i18n.language?.startsWith('bn'), lang = bn ? 'bn' : 'en';
  const tr = (en, bangla) => bn ? bangla : en;
  const empty = { from: '', to: '', search: '', module: '', action: '', outcome: '' };
  const [draft, setDraft] = useState(empty);
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ items: [], modules: [], actions: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const params = { page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) };
    api.get('/activity-logs', { params, signal: controller.signal }).then((r) => setData(r.data)).catch((err) => {
      if (!controller.signal.aborted) setError(err.response?.data?.error?.message || err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, refresh]);
  const actions = {
    create: tr('Create / record', 'তৈরি / নথিভুক্ত'), update: tr('Update', 'পরিবর্তন'), delete: tr('Delete', 'মুছে ফেলা'),
    login: tr('Login', 'লগইন'), logout: tr('Logout', 'লগআউট'), 'password-reset': tr('Password reset', 'পাসওয়ার্ড পরিবর্তন'),
    preview: tr('Calculate / preview', 'হিসাব / পূর্বরূপ'), review: tr('Review / approval', 'পর্যালোচনা / অনুমোদন'),
    activate: tr('Activate', 'সক্রিয়'), status: tr('Status change', 'অবস্থা পরিবর্তন'), generate: tr('Generate', 'তৈরি'),
    import: tr('Import', 'আমদানি'), access: tr('Access attempt', 'প্রবেশের চেষ্টা'), pause: tr('Pause', 'বিরতি'),
  };
  const modules = { finance: tr('Finance', 'অর্থ ব্যবস্থাপনা'), partners: tr('Partners', 'অংশীদার'), auth: tr('Authentication', 'লগইন ব্যবস্থা'), users: tr('User accounts', 'ব্যবহারকারী হিসাব'),
    people: tr('Students / teachers', 'শিক্ষার্থী / শিক্ষক'), academics: tr('Academic setup', 'শিক্ষা কাঠামো'), attendance: tr('Attendance', 'উপস্থিতি'), exams: tr('Exams', 'পরীক্ষা'),
    fees: tr('Fees', 'ফি'), schedule: tr('Timetable / notices', 'সময়সূচি / বিজ্ঞপ্তি'), uploads: tr('Uploads', 'আপলোড'), 'activity-logs': tr('Activity logs', 'কার্যকলাপের লগ') };
  const field = (key) => ({ name: tr('Name', 'নাম'), amount: tr('Amount', 'পরিমাণ'), amountCents: tr('Amount (poisha)', 'পরিমাণ (পয়সা)'), totalAmount: tr('Total amount', 'মোট পরিমাণ'), net: tr('Net amount', 'নিট পরিমাণ'), reference: tr('Document no.', 'নথি নং'), invoiceNo: tr('Invoice no.', 'ইনভয়েস নং'), receiptNo: tr('Receipt no.', 'রসিদ নং'), status: tr('Status', 'অবস্থা'), isActive: tr('Active', 'সক্রিয়'), role: tr('Role', 'ভূমিকা'), date: tr('Date', 'তারিখ'), paidAt: tr('Paid at', 'পরিশোধের তারিখ'), from: tr('From', 'শুরু'), to: tr('To', 'শেষ'), decision: tr('Decision', 'সিদ্ধান্ত') })[key] || key;
  const columns = [
    { key: 'time', header: tr('Date & time', 'তারিখ ও সময়'), render: (r) => <span className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString(bn ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'medium' })}</span> },
    { key: 'actor', header: tr('User', 'ব্যবহারকারী'), render: (r) => <div><p className="font-medium">{bilingual(r.actorName, lang) || tr('Unauthenticated', 'লগইন করা নেই')}</p><p className="text-xs text-slate-500">{r.actorEmail || r.attemptedEmail}</p>{r.actorRole && <p className="text-xs text-slate-400">{t(`roles.${r.actorRole}`)}</p>}</div> },
    { key: 'action', header: tr('Action', 'কাজ'), render: (r) => actions[r.action] || r.action },
    { key: 'module', header: tr('Module', 'বিভাগ'), render: (r) => modules[r.module] || r.module },
    { key: 'outcome', header: tr('Result', 'ফলাফল'), render: (r) => <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${r.outcome === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{r.outcome === 'success' ? tr('Success', 'সফল') : tr('Failed', 'ব্যর্থ')} · {r.status}</span> },
    { key: 'details', header: tr('Details', 'বিস্তারিত'), render: (r) => <details className="min-w-40 max-w-sm"><summary className="cursor-pointer text-brand-600">{tr('View details', 'বিস্তারিত দেখুন')}</summary><div className="mt-2 space-y-1 break-words text-xs"><p>{tr('Resource', 'রেকর্ডের ধরন')}: {r.resource}</p>{r.recordId && <p className="break-all">{tr('Record ID', 'রেকর্ড আইডি')}: {r.recordId}</p>}{r.changedFields.length > 0 && <p>{tr('Submitted fields', 'জমাকৃত তথ্য')}: {r.changedFields.map(field).join(', ')}</p>}{Object.entries(r.details || {}).map(([key, value]) => <p key={key}>{field(key)}: {typeof value === 'object' ? bilingual(value, lang) : typeof value === 'boolean' ? value ? tr('Yes', 'হ্যাঁ') : tr('No', 'না') : String(value)}</p>)}</div></details> },
  ];
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-800">{tr('Activity logs', 'কার্যকলাপের লগ')}</h1><p className="mt-1 text-sm text-slate-500">{tr('System admin access only. New user actions are recorded from now onward; earlier activity is not available. Times are shown in Bangladesh time.', 'শুধু সিস্টেম অ্যাডমিনের জন্য। এখন থেকে নতুন কার্যকলাপ সংরক্ষিত হবে; আগের কার্যকলাপ পাওয়া যাবে না। সময় বাংলাদেশের সময় অনুযায়ী।')}</p></div>
    <form onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters({ ...draft }); }} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label={tr('From', 'শুরু')}><TextInput type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field><Field label={tr('To', 'শেষ')}><TextInput type="date" min={draft.from || undefined} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field><Field label={tr('Search user or record', 'ব্যবহারকারী বা রেকর্ড খুঁজুন')}><TextInput maxLength={200} value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></Field>
      {[['module', tr('Module', 'বিভাগ'), data.modules, modules], ['action', tr('Action', 'কাজ'), data.actions, actions], ['outcome', tr('Result', 'ফলাফল'), ['success', 'failed'], { success: tr('Success', 'সফল'), failed: tr('Failed', 'ব্যর্থ') }]].map(([key, label, values, names]) => <Field label={label} key={key}><Select value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}><option value="">{tr('All', 'সব')}</option>{values.map((v) => <option key={v} value={v}>{names[v] || v}</option>)}</Select></Field>)}</div>
      <div className="flex flex-wrap gap-3"><button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" type="submit">{tr('Apply filters', 'ফিল্টার প্রয়োগ')}</button><button className="text-sm text-slate-600" type="button" onClick={() => { setDraft(empty); setFilters(empty); setPage(1); }}>{tr('Clear filters', 'ফিল্টার মুছুন')}</button><button disabled={loading} className="text-sm text-brand-600 disabled:opacity-50" type="button" onClick={() => setRefresh((n) => n + 1)}>{tr('Refresh', 'হালনাগাদ')}</button></div>
    </form>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-500">{tr('Matching activities', 'মিলে যাওয়া কার্যকলাপ')}: {data.total.toLocaleString(bn ? 'bn-BD' : 'en-BD')}</p>}
    <DataTable columns={columns} rows={error ? [] : data.items} loading={loading} pagination={{ page, pages: data.pages, onPage: setPage }} />
  </div>;
}
