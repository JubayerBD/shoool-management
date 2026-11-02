import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import Modal from '../../components/ui/Modal.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { DuplicateWarning } from './FinancialControls.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import { t as bilingual } from '../../utils/bilingual.js';

export default function Corrections() {
  const { i18n } = useTranslation(), { user } = useAuth(), { push } = useToast();
  const bn = i18n.language?.startsWith('bn'), lang = bn ? 'bn' : 'en', tr = (en, bangla) => bn ? bangla : en;
  const [status, setStatus] = useState('pending'), [page, setPage] = useState(1), [version, setVersion] = useState(0), [data, setData] = useState({ items: [], pages: 0 }), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [review, setReview] = useState(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [matches, setMatches] = useState([]), [confirmed, setConfirmed] = useState(false);
  useEffect(() => { const c = new AbortController(); setLoading(true); setError(''); api.get('/finance/corrections', { params: { status, page, limit: 25 }, signal: c.signal }).then((r) => setData(r.data)).catch((err) => { if (!c.signal.aborted) setError(err.response?.data?.error?.message || err.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); }); return () => c.abort(); }, [status, page, version]);
  const amount = (b) => b ? b.amount ?? b.net ?? b.amountCents / 100 : 0;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post(`/finance/corrections/${review.item.id}/review`, { decision: review.decision, note, duplicateConfirmed: confirmed }); setReview(null); push(tr('Review recorded', 'সিদ্ধান্ত সংরক্ষিত')); setVersion((v) => v + 1); }
    catch (err) { if (err.response?.data?.error?.details?.code === 'DUPLICATE_DOCUMENT') setMatches(err.response.data.error.details.matches); else setError(err.response?.data?.error?.message || err.message); }
    finally { setBusy(false); }
  }
  const columns = [
    { key: 'date', header: tr('Requested', 'আবেদনের তারিখ'), render: (r) => schoolDate(r.createdAt) },
    { key: 'target', header: tr('Original entry', 'মূল এন্ট্রি'), render: (r) => <div>{r.targetType} · {r.before.reference || r.before.month || r.targetId}<p className="text-xs text-slate-500">৳{Number(amount(r.before)).toLocaleString()} · {schoolDate(r.before.date || r.before.paidAt)}</p></div> },
    { key: 'operation', header: tr('Change', 'পরিবর্তন'), render: (r) => <div>{r.operation === 'replace' ? tr('Reverse & replace', 'বিপরীত ও সংশোধিত এন্ট্রি') : tr('Reversal', 'বিপরীত এন্ট্রি')}<p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{r.reason}</p>{r.proposed && <details className="mt-2 text-xs"><summary className="cursor-pointer text-brand-600">{tr('Proposed replacement', 'প্রস্তাবিত সংশোধন')}</summary><p>{r.proposed.reference} · ৳{Number(r.proposed.amount).toLocaleString()} · {r.proposed.source || r.proposed.payee}</p><p>{r.proposed.note}</p></details>}</div> },
    { key: 'status', header: tr('Status', 'অবস্থা'), render: (r) => <div><span className={`rounded-full px-2 py-1 text-xs ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : r.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{r.status}</span>{r.effectiveAt && <p className="mt-2 text-xs">{tr('Effective', 'কার্যকর')}: {schoolDate(r.effectiveAt)}</p>}</div> },
    { key: 'people', header: tr('Requested / reviewed by', 'আবেদনকারী / পর্যালোচক'), render: (r) => <div className="text-xs">{bilingual(r.requestedBy?.name, lang)}{r.reviewedBy && <p>{bilingual(r.reviewedBy.name, lang)} · {r.reviewNote}</p>}</div> },
    { key: 'actions', header: tr('Review', 'পর্যালোচনা'), render: (r) => user.role === 'admin' && r.status === 'pending' ? <div className="flex gap-2">{[['approved', tr('Approve', 'অনুমোদন')], ['rejected', tr('Reject', 'প্রত্যাখ্যান')]].map(([decision, label]) => <button key={decision} className="rounded border px-2 py-1 text-xs text-brand-600" onClick={() => { setReview({ item: r, decision }); setNote(''); setError(''); setMatches([]); setConfirmed(false); }}>{label}</button>)}</div> : '—' },
  ];
  return <div className="space-y-4"><h2 className="text-xl font-bold">{tr('Financial corrections', 'আর্থিক সংশোধন')}</h2><p className="text-sm text-slate-500">{tr('Original entries are never deleted or overwritten. Approval posts a reversal and, for an edit, a replacement on the approval date (or the original date if it is in the future). Saved profit distributions remain unchanged.', 'মূল রেকর্ড মুছে ফেলা বা বদলানো হয় না। অনুমোদনের তারিখে বিপরীত এবং প্রযোজ্য সংশোধিত এন্ট্রি যোগ হয়। আগে বণ্টিত লাভ অপরিবর্তিত থাকে।')}</p><div className="flex flex-wrap items-end gap-3"><Field label={tr('Status', 'অবস্থা')}><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">{tr('All', 'সব')}</option>{['pending', 'approved', 'rejected'].map((s) => <option key={s}>{s}</option>)}</Select></Field><button className="text-sm text-brand-600" onClick={() => setVersion((v) => v + 1)}>{tr('Refresh', 'হালনাগাদ')}</button></div>{error && !review && <p role="alert" className="text-sm text-red-600">{error}</p>}<DataTable columns={columns} rows={data.items} loading={loading} pagination={{ page, pages: data.pages, onPage: setPage }} />
    <Modal open={Boolean(review)} onClose={() => !busy && setReview(null)} title={review?.decision === 'approved' ? tr('Approve correction', 'সংশোধন অনুমোদন') : tr('Reject correction', 'সংশোধন প্রত্যাখ্যান')}><form className="space-y-4" onSubmit={submit}><p>{review?.item.reason}</p><Field label={tr('Review note', 'পর্যালোচনার মন্তব্য')} required><TextInput required maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>{matches.length > 0 && <><DuplicateWarning matches={matches} /><label className="flex gap-2 text-sm"><input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{tr('I checked these document numbers and approve the replacement.', 'নথি নম্বর যাচাই করে সংশোধন অনুমোদন করছি।')}</label></>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{tr('Confirm review', 'সিদ্ধান্ত নিশ্চিত করুন')}</button></form></Modal>
  </div>;
}
