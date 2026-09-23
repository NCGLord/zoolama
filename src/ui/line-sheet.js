// One sheet for what a line costs: its price (per kg for a weighed line) and its offer — an atacado price from N units,
// or "leve N pague M". Opened from a cart line's arithmetic, or from the entry form's % key to note an offer before
// adding; there the price is the entry form's, so the sheet asks only for the offer and hands it back.

import { validDeal } from '../cart.js';
import { formatMoney, parseMoney } from '../money.js';
import { state } from './app-state.js';
import { dispatchCart } from './cart-store.js';
import { $ } from './dom.js';
import { tr } from './text.js';
import { showToast } from './toast.js';

let target = null; // {id} of the cart line being edited, or {onSave} for the entry form's offer

const bare = (cents) => formatMoney(cents, state.lang).replace(/^\D+/, '');

function show({ title, priceCents, perKg = false, deal = null }) {
  $('line-sheet-title').textContent = title;
  $('price-row').hidden = priceCents === undefined;
  $('sheet-price-label').textContent = tr(perKg ? 'pricePerKg' : 'price');
  $('sheet-price').value = priceCents === undefined ? '' : bare(priceCents);
  $('deal-fields').hidden = perKg; // weighed lines have no offers
  const tier = deal?.kind === 'tier' ? deal : null;
  const multibuy = deal?.kind === 'multibuy' ? deal : null;
  document.querySelector(`input[name="deal-kind"][value="${multibuy ? 'multibuy' : 'tier'}"]`).checked = true;
  $('deal-min').value = tier ? String(tier.minQty) : '';
  $('deal-each').value = tier ? bare(tier.eachCents) : '';
  $('deal-buy').value = multibuy ? String(multibuy.buy) : '';
  $('deal-pay').value = multibuy ? String(multibuy.pay) : '';
  renderKind();
  $('deal-remove').hidden = !deal;
  $('line-error').textContent = '';
  $('line-sheet').showModal();
}

/** Corrects a cart line's price and offer. `n` is its number, for the title of an unnamed line. */
function openLineSheet(item, n) {
  target = { id: item.id };
  show({
    title: item.name || tr('itemN', { n }),
    priceCents: item.perKgCents ?? item.priceCents,
    perKg: Boolean(item.perKgCents),
    deal: item.deal,
  });
  $('sheet-price').select();
}

/** Notes an offer for the item being entered; `onSave` gets it (null to remove it). */
function openOfferSheet(deal, onSave) {
  target = { onSave };
  show({ title: tr('deal'), deal });
  $(deal?.kind === 'multibuy' ? 'deal-buy' : 'deal-min').focus();
}

const dealKind = () => document.querySelector('input[name="deal-kind"]:checked').value;

function renderKind() {
  $('tier-fields').hidden = dealKind() !== 'tier';
  $('multibuy-fields').hidden = dealKind() !== 'multibuy';
}

$('deal-fields').addEventListener('change', (e) => {
  if (e.target.name === 'deal-kind') renderKind();
});

/**
 * The typed offer of the chosen kind: {deal} (null when its fields are empty), or {error} with the reason it doesn't
 * hold up against `priceCents`.
 */
function readDeal(priceCents) {
  if (dealKind() === 'multibuy') {
    const [buy, pay] = [$('deal-buy').value.trim(), $('deal-pay').value.trim()];
    if (!buy && !pay) return { deal: null };
    const deal = validDeal({ kind: 'multibuy', buy: Number(buy), pay: Number(pay) }, priceCents);
    return deal ? { deal } : { error: 'invalidMultibuy' };
  }
  const [min, each] = [$('deal-min').value.trim(), $('deal-each').value.trim()];
  if (!min && !each) return { deal: null };
  const deal = validDeal({ kind: 'tier', minQty: Number(min), eachCents: parseMoney(each) }, priceCents);
  return deal ? { deal } : { error: 'invalidDeal' };
}

// method="dialog" closes the sheet on submit; stop that only when something can't be saved.
$('line-form').addEventListener('submit', (e) => {
  const fail = (key) => {
    e.preventDefault();
    $('line-error').textContent = tr(key);
  };
  if (target.onSave) {
    // The price isn't known yet: check the offer's own shape now, and against the price at Add.
    const { deal, error } = readDeal(Infinity);
    return error ? fail(error) : target.onSave(deal);
  }
  const item = state.cart.items.find((i) => i.id === target.id);
  const priceCents = parseMoney($('sheet-price').value);
  if (!item) return;
  if (priceCents === null) return fail('invalidPrice');
  const { deal, error } = item.perKgCents ? { deal: null } : readDeal(priceCents);
  if (error) return fail(error);
  dispatchCart({ type: 'setPrice', id: item.id, priceCents });
  if (!item.perKgCents) dispatchCart({ type: 'setDeal', id: item.id, deal });
});

$('deal-remove').addEventListener('click', () => {
  $('line-sheet').close();
  if (target.onSave) return target.onSave(null);
  dispatchCart({ type: 'setDeal', id: target.id, deal: null });
  showToast('dealRemoved', { action: 'undo' });
});

$('line-cancel').addEventListener('click', () => $('line-sheet').close());

export { openLineSheet, openOfferSheet };
