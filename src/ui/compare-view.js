// The Compare tab: option cards, the live unit-price ranking, and Add to cart for the cheapest.

import { compare } from '../compare.js';
import { newWinners } from '../delight.js';
import { formatPct } from '../i18n.js';
import { parseMoney } from '../money.js';
import { BASE_UNIT, UNITS } from '../units.js';
import { blankOption, initialCompare, persist, state } from './app-state.js';
import { dispatchCart } from './cart-store.js';
import { $, h, replay } from './dom.js';
import { pricePlaceholder, tagPrice, tr, unitLabel } from './text.js';
import { showToast } from './toast.js';

function setCompare(options) {
  persist({ ...state, compare: { ...state.compare, options } });
}

function optionView(opt, i, removable) {
  return h(
    'li',
    { class: 'option', 'data-index': i },
    h(
      'div',
      { class: 'option-head' },
      h('span', { class: 'option-title', text: tr('optionN', { n: i + 1 }) }),
      removable
        ? h('button', { type: 'button', class: 'remove', 'data-action': 'remove-option', 'aria-label': tr('removeOption') }, '✕')
        : '',
    ),
    h('input', { class: 'option-label', 'data-field': 'label', value: opt.label, placeholder: tr('label'), 'aria-label': tr('label') }),
    h(
      'div',
      { class: 'option-fields' },
      h(
        'label',
        {},
        tr('price'),
        h(
          'span',
          { class: 'money-field' },
          h('span', { 'aria-hidden': 'true', text: 'R$' }),
          h('input', { 'data-field': 'price', 'data-key': `price-${i}`, inputmode: 'decimal', value: opt.price, placeholder: pricePlaceholder() }),
        ),
      ),
      h('label', {}, tr('quantity'), h('input', { class: 'qty-field', 'data-field': 'qty', inputmode: 'decimal', value: opt.qty, placeholder: '0' })),
      unitChoice(opt.unit, i),
    ),
    h('div', { class: 'option-result' }),
  );
}

/** One tap per unit: g kg · ml L · un, with a gap between families (mass, volume, count). */
function unitChoice(selected, i) {
  return h(
    'fieldset',
    { class: 'unit-choice' },
    h('legend', { class: 'visually-hidden', text: tr('unit') }),
    ...Object.entries(UNITS).map(([u, { dim }], k, all) =>
      h(
        'label',
        { class: k > 0 && all[k - 1][1].dim !== dim ? 'new-family' : null },
        h('input', { type: 'radio', name: `unit-${i}`, value: u, checked: u === selected, 'data-field': 'unit' }),
        h('span', { text: unitLabel(u) }),
      ),
    ),
  );
}

/** Rebuilds the cards; only for structural changes, never while the user is typing in one. */
let lastWinners = null; // cheapest option indexes at the last look; null = don't flip on this render

function renderOptions() {
  const { options } = state.compare;
  $('options').replaceChildren(...options.map((opt, i) => optionView(opt, i, options.length > 2)));
  lastWinners = null; // rebuilt cards (add, remove, reset, language) are not a new winner
  renderResults();
}

/** Updates only the result areas, so typing never loses focus. */
function renderResults() {
  const { options } = state.compare;
  const { error, results } = compare(options);
  document.querySelectorAll('#options .option').forEach((li, i) => {
    const r = results[i];
    li.classList.toggle('winner', Boolean(r?.isCheapest));
    const box = li.querySelector('.option-result');
    if (!r) return box.replaceChildren();

    const price = h('output', { class: 'tag-price' });
    tagPrice(price, Math.round(r.unitPrice));
    const per = BASE_UNIT[UNITS[options[i].unit].dim];
    const kids = [h('span', { class: 'unit-price' }, price, h('span', { class: 'per', text: `/${unitLabel(per)}` }))];
    if (r.isCheapest) {
      kids.push(
        h('span', { class: 'verdict', text: tr('cheapest') }),
        h('button', { type: 'button', class: 'add-winner', 'data-action': 'add-to-cart', text: tr('addToCart') }),
      );
    } else if (r.pctMore !== null) {
      kids.push(h('span', { class: 'verdict dear', text: tr('pctMore', { pct: formatPct(r.pctMore, state.lang) }) }));
    }
    box.replaceChildren(...kids);
  });

  // A newly cheapest tag turns over on its hinge, like a shelf tag being flipped.
  const winners = new Set(results.flatMap((r, i) => (r?.isCheapest ? [i] : [])));
  if (lastWinners) {
    const cards = document.querySelectorAll('#options .option');
    for (const i of newWinners(lastWinners, winners)) replay(cards[i], 'flip');
  }
  lastWinners = winners;

  const valid = results.filter(Boolean).length;
  $('compare-msg').textContent = error ? tr(error) : valid < 2 ? tr('compareHint') : '';
  $('compare-msg').classList.toggle('error', Boolean(error));
}

function onOptionInput(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  const i = Number(e.target.closest('[data-index]').dataset.index);
  setCompare(state.compare.options.map((o, j) => (j === i ? { ...o, [field]: e.target.value } : o)));
  renderResults();
}

// Radios fire 'change' everywhere but 'input' only in newer engines; handling both is harmless.
$('options').addEventListener('input', onOptionInput);
$('options').addEventListener('change', onOptionInput);

$('options').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  const i = Number(e.target.closest('[data-index]')?.dataset.index);
  const opt = state.compare.options[i];
  if (!opt) return;
  if (action === 'remove-option') {
    setCompare(state.compare.options.filter((_, j) => j !== i));
    renderOptions();
    $('add-option').focus();
  }
  if (action === 'add-to-cart') {
    const name = [opt.label.trim(), `${opt.qty.trim()} ${unitLabel(opt.unit)}`].filter(Boolean).join(' ');
    dispatchCart({ type: 'add', priceCents: parseMoney(opt.price), name });
    showToast('addedToCart');
  }
});

$('add-option').addEventListener('click', () => {
  const { options } = state.compare;
  setCompare([...options, blankOption(options.at(-1)?.unit)]);
  renderOptions();
  document.querySelector(`[data-key="price-${options.length}"]`)?.focus();
});

$('reset-compare').addEventListener('click', () => {
  setCompare(initialCompare().options);
  renderOptions();
});

export { renderOptions };
