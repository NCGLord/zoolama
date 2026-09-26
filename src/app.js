// The entry point. Business rules live in src/*.js and the screen in src/ui/*.js; this file only wires the views
// together (the language switch re-renders all of them, and the calls that would point up the module stack are
// registered here) and boots them.

import { launchState, opensMagnifier } from './launch.js';
import { state, persist, onSaveFailed } from './ui/app-state.js';
import { applyLang } from './ui/text.js';
import { acknowledgeNotSaved, defineToastActions, warnNotSaved } from './ui/toast.js';
import { collectPhotos } from './ui/photo-cache.js';
import { dispatchCart, setCartRenderer } from './ui/cart-store.js';
import { undoPlan } from './ui/plan-view.js';
import { renderEntryMode } from './ui/entry.js';
import { renderCart } from './ui/cart-view.js';
import { renderHistory, undoFinish, undoDeleteTrip, undoImport } from './ui/history-view.js';
import { renderOptions } from './ui/compare-view.js';
import { renderTab, renderTheme } from './ui/shell.js';
import { renderInstall, registerServiceWorker } from './ui/pwa.js';
import { openMagnifier } from './ui/magnifier-ui.js';
import './ui/about-screen.js';
import { renderAbout } from './ui/about-view.js';

/* ---------- language ---------- */

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    persist({ ...state, lang: b.dataset.lang });
    applyLang();
    renderTheme();
    renderEntryMode();
    renderCart();
    renderOptions();
    renderHistory();
    renderAbout();
  });
}

/* ---------- boot ---------- */

setCartRenderer(renderCart);

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
