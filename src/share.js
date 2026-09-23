// A line's arithmetic, and plain text for sharing a cart or a past trip: reads well in WhatsApp, SMS or e-mail, in
// the app's language. The cart, History and shared text all write a line the same way.

import { formatMoney } from './money.js';
import { lineTotal, total, counts } from './cart.js';
import { t, formatKg } from './i18n.js';

/** "R$ 4,50 × 2", or for a weighed item "R$ 7,99/kg × 1,250 kg". */
export function lineEach(item, lang) {
  return item.perKgCents
    ? `${formatMoney(item.perKgCents, lang)}/kg × ${formatKg(item.grams, lang)}`
    : `${formatMoney(item.priceCents, lang)} × ${item.qty}`;
}

export function shareText(items, { lang, title }) {
  const lines = items.map((item, i) => {
    const name = item.name || t('itemN', lang, { n: i + 1 });
    const sub = formatMoney(lineTotal(item), lang);
    // A single unit needs no "× 1".
    return item.perKgCents || item.qty > 1 ? `- ${name}: ${lineEach(item, lang)} = ${sub}` : `- ${name}: ${sub}`;
  });
  const cart = { items };
  return [title, ...lines, t('shareTotal', lang, { total: formatMoney(total(cart), lang), n: counts(cart).units })].join('\n');
}
