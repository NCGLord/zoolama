import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sep } from 'node:path';
import { ROOT, readSw } from '../tools/sw-assets.mjs';

// The module graph of src/, as ./src/… paths (the way ASSETS spells them).
const { assets } = readSw();
const modules = readdirSync(new URL('src/', ROOT), { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .map((f) => `./src/${f.split(sep).join('/')}`);

// Static imports and re-exports, multi-line ones included, plus bare side-effect imports.
const SPECIFIERS = [/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g];

const graph = new Map(
  modules.map((m) => {
    const source = readFileSync(new URL(m, ROOT), 'utf8');
    const deps = SPECIFIERS.flatMap((re) => [...source.matchAll(re)].map((x) => x[1]))
      .filter((s) => s.startsWith('.'))
      .map((s) => `.${new URL(s, new URL(m, 'file:///')).pathname}`);
    return [m, deps];
  }),
);

test('every module a module imports exists and is precached', () => {
  for (const [m, deps] of graph) for (const d of deps) assert.ok(assets.includes(d), `${m} imports ${d}, which is not in ASSETS`);
});

test('nothing imports app.js: it is the entry point, and importing it would run the app twice', () => {
  for (const [m, deps] of graph) assert.ok(!deps.includes('./src/app.js'), `${m} imports app.js`);
});

// A cycle only breaks when a module's top level reads a binding of one that hasn't finished evaluating. That is easy
// to add by accident and fails on the phone as a blank app, so the graph stays acyclic.
test('the module graph has no cycle', () => {
  const done = new Set();
  const path = [];
  const visit = (m) => {
    if (done.has(m)) return;
    const at = path.indexOf(m);
    assert.equal(at, -1, `import cycle: ${[...path.slice(at), m].join(' → ')}`);
    path.push(m);
    for (const d of graph.get(m) ?? []) visit(d);
    path.pop();
    done.add(m);
  };
  for (const m of graph.keys()) visit(m);
});
