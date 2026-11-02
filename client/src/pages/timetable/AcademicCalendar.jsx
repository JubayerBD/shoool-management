import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const input = 'w-full rounded-lg border border-slate-300 p-2';
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
export default function AcademicCalendar() {
  const { i18n } = useTranslation(), bn = i18n.language.startsWith('bn'), tr = (en, bangla) => bn ? bangla : en;
  const { user } = useAuth(), admin = user.role === 'admin';
  const [month, setMonth] = useState(today().slice(0,7)), [data, setData] = useState(null), [error, setError] = useState('');
  const [form, setForm] = useState(null), [busy, setBusy] = useState(false);
  async function load() {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    try {
      const last = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).getUTCDate();
      setData((await api.get('/calendar', { params: { from: `${month}-01`, to: `${month}-${last}` } })).data); setError('');
    } catch (err) { setError(err.response?.data?.error?.message || err.message); }
  }
  useEffect(() => { setData(null); load(); }, [month]);
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (form.key) await api.put(`/calendar/events/${form.key}`, form);
      else await api.post('/calendar/events', form);
      setForm(null); await load();
    } catch(err) { setError(err.response?.data?.error?.message || err.message); }
    finally { setBusy(false); }
  }
  async function remove(event) {
    if (!window.confirm(tr(`Remove “${event.title}” from the school calendar?`, `“${event.title}” শিক্ষাপঞ্জি থেকে সরাবেন?`))) return;
    setBusy(true);
    try { await api.delete(`/calendar/events/${event.key}`); await load(); }
    catch(err) { setError(err.response?.data?.error?.message || err.message); }
    finally { setBusy(false); }
  }
  const set = (key,value) => setForm((old) => ({...old,[key]:value}));
  const offset = data?.days.length ? new Date(`${data.days[0].date}T12:00:00Z`).getUTCDay() : 0;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{tr('Academic calendar', 'শিক্ষাপঞ্জি')}</h1>{admin && <button className={button} onClick={() => setForm({ title:'', start:`${month}-01`, end:`${month}-01`, kind:'vacation', closed:true, note:'' })}>{tr('+ Add event / holiday', '+ অনুষ্ঠান / ছুটি যোগ করুন')}</button>}</div>
    <div className="flex flex-wrap items-center gap-4"><label className="text-sm">{tr('Month', 'মাস')}<input className={`${input} mt-1`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label><p className="text-sm text-slate-500">{tr('Weekly holiday: Friday. Saturday is a school day.', 'সাপ্তাহিক ছুটি: শুক্রবার। শনিবার কর্মদিবস।')}</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {data && !data.governmentYears.includes(Number(month.slice(0,4))) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{tr('Government holidays for this year have not been loaded. Friday weekends and school events still apply. Admins can add dates from the official annual notice.', 'এই বছরের সরকারি ছুটির তালিকা যোগ করা হয়নি। শুক্রবার ও বিদ্যালয়ের অনুষ্ঠান প্রযোজ্য। প্রশাসক সরকারি বিজ্ঞপ্তি অনুযায়ী ছুটি যোগ করতে পারবেন।')}</p>}
    {!data && !error && <p role="status">{tr('Loading…','লোড হচ্ছে…')}</p>}
    {data && <><div className="overflow-x-auto rounded-xl border bg-white"><div className="grid min-w-[700px] grid-cols-7">
      {[0,1,2,3,4,5,6].map((d) => <div key={d} className={`border-b p-3 text-center text-sm font-semibold ${d === 5 ? 'text-rose-600' : ''}`}>{new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{weekday:'short', timeZone:'UTC'}).format(new Date(Date.UTC(2026,10,1+d)))}</div>)}
      {Array.from({length:offset},(_,i) => <div key={`empty-${i}`} className="border-b bg-slate-50" />)}
      {data.days.map((day) => <div key={day.date} className={`min-h-28 border-b border-r p-2 ${day.closed ? 'bg-rose-50' : ''} ${day.date === today() ? 'ring-2 ring-inset ring-brand-500' : ''}`}><p className="font-semibold">{Number(day.date.slice(-2))}</p>{day.weekend && <p className="mt-1 text-xs text-rose-600">{tr('Weekend','সাপ্তাহিক ছুটি')}</p>}{day.events.map((event) => <p key={event.key} className={`mt-1 rounded px-1 py-1 text-xs ${event.closed?'bg-rose-100 text-rose-800':'bg-blue-100 text-blue-800'}`}>{event.title}</p>)}</div>)}
    </div></div>
    <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">{tr('Holidays and events this month','এই মাসের ছুটি ও অনুষ্ঠান')}</h2>{!data.events.length && <p className="text-sm text-slate-500">{tr('No additional events. Friday weekends still apply.','অতিরিক্ত অনুষ্ঠান নেই। শুক্রবার ছুটি প্রযোজ্য।')}</p>}<div className="divide-y">{data.events.map((event) => <div key={event.key} className="flex flex-wrap items-start justify-between gap-3 py-3"><div><p className="font-medium">{event.title} <span className="text-xs font-normal text-slate-500">· {event.kind} · {event.closed ? tr('School closed','বিদ্যালয় বন্ধ') : tr('School open','বিদ্যালয় খোলা')}</span></p><p className="text-sm text-slate-500">{event.start}{event.end !== event.start && ` → ${event.end}`}</p>{event.note && <p className="mt-1 text-xs text-slate-500">{event.note}</p>}{event.source && <a className="text-xs text-brand-600" href={event.source} target="_blank" rel="noreferrer">{tr('Government source','সরকারি সূত্র')}</a>}</div>{admin && <div className="flex gap-3 text-sm"><button disabled={busy} className="text-brand-600" onClick={() => setForm({...event})}>{tr('Edit','সম্পাদনা')}</button><button disabled={busy} className="text-red-600" onClick={() => remove(event)}>{tr('Remove','সরান')}</button></div>}</div>)}</div><p className="mt-3 text-xs text-slate-500">{tr('Includes the 2026 general/executive holiday gazette and the November 7 notification. Later announcements and school-specific vacations can be added by an admin. Moon-dependent dates may change.','২০২৬ সালের সাধারণ ও নির্বাহী ছুটি এবং ৭ নভেম্বরের বিজ্ঞপ্তি অন্তর্ভুক্ত। পরবর্তী ঘোষণা ও বিদ্যালয়ের ছুটি প্রশাসক যোগ করতে পারবেন। চাঁদ দেখার ওপর নির্ভরশীল তারিখ পরিবর্তন হতে পারে।')}</p></section></>}
    <Modal open={!!form} onClose={() => !busy && setForm(null)} title={tr('Calendar event','শিক্ষাপঞ্জির অনুষ্ঠান')}>
      {form && <form onSubmit={save} className="space-y-3"><label className="block text-sm">{tr('Title','শিরোনাম')}<input required maxLength={200} className={input} value={form.title} onChange={(e) => set('title',e.target.value)} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">{tr('Start date','শুরুর তারিখ')}<input type="date" required className={input} value={form.start} onChange={(e) => set('start',e.target.value)} /></label><label className="text-sm">{tr('End date','শেষ তারিখ')}<input type="date" required min={form.start} className={input} value={form.end} onChange={(e) => set('end',e.target.value)} /></label></div><label className="block text-sm">{tr('Type','ধরন')}<select className={input} value={form.kind} onChange={(e) => set('kind',e.target.value)}>{['government','vacation','exam','event'].map((kind) => <option key={kind}>{kind}</option>)}</select></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.closed} onChange={(e) => set('closed',e.target.checked)} />{tr('School closed — pause scheduled classes','বিদ্যালয় বন্ধ — নির্ধারিত ক্লাস স্থগিত')}</label><label className="block text-sm">{tr('Note','মন্তব্য')}<textarea maxLength={2000} className={input} value={form.note} onChange={(e) => set('note',e.target.value)} /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button className={button} disabled={busy}>{busy?tr('Saving…','সংরক্ষণ হচ্ছে…'):tr('Save','সংরক্ষণ')}</button></form>}
    </Modal>
  </div>;
}
