import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savedBytes, storageUsage } from '../src/usage.js';

// What Chromium's navigator.storage.estimate() gives: the photos are IndexedDB; the rest is the app's own files.
const estimate = {
  usage: 421_000,
  quota: 2_000_000_000,
  usageDetails: { caches: 342_000, indexedDB: 74_000, serviceWorkerRegistrations: 5_000 },
};

test("the space in use counts the lists and history, which the browser's estimate leaves out", () => {
  assert.equal(storageUsage(estimate, 12_000).total, 433_000);
});

test('the space in use splits into the app, the photos and the lists, which add up to it', () => {
  const { total, parts } = storageUsage(estimate, 12_000);
  assert.deepEqual(parts, { app: 347_000, photos: 74_000, lists: 12_000 });
  assert.equal(parts.app + parts.photos + parts.lists, total);
});

test('whatever else the browser counts goes with the app, so the parts still add up', () => {
  const details = { caches: 300, indexedDB: 100, fileSystem: 100 };
  const { total, parts } = storageUsage({ usage: 500, usageDetails: details }, 0);
  assert.deepEqual(parts, { app: 400, photos: 100, lists: 0 });
  assert.equal(parts.app + parts.photos + parts.lists, total);
});

test('without a split from the browser, only the total is known', () => {
  assert.deepEqual(storageUsage({ usage: 421_000, quota: 2_000_000_000 }, 12_000), {
    total: 433_000,
    parts: null,
    free: 1_999_579_000,
  });
});

test("the space left is the browser's quota less what it counts, never below none", () => {
  assert.equal(storageUsage(estimate, 12_000).free, 1_999_579_000); // the lists have a limit of their own, apart
  assert.equal(storageUsage({ usage: 10, quota: 5 }, 0).free, 0);
  assert.equal(storageUsage({ usage: 10 }, 0).free, null);
});

test('with no estimate from the browser, nothing is known', () => {
  assert.equal(storageUsage(undefined, 12_000), null);
  assert.equal(storageUsage({}, 12_000), null);
});

// A Web Storage with these entries.
const storage = (entries) => ({
  length: Object.keys(entries).length,
  key: (i) => Object.keys(entries)[i],
  getItem: (k) => entries[k],
});

test("the lists and history are the app's own saved entries, two bytes a character as the browser keeps them", () => {
  assert.equal(savedBytes(storage({ 'zoolama:v1': 'abcd', 'zoolama:v1:history': '' })), 2 * (10 + 4 + 18));
});

test("another site's entries don't count: github.io is shared by every site of its author", () => {
  assert.equal(savedBytes(storage({ 'zoolama:v1': 'ab', 'other-app': 'x'.repeat(100) })), 2 * (10 + 2));
});

test('without storage, or with storage that refuses to be read, nothing is saved', () => {
  assert.equal(savedBytes(null), 0);
  assert.equal(savedBytes({ get length() { throw new Error('blocked'); } }), 0);
});
