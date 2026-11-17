import PaymentCorrection from './PaymentCorrection.jsx';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import PaymentReceipt from './PaymentReceipt.jsx';
import { due, useFeeText } from './FeeUI.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiError } from '../../utils/apiError.js';
import PrintDocument, { DocFields, DocItems, DocNote, DocWords, useDocText } from '../../components/print/PrintDocument.jsx';

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'];

const STAMPS = { unpaid: 'stampUnpaid', partial: 'stampPartial', paid: 'stampPaid', cancelled: 'stampCancelled' };
const emptyPay = (amount = '') => ({ amount, invoiceNo: '', method: 'cash', transactionRef: '', note: '', paidAt: schoolDate() });

/** Small "change date" control: a date box with Save / Cancel. */
function DateEditor({ value, label, onSave, onCancel }) {
  const { t } = useTranslation();
  const [day, setDay] = useState(value);
  const [busy, setBusy] = useState(false);
  return (
    <span className="no-print inline-flex flex-wrap items-center gap-2">
      <input type="date" aria-label={label} value={day} max={schoolDate()} onChange={(e) => setDay(e.target.value)} className="rounded border border-slate-300 px-2 py-0.5 text-sm" />
      <button type="button" disabled={busy || !day} onClick={async () => { setBusy(true); try { await onSave(day); } finally { setBusy(false); } }} className="rounded bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50">{t('common.save')}</button>
      <button type="button" disabled={busy} onClick={onCancel} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600">{t('common.cancel')}</button>
    </span>
  );
}

