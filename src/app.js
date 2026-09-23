// DOM wiring only: events → reducers → save → render. Business rules live in the other modules.

import { parseMoney, formatMoney, formatMoneyParts } from './money.js';
import { initialCart, cartReducer, total, counts } from './cart.js';
import { compare } from './compare.js';
import { UNITS, BASE_UNIT } from './units.js';
import { t, detectLang, formatPct } from './i18n.js';
import { load, save } from './store.js';
import { effectiveTheme, toggledTheme } from './theme.js';

const $ = (id) => document.getElementById(id);
const TOAST_MS = 5000;
const MAX_QTY = 999;

// Reading window.localStorage itself throws when storage is blocked; store.js copes with null.
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const blankOption = (unit = 'g') => ({ label: '', price: '', qty: '', unit });
const initialCompare = () => ({ options: [blankOption(), blankOption()] });

const saved = load(storage);
let state = {
  cart: saved?.cart ?? initialCart(),
  compare: saved?.compare ?? initialCompare(),
  lang: saved?.lang ?? detectLang(navigator.language),
  tab: saved?.tab ?? 'cart',
  theme: saved?.theme ?? null,
};

const tr = (key, params) => t(key, state.lang, params);

function persist(next) {
  state = next;
  save(storage, state);
}

function dispatchCart(action) {
  persist({ ...state, cart: cartReducer(state.cart, action) });
  renderCart();
}

/* ---------- rendering helpers ---------- */

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children);
  return el;
}

function tagPrice(el, cents) {
  const p = formatMoneyParts(cents, state.lang);
  el.replaceChildren(
    h('span', { class: 'cur', text: p.currency }),
    h('span', { class: 'whole', text: p.whole }),
    h('span', { class: 'cents', text: p.decimal + p.fraction }),
  );
  el.setAttribute('aria-label', formatMoney(cents, state.lang));
}

/** Re-rendering replaces buttons; put focus back on the element with the same data-key. */
function keepingFocus(render) {
  const key = document.activeElement?.dataset?.key;
  render();
  if (key) document.querySelector(`[data-key="${key}"]`)?.focus();
}

function applyLang() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'pt-BR';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = tr(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', tr(el.dataset.i18nAriaLabel));
  }
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', b.dataset.lang === state.lang);
  $('price').placeholder = pricePlaceholder();
}

const pricePlaceholder = () => formatMoney(0, state.lang).replace(/^\D+/, '');
const unitLabel = (unit) => (unit === 'un' ? tr('unitCount') : unit);

/* ---------- cart ---------- */

function lineView(item, n) {
  const id = item.id;
  return h(
    'li',
    { class: 'line', 'data-id': id },
    h('input', {
      class: 'line-name',
      value: item.name,
      placeholder: tr('itemN', { n }),
      'aria-label': tr('name'),
      enterkeyhint: 'done',
      'data-action': 'rename',
    }),
    h('span', { class: 'line-sub', text: formatMoney(item.priceCents * item.qty, state.lang) }),
    h('span', { class: 'line-each', text: `${formatMoney(item.priceCents, state.lang)} × ${item.qty}` }),
    h(
      'div',
      { class: 'line-ctl' },
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', 'data-action': 'dec', 'data-key': `dec-${id}`, 'aria-label': tr('oneLess') }, '−'),
        h('span', { text: item.qty }),
        h('button', { type: 'button', 'data-action': 'inc', 'data-key': `inc-${id}`, 'aria-label': tr('oneMore') }, '+'),
      ),
      h('button', { type: 'button', class: 'remove', 'data-action': 'remove', 'aria-label': tr('remove') }, '✕'),
    ),
  );
}

function renderCart() {
  const { cart } = state;
  keepingFocus(() => {
    // Newest first, so the line just added sits right under the entry form.
    $('lines').replaceChildren(...cart.items.map((item, i) => lineView(item, i + 1)).reverse());
  });
  $('empty').hidden = cart.items.length > 0;
  tagPrice($('total'), total(cart));
  const { units } = counts(cart);
  $('count').textContent = tr('itemsCount', { n: units });
  $('clear').disabled = cart.items.length === 0;
  renderBadge(units);
}

let badgeUnits = null;

/** Item count on the Cart tab; bumps when it grows, so Add to cart from Compare is visible. */
function renderBadge(units) {
  const badge = $('cart-badge');
  badge.hidden = units === 0;
  badge.textContent = units > 99 ? '99+' : units;
  if (badgeUnits !== null && units > badgeUnits) {
    badge.classList.remove('bump');
    void badge.offsetWidth; // restart the animation
    badge.classList.add('bump');
  }
  badgeUnits = units;
  // The icon is aria-hidden, so carry the count in the tab's accessible name.
  if (units) $('tab-cart').setAttribute('aria-label', `${tr('tabCart')}, ${tr('itemsCount', { n: units })}`);
  else $('tab-cart').removeAttribute('aria-label');
}

function readQty() {
  const n = Number.parseInt($('qty').value, 10);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_QTY) : 1;
}

