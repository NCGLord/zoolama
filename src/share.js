// Plain text for sharing a cart or a past trip: reads well in WhatsApp, SMS or e-mail, in the app's language.

import { formatMoney } from './money.js';
import { t, formatKg } from './i18n.js';

export function shareText(items, { lang, title }) {
  const money = (cents) => formatMoney(cents, lang);
  const lines = items.map((item, i) => {
    const name = item.name || t('itemN', lang, { n: i + 1 });
    const lineTotal = money(item.priceCents * item.qty);
    if (item.perKgCents) return `- ${name}: ${formatKg(item.grams, lang)} × ${money(item.perKgCents)}/kg = ${lineTotal}`;
    if (item.qty > 1) return `- ${name}: ${item.qty} × ${money(item.priceCents)} = ${lineTotal}`;
    return `- ${name}: ${lineTotal}`;
  });
  const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
  const units = items.reduce((n, i) => n + i.qty, 0);
  return [title, ...lines, t('shareTotal', lang, { total: money(totalCents), n: units })].join('\n');
}
