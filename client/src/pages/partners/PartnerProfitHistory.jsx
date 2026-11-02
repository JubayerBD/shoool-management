import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { schoolDate } from '../../utils/schoolDate.js';
import RequestReversal from '../finance/FinancialControls.jsx';

export default function PartnerProfitHistory({ profits = [], payments = [], onRequested }) {
  const { i18n, t } = useTranslation();
  const bn = i18n.language?.startsWith('bn');
  const tr = (en, bangla) => bn ? bangla : en;
  const money = (n) => `৳ ${Number(n).toLocaleString(bn ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{tr('Profit distribution history', 'লাভ বণ্টনের ইতিহাস')}</h2><Link className="text-sm text-brand-600" to="/finance?tab=profit">{tr('Net profit', 'নিট লাভ')}</Link></div>
    <p className="text-sm text-slate-500">{tr('Total allocated profit', 'মোট বরাদ্দকৃত লাভ')}: <strong className="text-emerald-700">{money(profits.reduce((sum, p) => sum + p.profit, 0))}</strong></p>
    <div className="flex flex-wrap gap-4 text-sm"><span>{tr('Paid', 'পরিশোধিত')}: <strong>{money(profits.reduce((sum, p) => sum + (p.paid || 0), 0))}</strong></span><span>{tr('Unpaid', 'অপরিশোধিত')}: <strong>{money(profits.reduce((sum, p) => sum + (p.unpaid ?? p.profit), 0))}</strong></span><Link className="text-brand-600" to="/finance?tab=overview">{tr('View / record profit payments', 'লাভ পরিশোধ দেখুন / লিখুন')}</Link></div>
    {!profits.length ? <p className="text-sm text-slate-500">{tr('No profit distributions yet.', 'এখনো লাভ বণ্টন করা হয়নি।')}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[tr('Recorded', 'সংরক্ষিত'), tr('Profit period', 'লাভের সময়কাল'), tr('Share at distribution', 'বণ্টনের সময়ের অংশ'), tr('Profit allocated', 'বরাদ্দকৃত লাভ')].map((label) => <th key={label} className="border-b p-3">{label}</th>)}</tr></thead><tbody>{profits.map((p) => <tr key={p.id}><td className="border-b p-3">{schoolDate(p.date)}</td><td className="border-b p-3">{p.from} — {p.to}</td><td className="border-b p-3">{p.percentage.toFixed(2)}%</td><td className="border-b p-3 font-semibold text-emerald-700">{money(p.profit)}</td></tr>)}</tbody></table></div>}
    {payments.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">{tr('Payment history', 'পরিশোধের ইতিহাস')}</summary><div className="mt-2 divide-y">{payments.map((p) => <div key={p.id} className="py-2 text-sm"><span className="font-medium">{money(p.amount)}</span> · {schoolDate(p.date)} · {t(`finance.methods.${p.method}`)} {p.reference && `· ${p.reference}`}<p className="text-xs text-slate-500">{p.note}</p>{p.isReversed ? <span>Reversed</span> : <RequestReversal type="profitPayment" id={p.id} summary={`${p.amount} - ${p.reference}`} onRequested={onRequested} />}</div>)}</div></details>}
  </section>;
}
