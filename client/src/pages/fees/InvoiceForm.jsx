import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

const emptyItem = () => ({ title: { en: '', bn: '' }, amount: '' });

export default function InvoiceForm({ open, onClose, onSubmit, saving }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [students, setStudents] = useState([]);
  const [structures, setStructures] = useState([]);
  const [form, setForm] = useState({
    student: '',
    period: { en: '', bn: '' },
    dueDate: '',
    items: [emptyItem()],
  });

  useEffect(() => {
    if (!open) return;
    setForm({ student: '', period: { en: '', bn: '' }, dueDate: '', items: [emptyItem()] });
    api.get('/people/students', { params: { limit: 200 } }).then((r) => setStudents(r.data.items));
    api
      .get('/fees/structures', { params: { limit: 200, isActive: true } })
      .then((r) => setStructures(r.data.items));
  }, [open]);

  const setItem = (idx, patch) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  // Quick-add a line from a fee structure.
  const quickAdd = (structureId) => {
    const s = structures.find((x) => (x.id || x._id) === structureId);
    if (!s) return;
    setForm((f) => {
      const items = [...f.items];
      const blankIdx = items.findIndex((it) => !it.title.en && !it.amount);
      const newItem = { title: { en: s.name.en, bn: s.name.bn }, amount: s.amount };
      if (blankIdx >= 0) items[blankIdx] = newItem;
      else items.push(newItem);
      return { ...f, items };
    });
  };

  const total = useMemo(
    () => form.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [form.items]
  );

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      student: form.student,
      period: form.period,
      items: form.items
        .filter((it) => it.title.en.trim() && it.amount !== '')
        .map((it) => ({ title: it.title, amount: Number(it.amount) })),
    };
    if (form.dueDate) payload.dueDate = form.dueDate;
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t('fees.createInvoice')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="invoice-form"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('fees.student')} required>
            <Select
              value={form.student}
              onChange={(e) => setForm((f) => ({ ...f, student: e.target.value }))}
              required
            >
              <option value="">{t('fees.selectStudent')}</option>
              {students.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {bt(s.name, lang)} ({s.admissionNo})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('fees.periodEn')}>
            <TextInput
              value={form.period.en}
              onChange={(e) => setForm((f) => ({ ...f, period: { ...f.period, en: e.target.value } }))}
              placeholder="August 2026"
            />
          </Field>
          <Field label={t('fees.dueDate')}>
            <TextInput
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </Field>
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">{t('fees.items')}</h3>
            <div className="flex items-center gap-2">
              <Select
                value=""
                onChange={(e) => e.target.value && quickAdd(e.target.value)}
                className="!py-1 text-sm"
              >
                <option value="">{t('fees.quickAdd')}</option>
                {structures.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>
                    {bt(s.name, lang)} — {t('common.taka')}
                    {s.amount}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={addItem}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                + {t('fees.addItem')}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <TextInput
                    value={it.title.en}
                    onChange={(e) => setItem(idx, { title: { ...it.title, en: e.target.value } })}
                    placeholder={`${t('fees.itemTitle')} (EN)`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <TextInput
                    value={it.title.bn}
                    onChange={(e) => setItem(idx, { title: { ...it.title, bn: e.target.value } })}
                    placeholder={`${t('fees.itemTitle')} (বাংলা)`}
                    dir="auto"
                  />
                </div>
                <div className="sm:col-span-3">
                  <div className="flex gap-1">
                    <TextInput
                      type="number"
                      min="0"
                      value={it.amount}
                      onChange={(e) => setItem(idx, { amount: e.target.value })}
                      placeholder={t('fees.itemAmount')}
                    />
                    {form.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="shrink-0 rounded-lg border border-slate-300 px-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3 text-right text-sm">
            <span className="text-slate-500">{t('fees.total')}: </span>
            <span className="text-lg font-bold text-slate-800">
              {t('common.taka')}
              {total.toLocaleString()}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
