import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { feeCalendar, feeMonth, monthSummary, outstanding } from '../../utils/feeCalendar.js';
import { schoolDate } from '../../utils/schoolDate.js';
import { useFeeText, recordId, buttonClass } from './FeeUI.jsx';

const colors = {
  recorded: 'border-emerald-200 bg-emerald-50 text-emerald-900', paid: 'border-emerald-200 bg-emerald-50 text-emerald-900', settled: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  partial: 'border-amber-200 bg-amber-50 text-amber-900', due: 'border-orange-200 bg-orange-50 text-orange-900', overdue: 'border-rose-200 bg-rose-50 text-rose-900',
  scheduled: 'border-blue-200 bg-blue-50 text-blue-900', empty: 'border-slate-200 bg-white text-slate-500', cancelled: 'border-slate-200 bg-slate-50 text-slate-500',
};
const text = {
  en: { title:'Fee calendar', year:'Calendar year', previous:'Previous year', next:'Next year', recorded:'Payment recorded', paid:'Paid', settled:'Settled', partial:'Partially paid', due:'Due', overdue:'Overdue', scheduled:'Scheduled', empty:'No record', cancelled:'Cancelled',
    received:'Monthly fees received', months:'months with payments', current:'Current month', view:'View invoice', collect:'View & collect', expected:'Scheduled', outstanding:'Outstanding',
    choose:'Choose a month to see its fee details.', noRecord:'No invoice or payment is recorded for this month. An amount due has not been determined.',
    imported:'For imported months, “Payment recorded” confirms the amount received. Full charges and dues were not assessed.',
    admission:'Admission & other charges', invoice:'Invoice', issue:'Issues', dueOn:'Due', notIssued:'Invoice not issued yet', nextBill:'Next scheduled bill', legend:'Month status', monthlyPaid:'Paid', history:'Historical record' },
  bn: { title:'ফি ক্যালেন্ডার', year:'ক্যালেন্ডারের বছর', previous:'আগের বছর', next:'পরের বছর', recorded:'পরিশোধের তথ্য আছে', paid:'পরিশোধিত', settled:'নিষ্পত্তি হয়েছে', partial:'আংশিক পরিশোধিত', due:'বকেয়া', overdue:'মেয়াদোত্তীর্ণ', scheduled:'নির্ধারিত', empty:'তথ্য নেই', cancelled:'বাতিল',
    received:'মাসিক ফি আদায়', months:'মাসে পরিশোধের তথ্য আছে', current:'চলতি মাস', view:'ইনভয়েস দেখুন', collect:'দেখুন ও আদায় করুন', expected:'নির্ধারিত', outstanding:'বকেয়া',
    choose:'বিস্তারিত দেখতে একটি মাস বেছে নিন।', noRecord:'এই মাসের ইনভয়েস বা পরিশোধের তথ্য নেই। বকেয়ার পরিমাণ নির্ধারণ করা হয়নি।',
    imported:'আগের মাসের “পরিশোধের তথ্য আছে” অর্থ আদায়কৃত টাকা। মোট ধার্য ফি ও বকেয়া নির্ধারণ করা হয়নি।',
    admission:'ভর্তি ও অন্যান্য ফি', invoice:'ইনভয়েস', issue:'ইস্যু', dueOn:'শেষ তারিখ', notIssued:'ইনভয়েস এখনো ইস্যু হয়নি', nextBill:'পরবর্তী নির্ধারিত বিল', legend:'মাসের অবস্থা', monthlyPaid:'পরিশোধ', history:'আগের হিসাব' },
};

