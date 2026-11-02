import { useTranslation } from 'react-i18next';
import Modal from '../../components/ui/Modal.jsx';
import PrintDocument, { DocFields, DocItems, DocWords, useDocText } from '../../components/print/PrintDocument.jsx';

/**
 * Printable receipt (income) / voucher (expense) for a single transaction.
 * @param {object|null} txn   The income/expense row (null = closed).
 * @param {'income'|'expense'} type
 * @param {() => void} onClose
 */
export default function TransactionVoucher({ txn, type, onClose }) {
  const { t } = useTranslation();
  const { d, bt, date } = useDocText();
  const isIncome = type === 'income';

  const title = `${isIncome ? d('receipt') : d('paymentVoucher')}${txn?.isReversed ? ' (REVERSED)' : ''}`;
  const voucherNo = txn ? `${isIncome ? 'CR' : 'DV'}-${String(txn.id || txn._id || '').slice(-6).toUpperCase()}` : '';

  return (
    <Modal open={!!txn} onClose={onClose} size="lg" title={isIncome ? t('finance.incomeReceipt') : t('finance.expenseVoucher')}>
      {txn && (
        <PrintDocument
          title={title}
          copies={isIncome ? [d('copyPayer'), d('copyOffice')] : [null]}
          signatures={isIncome
            ? [d('sigDepositor'), d('sigAccountant'), d('sigPrincipal')]
            : [d('sigRecipient'), d('sigAccountant'), d('sigPrincipal')]}
        >
          <DocFields rows={[
            [isIncome ? d('receiptNo') : d('voucherNo'), voucherNo],
            [d('date'), date(txn.date)],
            [isIncome ? d('receivedFrom') : d('paidTo'), isIncome ? txn.source : txn.payee],
            [d('method'), txn.method ? t(`finance.methods.${txn.method}`) : '—'],
            txn.reference && [isIncome ? t('finance.invoiceNo') : t('finance.voucherNo'), txn.reference],
          ]} />
          <DocItems
            items={[{ label: bt(txn.category?.name) || title, sub: txn.note, amount: txn.amount }]}
            totals={[{ label: d('total'), amount: txn.amount, strong: true }]}
          />
          <DocWords amount={txn.amount} />
        </PrintDocument>
      )}
    </Modal>
  );
}
