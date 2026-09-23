import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, LOCALES, t, detectLang, formatPct } from '../src/i18n.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('pt and en define exactly the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.pt).sort());
});

test('no translation is empty', () => {
  for (const [lang, dict] of Object.entries(STRINGS)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.ok(value.trim(), `${lang}.${key} is empty`);
    }
  }
});

test('each key uses the same placeholders in both languages', () => {
  for (const key of Object.keys(STRINGS.pt)) {
    assert.deepEqual(placeholders(STRINGS.en[key]), placeholders(STRINGS.pt[key]), key);
  }
});

test('every language has a number-format locale', () => {
  assert.deepEqual(Object.keys(LOCALES).sort(), Object.keys(STRINGS).sort());
});

test('t looks up the string for the language', () => {
  assert.equal(t('tabCart', 'pt'), 'Carrinho');
  assert.equal(t('tabCart', 'en'), 'Cart');
});

test('t fills {placeholders} from params', () => {
  assert.equal(t('itemN', 'en', { n: 3 }), 'Item 3');
});

test('t returns the key itself for an unknown key, so a gap is visible rather than blank', () => {
  assert.equal(t('noSuchKey', 'pt'), 'noSuchKey');
});

test('detectLang picks en only for English browsers and defaults to pt', () => {
  assert.equal(detectLang('en-US'), 'en');
  assert.equal(detectLang('pt-BR'), 'pt');
  assert.equal(detectLang('es-AR'), 'pt');
  assert.equal(detectLang(undefined), 'pt');
});

test('formatPct rounds to one decimal in the language format', () => {
  assert.equal(formatPct(50.3345, 'pt'), '50,3');
  assert.equal(formatPct(50.3345, 'en'), '50.3');
  assert.equal(formatPct(20, 'pt'), '20');
});

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('every data-i18n key used in index.html exists', () => {
  for (const [, key] of html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) {
    assert.ok(key in STRINGS.pt, `index.html uses unknown key ${key}`);
  }
});

test('data-i18n elements hold only text, since applyLang replaces their textContent', () => {
  const clobbered = [...html.matchAll(/<(\w+)\s[^>]*?\bdata-i18n="([^"]+)"[^>]*>[^<]*<(?!\/\1>)/g)].map((m) => m[2]);
  assert.deepEqual(clobbered, [], 'these elements would lose their child markup on a language switch');
});

test('the header wordmark is an image named "Zoolama" for screen readers', () => {
  const brand = html.match(/<h1 class="brand">([\s\S]*?)<\/h1>/)[1];
  assert.match(brand, /<svg[^>]*role="img"[^>]*aria-label="Zoolama"/);
});

test('language buttons are flags named in their own language for screen readers', () => {
  for (const [code, lang, name] of [['pt', 'pt-BR', 'Português'], ['en', 'en', 'English']]) {
    const button = html.match(new RegExp(`<button[^>]*data-lang="${code}"[^>]*>([\\s\\S]*?)</button>`));
    assert.ok(button, `no ${code} button`);
    assert.match(button[0], new RegExp(`aria-label="${name}"`));
    assert.match(button[0], new RegExp(`lang="${lang}"`));
    assert.match(button[1], /<svg/, `${code} button should draw a flag`);
  }
});
