// Finished shopping trips. A trip keeps what was bought (names, prices, quantities, weights) and what it cost,
// but not the photos, which are large and whose job ends at the till.

import { total, counts, checkSummary, validDeal } from './cart.js';

export function tripFromCart(cart, { id, at, store = '' }) {
  const { overchargeCents } = checkSummary(cart);
  return {
    id,
    at,
    store: store.trim(),
    items: cart.items.map(({ name, priceCents, qty, perKgCents, grams, deal }) => ({
      name,
      priceCents,
      qty,
      ...(perKgCents ? { perKgCents, grams } : {}),
      ...(deal ? { deal } : {}), // it changes what the line cost
    })),
    totalCents: total(cart),
    units: counts(cart).units,
    ...(overchargeCents ? { overchargeCents } : {}),
    ...(cart.receiptCents ? { receiptCents: cart.receiptCents } : {}),
  };
}

const isPositive = (n) => Number.isSafeInteger(n) && n > 0;
const isCount = (n) => Number.isSafeInteger(n) && n >= 0;

function isTripItem(item) {
  if (typeof item?.name !== 'string' || !isPositive(item.priceCents) || !isPositive(item.qty)) return false;
  const weighed = item.perKgCents !== undefined || item.grams !== undefined;
  if (item.deal !== undefined && (weighed || !validDeal(item.deal, item.priceCents))) return false;
  return !weighed || (isPositive(item.perKgCents) && isPositive(item.grams));
}

/** Whether a stored trip has the shape tripFromCart builds, so History can show and share it. */
export function isTrip(trip) {
  return (
    typeof trip?.id === 'string' &&
    trip.id !== '' &&
    Number.isFinite(trip.at) &&
    typeof trip.store === 'string' &&
    Array.isArray(trip.items) &&
    trip.items.every(isTripItem) &&
    isCount(trip.totalCents) &&
    isCount(trip.units) &&
    (trip.overchargeCents === undefined || isPositive(trip.overchargeCents)) &&
    (trip.receiptCents === undefined || isPositive(trip.receiptCents))
  );
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

/* ---------- price memory: what an item cost last time ---------- */

/** A name as a lookup key: case, accents and spacing don't matter ("Açúcar " and "acucar" are one item). */
export function nameKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The last price paid for each named item: Map<nameKey, {unit?, weight?}>. `unit` is {name, at, store, priceCents}
 * (the price of one), `weight` is {name, at, store, perKgCents}; a name bought both ways keeps both, since only like
 * can be compared with like. The newest trip wins, and within a trip the later line.
 */
export function priceMemory(trips) {
  const memory = new Map();
  for (const trip of [...trips].sort((a, b) => a.at - b.at)) {
    for (const item of trip.items) {
      const key = nameKey(item.name);
      if (!key) continue;
      const seen = { name: item.name.trim(), at: trip.at, store: trip.store };
      const slot = memory.get(key) ?? {};
      if (item.perKgCents) slot.weight = { ...seen, perKgCents: item.perKgCents };
      else slot.unit = { ...seen, priceCents: item.priceCents };
      memory.set(key, slot);
    }
  }
  return memory;
}

const lastSeen = (slot) => Math.max(slot.unit?.at ?? -Infinity, slot.weight?.at ?? -Infinity);

/** Remembered item names to suggest, most recently bought first, each as last spelled. */
export function pastNames(memory, limit = 300) {
  return [...memory.values()]
    .sort((a, b) => lastSeen(b) - lastSeen(a))
    .slice(0, limit)
    .map((slot) => (lastSeen(slot) === slot.unit?.at ? slot.unit.name : slot.weight.name));
}

/** The last buy of `name`, preferring `kind` ('unit' | 'weight') and falling back to the other; with its kind. */
export function lastPrice(memory, name, kind) {
  const slot = memory.get(nameKey(name));
  if (!slot) return null;
  const other = kind === 'weight' ? 'unit' : 'weight';
  if (slot[kind]) return { ...slot[kind], kind };
  return slot[other] ? { ...slot[other], kind: other } : null;
}

/**
 * {last, pct} when a cart line costs at least minPct % more than the same kind of buy last time: the price of one, or
 * the price per kg (never a weighed line's total, which depends on the weight). null otherwise.
 */
export function priceRise(item, memory, minPct = 1) {
  const kind = item.perKgCents ? 'weight' : 'unit';
  const last = memory.get(nameKey(item.name))?.[kind];
  if (!last) return null;
  const pct = ((item.perKgCents ?? item.priceCents) / (last.perKgCents ?? last.priceCents) - 1) * 100;
  return pct >= minPct ? { last, pct } : null;
}

/* ---------- insights: spending by store and by month ---------- */

/**
 * Each store's trips, total and average trip, grouped by nameKey and named as last visited: named stores by total,
 * biggest first, then the trips without a store ('').
 */
export function storeStats(trips) {
  const stores = new Map();
  for (const trip of [...trips].sort((a, b) => a.at - b.at)) {
    const key = nameKey(trip.store);
    const store = stores.get(key) ?? { name: '', trips: 0, totalCents: 0 };
    store.name = trip.store.trim(); // the newest spelling wins
    store.trips++;
    store.totalCents += trip.totalCents;
    stores.set(key, store);
  }
  const stats = [...stores.values()].map((s) => ({ ...s, avgCents: Math.round(s.totalCents / s.trips) }));
  return stats.sort((a, b) => !a.name - !b.name || b.totalCents - a.totalCents);
}

/**
 * The last `months` local months up to `now`'s, oldest first: [{year, month, totalCents, trips}], month 0-based like
 * Date, and months without trips at zero so a chart shows the gaps.
 */
export function monthlySeries(trips, { now, months = 6 }) {
  const end = new Date(now);
  const series = Array.from({ length: months }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - (months - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), totalCents: 0, trips: 0 };
  });
  const byMonth = new Map(series.map((m) => [`${m.year}-${m.month}`, m]));
  for (const trip of trips) {
    const d = new Date(trip.at);
    const month = byMonth.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!month) continue;
    month.totalCents += trip.totalCents;
    month.trips++;
  }
  return series;
}

/** The average trip, to the centavo; null with no trips. */
export function averageTripCents(trips) {
  return trips.length ? Math.round(trips.reduce((sum, t) => sum + t.totalCents, 0) / trips.length) : null;
}
