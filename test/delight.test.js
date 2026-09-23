import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOutCubic, tweenCents, celebrates, newWinners } from '../src/delight.js';

test('the count-up eases out: fast at first, settling at the end', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test('tweenCents runs from the old total to the new one in whole cents', () => {
  assert.equal(tweenCents(4889, 5688, 0), 4889);
  assert.equal(tweenCents(4889, 5688, 1), 5688);
  assert.equal(tweenCents(4889, 5688, 0.5), 5588); // 4889 + 799 × 0.875
  assert.equal(tweenCents(5688, 4889, 1.7), 4889); // progress past the end is clamped
});

test('finishing a trip is celebrated unless it went over the budget', () => {
  assert.equal(celebrates(4889, null), true);
  assert.equal(celebrates(10000, 10000), true);
  assert.equal(celebrates(10001, 10000), false);
});

test('newWinners lists options that became cheapest since the last look', () => {
  assert.deepEqual(newWinners(new Set([0]), new Set([1])), [1]);
  assert.deepEqual(newWinners(new Set([1]), new Set([1])), []);
  assert.deepEqual(newWinners(new Set([0]), new Set([0, 2])), [2]);
  assert.deepEqual(newWinners(new Set(), new Set()), []);
});
