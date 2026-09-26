import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialCart, cartReducer, lineTotal } from '../src/cart.js';
import {
  tripFromCart,
  monthlyGroups,
  storeNames,
  isTrip,
  nameKey,
  priceMemory,
  pastNames,
  lastPrice,
  priceRise,
  storeStats,
  monthlySeries,
  averageTripCents,
} from '../src/history.js';

const cartOf = (...actions) => actions.reduce(cartReducer, initialCart());
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime(); // local time, like the phone's clock

test('a trip keeps the item list without photos or checkout marks, and weighed items keep kg and grams', () => {
  const cart = cartOf(
    { type: 'add', priceCents: 450, qty: 2, name: ' Leite ', photoId: 'p1' },
    { type: 'add', perKgCents: 799, grams: 1250, name: 'Tomate' },
    { type: 'toggleChecked', id: 1 },
  );
  const trip = tripFromCart(cart, { id: 't1', at: at(2026, 9, 22), store: '  Assaí ' });
  assert.deepEqual(trip, {
    id: 't1',
    at: at(2026, 9, 22),
    store: 'Assaí',
    items: [
      { name: 'Leite', priceCents: 450, qty: 2 },
      { name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 },
    ],
    totalCents: 1899,
    units: 3,
  });
});

test('a trip records the overcharge found in checkout mode', () => {
  const cart = cartOf({ type: 'add', priceCents: 2990 }, { type: 'setCharged', id: 1, chargedCents: 3150 });
  assert.equal(tripFromCart(cart, { id: 't', at: 0 }).overchargeCents, 160);
});

test('monthlyGroups puts trips under their local month, newest first, with a month total', () => {
  const trips = [
    { id: 'a', at: at(2026, 8, 30), totalCents: 100 },
    { id: 'b', at: at(2026, 9, 22), totalCents: 300 },
    { id: 'c', at: at(2026, 9, 1, 9), totalCents: 50 },
  ];
  const groups = monthlyGroups(trips);
  assert.deepEqual(
    groups.map((g) => [g.year, g.month, g.totalCents, g.trips.map((t) => t.id)]),
    [
      [2026, 8, 350, ['b', 'c']],
      [2026, 7, 100, ['a']],
    ],
  );
});

test('storeNames suggests each store once, most recent first, skipping unnamed trips', () => {
  const trips = [
    { at: at(2026, 9, 22), store: 'Assaí' },
    { at: at(2026, 9, 15), store: '' },
    { at: at(2026, 9, 10), store: 'Atacadão' },
    { at: at(2026, 9, 1), store: 'Assaí' },
  ];
  assert.deepEqual(storeNames(trips), ['Assaí', 'Atacadão']);
});

test('isTrip accepts every trip tripFromCart builds', () => {
  const cart = cartOf(
    { type: 'add', priceCents: 450, qty: 2, name: 'Leite' },
    { type: 'add', perKgCents: 799, grams: 1250 },
    { type: 'setCharged', id: 1, chargedCents: 1000 },
  );
  assert.equal(isTrip(tripFromCart(cart, { id: 't1', at: at(2026, 9, 22), store: 'Assaí' })), true);
  assert.equal(isTrip(tripFromCart(initialCart(), { id: 't2', at: 0 })), true);
});

test('isTrip rejects a trip History could not show', () => {
  const good = { id: 't', at: 0, store: '', items: [{ name: '', priceCents: 450, qty: 1 }], totalCents: 450, units: 1 };
  const broken = [
    null,
    { ...good, id: '' },
    { ...good, at: 'yesterday' },
    { ...good, at: 1e300 }, // a number, but no date: showing it throws RangeError, which would stop the app at boot
    { ...good, at: 8.64e15 + 1 }, // one millisecond past the last date a Date can hold
    { ...good, store: undefined },
    { ...good, items: 'Leite' },
    { ...good, items: [{ name: 'Leite', priceCents: 4.5, qty: 1 }] },
    { ...good, items: [{ name: 'Leite', priceCents: 450, qty: 0 }] },
    { ...good, items: [{ priceCents: 450, qty: 1 }] },
    { ...good, items: [{ name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799 }] },
    { ...good, totalCents: -1 },
    { ...good, units: undefined },
    { ...good, overchargeCents: 0 },
  ];
  for (const trip of broken) assert.equal(isTrip(trip), false, JSON.stringify(trip));
  assert.equal(isTrip(good), true);
});

