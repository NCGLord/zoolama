import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../.github/workflows/', import.meta.url);
const uses = readdirSync(dir)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => readFileSync(new URL(f, dir), 'utf8'))
  .flatMap((yaml) => [...yaml.matchAll(/^\s*(?:-\s*)?uses:\s*(.+?)\s*$/gm)].map((m) => m[1]));
const PINNED = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40}) # (v\d+\.\d+\.\d+)$/;

// A tag like @v7 can be moved to other code by whoever controls the action's repository, and the next run would use it,
// the deploy with the Pages token. A commit SHA can't be moved. The comment names the release, for people and for
// update bots, which rewrite both together.
test('every action a workflow uses is pinned to a full commit SHA, with its release in a comment', () => {
  assert.ok(uses.length > 0, 'the workflows use actions');
  for (const u of uses) assert.match(u, PINNED);
});

test('an action used more than once is pinned to the same commit every time', () => {
  const pins = new Map();
  for (const u of uses) {
    const [, action, sha, release] = u.match(PINNED) ?? [];
    if (!action) continue; // the test above reports it
    assert.equal(pins.get(action) ?? `${sha} # ${release}`, `${sha} # ${release}`, `${action} is pinned two ways`);
    pins.set(action, `${sha} # ${release}`);
  }
});
