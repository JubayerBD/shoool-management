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
import PrintDocument, { DocFields, DocItems, DocWords, useDocText } from '../../components/print/PrintDocument.jsx';

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'];

const STAMPS = { unpaid: 'stampUnpaid', partial: 'stampPartial', paid: 'stampPaid', cancelled: 'stampCancelled' };

export default function InvoiceDetail({ open, onClose, invoiceId, canPay, onChanged }) {
  const [correction, setCorrection] = useState(null);
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const { f } = useFeeText();
  const { d, date } = useDocText();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'cash', transactionRef: '', note: '' });
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
      setPay({ amount: balance > 0 ? String(balance) : '', method: 'cash', transactionRef: '', note: '' });
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
        method: pay.method,
        transactionRef: pay.transactionRef,
        note: pay.note,
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

  return (
    <><Modal open={open} onClose={onClose} size="lg" title={t('fees.invoiceDetail')}>
      {loading || !invoice ? (
        <div className="py-8 text-center text-slate-400">{t('common.loading')}</div>
      ) : receipt ? <PaymentReceipt payment={receipt} invoice={invoice} onBack={() => setReceipt(null)} /> : (
        <div className="space-y-5">
          <PrintDocument
            title={d('invoice')}
            stamp={{ label: d(STAMPS[invoice.status]), tone: invoice.status }}
            signatures={[d('sigAccountant'), d('sigPrincipal')]}
          >
            <DocFields rows={[
              [d('student'), bt(invoice.student?.name, lang)],
              [d('invoiceNo'), invoice.invoiceNo],
              [d('admissionNo'), invoice.student?.admissionNo],
              [d('invoiceDate'), date(invoice.billingDate || invoice.createdAt)],
              [d('classSection'), [bt(invoice.student?.class?.name, lang), bt(invoice.student?.section?.name, lang)].filter(Boolean).join(' / ')],
              [d('period'), bt(invoice.period, lang)],
              [d('roll'), invoice.student?.roll],
              [d('dueDate'), invoice.dueDate && date(invoice.dueDate)],
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
                      {new Date(p.paidAt).toLocaleDateString()} · {t(`fees.methods.${p.method}`)}
                      {p.transactionRef ? ` · ${p.transactionRef}` : ''}
                    </span>
                    <span className="font-medium text-slate-800">
                      {taka}
                      {Number(p.amount).toLocaleString()}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
