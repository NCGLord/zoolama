import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPDATE_CHECK_MS,
  UPDATE_POLL_MS,
  dueForUpdateCheck,
  mergeLogs,
  nextUpdateState,
  reloadsForUpdate,
} from '../src/update.js';

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

// About shows the app's update state as of its latest look, whoever looked; a version that has taken over and waits to
// go on screen outranks any look after it, since the page will run it.
test('the update state is the latest look, except that a waiting version outranks every later look', () => {
  assert.equal(nextUpdateState(null, 'found'), 'found');
  assert.equal(nextUpdateState('offline', 'latest'), 'latest');
  assert.equal(nextUpdateState('found', 'failed'), 'failed');
  for (const next of ['checking', 'latest', 'offline', 'found', 'failed']) {
    assert.equal(nextUpdateState('waiting', next), 'waiting');
  }
});

test("the update log merges each copy's steps in time order, keeping the latest", () => {
  const app = [[1, 'start A'], [4, 'look own'], [6, 'latest']];
  const tab = [[2, 'start B'], [5, 'look asked']];
  assert.deepEqual(mergeLogs([app, tab]), [[1, 'start A'], [2, 'start B'], [4, 'look own'], [5, 'look asked'], [6, 'latest']]);
  assert.deepEqual(mergeLogs([app, tab], 2), [[5, 'look asked'], [6, 'latest']]);
  assert.deepEqual(mergeLogs([]), []);
});

test('steps logged in the same millisecond keep the order they were logged in', () => {
  assert.deepEqual(mergeLogs([[[3, 'controller changed'], [3, 'taken over (event)'], [3, 'waiting']]]), [
    [3, 'controller changed'],
    [3, 'taken over (event)'],
    [3, 'waiting'],
  ]);
});
