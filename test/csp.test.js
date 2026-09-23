import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
const directive = (name) => csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === name)?.slice(1);
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

test('index.html sets a Content Security Policy before anything it governs', () => {
  assert.ok(csp, 'the CSP meta tag is there');
  const at = html.indexOf('Content-Security-Policy');
  for (const tag of ['<script', '<link']) assert.ok(at < html.indexOf(tag), `the policy comes before the first ${tag}`);
});

// Editing the pre-paint theme script without updating its hash would block it: the page would flash light first.
test('every inline script is allowed by its hash, and nothing else inline is', () => {
  assert.ok(inlineScripts.length > 0);
  const scriptSrc = directive('script-src');
  for (const [, body] of inlineScripts) {
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    assert.ok(scriptSrc.includes(hash), `script-src should list ${hash}`);
  }
  assert.ok(!scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'unsafe-eval'"));
});

test('no inline style attributes, which style-src would block', () => {
  assert.deepEqual(directive('style-src'), ["'self'"]);
  assert.doesNotMatch(html, /\sstyle="/);
});

test('plugins and base-URL rewrites are off', () => {
  assert.deepEqual(directive('object-src'), ["'none'"]);
  assert.deepEqual(directive('base-uri'), ["'none'"]);
});
