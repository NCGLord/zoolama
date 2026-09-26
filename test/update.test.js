import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_CHECK_MS, UPDATE_POLL_MS, dueForUpdateCheck, reloadsForUpdate } from '../src/update.js';

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

// A new version that has taken over goes on screen by itself when nothing can be lost; otherwise Atualizar offers it.
test('a new version goes on screen at once before the first touch since the app came to the front', () => {
  assert.equal(reloadsForUpdate({ touched: false, visible: true, busy: false }), true);
});

test('once the app has been touched, a new version waits for Atualizar or for the app to go out of sight', () => {
  assert.equal(reloadsForUpdate({ touched: true, visible: true, busy: false }), false);
  assert.equal(reloadsForUpdate({ touched: true, visible: false, busy: false }), true);
});

test('never while something is half-entered or a sheet is open, which a reload would lose', () => {
  for (const touched of [false, true]) {
    for (const visible of [false, true]) assert.equal(reloadsForUpdate({ touched, visible, busy: true }), false);
  }
});

test('asked for (Procurar atualização found one): a new version goes on screen as soon as it lands, unless busy', () => {
  assert.equal(reloadsForUpdate({ asked: true, touched: true, visible: true, busy: false }), true);
  assert.equal(reloadsForUpdate({ asked: true, touched: true, visible: true, busy: true }), false);
});
