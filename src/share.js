// Plain text for sharing a cart or a past trip: reads well in WhatsApp, SMS or e-mail, in the app's language.

import { formatMoney } from './money.js';
import { lineTotal, total, counts } from './cart.js';
import { t, formatKg } from './i18n.js';

export function shareText(items, { lang, title }) {
  const money = (cents) => formatMoney(cents, lang);
  const lines = items.map((item, i) => {
    const name = item.name || t('itemN', lang, { n: i + 1 });
    const sub = money(lineTotal(item));
    if (item.perKgCents) return `- ${name}: ${formatKg(item.grams, lang)} × ${money(item.perKgCents)}/kg = ${sub}`;
    if (item.qty > 1) return `- ${name}: ${item.qty} × ${money(item.priceCents)} = ${sub}`;
    return `- ${name}: ${sub}`;
  });
  const cart = { items };
  return [title, ...lines, t('shareTotal', lang, { total: money(total(cart)), n: counts(cart).units })].join('\n');
}