test('a trip keeps the receipt total noted at the till, and only when one was noted', () => {
  const cart = cartOf({ type: 'add', priceCents: 450 }, { type: 'setReceipt', receiptCents: 500 });
  assert.equal(tripFromCart(cart, { id: 't', at: 0 }).receiptCents, 500);
  assert.equal('receiptCents' in tripFromCart(cartOf({ type: 'add', priceCents: 450 }), { id: 't', at: 0 }), false);
  assert.equal(isTrip(tripFromCart(cart, { id: 't', at: 0 })), true);
  assert.equal(isTrip({ ...tripFromCart(cart, { id: 't', at: 0 }), receiptCents: 0 }), false);
});

const bought = (id, when, store, ...items) => ({ id, at: when, store, items, totalCents: 0, units: 0 });
const unit = (name, priceCents) => ({ name, priceCents, qty: 1 });
const weighed = (name, perKgCents, grams = 1000) => {
  const priceCents = Math.round((perKgCents * grams) / 1000);
  return { name, priceCents, qty: 1, perKgCents, grams };
};

test('nameKey ignores case, accents and spacing, the way the pt-BR collator compares names', () => {
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const same = [
    ['Açúcar', 'acucar'],
    ['Maçã', 'MACA'],
    ['  Pão   Francês ', 'pao frances'],
    ['Café 500 g', 'cafe 500 g'],
  ];
  for (const [a, b] of same) {
    assert.equal(nameKey(a), nameKey(b), `${a} / ${b}`);
    assert.equal(collator.compare(a.trim().replace(/\s+/g, ' '), b), 0, `the collator agrees on ${a} / ${b}`);
  }
  assert.notEqual(nameKey('Leite'), nameKey('Leite 1 L'));
  assert.equal(nameKey(''), '');
  assert.equal(nameKey(undefined), '');
});

test('priceMemory keeps the price from the newest trip, whatever order the list is in', () => {
  const trips = [
    bought('old', at(2026, 8, 1), 'Extra', unit('Leite', 429)),
    bought('new', at(2026, 9, 10), 'Assaí', unit('leite', 459)),
  ];
  const newest = { unit: { name: 'leite', at: at(2026, 9, 10), store: 'Assaí', priceCents: 459 } };
  for (const list of [trips, [...trips].reverse()]) assert.deepEqual(priceMemory(list).get('leite'), newest);
});

test('within one trip the later line wins, unnamed lines are skipped, and unit and weighed buys are kept apart', () => {
  const memory = priceMemory([
    bought('t', at(2026, 9, 10), '', unit('Tomate', 500), unit('Tomate', 550), unit('', 999), weighed('Tomate', 799)),
  ]);
  assert.deepEqual([...memory.keys()], ['tomate']);
  assert.equal(memory.get('tomate').unit.priceCents, 550);
  assert.equal(memory.get('tomate').weight.perKgCents, 799);
  assert.equal(priceMemory([]).size, 0);
});

test('pastNames lists each remembered item once, most recently bought first, as last spelled', () => {
  const memory = priceMemory([
    bought('a', at(2026, 9, 1), '', unit('Leite', 429), unit('Café', 1890)),
    bought('b', at(2026, 9, 10), '', unit('café', 1990)),
  ]);
  assert.deepEqual(pastNames(memory), ['café', 'Leite']);
  assert.deepEqual(pastNames(memory, 1), ['café']);
});

test('lastPrice prefers the same kind of buy and falls back to the other', () => {
  const memory = priceMemory([bought('a', at(2026, 9, 1), 'Extra', weighed('Tomate', 799))]);
  assert.equal(lastPrice(memory, 'TOMATE', 'weight').perKgCents, 799);
  assert.equal(lastPrice(memory, 'tomate', 'unit').kind, 'weight');
  assert.equal(lastPrice(memory, 'Alface', 'unit'), null);
  assert.equal(lastPrice(memory, '', 'unit'), null);
});

test('priceRise flags a line that costs at least 1% more than last time, like with like', () => {
  const memory = priceMemory([bought('a', at(2026, 9, 1), '', unit('Leite', 849), weighed('Tomate', 799))]);
  const rise = priceRise({ name: 'leite', priceCents: 899, qty: 2 }, memory);
  assert.equal(rise.last.priceCents, 849);
  assert.equal(Math.round(rise.pct * 100) / 100, 5.89);
  assert.equal(priceRise({ name: 'Leite', priceCents: 849, qty: 1 }, memory), null, 'same price');
  assert.equal(priceRise({ name: 'Leite', priceCents: 799, qty: 1 }, memory), null, 'cheaper');
  assert.equal(priceRise({ name: 'Leite', priceCents: 855, qty: 1 }, memory), null, 'under 1%');
  const tomatoByUnit = { name: 'Tomate', priceCents: 900, qty: 1 };
  assert.equal(priceRise(tomatoByUnit, memory), null, 'a unit line against a weighed buy');
  assert.equal(priceRise(weighed('Tomate', 799, 2500), memory), null, 'more weight, same price per kg');
  assert.ok(priceRise(weighed('Tomate', 899, 500), memory), 'a dearer price per kg');
  assert.equal(priceRise({ name: '', priceCents: 9999, qty: 1 }, memory), null, 'unnamed');
});

