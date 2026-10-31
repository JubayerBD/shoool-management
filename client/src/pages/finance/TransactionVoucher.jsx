import { useTranslation } from 'react-i18next';
import Modal from '../../components/ui/Modal.jsx';
import { t as bt } from '../../utils/bilingual.js';

/**
 * Printable receipt (income) / voucher (expense) for a single transaction.
 * @param {object|null} txn   The income/expense row (null = closed).
 * @param {'income'|'expense'} type
 * @param {() => void} onClose
 */
export default function TransactionVoucher({ txn, type, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');
  const isIncome = type === 'income';

  const title = isIncome ? t('finance.incomeReceipt') : t('finance.expenseVoucher');
  const partyLabel = isIncome ? t('finance.receivedFrom') : t('finance.paidTo');
  const partyValue = isIncome ? txn?.source : txn?.payee;
  const voucherNo = txn ? String(txn.id || txn._id || '').slice(-6).toUpperCase() : '';

  const Row = ({ label, value }) => (
    <tr>
      <td className="py-2 pr-4 align-top text-slate-500">{label}</td>
      <td className="py-2 font-medium text-slate-800">{value || '—'}</td>
    </tr>
  );

  return (
    <Modal open={!!txn} onClose={onClose} size="md" title={title}>
      {txn && (
        <div className="print-area space-y-5">
          <div className="flex justify-end no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              🖨 {t('common.print')}
            </button>
          </div>

          {/* Header */}
          <div className="border-b border-slate-200 pb-3 text-center">
            <div className="text-xl font-bold text-slate-800">{t('app.name')}</div>
            <div className="mt-1 inline-block rounded-full bg-slate-100 px-3 py-0.5 text-sm font-semibold text-slate-700">
              {title}
            </div>
          </div>

          <div className="flex justify-between text-sm text-slate-500">
            <span>
              {t('finance.voucherNo')}: <span className="font-medium text-slate-700">{voucherNo}</span>
            </span>
            <span>
              {t('finance.date')}: <span className="font-medium text-slate-700">{new Date(txn.date).toLocaleDateString()}</span>
            </span>
          </div>

          <table className="w-full text-sm">
            <tbody>
              <Row label={partyLabel} value={partyValue} />
              <Row label={t('finance.category')} value={bt(txn.category?.name, lang)} />
              <Row label={t('finance.method')} value={t(`finance.methods.${txn.method}`)} />
              {txn.reference ? <Row label={t('finance.reference')} value={txn.reference} /> : null}
              {txn.note ? <Row label={t('finance.note')} value={txn.note} /> : null}
            </tbody>
          </table>

          {/* Amount */}
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-sm font-semibold text-slate-600">{t('finance.amount')}</span>
            <span className={`text-2xl font-bold ${isIncome ? 'text-emerald-700' : 'text-red-700'}`}>
              {taka}
              {Number(txn.amount).toLocaleString()}
            </span>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-6 pt-8 text-center text-xs text-slate-500">
            <div className="border-t border-slate-300 pt-1">{t('finance.receivedBy')}</div>
            <div className="border-t border-slate-300 pt-1">{t('finance.authorizedBy')}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
