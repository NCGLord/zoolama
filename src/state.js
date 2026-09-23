// The saved state read back field by field. A value can be half-written, hand-edited or left by another version of
// the app; whatever doesn't hold up falls back to its default, so one bad field can never blank the app mid-shop.

import { initialCart, validDeal } from './cart.js';
import { restorePlan } from './plan.js';
import { UNITS } from './units.js';
import { STRINGS } from './i18n.js';

export const blankOption = (unit = 'g') => ({ label: '', price: '', qty: '', unit });
export const initialCompare = () => ({ options: [blankOption(), blankOption()] });

const TABS = ['cart', 'compare', 'history'];
const THEMES = ['light', 'dark'];
const SORT_KEYS = ['added', 'total', 'name'];
const SORT_DIRS = ['asc', 'desc'];
const DEFAULT_SORT = { key: 'added', dir: 'desc' }; // newest first

const isPositive = (n) => Number.isSafeInteger(n) && n > 0;
const text = (s) => (typeof s === 'string' ? s : '');

/** A cart line with the fields the cart knows, or null when its id, price or quantity can't be trusted. */
function restoreItem(item) {
  if (!isPositive(item?.id) || !isPositive(item.priceCents) || !isPositive(item.qty)) return null;
  const { id, priceCents, qty, perKgCents, grams, photoId, checked, chargedCents } = item;
  const weighed = isPositive(perKgCents) && isPositive(grams);
  const deal = weighed ? null : validDeal(item.deal, priceCents);
  return {
    id,
    name: text(item.name),
    priceCents,
    qty,
    ...(weighed ? { perKgCents, grams } : {}),
    ...(deal ? { deal } : {}),
    ...(typeof photoId === 'string' && photoId ? { photoId } : {}),
    ...(checked === true ? { checked } : {}),
    ...(isPositive(chargedCents) ? { chargedCents } : {}),
  };
}

/** Lines that hold up, each id once (edits find a line by id). */
function restoreItems(items) {
  const byId = new Map();
  for (const item of items.map(restoreItem)) if (item && !byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

function restoreCart(cart) {
  if (!Array.isArray(cart?.items)) return initialCart();
  const items = restoreItems(cart.items);
  const undo = Array.isArray(cart.undo) ? restoreItems(cart.undo) : null;
  // The next id must not reuse one still in the cart or in the Undo snapshot.
  const used = Math.max(0, ...items.map((i) => i.id), ...(undo ?? []).map((i) => i.id));
  return {
    items,
    nextId: isPositive(cart.nextId) && cart.nextId > used ? cart.nextId : used + 1,
    undo,
    ...(isPositive(cart.receiptCents) ? { receiptCents: cart.receiptCents } : {}), // noted at the till
  };
}

function restoreCompare(compare) {
  const options = compare?.options;
  if (!Array.isArray(options) || options.length < 2) return initialCompare();
  return {
    options: options.map((o) => ({
      label: text(o?.label),
      price: text(o?.price),
      qty: text(o?.qty),
      unit: Object.hasOwn(UNITS, o?.unit) ? o.unit : 'g',
    })),
  };
}

/** The app's state from what load() returned (null when nothing was saved); `lang` is the one to start in. */
export function restoreState(saved, { lang }) {
  const sort = saved?.sort;
  const validSort = SORT_KEYS.includes(sort?.key) && SORT_DIRS.includes(sort?.dir);
  return {
    cart: restoreCart(saved?.cart),
    compare: restoreCompare(saved?.compare),
    lang: Object.hasOwn(STRINGS, saved?.lang) ? saved.lang : lang,
    tab: TABS.includes(saved?.tab) ? saved.tab : 'cart',
    theme: THEMES.includes(saved?.theme) ? saved.theme : null, // null: follow the system
    checking: saved?.checking === true, // checkout mode ("Conferir no caixa")
    budgetCents: isPositive(saved?.budgetCents) ? saved.budgetCents : null, // the shopper's limit; survives Clear
    sort: validSort ? { key: sort.key, dir: sort.dir } : { ...DEFAULT_SORT },
    plan: restorePlan(saved?.plan), // the shopping list; outlives Clear, emptied as trips buy from it
  };
}
