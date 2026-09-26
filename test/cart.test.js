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
  chargedTotal,
  receiptCheck,
  validDeal,
  tierNudge,
  nextUnitFree,
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

test('setPrice corrects a line\'s price and keeps its quantity', () => {
  const s = run(add(450, 'Leite', 2), { type: 'setPrice', id: 1, priceCents: 399 });
  assert.deepEqual(s.items, [{ id: 1, name: 'Leite', priceCents: 399, qty: 2 }]);
  assert.equal(total(s), 798);
});

test('setPrice on a weighed line corrects the price per kg and re-prices the line at the same weight', () => {
  const s = run({ type: 'add', perKgCents: 799, grams: 1250 }, { type: 'setPrice', id: 1, priceCents: 699 });
  assert.equal(s.items[0].perKgCents, 699);
  assert.equal(s.items[0].grams, 1250);
  assert.equal(s.items[0].priceCents, 874); // 8,7375
});

test('setPrice keeps what the till charged, so the difference follows the corrected price', () => {
  const s = run(
    add(450, '', 2),
    { type: 'setCharged', id: 1, chargedCents: 1000 },
    { type: 'setPrice', id: 1, priceCents: 500 },
  );
  assert.equal(s.items[0].chargedCents, 1000);
  assert.equal(s.items[0].checked, true);
  assert.equal(chargedDiff(s.items[0]), 0);
});

test('setPrice ignores a price that is not a positive whole number of centavos, and unknown lines', () => {
  const before = run(add(450));
  for (const priceCents of [0, -100, 4.5, null, undefined, NaN]) {
    assert.equal(cartReducer(before, { type: 'setPrice', id: 1, priceCents }), before, String(priceCents));
  }
  assert.equal(cartReducer(before, { type: 'setPrice', id: 9, priceCents: 100 }), before);
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

test('unnamed items go last in both directions, ordered by the N of their "Item N" label', () => {
  const items = named('', 'Café', '', 'arroz');
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'asc' })), ['arroz', 'Café', '#1', '#3']);
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'desc' })), ['Café', 'arroz', '#3', '#1']);
});

test('a cart of unnamed items flips when the name sort does', () => {
  const items = named('', '', '', '');
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'asc' })), ['#1', '#2', '#3', '#4']);
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'desc' })), ['#4', '#3', '#2', '#1']);
});

