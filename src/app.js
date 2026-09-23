// DOM wiring only: events → reducers → save → render. Business rules live in the other modules.

import { parseMoney, formatMoney, formatMoneyParts } from './money.js';
import { initialCart, cartReducer, total, counts, referencedPhotos, checkSummary, linePriceCents, sortItems } from './cart.js';
import { compare } from './compare.js';
import { UNITS, BASE_UNIT, parseGrams } from './units.js';
import { t, detectLang, formatPct, formatKg, LOCALES } from './i18n.js';
import { load, save, loadHistory, saveHistory } from './store.js';
import { tripFromCart, monthlyGroups, storeNames } from './history.js';
import { shareText } from './share.js';
import { effectiveTheme, toggledTheme } from './theme.js';
import { installMode, isIOS } from './install.js';
import { dueForUpdateCheck } from './update.js';
import { shrinkPhoto, newPhotoId, savePhoto, getPhoto, photoIds, deletePhotos, orphans } from './photos.js';
import { budgetStatus } from './budget.js';
import { tweenCents, celebrates, newWinners } from './delight.js';

const $ = (id) => document.getElementById(id);
const TOAST_MS = 5000;
const COUNT_MS = 480; // total count-up
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'); // JS animations check it too; CSS can't reach them
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
  checking: saved?.checking ?? false, // checkout mode ("Conferir no caixa")
  budgetCents: saved?.budgetCents ?? null, // the shopper's limit; survives clearing the cart
  sort: saved?.sort ?? { key: 'added', dir: 'desc' }, // cart list order; newest first by default
};

const tr = (key, params) => t(key, state.lang, params);

function persist(next) {
  state = next;
  save(storage, state);
}

function setCart(cart) {
  persist({ ...state, cart });
  dropStaleUndo();
}

