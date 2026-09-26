// The app's state and the one way to change it. Read `state` anywhere: an imported `let` is a live binding, so it
// always shows the latest state. Replace it only through persist(), which saves every change. Never destructure
// `state` at a module's top level: that freezes a snapshot of the state as it was when the module loaded.

import { detectLang } from '../i18n.js';
import { restoreState } from '../state.js';
import { load, save } from '../store.js';

// Reading window.localStorage itself throws when storage is blocked; store.js copes with null.
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

// Field by field: a bad value falls back to its default instead of breaking a view (see src/state.js).
let state = restoreState(load(storage), { lang: detectLang(navigator.language) });

// A change the browser wouldn't keep (its storage is full, or blocked) must not go unnoticed: it would be gone at the
// next start. The toast says so, but it imports this module, so boot hands the warning over instead.
let saveFailed = () => {};

function onSaveFailed(warn) {
  saveFailed = warn;
}

function persist(next) {
  state = next;
  if (!save(storage, state)) saveFailed();
}

/** Takes up the state another copy of the app has saved (see app.js), keeping this copy's own tab. Saves nothing. */
function reloadState() {
  state = { ...restoreState(load(storage), { lang: state.lang }), tab: state.tab };
}

export { storage, state, persist, onSaveFailed, reloadState };
