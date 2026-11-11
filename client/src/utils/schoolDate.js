export function schoolDate(date = new Date()) {
  if (date === null || date === '') return '—';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(date));
}
