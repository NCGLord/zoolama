// Pure cart reducer. Destructive actions (remove, clear, qty → 0, dropping a photo) keep a one-level
// undo snapshot so the UI can offer "Undo" instead of a confirm dialog; any other action drops it.
// An item may carry the photoId of its shelf-tag photo; the image itself lives in photos.js.
// At the till (checkout mode) an item can be ticked, and carry what the till charged for the whole line.
// A weighed item (hortifruti, açougue) keeps its price per kg and weight in whole grams; its priceCents is the
// line price and qty stays 1, so totals, budget and checkout treat it like any other line.
// The cart may also carry receiptCents, the total printed on the till's receipt, noted in checkout mode.
// A unit line may carry an offer (deal): an atacado tier, where from minQty units each costs eachCents, or "leve N
// pague M", where every N units cost M. lineTotal applies it, so totals, budget, checkout, sorting, sharing and History
// all see the same price.

/** The most units one line can hold, and so the most an offer can ask for. */
export const MAX_QTY = 999;

export function initialCart() {
  return { items: [], nextId: 1, undo: null };
}

export function cartReducer(state, action) {
  const { items } = state;
  switch (action.type) {
    case 'add': {
      const weighed = action.perKgCents != null;
      const item = {
        id: state.nextId,
        name: (action.name ?? '').trim(),
        priceCents: weighed ? linePriceCents(action.perKgCents, action.grams) : action.priceCents,
        qty: weighed ? 1 : (action.qty ?? 1),
        ...(weighed ? { perKgCents: action.perKgCents, grams: action.grams } : {}),
        ...(action.photoId ? { photoId: action.photoId } : {}),
      };
      const deal = weighed ? null : validDeal(action.deal, item.priceCents);
      if (deal) item.deal = deal;
      // Cart-level fields stay, except that the first item of a new trip drops the last trip's receipt total.
      const { receiptCents, ...rest } = state;
      const base = items.length ? state : rest;
      return { ...base, items: [...items, item], nextId: state.nextId + 1, undo: null };
    }
    case 'setQty':
      if (action.qty <= 0) return cartReducer(state, { type: 'remove', id: action.id });
      return edit(state, action.id, { qty: Math.floor(action.qty) });
    case 'rename':
      return edit(state, action.id, { name: action.name.trim() });
    case 'setPhoto': {
      const items = state.items.map((i) => {
        if (i.id !== action.id) return i;
        const { photoId, ...rest } = i;
        return action.photoId ? { ...rest, photoId: action.photoId } : rest;
      });
      const hadPhoto = state.items.some((i) => i.id === action.id && i.photoId);
      return { ...state, items, undo: hadPhoto ? state.items : null };
    }
    case 'setWeight': {
      const item = state.items.find((i) => i.id === action.id);
      if (!item?.perKgCents || !(action.grams > 0)) return state;
      return edit(state, action.id, { grams: action.grams, priceCents: linePriceCents(item.perKgCents, action.grams) });
    }
    case 'setPrice': {
      // A typo'd price is corrected in place, keeping the line's photo, quantity and checkout marks.
      const item = state.items.find((i) => i.id === action.id);
      const price = action.priceCents;
      if (!item || !(Number.isSafeInteger(price) && price > 0)) return state;
      if (item.perKgCents) {
        return edit(state, action.id, { perKgCents: price, priceCents: linePriceCents(price, item.grams) });
      }
      // An offer the new price no longer beats is dropped.
      const { deal, ...rest } = item;
      const kept = validDeal(deal, price);
      const corrected = { ...rest, priceCents: price, ...(kept ? { deal: kept } : {}) };
      return { ...state, items: state.items.map((i) => (i.id === action.id ? corrected : i)), undo: null };
    }
    case 'setDeal': {
      const item = state.items.find((i) => i.id === action.id);
      if (!item || item.perKgCents) return state;
      const { deal: old, ...rest } = item;
      const deal = action.deal === null ? null : validDeal(action.deal, item.priceCents);
      if (action.deal !== null && !deal) return state;
      const items = state.items.map((i) => (i.id === action.id ? { ...rest, ...(deal ? { deal } : {}) } : i));
      return { ...state, items, undo: !deal && old ? state.items : null }; // removing an offer can be undone
    }
    case 'setReceipt': {
      const { receiptCents, ...rest } = state;
      if (action.receiptCents === null) return { ...rest, undo: null };
      const valid = Number.isSafeInteger(action.receiptCents) && action.receiptCents > 0;
      return valid ? { ...state, receiptCents: action.receiptCents, undo: null } : state;
    }
    case 'toggleChecked':
      return edit(state, action.id, { checked: !state.items.find((i) => i.id === action.id)?.checked });
    case 'setCharged': {
      const items = state.items.map((i) => {
        if (i.id !== action.id) return i;
        const { chargedCents, ...rest } = i;
        return action.chargedCents == null ? rest : { ...rest, chargedCents: action.chargedCents, checked: true };
      });
      return { ...state, items, undo: null };
    }
    case 'remove':
      return { ...state, items: items.filter((i) => i.id !== action.id), undo: items };
    case 'clear':
      return items.length ? { ...state, items: [], undo: items } : state;
    case 'undo':
      return state.undo ? { ...state, items: state.undo, undo: null } : state;
    default:
      return state;
  }
}

