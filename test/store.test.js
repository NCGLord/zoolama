import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, load, save } from '../src/store.js';

class FakeStorage {
  #map = new Map();
  getItem(k) {
    return this.#map.has(k) ? this.#map.get(k) : null;
  }
  setItem(k, v) {
    this.#map.set(k, String(v));
  }
}

const throwing = (method) =>
  Object.assign(new FakeStorage(), {
    [method]() {
      throw new DOMException('nope', 'QuotaExceededError');
    },
  });

const state = { cart: { items: [{ id: 1, name: '', priceCents: 899, qty: 2 }], nextId: 2, undo: null }, lang: 'pt' };

test('load returns null when nothing is stored', () => {
  assert.equal(load(new FakeStorage()), null);
});

test('save then load round-trips the state', () => {
  const s = new FakeStorage();
  assert.equal(save(s, state), true);
  assert.deepEqual(load(s), { schema: 1, ...state });
});

test('corrupt JSON is backed up under :corrupt and load starts fresh', () => {
  const s = new FakeStorage();
  s.setItem(KEY, '{"cart":');
  assert.equal(load(s), null);
  assert.equal(s.getItem(`${KEY}:corrupt`), '{"cart":');
});

test('an unknown schema version is backed up and not loaded', () => {
  const s = new FakeStorage();
  s.setItem(KEY, '{"schema":99}');
  assert.equal(load(s), null);
  assert.equal(s.getItem(`${KEY}:corrupt`), '{"schema":99}');
});

test('save reports false instead of throwing when storage is full', () => {
  assert.equal(save(throwing('setItem'), state), false);
});

test('load returns null instead of throwing when storage is blocked', () => {
  assert.equal(load(throwing('getItem')), null);
});
