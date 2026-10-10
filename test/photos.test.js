import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EDGE, PHOTO_GRACE_MS, collectable, fitWithin, orphans } from '../src/photos.js';

test('photos are shrunk so the long edge is at most 1280px, which keeps a tag readable', () => {
  assert.equal(MAX_EDGE, 1280);
});

test('fitWithin shrinks a landscape photo by its width', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1280, height: 960 });
});

test('fitWithin shrinks a portrait photo by its height', () => {
  assert.deepEqual(fitWithin(3000, 4000), { width: 960, height: 1280 });
});

test('fitWithin never enlarges a small photo', () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

test('fitWithin rounds to whole pixels', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(3000, 2001), { width: 1280, height: 854 });
});

test('orphans are stored photos that nothing keeps', () => {
  assert.deepEqual(orphans(['a', 'b', 'c'], new Set(['b'])), ['a', 'c']);
  assert.deepEqual(orphans(['a'], new Set(['a', 'z'])), []);
});

test('an unused photo this copy saw in use goes at once, however new', () => {
  const now = 1_000_000_000;
  assert.deepEqual(collectable(['gone'], { seen: new Set(['gone']), takenAt: new Map([['gone', now - 1000]]), now }), ['gone']);
});

test("an unused photo this copy never saw in use waits an hour: it may be another copy's shot, waiting for Add", () => {
  const now = 1_000_000_000;
  const takenAt = new Map([
    ['young', now - PHOTO_GRACE_MS + 1],
    ['old', now - PHOTO_GRACE_MS],
  ]);
  assert.deepEqual(collectable(['young', 'old', 'unknown'], { seen: new Set(), takenAt, now }), ['old', 'unknown']);
  assert.equal(PHOTO_GRACE_MS, 60 * 60 * 1000);
});
