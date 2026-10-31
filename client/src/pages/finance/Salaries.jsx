import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import DataTable from '../../components/ui/DataTable.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'];
const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

export default function Salaries() {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');

  const [staff, setStaff] = useState([]);
  const [structures, setStructures] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [form, setForm] = useState({
    staff: '',
    month: thisMonth(),
    basic: '',
    allowances: '',
    deductions: '',
    method: 'cash',
    note: '',
    paidAt: today(),
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [slip, setSlip] = useState(null);

  const [structOpen, setStructOpen] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/finance/salaries');
      setRows(r.data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get('/people/teachers', { params: { limit: 500 } }).then((r) => setStaff(r.data.items));
    api.get('/finance/salary-structures').then((r) => setStructures(r.data.items));
    loadPayments();
  }, [loadPayments]);

  const net = useMemo(
    () => (Number(form.basic) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0),
    [form.basic, form.allowances, form.deductions]
  );

  // Prefill basic/allowances from the staff member's structure.
  const onStaffChange = (staffId) => {
    const s = structures.find((x) => (x.staff?.id || x.staff?._id) === staffId);
    setForm((f) => ({
      ...f,
      staff: staffId,
      basic: s ? String(s.basic) : f.basic,
      allowances: s ? String(s.allowances) : f.allowances,
    }));
  };

  const openPay = () => {
    setForm({
      staff: '',
      month: thisMonth(),
      basic: '',
      allowances: '',
      deductions: '',
      method: 'cash',
      note: '',
      paidAt: today(),
    });
    setPayOpen(true);
  };

  const submitPay = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/finance/salaries', {
        staff: form.staff,
        month: form.month,
        basic: Number(form.basic) || 0,
        allowances: Number(form.allowances) || 0,
        deductions: Number(form.deductions) || 0,
        method: form.method,
        note: form.note,
        paidAt: form.paidAt,
      });
      setPayOpen(false);
      push(t('finance.salaries.paid'));
      loadPayments();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/finance/salaries/${deleteId}`);
      push(t('finance.deleted'));
      loadPayments();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const columns = [
    { key: 'staff', header: t('finance.salaries.staff'), render: (r) => bt(r.staff?.name, lang) },
    { key: 'month', header: t('finance.salaries.month') },
    {
      key: 'net',
      header: t('finance.salaries.netPay'),
      className: 'text-right',
      render: (r) => `${taka}${Number(r.net).toLocaleString()}`,
    },
    { key: 'paidAt', header: t('finance.salaries.paidAt'), render: (r) => new Date(r.paidAt).toLocaleDateString() },
    { key: 'method', header: t('finance.method'), render: (r) => t(`finance.methods.${r.method}`) },
    {
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSlip(r)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('finance.salaries.slip')}
          </button>
          <button
            type="button"
            onClick={() => setDeleteId(r.id || r._id)}
            className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setStructOpen(true)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {t('finance.salaries.structures')}
        </button>
        <button
          type="button"
          onClick={openPay}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + {t('finance.salaries.pay')}
        </button>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
          {t('finance.salaries.noPayments')}
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} loading={loading} />
      )}

      {/* Pay salary modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        size="lg"
        title={t('finance.salaries.pay')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPayOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="pay-form"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? t('common.saving') : t('finance.salaries.pay')}
            </button>
          </>
        }
      >
        <form id="pay-form" onSubmit={submitPay} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('finance.salaries.staff')} required>
            <Select value={form.staff} onChange={(e) => onStaffChange(e.target.value)} required>
              <option value="">{t('finance.salaries.selectStaff')}</option>
              {staff.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {bt(s.name, lang)} ({s.employeeId})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('finance.salaries.month')} required>
            <TextInput
              type="month"
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              required
            />
          </Field>
          <Field label={t('finance.salaries.basic')}>
            <TextInput
              type="number"
              min="0"
              value={form.basic}
              onChange={(e) => setForm((f) => ({ ...f, basic: e.target.value }))}
            />
          </Field>
          <Field label={t('finance.salaries.allowances')}>
            <TextInput
              type="number"
              min="0"
              value={form.allowances}
              onChange={(e) => setForm((f) => ({ ...f, allowances: e.target.value }))}
            />
          </Field>
          <Field label={t('finance.salaries.deductions')}>
            <TextInput
              type="number"
              min="0"
              value={form.deductions}
              onChange={(e) => setForm((f) => ({ ...f, deductions: e.target.value }))}
            />
          </Field>
          <Field label={t('finance.method')}>
            <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`finance.methods.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 rounded-lg bg-slate-50 px-4 py-3 text-right">
            <span className="text-sm text-slate-500">{t('finance.salaries.netPay')}: </span>
            <span className="text-xl font-bold text-slate-800">
              {taka}
              {net.toLocaleString()}
            </span>
          </div>
        </form>
      </Modal>

      {/* Salary structures modal */}
      <StructuresModal
        open={structOpen}
        onClose={() => setStructOpen(false)}
        staff={staff}
        structures={structures}
        onSaved={() => api.get('/finance/salary-structures').then((r) => setStructures(r.data.items))}
      />

      {/* Salary slip modal */}
      <Modal open={!!slip} onClose={() => setSlip(null)} size="md" title={t('finance.salaries.slip')}>
        {slip && (
          <div className="print-area space-y-4">
            <div className="flex justify-end no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                🖨 {t('common.print')}
              </button>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold">{t('app.name')}</div>
              <div className="text-sm text-slate-500">{t('finance.salaries.slip')} · {slip.month}</div>
            </div>
            <div className="text-sm">
              <div className="font-semibold text-slate-800">{bt(slip.staff?.name, lang)}</div>
              <div className="text-slate-500">{slip.staff?.employeeId}</div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 text-slate-600">{t('finance.salaries.basic')}</td>
                  <td className="py-2 text-right">{taka}{Number(slip.basic).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">{t('finance.salaries.allowances')}</td>
                  <td className="py-2 text-right">{taka}{Number(slip.allowances).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">{t('finance.salaries.deductions')}</td>
                  <td className="py-2 text-right">−{taka}{Number(slip.deductions).toLocaleString()}</td>
                </tr>
              </tbody>
              <tfoot className="border-t border-slate-200 font-bold">
                <tr>
                  <td className="py-2">{t('finance.salaries.netPay')}</td>
                  <td className="py-2 text-right">{taka}{Number(slip.net).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            <div className="text-xs text-slate-500">
              {t('finance.salaries.paidAt')}: {new Date(slip.paidAt).toLocaleDateString()} ·{' '}
              {t(`finance.methods.${slip.method}`)}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteId} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}

/** Set basic/allowances per staff member. */
function StructuresModal({ open, onClose, staff, structures, onSaved }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [rows, setRows] = useState({});

  useEffect(() => {
    if (!open) return;
    const map = {};
    for (const s of staff) {
      const st = structures.find((x) => (x.staff?.id || x.staff?._id) === (s.id || s._id));
      map[s.id || s._id] = { basic: st?.basic ?? '', allowances: st?.allowances ?? '' };
    }
    setRows(map);
  }, [open, staff, structures]);

  const save = async (staffId) => {
    try {
      await api.post('/finance/salary-structures', {
        staff: staffId,
        basic: Number(rows[staffId]?.basic) || 0,
        allowances: Number(rows[staffId]?.allowances) || 0,
      });
      push(t('finance.saved'));
      onSaved?.();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('finance.salaries.structures')}>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('finance.salaries.staff')}</th>
              <th className="px-3 py-2">{t('finance.salaries.basic')}</th>
              <th className="px-3 py-2">{t('finance.salaries.allowances')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((s) => {
              const id = s.id || s._id;
              return (
                <tr key={id}>
                  <td className="px-3 py-2 font-medium text-slate-800">{bt(s.name, lang)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={rows[id]?.basic ?? ''}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [id]: { ...r[id], basic: e.target.value } }))
                      }
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={rows[id]?.allowances ?? ''}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [id]: { ...r[id], allowances: e.target.value } }))
                      }
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => save(id)}
                      className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      {t('common.save')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
