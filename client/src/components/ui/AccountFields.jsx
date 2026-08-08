import { useTranslation } from 'react-i18next';
import { Field, TextInput } from './Field.jsx';

/**
 * Optional "create a login account" block for profile forms.
 * @param {{create:boolean,email:string,password:string}} value
 * @param {(next)=>void} onChange
 */
export default function AccountFields({ value, onChange }) {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.create}
          onChange={(e) => set({ create: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm font-semibold text-slate-700">{t('accounts.createLogin')}</span>
      </label>

      {value.create && (
        <>
          <p className="mt-2 text-xs text-slate-500">{t('accounts.loginHint')}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('accounts.loginEmail')} required>
              <TextInput
                type="email"
                value={value.email}
                onChange={(e) => set({ email: e.target.value })}
                required
              />
            </Field>
            <Field label={t('accounts.loginPassword')} required>
              <TextInput
                type="text"
                value={value.password}
                onChange={(e) => set({ password: e.target.value })}
                required
                minLength={6}
              />
            </Field>
          </div>
        </>
      )}
    </div>
  );
}
