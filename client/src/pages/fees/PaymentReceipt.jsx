import { useTranslation } from 'react-i18next';
import PrintDocument, { DocFields, DocItems, DocNote, DocWords, useDocText } from '../../components/print/PrintDocument.jsx';
import { useFeeText, buttonClass, recordId, due } from './FeeUI.jsx';

export default function PaymentReceipt({ payment, invoice, onBack }) {
  const { t } = useTranslation();
  const { f } = useFeeText();
  const { d, bt, money, date } = useDocText();
  const student = invoice.student || {};
  const classSection = [bt((invoice.class || student.class)?.name), bt(student.section?.name)].filter(Boolean).join(' / ');
  const fees = (invoice.items || []).map((item) => bt(item.title)).join(', ');

  return (
    <PrintDocument
      title={payment.historicalImport ? t('fees.historicalSummary') : d('receipt')}
      stamp={payment.voidedAt ? { label: f('voided'), tone: 'cancelled' } : undefined}
      copies={[d('copyStudent'), d('copyOffice')]}
      signatures={[d('sigDepositor'), { label: d('sigReceivedBy'), name: bt(payment.receivedBy?.name) }, d('sigAccountant')]}
      toolbar={onBack && <button className={buttonClass} onClick={onBack}>{f('invoice')}</button>}
    >
      <DocFields rows={[
        [d('receiptNo'), payment.receiptNo || `REC-${String(recordId(payment)).slice(-6).toUpperCase()}`],
        [d('date'), date(payment.paidAt)],
        [d('student'), bt(student.name)],
        [d('admissionNo'), student.admissionNo],
        classSection && [d('classSection'), classSection],
        student.roll && [d('roll'), student.roll],
        [f('physicalInvoiceNo'), payment.invoiceNo || '—'],
        [f('systemInvoiceNo'), invoice.invoiceNo],
        bt(invoice.period) && [d('period'), bt(invoice.period)],
        [d('method'), t(`fees.methods.${payment.method}`)],
        payment.transactionRef && [d('reference'), payment.transactionRef],
      ]} />
      <DocItems
        items={[{ label: d('receivedAgainst', { invoice: invoice.invoiceNo }), sub: fees, amount: payment.amount }]}
        totals={[
          { label: d('total'), amount: payment.amount, strong: true },
          invoice.totalAmount != null && { label: d('invoiceTotal'), amount: invoice.totalAmount },
          invoice.totalAmount != null && { label: d('balanceAsOf', { date: date(new Date()) }), amount: due(invoice) },
        ]}
      />
      <DocWords amount={payment.amount} />
      {payment.voidedAt && <DocNote>{f('voided')} · {money(payment.voidedAmount)} · {date(payment.voidedAt)} · {payment.voidReason}</DocNote>}
      {payment.historicalImport && <DocNote>{t('fees.historicalImportHint')}</DocNote>}
      {payment.refundedAmount > 0 && <DocNote>{d('refundedNote', { amount: money(payment.refundedAmount) })}</DocNote>}
      {payment.corrections?.map((entry, index) => (
        <DocNote key={index}>{d('correctedNote', { from: money(entry.previousAmount), to: money(entry.correctedAmount), date: date(entry.approvedAt), reason: entry.reason })}</DocNote>
      ))}
      {payment.note && <DocNote>{payment.note}</DocNote>}
    </PrintDocument>
  );
}
