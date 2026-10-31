import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import { getAll } from '../../api/getAll.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../../components/ui/Modal.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StudentPicker from '../../components/ui/StudentPicker.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { useFeeText, Notice, ErrorNotice, buttonClass, primaryClass, recordId, due } from './FeeUI.jsx';

export default function FeeAdjustments() {
  const { f, bt, money } = useFeeText();
  const { user } = useAuth();
  const [rows, setRows] = useState([]), [students, setStudents] = useState([]), [student, setStudent] = useState(''), [bills, setBills] = useState([]), [payments, setPayments] = useState([]);
  const [status, setStatus] = useState(''), [open, setOpen] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ invoice: '', type: 'waiver', amount: '', reason: '', payment: '' });
  const [review, setReview] = useState(null), [note, setNote] = useState('');
  const load = () => getAll('/fees/adjustments', { params: status ? { status } : {} }).then((r) => setRows(r.data.items)).catch((err) => setError(err.response?.data?.error?.message || f('error')));
  useEffect(() => { load(); }, [status]);
  useEffect(() => { getAll('/people/students').then((r) => setStudents(r.data.items)).catch((err) => setError(err.response?.data?.error?.message || f('error'))); }, []);
  useEffect(() => {
    let current = true; setBills([]); setPayments([]); setForm((old) => ({ ...old, invoice: '', payment: '' }));
    if (student) getAll('/fees/invoices', { params: { student } }).then((r) => { if (current) setBills(r.data.items.filter((bill) => bill.status !== 'cancelled')); }).catch((err) => { if (current) setError(err.response?.data?.error?.message || f('error')); });
    return () => { current = false; };
  }, [student]);
  useEffect(() => {
    let current = true; setPayments([]);
    if (form.invoice) api.get(`/fees/invoices/${form.invoice}`).then((r) => { if (current) setPayments(r.data.payments); }).catch((err) => { if (current) setError(err.response?.data?.error?.message || f('error')); });
    return () => { current = false; };
  }, [form.invoice]);
  const selected = bills.find((bill) => recordId(bill) === form.invoice);
  const selectedPayment = payments.find((payment) => recordId(payment) === form.payment);
  const max = form.type === 'refund' ? (selectedPayment?.amount || 0) - (selectedPayment?.refundedAmount || 0) : selected ? due(selected) : 0;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/fees/adjustments', { ...form, amount: form.type === 'cancellation' ? 0 : Number(form.amount), payment: form.type === 'refund' ? form.payment : undefined }); setOpen(false); await load(); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const decide = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post(`/fees/adjustments/${recordId(review.item)}/review`, { decision: review.decision, note }); setReview(null); await load(); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><Notice>{f('adjustmentHint')}</Notice><ErrorNotice error={!open && !review && error} />
    <div className="flex justify-between gap-3"><Select className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{f('all')}</option>{['pending', 'approved', 'rejected'].map((key) => <option key={key} value={key}>{f(key)}</option>)}</Select><button className={primaryClass} onClick={() => { setStudent(''); setForm({ invoice: '', type: 'waiver', amount: '', reason: '', payment: '' }); setError(''); setOpen(true); }}>{f('request')}</button></div>
    <DataTable rows={rows} columns={[
      { key: 'student', header: f('student'), render: (row) => bt(row.student?.name) }, { key: 'invoice', header: f('invoice'), render: (row) => row.invoice?.invoiceNo },
      { key: 'type', header: f('type'), render: (row) => f(row.type) }, { key: 'amount', header: f('amount'), render: (row) => row.type === 'payment_correction' ? `${row.payment?.receiptNo || ''}: ${money(row.previousAmount)} -> ${money(row.amount)}` : money(row.amount) },
      { key: 'reason', header: f('reason') }, { key: 'status', header: f('status'), render: (row) => <span className={row.status === 'pending' ? 'font-medium text-amber-700' : ''}>{f(row.status)}</span> },
      { key: 'audit', header: f('requester'), render: (row) => <span>{bt(row.requestedBy?.name)}{row.reviewedBy && <span className="mt-1 block text-xs text-slate-500">{f('reviewer')}: {bt(row.reviewedBy.name)} · {row.reviewNote}</span>}</span> },
      { key: 'actions', header: '', render: (row) => user.role === 'admin' && row.status === 'pending' && <div className="flex gap-2">{['approved', 'rejected'].map((decision) => <button key={decision} className={buttonClass} onClick={() => { setReview({ item: row, decision }); setNote(''); setError(''); }}>{f(decision === 'approved' ? 'approve' : 'reject')}</button>)}</div> },
    ]} />
    <Modal open={open} onClose={() => !busy && setOpen(false)} title={f('request')}><form onSubmit={save} className="space-y-4"><ErrorNotice error={error} />
      <Field label={f('student')} required><StudentPicker students={students} value={student} onChange={setStudent} /></Field>
      <Field label={f('invoice')} required><Select required value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value, payment: '' })}><option value="">{f('choose')}</option>{bills.map((bill) => <option key={recordId(bill)} value={recordId(bill)}>{bill.invoiceNo} · {f('outstanding')}: {money(due(bill))}</option>)}</Select></Field>
      <Field label={f('type')}><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, amount: '', payment: '' })}>{['waiver', 'cancellation', 'refund'].map((key) => <option key={key} value={key}>{f(key)}</option>)}</Select></Field>
      {form.type === 'refund' && <Field label={f('paymentToRefund')} required><Select required value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })}><option value="">{f('choose')}</option>{payments.filter((payment) => payment.amount > (payment.refundedAmount || 0)).map((payment) => <option key={recordId(payment)} value={recordId(payment)}>{payment.receiptNo || `REC-${recordId(payment)}`} · {money(payment.amount - (payment.refundedAmount || 0))}</option>)}</Select></Field>}
      {form.type !== 'cancellation' && <Field label={f('amount')} required><TextInput required type="number" min="0.01" max={max} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>}
      <Field label={f('reason')} required><TextInput required minLength={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
      <div className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => setOpen(false)}>{f('cancel')}</button><button className={primaryClass} disabled={busy || !form.invoice}>{f('request')}</button></div>
    </form></Modal>
    <Modal open={!!review} onClose={() => !busy && setReview(null)} title={f('review')}><form onSubmit={decide} className="space-y-4"><ErrorNotice error={error} />
      {review && <Notice>{f(review.item.type)} · {review.item.type === 'payment_correction' ? `${review.item.payment?.receiptNo || ''}: ${money(review.item.previousAmount)} -> ${money(review.item.amount)}` : money(review.item.amount)} · {review.item.reason}</Notice>}
      <Field label={f('reviewNote')} required><TextInput required minLength={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex justify-end"><button disabled={busy} className={primaryClass}>{f(review?.decision === 'approved' ? 'approve' : 'reject')}</button></div>
    </form></Modal>
  </div>;
}
