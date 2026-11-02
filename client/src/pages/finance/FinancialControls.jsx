import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { schoolDate } from '../../utils/schoolDate.js';

export function DuplicateWarning({ matches = [] }) {
  const { i18n } = useTranslation(); const bn = i18n.language?.startsWith('bn');
  return <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>{bn ? 'এই নথি নম্বর আগে ব্যবহার হয়েছে। সংরক্ষণের আগে মিলিয়ে দেখুন।' : 'This document number was used before. Check the existing entries before saving.'}</p>{matches.map((r) => <div key={r.id} className="break-words border-t border-amber-200 pt-2">{r.reference} · {r.party || '—'} · {schoolDate(r.date)} · ৳{Number(r.amount).toLocaleString()} {r.reversed && `(${bn ? 'বিপরীত এন্ট্রি হয়েছে' : 'reversed'})`}</div>)}</div>;
}
export default function RequestReversal({ type, id, summary, onRequested, disabled = false }) {
  const { i18n } = useTranslation(); const bn = i18n.language?.startsWith('bn');
  const { push } = useToast();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/finance/corrections', { targetType: type, targetId: id, operation: 'reverse', reason, requestKey: key }); setOpen(false); push(bn ? 'অনুমোদনের জন্য আবেদন জমা হয়েছে' : 'Reversal requested for admin approval'); onRequested?.(); }
    catch (err) { setError(err.response?.data?.error?.message || err.message); }
    finally { setBusy(false); }
  }
  return <><button type="button" disabled={disabled} className="rounded-md border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 disabled:opacity-40" onClick={() => { setOpen(true); setReason(''); setError(''); setKey(crypto.randomUUID()); }}>{bn ? 'বিপরীত এন্ট্রির আবেদন' : 'Request reversal'}</button>
    <Modal open={open} onClose={() => !busy && setOpen(false)} title={bn ? 'বিপরীত এন্ট্রির আবেদন' : 'Request reversal'}><form className="space-y-4" onSubmit={submit}><p className="break-words font-medium">{summary}</p><p className="text-sm text-slate-500">{bn ? 'মূল রেকর্ড থাকবে। অ্যাডমিন অনুমোদনের পর বিপরীত এন্ট্রি যোগ হবে।' : 'The original record is retained. A reversing entry is posted only after admin approval.'}</p><Field label={bn ? 'কারণ' : 'Reason'} required><TextInput required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{bn ? 'আবেদন জমা দিন' : 'Submit request'}</button></form></Modal></>;
}
