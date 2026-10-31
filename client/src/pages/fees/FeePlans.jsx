import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import { getAll } from '../../api/getAll.js';
import Modal from '../../components/ui/Modal.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { useFeeText, useFeeReferences, Notice, ErrorNotice, buttonClass, primaryClass, recordId } from './FeeUI.jsx';

const blank = () => ({ name: { en: '', bn: '' }, class: '', academicYear: '', isActive: true, items: [{ feeType: '', amount: '', optional: false }] });
export default function FeePlans() {
  const { f, bt, money } = useFeeText();
  const refs = useFeeReferences();
  const [rows, setRows] = useState([]), [form, setForm] = useState(blank), [editing, setEditing] = useState('');
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = () => getAll('/fees/plans').then((r) => setRows(r.data.items)).catch((err) => setError(err.response?.data?.error?.message || f('error')));
  useEffect(() => { load(); }, []);
  const field = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const line = (index, patch) => setForm((old) => ({ ...old, items: old.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { ...form, items: form.items.map((item) => ({ ...item, amount: Number(item.amount) })) };
      if (editing) await api.put(`/fees/plans/${editing}`, payload); else await api.post('/fees/plans', payload);
      setOpen(false); await load();
    } catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><Notice>{f('planHint')}</Notice><ErrorNotice error={!open && (error || refs.error)} />
    <div className="flex justify-end"><button className={primaryClass} onClick={() => { setForm(blank()); setEditing(''); setError(''); setOpen(true); }}>{f('addPlan')}</button></div>
    <DataTable rows={rows} columns={[
      { key: 'name', header: f('name'), render: (row) => bt(row.name) },
      { key: 'class', header: f('class'), render: (row) => bt(row.class?.name) },
      { key: 'academicYear', header: f('year'), render: (row) => bt(row.academicYear?.name) },
      { key: 'amount', header: f('gross'), render: (row) => money(row.items.reduce((sum, item) => sum + item.amount, 0)) },
      { key: 'status', header: f('status'), render: (row) => f(row.isActive ? 'active' : 'inactive') },
      { key: 'edit', header: '', render: (row) => <button className={buttonClass} onClick={() => { setEditing(recordId(row)); setForm({ ...row, class: recordId(row.class), academicYear: recordId(row.academicYear) }); setError(''); setOpen(true); }}>{f('edit')}</button> },
    ]} />
    <Modal open={open} onClose={() => !busy && setOpen(false)} size="xl" title={f(editing ? 'editPlan' : 'addPlan')}>
      <form onSubmit={save} className="space-y-4"><ErrorNotice error={error || refs.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f('name')} required><TextInput required value={form.name.en} onChange={(e) => field('name', { ...form.name, en: e.target.value })} /></Field>
          <Field label={f('nameBn')}><TextInput value={form.name.bn} onChange={(e) => field('name', { ...form.name, bn: e.target.value })} /></Field>
          <Field label={f('year')} required><Select required value={form.academicYear} onChange={(e) => { field('academicYear', e.target.value); field('class', ''); }}><option value="">{f('choose')}</option>{refs.years.map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)}</option>)}</Select></Field>
          <Field label={f('class')} required><Select required value={form.class} onChange={(e) => field('class', e.target.value)}><option value="">{f('choose')}</option>{refs.classes.filter((item) => !item.academicYear || recordId(item.academicYear) === form.academicYear).map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)}</option>)}</Select></Field>
        </div>
        <div className="space-y-3">{form.items.map((item, index) => <div key={index} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label={f('feeType')} required><Select required value={recordId(item.feeType)} onChange={(e) => { const type = refs.types.find((type) => recordId(type) === e.target.value); line(index, { feeType: e.target.value, amount: type?.amount ?? '' }); }}><option value="">{f('choose')}</option>{refs.types.filter((type) => type.isActive || recordId(type) === recordId(item.feeType)).map((type) => <option key={recordId(type)} value={recordId(type)}>{bt(type.name)}</option>)}</Select></Field>
          <Field label={f('amount')} required><TextInput type="number" min="0" step="0.01" required value={item.amount} onChange={(e) => line(index, { amount: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={item.optional} onChange={(e) => line(index, { optional: e.target.checked })} />{f('optional')}</label>
          <button type="button" className={buttonClass} disabled={form.items.length === 1} onClick={() => field('items', form.items.filter((_, i) => i !== index))}>{f('remove')}</button>
        </div>)}</div>
        <button type="button" className={buttonClass} onClick={() => field('items', [...form.items, { feeType: '', amount: '', optional: false }])}>{f('addLine')}</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => field('isActive', e.target.checked)} />{f('active')}</label>
        <div className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => setOpen(false)}>{f('cancel')}</button><button className={primaryClass} disabled={busy}>{f('save')}</button></div>
      </form>
    </Modal>
  </div>;
}
