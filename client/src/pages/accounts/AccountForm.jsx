import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/ui/Modal.jsx';
import BilingualInput from '../../components/ui/BilingualInput.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

const ROLES = ['admin', 'teacher', 'student', 'parent', 'accountant'];

const refId = (v) => v?.id || v?._id || v || '';

function toForm(account) {
  if (!account) {
    return {
      name: { en: '', bn: '' },
      email: '',
      password: '',
      role: 'student',
      phone: '',
      isActive: true,
      student: '',
      teacher: '',
      children: [],
    };
  }
  return {
    name: { en: account.name?.en || '', bn: account.name?.bn || '' },
    email: account.email || '',
    password: '',
    role: account.role || 'student',
    phone: account.phone || '',
    isActive: account.isActive !== false,
    student: refId(account.student),
    teacher: refId(account.teacher),
    children: (account.children || []).map(refId),
  };
}

export default function AccountForm({ open, onClose, onSubmit, account, students, teachers, saving }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [form, setForm] = useState(toForm(null));
  const isEdit = Boolean(account);

  useEffect(() => {
    if (open) setForm(toForm(account));
  }, [open, account]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleChild = (id) =>
    setForm((f) => ({
      ...f,
      children: f.children.includes(id)
        ? f.children.filter((x) => x !== id)
        : [...f.children, id],
    }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      email: form.email.trim(),
      role: form.role,
      phone: form.phone,
      isActive: form.isActive,
    };
    if (!isEdit) payload.password = form.password;
    if (form.role === 'student') payload.student = form.student || null;
    if (form.role === 'teacher') payload.teacher = form.teacher || null;
    if (form.role === 'parent') payload.children = form.children;
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? t('accounts.edit') : t('accounts.add')}
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
            form="account-form"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t('accounts.hint')}</p>

        <BilingualInput
          labelEn={t('accounts.nameEn')}
          labelBn={t('accounts.nameBn')}
          value={form.name}
          onChange={(v) => set('name', v)}
          requiredEn
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('accounts.email')} required>
            <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </Field>
          {!isEdit && (
            <Field label={t('accounts.password')} required>
              <TextInput
                type="text"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                required
                minLength={6}
              />
            </Field>
          )}
          <Field label={t('accounts.role')}>
            <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('accounts.phone')}>
            <TextInput value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        {/* Role-conditional profile link */}
        {form.role === 'student' && (
          <Field label={t('accounts.linkStudent')}>
            <Select value={form.student} onChange={(e) => set('student', e.target.value)}>
              <option value="">{t('accounts.selectStudent')}</option>
              {students.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {bt(s.name, lang)} ({s.admissionNo})
                </option>
              ))}
            </Select>
          </Field>
        )}

        {form.role === 'teacher' && (
          <Field label={t('accounts.linkTeacher')}>
            <Select value={form.teacher} onChange={(e) => set('teacher', e.target.value)}>
              <option value="">{t('accounts.selectTeacher')}</option>
              {teachers.map((tc) => (
                <option key={tc.id || tc._id} value={tc.id || tc._id}>
                  {bt(tc.name, lang)} ({tc.employeeId})
                </option>
              ))}
            </Select>
          </Field>
        )}

        {form.role === 'parent' && (
          <Field label={t('accounts.linkChildren')}>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-300 p-2">
              {students.length === 0 && <span className="text-sm text-slate-400">{t('common.noData')}</span>}
              {students.map((s) => {
                const id = s.id || s._id;
                const on = form.children.includes(id);
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggleChild(id)}
                    className={`rounded-full px-3 py-1 text-sm transition ${
                      on ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {bt(s.name, lang)}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {isEdit && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-slate-700">{t('accounts.active')}</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
