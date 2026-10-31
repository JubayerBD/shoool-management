import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal.jsx';
import BilingualInput from '../ui/BilingualInput.jsx';
import ImageUpload from '../ui/ImageUpload.jsx';
import AccountFields from '../ui/AccountFields.jsx';
import ProfileAccountSection from '../ui/ProfileAccountSection.jsx';
import { Field, TextInput, Select } from '../ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

/** Build a blank value for a field based on its type. */
function blankValue(field) {
  if (field.type === 'bilingual') return { en: '', bn: '' };
  if (field.type === 'multiref' || field.type === 'multiselect') return field.default ?? [];
  if (field.type === 'checkbox') return field.default ?? false;
  if (field.type === 'number') return '';
  if (field.default !== undefined) return field.default;
  return '';
}

const refId = (v) => v?.id || v?._id || v;

function initialForm(fields, record) {
  const form = {};
  for (const f of fields) {
    if (record && record[f.key] !== undefined && record[f.key] !== null) {
      const val = record[f.key];
      if (f.type === 'bilingual') form[f.key] = { en: val.en || '', bn: val.bn || '' };
      else if (f.type === 'ref') form[f.key] = refId(val);
      else if (f.type === 'multiref') form[f.key] = (val || []).map(refId);
      else if (f.type === 'multiselect') form[f.key] = Array.isArray(val) ? val : [];
      else if (f.type === 'checkbox') form[f.key] = Boolean(val);
      else if (f.type === 'date') form[f.key] = typeof val === 'string' ? val.slice(0, 10) : '';
      else form[f.key] = val;
    } else {
      form[f.key] = blankValue(f);
    }
  }
  return form;
}

/** Config-driven add/edit modal. `fields` describes the form; `refs` supplies ref options. */
export default function ResourceForm({
  open,
  onClose,
  onSubmit,
  record,
  fields,
  refs,
  saving,
  titleKey,
  accountRole,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [form, setForm] = useState({});
  const [account, setAccount] = useState({ create: false, email: '', password: '' });

  useEffect(() => {
    if (open) {
      setForm(initialForm(fields, record));
      setAccount({ create: false, email: '', password: '' });
    }
  }, [open, record, fields]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of fields) {
      const val = form[f.key];
      if (f.type === 'number') {
        if (val !== '' && val !== null) payload[f.key] = Number(val);
      } else if (f.type === 'ref') {
        if (val) payload[f.key] = val;
      } else if (f.type === 'multiref' || f.type === 'multiselect') {
        payload[f.key] = val || [];
      } else if (f.type === 'checkbox') {
        payload[f.key] = Boolean(val);
      } else if (f.type === 'image') {
        payload[f.key] = val || ''; // always send so clearing persists
      } else if (f.type === 'bilingual') {
        payload[f.key] = val;
      } else if (val !== '' && val !== undefined) {
        payload[f.key] = val;
      }
    }
    const accountInfo =
      accountRole && !record && account.create
        ? { email: account.email, password: account.password }
        : null;
    onSubmit(payload, accountInfo);
  };

  const renderField = (f) => {
    if (f.type === 'bilingual') {
      return (
        <div className="sm:col-span-2" key={f.key}>
          <BilingualInput
            labelEn={f.labelEn}
            labelBn={f.labelBn}
            value={form[f.key] || { en: '', bn: '' }}
            onChange={(v) => setField(f.key, v)}
            requiredEn={f.requiredEn}
            multiline={f.multiline}
          />
        </div>
      );
    }

    if (f.type === 'multiselect') {
      const selected = form[f.key] || [];
      const toggle = (val) =>
        setField(
          f.key,
          selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]
        );
      return (
        <div className="sm:col-span-2" key={f.key}>
          <Field label={f.label}>
            <div className="flex flex-wrap gap-2">
              {f.options.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    className={`rounded-full px-3 py-1 text-sm transition ${
                      on
                        ? 'bg-brand-600 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      );
    }

    if (f.type === 'multiref') {
      const options = refs?.[f.refKey] || [];
      const selected = form[f.key] || [];
      const toggle = (id) =>
        setField(
          f.key,
          selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
        );
      return (
        <div className="sm:col-span-2" key={f.key}>
          <Field label={f.label}>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-300 p-2">
              {options.length === 0 && (
                <span className="text-sm text-slate-400">{t('common.noData')}</span>
              )}
              {options.map((o) => {
                const id = o.id || o._id;
                const on = selected.includes(id);
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggle(id)}
                    className={`rounded-full px-3 py-1 text-sm transition ${
                      on
                        ? 'bg-brand-600 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {bt(o.name, lang)}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      );
    }

    if (f.type === 'image') {
      return (
        <div className="sm:col-span-2" key={f.key}>
          <Field label={f.label}>
            <ImageUpload value={form[f.key] || ''} onChange={(url) => setField(f.key, url)} />
          </Field>
        </div>
      );
    }

    if (f.type === 'checkbox') {
      return (
        <label key={f.key} className="flex items-center gap-2 self-end py-2">
          <input
            type="checkbox"
            checked={Boolean(form[f.key])}
            onChange={(e) => setField(f.key, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm font-medium text-slate-700">{f.label}</span>
        </label>
      );
    }

    let control;
    if (f.type === 'date') {
      control = (
        <TextInput
          type="date"
          value={form[f.key] ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      );
    } else if (f.type === 'select') {
      control = (
        <Select value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    } else if (f.type === 'ref') {
      const options = refs?.[f.refKey] || [];
      control = (
        <Select value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
          <option value="">{f.placeholder || '—'}</option>
          {options.map((o) => (
            <option key={o.id || o._id} value={o.id || o._id}>
              {bt(o.name, lang)}
            </option>
          ))}
        </Select>
      );
    } else {
      control = (
        <TextInput
          type={f.type === 'number' ? 'number' : 'text'}
          min={f.min}
          step={f.step}
          value={form[f.key] ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required}
        />
      );
    }

    return (
      <Field key={f.key} label={f.label} required={f.required}>
        {control}
      </Field>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? t(titleKey.edit) : t(titleKey.add)}
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
            form="resource-form"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="resource-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map(renderField)}
        {accountRole && !record && (
          <div className="sm:col-span-2">
            <AccountFields value={account} onChange={setAccount} />
          </div>
        )}
        {accountRole && record && (
          <div className="sm:col-span-2">
            <ProfileAccountSection
              role={accountRole}
              profileId={record.id || record._id}
              profileName={form.name}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
