/**
 * Pick the right language string from a bilingual `{ en, bn }` value.
 * Falls back to the other language, then to an empty string.
 *
 * @param {{en?:string,bn?:string}|string|undefined} value
 * @param {string} lang  Current i18n language ('en' | 'bn').
 */
export function t(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const primary = value[lang];
  if (primary) return primary;
  return value.en || value.bn || '';
}