function dispatchCart(action) {
  setCart(cartReducer(state.cart, action));
  renderCart();
  collectPhotos();
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
  document.documentElement.lang = LOCALES[state.lang];
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

const icon = (id) => $(id).content.firstElementChild.cloneNode(true);
const signedMoney = (cents) => `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), state.lang)}`;

function photoCell(item) {
  return item.photoId
    ? h(
        'button',
        { type: 'button', class: 'line-photo', 'data-action': 'view-photo', 'aria-label': tr('photoOf') },
        h('img', { alt: '', 'data-photo': item.photoId }),
      )
    : h(
        'button',
        { type: 'button', class: 'line-photo empty', 'data-action': 'take-photo', 'aria-label': tr('takePhoto') },
        icon('camera-icon'),
      );
}

const lineView = (item, n) => (state.checking ? checkLineView(item, n) : editLineView(item, n));

/** "R$ 4,50 × 2", or for a weighed item "R$ 7,99/kg × 1,250 kg". */
const eachText = (item) =>
  item.perKgCents
    ? `${formatMoney(item.perKgCents, state.lang)}/kg × ${formatKg(item.grams, state.lang)}`
    : `${formatMoney(item.priceCents, state.lang)} × ${item.qty}`;

let editingWeightId = null; // weighed line whose weight field is open

function weightControl(item) {
  const id = item.id;
  if (editingWeightId === id) {
    return h('input', {
      class: 'weight-input',
      'data-action': 'weight',
      'data-key': `weight-${id}`,
      inputmode: 'decimal',
      enterkeyhint: 'done',
      value: formatKg(item.grams, state.lang).replace(' kg', ''),
      'aria-label': tr('editWeight'),
    });
  }
  return h(
    'button',
    {
      type: 'button',
      class: 'weight-btn',
      'data-action': 'edit-weight',
      'data-key': `wb-${id}`,
      'aria-label': `${tr('editWeight')}: ${formatKg(item.grams, state.lang)}`,
    },
    formatKg(item.grams, state.lang),
  );
}

function editLineView(item, n) {
  const id = item.id;
  return h(
    'li',
    { class: 'line', 'data-id': id },
    photoCell(item),
    h('input', {
      class: 'line-name',
      value: item.name,
      placeholder: tr('itemN', { n }),
      'aria-label': tr('name'),
      enterkeyhint: 'done',
      'data-action': 'rename',
    }),
    h('span', { class: 'line-sub', text: formatMoney(item.priceCents * item.qty, state.lang) }),
    h('span', { class: 'line-each', text: eachText(item) }),
    h(
      'div',
      { class: 'line-ctl' },
      item.perKgCents
        ? weightControl(item)
        : h(
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

let editingChargeId = null; // line whose "charged" field is open in checkout mode
let justTicked = null; // line ticked by the latest tap: its tick snaps in once

/** A line at the till: tick, photo, name, noted total, and what the till charged when it differs. */
function checkLineView(item, n) {
  const id = item.id;
  const noted = item.priceCents * item.qty;
  const diff = item.chargedCents == null ? 0 : item.chargedCents - noted;
  let detail;
  if (editingChargeId === id) {
    detail = h('input', {
      class: 'charge-input',
      'data-action': 'charge',
      'data-key': `charge-${id}`,
      inputmode: 'decimal',
      enterkeyhint: 'done',
      value: item.chargedCents == null ? '' : formatMoney(item.chargedCents, state.lang).replace(/^\D+/, ''),
      placeholder: formatMoney(noted, state.lang).replace(/^\D+/, ''),
      'aria-label': tr('chargedAmount'),
    });
  } else if (diff !== 0) {
    detail = h(
      'span',
      { class: `line-charged ${diff > 0 ? 'dear' : 'good'}` },
      h('span', { text: tr('chargedLine', { amount: formatMoney(item.chargedCents, state.lang) }) }),
      h('span', { text: signedMoney(diff) }),
    );
  } else {
    detail = h('span', { class: 'line-each', text: eachText(item) });
  }
  return h(
    'li',
    { class: `line check${item.checked ? ' checked' : ''}`, 'data-id': id, 'data-action': 'toggle-check' },
    h(
      'button',
      {
        type: 'button',
        class: id === justTicked ? 'tick snap' : 'tick',
        'data-action': 'toggle-check',
        'data-key': `tick-${id}`,
        'aria-pressed': String(Boolean(item.checked)),
        'aria-label': tr('markChecked'),
      },
      icon('tick-icon'),
    ),
    photoCell(item),
    h('span', { class: 'line-name', text: item.name || tr('itemN', { n }) }),
    h('span', { class: 'line-sub', text: formatMoney(noted, state.lang) }),
    detail,
    h(
      'button',
      {
        type: 'button',
        class: `charge-btn${item.chargedCents == null ? '' : ' set'}`,
        'data-action': 'edit-charge',
        'data-key': `ne-${id}`,
        'aria-label': tr('chargedDifferent'),
      },
      '≠',
    ),
  );
}

function renderCheck() {
  const { cart } = state;
  const checking = state.checking;
  $('entry').hidden = checking;
  $('check-head').hidden = !checking;
  $('start-check').hidden = checking || cart.items.length === 0;
  const s = checkSummary(cart);
  $('check-progress').textContent = tr('checkedProgress', { n: s.checked, total: s.lines });
  const over = checking && s.overchargeCents > 0;
  const favor = checking && s.inFavorCents > 0;
  $('check-summary').hidden = !(over || favor);
  $('check-over').hidden = !over;
  $('check-law').hidden = !over;
  $('check-favor').hidden = !favor;
  $('check-over').textContent = tr('overcharged', { amount: formatMoney(s.overchargeCents, state.lang) });
  $('check-favor').textContent = tr('inYourFavor', { amount: formatMoney(s.inFavorCents, state.lang) });
}

function renderCart() {
  const { cart } = state;
  if (state.checking && cart.items.length === 0) persist({ ...state, checking: false }); // nothing left to check
  if (!state.checking) editingChargeId = null;
  else editingWeightId = null;
  renderCheck();
  keepingFocus(() => {
    $('lines').replaceChildren(...sortItems(cart.items, state.sort, LOCALES[state.lang]).map(({ item, n }) => lineView(item, n)));
  });
  hydratePhotos($('lines'));
  $('empty').hidden = cart.items.length > 0;
  showTotal(total(cart));
  renderBudget(total(cart));
  const { units } = counts(cart);
  $('count').textContent = tr('itemsCount', { n: units });
  $('clear').disabled = cart.items.length === 0;
  $('cart-actions').hidden = cart.items.length === 0;
  renderSort();
  renderBadge(units);
}

/** Restarts a CSS animation on an element, even if it is still running. */
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let shownTotal = null; // cents on the tag right now
let countFrame = 0;

/** The total counts up (or down) to its new value, and the tag pops when it grows. */
function showTotal(cents) {
  const from = shownTotal;
  shownTotal = cents;
  cancelAnimationFrame(countFrame);
  if (from === null || from === cents || reducedMotion.matches) {
    tagPrice($('total'), cents);
    $('total').removeAttribute('aria-busy');
    return;
  }
  $('total').setAttribute('aria-busy', 'true'); // screen readers hear only the final amount
  const start = performance.now();
  const step = (now) => {
    const progress = (now - start) / COUNT_MS;
    tagPrice($('total'), tweenCents(from, cents, progress));
    if (progress < 1) countFrame = requestAnimationFrame(step);
    else $('total').removeAttribute('aria-busy');
  };
  countFrame = requestAnimationFrame(step);
  if (cents > from) replay(document.querySelector('.tally-tag'), 'pop');
}

function renderBudget(totalCents) {
  const status = budgetStatus(totalCents, state.budgetCents);
  $('tally').classList.toggle('over', Boolean(status?.over));
  $('budget').textContent = !status
    ? tr('setBudget')
    : status.over
      ? tr('budgetOver', { over: formatMoney(status.overCents, state.lang) })
      : tr('budgetLeft', { left: formatMoney(status.leftCents, state.lang), budget: formatMoney(status.budgetCents, state.lang) });
}

$('budget').addEventListener('click', () => {
  const has = state.budgetCents != null;
  $('budget-input').value = has ? formatMoney(state.budgetCents, state.lang).replace(/^\D+/, '') : '';
  $('budget-input').placeholder = pricePlaceholder();
  $('budget-remove').hidden = !has;
  $('budget-error').textContent = '';
  $('budget-sheet').showModal();
  $('budget-input').focus();
});

// method="dialog" closes the sheet on submit; stop that only when the amount is invalid.
$('budget-form').addEventListener('submit', (e) => {
  const cents = parseMoney($('budget-input').value);
  if (cents === null) {
    e.preventDefault();
    $('budget-error').textContent = tr('invalidAmount');
    return;
  }
  persist({ ...state, budgetCents: cents });
  renderCart();
});

$('budget-remove').addEventListener('click', () => {
  persist({ ...state, budgetCents: null });
  $('budget-sheet').close();
  renderCart();
});

$('budget-cancel').addEventListener('click', () => $('budget-sheet').close());

// Each key starts in its most useful direction; tapping the active key flips it.
const SORT_START = { added: 'desc', total: 'desc', name: 'asc' };
const SORT_LABEL = { added: 'sortAdded', total: 'sortTotal', name: 'sortName' };

function renderSort() {
  $('sort-bar').hidden = state.cart.items.length < 2; // nothing to sort
  for (const b of document.querySelectorAll('[data-sort]')) {
    const active = b.dataset.sort === state.sort.key;
    b.setAttribute('aria-pressed', active);
    b.querySelector('.dir').textContent = active ? (state.sort.dir === 'asc' ? '↑' : '↓') : '';
    if (active) {
      const dir = tr(state.sort.dir === 'asc' ? 'sortAsc' : 'sortDesc');
      b.setAttribute('aria-label', `${tr(SORT_LABEL[b.dataset.sort])}, ${dir}`);
    } else {
      b.removeAttribute('aria-label');
    }
  }
}

$('sort-bar').addEventListener('click', (e) => {
  const key = e.target.closest('[data-sort]')?.dataset.sort;
  if (!key) return;
  const { sort } = state;
  const dir = key === sort.key ? (sort.dir === 'asc' ? 'desc' : 'asc') : SORT_START[key];
  persist({ ...state, sort: { key, dir } });
  renderCart();
});

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

/** Shows an entry error under the price and marks the field it's about. */
function setEntryError(key, field = 'price') {
  $('price-error').textContent = key ? tr(key) : '';
  $('price').setAttribute('aria-invalid', Boolean(key) && field === 'price');
  $('weight').setAttribute('aria-invalid', Boolean(key) && field === 'weight');
}

let entryMode = 'unit'; // 'unit' or 'weight'; stays until changed, as weighed items come in runs

function renderEntryMode() {
  const weighed = entryMode === 'weight';
  document.querySelector(`input[name="entry-mode"][value="${entryMode}"]`).checked = true;
  document.querySelector('.entry-qty').hidden = weighed;
  document.querySelector('.entry-weight').hidden = !weighed;
  $('price-label').dataset.i18n = weighed ? 'pricePerKg' : 'price';
  $('price-label').textContent = tr($('price-label').dataset.i18n);
  $('weight').placeholder = formatKg(0, state.lang).replace(' kg', '');
  renderWeightPreview();
}

function renderWeightPreview() {
  const perKg = parseMoney($('price').value);
  const grams = parseGrams($('weight').value);
  const ready = entryMode === 'weight' && perKg !== null && grams !== null;
  $('weight-preview').textContent = ready ? `= ${formatMoney(linePriceCents(perKg, grams), state.lang)}` : '';
}

$('entry').addEventListener('change', (e) => {
  if (e.target.name !== 'entry-mode') return;
  entryMode = e.target.value;
  setEntryError(null);
  renderEntryMode();
});

$('entry').addEventListener('submit', (e) => {
  e.preventDefault();
  const priceCents = parseMoney($('price').value);
  if (priceCents === null) {
    setEntryError('invalidPrice');
    $('price').focus();
    return;
  }
  let line = { priceCents, qty: readQty() };
  if (entryMode === 'weight') {
    const grams = parseGrams($('weight').value);
    if (grams === null) {
      setEntryError('invalidWeight', 'weight');
      $('weight').focus();
      return;
    }
    line = { perKgCents: priceCents, grams };
  }
  dispatchCart({ type: 'add', ...line, name: $('name').value, photoId: entryPhotoId });
  pendingPhotos.delete(entryPhotoId); // now the cart keeps it
  entryPhotoId = null;
  renderEntryPhoto();
  $('entry').reset();
  renderEntryMode(); // reset() puts the switch back to its default; keep the chosen mode
  setEntryError(null);
  $('price').focus();
});

$('price').addEventListener('input', () => {
  setEntryError(null);
  renderWeightPreview();
});

$('weight').addEventListener('input', () => {
  setEntryError(null);
  renderWeightPreview();
});

$('entry').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]')?.dataset.step;
  if (step) $('qty').value = Math.max(1, Math.min(MAX_QTY, readQty() + Number(step)));
});

$('lines').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  const id = Number(e.target.closest('[data-id]')?.dataset.id);
  const item = state.cart.items.find((i) => i.id === id);
  if (!item) return;
  if (action === 'take-photo') takePhoto(id);
  if (action === 'view-photo') openViewer(item);
  if (action === 'toggle-check') {
    if (!item.checked) {
      justTicked = id;
      navigator.vibrate?.(12); // a short haptic tick on Android; a no-op elsewhere
    }
    dispatchCart({ type: 'toggleChecked', id });
    justTicked = null;
  }
  if (action === 'edit-weight') {
    editingWeightId = id;
    renderCart();
    const input = document.querySelector(`[data-key="weight-${id}"]`);
    input?.focus();
    input?.select();
  }
  if (action === 'edit-charge') {
    editingChargeId = id;
    renderCart();
    const input = document.querySelector(`[data-key="charge-${id}"]`);
    input?.focus();
    input?.select();
  }
  if (action === 'inc') dispatchCart({ type: 'setQty', id, qty: Math.min(MAX_QTY, item.qty + 1) });
  if (action === 'dec' && item.qty > 1) dispatchCart({ type: 'setQty', id, qty: item.qty - 1 });
  if (action === 'remove' || (action === 'dec' && item.qty === 1)) {
    dispatchCart({ type: 'remove', id });
    showToast('removed', { action: 'undo' });
  }
});

