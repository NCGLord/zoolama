import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineEach, shareText } from '../src/share.js';

const items = [
  { name: 'Leite', priceCents: 450, qty: 2 },
  { name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 },
  { name: 'Arroz 5 kg', priceCents: 2990, qty: 1 },
  { name: '', priceCents: 350, qty: 1 },
];
const plain = (s) => s.replace(/ /g, ' '); // currency formats put a no-break space after R$

test('lineEach writes a line the way the cart shows it: price × qty, or price per kg × weight', () => {
  assert.equal(plain(lineEach(items[0], 'pt')), 'R$ 4,50 × 2');
  assert.equal(plain(lineEach(items[1], 'pt')), 'R$ 7,99/kg × 1,250 kg');
  assert.equal(plain(lineEach(items[1], 'en')), 'R$7.99/kg × 1.250 kg');
});

test('the shared cart lists each line, weighed ones by kg, then the total, in Portuguese', () => {
  assert.equal(
    plain(shareText(items, { lang: 'pt', title: 'Zoolama — Carrinho' })),
    [
      'Zoolama — Carrinho',
      '- Leite: R$ 4,50 × 2 = R$ 9,00',
      '- Tomate: R$ 7,99/kg × 1,250 kg = R$ 9,99',
      '- Arroz 5 kg: R$ 29,90',
      '- Item 4: R$ 3,50',
      'Total: R$ 52,39 — Itens: 5',
    ].join('\n'),
  );
});

test('the shared cart follows the English number format and wording', () => {
  assert.equal(
    plain(shareText(items.slice(0, 2), { lang: 'en', title: 'Zoolama — Cart' })),
    ['Zoolama — Cart', '- Leite: R$4.50 × 2 = R$9.00', '- Tomate: R$7.99/kg × 1.250 kg = R$9.99', 'Total: R$18.99 — Items: 3'].join(
      '\n',
    ),
  );
});

test('a line at its atacado price says so; below the tier it reads as usual', () => {
  const deal = { kind: 'tier', minQty: 6, eachCents: 499 };
  assert.equal(plain(lineEach({ priceCents: 599, qty: 6, deal }, 'pt')), 'R$ 4,99 × 6 (atacado)');
  assert.equal(plain(lineEach({ priceCents: 599, qty: 6, deal }, 'en')), 'R$4.99 × 6 (bulk price)');
  assert.equal(plain(lineEach({ priceCents: 599, qty: 4, deal }, 'pt')), 'R$ 5,99 × 4');
  const text = shareText([{ name: 'Café', priceCents: 599, qty: 6, deal }], { lang: 'pt', title: 'T' });
  assert.equal(plain(text).split('\n')[1], '- Café: R$ 4,99 × 6 (atacado) = R$ 29,94');
});
