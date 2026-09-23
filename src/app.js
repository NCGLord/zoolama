// DOM wiring only: events → reducers → save → render. Business rules live in the other modules.

import { installMode, isIOS } from './install.js';
import { dueForUpdateCheck } from './update.js';
import { $ } from './ui/dom.js';
import { state, persist } from './ui/app-state.js';
import { applyLang } from './ui/text.js';
import { showToast, offerUpdate, defineToastActions } from './ui/toast.js';
import { collectPhotos } from './ui/photo-cache.js';
import { dispatchCart, setCartRenderer } from './ui/cart-store.js';
import { renderEntryMode } from './ui/entry.js';
import { renderCart } from './ui/cart-view.js';
import { renderHistory, undoFinish, undoDeleteTrip } from './ui/history-view.js';
import { renderOptions } from './ui/compare-view.js';
import { renderTab, renderTheme } from './ui/shell.js';

/* ---------- install ---------- */

let installPrompt = null;
const ios = isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const currentInstallMode = () => installMode({ standalone: standalone(), hasPrompt: Boolean(installPrompt), ios });

function renderInstall() {
  $('install').hidden = currentInstallMode() === 'hidden';
}

// Chromium offers installation through this event; keep it for our own button instead of its mini-infobar.
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
  showToast('installed');
});

$('install').addEventListener('click', () => {
  const mode = currentInstallMode();
  if (mode === 'ios') $('ios-install').showModal();
  if (mode === 'prompt') {
    const prompt = installPrompt;
    installPrompt = null; // single use; Chromium fires a fresh event if the user declines
    renderInstall();
    prompt.prompt();
  }
});

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
  });
}

/* ---------- boot ---------- */

setCartRenderer(renderCart);

// cartUndo: it needs the cart's one-level undo snapshot, which any other cart change drops.
defineToastActions({
  undo: { label: 'undo', run: () => dispatchCart({ type: 'undo' }), cartUndo: true },
  update: { label: 'update', run: () => location.reload() },
  undoFinish: { label: 'undo', run: () => undoFinish(), cartUndo: true },
  undoDelete: { label: 'undo', run: () => undoDeleteTrip() },
});

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
registerServiceWorker();

/** Registers the service worker, looks for a new version on resume, and offers a reload once one takes over. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let controlled = Boolean(sw.controller);
  const firstInstall = !controlled;

  sw.register('./sw.js')
    .then((registration) => {
      let lastCheck = Date.now(); // registering has just checked
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !dueForUpdateCheck(Date.now(), lastCheck)) return;
        lastCheck = Date.now();
        registration.update().catch(() => {}); // offline: the next foregrounding tries again
      });
      return sw.ready;
    })
    .then(() => firstInstall && showToast('offlineReady'))
    .catch(() => {}); // no SW (e.g. private mode): the app still works while the page is open

  // sw.js skips waiting and claims the page, so a new version takes over as soon as it has installed.
  // The screen still shows the old one; offer a reload rather than forcing it mid-typing.
  sw.addEventListener('controllerchange', () => {
    if (controlled) offerUpdate();
    controlled = true; // the first claim after a fresh install is not an update
  });
}