// Renaming saves without re-rendering, so the list never swaps inputs under the user's finger.
$('lines').addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'rename') return;
  const id = Number(e.target.closest('[data-id]').dataset.id);
  setCart(cartReducer(state.cart, { type: 'rename', id, name: e.target.value }));
});

$('lines').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.action === 'rename') e.target.blur();
  if (e.target.dataset.action !== 'charge' && e.target.dataset.action !== 'weight') return;
  if (e.key === 'Enter') e.target.blur(); // focusout saves
  if (e.key === 'Escape') {
    editingChargeId = editingWeightId = null; // cancel: re-render without saving
    renderCart();
  }
});

// The weight and charged fields save when they lose focus. Guarded, so a re-render can never save twice.
$('lines').addEventListener('focusout', (e) => {
  if (e.target.dataset.action === 'weight') {
    const id = Number(e.target.closest('[data-id]').dataset.id);
    if (editingWeightId !== id) return;
    editingWeightId = null;
    const grams = parseGrams(e.target.value);
    if (grams === null) {
      renderCart();
      showToast('invalidWeight');
      return;
    }
    dispatchCart({ type: 'setWeight', id, grams });
    return;
  }
  if (e.target.dataset.action !== 'charge') return;
  const id = Number(e.target.closest('[data-id]').dataset.id);
  if (editingChargeId !== id) return;
  editingChargeId = null;
  const raw = e.target.value.trim();
  const chargedCents = raw === '' ? null : parseMoney(raw);
  if (raw !== '' && chargedCents === null) {
    renderCart();
    showToast('invalidPrice');
    return;
  }
  dispatchCart({ type: 'setCharged', id, chargedCents });
});

