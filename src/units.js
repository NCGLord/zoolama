// Package sizes normalized to one base unit per dimension, so R$/kg vs R$/kg is apples to apples.
// Divisors (not 0.001 multipliers) keep results like 350 g → 0.35 kg exact in binary floating point.
// grouping: packs print these as whole numbers with thousands grouping ("1.000 g"); kg and L print decimals.

export const UNITS = {
  g: { dim: 'mass', per: 1000, grouping: true },
  kg: { dim: 'mass', per: 1 },
  ml: { dim: 'volume', per: 1000, grouping: true },
  L: { dim: 'volume', per: 1 },
  un: { dim: 'count', per: 1, grouping: true },
};

export const BASE_UNIT = { mass: 'kg', volume: 'L', count: 'un' };

/**
 * Parse a typed quantity ("0,350", "1.5", "350"). The last separator is the decimal one. With `grouping`, a lone
 * separator followed by exactly three digits groups thousands instead ("1.000" → 1000), the same rule as parseMoney
 * in money.js; without it, three decimals stay decimals, the way scale labels print kg ("1,250" → 1.25).
 */
export function parseQuantity(input, { grouping = false } = {}) {
  const s = String(input ?? '').replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let normalized = s;
  if (lastSep !== -1) {
    const head = s.slice(0, lastSep);
    const tail = s.slice(lastSep + 1);
    const mixed = s.includes(',') && s.includes('.');
    const grouped = grouping && !mixed && tail.length === 3 && /[1-9]/.test(head);
    normalized = grouped ? s.replace(/[.,]/g, '') : `${head.replace(/[.,]/g, '')}.${tail}`;
  }
  const qty = Number(normalized);
  return Number.isFinite(qty) && qty > 0 ? qty : null;
}

export function toBase(qty, unit) {
  const u = UNITS[unit];
  return u ? { dim: u.dim, qty: qty / u.per } : null;
}

/** A weight typed in kg ("1,250", "0,35") as whole grams; null unless it is at least one gram. */
export function parseGrams(input) {
  const kg = parseQuantity(input);
  const grams = kg === null ? 0 : Math.round(kg * 1000);
  return grams >= 1 ? grams : null;
}