test('items with the same name are a true tie, and keep the order they were added in both directions', () => {
  const items = named('Leite', 'Café', 'Leite');
  assert.deepEqual(order(sortItems(items, { key: 'name', dir: 'asc' })), ['Café', 'Leite', 'Leite']);
  assert.deepEqual(sortItems(items, { key: 'name', dir: 'desc' }).map((r) => r.n), [1, 3, 2]);
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

test('setReceipt notes the receipt total, clears it with null, and ignores anything else', () => {
  const s = run(add(450), { type: 'setReceipt', receiptCents: 500 });
  assert.equal(s.receiptCents, 500);
  assert.equal('receiptCents' in cartReducer(s, { type: 'setReceipt', receiptCents: null }), false);
  for (const receiptCents of [0, -5, 4.5, '500', undefined]) {
    assert.equal(cartReducer(s, { type: 'setReceipt', receiptCents }), s, String(receiptCents));
  }
});

test('adding to a cart keeps its receipt total; adding to an empty one starts a new trip without it', () => {
  const noted = run(add(450), { type: 'setReceipt', receiptCents: 500 });
  assert.equal(cartReducer(noted, add(100)).receiptCents, 500);
  const cleared = cartReducer(noted, { type: 'clear' });
  assert.equal(cleared.receiptCents, 500, 'Clear keeps it, so Undo brings the whole check back');
  assert.equal(cartReducer(cleared, { type: 'undo' }).receiptCents, 500);
  assert.equal('receiptCents' in cartReducer(cleared, add(100)), false);
});

test('chargedTotal is what the till charged: the charged amount where noted, else the line total', () => {
  const s = run(add(450, '', 2), add(1200), { type: 'setCharged', id: 1, chargedCents: 1000 });
  assert.equal(chargedTotal(s), 1000 + 1200);
  assert.equal(chargedTotal(s), total(s) + checkSummary(s).overchargeCents - checkSummary(s).inFavorCents);
});

test('receiptCheck compares the receipt with the noted total and with what the lines say was charged', () => {
  const s = run(add(450, '', 2), add(1200));
  assert.equal(receiptCheck(s), null, 'no receipt noted');
  assert.equal(receiptCheck(cartReducer(initialCart(), { type: 'setReceipt', receiptCents: 500 })), null, 'no items');

  const check = (state, receiptCents) => receiptCheck(cartReducer(state, { type: 'setReceipt', receiptCents }));
  const matching = { receiptCents: 2100, notedCents: 2100, chargedCents: 2100, diffCents: 0, unexplainedCents: 0 };
  assert.deepEqual(check(s, 2100), matching);
  assert.equal(check(s, 2200).diffCents, 100);
  assert.equal(check(s, 2000).diffCents, -100);

  const charged = cartReducer(s, { type: 'setCharged', id: 1, chargedCents: 1000 });
  const explained = { receiptCents: 2200, notedCents: 2100, chargedCents: 2200, diffCents: 100, unexplainedCents: 0 };
  assert.deepEqual(check(charged, 2200), explained);
  assert.equal(check(charged, 2350).unexplainedCents, 150);
});

/* ---------- atacado: from N units, each costs less ---------- */

const tier = (minQty, eachCents) => ({ kind: 'tier', minQty, eachCents });
const withTier = (qty, deal = tier(6, 499)) => run({ type: 'add', priceCents: 599, qty, deal });

test('a tier price applies to every unit once the quantity reaches it', () => {
  assert.equal(lineTotal(withTier(5).items[0]), 2995); // 5 × 5,99
  assert.equal(lineTotal(withTier(6).items[0]), 2994); // 6 × 4,99
  assert.equal(lineTotal(withTier(12).items[0]), 5988);
  assert.equal(total(withTier(6)), 2994);
});

test('an offer is kept only when it holds up against the price, and never on a weighed line', () => {
  assert.deepEqual(withTier(1).items[0].deal, tier(6, 499));
  for (const bad of [tier(1, 499), tier(6, 599), tier(6, 700), tier(2.5, 499), tier(6, 4.99), { kind: 'magic' }, 'x']) {
    assert.equal('deal' in withTier(1, bad).items[0], false, JSON.stringify(bad));
  }
  assert.deepEqual(validDeal({ ...tier(6, 499), extra: 1 }, 599), tier(6, 499), 'only the known fields');
  const weighed = run({ type: 'add', perKgCents: 799, grams: 1250, deal: tier(2, 500) });
  assert.equal('deal' in weighed.items[0], false);
});

test('setDeal sets or replaces an offer; removing one can be undone; nonsense and weighed lines are left alone', () => {
  const s = run(add(599, '', 3), { type: 'setDeal', id: 1, deal: tier(6, 499) });
  assert.deepEqual(s.items[0].deal, tier(6, 499));
  assert.deepEqual(cartReducer(s, { type: 'setDeal', id: 1, deal: tier(4, 549) }).items[0].deal, tier(4, 549));
  const removed = cartReducer(s, { type: 'setDeal', id: 1, deal: null });
  assert.equal('deal' in removed.items[0], false);
  assert.deepEqual(cartReducer(removed, { type: 'undo' }).items[0].deal, tier(6, 499));
  assert.equal(cartReducer(s, { type: 'setDeal', id: 1, deal: tier(6, 999) }), s);
  const weighed = run({ type: 'add', perKgCents: 799, grams: 1250 });
  assert.equal(cartReducer(weighed, { type: 'setDeal', id: 1, deal: tier(2, 1) }), weighed);
});

test('correcting the price drops a tier it no longer beats', () => {
  const s = withTier(3);
  assert.deepEqual(cartReducer(s, { type: 'setPrice', id: 1, priceCents: 649 }).items[0].deal, tier(6, 499));
  assert.equal('deal' in cartReducer(s, { type: 'setPrice', id: 1, priceCents: 449 }).items[0], false);
});

test('checkout and sorting go by the tier price: a till that ignores it shows as an overcharge', () => {
  const s = cartReducer(withTier(6), { type: 'setCharged', id: 1, chargedCents: 3594 }); // 6 × 5,99
  assert.equal(checkSummary(s).overchargeCents, 600);
  const lines = [...withTier(6).items, { id: 2, name: '', priceCents: 2995, qty: 1 }];
  const sorted = sortItems(lines, { key: 'total', dir: 'desc' });
  assert.deepEqual(sorted.map((r) => r.item.id), [2, 1]);
});

test('tierNudge says what reaching the tier costs and saves, until the line reaches it', () => {
  assert.deepEqual(tierNudge(withTier(4).items[0]), { qty: 6, totalCents: 2994, savesCents: 600, extraCents: 598 });
  assert.equal(tierNudge(withTier(5).items[0]).extraCents, -1, 'taking 6 costs less than 5');
  assert.equal(tierNudge(withTier(6).items[0]), null);
  assert.equal(tierNudge(run(add(599)).items[0]), null);
});

/* ---------- leve N pague M ---------- */

const multibuy = (buy, pay) => ({ kind: 'multibuy', buy, pay });
const withMultibuy = (qty, deal = multibuy(3, 2)) => run({ type: 'add', priceCents: 350, qty, deal });

test('"leve 3 pague 2" charges 2 of every 3 units, and the rest at full price', () => {
  const totals = [1, 2, 3, 4, 6, 7].map((qty) => lineTotal(withMultibuy(qty).items[0]));
  assert.deepEqual(totals, [350, 700, 700, 1050, 1400, 1750]);
});

test('a multibuy offer holds up only as N units for fewer than N', () => {
  assert.deepEqual(validDeal(multibuy(3, 2), 350), multibuy(3, 2));
  assert.deepEqual(validDeal(multibuy(4, 3), 1), multibuy(4, 3), 'any price');
  for (const bad of [multibuy(3, 3), multibuy(3, 0), multibuy(1, 1), multibuy(3, 1.5), multibuy(2.5, 1)]) {
    assert.equal(validDeal(bad, 350), null, JSON.stringify(bad));
  }
});

test('nextUnitFree says when one more unit costs nothing', () => {
  assert.deepEqual([2, 3, 5].map((qty) => nextUnitFree(withMultibuy(qty).items[0])), [true, false, true]);
  assert.equal(nextUnitFree(withMultibuy(3, multibuy(4, 3)).items[0]), true);
  assert.equal(nextUnitFree(withMultibuy(1, multibuy(4, 3)).items[0]), false);
  assert.equal(nextUnitFree(run(add(350, '', 2)).items[0]), false);
});
