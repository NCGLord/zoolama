// Money and weight fields fill in like a till: digits only, each shifting in from the right. A money field (data-money)
// keeps the last two as the cents (8 → 0,08, 899 → 8,99); a weight field (data-kg) the last three as the grams, the
// way scale labels print kg (1250 → 1,250). The field is rewritten in the capture phase, before any view's own listener
// runs, so every reader sees the formatted amount and keeps reading it with parseMoney or parseGrams.

import { parseMoney, tillCents } from '../money.js';
import { parseGrams, tillGrams } from '../units.js';
import { bareKg, bareMoney } from './text.js';

const MONEY = { till: tillCents, parse: parseMoney, bare: bareMoney };
const KG = { till: tillGrams, parse: parseGrams, bare: bareKg };

function kindOf(el) {
  if (el?.matches?.('input[data-money]')) return MONEY;
  if (el?.matches?.('input[data-kg]')) return KG;
  return null;
}

document.addEventListener(
  'input',
  (e) => {
    const kind = kindOf(e.target);
    if (!kind) return;
    const amount = kind.till(e.target.value);
    const text = amount ? kind.bare(amount) : ''; // none: the 0,00 placeholder shows
    if (e.target.value !== text) e.target.value = text; // the caret goes to the end, where a till keeps it
  },
  true,
);

// A pasted amount is read as written, not digit by digit: "R$ 8,9" is R$ 8,90, not R$ 0,89. It replaces the field.
document.addEventListener(
  'paste',
  (e) => {
    const kind = kindOf(e.target);
    if (!kind) return;
    e.preventDefault();
    const amount = kind.parse(e.clipboardData?.getData('text') ?? '');
    if (amount === null) return;
    e.target.value = kind.bare(amount);
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
  },
  true,
);
