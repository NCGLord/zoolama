import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// The service worker keeps the app offline and brings its updates. A view that throws while boot draws it stops
// src/app.js there, so the worker must already be registered by then: the broken version can still be replaced.
test('boot registers the service worker before it draws any view', () => {
  const register = app.search(/^registerServiceWorker\(\);$/m);
  const draws = [...app.matchAll(/^(?:applyLang|render\w+)\(\);$/gm)];
  assert.notEqual(register, -1, 'app.js registers the service worker at its top level');
  assert.ok(draws.length > 0);
  for (const draw of draws) assert.ok(register < draw.index, `${draw[0]} runs before registerServiceWorker()`);
});
