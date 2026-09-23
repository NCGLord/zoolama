import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, BASE_UNIT, parseQuantity, toBase, parseGrams, parsePack, packLabel } from '../src/units.js';

test('parseQuantity reads comma and dot decimals of any length', () => {
  assert.equal(parseQuantity('0,350'), 0.35);
  assert.equal(parseQuantity('1.5'), 1.5);
});

test('parseQuantity reads whole numbers', () => {
  assert.equal(parseQuantity('350'), 350);
});

test('parseQuantity treats the last separator as decimal when both appear', () => {
  assert.equal(parseQuantity('1.000,5'), 1000.5);
});

test('with grouping, a lone separator before exactly three digits groups thousands, as in prices', () => {
  const grouping = { grouping: true };
  assert.equal(parseQuantity('1.000', grouping), 1000);
  assert.equal(parseQuantity('1,000', grouping), 1000);
  assert.equal(parseQuantity('1.000,5', grouping), 1000.5);
  assert.equal(parseQuantity('0.500', grouping), 0.5);
  assert.equal(parseQuantity('1.5', grouping), 1.5);
});

test('without grouping, three decimals stay decimals, the way scale labels print kg', () => {
  assert.equal(parseQuantity('1.250'), 1.25);
  assert.equal(parseQuantity('1.000'), 1);
});

test('g, ml and un group thousands; kg and L take decimals', () => {
  assert.deepEqual(Object.keys(UNITS).filter((u) => UNITS[u].grouping), ['g', 'ml', 'un']);
});

test('parseQuantity rejects empty, non-numeric, zero and negative input', () => {
  for (const bad of ['', 'abc', '0', '0,000', '-2', null, undefined]) {
    assert.equal(parseQuantity(bad), null, `input ${JSON.stringify(bad)}`);
  }
});

test('the offered units are g, kg, ml, L and un', () => {
  assert.deepEqual(Object.keys(UNITS), ['g', 'kg', 'ml', 'L', 'un']);
});

test('toBase converts grams to kilograms', () => {
  assert.deepEqual(toBase(350, 'g'), { dim: 'mass', qty: 0.35 });
});

test('toBase converts millilitres to litres', () => {
  assert.deepEqual(toBase(350, 'ml'), { dim: 'volume', qty: 0.35 });
});

test('toBase keeps base units unchanged', () => {
  assert.deepEqual(toBase(2, 'kg'), { dim: 'mass', qty: 2 });
  assert.deepEqual(toBase(2, 'L'), { dim: 'volume', qty: 2 });
  assert.deepEqual(toBase(6, 'un'), { dim: 'count', qty: 6 });
});

test('toBase returns null for an unknown unit', () => {
  assert.equal(toBase(1, 'lb'), null);
});

test('each dimension has a base unit label', () => {
  assert.deepEqual(BASE_UNIT, { mass: 'kg', volume: 'L', count: 'un' });
});

test('parseGrams reads a weight typed in kg, as scale labels print it', () => {
  assert.equal(parseGrams('1,250'), 1250);
  assert.equal(parseGrams('0,35'), 350);
  assert.equal(parseGrams('2'), 2000);
});

test('parseGrams rejects empty, non-numeric and sub-gram weights', () => {
  for (const bad of ['', 'abc', '0', '0,0004', null]) assert.equal(parseGrams(bad), null, `input ${JSON.stringify(bad)}`);
});

test('parsePack reads a multipack as count × size, however the × is typed', () => {
  for (const typed of ['12x350', '12 x 350', '12×350', '12 × 350', '12X350', ' 12 x350 ']) {
    assert.deepEqual(parsePack(typed, { grouping: true }), { packs: 12, size: 350, qty: 4200 }, typed);
  }
  assert.deepEqual(parsePack('6 × 1,5'), { packs: 6, size: 1.5, qty: 9 });
});

test('a pack size follows its unit\'s rule: thousands in g, ml and un, decimals in kg and L', () => {
  assert.equal(parsePack('2 x 1.000', { grouping: true }).qty, 2000);
  assert.equal(parsePack('2 x 1.000').qty, 2);
});

test('a plain quantity is one pack', () => {
  assert.deepEqual(parsePack('350', { grouping: true }), { packs: 1, size: 350, qty: 350 });
  assert.deepEqual(parsePack('1,5'), { packs: 1, size: 1.5, qty: 1.5 });
});

test('parsePack rejects a pack count that isn\'t a whole number first, and anything else malformed', () => {
  const malformed = ['', 'x350', '12x', '0x350', '12x0', '350x12x2', '1.000x2', '1,5x350', '12xabc', '12 x x 350'];
  for (const bad of malformed) {
    assert.equal(parsePack(bad, { grouping: true }), null, JSON.stringify(bad));
  }
});

test('only Compare reads packs: a single quantity or a scale weight never does', () => {
  assert.equal(parseQuantity('12x350'), null);
  assert.equal(parseGrams('2x1,250'), null);
});

test('packLabel writes a pack the way the pack prints it, for the cart line\'s name', () => {
  assert.equal(packLabel('12x350'), '12 × 350');
  assert.equal(packLabel(' 6 x 1,5 '), '6 × 1,5');
  assert.equal(packLabel(' 350 '), '350');
});
