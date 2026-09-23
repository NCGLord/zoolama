// The app's state and the one way to change it. Read `state` anywhere: an imported `let` is a live binding, so it
// always shows the latest state. Replace it only through persist(), which saves every change. Never destructure
// `state` at a module's top level: that freezes a snapshot of the state as it was when the module loaded.

import { initialCart } from '../cart.js';
import { detectLang } from '../i18n.js';
import { load, save } from '../store.js';

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

function persist(next) {
  state = next;
  save(storage, state);
}

export { storage, blankOption, initialCompare, state, persist };
