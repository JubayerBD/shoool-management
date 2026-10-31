import { useState } from 'react';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { useFeeText, Notice, ErrorNotice, buttonClass, primaryClass, recordId } from './FeeUI.jsx';

export default function PaymentCorrection({ payment, invoiceId, onClose }) {
  const { f, money } = useFeeText();
  const [amount, setAmount] = useState(payment.amount), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.post('/fees/adjustments', { invoice: invoiceId, payment: recordId(payment), type: 'payment_correction', amount: Number(amount), reason }); setSent(true); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  return <Modal open onClose={() => !busy && onClose()} title={f('correctPayment')}>
    {sent ? <div className="space-y-4"><Notice>{f('correctionSent')}</Notice><button className={buttonClass} onClick={onClose}>{f('closeCorrection')}</button></div> :
      <form onSubmit={submit} className="space-y-4"><ErrorNotice error={error} /><Notice>{f('correctionHint')}</Notice>
        <p>{payment.receiptNo} - {f('currentAmount')}: {money(payment.amount)}</p>
        <Field label={f('correctedAmount')} required><TextInput type="number" required min={payment.refundedAmount || 0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={f('reason')} required><TextInput required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className={primaryClass} disabled={busy || Number(amount) === payment.amount}>{f('request')}</button>
      </form>}
  </Modal>;
}
