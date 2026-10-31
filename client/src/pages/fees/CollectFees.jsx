import { useEffect, useState } from 'react';
import { getAll } from '../../api/getAll.js';
import DataTable from '../../components/ui/DataTable.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import StudentAccounts from './StudentAccounts.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import { useFeeText, Notice, ErrorNotice, Summary, buttonClass, recordId, due } from './FeeUI.jsx';

export default function CollectFees() {
  const { f, bt, money } = useFeeText();
  const [data, setData] = useState({ students: [], invoices: [], classes: [], years: [] });
  const [search, setSearch] = useState(''), [grade, setGrade] = useState(''), [year, setYear] = useState('');
  const [selected, setSelected] = useState(''), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    Promise.all(['/people/students', '/fees/invoices', '/academics/classes', '/academics/academic-years'].map((url) => getAll(url)))
      .then(([students, invoices, classes, years]) => { if (current) setData({ students: students.data.items, invoices: invoices.data.items, classes: classes.data.items, years: years.data.items }); })
      .catch((err) => { if (current) setError(err.response?.data?.error?.message || f('error')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);
  const balances = new Map();
  for (const bill of data.invoices) {
    if (year && recordId(bill.academicYear) !== year) continue;
    const id = recordId(bill.student), balance = balances.get(id) || { due: 0, paid: 0, overdue: 0 };
    balance.due += due(bill); balance.paid += bill.paidAmount || 0;
    if (bill.dueDate && schoolDate(bill.dueDate) < schoolDate()) balance.overdue += due(bill);
    balances.set(id, balance);
  }
  const rows = data.students.filter((student) => (!grade || recordId(student.class) === grade) &&
    (!year || recordId(student.academicYear) === year) &&
    `${student.name?.en || ''} ${student.name?.bn || ''} ${student.admissionNo}`.toLowerCase().includes(search.trim().toLowerCase()))
    .map((student) => ({ ...student, ...(balances.get(recordId(student)) || { due: 0, paid: 0, overdue: 0 }) }));
  if (selected) return <StudentAccounts key={selected} studentId={selected} onBack={() => { setSelected(''); setRevision((n) => n + 1); }} />;
  return <div className="space-y-4"><Notice>{f('studentCollectHint')}</Notice><ErrorNotice error={error} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={f('searchStudent')}><TextInput placeholder={f('searchStudent')} value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      <Field label={f('year')}><Select aria-label={f('year')} value={year} onChange={(e) => { setYear(e.target.value); setGrade(''); }}><option value="">{f('all')}</option>{data.years.map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)}</option>)}</Select></Field>
      <Field label={f('class')}><Select aria-label={f('class')} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">{f('all')}</option>{data.classes.filter((item) => !year || recordId(item.academicYear) === year).map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)}</option>)}</Select></Field>
    </div>
    <Summary values={{ students: rows.length, outstanding: rows.reduce((sum, row) => sum + row.due, 0), overdue: rows.reduce((sum, row) => sum + row.overdue, 0) }} />
    <DataTable rows={rows} loading={loading} columns={[
      { key: 'name', header: f('student'), render: (row) => <>{bt(row.name)}<span className="block text-xs text-slate-500">{row.admissionNo}</span></> },
      { key: 'class', header: f('class'), render: (row) => bt(row.class?.name || data.classes.find((item) => recordId(item) === recordId(row.class))?.name) },
      { key: 'academicYear', header: f('year'), render: (row) => bt(row.academicYear?.name || data.years.find((item) => recordId(item) === recordId(row.academicYear))?.name) },
      { key: 'paid', header: f('paid'), render: (row) => money(row.paid) },
      { key: 'due', header: f('outstanding'), render: (row) => money(row.due) },
      { key: 'view', header: '', render: (row) => <button className={buttonClass} onClick={() => setSelected(recordId(row))}>{f('viewStudent')}</button> },
    ]} />
  </div>;
}