function edit(state, id, patch) {
  return { ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), undo: null };
}

/** What a line costs as noted, its offer applied. A weighed line's priceCents is already its price, at qty 1. */
export function lineTotal({ priceCents, qty, deal }) {
  if (deal?.kind === 'tier' && qty >= deal.minQty) return deal.eachCents * qty;
  if (deal?.kind === 'multibuy') return priceCents * (Math.floor(qty / deal.buy) * deal.pay + (qty % deal.buy));
  return priceCents * qty;
}

const isPositive = (n) => Number.isSafeInteger(n) && n > 0;

/**
 * An offer checked against the line's price, keeping only its known fields; null when it doesn't hold up.
 * {kind: 'tier', minQty, eachCents}: from minQty units (2 to MAX_QTY), each costs eachCents, below the price.
 * {kind: 'multibuy', buy, pay}: "leve buy pague pay", every buy units (up to MAX_QTY) cost pay of them, fewer than buy.
 */
export function validDeal(deal, priceCents) {
  if (deal?.kind === 'tier') {
    const { minQty, eachCents } = deal;
    return isPositive(minQty) && minQty >= 2 && minQty <= MAX_QTY && isPositive(eachCents) && eachCents < priceCents
      ? { kind: 'tier', minQty, eachCents }
      : null;
  }
  if (deal?.kind === 'multibuy') {
    const { buy, pay } = deal;
    return isPositive(buy) && buy <= MAX_QTY && isPositive(pay) && pay < buy ? { kind: 'multibuy', buy, pay } : null;
  }
  return null;
}

/** What the line's offer takes off its full price, in centavos. */
export function dealSavings(item) {
  return item.priceCents * item.qty - lineTotal(item);
}

/** With "leve N pague M", whether one more unit would cost nothing. */
export function nextUnitFree(item) {
  return item.deal?.kind === 'multibuy' && item.qty % item.deal.buy >= item.deal.pay;
}

/** The price of one unit as the line is priced now: the tier price once the quantity reaches it. */
export function unitCents(item) {
  return item.deal?.kind === 'tier' && item.qty >= item.deal.minQty ? item.deal.eachCents : item.priceCents;
}

/**
 * What taking the tier's quantity would mean for a line below it: {qty, totalCents, savesCents, extraCents}, where
 * savesCents is the saving on those units and extraCents what the line would cost on top of now (negative when more
 * units cost less). null without a tier, or once the line has reached it.
 */
