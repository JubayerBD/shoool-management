// Spell out a taka amount using the Bangladeshi crore/lakh/thousand grouping.

const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// Bengali numerals 0–99 are irregular, so they are listed in full.
const BN_0_99 = ('শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ '
  + 'বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আটাশ উনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ উনচল্লিশ '
  + 'চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ উনপঞ্চাশ পঞ্চাশ একান্ন বায়ান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন উনষাট '
  + 'ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি উনসত্তর সত্তর একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর উনআশি '
  + 'আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি উননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই').split(' ');

const EN = {
  small: (n) => (n < 20 ? EN_ONES[n] : `${EN_TENS[Math.floor(n / 10)]}${n % 10 ? ` ${EN_ONES[n % 10]}` : ''}`),
  hundred: 'Hundred', thousand: 'Thousand', lakh: 'Lakh', crore: 'Crore',
};
const BN = {
  small: (n) => BN_0_99[n],
  hundred: 'শত', thousand: 'হাজার', lakh: 'লক্ষ', crore: 'কোটি',
};

function spell(n, w) {
  if (n === 0) return '';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const hundred = Math.floor((n % 1e3) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${spell(crore, w)} ${w.crore}`);
  if (lakh) parts.push(`${w.small(lakh)} ${w.lakh}`);
  if (thousand) parts.push(`${w.small(thousand)} ${w.thousand}`);
  if (hundred) parts.push(w === BN ? `${w.small(hundred)}${w.hundred}` : `${w.small(hundred)} ${w.hundred}`);
  if (rest) parts.push(w.small(rest));
  return parts.join(' ');
}

/** e.g. 1500.5 → "Taka One Thousand Five Hundred and Fifty Paisa Only" / "এক হাজার পাঁচশত টাকা পঞ্চাশ পয়সা মাত্র". */
export function amountInWords(amount, lang = 'en') {
  const value = Math.abs(Number(amount) || 0);
  let taka = Math.floor(value);
  let paisa = Math.round((value - taka) * 100);
  if (paisa === 100) { taka += 1; paisa = 0; }
  if (lang === 'bn') {
    const main = taka ? `${spell(taka, BN)} টাকা` : paisa ? '' : 'শূন্য টাকা';
    return [main, paisa ? `${spell(paisa, BN)} পয়সা` : '', 'মাত্র'].filter(Boolean).join(' ');
  }
  const main = taka ? spell(taka, EN) : paisa ? '' : 'Zero';
  return ['Taka', main, paisa ? `${main ? 'and ' : ''}${spell(paisa, EN)} Paisa` : '', 'Only'].filter(Boolean).join(' ');
}
