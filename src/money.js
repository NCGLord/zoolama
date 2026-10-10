// Money is always integer cents — never floats — so totals add up exactly.

import { LOCALES } from './i18n.js';

/**
 * Parse a price typed by hand into cents. Accepts "8,99", "8.99", "R$ 1.299,90", "1,299.90".
 * The last separator is the decimal one, except that a lone separator followed by exactly
 * three digits is thousands grouping ("1.299" → R$ 1.299,00), as prices never carry 3 decimals.
 * Returns null for anything that is not a positive amount.
 */
export function parseMoney(input) {
  const s = String(input ?? '').replace(/R\$|\s/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = s;
  let frac = '';
  if (lastSep !== -1) {
    const head = s.slice(0, lastSep);
    const tail = s.slice(lastSep + 1);
    const mixed = s.includes(',') && s.includes('.');
    const grouping = !mixed && tail.length === 3 && /[1-9]/.test(head);
    if (!grouping) {
      intPart = head;
      frac = tail;
    }
  }
  if (frac.length > 2) return null;

  const cents = Number(intPart.replace(/[.,]/g, '') || '0') * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

const TILL_DIGITS = 8; // R$ 999.999,99: past any shelf price or budget

/**
 * A money field's text read the way a till reads its keys: every digit typed, the last two being the cents ("899" →
 * R$ 8,99), and the field's own formatting read back unchanged ("1.299,90" → R$ 1.299,90). Leading zeros don't count,
 * and a digit past eight is ignored, as a till ignores a key past its display. Returns 0 when there are no digits.
 */
export function tillCents(input) {
  const digits = String(input ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
    .slice(0, TILL_DIGITS);
  return Number(digits);
}

const currencyFormat = (lang) =>
  new Intl.NumberFormat(LOCALES[lang] ?? LOCALES.pt, { style: 'currency', currency: 'BRL' });

export function formatMoney(cents, lang) {
  return currencyFormat(lang).format(cents / 100);
}

/** The pieces of a formatted amount, so a shelf tag can set the cents small and raised. */
export function formatMoneyParts(cents, lang) {
  const out = { currency: '', whole: '', decimal: '', fraction: '' };
  for (const { type, value } of currencyFormat(lang).formatToParts(cents / 100)) {
    if (type === 'currency') out.currency = value;
    else if (type === 'integer' || type === 'group' || type === 'minusSign') out.whole += value;
    else if (type === 'decimal') out.decimal = value;
    else if (type === 'fraction') out.fraction = value;
  }
  return out;
}
