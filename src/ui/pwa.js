// Living on the home screen: the Install button, and the service worker that keeps the app offline and up to date.

import { installMode, isIOS } from '../install.js';
import { UPDATE_POLL_MS, dueForUpdateCheck, reloadsForUpdate } from '../update.js';
import { $, isTextField } from './dom.js';
import { offerUpdate, showToast } from './toast.js';

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

let registration = null;
let lastCheck = 0;
let takenOver = false; // a newer version took over after this page loaded; the page runs it once reloaded
let asked = false; // Procurar atualização found a version: it goes on screen as soon as it lands
let touched = false; // touched since the app last came to the front

function touch() {
  touched = true;
}
addEventListener('pointerdown', touch, true);
addEventListener('keydown', touch, true);

/**
 * What a reload would lose: an open sheet, the photo viewer or the magnifier, a field being typed in, or an item
 * half-entered in the form (its price, name, weight or photo). Everything else is saved as it changes.
 */
function busy() {
  return (
    Boolean(document.querySelector('dialog[open]')) ||
    isTextField(document.activeElement) ||
    ['price', 'name', 'weight'].some((id) => $(id).value.trim() !== '') ||
    !$('entry-photo-img').hidden
  );
}

// Told when a new version has taken over but waits to go on screen: About says so. About imports this module, so it
// hands its listener over instead.
let waitingListener = () => {};

function onUpdateWaiting(listener) {
  waitingListener = listener;
}

/** Puts a version that has taken over on screen, by reloading, when nothing can be lost. Returns whether it did. */
function applyUpdate() {
  const visible = document.visibilityState === 'visible';
  if (!takenOver || !reloadsForUpdate({ asked, touched, visible, busy: busy() })) return false;
  location.reload();
  return true;
}

/**
 * Looks for a new version now: 'ready' (one has already taken over, and Atualizar runs it), 'found' (it downloads,
 * then Atualizar is offered), 'latest', 'offline' or 'unavailable'.
 */
async function checkForUpdate() {
  if (takenOver) return 'ready'; // opening the app often fetches it before anyone asks
  if (!registration) return 'unavailable'; // no service worker (e.g. private mode), or not registered yet
  asked = true; // set before looking: a small update can land before the look even returns
  try {
    await registration.update();
  } catch {
    asked = false;
    return 'offline';
  }
  lastCheck = Date.now();
  asked = Boolean(registration.installing || registration.waiting); // nothing coming: a later update isn't "asked for"
  return asked ? 'found' : 'latest';
}

/** The version the running service worker was built as (sw.js VERSION), or null where none answers. */
function appVersion() {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : null);
    worker.postMessage('version', [port2]);
    setTimeout(() => resolve(null), 2000); // a worker from before it was asked this never answers
  });
}

/** Registers the service worker, looks for a new version while in front, and offers a reload once one takes over. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let controlled = Boolean(sw.controller);
  const firstInstall = !controlled;

  sw.register('./sw.js')
    .then((registered) => {
      registration = registered;
      lastCheck = Date.now(); // registering has just checked
      // Coming to the front, it always looks (it may have been away for days); while in front, it looks each minute
      // whether UPDATE_CHECK_MS have passed since the last look; in the background, never.
      const check = () => {
        if (document.visibilityState !== 'visible') return;
        lastCheck = Date.now();
        registration.update().catch(() => {}); // offline: the next check tries again
      };
      document.addEventListener('visibilitychange', check);
      setInterval(() => dueForUpdateCheck(Date.now(), lastCheck) && check(), UPDATE_POLL_MS);
      return sw.ready;
    })
    .then(() => firstInstall && showToast('offlineReady'))
    .catch(() => {}); // no SW (e.g. private mode): the app still works while the page is open

  // sw.js skips waiting and claims the page, so a new version takes over as soon as it has installed, while the screen
  // still runs the old one. It goes on screen by itself when nothing can be lost (see reloadsForUpdate); otherwise
  // Atualizar offers it, rather than a reload in the middle of typing.
  sw.addEventListener('controllerchange', () => {
    if (controlled) {
      takenOver = true;
      if (!applyUpdate()) {
        offerUpdate();
        waitingListener();
      }
    }
    controlled = true; // the first claim after a fresh install is not an update
  });

  // Coming back to the front starts afresh, as opening the app does; going out of sight is the other safe moment.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') touched = false;
    applyUpdate();
  });
}

export { renderInstall, registerServiceWorker, checkForUpdate, appVersion, onUpdateWaiting };