$('start-check').addEventListener('click', () => {
  persist({ ...state, checking: true });
  renderCart();
  $('panel-cart').scrollIntoView({ block: 'start' });
});

$('exit-check').addEventListener('click', () => {
  persist({ ...state, checking: false });
  renderCart();
});

$('clear').addEventListener('click', () => {
  dispatchCart({ type: 'clear' });
  showToast('cleared', { action: 'undo' });
});

/* ---------- shelf-tag photos ---------- */

// Saving now, or waiting in the entry form for Add: cleanup must never delete these.
const pendingPhotos = new Set();
const photoUrls = new Map(); // photo id → Promise of an object URL (or null)
let entryPhotoId = null;
let photoTarget = null; // 'entry', or the id of the cart item being photographed
let viewing = null; // id of the item open in the viewer

function photoUrl(id) {
  if (!photoUrls.has(id)) {
    photoUrls.set(id, getPhoto(id).then((p) => (p ? URL.createObjectURL(p.blob) : null)).catch(() => null));
  }
  return photoUrls.get(id);
}

function hydratePhotos(root) {
  for (const img of root.querySelectorAll('img[data-photo]')) {
    photoUrl(img.dataset.photo).then((url) => url && (img.src = url));
  }
}

/** Delete stored photos that no item, undo snapshot or pending shot points to. */
async function collectPhotos() {
  try {
    const stored = await photoIds();
    const keep = referencedPhotos(state.cart); // read after the await, so it sees the latest cart
    for (const id of pendingPhotos) keep.add(id);
    const dead = orphans(stored, keep);
    await deletePhotos(dead);
    for (const id of dead) {
      photoUrls.get(id)?.then((url) => url && URL.revokeObjectURL(url));
      photoUrls.delete(id);
    }
  } catch {
    // no IndexedDB (e.g. private mode): nothing to clean
  }
}

