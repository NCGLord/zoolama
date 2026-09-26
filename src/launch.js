// Where the app opens when launched from a home-screen shortcut (see "shortcuts" in manifest.webmanifest):
// ./?tab=compare opens Compare, ./?check=1 opens the cart in checkout mode, ./?magnifier=1 opens the magnifier. Any
// other start opens the app as it was.

import { TABS } from './state.js';

/** The state to open with, given the start URL's query; `state` itself when the query asks for nothing. */
export function launchState(state, search) {
  const query = new URLSearchParams(search);
  if (query.get('check') === '1') {
    // Checkout mode needs something to check; with an empty cart it opens the cart to fill instead.
    return { ...state, tab: 'cart', checking: state.cart.items.length > 0 };
  }
  const tab = query.get('tab');
  return TABS.includes(tab) ? { ...state, tab } : state;
}

/** Whether the start URL's query asks for the magnifier, which is opened over the app rather than kept in its state. */
export function opensMagnifier(search) {
  return new URLSearchParams(search).get('magnifier') === '1';
}
