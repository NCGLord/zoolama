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

export function formatMoney(cents, lang) {
  return new Intl.NumberFormat(LOCALES[lang] ?? LOCALES.pt, {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}
