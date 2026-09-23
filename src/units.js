// Package sizes normalized to one base unit per dimension, so R$/kg vs R$/kg is apples to apples.
// Divisors (not 0.001 multipliers) keep results like 350 g → 0.35 kg exact in binary floating point.

export const UNITS = {
  g: { dim: 'mass', per: 1000 },
  kg: { dim: 'mass', per: 1 },
  ml: { dim: 'volume', per: 1000 },
  L: { dim: 'volume', per: 1 },
  un: { dim: 'count', per: 1 },
};

export const BASE_UNIT = { mass: 'kg', volume: 'L', count: 'un' };

/** Parse a typed quantity ("0,350", "1.5", "350"). The last separator is always the decimal one. */
export function parseQuantity(input) {
  const s = String(input ?? '').replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const normalized =
    lastSep === -1 ? s : `${s.slice(0, lastSep).replace(/[.,]/g, '')}.${s.slice(lastSep + 1)}`;
  const qty = Number(normalized);
  return Number.isFinite(qty) && qty > 0 ? qty : null;
}

export function toBase(qty, unit) {
  const u = UNITS[unit];
  return u ? { dim: u.dim, qty: qty / u.per } : null;
}
