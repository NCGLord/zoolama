import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCart,
  cartReducer,
  total,
  counts,
  referencedPhotos,
  checkSummary,
  linePriceCents,
  lineTotal,
  chargedDiff,
  sortItems,
} from '../src/cart.js';

const run = (...actions) => actions.reduce(cartReducer, initialCart());
const add = (priceCents, name = '', qty) => ({ type: 'add', priceCents, name, qty });

test('add appends an item with qty 1 and a trimmed name', () => {
  const s = run(add(899, '  Arroz  '));
  assert.deepEqual(s.items, [{ id: 1, name: 'Arroz', priceCents: 899, qty: 1 }]);
});

test('add accepts an explicit qty and gives each item a fresh id', () => {
  const s = run(add(899), add(250, '', 3));
  assert.deepEqual(
    s.items.map((i) => [i.id, i.qty]),
    [
      [1, 1],
      [2, 3],
    ],
  );
});

test('total sums price × qty in cents', () => {
  assert.equal(total(run(add(899, '', 2), add(1050))), 2848);
});

test('counts reports lines and units', () => {
  assert.deepEqual(counts(run(add(899, '', 2), add(1050))), { lines: 2, units: 3 });
});

test('setQty changes the quantity of one item', () => {
  const s = run(add(899), add(250), { type: 'setQty', id: 2, qty: 4 });
  assert.deepEqual(s.items.map((i) => i.qty), [1, 4]);
});

test('setQty to 0 removes the item and can be undone', () => {
  const removed = run(add(899), { type: 'setQty', id: 1, qty: 0 });
  assert.deepEqual(removed.items, []);
  assert.equal(cartReducer(removed, { type: 'undo' }).items.length, 1);
});

test('rename sets a trimmed name', () => {
  const s = run(add(899), { type: 'rename', id: 1, name: ' Feijão ' });
  assert.equal(s.items[0].name, 'Feijão');
});

test('remove then undo restores the item in its original position', () => {
  const before = run(add(100, 'a'), add(200, 'b'), add(300, 'c'));
  const removed = cartReducer(before, { type: 'remove', id: 2 });
  assert.deepEqual(removed.items.map((i) => i.name), ['a', 'c']);
  assert.deepEqual(cartReducer(removed, { type: 'undo' }).items, before.items);
});

test('clear empties the cart and undo brings everything back', () => {
  const before = run(add(100), add(200));
  const cleared = cartReducer(before, { type: 'clear' });
  assert.deepEqual(cleared.items, []);
  assert.deepEqual(cartReducer(cleared, { type: 'undo' }).items, before.items);
});

test('a later action discards the undo snapshot', () => {
  const s = run(add(100), { type: 'clear' }, add(200), { type: 'undo' });
  assert.deepEqual(s.items.map((i) => i.priceCents), [200]);
});

test('the reducer never mutates the previous state', () => {
  const before = run(add(100));
  const snapshot = structuredClone(before);
  assert.equal(cartReducer(before, { type: 'setQty', id: 1, qty: 5 }).items[0].qty, 5);
  assert.deepEqual(cartReducer(before, { type: 'clear' }).items, []);
  assert.deepEqual(before, snapshot);
});

test('add keeps the shelf-tag photo taken for the item', () => {
  const s = run({ type: 'add', priceCents: 899, photoId: 'p1' });
  assert.equal(s.items[0].photoId, 'p1');
});

test('an item added without a photo carries no photoId', () => {
  assert.equal('photoId' in run(add(899)).items[0], false);
});

test('setPhoto attaches a photo to an existing item', () => {
  const s = run(add(899), add(250), { type: 'setPhoto', id: 2, photoId: 'p2' });
  assert.deepEqual(s.items.map((i) => i.photoId), [undefined, 'p2']);
});

test('removing or replacing a photo can be undone', () => {
  const withPhoto = run(add(899), { type: 'setPhoto', id: 1, photoId: 'p1' });
  const removed = cartReducer(withPhoto, { type: 'setPhoto', id: 1, photoId: null });
  assert.equal('photoId' in removed.items[0], false);
  assert.equal(cartReducer(removed, { type: 'undo' }).items[0].photoId, 'p1');
  const replaced = cartReducer(withPhoto, { type: 'setPhoto', id: 1, photoId: 'p9' });
  assert.equal(cartReducer(replaced, { type: 'undo' }).items[0].photoId, 'p1');
});

test('referencedPhotos lists photos on items and in the undo snapshot', () => {
  const s = run(add(100), add(200), { type: 'setPhoto', id: 1, photoId: 'p1' }, { type: 'setPhoto', id: 2, photoId: 'p2' }, { type: 'remove', id: 2 });
  assert.deepEqual([...referencedPhotos(s)].sort(), ['p1', 'p2']);
  assert.deepEqual([...referencedPhotos(cartReducer(s, add(300)))], ['p1']);
});

test('toggleChecked ticks and unticks an item', () => {
  const ticked = run(add(899), { type: 'toggleChecked', id: 1 });
  assert.equal(ticked.items[0].checked, true);
  assert.equal(cartReducer(ticked, { type: 'toggleChecked', id: 1 }).items[0].checked, false);
});

test('setCharged stores what the till charged for the line and ticks it', () => {
  const s = run(add(2990), { type: 'setCharged', id: 1, chargedCents: 3150 });
  assert.equal(s.items[0].chargedCents, 3150);
  assert.equal(s.items[0].checked, true);
});

test('clearing the charged amount keeps the tick', () => {
  const s = run(add(2990), { type: 'setCharged', id: 1, chargedCents: 3150 }, { type: 'setCharged', id: 1, chargedCents: null });
  assert.equal('chargedCents' in s.items[0], false);
  assert.equal(s.items[0].checked, true);
});

