import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import bn from './bn.json';
import { feeEn, feeBn } from './feeFlow.js';
import { docEn, docBn } from './printDocs.js';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, feeFlow: feeEn, doc: docEn } },
      bn: { translation: { ...bn, feeFlow: feeBn, doc: docBn } },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'bn'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lang',
    },
  });

// Keep <html lang> in sync so screen readers, spell-check and font selection follow the UI language.
const syncHtmlLang = (lng) => { document.documentElement.lang = lng?.startsWith('bn') ? 'bn' : 'en'; };
i18n.on('languageChanged', syncHtmlLang);
syncHtmlLang(i18n.language);

export default i18n;
