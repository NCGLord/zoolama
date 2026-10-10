// Money fields (marked data-money) fill in like a till: digits only, each shifting in from the right, the last two
// being the cents (8 → 0,08, 89 → 0,89, 899 → 8,99). The field is rewritten in the capture phase, before any view's
// own listener runs, so every reader sees the formatted amount and keeps reading it with parseMoney.

import { parseMoney, tillCents } from '../money.js';
import { bareMoney } from './text.js';

const isMoneyField = (el) => el?.matches?.('input[data-money]') ?? false;

document.addEventListener(
  'input',
  (e) => {
    if (!isMoneyField(e.target)) return;
    const cents = tillCents(e.target.value);
    const text = cents ? bareMoney(cents) : ''; // none: the 0,00 placeholder shows
    if (e.target.value !== text) e.target.value = text; // the caret goes to the end, where a till keeps it
  },
  true,
);

// A pasted price is read as written, not digit by digit: "R$ 8,9" is R$ 8,90, not R$ 0,89. It replaces the field.
document.addEventListener(
  'paste',
  (e) => {
    if (!isMoneyField(e.target)) return;
    e.preventDefault();
    const cents = parseMoney(e.clipboardData?.getData('text') ?? '');
    if (cents === null) return;
    e.target.value = bareMoney(cents);
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
  },
  true,
);
