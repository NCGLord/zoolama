import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, tillCents, formatMoney, formatMoneyParts } from '../src/money.js';

test('parseMoney reads a comma decimal (pt-BR shelf style)', () => {
  assert.equal(parseMoney('8,99'), 899);
});

test('parseMoney reads a dot decimal', () => {
  assert.equal(parseMoney('8.99'), 899);
});

test('parseMoney pads a single decimal digit', () => {
  assert.equal(parseMoney('8,9'), 890);
});

test('parseMoney reads whole reais', () => {
  assert.equal(parseMoney('8'), 800);
});

test('parseMoney ignores the currency symbol and spaces', () => {
  assert.equal(parseMoney(' R$ 8,99 '), 899);
});

test('parseMoney treats the last separator as decimal when both appear', () => {
  assert.equal(parseMoney('1.299,90'), 129990);
  assert.equal(parseMoney('1,299.90'), 129990);
});

test('parseMoney treats a 3-digit tail as thousands grouping', () => {
  assert.equal(parseMoney('1.299'), 129900);
  assert.equal(parseMoney('1,299'), 129900);
});

test('parseMoney rejects a 3-decimal amount below one real instead of guessing', () => {
  assert.equal(parseMoney('0,500'), null);
});

test('parseMoney rejects empty, non-numeric, zero and negative input', () => {
  for (const bad of ['', '   ', 'abc', '0', '0,00', '-5', null, undefined]) {
    assert.equal(parseMoney(bad), null, `input ${JSON.stringify(bad)}`);
  }
});

test('tillCents reads the digits as a till does: the last two are the cents', () => {
  assert.equal(tillCents('8'), 8);
  assert.equal(tillCents('89'), 89);
  assert.equal(tillCents('899'), 899);
});

test('tillCents reads a field it formatted itself back unchanged, in either language', () => {
  assert.equal(tillCents('8,99'), 899);
  assert.equal(tillCents('1.299,90'), 129990);
  assert.equal(tillCents('1,299.90'), 129990);
});

test('tillCents skips the leading zeros of a small amount, so they never count against the length', () => {
  assert.equal(tillCents('0,089'), 89);
  assert.equal(tillCents('0,0812345678'), 81234567);
});

test('tillCents ignores a digit past eight, as a till ignores a key past its display', () => {
  assert.equal(tillCents('999.999,999'), 99999999);
});

test('tillCents is zero when there are no digits, or only zeros', () => {
  for (const none of ['', 'abc', '0', '0,0', ',', null, undefined]) {
    assert.equal(tillCents(none), 0, `input ${JSON.stringify(none)}`);
  }
});

test('formatMoney uses pt-BR format for pt', () => {
  assert.equal(formatMoney(129990, 'pt').replace(/\s/g, ' '), 'R$ 1.299,90');
});

test('formatMoney uses en-GB format for en, still in BRL', () => {
  assert.equal(formatMoney(129990, 'en').replace(/\s/g, ' '), 'R$1,299.90');
});

test('formatMoneyParts splits a pt amount for shelf-tag display (small raised cents)', () => {
  assert.deepEqual(formatMoneyParts(129990, 'pt'), { currency: 'R$', whole: '1.299', decimal: ',', fraction: '90' });
});

test('formatMoneyParts follows the en separators', () => {
  assert.deepEqual(formatMoneyParts(129990, 'en'), { currency: 'R$', whole: '1,299', decimal: '.', fraction: '90' });
});