function takePhoto(target) {
  photoTarget = target;
  $('photo-input').click();
}

function renderEntryPhoto() {
  const img = $('entry-photo-img');
  img.hidden = !entryPhotoId;
  if (entryPhotoId) photoUrl(entryPhotoId).then((url) => url && (img.src = url));
  $('entry-photo').dataset.i18nAriaLabel = entryPhotoId ? 'retakePhoto' : 'takePhoto';
  $('entry-photo').setAttribute('aria-label', tr($('entry-photo').dataset.i18nAriaLabel));
}

$('entry-photo').addEventListener('click', () => takePhoto('entry'));

$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // so picking the same file again still fires change
  const target = photoTarget;
  photoTarget = null;
  if (!file || target === null) return;

  const id = newPhotoId();
  pendingPhotos.add(id);
  try {
    await savePhoto(id, await shrinkPhoto(file));
  } catch {
    pendingPhotos.delete(id);
    showToast('photoError');
    return;
  }
  if (target === 'entry') {
    if (entryPhotoId) pendingPhotos.delete(entryPhotoId); // a retake orphans the previous shot
    entryPhotoId = id; // stays pending until Add
    renderEntryPhoto();
    collectPhotos();
  } else {
    dispatchCart({ type: 'setPhoto', id: target, photoId: id });
    pendingPhotos.delete(id);
  }
});

