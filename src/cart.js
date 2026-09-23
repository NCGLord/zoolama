// Pure cart reducer. Destructive actions (remove, clear, qty → 0, dropping a photo) keep a one-level
// undo snapshot so the UI can offer "Undo" instead of a confirm dialog; any other action drops it.
// An item may carry the photoId of its shelf-tag photo; the image itself lives in photos.js.
// At the till (checkout mode) an item can be ticked, and carry what the till charged for the whole line.

export function initialCart() {
  return { items: [], nextId: 1, undo: null };
}

export function cartReducer(state, action) {
  const { items } = state;
  switch (action.type) {
    case 'add': {
      const item = {
        id: state.nextId,
        name: (action.name ?? '').trim(),
        priceCents: action.priceCents,
        qty: action.qty ?? 1,
        ...(action.photoId ? { photoId: action.photoId } : {}),
      };
      return { items: [...items, item], nextId: state.nextId + 1, undo: null };
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

export function total(state) {
  return state.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
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
    if (item.chargedCents == null) continue;
    const diff = item.chargedCents - item.priceCents * item.qty;
    if (diff !== 0) summary.mismatches++;
    if (diff > 0) summary.overchargeCents += diff;
    if (diff < 0) summary.inFavorCents -= diff;
  }
  return summary;
}

export function counts(state) {
  return { lines: state.items.length, units: state.items.reduce((n, i) => n + i.qty, 0) };
}
