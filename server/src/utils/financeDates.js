import { ApiError } from './ApiError.js';

// School accounting dates consistently use Bangladesh time, including on UTC hosts.
export function schoolDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function parseDay(value, end = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw ApiError.badRequest('Dates must use YYYY-MM-DD');
  }
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+06:00`);
  if (!Number.isFinite(+date) || schoolDate(date) !== value) throw ApiError.badRequest('Invalid date');
  return date;
}

export function rangeFilter(field, from, to) {
  const range = {};
  if (from) range.$gte = parseDay(from);
  if (to) range.$lte = parseDay(to, true);
  if (from && to && from > to) throw ApiError.badRequest('From date must not be after to date');
  return Object.keys(range).length ? { [field]: range } : {};
}

export function addMonths(day, count) {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + count, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.toISOString().slice(0, 7)}-${String(Math.min(date, last)).padStart(2, '0')}`;
}
