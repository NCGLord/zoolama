import { parseMoney } from './money.js';
import { UNITS, parseQuantity, toBase } from './units.js';

// Relative slack so float noise (e.g. 1/3-ish quotients) never splits a genuine tie.
const TIE_EPSILON = 1e-9;

/**
 * Rank price options by cost per base unit (R$/kg, R$/L, R$/un).
 * Takes the raw typed strings `{price, qty, unit}` and returns one result slot per option:
 * null when the option is incomplete, else `{unitPrice, isCheapest, pctMore}` where
 * unitPrice is in cents per base unit and pctMore is how much dearer than the cheapest (%).
 * Ranking needs at least two valid options of the same dimension; mixed dimensions → 'mixedUnits'.
 */
export function compare(options) {
  const parsed = options.map(({ price, qty, unit }) => {
    const cents = parseMoney(price);
    const amount = parseQuantity(qty, { grouping: UNITS[unit]?.grouping });
    const base = amount === null ? null : toBase(amount, unit);
    return cents === null || base === null ? null : { dim: base.dim, unitPrice: cents / base.qty };
  });

  const valid = parsed.filter(Boolean);
  const dims = new Set(valid.map((p) => p.dim));
  const error = dims.size > 1 ? 'mixedUnits' : null;
  const ranked = !error && valid.length >= 2;
  const min = Math.min(...valid.map((p) => p.unitPrice));

  const results = parsed.map((p) => {
    if (!p) return null;
    if (!ranked) return { unitPrice: p.unitPrice, isCheapest: false, pctMore: null };
    const isCheapest = p.unitPrice <= min * (1 + TIE_EPSILON);
    return { unitPrice: p.unitPrice, isCheapest, pctMore: isCheapest ? 0 : (p.unitPrice / min - 1) * 100 };
  });

  return { dim: dims.size === 1 ? [...dims][0] : null, error, results };
}