async function openViewer(item) {
  viewing = item.id;
  const n = state.cart.items.findIndex((i) => i.id === item.id) + 1;
  const [url, photo] = await Promise.all([photoUrl(item.photoId), getPhoto(item.photoId).catch(() => null)]);
  $('viewer-img').src = url ?? '';
  $('viewer-img').alt = tr('photoOf');
  $('viewer-title').textContent = item.name || tr('itemN', { n });
  // A weighed item's shelf tag shows R$/kg, so the viewer does too.
  tagPrice($('viewer-price'), item.perKgCents ?? item.priceCents);
  if (item.perKgCents) {
    $('viewer-price').append(h('span', { class: 'per', text: '/kg' }));
    $('viewer-price').setAttribute('aria-label', `${formatMoney(item.perKgCents, state.lang)}/kg`);
  }
  const diff = item.chargedCents == null ? 0 : item.chargedCents - item.priceCents * item.qty;
  $('viewer-charged').hidden = diff === 0;
  $('viewer-charged').className = `viewer-charged ${diff > 0 ? 'dear' : 'good'}`;
  $('viewer-charged').textContent = diff
    ? `${tr('chargedLine', { amount: formatMoney(item.chargedCents, state.lang) })} (${signedMoney(diff)})`
    : '';
  const when = photo && new Intl.DateTimeFormat(LOCALES[state.lang], { dateStyle: 'short', timeStyle: 'short' }).format(photo.takenAt);
  $('viewer-when').textContent = when ? tr('photoTakenAt', { when }) : '';
  $('viewer').showModal();
}

$('viewer-retake').addEventListener('click', () => {
  $('viewer').close();
  takePhoto(viewing);
});

$('viewer-remove').addEventListener('click', () => {
  $('viewer').close();
  dispatchCart({ type: 'setPhoto', id: viewing, photoId: null });
  showToast('photoRemoved', { action: 'undo' });
});

/* ---------- trip history ---------- */

let history = loadHistory(storage);
let lastFinishedId = null; // trip saved by the latest Finalizar, for its Undo
let lastDeleted = null; // { trip, index } for the latest delete's Undo

function setHistory(next) {
  history = next;
  const saved = saveHistory(storage, history);
  renderHistory();
  return saved;
}

$('finish').addEventListener('click', () => {
  tagPrice($('finish-total'), total(state.cart));
  $('finish-count').textContent = tr('itemsCount', { n: counts(state.cart).units });
  $('store-names').replaceChildren(...storeNames(history).map((name) => h('option', { value: name })));
  $('finish-store').value = '';
  $('finish-sheet').showModal();
});

$('finish-cancel').addEventListener('click', () => $('finish-sheet').close());

$('finish-form').addEventListener('submit', () => {
  const party = celebrates(total(state.cart), state.budgetCents);
  const trip = tripFromCart(state.cart, { id: crypto.randomUUID(), at: Date.now(), store: $('finish-store').value });
  if (!setHistory([trip, ...history])) {
    history = history.filter((t) => t.id !== trip.id); // not stored: keep the cart, don't pretend
    renderHistory();
    showToast('tripNotSaved');
    return;
  }
  lastFinishedId = trip.id;
  persist({ ...state, checking: false });
  dispatchCart({ type: 'clear' }); // photos stay while Undo can still bring the cart back
  showToast('tripSaved', { action: 'undoFinish' });
  if (party) burst();
});

