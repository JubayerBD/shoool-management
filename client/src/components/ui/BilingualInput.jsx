import { Field, TextInput } from './Field.jsx';

const areaClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

/**
 * Two side-by-side inputs editing a `{ en, bn }` value.
 * @param {{en?:string,bn?:string}} value
 * @param {(next:{en:string,bn:string}) => void} onChange
 * @param {boolean} [multiline]  Render textareas instead of single-line inputs.
 */
export default function BilingualInput({
  labelEn,
  labelBn,
  value = {},
  onChange,
  requiredEn,
  multiline,
}) {
  const set = (key) => (e) =>
    onChange({ en: value.en || '', bn: value.bn || '', [key]: e.target.value });

  const renderControl = (key, dir) =>
    multiline ? (
      <textarea
        rows={3}
        value={value[key] || ''}
        onChange={set(key)}
        dir={dir}
        className={areaClass}
      />
    ) : (
      <TextInput value={value[key] || ''} onChange={set(key)} dir={dir} />
    );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={labelEn} required={requiredEn}>
        {renderControl('en')}
      </Field>
      <Field label={labelBn}>{renderControl('bn', 'auto')}</Field>
    </div>
  );
}
