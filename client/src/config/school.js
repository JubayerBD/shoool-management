/**
 * Institution identity printed on every invoice, receipt, voucher and slip.
 * Leave a field empty ('') to hide it from the letterhead.
 *
 * Logo: drop a square PNG at client/public/school-logo.png. Until it exists the
 * letterhead shows a monogram badge instead.
 */
export const SCHOOL = {
  name: { en: 'Singair Model Alia Madrasa', bn: 'সিংগাইর মডেল আলিয়া মাদ্রাসা' },
  address: { en: 'Singair, Manikganj', bn: 'সিংগাইর, মানিকগঞ্জ' },
  phone: '',
  email: '',
  eiin: '',
  established: '',
  monogram: 'SMAM',
  logo: `${import.meta.env.BASE_URL}school-logo.png`,
};
