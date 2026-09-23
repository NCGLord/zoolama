import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchState } from '../src/launch.js';

const state = (items = []) => ({ cart: { items, nextId: 1, undo: null }, tab: 'history', checking: false });
const item = { id: 1, name: '', priceCents: 450, qty: 1 };

test('?tab= opens that tab', () => {
  assert.equal(launchState(state(), '?tab=compare').tab, 'compare');
  assert.equal(launchState(state(), '?tab=cart').tab, 'cart');
});

test('?check=1 opens the cart in checkout mode, when there is something to check', () => {
  assert.deepEqual(launchState(state([item]), '?check=1'), { ...state([item]), tab: 'cart', checking: true });
  assert.deepEqual(launchState(state(), '?check=1'), { ...state(), tab: 'cart', checking: false });
});

test('any other start leaves the state as it was', () => {
  const s = state();
  for (const search of ['', '?', '?tab=settings', '?check=0', '?utm_source=homescreen']) {
    assert.equal(launchState(s, search), s, search);
  }
});