export default function FeeCalendar({ account, manager, onView, onRecord }) {
  const { i18n } = useTranslation();
  const bn = i18n.language?.startsWith('bn'), lang = bn ? 'bn' : 'en', l = text[lang];
  const { bt, money } = useFeeText();
  const today = schoolDate(), currentYear = Number(today.slice(0,4));
  const upcoming = account.upcomingBills || [];
  const periods = [...account.invoices, ...upcoming].map(feeMonth).filter(Boolean);
  const years = [...new Set([currentYear, ...periods.map(p => Number(p.slice(0,4)))])].sort((a,b)=>b-a);
  const [year,setYear] = useState(years.includes(currentYear) ? currentYear : years[0]);
  const [month,setMonth] = useState(() => {
    const recorded = account.invoices.map(feeMonth).filter(p=>p?.startsWith(String(currentYear))).sort();
    return recorded.length ? Number(recorded.at(-1).slice(5))-1 : Number(today.slice(5,7))-1;
  });
  const months = feeCalendar(account.invoices.filter(bill => !bill.voidedAt),upcoming,year,today), selected = months[month];
  const count = months.filter(m=>m.paid>0).length, total = months.reduce((sum,m)=>sum+m.paid,0);
  const number = n => Number(n).toLocaleString(bn?'bn-BD':'en-BD');
  const monthName = (index, full=false) => new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{month:full?'long':'short', ...(full?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(Date.UTC(year,index,1)));
  const date = value => value ? new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dhaka'}).format(new Date(value)) : '—';
  const next = upcoming.find(b=>b.billingDate>=today);
  const nextAmount = next ? upcoming.filter(b=>b.billingDate===next.billingDate).reduce((sum,b)=>sum+b.totalAmount,0) : 0;
  const other = account.invoices.filter(b=>!b.voidedAt && !feeMonth(b));
  const changeYear = nextYear => { setYear(nextYear); };
  const row = bill => {
    const summary = monthSummary([bill],today);
    return <div key={recordId(bill)} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-800">{(bill.items||[]).map(item=>bt(item.title)).join(' · ') || l.invoice}</span><span className={`rounded-full border px-2 py-0.5 text-xs ${colors[summary.state]}`}>{l[summary.state]}</span></div>
        <p className="mt-1 text-xs text-slate-500">{bill.scheduled ? `${l.issue} ${date(bill.billingDate)}` : `${bill.invoiceNo || ''}${bill.class?.name ? ` · ${bt(bill.class.name)}` : ''}`}</p>
      </div>
      <div className="text-right text-sm"><p className="font-semibold text-slate-900">{money(bill.scheduled ? bill.totalAmount : bill.paidAmount)}</p><p className="mt-0.5 text-xs text-slate-500">{bill.scheduled ? l.expected : l.monthlyPaid}{outstanding(bill)>0 ? ` · ${l.outstanding} ${money(outstanding(bill))}` : ''}</p></div>
      {bill.scheduled ? <span className="text-xs text-blue-700">{l.notIssued}</span> : <button type="button" className={`${buttonClass} no-print`} onClick={()=>onView(recordId(bill))}>{manager&&outstanding(bill)>0?(bn ? '?? ????? ????' : 'Record payment'):l.view}</button>}
    </div>;
  };
  return <div className="space-y-4">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={l.title}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div><h3 className="text-lg font-semibold text-slate-900">{l.title}</h3><p className="mt-1 text-sm text-slate-500"><strong className="text-emerald-700">{number(count)}</strong> {l.months} <span aria-hidden="true">·</span> {l.received} <strong className="text-slate-700">{money(total)}</strong></p></div>
        <div className="flex items-center gap-2"><button type="button" aria-label={l.previous} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50" onClick={()=>changeYear(year-1)}>‹</button><select aria-label={l.year} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={year} onChange={e=>changeYear(Number(e.target.value))}>{[...new Set([...years,year])].sort((a,b)=>b-a).map(y=><option value={y} key={y}>{new Intl.NumberFormat(bn?'bn-BD':'en-BD',{useGrouping:false}).format(y)}</option>)}</select><button type="button" aria-label={l.next} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50" onClick={()=>changeYear(year+1)}>›</button></div>
      </div>
      {next && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/70 px-5 py-3 text-sm text-blue-900"><span>{l.nextBill}: <strong>{date(next.billingDate)}</strong></span><strong>{money(nextAmount)}</strong></div>}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">{months.map(m=><button key={m.period} type="button" aria-pressed={month===m.index} aria-label={`${monthName(m.index,true)}: ${l[m.state]}${m.paid?`, ${money(m.paid)}`:''}`} onClick={()=>setMonth(m.index)} className={`min-h-32 rounded-xl border p-3.5 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${colors[m.state]} ${month===m.index?'ring-2 ring-brand-500 ring-offset-2':''}`}>
        <div className="mb-3 flex items-start justify-between gap-2"><span className="text-sm font-semibold">{monthName(m.index)}</span><span className="text-xs opacity-60">{String(m.index+1).padStart(2,'0')}</span></div>
        <div className="text-base font-bold tabular-nums">{m.state==='empty'||m.state==='cancelled'?'—':money(m.due>0?m.due:m.paid||m.expected)}</div>
        <p className="mt-1 text-xs font-medium">{l[m.state]}</p>{m.period===today.slice(0,7)&&<span className="mt-2 inline-block rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium">{l.current}</span>}
      </button>)}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500" aria-label={l.legend}>{[['bg-emerald-500',l.recorded],['bg-amber-500',l.partial],['bg-rose-500',l.overdue],['bg-blue-500',l.scheduled],['bg-slate-300',l.empty]].map(([color,label])=><span className="inline-flex items-center gap-1.5" key={label}><span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true"/>{label}</span>)}</div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white px-5" aria-label={monthName(month,true)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-4"><h4 className="font-semibold text-slate-900">{monthName(month,true)}</h4><span className="text-xs text-slate-500" aria-live="polite">{l[selected.state]}</span></div>
      {selected.bills.length ? <div className="divide-y divide-slate-100">{selected.bills.map(row)}</div> : <div className="flex flex-wrap items-center justify-between gap-4 py-5"><p className="text-sm text-slate-500">{l.noRecord}</p>{manager && onRecord && <button type="button" className="no-print rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800" onClick={() => onRecord(selected.period)}>{bn ? 'ফি আদায় করুন' : 'Record payment'}</button>}</div>}
      {selected.historical&&<p className="border-t border-slate-100 py-3 text-xs leading-relaxed text-slate-500">{l.imported}</p>}
    </section>
    {!!other.length&&<section className="rounded-xl border border-slate-200 bg-white px-5"><h3 className="border-b border-slate-100 py-4 font-semibold text-slate-900">{l.admission}</h3><div className="divide-y divide-slate-100">{other.map(row)}</div></section>}
  </div>;
}
