// The entry form at the top of the cart: price, quantity or weight, an optional name and photo, then Add.

import { linePriceCents, MAX_QTY, validDeal } from '../cart.js';
import { lastPrice, priceRise } from '../history.js';
import { formatKg, formatPct, LOCALES } from '../i18n.js';
import { formatMoney, parseMoney } from '../money.js';
import { parseGrams } from '../units.js';
import { state } from './app-state.js';
import { dispatchCart } from './cart-store.js';
import { $ } from './dom.js';
import { openOfferSheet } from './line-sheet.js';
import { entryPhotoAdded, entryPhotoId } from './photos-ui.js';
import { memory } from './price-memory.js';
import { tr } from './text.js';

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
let entryDeal = null; // an atacado offer noted for the item being entered; checked against its price at Add

function renderEntryMode() {
  const weighed = entryMode === 'weight';
  document.querySelector(`input[name="entry-mode"][value="${entryMode}"]`).checked = true;
  document.querySelector('.entry-qty').hidden = weighed;
  document.querySelector('.entry-weight').hidden = !weighed;
  $('entry-offer').hidden = weighed; // weighed items have no atacado price
  renderEntryDeal();
  $('price-label').dataset.i18n = weighed ? 'pricePerKg' : 'price';
  $('price-label').textContent = tr($('price-label').dataset.i18n);
  $('weight').placeholder = formatKg(0, state.lang).replace(' kg', '');
  renderWeightPreview();
  renderNameHint();
}

function renderEntryDeal() {
  const shown = entryDeal && entryMode !== 'weight';
  $('entry-deal').hidden = !shown;
  if (!shown) $('entry-deal-text').textContent = '';
  else if (entryDeal.kind === 'multibuy') $('entry-deal-text').textContent = tr('dealPendingMultibuy', entryDeal);
  else {
    const each = formatMoney(entryDeal.eachCents, state.lang);
    $('entry-deal-text').textContent = tr('dealPending', { n: entryDeal.minQty, each });
  }
}

$('entry-offer').addEventListener('click', () =>
  openOfferSheet(entryDeal, (deal) => {
    entryDeal = deal;
    setEntryError(null);
    renderEntryDeal();
  }),
);

$('entry-deal-clear').addEventListener('click', () => {
  entryDeal = null;
  renderEntryDeal();
});

/** What the typed name cost last time (and where, and when), and whether the typed price is dearer. */
function renderNameHint() {
  const weighed = entryMode === 'weight';
  const name = $('name').value;
  const last = lastPrice(memory, name, weighed ? 'weight' : 'unit');
  if (!last) {
    $('name-hint').textContent = '';
    return;
  }
  const price = `${formatMoney(last.perKgCents ?? last.priceCents, state.lang)}${last.kind === 'weight' ? '/kg' : ''}`;
  const date = new Date(last.at);
  const thisYear = date.getFullYear() === new Date().getFullYear();
  const format = { day: '2-digit', month: '2-digit', year: thisYear ? undefined : 'numeric' };
  const when = new Intl.DateTimeFormat(LOCALES[state.lang], format).format(date);
  const parts = [last.store ? tr('lastPaidAt', { price, store: last.store, when }) : tr('lastPaid', { price, when })];
  const typed = parseMoney($('price').value);
  const rise = typed && priceRise(weighed ? { name, perKgCents: typed } : { name, priceCents: typed }, memory);
  if (rise) parts.push(tr('priceRise', { pct: formatPct(rise.pct, state.lang) }));
  $('name-hint').textContent = parts.join(' · ');
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
  } else if (entryDeal) {
    line.deal = validDeal(entryDeal, priceCents);
    if (!line.deal) {
      setEntryError('invalidDeal');
      $('price').focus();
      return;
    }
  }
  dispatchCart({ type: 'add', ...line, name: $('name').value, photoId: entryPhotoId });
  entryPhotoAdded();
  entryDeal = null; // the next item starts without one
  $('entry').reset();
  renderEntryMode(); // reset() puts the switch back to its default; keep the chosen mode
  setEntryError(null);
  $('price').focus();
});

$('price').addEventListener('input', () => {
  setEntryError(null);
  renderWeightPreview();
  renderNameHint();
});

$('name').addEventListener('input', renderNameHint);

$('weight').addEventListener('input', () => {
  setEntryError(null);
  renderWeightPreview();
});

$('entry').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]')?.dataset.step;
  if (step) $('qty').value = Math.max(1, Math.min(MAX_QTY, readQty() + Number(step)));
});

/** Starts entering a listed item: its name, Peso if it was last bought by weight, and the price field ready. */
function enterName(name) {
  $('name').value = name;
  const last = lastPrice(memory, name, entryMode === 'weight' ? 'weight' : 'unit');
  if (last) entryMode = last.kind;
  setEntryError(null);
  renderEntryMode();
  $('price').focus();
}

export { renderEntryMode, enterName };
