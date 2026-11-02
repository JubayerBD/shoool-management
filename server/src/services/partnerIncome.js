import { PartnerDeposit } from '../models/Partner.js';

export const PARTNER_INCOME_CATEGORY = {
  id: 'partner-investment', type: 'income', isActive: true,
  name: { en: 'Partner investment', bn: 'অংশীদারের বিনিয়োগ' },
};

// Read deposits directly so existing deposits and retries count exactly once.
export async function partnerIncome(range = {}) {
  const deposits = await PartnerDeposit.find(range).populate('partner', 'name');
  return deposits.map((d) => ({
    id: d.id, date: d.date, amount: d.amountCents / 100,
    category: PARTNER_INCOME_CATEGORY, source: d.partner?.name || 'Partner',
    partner: String(d.partner?._id || ''), partnerDeposit: d.id,
    isReversed: d.isReversed === true,
    method: '', reference: '', note: d.note, recordedBy: d.recordedBy,
  }));
}
