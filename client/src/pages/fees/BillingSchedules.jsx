import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import { getAll } from '../../api/getAll.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../../components/ui/Modal.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { schoolDate } from '../../utils/schoolDate.js';
import { useFeeText, useFeeReferences, Notice, ErrorNotice, Summary, buttonClass, primaryClass, recordId } from './FeeUI.jsx';

const blank = () => ({ name: '', plan: '', feeTypes: [], componentRules: [], students: [], startDate: schoolDate(), endDate: '', frequency: 'monthly', dueDays: 9, optionalAssignments: [], concessions: [] });
export default function BillingSchedules() {
  const { f, bt, money } = useFeeText();
  const { user } = useAuth();
  const refs = useFeeReferences();
  const [rows, setRows] = useState([]), [form, setForm] = useState(blank), [editing, setEditing] = useState('');
  const [open, setOpen] = useState(false), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null), [cancelInfo, setCancelInfo] = useState(null), [cancelReason, setCancelReason] = useState(''), [showCancelled, setShowCancelled] = useState(false);
  const [search, setSearch] = useState(''), [timing, setTiming] = useState(null);
  const load = () => getAll('/fees/schedules').then((r) => setRows(r.data.items)).catch((err) => setError(err.response?.data?.error?.message || f('error')));
  useEffect(() => { load(); }, []);
  const plan = refs.plans.find((item) => recordId(item) === form.plan);
  const eligible = refs.students.filter((student) => student.status === 'active' && recordId(student.class) === recordId(plan?.class) && recordId(student.academicYear) === recordId(plan?.academicYear));
  const shown = eligible.filter((student) => `${bt(student.name)} ${student.admissionNo}`.toLowerCase().includes(search.toLowerCase()));
  const field = (key, value) => { setPreview(null); setForm((old) => ({ ...old, [key]: value })); };
  const choosePlan = (id) => {
    const next = refs.plans.find((item) => recordId(item) === id);
    const year = refs.years.find((item) => recordId(item) === recordId(next?.academicYear));
    setForm((old) => ({ ...old, plan: id, componentRules: [], students: [], concessions: [], optionalAssignments: [],
      feeTypes: next?.items.map((item) => recordId(item.feeType)) || [], endDate: year ? schoolDate(year.endDate) : '' }));
  };
  const selectStudents = (ids) => setForm((old) => ({ ...old, students: ids,
    concessions: old.concessions.filter((entry) => ids.includes(entry.student)),
    optionalAssignments: old.optionalAssignments.map((entry) => ({ ...entry, students: entry.students.filter((id) => ids.includes(id)) })) }));
  const optional = (feeType, student, checked) => setForm((old) => {
    const current = old.optionalAssignments.find((entry) => entry.feeType === feeType)?.students || [];
    return { ...old, optionalAssignments: [...old.optionalAssignments.filter((entry) => entry.feeType !== feeType),
      { feeType, students: checked ? [...current, student] : current.filter((id) => id !== student) }] };
  });
  const concession = (student, patch) => setForm((old) => ({ ...old, concessions: [
    ...old.concessions.filter((entry) => entry.student !== student),
    { student, mode: 'fixed', value: 0, reason: '', ...old.concessions.find((entry) => entry.student === student), ...patch },
  ] }));
  const ruleFor = (feeType) => form.componentRules?.find((rule) => rule.feeType === feeType) || {
    feeType, startDate: form.startDate, intervalMonths: { monthly: 1, quarterly: 3, yearly: 12, one_time: 0 }[form.frequency] ?? 1,
  };
  const changeRule = (feeType, patch) => field('componentRules', [
    ...(form.componentRules || []).filter((rule) => rule.feeType !== feeType), { ...ruleFor(feeType), ...patch },
  ]);
  const save = async (e, review = false) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { ...form, dueDays: Number(form.dueDays),
        componentRules: form.feeTypes.map((feeType) => ruleFor(feeType)),
        concessions: form.concessions.filter((entry) => Number(entry.value) > 0).map((entry) => ({ ...entry, value: Number(entry.value), ...(entry.feeType ? {} : { feeType: undefined }) })) };
      const response = editing ? await api.put(`/fees/schedules/${editing}`, payload) : await api.post('/fees/schedules', payload);
      const id = recordId(response.data.item); setEditing(id);
      if (review) { const result = await api.get(`/fees/schedules/${id}/preview`); setPreview(result.data); setOpen(false); }
      else setOpen(false);
      await load();
    } catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const reviewSaved = async (row) => {
    setBusy(true); setError(''); setEditing(recordId(row));
    try { setPreview((await api.get(`/fees/schedules/${recordId(row)}/preview`)).data); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const activate = async () => {
    setBusy(true); setError('');
    try { const response = await api.post(`/fees/schedules/${editing}/activate`, { token: preview.token }); setPreview(null); setError(response.data.billingError || ''); await load(); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const status = async (row) => {
    setBusy(true); setError('');
    try { await api.post(`/fees/schedules/${recordId(row)}/status`, { status: row.status === 'active' ? 'paused' : 'active' }); await load(); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const timingRule = (feeType) => timing.componentRules.find((rule) => rule.feeType === feeType);
  const timingPatch = (feeType, patch) => setTiming((old) => ({ ...old, componentRules: old.componentRules.map((rule) => rule.feeType === feeType ? { ...rule, ...patch } : rule) }));
  const saveTiming = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { name, endDate, dueDays, componentRules } = timing;
      const response = await api.put(`/fees/schedules/${timing.id}/timing`, { name, endDate, dueDays: Number(dueDays), componentRules });
      setTiming(null); setError(response.data.billingError || ''); await load();
    } catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const beginCancellation = async (row) => {
    setBusy(true); setError(''); setCancelInfo(null); setCancelReason(''); setCancelling(row);
    try { setCancelInfo((await api.get(`/fees/schedules/${recordId(row)}/cancellation-preview`)).data); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const cancelSchedule = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.post(`/fees/schedules/${recordId(cancelling)}/cancel`, { reason: cancelReason }); setCancelling(null); await load(); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><Notice>{f('scheduleHint')}</Notice><ErrorNotice error={!open && !preview && (error || refs.error)} />
    <div className="flex justify-end"><button className={primaryClass} onClick={() => { setEditing(''); setForm(blank()); setSearch(''); setError(''); setOpen(true); }}>{f('addSchedule')}</button></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />{f('showCancelled')}</label>
    <DataTable rows={rows.filter((row) => showCancelled || row.status !== 'cancelled')} columns={[
      { key: 'name', header: f('name') }, { key: 'plan', header: f('plan'), render: (row) => bt(row.plan?.name) },
      { key: 'frequency', header: f('frequency'), render: (row) => row.componentRules?.length ? f('perFeeTiming') : f(row.frequency) },
      { key: 'dates', header: f('billingPeriod'), render: (row) => <span className="whitespace-nowrap">{row.startDate} → {row.endDate}</span> },
      { key: 'students', header: f('students'), render: (row) => row.students.length },
      { key: 'status', header: f('status'), render: (row) => f(row.status === 'active' ? 'activeSchedule' : row.status) },
      { key: 'actions', header: '', render: (row) => <div className="flex gap-2">{row.status === 'draft' ? <>
        <button disabled={busy} className={buttonClass} onClick={() => { setEditing(recordId(row)); setForm({ ...row, plan: recordId(row.plan) }); setSearch(''); setError(''); setOpen(true); }}>{f('edit')}</button>
        <button disabled={busy} className={buttonClass} onClick={() => reviewSaved(row)}>{f('preview')}</button>
      </> : user.role === 'admin' && ['active', 'paused'].includes(row.status) && <><button disabled={busy} className={buttonClass} onClick={() => { setError(''); setTiming({ id: recordId(row), name: row.name, endDate: row.endDate, dueDays: row.dueDays, startDate: row.startDate, plan: row.plan,
          componentRules: row.feeTypes.map((feeType) => row.componentRules?.find((rule) => String(rule.feeType) === String(feeType)) || { feeType: String(feeType), startDate: row.startDate, intervalMonths: { monthly: 1, quarterly: 3, yearly: 12, one_time: 0 }[row.frequency] ?? 1 }).map((rule) => ({ ...rule, feeType: String(rule.feeType) })) }); }}>{f('editTiming')}</button>
        <button disabled={busy} className={buttonClass} onClick={() => status(row)}>{f(row.status === 'active' ? 'pause' : 'resume')}</button></>}{user.role === 'admin' && row.status !== 'cancelled' && <button disabled={busy} className={buttonClass + ' text-red-700'} onClick={() => beginCancellation(row)}>{f('cancelSchedule')}</button>}{row.status === 'cancelled' && <span className="text-xs text-slate-500">{row.cancellationReason}</span>}</div> },
    ]} />
    <Modal open={!!timing} onClose={() => !busy && setTiming(null)} size="xl" title={f('editTimingTitle')}>
      {timing && <form onSubmit={saveTiming} className="space-y-4"><ErrorNotice error={error} /><Notice>{f('editTimingHint')}</Notice>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={f('name')} required><TextInput required value={timing.name} onChange={(e) => setTiming({ ...timing, name: e.target.value })} /></Field>
          <Field label={f('end')} required><TextInput type="date" required min={timing.startDate} value={timing.endDate} onChange={(e) => setTiming({ ...timing, endDate: e.target.value })} /></Field>
          <Field label={f('dueDays')} required><TextInput type="number" min="0" max="90" required value={timing.dueDays} onChange={(e) => setTiming({ ...timing, dueDays: e.target.value })} /></Field>
        </div>
        {timing.componentRules.map((rule) => { const item = refs.plans.find((p) => recordId(p) === recordId(timing.plan))?.items.find((i) => recordId(i.feeType) === rule.feeType);
          return <div key={rule.feeType} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            <div className="self-center text-sm font-semibold">{item ? bt(item.title) : rule.feeType}{item && <div className="font-normal">{money(item.amount)}</div>}</div>
            <Field label={f('frequency')}><Select value={rule.intervalMonths} onChange={(e) => timingPatch(rule.feeType, { intervalMonths: Number(e.target.value) })}>
              <option value={0}>{f('one_time')}</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{f('everyMonths').replace('{n}', n)}</option>)}</Select></Field>
            <Field label={f('start')}><TextInput type="date" required min={timing.startDate} max={timing.endDate} value={rule.startDate} onChange={(e) => timingPatch(rule.feeType, { startDate: e.target.value })} /></Field>
          </div>; })}
        <div className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => setTiming(null)}>{f('cancel')}</button><button className={primaryClass} disabled={busy}>{f('save')}</button></div>
      </form>}
    </Modal>
    <Modal open={!!cancelling} onClose={() => !busy && setCancelling(null)} title={f('cancelSchedule')}>
      <form onSubmit={cancelSchedule} className="space-y-4"><ErrorNotice error={error} />
        <p className="font-semibold">{cancelling?.name}</p><Notice>{f('cancelScheduleHint')}</Notice>
        {cancelInfo && <><p>{f('invoiceCount')}: {cancelInfo.invoiceCount} ? {f('due')}: {money(cancelInfo.outstanding)}</p>
          {cancelInfo.paidInvoices > 0 && <ErrorNotice error={f('cancelPaidBlocked')} />}</>}
        <Field label={f('reason')} required><TextInput required minLength={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => setCancelling(null)}>{f('keepSchedule')}</button>
          <button className={primaryClass} disabled={busy || !cancelInfo || cancelInfo.paidInvoices > 0}>{f('confirmCancellation')}</button></div>
      </form>
    </Modal>
    <Modal open={open} onClose={() => !busy && setOpen(false)} size="xl" title={f(editing ? 'editSchedule' : 'addSchedule')}>
      <form onSubmit={(e) => save(e, e.nativeEvent.submitter?.value === 'review')} className="space-y-4"><ErrorNotice error={error || refs.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f('name')} required><TextInput required value={form.name} onChange={(e) => field('name', e.target.value)} /></Field>
          <Field label={f('plan')} required><Select required value={form.plan} onChange={(e) => choosePlan(e.target.value)}><option value="">{f('choose')}</option>{refs.plans.filter((item) => item.isActive).map((item) => <option key={recordId(item)} value={recordId(item)}>{bt(item.name)} — {bt(item.class?.name)}</option>)}</Select></Field>
          <Field label={f('scheduleStart')} required><TextInput type="date" required value={form.startDate} onChange={(e) => field('startDate', e.target.value)} /><p className="mt-1 text-xs text-slate-500">{f('scheduleStartHint')}</p></Field>
          <Field label={f('end')} required><TextInput type="date" required min={form.startDate} value={form.endDate} onChange={(e) => field('endDate', e.target.value)} /></Field>

          <Field label={f('dueDays')} required><TextInput type="number" min="0" max="90" required value={form.dueDays} onChange={(e) => field('dueDays', e.target.value)} /></Field>
        </div><p className="text-xs text-slate-500">{f('dueHint')}</p>
        {plan && <>
          <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">{f('components')}</legend><div className="flex flex-wrap gap-4">{plan.items.map((item) => { const id = recordId(item.feeType); return <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.feeTypes.includes(id)} onChange={(e) => { field('feeTypes', e.target.checked ? [...form.feeTypes, id] : form.feeTypes.filter((key) => key !== id)); if (!e.target.checked) field('optionalAssignments', form.optionalAssignments.filter((entry) => entry.feeType !== id)); }} />{bt(item.title)} · {money(item.amount)} {item.optional && `(${f('optional')})`}</label>; })}</div></fieldset>
          <Notice>{f('componentTimingHint')}</Notice>
          <div className="space-y-3">{plan.items.filter((item) => form.feeTypes.includes(recordId(item.feeType))).map((item) => {
            const id = recordId(item.feeType), rule = ruleFor(id);
            return <div key={id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
              <div className="self-center text-sm font-semibold">{bt(item.title)}<div className="font-normal">{money(item.amount)}</div></div>
              <Field label={f('frequency')}><Select aria-label={`${bt(item.title)} ${f('frequency')}`} value={rule.intervalMonths} onChange={(e) => changeRule(id, { intervalMonths: Number(e.target.value) })}>
                <option value={0}>{f('one_time')}</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{f('everyMonths').replace('{n}', n)}</option>)}
              </Select></Field>
              <Field label={f('start')}><TextInput aria-label={`${bt(item.title)} ${f('start')}`} type="date" required min={form.startDate} max={form.endDate} value={rule.startDate} onChange={(e) => changeRule(id, { startDate: e.target.value })} /></Field>
            </div>;
          })}</div>
          <TextInput aria-label={f('searchStudent')} placeholder={f('searchStudent')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={eligible.length > 0 && form.students.length === eligible.length} onChange={(e) => selectStudents(e.target.checked ? eligible.map(recordId) : [])} />{f('selectAll')} ({eligible.length})</label>
          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">{f('student')}</th>{plan.items.filter((item) => item.optional && form.feeTypes.includes(recordId(item.feeType))).map((item) => <th key={recordId(item.feeType)} className="p-3">{bt(item.title)}</th>)}<th className="min-w-72 p-3">{f('concession')}</th></tr></thead><tbody className="divide-y divide-slate-100">{shown.map((student) => {
            const sid = recordId(student), selected = form.students.includes(sid), discount = form.concessions.find((entry) => entry.student === sid);
            return <tr key={sid}><td className="p-3"><label className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={(e) => selectStudents(e.target.checked ? [...form.students, sid] : form.students.filter((id) => id !== sid))} /><span>{bt(student.name)}<span className="block text-xs text-slate-500">{student.admissionNo}</span></span></label></td>
              {plan.items.filter((item) => item.optional && form.feeTypes.includes(recordId(item.feeType))).map((item) => <td key={recordId(item.feeType)} className="p-3"><input aria-label={`${bt(item.title)} ${bt(student.name)}`} type="checkbox" disabled={!selected} checked={!!form.optionalAssignments.find((entry) => entry.feeType === recordId(item.feeType))?.students.includes(sid)} onChange={(e) => optional(recordId(item.feeType), sid, e.target.checked)} /></td>)}
              <td className="space-y-2 p-3"><div className="flex gap-2"><Select aria-label={f('concession')} disabled={!selected} value={discount?.mode || 'fixed'} onChange={(e) => concession(sid, { mode: e.target.value })}><option value="fixed">{f('fixed')}</option><option value="percent">{f('percent')}</option></Select><TextInput aria-label={f('amount')} disabled={!selected} type="number" min="0" max={discount?.mode === 'percent' ? 100 : undefined} step="0.01" value={discount?.value ?? 0} onChange={(e) => concession(sid, { value: e.target.value })} /></div>
                {Number(discount?.value) > 0 && <><Select aria-label={f('appliesTo')} value={discount.feeType || ''} onChange={(e) => concession(sid, { feeType: e.target.value })}><option value="">{f('allComponents')}</option>{plan.items.filter((item) => form.feeTypes.includes(recordId(item.feeType))).map((item) => <option key={recordId(item.feeType)} value={recordId(item.feeType)}>{bt(item.title)}</option>)}</Select><TextInput placeholder={f('reason')} aria-label={f('reason')} required value={discount.reason} onChange={(e) => concession(sid, { reason: e.target.value })} /></>}
              </td></tr>;
          })}</tbody></table></div>
        </>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => setOpen(false)}>{f('cancel')}</button><button className={buttonClass} disabled={busy || !form.students.length || !form.feeTypes.length}>{f('saveDraft')}</button><button value="review" className={primaryClass} disabled={busy || !form.students.length || !form.feeTypes.length}>{f('preview')}</button></div>
      </form>
    </Modal>
    <Modal open={!!preview} onClose={() => !busy && setPreview(null)} size="xl" title={f('previewTitle')}>
      {preview && <div className="space-y-4"><ErrorNotice error={error} /><Notice>{f('previewHint')}</Notice><Summary values={preview.summary} />
        <DataTable rows={preview.rows.map((row) => ({ ...row, id: row.student }))} columns={[
          { key: 'name', header: f('student'), render: (row) => <>{bt(row.name)}<span className="block text-xs text-slate-500">{row.admissionNo}</span></> },
          { key: 'grossAmount', header: f('gross'), render: (row) => money(row.scheduledGross) }, { key: 'discountAmount', header: f('discounts'), render: (row) => money(row.scheduledDiscount) },
          { key: 'totalAmount', header: f('payable'), render: (row) => money(row.scheduledTotal) }, { key: 'invoiceCount', header: f('invoiceCount') },
        ]} /><p className="text-xs text-slate-500">{preview.dates.join(' · ')}</p>
        <p className="text-sm text-slate-600">{f('scheduleTotalsHint')}</p>
        {preview.rows.map((row) => <details key={row.student} className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">{bt(row.name)} ? {f('invoiceBreakdown')}</summary>
          <DataTable rows={row.invoices.map((invoice) => ({ ...invoice, id: invoice.date }))} columns={[
            { key: 'date', header: f('invoiceDate') },
            { key: 'items', header: f('components'), render: (invoice) => invoice.items.map((item) => `${bt(item.title)} (${money(item.amount)})`).join(', ') },
            { key: 'discountAmount', header: f('discounts'), render: (invoice) => money(invoice.discountAmount) },
            { key: 'totalAmount', header: f('payable'), render: (invoice) => money(invoice.totalAmount) },
          ]} />
        </details>)}
        <div className="flex justify-end">{user.role === 'admin' ? <button disabled={busy} className={primaryClass} onClick={activate}>{f('activate')}</button> : <p className="text-sm text-amber-700">{f('adminApproval')}</p>}</div>
      </div>}
    </Modal>
  </div>;
}
