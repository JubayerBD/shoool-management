import { ApiError } from './ApiError.js';

export function moneyCents(raw) {
  if (!['number', 'string'].includes(typeof raw) || !String(raw).trim()) throw ApiError.badRequest('Enter a valid amount');
  const amount = Number(raw);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(cents) || cents > 1e12 || Math.abs(amount * 100 - cents) > 1e-6) {
    throw ApiError.badRequest('Amount must be positive, at most 10 billion, with at most 2 decimal places');
  }
  return cents;
}

// Largest remainder allocation keeps the sum of rounded shares equal to the profit.
export function capitalShares(partners, profitCents = 0) {
  const total = partners.reduce((sum, p) => sum + BigInt(p.capitalCents), 0n);
  const shares = partners.map((p) => {
    const product = BigInt(profitCents) * BigInt(p.capitalCents);
    return { ...p, percentage: total ? Number(BigInt(p.capitalCents) * 100000000n / total) / 1000000 : 0,
      profitCents: total ? Number(product / total) : 0, remainder: total ? product % total : 0n };
  });
  let remaining = total ? profitCents - shares.reduce((sum, p) => sum + p.profitCents, 0) : 0;
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? String(a.id).localeCompare(String(b.id)) : a.remainder > b.remainder ? -1 : 1);
  for (const p of ranked) { if (remaining-- <= 0) break; p.profitCents += 1; }
  return { totalCapital: Number(total) / 100, items: shares.map(({ remainder, capitalCents, profitCents: profit, ...p }) => ({ ...p, capital: capitalCents / 100, profit: profit / 100 })) };
}
