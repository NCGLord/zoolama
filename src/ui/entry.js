// The entry form at the top of the cart: price, quantity or weight, an optional name and photo, then Add.

import { linePriceCents } from '../cart.js';
import { formatKg } from '../i18n.js';
import { formatMoney, parseMoney } from '../money.js';
import { parseGrams } from '../units.js';
import { state } from './app-state.js';
import { dispatchCart, MAX_QTY } from './cart-store.js';
import { $ } from './dom.js';
import { entryPhotoAdded, entryPhotoId } from './photos-ui.js';
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
  entryPhotoAdded();
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

export { renderEntryMode };
