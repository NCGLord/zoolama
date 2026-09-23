import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState, initialCompare, blankOption } from '../src/state.js';
import { initialCart, cartReducer } from '../src/cart.js';
import { initialPlan } from '../src/plan.js';

const restore = (saved) => restoreState(saved, { lang: 'en' });

const defaults = {
  cart: initialCart(),
  compare: initialCompare(),
  lang: 'en',
  tab: 'cart',
  theme: null,
  checking: false,
  budgetCents: null,
  sort: { key: 'added', dir: 'desc' },
  plan: initialPlan(),
};

test('with nothing saved, every field starts at its default and the language is the one detected', () => {
  assert.deepEqual(restore(null), defaults);
});

test('a state the app saved comes back unchanged', () => {
  const cart = [
    { type: 'add', priceCents: 450, qty: 2, name: 'Leite', photoId: 'p1' },
    { type: 'add', perKgCents: 799, grams: 1250 },
    { type: 'add', priceCents: 1299 },
    { type: 'toggleChecked', id: 1 },
    { type: 'setCharged', id: 2, chargedCents: 1050 },
    { type: 'remove', id: 3 },
  ].reduce(cartReducer, initialCart());
  const saved = {
    cart,
    compare: { options: [{ label: 'A', price: '8,99', qty: '1', unit: 'kg' }, blankOption('kg'), blankOption('un')] },
    lang: 'pt',
    tab: 'history',
    theme: 'dark',
    checking: true,
    budgetCents: 20000,
    sort: { key: 'name', dir: 'asc' },
    plan: { items: [{ id: 1, name: 'Leite' }], nextId: 2, undo: [] },
  };
  assert.deepEqual(restore({ schema: 1, ...saved }), saved);
});

test('lines whose id, price or quantity cannot be trusted are dropped, and each id is kept once', () => {
  const { cart } = restore({
    cart: {
      items: [
        { id: 1, name: 'Leite', priceCents: 450, qty: 2 },
        { id: 2, priceCents: '4,50', qty: 1 },
        { id: 3, priceCents: 450, qty: 0 },
        { id: 1.5, priceCents: 450, qty: 1 },
        null,
        { id: 1, name: 'again', priceCents: 100, qty: 1 },
        { id: 4, name: 7, priceCents: 300, qty: 1 },
      ],
      nextId: 5,
      undo: null,
    },
  });
  assert.deepEqual(cart.items, [
    { id: 1, name: 'Leite', priceCents: 450, qty: 2 },
    { id: 4, name: '', priceCents: 300, qty: 1 },
  ]);
});

test('broken optional fields are dropped and the line kept', () => {
  const { cart } = restore({
    cart: {
      items: [
        {
          id: 1,
          name: 'Tomate',
          priceCents: 999,
          qty: 1,
          perKgCents: 799, // without its grams
          photoId: 5,
          checked: 'yes',
          chargedCents: -3,
        },
      ],
      nextId: 2,
    },
  });
  assert.deepEqual(cart.items, [{ id: 1, name: 'Tomate', priceCents: 999, qty: 1 }]);
});

test('the next id never reuses one in the cart or its Undo snapshot', () => {
  const item = (id) => ({ id, priceCents: 100, qty: 1 });
  assert.equal(restore({ cart: { items: [item(4)], nextId: 2 } }).cart.nextId, 5);
  assert.equal(restore({ cart: { items: [item(1)], nextId: 'x', undo: [item(9)] } }).cart.nextId, 10);
  assert.equal(restore({ cart: { items: [item(1)], nextId: 7 } }).cart.nextId, 7);
  assert.equal(restore({ cart: { items: [item(1)], undo: 'x' } }).cart.undo, null);
});

test('a cart without a list of items starts empty', () => {
  for (const cart of [undefined, null, 'x', { items: 'x' }, {}]) {
    assert.deepEqual(restore({ cart }).cart, initialCart());
  }
});

test('Compare needs at least two options; a bad field in one falls back on its own', () => {
  for (const compare of [undefined, { options: 5 }, { options: [blankOption()] }]) {
    assert.deepEqual(restore({ compare }).compare, initialCompare());
  }
  const { compare } = restore({ compare: { options: [{ price: 8.99, qty: '1', unit: 'lb' }, 'x'] } });
  assert.deepEqual(compare.options, [
    { label: '', price: '', qty: '1', unit: 'g' },
    { label: '', price: '', qty: '', unit: 'g' },
  ]);
});

test('unknown language, tab, theme, sort, budget or checkout flag fall back to their defaults', () => {
  const restored = restore({
    lang: 'fr',
    tab: 'nowhere',
    theme: 'blue',
    checking: 'yes',
    budgetCents: 150.5,
    sort: { key: 'price', dir: 'asc' },
  });
  assert.deepEqual(restored, defaults);
  assert.equal(restore({ budgetCents: -100 }).budgetCents, null);
  assert.deepEqual(restore({ sort: { key: 'name', dir: 'sideways' } }).sort, defaults.sort);
});

test('the receipt total noted at the till comes back with the cart, unless it is not a positive amount', () => {
  const cart = { items: [{ id: 1, name: '', priceCents: 450, qty: 1 }], nextId: 2, undo: null };
  assert.equal(restore({ cart: { ...cart, receiptCents: 500 } }).cart.receiptCents, 500);
  assert.equal('receiptCents' in restore({ cart: { ...cart, receiptCents: -1 } }).cart, false);
});
