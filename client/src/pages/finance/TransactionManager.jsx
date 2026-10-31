import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import DataTable from '../../components/ui/DataTable.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ImageUpload from '../../components/ui/ImageUpload.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'];
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Shared list + add/edit screen for income or expense entries.
 * @param {'income'|'expense'} type
 */
export default function TransactionManager({ type }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');
  const isIncome = type === 'income';
  const endpoint = isIncome ? '/finance/income' : '/finance/expenses';
  const partyKey = isIncome ? 'source' : 'payee';
  const partyLabel = isIncome ? t('finance.source') : t('finance.payee');

  const emptyForm = () => ({
    category: '',
    amount: '',
    date: today(),
    method: 'cash',
    [partyKey]: '',
    reference: '',
    note: '',
    receiptUrl: '',
    ...(isIncome ? {} : { recurring: { enabled: false, frequency: 'monthly' } }),
  });

  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feeTotal, setFeeTotal] = useState(0); // fee collections (income only)
  const [filters, setFilters] = useState({ from: '', to: '', category: '', search: '' });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    api
      .get('/finance/categories', { params: { type } })
      .then((r) => setCategories(r.data.items))
      .catch(() => setCategories([]));
  }, [type]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.category) params.category = filters.category;
      if (filters.search) params.search = filters.search;
      const r = await api.get(endpoint, { params });
      setRows(r.data.items);
      // For income, also pull fee collections for the same period from the Fees module.
      if (isIncome) {
        const sParams = {};
        if (filters.from) sParams.from = filters.from;
        if (filters.to) sParams.to = filters.to;
        const s = await api.get('/finance/summary', { params: sParams });
        setFeeTotal(s.data.summary?.income?.fees || 0);
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, filters, isIncome]);

  useEffect(() => {
    const id = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, filters.search]);

  const total = useMemo(() => rows.reduce((s, r) => s + (r.amount || 0), 0), [rows]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      category: r.category?.id || r.category?._id || r.category || '',
      amount: r.amount ?? '',
      date: r.date ? r.date.slice(0, 10) : today(),
      method: r.method || 'cash',
      [partyKey]: r[partyKey] || '',
      reference: r.reference || '',
      note: r.note || '',
      receiptUrl: r.receiptUrl || '',
      ...(isIncome ? {} : { recurring: r.recurring || { enabled: false, frequency: 'monthly' } }),
    });
    setOpen(true);
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (!payload.category) delete payload.category;
      if (editing) await api.put(`${endpoint}/${editing.id || editing._id}`, payload);
      else await api.post(endpoint, payload);
      setOpen(false);
      push(t('finance.saved'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`${endpoint}/${deleteId}`);
      push(t('finance.deleted'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const columns = [
    { key: 'date', header: t('finance.date'), render: (r) => new Date(r.date).toLocaleDateString() },
    {
      key: 'category',
      header: t('finance.category'),
      render: (r) => bt(r.category?.name, lang) || '—',
    },
    { key: 'party', header: partyLabel, render: (r) => r[partyKey] || '—' },
    { key: 'method', header: t('finance.method'), render: (r) => t(`finance.methods.${r.method}`) },
    {
      key: 'amount',
      header: t('finance.amount'),
      className: 'text-right',
      render: (r) => (
        <span className={`font-semibold ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
          {taka}
          {Number(r.amount).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.edit')}
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
      {/* Filters + add */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.from')}</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.to')}</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="w-44">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('finance.category')}</span>
            <Select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="!py-1.5 text-sm"
            >
              <option value="">{t('finance.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {bt(c.name, lang)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + {isIncome ? t('finance.addIncome') : t('finance.addExpense')}
        </button>
      </div>

      {/* Totals */}
      {isIncome ? (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-500">{t('finance.feeCollections')}</div>
            <div className="text-lg font-bold text-emerald-600">
              {taka}
              {feeTotal.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400">{t('finance.feeCollectionsNote')}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">{t('finance.otherIncome')}</div>
            <div className="text-lg font-bold text-slate-700">
              {taka}
              {total.toLocaleString()}
            </div>
          </div>
          <div className="sm:border-l sm:border-slate-200 sm:pl-4">
            <div className="text-xs font-medium text-slate-500">{t('finance.totalIncome')}</div>
            <div className="text-xl font-bold text-emerald-700">
              {taka}
              {(feeTotal + total).toLocaleString()}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <span className="text-sm text-slate-500">{t('finance.total')}: </span>
          <span className="text-xl font-bold text-red-600">
            {taka}
            {total.toLocaleString()}
          </span>
        </div>
      )}

      <DataTable columns={columns} rows={rows} loading={loading} />

      {/* Add/Edit modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={
          editing
            ? isIncome
              ? t('finance.editIncome')
              : t('finance.editExpense')
            : isIncome
              ? t('finance.addIncome')
              : t('finance.addExpense')
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="txn-form"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="txn-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('finance.category')}>
            <Select value={form.category} onChange={(e) => setField('category', e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {bt(c.name, lang)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('finance.amount')} required>
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setField('amount', e.target.value)}
              required
            />
          </Field>
          <Field label={t('finance.date')} required>
            <TextInput type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
          </Field>
          <Field label={t('finance.method')}>
            <Select value={form.method} onChange={(e) => setField('method', e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`finance.methods.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={partyLabel}>
            <TextInput value={form[partyKey]} onChange={(e) => setField(partyKey, e.target.value)} />
          </Field>
          <Field label={t('finance.reference')}>
            <TextInput value={form.reference} onChange={(e) => setField('reference', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('finance.note')}>
              <TextInput value={form.note} onChange={(e) => setField('note', e.target.value)} />
            </Field>
          </div>

          {!isIncome && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.recurring?.enabled || false}
                  onChange={(e) =>
                    setField('recurring', { ...form.recurring, enabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-slate-700">{t('finance.recurring')}</span>
              </label>
              {form.recurring?.enabled && (
                <Select
                  value={form.recurring.frequency}
                  onChange={(e) => setField('recurring', { ...form.recurring, frequency: e.target.value })}
                  className="!w-auto !py-1.5 text-sm"
                >
                  <option value="monthly">{t('finance.freq.monthly')}</option>
                  <option value="quarterly">{t('finance.freq.quarterly')}</option>
                  <option value="yearly">{t('finance.freq.yearly')}</option>
                </Select>
              )}
            </div>
          )}

          <div className="sm:col-span-2">
            <Field label={t('finance.receipt')}>
              <ImageUpload value={form.receiptUrl} onChange={(url) => setField('receiptUrl', url)} />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
