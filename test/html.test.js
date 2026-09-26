import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

// One tab panel or one dialog shows at a time, under the header's <h1>, so each one's headings must make sense alone:
// a screen reader's heading list shouldn't jump from the page title straight to a sub-heading.
test('each tab panel and dialog starts its headings at h2 and never skips a level', () => {
  const parts = [...html.matchAll(/<(section|dialog)\b[^>]*\bid="([^"]+)"[\s\S]*?<\/\1>/g)];
  assert.ok(parts.length > 0);
  for (const [part, , id] of parts) {
    let previous = 1;
    for (const [, h] of part.matchAll(/<h([1-6])\b/g)) {
      const level = Number(h);
      assert.ok(level <= previous + 1, `#${id}: an <h${level}> comes after an <h${previous}>`);
      previous = level;
    }
  }
});
