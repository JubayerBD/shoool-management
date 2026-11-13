import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api/client.js';
import Modal from './ui/Modal.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import { useToast } from './ui/Toast.jsx';

const empty = { current: '', next: '', repeat: '' };

/** Lets the signed-in user replace their own password. Other devices are signed out. */
export default function ChangePassword({ open, onClose }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((value) => ({ ...value, [key]: e.target.value }));
  const close = () => { setForm(empty); setError(''); onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.repeat) { setError(t('auth.passwordMismatch')); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/password', { currentPassword: form.current, newPassword: form.next });
      // The server ends every older session; keep this one signed in with the fresh token.
      localStorage.setItem('token', res.data.token);
      push(t('auth.passwordChanged'));
      close();
    } catch (err) {
      const problem = err.response?.data?.error;
      setError(Object.values(problem?.details || {})[0] || problem?.message || t('auth.passwordChangeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={t('auth.changePassword')}
      footer={
        <>
          <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            {t('common.cancel')}
          </button>
          <button type="submit" form="change-password-form" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}
        <Field label={t('auth.currentPassword')} required>
          <TextInput type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />
        </Field>
        <Field label={t('accounts.newPassword')} required>
          <TextInput type="password" autoComplete="new-password" value={form.next} onChange={set('next')} required minLength={8} maxLength={72} />
        </Field>
        <Field label={t('auth.repeatPassword')} required>
          <TextInput type="password" autoComplete="new-password" value={form.repeat} onChange={set('repeat')} required minLength={8} maxLength={72} />
        </Field>
        <p className="text-xs text-slate-500">{t('auth.passwordRules')}</p>
      </form>
    </Modal>
  );
}
