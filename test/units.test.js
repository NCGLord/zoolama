import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, BASE_UNIT, parseQuantity, toBase, parseGrams } from '../src/units.js';

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
