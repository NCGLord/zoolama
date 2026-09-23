import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rovingIndex } from '../src/tabs.js';

test('arrows move to the next and previous tab, wrapping around the ends', () => {
  assert.equal(rovingIndex(0, 'ArrowRight', 3), 1);
  assert.equal(rovingIndex(2, 'ArrowRight', 3), 0);
  assert.equal(rovingIndex(1, 'ArrowLeft', 3), 0);
  assert.equal(rovingIndex(0, 'ArrowLeft', 3), 2);
});

test('Home and End jump to the first and last tab', () => {
  assert.equal(rovingIndex(1, 'Home', 3), 0);
  assert.equal(rovingIndex(1, 'End', 3), 2);
});

test('any other key, or a focus outside the tabs, moves nothing', () => {
  for (const key of ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Tab', 'a']) assert.equal(rovingIndex(1, key, 3), null, key);
  assert.equal(rovingIndex(-1, 'ArrowRight', 3), null);
});
