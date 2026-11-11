const round = n => Math.round((Number(n) || 0) * 100) / 100;
const normalizeDigits = text => text.replace(/[০-৯]/g, char => String('০১২৩৪৫৬৭৮৯'.indexOf(char)));
const monthNames = [
  ['january','jan','জানুয়ারি','জানুয়ারি'],['february','feb','ফেব্রুয়ারি','ফেব্রুয়ারি'],['march','mar','মার্চ'],
  ['april','apr','এপ্রিল'],['may','মে'],['june','jun','জুন'],['july','jul','জুলাই'],
  ['august','aug','আগস্ট','আগষ্ট'],['september','sep','sept','সেপ্টেম্বর'],['october','oct','অক্টোবর','অক্টবর'],
  ['november','nov','নভেম্বর'],['december','dec','ডিসেম্বর'],
];

export function feeMonth(bill) {
  const titles = (bill.items || []).map(i => `${i.title?.en || ''} ${i.title?.bn || ''}`);
  if (titles.length && titles.every(t => /admission|ভর্তি|session|সেশন|registration|নিবন্ধন/i.test(t))) return null;
  for (const raw of [bill.period?.en, bill.period?.bn, bill.billingDate]) {
    if (!raw) continue;
    const text = normalizeDigits(String(raw)).toLowerCase();
    const iso = text.match(/(?:^|\s)(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?(?:$|\s|t)/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const year = text.match(/\b(\d{4})\b/);
    if (!year) continue;
    const month = monthNames.findIndex(names => names.some(name => /[a-z]/.test(name)
      ? new RegExp(`\\b${name}\\b`).test(text) : text.includes(name)));
    if (month >= 0) return `${year[1]}-${String(month + 1).padStart(2, '0')}`;
  }
  // Collection and due dates are not assumed to identify the fee month.
  return null;
}

export function outstanding(bill) {
  return bill.scheduled || bill.status === 'cancelled' ? 0 : round(Math.max(0, Number(bill.totalAmount || 0) - Number(bill.waivedAmount || 0) - Number(bill.paidAmount || 0)));
}

export function monthSummary(bills, today) {
  const actual = bills.filter(b => !b.scheduled && b.status !== 'cancelled');
  const scheduled = bills.filter(b => b.scheduled);
  const paid = round(actual.reduce((s,b) => s + Number(b.paidAmount || 0), 0));
  const due = round(actual.reduce((s,b) => s + outstanding(b), 0));
  const expected = round(scheduled.reduce((s,b) => s + Number(b.totalAmount || 0), 0));
  const historical = actual.length > 0 && actual.every(b => b.historicalImport);
  const overdue = actual.some(b => outstanding(b) > 0 && b.dueDate && new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(b.dueDate)) < today);
  const state = overdue ? 'overdue' : due > 0 ? (paid > 0 ? 'partial' : 'due') : actual.length ? (historical ? 'recorded' : paid > 0 ? 'paid' : 'settled') : scheduled.length ? 'scheduled' : bills.length ? 'cancelled' : 'empty';
  return { state, actual, scheduled, paid, due, expected, historical };
}

export function feeCalendar(invoices, upcoming, year, today) {
  const all = [...invoices, ...upcoming];
  return Array.from({ length:12 }, (_, index) => {
    const period = `${year}-${String(index + 1).padStart(2,'0')}`;
    const bills = all.filter(b => feeMonth(b) === period);
    return { index, period, bills, ...monthSummary(bills, today) };
  });
}
