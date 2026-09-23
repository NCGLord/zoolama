// The shopping list for the next trip, seeded from a past trip ("Comprar de novo"). An item on it is bought while the
// cart holds an item of the same name (see nameKey), so adding, renaming or removing cart lines updates it with no
// bookkeeping of its own. Finishing a trip takes the bought items off; the rest wait for the next one. A pure reducer
// with a one-level undo, like the cart's.

import { nameKey } from './history.js';

export function initialPlan() {
  return { items: [], nextId: 1, undo: null };
}

const isPositive = (n) => Number.isSafeInteger(n) && n > 0;
const validItems = (items) =>
  Array.isArray(items) && items.every((i) => isPositive(i?.id) && typeof i.name === 'string' && nameKey(i.name) !== '');

/** A saved list, or an empty one when it is missing or doesn't hold up. */
export function restorePlan(saved) {
  if (!validItems(saved?.items)) return initialPlan();
  const undo = validItems(saved.undo) ? saved.undo.map(({ id, name }) => ({ id, name })) : null;
  const used = Math.max(0, ...saved.items.map((i) => i.id), ...(undo ?? []).map((i) => i.id));
  return {
    items: saved.items.map(({ id, name }) => ({ id, name })),
    nextId: isPositive(saved.nextId) && saved.nextId > used ? saved.nextId : used + 1,
    undo,
  };
}

export function planReducer(state, action) {
  switch (action.type) {
    case 'addNames': {
      // Names not on the list yet, each once, in the order given.
      const known = new Set(state.items.map((i) => nameKey(i.name)));
      const added = [];
      let nextId = state.nextId;
      for (const raw of action.names) {
        const name = String(raw ?? '').trim();
        const key = nameKey(name);
        if (!key || known.has(key)) continue;
        known.add(key);
        added.push({ id: nextId++, name });
      }
      return added.length ? { items: [...state.items, ...added], nextId, undo: state.items } : state;
    }
    case 'dropBought': {
      const bought = new Set(action.names.map(nameKey));
      const items = state.items.filter((i) => !bought.has(nameKey(i.name)));
      // Always replaces the undo snapshot, so undoing a finished trip can never bring back an older list.
      return { ...state, items, undo: items.length < state.items.length ? state.items : null };
    }
    case 'clear':
      return state.items.length ? { ...state, items: [], undo: state.items } : state;
    case 'undo':
      return state.undo ? { ...state, items: state.undo, undo: null } : state;
    default:
      return state;
  }
}

/** The names on a past trip worth buying again: each once, in the trip's order, unnamed lines left out. */
export function planNames(trip) {
  const seen = new Set();
  return trip.items
    .map((i) => i.name.trim())
    .filter((name) => {
      const key = nameKey(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Each list item with whether the cart already holds it; still-to-buy first, each group in list order. */
export function planView(plan, cart) {
  const inCart = new Set(cart.items.map((i) => nameKey(i.name)));
  const rows = plan.items.map((item) => ({ ...item, bought: inCart.has(nameKey(item.name)) }));
  return [...rows.filter((r) => !r.bought), ...rows.filter((r) => r.bought)];
}
