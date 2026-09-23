// The cart tab: its lines, the total tag with its budget, sorting, the tab badge, checkout mode and Clear.

import { budgetStatus } from '../budget.js';
import { cartReducer, checkSummary, counts, receiptCheck, sortItems, total } from '../cart.js';
import { tweenCents } from '../delight.js';
import { LOCALES } from '../i18n.js';
import { formatMoney, parseMoney } from '../money.js';
import { parseGrams } from '../units.js';
import { persist, state } from './app-state.js';
import { editing, lineNodes } from './cart-lines.js';
import { dispatchCart, MAX_QTY, setCart } from './cart-store.js';
import { $, keepingFocus, reconcile, reducedMotion, replay } from './dom.js';
import { hydratePhotos } from './photo-cache.js';
import { openLineSheet } from './line-sheet.js';
import { openViewer, takePhoto } from './photos-ui.js';
import { renderPlan } from './plan-view.js';
import { pricePlaceholder, signedMoney, tagPrice, tr } from './text.js';
import { showToast } from './toast.js';
import { keepScreenOn } from './wake-lock.js';

const COUNT_MS = 480; // total count-up

function renderCheck() {
  const { cart } = state;
  const checking = state.checking;
  keepScreenOn(checking);
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
  $('receipt').hidden = !checking;
  renderReceipt();
}

/** The receipt total against the cart: does it match, and if not, do the lines' noted charges account for it? */
function renderReceipt() {
  const { cart } = state;
  const input = $('receipt-input');
  const bare = (cents) => formatMoney(cents, state.lang).replace(/^\D+/, '');
  if (document.activeElement !== input) input.value = cart.receiptCents ? bare(cart.receiptCents) : '';
  input.placeholder = bare(total(cart));
  const check = receiptCheck(cart);
  const verdict = $('receipt-verdict');
  const note = $('receipt-note');
  verdict.className = 'receipt-verdict';
  verdict.textContent = '';
  note.textContent = '';
  if (!check) return;
  const amount = formatMoney(Math.abs(check.diffCents), state.lang);
  if (check.diffCents === 0) verdict.textContent = tr('receiptMatches');
  else verdict.textContent = tr(check.diffCents > 0 ? 'receiptOver' : 'receiptUnder', { amount });
  verdict.classList.add(check.diffCents > 0 ? 'dear' : 'good');
  if (check.diffCents === 0) return;
  // Lines with a noted charge may account for the difference; without any, a receipt over the shelf prices is what
  // the lower-price rule is about.
  if (check.chargedCents !== check.notedCents) {
    note.textContent = check.unexplainedCents
      ? tr('receiptUnexplained', { amount: signedMoney(check.unexplainedCents) })
      : tr('receiptExplained');
  } else if (check.diffCents > 0) {
    note.textContent = tr('lowerPriceRule');
  }
}

$('receipt-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur(); // change saves
});

$('receipt-input').addEventListener('change', (e) => {
  const raw = e.target.value.trim();
  const receiptCents = raw === '' ? null : parseMoney(raw);
  if (raw !== '' && receiptCents === null) {
    renderReceipt();
    showToast('invalidAmount');
    return;
  }
  dispatchCart({ type: 'setReceipt', receiptCents });
});

function renderCart() {
  const { cart } = state;
  if (state.checking && cart.items.length === 0) persist({ ...state, checking: false }); // nothing left to check
  if (!state.checking) editing.chargeId = null;
  else editing.weightId = null;
  renderCheck();
  keepingFocus(() => {
    const rows = sortItems(cart.items, state.sort, LOCALES[state.lang]);
    reconcile($('lines'), lineNodes(rows, [...$('lines').children]));
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
  renderPlan();
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

/** Draws the line with its field open, then focuses the field with what's in it selected, ready to retype. */
function openField(key) {
  renderCart();
  const input = document.querySelector(`[data-key="${key}"]`);
  input?.focus();
  input?.select();
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
    openField(`weight-${id}`);
  }
  if (action === 'edit-charge') {
    editing.chargeId = id;
    openField(`charge-${id}`);
  }
  if (action === 'edit-price') openLineSheet(item, state.cart.items.indexOf(item) + 1);
  if (action === 'take-tier') dispatchCart({ type: 'setQty', id, qty: item.deal.minQty });
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
  if (!['charge', 'weight'].includes(e.target.dataset.action)) return;
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

export { renderCart };
