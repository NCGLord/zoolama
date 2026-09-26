import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, LOCALES, t, detectLang, formatPct, formatBytes, formatExposure, formatKg, formatZoom } from '../src/i18n.js';
import { MAX_QTY } from '../src/cart.js';

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

test('English follows its UK flag: dates put the day first', () => {
  const date = new Intl.DateTimeFormat(LOCALES.en, { day: '2-digit', month: '2-digit' }).format(new Date(2026, 8, 22));
  assert.equal(date, '22/09');
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

test('formatZoom shows a magnification with one decimal in the language format', () => {
  assert.equal(formatZoom(2.5, 'pt'), '2,5×');
  assert.equal(formatZoom(2.5, 'en'), '2.5×');
  assert.equal(formatZoom(1, 'pt'), '1,0×');
  assert.equal(formatZoom(3.26, 'pt'), '3,3×');
});

test('formatExposure shows EV signed, with one decimal, the way camera apps do', () => {
  assert.equal(formatExposure(2 / 3, 'pt'), '+0,7');
  assert.equal(formatExposure(-1, 'pt'), '−1,0');
  assert.equal(formatExposure(0, 'pt'), '0,0');
  assert.equal(formatExposure(0.02, 'pt'), '0,0', 'no sign on what rounds to zero');
  assert.equal(formatExposure(-0.02, 'pt'), '0,0', 'nor on a tiny negative, which rounds to -0');
  assert.equal(formatExposure(2 / 3, 'en'), '+0.7');
});

test("formatBytes counts in thousands, as Android's storage screen does: kB whole, MB and GB to one decimal", () => {
  assert.equal(formatBytes(340_000, 'pt'), '340 kB');
  assert.equal(formatBytes(1_234_567, 'pt'), '1,2 MB');
  assert.equal(formatBytes(1_234_567, 'en'), '1.2 MB');
  assert.equal(formatBytes(12_000_000, 'pt'), '12 MB');
  assert.equal(formatBytes(1_500_000_000, 'pt'), '1,5 GB');
  assert.equal(formatBytes(999_499, 'pt'), '999 kB');
  assert.equal(formatBytes(0, 'pt'), '0 kB');
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

test('formatKg shows grams as kg with three decimals in the language format', () => {
  assert.equal(formatKg(1250, 'pt'), '1,250 kg');
  assert.equal(formatKg(350, 'en'), '0.350 kg');
});

// The cap is written into these words rather than passed in: an error on screen is retranslated from its key alone.
test('the offer errors name the most units an offer can ask for', () => {
  for (const lang of Object.keys(STRINGS)) {
    for (const key of ['invalidDeal', 'invalidMultibuy']) {
      assert.match(STRINGS[lang][key], new RegExp(`\\b${MAX_QTY}\\b`), `${lang}.${key}`);
    }
  }
});
