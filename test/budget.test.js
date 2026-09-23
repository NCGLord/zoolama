import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetStatus } from '../src/budget.js';

test('with no budget set there is nothing to report', () => {
  assert.equal(budgetStatus(4789, null), null);
});

test('under budget reports what is left', () => {
  assert.deepEqual(budgetStatus(4789, 30000), { budgetCents: 30000, leftCents: 25211, overCents: 0, over: false });
});

test('spending exactly the budget leaves zero and is not over', () => {
  assert.deepEqual(budgetStatus(30000, 30000), { budgetCents: 30000, leftCents: 0, overCents: 0, over: false });
});

test('over budget reports by how much', () => {
  assert.deepEqual(budgetStatus(31240, 30000), { budgetCents: 30000, leftCents: 0, overCents: 1240, over: true });
});
