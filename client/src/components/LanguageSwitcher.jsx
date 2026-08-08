import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const setLang = (lng) => i18n.changeLanguage(lng);

  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`rounded-md px-2.5 py-1 transition ${
          current === 'en' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('bn')}
        className={`rounded-md px-2.5 py-1 transition ${
          current === 'bn' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        বাংলা
      </button>
    </div>
  );
}
