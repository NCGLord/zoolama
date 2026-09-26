import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rovingIndex } from '../src/tabs.js';
import { TABS } from '../src/state.js';

// The saved tab and a shortcut's ?tab= are both checked against TABS, so a tab missing from it could never be reopened.
test('the tabs the app knows are the tab bar\'s buttons, in order', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]), TABS);
});

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
