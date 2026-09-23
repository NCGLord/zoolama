import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

// Two @keyframes with one name don't merge: the last one silently replaces the other everywhere it is used.
test('no @keyframes name is defined twice', () => {
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(twice, [], `defined more than once: ${twice.join(', ')}`);
});
