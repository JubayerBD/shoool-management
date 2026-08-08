import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'];

const statusBadge = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function InvoiceDetail({ open, onClose, invoiceId, canPay, onChanged }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'cash', transactionRef: '', note: '' });
  const [saving, setSaving] = useState(false);

  const taka = t('common.taka');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/fees/invoices/${invoiceId}`);
      setInvoice(res.data.item);
      setPayments(res.data.payments || []);
      const balance = res.data.item.totalAmount - res.data.item.paidAmount;
      setPay({ amount: balance > 0 ? String(balance) : '', method: 'cash', transactionRef: '', note: '' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && invoiceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const submitPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/fees/payments', {
        invoice: invoiceId,
        amount: Number(pay.amount),
        method: pay.method,
        transactionRef: pay.transactionRef,
        note: pay.note,
      });
      push(t('fees.paymentRecorded'));
      await load();
      onChanged?.();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const balance = invoice ? invoice.totalAmount - invoice.paidAmount : 0;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('fees.invoiceDetail')}>
      {loading || !invoice ? (
        <div className="py-8 text-center text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="space-y-5 print-area">
          <div className="flex justify-end no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              🖨 {t('common.print')}
            </button>
          </div>

          <div className="print-only text-center">
            <div className="text-xl font-bold">{t('app.name')}</div>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-bold text-slate-800">{invoice.invoiceNo}</div>
              <div className="text-sm text-slate-500">
                {bt(invoice.student?.name, lang)} · {invoice.student?.admissionNo}
              </div>
              {bt(invoice.period, lang) && (
                <div className="text-sm text-slate-500">{bt(invoice.period, lang)}</div>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                statusBadge[invoice.status] || ''
              }`}
            >
              {t(`fees.statusValues.${invoice.status}`)}
            </span>
          </div>

          {/* Items */}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-700">{bt(it.title, lang)}</td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {taka}
                      {Number(it.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-2">{t('fees.total')}</td>
                  <td className="px-4 py-2 text-right">
                    {taka}
                    {invoice.totalAmount.toLocaleString()}
                  </td>
                </tr>
                <tr className="text-emerald-700">
                  <td className="px-4 py-2">{t('fees.paid')}</td>
                  <td className="px-4 py-2 text-right">
                    {taka}
                    {invoice.paidAmount.toLocaleString()}
                  </td>
                </tr>
                <tr className={balance > 0 ? 'text-red-700' : 'text-slate-500'}>
                  <td className="px-4 py-2">{t('fees.balance')}</td>
                  <td className="px-4 py-2 text-right">
                    {taka}
                    {balance.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

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
                      {new Date(p.paidAt).toLocaleDateString()} · {t(`fees.methods.${p.method}`)}
                      {p.transactionRef ? ` · ${p.transactionRef}` : ''}
                    </span>
                    <span className="font-medium text-slate-800">
                      {taka}
                      {Number(p.amount).toLocaleString()}
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

          {balance <= 0 && (
            <div className="rounded-lg bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-700">
              {t('fees.paid_full')}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
