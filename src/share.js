// A line's arithmetic, and plain text for sharing a cart or a past trip: reads well in WhatsApp, SMS or e-mail, in
// the app's language. The cart, History and shared text all write a line the same way.

import { formatMoney } from './money.js';
import { lineTotal, total, counts, unitCents } from './cart.js';
import { t, formatKg } from './i18n.js';

/** "R$ 4,50 × 2"; at an atacado price "R$ 4,99 × 6 (atacado)"; weighed "R$ 7,99/kg × 1,250 kg". */
export function lineEach(item, lang) {
  if (item.perKgCents) return `${formatMoney(item.perKgCents, lang)}/kg × ${formatKg(item.grams, lang)}`;
  const each = unitCents(item);
  const offer = each !== item.priceCents ? ` (${t('dealTier', lang)})` : '';
  return `${formatMoney(each, lang)} × ${item.qty}${offer}`;
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