function setPriceError(key) {
  $('price-error').textContent = key ? tr(key) : '';
  $('price').setAttribute('aria-invalid', Boolean(key));
}

$('entry').addEventListener('submit', (e) => {
  e.preventDefault();
  const priceCents = parseMoney($('price').value);
  if (priceCents === null) {
    setPriceError('invalidPrice');
    $('price').focus();
    return;
  }
  dispatchCart({ type: 'add', priceCents, qty: readQty(), name: $('name').value });
  $('entry').reset();
  setPriceError(null);
  $('price').focus();
});

$('price').addEventListener('input', () => setPriceError(null));

$('entry').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]')?.dataset.step;
  if (step) $('qty').value = Math.max(1, Math.min(MAX_QTY, readQty() + Number(step)));
});

$('lines').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  const id = Number(e.target.closest('[data-id]')?.dataset.id);
  const item = state.cart.items.find((i) => i.id === id);
  if (!item) return;
  if (action === 'inc') dispatchCart({ type: 'setQty', id, qty: Math.min(MAX_QTY, item.qty + 1) });
  if (action === 'dec' && item.qty > 1) dispatchCart({ type: 'setQty', id, qty: item.qty - 1 });
  if (action === 'remove' || (action === 'dec' && item.qty === 1)) {
    dispatchCart({ type: 'remove', id });
    showToast('removed', { undo: true });
  }
});

// Renaming saves without re-rendering, so the list never swaps inputs under the user's finger.
$('lines').addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'rename') return;
  const id = Number(e.target.closest('[data-id]').dataset.id);
  persist({ ...state, cart: cartReducer(state.cart, { type: 'rename', id, name: e.target.value }) });
});

$('lines').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.action === 'rename') e.target.blur();
});

$('clear').addEventListener('click', () => {
  dispatchCart({ type: 'clear' });
  showToast('cleared', { undo: true });
});

/* ---------- compare ---------- */

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
      h(
        'label',
        {},
        tr('unit'),
        h(
          'select',
          { class: 'unit-select', 'data-field': 'unit' },
          ...Object.keys(UNITS).map((u) => h('option', { value: u, selected: u === opt.unit, text: unitLabel(u) })),
        ),
      ),
    ),
    h('div', { class: 'option-result' }),
  );
}

/** Rebuilds the cards; only for structural changes, never while the user is typing in one. */
function renderOptions() {
  const { options } = state.compare;
  $('options').replaceChildren(...options.map((opt, i) => optionView(opt, i, options.length > 2)));
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

  const valid = results.filter(Boolean).length;
  $('compare-msg').textContent = error ? tr(error) : valid < 2 ? tr('compareHint') : '';
  $('compare-msg').classList.toggle('error', Boolean(error));
}

$('options').addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  const i = Number(e.target.closest('[data-index]').dataset.index);
  setCompare(state.compare.options.map((o, j) => (j === i ? { ...o, [field]: e.target.value } : o)));
  renderResults();
});

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

/* ---------- tabs ---------- */

function renderTab() {
  for (const b of document.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === state.tab;
    b.setAttribute('aria-selected', on);
    $(`panel-${b.dataset.tab}`).hidden = !on;
  }
}

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    persist({ ...state, tab: b.dataset.tab });
    renderTab();
  });
}

/* ---------- theme ---------- */

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m, m.content]);

function renderTheme() {
  const root = document.documentElement;
  if (state.theme) root.dataset.theme = state.theme;
  else delete root.dataset.theme;

  const shown = effectiveTheme(state.theme, systemDark.matches);
  $('theme').dataset.showing = shown;
  $('theme').setAttribute('aria-label', tr(shown === 'dark' ? 'themeToLight' : 'themeToDark'));

  // A forced theme must also recolour the browser chrome, whatever the system says.
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  for (const [meta, systemColor] of themeMetas) meta.content = state.theme ? paper : systemColor;
}

$('theme').addEventListener('click', () => {
  persist({ ...state, theme: toggledTheme(state.theme, systemDark.matches) });
  renderTheme();
});

systemDark.addEventListener('change', renderTheme);

/* ---------- toast ---------- */

let toastTimer;

function showToast(key, { undo = false } = {}) {
  $('toast-text').dataset.i18n = key;
  $('toast-text').textContent = tr(key);
  $('toast-undo').hidden = !undo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  $('toast').hidden = true;
}

$('toast-undo').addEventListener('click', () => {
  dispatchCart({ type: 'undo' });
  hideToast();
});

/* ---------- language ---------- */

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    persist({ ...state, lang: b.dataset.lang });
    applyLang();
    renderTheme();
    renderCart();
    renderOptions();
  });
}

/* ---------- boot ---------- */

applyLang();
renderTheme();
renderCart();
renderOptions();
renderTab();
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator) {
  const firstInstall = !navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => firstInstall && showToast('offlineReady'))
    .catch(() => {}); // no SW (e.g. private mode): the app still works while the page is open
}
