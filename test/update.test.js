import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_CHECK_MS, dueForUpdateCheck } from '../src/update.js';

test('the app re-checks for a new version at most every 30 minutes', () => {
  assert.equal(UPDATE_CHECK_MS, 30 * 60 * 1000);
});

test('a check is not due before the interval has passed', () => {
  assert.equal(dueForUpdateCheck(1_000 + UPDATE_CHECK_MS - 1, 1_000), false);
});

test('a check is due once the interval has passed', () => {
  assert.equal(dueForUpdateCheck(1_000 + UPDATE_CHECK_MS, 1_000), true);
  assert.equal(dueForUpdateCheck(1_000 + 5 * UPDATE_CHECK_MS, 1_000), true);
});
