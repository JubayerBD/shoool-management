import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import DataTable from '../../components/ui/DataTable.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { useFeeText, useFeeReferences, Notice, ErrorNotice, Summary, buttonClass, recordId } from './FeeUI.jsx';

export default function DuesReports() {
  const { f, bt, money } = useFeeText();
  const refs = useFeeReferences();
  const [filters, setFilters] = useState({}), [report, setReport] = useState(null), [onlyDues, setOnlyDues] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let current = true; setError('');
    api.get('/fees/dues-report', { params: filters }).then((r) => { if (current) setReport(r.data); }).catch((err) => { if (current) { setReport(null); setError(err.response?.data?.error?.message || f('error')); } });
    return () => { current = false; };
  }, [filters]);
  const rows = (report?.items || []).filter((row) => !onlyDues || row.due > 0).map((row) => ({ ...row, id: recordId(row.student) }));
  const exportCsv = () => {
    // Quote fields and neutralize spreadsheet formula prefixes in user-entered names.
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const headings = ['admissionNo', 'student', 'gross', 'discounts', 'waived', 'paid', 'due', 'overdue'].map(f);
    const csv = [headings, ...rows.map((row) => [row.student.admissionNo, bt(row.student.name), row.billed, row.discounts, row.waived, row.paid, row.due, row.overdue])].map((line) => line.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `fee-dues-${report.asOf}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="space-y-4"><Notice>{f('reportsHint')}</Notice><ErrorNotice error={error || refs.error} />
    <div className="flex flex-wrap gap-3 no-print">
      <Select aria-label={f('year')} className="!w-auto" value={filters.academicYear || ''} onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })}><option value="">{f('all')} · {f('year')}</option>{refs.years.map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)}</option>)}</Select>
      <Select aria-label={f('class')} className="!w-auto" value={filters.class || ''} onChange={(e) => setFilters({ ...filters, class: e.target.value })}><option value="">{f('all')} · {f('class')}</option>{refs.classes.map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)}</option>)}</Select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDues} onChange={(e) => setOnlyDues(e.target.checked)} />{f('onlyDues')}</label>
      <button className={buttonClass} disabled={!report} onClick={exportCsv}>{f('export')}</button><button className={buttonClass} disabled={!report} onClick={() => window.print()}>{f('print')}</button>
    </div>
    {report && <div className="space-y-4 print-area"><h2 className="text-lg font-bold">{f('reports')} · {report.asOf}</h2><Summary values={{ gross: report.totals.billed, discounts: report.totals.discounts, waived: report.totals.waived, paid: report.totals.paid, due: report.totals.due, overdue: report.totals.overdue }} />
      <DataTable rows={rows} columns={[
        { key: 'student', header: f('student'), render: (row) => <>{bt(row.student.name)}<span className="block text-xs text-slate-500">{row.student.admissionNo}</span></> },
        ...['billed', 'discounts', 'waived', 'paid', 'due', 'overdue'].map((key) => ({ key, header: f(key === 'billed' ? 'gross' : key), render: (row) => money(row[key]) })),
      ]} />
    </div>}
  </div>;
}
