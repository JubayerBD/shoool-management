import PaymentCorrection from './PaymentCorrection.jsx';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { getAll } from '../../api/getAll.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../../components/ui/Modal.jsx';
import PaymentReceipt from './PaymentReceipt.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import StudentPicker from '../../components/ui/StudentPicker.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import InvoiceDetail from './InvoiceDetail.jsx';
import FeeCalendar from './FeeCalendar.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import { useFeeText, ErrorNotice, Summary, buttonClass, recordId, due } from './FeeUI.jsx';

export default function StudentAccounts({ studentId, onBack }) {
  const { t, i18n } = useTranslation();
  const bn = i18n.language?.startsWith('bn');
  const accountRef = useRef(null);
  const [correction, setCorrection] = useState(null);
  const [manualPeriod, setManualPeriod] = useState('');
  const { f, bt, money } = useFeeText();
  const { user } = useAuth();
  const manager = ['admin', 'accountant'].includes(user.role);
  const [students, setStudents] = useState([]), [selected, setSelected] = useState(studentId || ''), [account, setAccount] = useState(null);
  const [error, setError] = useState(''), [detail, setDetail] = useState(''), [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0), [receipt, setReceipt] = useState(null), [manualOpen, setManualOpen] = useState(false), [saving, setSaving] = useState(false);
  useEffect(() => {
    if (studentId) return;
    if (manager) getAll('/people/students').then((r) => setStudents(r.data.items)).catch((err) => setError(err.response?.data?.error?.message || f('error')));
    else {
      const ids = user.role === 'student' ? [recordId(user.student)].filter(Boolean) : (user.children || []).map(recordId);
      Promise.all(ids.map((id) => api.get(`/fees/accounts/${id}`))).then((responses) => { setStudents(responses.map((r) => r.data.student)); setSelected(ids[0] || ''); })
        .catch((err) => setError(err.response?.data?.error?.message || f('error')));
    }
  }, [user, manager, studentId]);
  const load = () => setRevision((n) => n + 1);
  useEffect(() => {
    if (!selected) { setAccount(null); return; }
    let current = true; setLoading(true); setError('');
    api.get(`/fees/accounts/${selected}`).then((response) => { if (current) setAccount(response.data); })
      .catch((err) => { if (current) { setAccount(null); setError(err.response?.data?.error?.message || f('error')); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected, revision]);
  const saveInvoice = async (payload) => {
    setSaving(true); setError('');
    try { const response = await api.post('/fees/invoices', { ...payload, student: selected }); setManualOpen(false); load(); setDetail(recordId(response.data.item)); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setSaving(false); }
  };
  const printAccount = () => {
    const sections = [...(accountRef.current?.querySelectorAll('details[data-account-section]') || [])];
    const states = sections.map(section => section.open);
    sections.forEach(section => { section.open = true; });
    window.addEventListener('afterprint', () => sections.forEach((section,index) => { section.open = states[index]; }), { once:true });
    window.print();
  };
  return <div className="space-y-4" ref={accountRef}>{onBack && <button className={buttonClass} onClick={onBack}>{f('backStudents')}</button>}<ErrorNotice error={error} />
    <div className="flex flex-wrap items-center justify-between gap-3 no-print"><div className="w-full sm:w-96">{!studentId && <StudentPicker students={students} value={selected} onChange={setSelected} />}</div>{account && <button className={buttonClass} onClick={printAccount}>{f('print')}</button>}</div>
    {loading ? <p className="text-sm text-slate-500">…</p> : !account ? <p className="rounded-xl bg-white p-6 text-sm text-slate-500">{f(!manager && !students.length ? 'noLinks' : 'noStudent')}</p> : <div className="space-y-4 print-area">
      <div><h2 className="text-xl font-bold">{bt(account.student.name)}</h2><p className="text-sm text-slate-500">{account.student.admissionNo} · {bt(account.student.class?.name)}</p></div>
      <Summary columns={3} values={{ paid: account.totals.collected - account.totals.refunded, due: account.totals.due, gross: account.totals.billed }} />
      {account.invoices.some(bill => bill.historicalImport) && <p className="text-xs leading-relaxed text-slate-500">{bn ? 'আগের হিসাব আদায়কৃত টাকা দেখায়। তথ্যহীন মাসের বকেয়া নির্ধারণ করা হয়নি।' : 'Historical records show amounts received. Dues for months without records have not been assessed.'}</p>}
      <FeeCalendar key={recordId(account.student)} account={account} manager={manager} onView={setDetail} onRecord={period => { setManualPeriod(period); setManualOpen(true); }} />
      <details data-account-section className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{bn ? 'সকল ইনভয়েস' : 'All invoices'} ({account.invoices.length})</summary>
      <DataTable rows={account.invoices} columns={[
        { key: 'invoiceNo', header: f('invoice') },
        { key: 'items', header: f('components'), render: (row) => <ul>{row.items.map((item, index) => <li key={index}>{bt(item.title)}: {money(item.amount)}</li>)}</ul> },
        { key: 'paidAmount', header: f('paid'), render: (row) => money(row.paidAmount) }, { key: 'totalAmount', header: f('payable'), render: (row) => money(row.totalAmount) },
        { key: 'due', header: f('outstanding'), render: (row) => money(due(row)) },
        { key: 'status', header: f('status'), render: (row) => row.voidedAt ? f('voided') : t(`fees.statusValues.${row.status}`) },
        { key: 'view', header: '', render: (row) => <button className={`${buttonClass} no-print`} onClick={() => setDetail(recordId(row))}>{f(manager && due(row) > 0 ? 'viewCollect' : 'invoice')}</button> },
      ]} />
      </details>
      <details data-account-section className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{f('paymentHistory')} ({account.payments.length})</summary>
      <p className="my-3 text-sm text-slate-500">{f('invoicePaymentHint')}</p>
      <DataTable rows={[...account.payments].reverse()} columns={[
        { key: 'feePeriod', header: t('fees.period') },
        { key: 'date', header: f('receivedDate'), render: (row) => row.paidAt ? schoolDate(new Date(row.paidAt)) : '—' },
        { key: 'invoice', header: f('invoice'), render: (row) => account.invoices.find((bill) => recordId(bill) === recordId(row.invoice))?.invoiceNo },
        { key: 'fees', header: f('components'), render: (row) => account.invoices.find((bill) => recordId(bill) === recordId(row.invoice))?.items.map((item) => bt(item.title)).join(', ') },
        { key: 'amount', header: f('payment'), render: (row) => <span>{money(row.amount)}{row.voidedAt && <span className="block text-xs text-red-700">{f('voided')} · {money(row.voidedAmount)}</span>}</span> },
        { key: 'refundedAmount', header: f('refunded'), render: (row) => money(row.refundedAmount) },
        { key: 'method', header: f('method'), render: (row) => t(`fees.methods.${row.method}`) },
        { key: 'transactionRef', header: f('reference') },
        { key: 'invoiceNo', header: f('physicalInvoiceNo') },
        { key: 'correction', header: '', render: (row) => manager && account.invoices.find((bill) => recordId(bill) === recordId(row.invoice))?.status !== 'cancelled' && <button className={buttonClass} onClick={() => setCorrection(row)}>{f('correctPayment')}</button> },
        { key: 'receipt', header: f('receipt'), render: (row) => <button className={buttonClass} onClick={() => setReceipt(row)}>{row.receiptNo || f('receipt')}</button> },
      ]} />
      </details>
      <details data-account-section className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{f('fullLedger')}</summary>
      <div className="my-3"><Summary values={{ discounts: account.totals.discounts, waived: account.totals.waived, refunded: account.totals.refunded }} columns={3} /></div>
      <DataTable rows={account.ledger} columns={[
        { key: 'date', header: f('date'), render: (row) => schoolDate(row.date) }, { key: 'type', header: f('type'), render: (row) => f(row.type === 'concession' ? 'discounts' : row.type) },
        { key: 'reference', header: f('reference') }, { key: 'debit', header: f('debit'), render: (row) => row.debit ? money(row.debit) : '—' },
        { key: 'credit', header: f('credit'), render: (row) => row.credit ? money(row.credit) : '—' }, { key: 'balance', header: f('balance'), render: (row) => money(row.balance) },
      ]} />
      </details>
    </div>}
    {correction && <PaymentCorrection payment={correction} invoiceId={recordId(correction.invoice)} onClose={() => setCorrection(null)} />}
    <InvoiceForm open={manualOpen} onClose={() => !saving && setManualOpen(false)} onSubmit={saveInvoice} saving={saving} studentId={selected} initialPeriod={manualPeriod} />
    <Modal open={!!receipt} onClose={() => setReceipt(null)} title={f('receipt')} size="lg">
      {receipt && account && <PaymentReceipt payment={receipt} invoice={{ ...account.invoices.find((bill) => recordId(bill) === recordId(receipt.invoice)), student: account.student }} onBack={() => setReceipt(null)} />}
    </Modal>
    <InvoiceDetail open={!!detail} onClose={() => setDetail('')} invoiceId={detail} canPay={manager} onChanged={load} />
  </div>;
}
