// The entry point. Business rules live in src/*.js and the screen in src/ui/*.js; this file only wires the views
// together (the language switch re-renders all of them, and the calls that would point up the module stack are
// registered here) and boots them.

import { launchState, opensMagnifier } from './launch.js';
import { HISTORY_KEY, KEY } from './store.js';
import { state, persist, onSaveFailed, reloadState } from './ui/app-state.js';
import { applyLang } from './ui/text.js';
import { acknowledgeNotSaved, defineToastActions, dropStaleUndo, warnNotSaved } from './ui/toast.js';
import { collectPhotos } from './ui/photo-cache.js';
import { dispatchCart, setCartRenderer } from './ui/cart-store.js';
import { undoPlan } from './ui/plan-view.js';
import { renderEntryMode } from './ui/entry.js';
import { renderCart } from './ui/cart-view.js';
import { renderHistory, reloadTrips, undoFinish, undoDeleteTrip, undoImport } from './ui/history-view.js';
import { renderOptions } from './ui/compare-view.js';
import { renderTab, renderTheme } from './ui/shell.js';
import { renderInstall, registerServiceWorker, resumeAfterUpdate } from './ui/pwa.js';
import { openMagnifier } from './ui/magnifier-ui.js';
import './ui/about-screen.js';
import { renderAbout } from './ui/about-view.js';
import { onPricesChanged } from './ui/price-memory.js';

/** Draws every view from the state again: after a language switch, or once another copy of the app has saved. */
function renderAll() {
  applyLang();
  renderTheme();
  renderEntryMode();
  renderCart();
  renderOptions();
  renderHistory();
  renderAbout();
}

/* ---------- language ---------- */

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    persist({ ...state, lang: b.dataset.lang });
    renderAll();
  });
}

/* ---------- the app open twice ---------- */

// The installed app and a browser tab, say, share one storage, and the browser tells each copy when the other saves.
// This copy then takes up what was saved (its own tab stays), so it never shows, nor later saves over, what's out of
// date.
addEventListener('storage', (e) => {
  if (e.key === KEY || e.key === null) {
    reloadState();
    dropStaleUndo(); // an Undo offered here can't undo the other copy's change
    renderAll();
  }
  if (e.key === HISTORY_KEY || e.key === null) reloadTrips();
});

/* ---------- boot ---------- */

setCartRenderer(renderCart);
// What things cost last time changes with the history: the cart's notes and the entry's hint follow it.
onPricesChanged(() => {
  renderCart();
  renderEntryMode();
});

// cartUndo / planUndo: it needs the cart's or the list's one-level undo snapshot, which any later change drops.
defineToastActions({
  undo: { label: 'undo', run: () => dispatchCart({ type: 'undo' }), cartUndo: true },
  update: { label: 'update', run: () => location.reload() },
  undoFinish: { label: 'undo', run: () => undoFinish(), cartUndo: true },
  undoDelete: { label: 'undo', run: () => undoDeleteTrip() },
  undoImport: { label: 'undo', run: () => undoImport() },
  undoPlan: { label: 'undo', run: () => undoPlan(), planUndo: true },
  notSavedSeen: { label: 'gotIt', run: () => acknowledgeNotSaved() },
});
onSaveFailed(warnNotSaved);

// A home-screen shortcut opens a tab, checkout mode or the magnifier; then the query goes, so a reload doesn't apply it
// again.
const launched = launchState(state, location.search);
if (launched !== state) persist(launched);
const magnify = opensMagnifier(location.search);
if (location.search) window.history.replaceState(null, '', location.pathname);

// First, so a view that throws while being drawn below can't also stop the updates that would bring its fix.
registerServiceWorker();
resumeAfterUpdate(); // before the tabs are drawn: an update asked for in About reopens there

applyLang();
renderTheme();
renderCart();
renderOptions();
renderTab();
renderEntryMode();
renderHistory();
renderInstall();
collectPhotos();
navigator.storage?.persist?.().catch(() => {});
if (magnify) openMagnifier();