/** A handful of little price tags in the theme's colours fly up from the total and fall away. */
function burst() {
  if (reducedMotion.matches) return;
  const root = getComputedStyle(document.documentElement);
  const colours = ['--tag', '--primary', '--dear', '--good'].map((v) => root.getPropertyValue(v).trim());
  const from = $('tally').getBoundingClientRect();
  const layer = h('div', { class: 'burst', 'aria-hidden': 'true' });
  document.body.append(layer);
  const PIECES = 22;
  let landed = 0;
  for (let i = 0; i < PIECES; i++) {
    const tag = h('span', { class: 'burst-tag' });
    tag.style.background = colours[i % colours.length];
    tag.style.left = `${from.left + from.width * (0.15 + Math.random() * 0.7)}px`;
    tag.style.top = `${from.top + 8}px`;
    layer.append(tag);
    const dx = (Math.random() - 0.5) * 320;
    const dy = -(180 + Math.random() * 300);
    const spin = (Math.random() - 0.5) * 900;
    tag.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.25}px, ${dy + 320}px) rotate(${spin * 1.6}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 400, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    ).onfinish = () => ++landed === PIECES && layer.remove();
  }
}

function undoFinish() {
  if (!state.cart.undo) return; // the cart can't come back, so the trip must stay
  setHistory(history.filter((t) => t.id !== lastFinishedId));
  dispatchCart({ type: 'undo' });
}

/** The phone's share sheet where there is one; otherwise copy the list. Closing the sheet is not an error. */
async function shareList(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      // any other failure: fall back to copying
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('copied');
  } catch {
    showToast('shareFailed');
  }
}

$('share-cart').addEventListener('click', () =>
  shareList(shareText(state.cart.items, { lang: state.lang, title: tr('shareCartTitle') })),
);

function tripTitle(trip) {
  const date = new Intl.DateTimeFormat(LOCALES[state.lang], { dateStyle: 'short' }).format(trip.at);
  return `Zoolama — ${trip.store || tr('tripUnnamed')}, ${date}`;
}

$('history').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'share-trip') {
    const trip = history.find((t) => t.id === e.target.closest('[data-trip]').dataset.trip);
    shareList(shareText(trip.items, { lang: state.lang, title: tripTitle(trip) }));
  }
  if (action !== 'delete-trip') return;
  const id = e.target.closest('[data-trip]').dataset.trip;
  const index = history.findIndex((t) => t.id === id);
  lastDeleted = { trip: history[index], index };
  setHistory(history.filter((t) => t.id !== id));
  showToast('tripDeleted', { action: 'undoDelete' });
});

function undoDeleteTrip() {
  if (!lastDeleted) return;
  const next = [...history];
  next.splice(lastDeleted.index, 0, lastDeleted.trip);
  lastDeleted = null;
  setHistory(next);
}

function tripView(trip, whenFormat) {
  const amount = (cents) => formatMoney(cents, state.lang);
  return h(
    'details',
    { class: 'trip', 'data-trip': trip.id },
    h(
      'summary',
      {},
      h('span', { class: 'trip-store', text: trip.store || tr('tripUnnamed') }),
      h('span', { class: 'trip-total', text: amount(trip.totalCents) }),
      h(
        'span',
        { class: 'trip-meta' },
        h('span', { text: whenFormat.format(trip.at) }),
        h('span', { text: tr('itemsCount', { n: trip.units }) }),
        trip.overchargeCents ? h('span', { class: 'over', text: tr('overcharged', { amount: amount(trip.overchargeCents) }) }) : '',
      ),
    ),
    h(
      'ul',
      { class: 'trip-items' },
      ...trip.items.map((item, i) =>
        h(
          'li',
          {},
          h('span', { text: item.name || tr('itemN', { n: i + 1 }) }),
          h('span', { class: 'each', text: eachText(item) }),
          h('span', { class: 'sub', text: amount(item.priceCents * item.qty) }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'trip-actions' },
      h('button', { type: 'button', class: 'secondary', 'data-action': 'share-trip' }, tr('share')),
      h('button', { type: 'button', class: 'secondary', 'data-action': 'delete-trip' }, tr('deleteTrip')),
    ),
  );
}

function renderHistory() {
  $('history-empty').hidden = history.length > 0;
  const locale = LOCALES[state.lang];
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const whenFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const open = new Set([...document.querySelectorAll('.trip[open]')].map((d) => d.dataset.trip));
  $('history').replaceChildren(
    ...monthlyGroups(history).map((group) =>
      h(
        'section',
        { class: 'month' },
        h(
          'h2',
          { class: 'month-head' },
          h('span', { text: monthFormat.format(new Date(group.year, group.month, 1)) }),
          h('span', { class: 'month-total', text: formatMoney(group.totalCents, state.lang) }),
        ),
        ...group.trips.map((trip) => {
          const view = tripView(trip, whenFormat);
          view.open = open.has(trip.id); // keep expanded trips expanded across re-renders
          return view;
        }),
      ),
    ),
  );
}

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

/* ---------- install ---------- */

let installPrompt = null;
const ios = isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const currentInstallMode = () => installMode({ standalone: standalone(), hasPrompt: Boolean(installPrompt), ios });

function renderInstall() {
  $('install').hidden = currentInstallMode() === 'hidden';
}

// Chromium offers installation through this event; keep it for our own button instead of its mini-infobar.
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
  showToast('installed');
});

