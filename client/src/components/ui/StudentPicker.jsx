import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as bt } from '../../utils/bilingual.js';

/**
 * Searchable student combobox — filter by name (en/bn) or admission ID.
 * @param {object[]} students
 * @param {string} value              Selected student id.
 * @param {(id:string)=>void} onChange
 * @param {string} [placeholder]
 */
export default function StudentPicker({ students, value, onChange, placeholder }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = students.find((s) => (s.id || s._id) === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? students.filter(
          (s) =>
            (s.name?.en || '').toLowerCase().includes(q) ||
            (s.name?.bn || '').includes(query.trim()) ||
            (s.admissionNo || '').toLowerCase().includes(q)
        )
      : students;
    return list.slice(0, 50);
  }, [students, query]);

  useEffect(() => {
    const onDocDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const display = selected ? `${bt(selected.name, lang)} (${selected.admissionNo})` : '';

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={open ? query : display}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        placeholder={placeholder || t('fees.searchStudent')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-600"
          aria-label="Clear"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{t('common.noData')}</div>
          ) : (
            filtered.map((s) => (
              <button
                type="button"
                key={s.id || s._id}
                onClick={() => {
                  onChange(s.id || s._id);
                  setOpen(false);
                  setQuery('');
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{bt(s.name, lang)}</span>
                <span className="shrink-0 text-xs text-slate-400">{s.admissionNo}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
