import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reads the colour tokens straight from styles.css, so a theme change can't quietly make text hard to read.
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `no ${selector} block in styles.css`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const light = tokens(':root');
const dark = { ...light, ...tokens(":root[data-theme='dark']") };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]. 4.5:1 for text, 3:1 for icons and focus rings (WCAG 2.2 AA).
const PAIRS = [
  ['ink', 'paper', 4.5],
  ['ink', 'surface', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'paper', 4.5],
  ['primary-ink', 'primary', 4.5],
  ['tag-ink', 'tag', 4.5],
  ['pill-ink', 'pill', 3],
  ['dear', 'surface', 4.5],
  ['good', 'surface', 4.5],
  ['dear', 'paper', 4.5], // cart lines and the Compare message sit on the page itself
  ['good', 'paper', 4.5],
  ['focus', 'paper', 3],
];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: every text and icon colour is readable on its background`, () => {
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(theme[fg] && theme[bg], `--${fg} or --${bg} missing in the ${name} theme`);
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= min, `${name}: --${fg} ${theme[fg]} on --${bg} ${theme[bg]} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
    }
  });

  test(`${name} theme: white text on the over-budget tag is readable`, () => {
    assert.ok(theme.over, `--over missing in the ${name} theme`);
    assert.ok(contrast('#ffffff', theme.over) >= 4.5, `white on --over ${theme.over} is ${contrast('#ffffff', theme.over).toFixed(2)}:1`);
  });
}

// The cheapest Compare card turns tag yellow and re-points its tokens; the yellow is the same in both themes.
test('the winning Compare card keeps its muted text and focus ring readable on the yellow', () => {
  const winner = tokens('.option.winner');
  for (const [fg, min] of [['muted', 4.5], ['focus', 3]]) {
    const ratio = contrast(winner[fg], light.tag);
    assert.ok(ratio >= min, `winner: --${fg} ${winner[fg]} on --tag ${light.tag} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
});

test('the system-dark block and the forced-dark block define the same dark palette', () => {
  const start = css.indexOf("@media (prefers-color-scheme: dark)");
  const media = css.slice(start, css.indexOf("}\n}", start));
  const system = Object.fromEntries([...media.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  assert.deepEqual(system, tokens(":root[data-theme='dark']"));
});
