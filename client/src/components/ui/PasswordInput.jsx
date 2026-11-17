import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const baseClass = 'w-full rounded-lg border border-slate-300 py-2 pl-3 pr-11 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

/** Password box with an eye button that shows or hides what was typed. */
export default function PasswordInput({ className = '', ...props }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const label = visible ? t('auth.hidePassword') : t('auth.showPassword');
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${baseClass} ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
