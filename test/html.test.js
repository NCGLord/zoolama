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

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The elements directly inside <body>, as [tag name, attributes]. */
function bodyChildren() {
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'));
  const children = [];
  let depth = 0;
  for (const [, close, name, attrs, selfClosing] of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    if (close) depth--;
    else {
      if (depth === 0) children.push([name.toLowerCase(), attrs]);
      if (!selfClosing && !VOID.has(name.toLowerCase())) depth++;
    }
  }
  return children;
}

// Screen readers move between landmarks, and anything outside one is easy to miss (axe: region). So what the page
// shows sits in the header, main or footer (the bottom dock); besides those, <body> holds only dialogs, which are
// their own world while open, templates and hidden inputs.
test('everything on screen sits in a landmark: body holds only header, main, footer, dialogs and templates', () => {
  const children = bodyChildren();
  assert.ok(children.length > 0);
  for (const [name, attrs] of children) {
    const hiddenInput = name === 'input' && /\shidden\b/.test(attrs);
    const allowed = ['header', 'main', 'footer', 'dialog', 'template'].includes(name) || hiddenInput;
    assert.ok(allowed, `<body> holds a <${name}${attrs}> outside any landmark`);
  }
});
