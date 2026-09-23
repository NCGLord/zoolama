import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialCart, cartReducer } from '../src/cart.js';
import { tripFromCart, monthlyGroups, storeNames } from '../src/history.js';

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