export default function InvoiceDetail({ open, onClose, invoiceId, canPay, onChanged }) {
  const [correction, setCorrection] = useState(null);
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const { f } = useFeeText();
  const { d, date } = useDocText();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [editing, setEditing] = useState(null); // id of the payment whose date is being changed

  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pay, setPay] = useState(emptyPay);
  const [saving, setSaving] = useState(false);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState(null);

  const taka = t('common.taka');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/fees/invoices/${invoiceId}`);
      setInvoice(res.data.item);
      setPayments(res.data.payments || []);
      const balance = due(res.data.item);
      setPay(emptyPay(balance > 0 ? String(balance) : ''));
      return res.data;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && invoiceId) {
      setPaymentKey(crypto.randomUUID());
      setReceipt(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const submitPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const recorded = await api.post('/fees/payments', {
        invoice: invoiceId,
        amount: Number(pay.amount),
        ...(pay.invoiceNo.trim() ? { invoiceNo: pay.invoiceNo.trim() } : {}),
        method: pay.method,
        transactionRef: pay.transactionRef,
        note: pay.note,
        paidAt: pay.paidAt,
        idempotencyKey: paymentKey,
      });
      setPaymentKey(crypto.randomUUID());
      push(t('fees.paymentRecorded'));
      const fresh = await load();
      setReceipt(fresh.payments.find((payment) => payment.id === recorded.data.item.id) || recorded.data.item);
      onChanged?.();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const balance = invoice ? due(invoice) : 0;
  const lastReceived = payments.find((p) => !p.voidedAt)?.paidAt; // newest first

  const changeDate = async (url, body) => {
    try {
      await api.patch(url, body);
      push(f('dateChanged'));
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  return (
    <><Modal open={open} onClose={onClose} size="lg" title={t('fees.invoiceDetail')}>
      {loading || !invoice ? (
        <div className="py-8 text-center text-slate-400">{t('common.loading')}</div>
      ) : receipt ? <PaymentReceipt payment={receipt} invoice={invoice} onBack={() => setReceipt(null)} /> : (
        <div className="space-y-5">
          <PrintDocument
            title={invoice.historicalImport ? t('fees.historicalSummary') : d('invoice')}
            stamp={{ label: invoice.voidedAt ? f('voided') : d(STAMPS[invoice.status]), tone: invoice.status }}
            signatures={[d('sigAccountant'), d('sigPrincipal')]}
          >
            <DocFields rows={[
              [d('student'), bt(invoice.student?.name, lang)],
              [f('systemInvoiceNo'), invoice.invoiceNo],
              [d('admissionNo'), invoice.student?.admissionNo],
              [d('classSection'), [bt((invoice.class || invoice.student?.class)?.name, lang), bt(invoice.student?.section?.name, lang)].filter(Boolean).join(' / ')],
              [d('period'), bt(invoice.period, lang)],
              [d('roll'), invoice.student?.roll],
              [d('receivedDate'), lastReceived ? date(lastReceived) : '—'],
            ]} />
            <DocItems
              items={invoice.items.map((it) => ({ label: bt(it.title, lang), amount: it.amount }))}
              totals={[
                invoice.discountAmount > 0 && { label: d('gross'), amount: invoice.grossAmount },
                invoice.discountAmount > 0 && { label: d('discount'), sub: invoice.concessionReason, amount: invoice.discountAmount, minus: true },
                { label: d('netPayable'), amount: invoice.totalAmount, strong: true },
                invoice.waivedAmount > 0 && { label: d('waived'), amount: invoice.waivedAmount, minus: true },
                { label: d('paid'), amount: invoice.paidAmount, minus: true },
                { label: d('balance'), amount: balance, strong: true },
              ]}
            />
            <DocWords amount={invoice.totalAmount} />
            {invoice.historicalImport && <DocNote>{t('fees.historicalImportHint')}</DocNote>}
          </PrintDocument>

          {/* Payment history */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">{t('fees.payments')}</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-400">{t('fees.noPayments')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {payments.map((p) => (
                  <li key={p.id || p._id} className="flex items-center justify-between py-2">
                    <span className="text-slate-600">
                      <button className="mr-2 text-brand-600 underline no-print" onClick={() => setReceipt(p)}>{p.receiptNo || f('receipt')}</button>
                      {canPay && invoice.status !== 'cancelled' && <button className="mr-2 text-brand-600 underline no-print" onClick={() => setCorrection(p)}>{f('correctPayment')}</button>}
                      {editing === (p.id || p._id)
                        ? <DateEditor value={schoolDate(new Date(p.paidAt))} label={f('receivedDate')} onCancel={() => setEditing(null)} onSave={(day) => changeDate(`/fees/payments/${p.id || p._id}/date`, { paidAt: day })} />
                        : <>{f('receivedOn')}: {p.paidAt ? date(p.paidAt) : '—'}{isAdmin && !p.voidedAt && <button type="button" onClick={() => setEditing(p.id || p._id)} className="no-print ml-1 text-xs text-brand-600 underline">{f('changeDate')}</button>}</>}
                      {' · '}{t(`fees.methods.${p.method}`)}
                      {p.transactionRef ? ` · ${p.transactionRef}` : ''}
                      {p.invoiceNo && <span className="block text-xs">{f('physicalInvoiceNo')}: {p.invoiceNo}</span>}
                    </span>
                    <span className="font-medium text-slate-800">
                      {taka}
                      {Number(p.amount).toLocaleString()}
                      {p.voidedAt && <span className="block text-xs text-red-700">{f('voided')} · {taka}{Number(p.voidedAmount).toLocaleString()}</span>}
                      {p.refundedAmount > 0 && <span className="block text-xs text-amber-700">{f('refunded')}: {taka}{p.refundedAmount.toLocaleString()}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Record payment */}
          {canPay && balance > 0 && invoice.status !== 'cancelled' && (
            <form onSubmit={submitPayment} className="rounded-xl border border-slate-200 p-4 no-print">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('fees.recordPayment')}</h3>
              <p className="mb-3 text-sm text-slate-600">{lang === 'bn' ? 'এখানে শুধু এখন জমা দেওয়া টাকা লিখুন। অবশিষ্ট টাকা বকেয়া থাকবে।' : 'Enter only the amount received now. The remaining amount will stay due.'}</p>
              <p className="mb-3 text-sm font-semibold text-amber-700">{lang === 'bn' ? 'এই পেমেন্টের পরে বকেয়া' : 'Remaining due after this payment'}: {taka}{Math.max(0, balance - (Number(pay.amount) || 0)).toLocaleString()}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={f('physicalInvoiceNo')}>
                  <TextInput maxLength={100} value={pay.invoiceNo} onChange={(e) => setPay((p) => ({ ...p, invoiceNo: e.target.value }))} placeholder={lang === 'bn' ? 'এই পেমেন্টের রসিদ বইয়ের নম্বর' : 'Receipt-book number for this payment'} />
                </Field>
                <Field label={f('receivedDate')} required>
                  <TextInput type="date" required max={schoolDate()} value={pay.paidAt} onChange={(e) => setPay((p) => ({ ...p, paidAt: e.target.value }))} />
                  <span className="mt-1 block text-xs text-slate-500">{f('receivedDateHint')}</span>
                </Field>
                <Field label={t('fees.payAmount')} required>
                  <TextInput
                    type="number"
                    min="0.01"
                    max={balance}
                    step="0.01"
                    value={pay.amount}
                    onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
                    required
                  />
                </Field>
                <Field label={t('fees.method')}>
                  <Select
                    value={pay.method}
                    onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`fees.methods.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('fees.transactionRef')}>
                  <TextInput
                    value={pay.transactionRef}
                    onChange={(e) => setPay((p) => ({ ...p, transactionRef: e.target.value }))}
                  />
                </Field>
                <Field label={t('fees.note')}>
                  <TextInput
                    value={pay.note}
                    onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="mt-3 text-right">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? t('common.saving') : t('fees.pay')}
                </button>
              </div>
            </form>
          )}

          {balance <= 0 && invoice.status !== 'cancelled' && (
            <div className="rounded-lg bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-700">
              {t('fees.paid_full')}
            </div>
          )}
        </div>
      )}
    </Modal>{correction && <PaymentCorrection payment={correction} invoiceId={invoiceId} onClose={() => setCorrection(null)} />}</>
  );
}