test('checkSummary counts ticks and sums overcharge and in-your-favour separately, on line totals', () => {
  const s = run(
    add(2990), // noted 29,90, charged 31,50: +1,60
    add(450, '', 2), // noted 2 × 4,50 = 9,00, charged 13,50 (scanned three times): +4,50
    add(899), // noted 8,99, charged 7,99: in your favour 1,00
    add(100), // unticked
    { type: 'setCharged', id: 1, chargedCents: 3150 },
    { type: 'setCharged', id: 2, chargedCents: 1350 },
    { type: 'setCharged', id: 3, chargedCents: 799 },
  );
  assert.deepEqual(checkSummary(s), { checked: 3, lines: 4, mismatches: 3, overchargeCents: 610, inFavorCents: 100 });
});

test('a charged amount equal to the noted line total is not a mismatch', () => {
  const s = run(add(450, '', 2), { type: 'setCharged', id: 1, chargedCents: 900 });
  assert.deepEqual(checkSummary(s), { checked: 1, lines: 1, mismatches: 0, overchargeCents: 0, inFavorCents: 0 });
});

test('clearing the cart and undoing brings the ticks and charged amounts back', () => {
  const before = run(add(2990), { type: 'setCharged', id: 1, chargedCents: 3150 });
  const restored = [{ type: 'clear' }, { type: 'undo' }].reduce(cartReducer, before);
  assert.deepEqual(restored.items, before.items);
});

test('a weighed item stores price per kg and grams, and prices the line at qty 1', () => {
  const s = run({ type: 'add', perKgCents: 799, grams: 1250, name: 'Tomate' });
  assert.deepEqual(s.items[0], { id: 1, name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 });
});

test('the line price rounds to the nearest centavo, halves up, like a scale label', () => {
  assert.equal(linePriceCents(799, 1250), 999); // 9,9875
  assert.equal(linePriceCents(3990, 350), 1397); // 13,965
  assert.equal(linePriceCents(1000, 1), 1); // 0,01
});

test('setWeight corrects the weight and re-prices the line', () => {
  const s = run({ type: 'add', perKgCents: 799, grams: 1250 }, { type: 'setWeight', id: 1, grams: 800 });
  assert.equal(s.items[0].grams, 800);
  assert.equal(s.items[0].priceCents, 639); // 6,392
});

test('setWeight ignores a weight that is not positive', () => {
  const before = run({ type: 'add', perKgCents: 799, grams: 1250 });
  assert.deepEqual(cartReducer(before, { type: 'setWeight', id: 1, grams: 0 }).items, before.items);
});

test('weighed lines count as one item and add their line price to the total', () => {
  const s = run(add(450, '', 2), { type: 'add', perKgCents: 799, grams: 1250 });
  assert.equal(total(s), 900 + 999);
  assert.deepEqual(counts(s), { lines: 2, units: 3 });
});

const named = (...names) => names.map((name, i) => ({ id: i + 1, name, priceCents: 100, qty: 1 }));
const order = (rows) => rows.map((r) => r.item.name || `#${r.n}`);

test('sortItems defaults to newest first and keeps each item\'s added position as n', () => {
  const rows = sortItems(named('a', 'b', 'c'));
  assert.deepEqual(rows.map((r) => [r.item.name, r.n]), [['c', 3], ['b', 2], ['a', 1]]);
});

test('sortItems by added, ascending, is the order items were added', () => {
  assert.deepEqual(order(sortItems(named('a', 'b', 'c'), { key: 'added', dir: 'asc' })), ['a', 'b', 'c']);
});

test('sortItems by value uses the line total, and equal totals keep the order they were added', () => {
  const items = [
    { name: 'leite', priceCents: 450, qty: 2 }, // 9,00
    { name: 'arroz', priceCents: 2990, qty: 1 }, // 29,90
    { name: 'pão', priceCents: 900, qty: 1 }, // 9,00, same as leite
    { name: 'tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 }, // 9,99
  ];
  assert.deepEqual(order(sortItems(items, { key: 'total', dir: 'asc' })), ['leite', 'pão', 'tomate', 'arroz']);
  assert.deepEqual(order(sortItems(items, { key: 'total', dir: 'desc' })), ['arroz', 'tomate', 'leite', 'pão']);
});

test('sortItems by name ignores accents and case, the Portuguese way', () => {
  const items = named('Café', 'arroz', 'Açúcar', 'banana');
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'asc' })), ['Açúcar', 'arroz', 'banana', 'Café']);
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'desc' })), ['Café', 'banana', 'arroz', 'Açúcar']);
});

test('sortItems by name orders numbers naturally', () => {
  assert.deepEqual(order(sortItems(named('Lata 10', 'Lata 2'), { key: 'name', dir: 'asc' })), ['Lata 2', 'Lata 10']);
});

test('unnamed items go last in both directions, in the order they were added', () => {
  const items = named('', 'Café', '', 'arroz');
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'asc' })), ['arroz', 'Café', '#1', '#3']);
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'desc' })), ['Café', 'arroz', '#1', '#3']);
});

test('lineTotal is price × qty, and a weighed line is already its price', () => {
  assert.equal(lineTotal({ priceCents: 450, qty: 3 }), 1350);
  assert.equal(lineTotal({ priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 }), 999);
});

test('chargedDiff is what the till charged beyond the line total, and 0 when nothing was charged', () => {
  assert.equal(chargedDiff({ priceCents: 450, qty: 2 }), 0);
  assert.equal(chargedDiff({ priceCents: 450, qty: 2, chargedCents: 1000 }), 100);
  assert.equal(chargedDiff({ priceCents: 450, qty: 2, chargedCents: 850 }), -50);
});