export function tierNudge(item) {
  const { deal } = item;
  if (deal?.kind !== 'tier' || item.qty >= deal.minQty) return null;
  const totalCents = deal.eachCents * deal.minQty;
  return {
    qty: deal.minQty,
    totalCents,
    savesCents: (item.priceCents - deal.eachCents) * deal.minQty,
    extraCents: totalCents - lineTotal(item),
  };
}

/** What the till charged beyond the noted line total: > 0 overcharged, < 0 in your favour, 0 if not charged. */
export function chargedDiff(item) {
  return item.chargedCents == null ? 0 : item.chargedCents - lineTotal(item);
}

export function total(state) {
  return state.items.reduce((sum, i) => sum + lineTotal(i), 0);
}

/** What the till charged, as far as the lines say: the charged amount where one was noted, else the line total. */
export function chargedTotal(state) {
  return state.items.reduce((sum, i) => sum + (i.chargedCents ?? lineTotal(i)), 0);
}

/**
 * The receipt total against the cart, or null without both. diffCents is the receipt minus the noted total (shelf
 * prices, what the lower-price rule protects); unexplainedCents is the receipt minus what the lines say was charged,
 * the part no noted line difference accounts for.
 */
export function receiptCheck(state) {
  if (state.receiptCents == null || !state.items.length) return null;
  const notedCents = total(state);
  const chargedCents = chargedTotal(state);
  const { receiptCents } = state;
  const diffCents = receiptCents - notedCents;
  return { receiptCents, notedCents, chargedCents, diffCents, unexplainedCents: receiptCents - chargedCents };
}

/** Every photo something still points to, including the undo snapshot, so Undo can bring it back. */
export function referencedPhotos(state) {
  const items = [...state.items, ...(state.undo ?? [])];
  return new Set(items.map((i) => i.photoId).filter(Boolean));
}

/** Checkout progress and mismatches. The charged amount is a line total, so it also catches double scans. */
export function checkSummary(state) {
  const summary = { checked: 0, lines: state.items.length, mismatches: 0, overchargeCents: 0, inFavorCents: 0 };
  for (const item of state.items) {
    if (item.checked) summary.checked++;
    const diff = chargedDiff(item);
    if (diff !== 0) summary.mismatches++;
    if (diff > 0) summary.overchargeCents += diff;
    if (diff < 0) summary.inFavorCents -= diff;
  }
  return summary;
}

/** Price of a weighed line, rounded to the centavo (halves up), as a scale label prints it. */
export function linePriceCents(perKgCents, grams) {
  return Math.round((perKgCents * grams) / 1000);
}

/**
 * The cart in display order, each item with n = its 1-based added position (for the "Item N" label).
 * key: 'added' | 'total' (the line total) | 'name'; dir: 'asc' | 'desc'. Ties keep the order items were added.
 * Unnamed items go after the named ones in both directions, ordered among themselves by the N of the "Item N" label
 * they show, so the sort flips them too.
 */
export function sortItems(items, { key = 'added', dir = 'desc' } = {}, locale = 'pt-BR') {
  const rows = items.map((item, i) => ({ item, n: i + 1 }));
  const sign = dir === 'asc' ? 1 : -1;
  const byAdded = (a, b) => a.n - b.n;
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const compare = {
    added: (a, b) => sign * byAdded(a, b),
    total: (a, b) => sign * (lineTotal(a.item) - lineTotal(b.item)) || byAdded(a, b),
    name: (a, b) => {
      const [an, bn] = [a.item.name, b.item.name];
      if (!an !== !bn) return an ? -1 : 1;
      if (!an) return sign * byAdded(a, b); // "Item 1" and "Item 3" differ on screen, so they are not a tie
      return sign * collator.compare(an, bn) || byAdded(a, b);
    },
  }[key];
  return rows.sort(compare);
}

export function counts(state) {
  return { lines: state.items.length, units: state.items.reduce((n, i) => n + i.qty, 0) };
}
