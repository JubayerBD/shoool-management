import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from './Toast.jsx';
import { Field, TextInput } from './Field.jsx';

/**
 * Self-contained login-account panel for a profile's EDIT screen.
 * - No account yet  -> "Create a login account" (email + password).
 * - Account exists  -> shows it + a "Reset password" action.
 * Acts independently of the surrounding profile form (its own API calls).
 *
 * @param {'student'|'teacher'} role
 * @param {string} profileId
 * @param {{en?:string,bn?:string}} profileName  Used as the new account's name.
 */
export default function ProfileAccountSection({ role, profileId, profileName }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [account, setAccount] = useState(undefined); // undefined=loading, null=none, obj=exists
  const [mode, setMode] = useState(null); // 'create' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    setAccount(undefined);
    setMode(null);
    api
      .get('/users', { params: { [role]: profileId } })
      .then((r) => alive && setAccount(r.data.items[0] || null))
      .catch(() => alive && setAccount(null));
    return () => {
      alive = false;
    };
  }, [role, profileId]);

  const createAccount = async () => {
    setBusy(true);
    try {
      const res = await api.post('/users', {
        name: profileName,
        email: email.trim(),
        password,
        role,
        [role]: profileId,
      });
      setAccount(res.data.item);
      setMode(null);
      setEmail('');
      setPassword('');
      push(t('accounts.accountCreated'));
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      await api.post(`/users/${account.id || account._id}/password`, { password });
      setMode(null);
      setPassword('');
      push(t('accounts.passwordReset'));
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700">{t('accounts.loginAccount')}</h3>

      {account === undefined && <p className="mt-2 text-sm text-slate-400">{t('common.loading')}</p>}

      {/* No account yet */}
      {account === null && mode !== 'create' && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{t('accounts.noAccountYet')}</p>
          <button
            type="button"
            onClick={() => setMode('create')}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t('accounts.createLogin')}
          </button>
        </div>
      )}

      {account === null && mode === 'create' && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('accounts.loginEmail')} required>
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('accounts.loginPassword')} required>
              <TextInput type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={createAccount}
              disabled={busy || !email || password.length < 6}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Account exists */}
      {account && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium text-slate-800">{account.email}</span>
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                  account.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {account.isActive ? t('status.active') : t('status.inactive')}
              </span>
            </div>
            {mode !== 'reset' && (
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {t('accounts.resetPassword')}
              </button>
            )}
          </div>

          {mode === 'reset' && (
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <Field label={t('accounts.newPassword')} required>
                  <TextInput type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={resetPassword}
                disabled={busy || password.length < 6}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