$('install').addEventListener('click', () => {
  const mode = currentInstallMode();
  if (mode === 'ios') $('ios-install').showModal();
  if (mode === 'prompt') {
    const prompt = installPrompt;
    installPrompt = null; // single use; Chromium fires a fresh event if the user declines
    renderInstall();
    prompt.prompt();
  }
});

/* ---------- toast ---------- */

let toastTimer;
let toastAction = null;
let updatePending = false;

// The toast's one button: what it runs, and the i18n key of its label.
// cartUndo: it needs the cart's one-level undo snapshot, which any other cart change drops.
const TOAST_ACTIONS = {
  undo: { label: 'undo', run: () => dispatchCart({ type: 'undo' }), cartUndo: true },
  update: { label: 'update', run: () => location.reload() },
  undoFinish: { label: 'undo', run: () => undoFinish(), cartUndo: true },
  undoDelete: { label: 'undo', run: () => undoDeleteTrip() },
};

function showToast(key, { action = null, persist = false } = {}) {
  $('toast-text').dataset.i18n = key;
  $('toast-text').textContent = tr(key);
  toastAction = action;
  const button = $('toast-action');
  button.hidden = !action;
  if (action) {
    button.dataset.i18n = TOAST_ACTIONS[action].label;
    button.textContent = tr(button.dataset.i18n);
  }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  $('toast').hidden = true;
  // A waiting update outlives short-lived toasts like Undo: bring its prompt back afterwards.
  if (updatePending) showToast('updateReady', { action: 'update', persist: true });
}

/** An Undo that can no longer undo anything must not stay on screen. */
function dropStaleUndo() {
  if (!$('toast').hidden && TOAST_ACTIONS[toastAction]?.cartUndo && !state.cart.undo) hideToast();
}

$('toast-action').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  TOAST_ACTIONS[action]?.run();
});

/* ---------- language ---------- */

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    persist({ ...state, lang: b.dataset.lang });
    applyLang();
    renderTheme();
    renderEntryMode();
    renderCart();
    renderOptions();
    renderHistory();
  });
}

/* ---------- boot ---------- */

applyLang();
renderTheme();
renderCart();
renderOptions();
renderTab();
renderEntryMode();
renderHistory();
renderInstall();
collectPhotos();
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator) {
  const sw = navigator.serviceWorker;
  let controlled = Boolean(sw.controller);
  const firstInstall = !controlled;

  sw.register('./sw.js')
    .then((registration) => {
      let lastCheck = Date.now(); // registering has just checked
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !dueForUpdateCheck(Date.now(), lastCheck)) return;
        lastCheck = Date.now();
        registration.update().catch(() => {}); // offline: the next foregrounding tries again
      });
      return sw.ready;
    })
    .then(() => firstInstall && showToast('offlineReady'))
    .catch(() => {}); // no SW (e.g. private mode): the app still works while the page is open

  // sw.js skips waiting and claims the page, so a new version takes over as soon as it has installed.
  // The screen still shows the old one; offer a reload rather than forcing it mid-typing.
  sw.addEventListener('controllerchange', () => {
    if (controlled) {
      updatePending = true;
      showToast('updateReady', { action: 'update', persist: true });
    }
    controlled = true; // the first claim after a fresh install is not an update
  });
}
