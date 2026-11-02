import mongoose from 'mongoose';
import { parseDay, schoolDate } from '../utils/financeDates.js';
import { ApiError } from '../utils/ApiError.js';

export const HOLIDAY_SOURCE = 'https://mopa.gov.bd/pages/public-holiday';
export const CalendarEvent = mongoose.model('CalendarEvent', new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true, maxlength: 200 },
  start: { type: String, required: true }, end: { type: String, required: true },
  closed: { type: Boolean, default: true }, disabled: { type: Boolean, default: false },
  kind: { type: String, enum: ['government', 'vacation', 'exam', 'event'], default: 'event' },
  note: { type: String, maxlength: 2000, default: '' },
}, { timestamps: true }));

// General and executive-order holidays in the 9 November 2025 gazette.
// Optional/restricted regional holidays are not school-wide closures.
const annual2026 = [
  ['02-04', 'Shab-e-Barat', true], ['02-21', 'Language Martyrs’ Day'],
  ['03-17', 'Shab-e-Qadr', true], ['03-19', 'Eid-ul-Fitr holiday', true, '03-23'],
  ['03-20', 'Jumatul Bida'], ['03-26', 'Independence and National Day'],
  ['04-14', 'Bangla New Year'], ['05-01', 'May Day'], ['05-01', 'Buddha Purnima', true],
  ['05-26', 'Eid-ul-Adha holiday', true, '05-31'], ['06-26', 'Ashura', true],
  ['08-05', 'July Mass Uprising Day'], ['08-26', 'Eid-e-Miladunnabi', true],
  ['09-04', 'Janmashtami'], ['10-20', 'Durga Puja', false, '10-21'],
  ['12-16', 'Victory Day'], ['12-25', 'Christmas Day'],
];
export const governmentHolidays = annual2026.map(([date, title, lunar, end], i) => ({ key: `bd-2026-${i}`, title, start: `2026-${date}`, end: `2026-${end || date}`, closed: true, kind: 'government', source: HOLIDAY_SOURCE, note: lunar ? 'Gazetted date; subject to moon sighting and later government notices.' : '2026 government holiday gazette.' }));
governmentHolidays.push({ key: 'bd-2026-nov7', title: 'National Revolution and Solidarity Day', start: '2026-11-07', end: '2026-11-07', closed: true, kind: 'government', source: 'https://www.bb.org.bd/mediaroom/circulars/fid/oct262026fcrpdl18.pdf', note: 'Additional government notification, October 2026.' });

export async function calendarRange(from, to) {
  const first = parseDay(from), last = parseDay(to);
  const length = Math.round((last - first) / 86400000) + 1;
  if (length < 1 || length > 366) throw ApiError.badRequest('Choose a date range of up to 366 days');
  const overrides = await CalendarEvent.find().lean();
  const map = new Map(governmentHolidays.map((event) => [event.key, event]));
  for (const event of overrides) map.set(event.key, { ...map.get(event.key), ...event });
  const events = [...map.values()].filter((e) => !e.disabled && e.start <= to && e.end >= from).sort((a,b) => a.start.localeCompare(b.start));
  const days = [];
  for (let i = 0; i < length; i++) {
    const date = schoolDate(new Date(first.getTime() + i * 86400000));
    const weekend = new Date(`${date}T12:00:00+06:00`).getUTCDay() === 5;
    const entries = events.filter((event) => event.start <= date && event.end >= date);
    days.push({ date, weekend, closed: weekend || entries.some((e) => e.closed), events: entries });
  }
  return { days, events, weekendDays: [5], governmentYears: [2026], source: HOLIDAY_SOURCE };
}
