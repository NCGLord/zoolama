import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveTheme, toggledTheme } from '../src/theme.js';
import { KEY } from '../src/store.js';

test('with no saved choice, the theme follows the system', () => {
  assert.equal(effectiveTheme(null, true), 'dark');
  assert.equal(effectiveTheme(null, false), 'light');
});

test('a saved choice wins over the system', () => {
  assert.equal(effectiveTheme('light', true), 'light');
  assert.equal(effectiveTheme('dark', false), 'dark');
});

test('toggling flips whatever is currently shown', () => {
  assert.equal(toggledTheme(null, true), 'light');
  assert.equal(toggledTheme(null, false), 'dark');
  assert.equal(toggledTheme('light', true), 'dark');
});

test('the pre-paint script in index.html reads the same storage key as store.js', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(`localStorage.getItem('${KEY}')`), `index.html must read '${KEY}' before first paint`);
});
