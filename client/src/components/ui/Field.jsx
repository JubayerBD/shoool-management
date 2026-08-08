/** Labeled wrapper for a form control. */
export function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-1 text-xs font-normal text-slate-400">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50';

export function TextInput(props) {
  return <input {...props} className={`${inputClass} ${props.className || ''}`} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputClass} ${props.className || ''}`}>
      {children}
    </select>
  );
}