const spent = (id, when, store, totalCents) => ({ id, at: when, store, items: [], totalCents, units: 0 });

test('storeStats totals and averages each store, spelled as last visited, biggest first, unnamed trips last', () => {
  const stats = storeStats([
    spent('a', at(2026, 9, 1), 'assai ', 100),
    spent('b', at(2026, 9, 2), '', 5000),
    spent('c', at(2026, 9, 3), 'Assaí', 100),
    spent('d', at(2026, 9, 4), 'Extra', 150),
    spent('e', at(2026, 9, 5), 'ASSAÍ', 101),
  ]);
  assert.deepEqual(stats, [
    { name: 'ASSAÍ', trips: 3, totalCents: 301, avgCents: 100 },
    { name: 'Extra', trips: 1, totalCents: 150, avgCents: 150 },
    { name: '', trips: 1, totalCents: 5000, avgCents: 5000 },
  ]);
  assert.deepEqual(storeStats([]), []);
});

test('monthlySeries gives the last months oldest first, months without trips at zero', () => {
  const trips = [
    spent('a', at(2026, 9, 3), '', 300),
    spent('b', at(2026, 9, 20), '', 200),
    spent('c', at(2026, 7, 10), '', 1000),
    spent('d', at(2026, 1, 10), '', 9999), // before the window
  ];
  const series = monthlySeries(trips, { now: at(2026, 9, 23), months: 4 });
  assert.deepEqual(
    series.map((m) => [m.year, m.month, m.totalCents, m.trips]),
    [
      [2026, 5, 0, 0],
      [2026, 6, 1000, 1],
      [2026, 7, 0, 0],
      [2026, 8, 500, 2],
    ],
  );
});

test('monthlySeries crosses a year boundary, and defaults to six months', () => {
  const series = monthlySeries([spent('a', at(2025, 12, 31, 23), '', 700)], { now: at(2026, 2, 1) });
  assert.equal(series.length, 6);
  const months = series.map((m) => `${m.year}-${m.month}`);
  assert.deepEqual(months, ['2025-8', '2025-9', '2025-10', '2025-11', '2026-0', '2026-1']);
  assert.equal(series[3].totalCents, 700);
});

test('averageTripCents rounds to the centavo, and is null with no trips', () => {
  assert.equal(averageTripCents([spent('a', 0, '', 100), spent('b', 0, '', 100), spent('c', 0, '', 101)]), 100);
  assert.equal(averageTripCents([spent('a', 0, '', 100), spent('b', 0, '', 101)]), 101);
  assert.equal(averageTripCents([]), null);
});

// History re-totals a trip line by line (and share writes each line's arithmetic), so whatever a cart line can carry
// that changes its total must travel into the trip too. This pins that for every kind of line the cart knows.
test('a trip\'s lines always add up to its total', () => {
  const carts = [
    cartOf({ type: 'add', priceCents: 450, qty: 3 }),
    cartOf({ type: 'add', perKgCents: 799, grams: 1250 }, { type: 'add', priceCents: 1299 }),
    cartOf(
      { type: 'add', priceCents: 450, qty: 2 },
      { type: 'setCharged', id: 1, chargedCents: 1000 },
      { type: 'setPrice', id: 1, priceCents: 399 },
    ),
    cartOf({ type: 'add', priceCents: 599, qty: 6, deal: { kind: 'tier', minQty: 6, eachCents: 499 } }),
    cartOf({ type: 'add', priceCents: 350, qty: 7, deal: { kind: 'multibuy', buy: 3, pay: 2 } }),
  ];
  for (const cart of carts) {
    const trip = tripFromCart(cart, { id: 't', at: 0 });
    assert.equal(trip.items.reduce((sum, item) => sum + lineTotal(item), 0), trip.totalCents);
  }
});

test('a trip keeps each line\'s offer, and a malformed offer makes a trip one History can\'t trust', () => {
  const deal = { kind: 'tier', minQty: 6, eachCents: 499 };
  const trip = tripFromCart(cartOf({ type: 'add', priceCents: 599, qty: 6, deal }), { id: 't', at: 0 });
  assert.deepEqual(trip.items[0].deal, deal);
  assert.equal(isTrip(trip), true);
  const broken = { ...trip, items: [{ ...trip.items[0], deal: { kind: 'tier', minQty: 6, eachCents: 700 } }] };
  assert.equal(isTrip(broken), false);
});
