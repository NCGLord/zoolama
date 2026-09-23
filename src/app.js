// DOM wiring only: events → reducers → save → render. Business rules live in the other modules.

import { parseMoney, formatMoney } from './money.js';
import { cartReducer, total, counts, checkSummary, lineTotal, sortItems } from './cart.js';
import { compare } from './compare.js';
import { UNITS, BASE_UNIT, parseGrams } from './units.js';
import { t, formatPct, LOCALES } from './i18n.js';
import { loadHistory, saveHistory } from './store.js';
import { tripFromCart, monthlyGroups, storeNames } from './history.js';
import { shareText } from './share.js';
import { effectiveTheme, toggledTheme } from './theme.js';
import { installMode, isIOS } from './install.js';
import { dueForUpdateCheck } from './update.js';
import { budgetStatus } from './budget.js';
import { tweenCents, celebrates, newWinners } from './delight.js';
import { $, reducedMotion, h, keepingFocus, replay } from './ui/dom.js';
import { storage, blankOption, initialCompare, state, persist } from './ui/app-state.js';
import { tr, tagPrice, applyLang, pricePlaceholder, unitLabel, eachText } from './ui/text.js';
import { showToast, offerUpdate, defineToastActions } from './ui/toast.js';
import { hydratePhotos, collectPhotos } from './ui/photo-cache.js';
import { MAX_QTY, setCart, dispatchCart, setCartRenderer } from './ui/cart-store.js';
import { shareList } from './ui/share-sheet.js';
import { takePhoto, openViewer } from './ui/photos-ui.js';
import { renderEntryMode } from './ui/entry.js';
import { lineView, editing } from './ui/cart-lines.js';

const COUNT_MS = 480; // total count-up

/* ---------- cart ---------- */

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
  if (!state.checking) editing.chargeId = null;
  else editing.weightId = null;
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

$('lines').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  const id = Number(e.target.closest('[data-id]')?.dataset.id);
  const item = state.cart.items.find((i) => i.id === id);
  if (!item) return;
  if (action === 'take-photo') takePhoto(id);
  if (action === 'view-photo') openViewer(item);
  if (action === 'toggle-check') {
    if (!item.checked) {
      editing.justTicked = id;
      navigator.vibrate?.(12); // a short haptic tick on Android; a no-op elsewhere
    }
    dispatchCart({ type: 'toggleChecked', id });
    editing.justTicked = null;
  }
  if (action === 'edit-weight') {
    editing.weightId = id;
    renderCart();
    const input = document.querySelector(`[data-key="weight-${id}"]`);
    input?.focus();
    input?.select();
  }
  if (action === 'edit-charge') {
    editing.chargeId = id;
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
    editing.chargeId = editing.weightId = null; // cancel: re-render without saving
    renderCart();
  }
});

// The weight and charged fields save when they lose focus. Guarded, so a re-render can never save twice.
$('lines').addEventListener('focusout', (e) => {
  if (e.target.dataset.action === 'weight') {
    const id = Number(e.target.closest('[data-id]').dataset.id);
    if (editing.weightId !== id) return;
    editing.weightId = null;
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
  if (editing.chargeId !== id) return;
  editing.chargeId = null;
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

/* ---------- trip history ---------- */

let trips = loadHistory(storage);
let lastFinishedId = null; // trip saved by the latest Finalizar, for its Undo
let lastDeleted = null; // { trip, index } for the latest delete's Undo

function setTrips(next) {
  trips = next;
  const saved = saveHistory(storage, trips);
  renderHistory();
  return saved;
}

$('finish').addEventListener('click', () => {
  tagPrice($('finish-total'), total(state.cart));
  $('finish-count').textContent = tr('itemsCount', { n: counts(state.cart).units });
  $('store-names').replaceChildren(...storeNames(trips).map((name) => h('option', { value: name })));
  $('finish-store').value = '';
  $('finish-sheet').showModal();
});

$('finish-cancel').addEventListener('click', () => $('finish-sheet').close());

$('finish-form').addEventListener('submit', () => {
  const party = celebrates(total(state.cart), state.budgetCents);
  const trip = tripFromCart(state.cart, { id: crypto.randomUUID(), at: Date.now(), store: $('finish-store').value });
  if (!setTrips([trip, ...trips])) {
    trips = trips.filter((t) => t.id !== trip.id); // not stored: keep the cart, don't pretend
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
  setTrips(trips.filter((t) => t.id !== lastFinishedId));
  dispatchCart({ type: 'undo' });
}

function tripTitle(trip) {
  const date = new Intl.DateTimeFormat(LOCALES[state.lang], { dateStyle: 'short' }).format(trip.at);
  return `Zoolama — ${trip.store || tr('tripUnnamed')}, ${date}`;
}

$('history').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'share-trip') {
    const trip = trips.find((t) => t.id === e.target.closest('[data-trip]').dataset.trip);
    shareList(shareText(trip.items, { lang: state.lang, title: tripTitle(trip) }));
  }
  if (action !== 'delete-trip') return;
  const id = e.target.closest('[data-trip]').dataset.trip;
  const index = trips.findIndex((t) => t.id === id);
  lastDeleted = { trip: trips[index], index };
  setTrips(trips.filter((t) => t.id !== id));
  showToast('tripDeleted', { action: 'undoDelete' });
});

function undoDeleteTrip() {
  if (!lastDeleted) return;
  const next = [...trips];
  next.splice(lastDeleted.index, 0, lastDeleted.trip);
  lastDeleted = null;
  setTrips(next);
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
          h('span', { class: 'sub', text: amount(lineTotal(item)) }),
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
  $('history-empty').hidden = trips.length > 0;
  const locale = LOCALES[state.lang];
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const whenFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const open = new Set([...document.querySelectorAll('.trip[open]')].map((d) => d.dataset.trip));
  $('history').replaceChildren(
    ...monthlyGroups(trips).map((group) =>
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

setCartRenderer(renderCart);

// cartUndo: it needs the cart's one-level undo snapshot, which any other cart change drops.
defineToastActions({
  undo: { label: 'undo', run: () => dispatchCart({ type: 'undo' }), cartUndo: true },
  update: { label: 'update', run: () => location.reload() },
  undoFinish: { label: 'undo', run: () => undoFinish(), cartUndo: true },
  undoDelete: { label: 'undo', run: () => undoDeleteTrip() },
});

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
    if (controlled) offerUpdate();
    controlled = true; // the first claim after a fresh install is not an update
  });
}
