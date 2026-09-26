import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_CHECK_MS, UPDATE_POLL_MS, dueForUpdateCheck } from '../src/update.js';

test('the app checks for a new version every 7 minutes', () => {
  assert.equal(UPDATE_CHECK_MS, 7 * 60 * 1000);
});

test('while open, it looks every minute whether a check is due, so none waits much past 7 minutes', () => {
  assert.equal(UPDATE_POLL_MS, 60 * 1000);
  assert.ok(UPDATE_POLL_MS < UPDATE_CHECK_MS);
});

test('a check is not due before the interval has passed', () => {
  assert.equal(dueForUpdateCheck(1_000 + UPDATE_CHECK_MS - 1, 1_000), false);
});

test('a check is due once the interval has passed', () => {
  assert.equal(dueForUpdateCheck(1_000 + UPDATE_CHECK_MS, 1_000), true);
  assert.equal(dueForUpdateCheck(1_000 + 5 * UPDATE_CHECK_MS, 1_000), true);
});
