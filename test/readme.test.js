import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const start = readme.indexOf('\n## Layout');
const layout = readme.slice(start, readme.indexOf('\n## ', start + 1));

const files = (dir, ext) =>
  readdirSync(new URL(dir, import.meta.url), { recursive: true })
    .filter((f) => ext.test(f))
    .map((f) => basename(f));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The Layout table is the map of the code. A module missing from it is one a newcomer never learns is there.
test('the README layout names every module in src/ and every tool', () => {
  assert.ok(start !== -1, 'README.md has a Layout section');
  // src/ modules go by file name (`cart.js`) or, in the src/ui/ row, by bare name (`cart-view`).
  for (const file of files('../src/', /\.js$/)) {
    const name = new RegExp(`[\`/]${escape(file.replace(/\.js$/, ''))}(\\.js)?\``);
    assert.match(layout, name, `README Layout doesn't mention ${file}`);
  }
  for (const file of files('../tools/', /./)) {
    assert.ok(layout.includes(`\`${file}\``), `README Layout doesn't mention ${file}`);
  }
});
