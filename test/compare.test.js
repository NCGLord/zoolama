import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/compare.js';

const opt = (price, qty, unit) => ({ price, qty, unit });
const round1 = (n) => Math.round(n * 10) / 10;

test('the bigger pack wins when its price per kg is lower: 1 kg R$ 8,99 vs 5 kg R$ 29,90', () => {
  const { dim, error, results } = compare([opt('8,99', '1', 'kg'), opt('29,90', '5', 'kg')]);
  assert.equal(dim, 'mass');
  assert.equal(error, null);
  assert.equal(results[1].unitPrice, 598);
  assert.equal(results[1].isCheapest, true);
  assert.equal(results[0].isCheapest, false);
  assert.equal(round1(results[0].pctMore), 50.3);
});

test('grams and kilograms are compared on the same base', () => {
  const { results } = compare([opt('5,00', '500', 'g'), opt('12,00', '1', 'kg')]);
  assert.equal(results[0].unitPrice, 1000);
  assert.equal(results[0].isCheapest, true);
  assert.equal(round1(results[1].pctMore), 20);
});

test('mixing mass and volume is an error and nothing is ranked', () => {
  const { error, results } = compare([opt('5,00', '500', 'g'), opt('5,00', '500', 'ml')]);
  assert.equal(error, 'mixedUnits');
  assert.ok(results.every((r) => r.isCheapest === false && r.pctMore === null));
});

test('incomplete options are skipped, keeping their slot as null', () => {
  const { results } = compare([opt('8,99', '1', 'kg'), opt('', '1', 'kg'), opt('29,90', '5', 'kg')]);
  assert.equal(results[1], null);
  assert.equal(results[2].isCheapest, true);
});

test('with fewer than two valid options, unit price is shown but nothing is ranked', () => {
  const { error, results } = compare([opt('8,99', '2', 'L'), opt('3,00', '', 'L')]);
  assert.equal(error, null);
  assert.equal(results[0].unitPrice, 449.5);
  assert.equal(results[0].isCheapest, false);
  assert.equal(results[0].pctMore, null);
});

test('equal unit prices are all marked cheapest', () => {
  const { results } = compare([opt('10,00', '1', 'kg'), opt('5,00', '500', 'g')]);
  assert.deepEqual(
    results.map((r) => [r.isCheapest, r.pctMore]),
    [
      [true, 0],
      [true, 0],
    ],
  );
});

test('a pack typed as 1.000 g weighs a thousand grams, while 1.250 kg stays one and a quarter kilos', () => {
  const { results } = compare([opt('10', '1.000', 'g'), opt('12', '1', 'kg'), opt('15', '1.250', 'kg')]);
  assert.equal(results[0].unitPrice, 1000); // R$ 10,00/kg
  assert.equal(results[0].isCheapest, true);
  assert.equal(results[2].unitPrice, 1200); // R$ 12,00/kg
});
