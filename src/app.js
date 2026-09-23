// DOM wiring only: events → reducers → save → render. Business rules live in the other modules.

import { parseMoney, formatMoney, formatMoneyParts } from './money.js';
import { initialCart, cartReducer, total, counts } from './cart.js';
import { t, detectLang } from './i18n.js';
import { load, save } from './store.js';

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

const saved = load(storage);
let state = {
  cart: saved?.cart ?? initialCart(),
  lang: saved?.lang ?? detectLang(navigator.language),
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
  $('price').placeholder = formatMoneyParts(0, state.lang).decimal === ',' ? '0,00' : '0.00';
}

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
  $('count').textContent = tr('itemsCount', { n: counts(cart).units });
  $('clear').disabled = cart.items.length === 0;
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
    renderCart();
  });
}

/* ---------- boot ---------- */

applyLang();
renderCart();
navigator.storage?.persist?.().catch(() => {});
