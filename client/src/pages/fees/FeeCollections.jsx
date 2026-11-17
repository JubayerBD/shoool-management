import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAll } from '../../api/getAll.js';
import DataTable from '../../components/ui/DataTable.jsx';
import QuickDates, { quickRange } from '../../components/ui/QuickDates.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import { useFeeText, ErrorNotice, buttonClass } from './FeeUI.jsx';

const dateInput = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

/** Fee payments received in a date range (Today by default), by their received date. */
export default function FeeCollections() {
  const { t } = useTranslation();
  const { f, bt, money } = useFeeText();
  const [range, setRange] = useState(() => quickRange('today'));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const sectionRef = useRef(null);

  // Print only this list: the page prints whatever is marked .print-area.
  const print = () => {
    const others = [...document.querySelectorAll('.print-area')].filter((el) => el !== sectionRef.current);
    others.forEach((el) => el.classList.remove('print-area'));
    sectionRef.current.classList.add('print-area');
    window.addEventListener('afterprint', () => {
      sectionRef.current?.classList.remove('print-area');
      others.forEach((el) => el.classList.add('print-area'));
    }, { once: true });
    window.print();
  };

  useEffect(() => {
    let current = true;
    setError('');
    const params = {};
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    getAll('/fees/payments', { params })
      .then((res) => { if (current) setRows(res.data.items); })
      .catch((err) => { if (current) { setRows([]); setError(err.response?.data?.error?.message || f('error')); } });
    return () => { current = false; };
  }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const counted = (rows || []).filter((row) => !row.voidedAt);
  const total = counted.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const label = range.from && range.from === range.to ? range.from : range.from || range.to ? `${range.from || '…'} → ${range.to || '…'}` : t('finance.allTime');

  return (
    <section ref={sectionRef} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{f('collections')}</h2>
          <p className="text-sm text-slate-500">{f('collectionsHint')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <QuickDates from={range.from} to={range.to} onChange={setRange} />
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.from')}</span>
            <input type="date" aria-label={t('finance.from')} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={dateInput} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.to')}</span>
            <input type="date" aria-label={t('finance.to')} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={dateInput} />
          </label>
        </div>
      </div>
      <ErrorNotice error={error} />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg bg-emerald-50 px-4 py-3">
        <span className="text-sm text-emerald-800">{label}</span>
        <span className="text-sm text-emerald-800">{f('collectedTotal')}: <strong className="text-lg text-emerald-700">{money(total)}</strong></span>
        <span className="text-sm text-emerald-800">{f('paymentsCount')}: <strong>{counted.length}</strong></span>
      </div>
      {rows === null ? <p className="text-sm text-slate-500">…</p> : (
        <DataTable rows={rows.map((row) => ({ ...row, id: row.id || row._id }))} columns={[
          { key: 'paidAt', header: f('receivedDate'), render: (row) => row.paidAt ? schoolDate(row.paidAt) : '—' },
          { key: 'receiptNo', header: f('receipt') },
          { key: 'student', header: f('student'), render: (row) => <>{bt(row.student?.name)}<span className="block text-xs text-slate-500">{row.student?.admissionNo}</span></> },
          { key: 'method', header: f('method'), render: (row) => t(`fees.methods.${row.method}`) },
          { key: 'invoiceNo', header: f('physicalInvoiceNo'), render: (row) => row.invoiceNo || '—' },
          { key: 'amount', header: f('payment'), render: (row) => row.voidedAt ? <span className="text-red-700 line-through">{money(row.voidedAmount ?? row.amount)}</span> : money(row.amount) },
        ]} />
      )}
      {rows?.length > 0 && <button type="button" className={`${buttonClass} no-print`} onClick={print}>{f('print')}</button>}
    </section>
  );
}
