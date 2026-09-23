import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from '../src/share.js';

const items = [
  { name: 'Leite', priceCents: 450, qty: 2 },
  { name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 },
  { name: 'Arroz 5 kg', priceCents: 2990, qty: 1 },
  { name: '', priceCents: 350, qty: 1 },
];
const plain = (s) => s.replace(/ /g, ' '); // currency formats put a no-break space after R$

test('the shared cart lists each line, weighed ones by kg, then the total, in Portuguese', () => {
  assert.equal(
    plain(shareText(items, { lang: 'pt', title: 'Zoolama — Carrinho' })),
    [
      'Zoolama — Carrinho',
      '- Leite: 2 × R$ 4,50 = R$ 9,00',
      '- Tomate: 1,250 kg × R$ 7,99/kg = R$ 9,99',
      '- Arroz 5 kg: R$ 29,90',
      '- Item 4: R$ 3,50',
      'Total: R$ 52,39 — Itens: 5',
    ].join('\n'),
  );
});

test('the shared cart follows the English number format and wording', () => {
  assert.equal(
    plain(shareText(items.slice(0, 2), { lang: 'en', title: 'Zoolama — Cart' })),
    ['Zoolama — Cart', '- Leite: 2 × R$4.50 = R$9.00', '- Tomate: 1.250 kg × R$7.99/kg = R$9.99', 'Total: R$18.99 — Items: 3'].join(
      '\n',
    ),
  );
});
