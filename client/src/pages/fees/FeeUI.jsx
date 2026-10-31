import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAll } from '../../api/getAll.js';
import { t as bilingual } from '../../utils/bilingual.js';

export const recordId = (record) => record?.id || record?._id || record || '';
export const due = (bill) => bill.status === 'cancelled' ? 0 : Math.max(0, bill.totalAmount - (bill.waivedAmount || 0) - bill.paidAmount);
export function useFeeText() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  return { f: (key) => t(`feeFlow.${key}`), bt: (value) => bilingual(value, lang),
    money: (amount) => `৳${Number(amount || 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-BD', { maximumFractionDigits: 2 })}` };
}
export const buttonClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
export const primaryClass = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
export function Notice({ children }) { return <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-slate-600">{children}</div>; }
export function ErrorNotice({ error }) { return error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null; }
export function Summary({ values }) {
  const { f, money } = useFeeText();
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries(values).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{f(key)}</div><div className={`mt-1 text-xl font-bold ${['due', 'outstanding', 'overdue'].includes(key) ? 'text-amber-700' : 'text-slate-800'}`}>{['students', 'invoiceCount', 'readyCount'].includes(key) ? value : money(value)}</div></div>)}</div>;
}
export function useFeeReferences() {
  const [data, setData] = useState({ types: [], plans: [], classes: [], years: [], students: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    Promise.all(['/fees/structures', '/fees/plans', '/academics/classes', '/academics/academic-years', '/people/students'].map((url) => getAll(url)))
      .then(([types, plans, classes, years, students]) => { if (current) setData({ types: types.data.items, plans: plans.data.items, classes: classes.data.items, years: years.data.items, students: students.data.items }); })
      .catch((err) => { if (current) setError(err.response?.data?.error?.message || err.message); });
    return () => { current = false; };
  }, []);
  return { ...data, error };
}
