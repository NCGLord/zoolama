// Finished shopping trips. A trip keeps what was bought (names, prices, quantities, weights) and what it cost,
// but not the photos, which are large and whose job ends at the till.

import { total, counts, checkSummary } from './cart.js';

export function tripFromCart(cart, { id, at, store = '' }) {
  const { overchargeCents } = checkSummary(cart);
  return {
    id,
    at,
    store: store.trim(),
    items: cart.items.map(({ name, priceCents, qty, perKgCents, grams }) => ({
      name,
      priceCents,
      qty,
      ...(perKgCents ? { perKgCents, grams } : {}),
    })),
    totalCents: total(cart),
    units: counts(cart).units,
    ...(overchargeCents ? { overchargeCents } : {}),
  };
}

/** Trips grouped by the phone's local month, newest month and newest trip first. month is 0-based, like Date. */
export function monthlyGroups(trips) {
  const groups = new Map();
  for (const trip of [...trips].sort((a, b) => b.at - a.at)) {
    const d = new Date(trip.at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups.has(key)) groups.set(key, { year: d.getFullYear(), month: d.getMonth(), totalCents: 0, trips: [] });
    const group = groups.get(key);
    group.totalCents += trip.totalCents;
    group.trips.push(trip);
  }
  return [...groups.values()];
}

/** Store names to suggest, each once, most recently used first. */
export function storeNames(trips) {
  const names = [...trips].sort((a, b) => b.at - a.at).map((t) => t.store).filter(Boolean);
  return [...new Set(names)];
}
