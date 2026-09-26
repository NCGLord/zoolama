// Living on the home screen: the Install button, and the service worker that keeps the app offline and up to date.

import { installMode, isIOS } from '../install.js';
import { UPDATE_POLL_MS, dueForUpdateCheck, nextUpdateState, reloadsForUpdate } from '../update.js';
import { persist, state } from './app-state.js';
import { $, isTextField } from './dom.js';
import { keepDraft } from './entry.js';
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
let controlled = false; // a version of the app runs here: before that, a download is its first install, not an update
let lastCheck = 0;
let takenOver = false; // a newer version took over after this page loaded; the page runs it once reloaded
let pageVersion = null; // the version on screen: that of the worker that served this page, asked at start

// A short record of what the update machinery did, kept across restarts (About shows it), to see on the phone where an
// update stopped. Never breaks anything: without storage it just isn't kept.
const LOG = 'zoolama:update-log';

function note(event) {
  try {
    const log = JSON.parse(localStorage.getItem(LOG)) ?? [];
    log.push([Date.now(), event]);
    localStorage.setItem(LOG, JSON.stringify(log.slice(-40)));
  } catch {
    // not kept
  }
}

function updateLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG)) ?? [];
  } catch {
    return [];
  }
}
let asked = false; // Procurar atualização found a version: it goes on screen as soon as it lands
let touched = false; // touched since the app last came to the front

function touch() {
  touched = true;
}
addEventListener('pointerdown', touch, true);
addEventListener('keydown', touch, true);

/**
 * What a reload would interrupt: an open sheet, the photo viewer or the magnifier, or a field being typed in. The rest
 * is saved as it changes, and the item half-entered in the form is carried across (entry.js). The full-screen About
 * isn't among them: updates are asked for there, and it holds nothing to lose.
 */
function busy() {
  return Boolean(document.querySelector('dialog[open]:not(#about-view)')) || isTextField(document.activeElement);
}

/* ---------- where updates stand ---------- */

// The one update state (see nextUpdateState), which every look and every download report into, and which About shows.
// About imports this module, so it hands its listener over.
let updateState = null; // no look yet
let stateListener = () => {};

function onUpdateState(listener) {
  stateListener = listener;
}

function setUpdateState(next) {
  note(next);
  updateState = nextUpdateState(updateState, next);
  stateListener(updateState); // a second version waiting is news too: About asks its number again
}

const watched = new WeakSet(); // each download is followed once, however many looks find it

/** Follows a download: one that doesn't finish (the signal dropped, say) is 'failed', and no longer asked for. */
function watch(worker) {
  if (!worker || watched.has(worker)) return;
  watched.add(worker);
  worker.addEventListener('statechange', () => {
    note(`download ${worker.state}`);
    if (worker.state !== 'redundant' || takenOver) return; // a worker that took over goes redundant when replaced
    asked = false;
    setUpdateState('failed');
  });
}

// Carried across an update's reload, for the new version to say it's on screen, and, when the shopper asked for it in
// About, to open back there.
const UPDATED = 'zoolama:updated';

/**
 * Reloads into the version that has taken over, the one way every update reaches the screen (by itself, or by an
 * Atualizar): the item being entered comes across, and the new version says it's there, opening in About when `about`.
 */
let reloading = false; // one reload per page: leaving the page fires visibilitychange, which must not start another

function reloadIntoUpdate({ about = false } = {}) {
  if (reloading) return;
  reloading = true;
  note(`reload${about ? ' to About' : ''}`);
  try {
    sessionStorage.setItem(UPDATED, JSON.stringify({ about }));
  } catch {
    // no session storage: the new version just won't say so
  }
  keepDraft();
  location.reload();
}

/** Puts a version that has taken over on screen by itself, when nothing can be lost. Returns whether it did. */
function applyUpdate() {
  const visible = document.visibilityState === 'visible';
  if (!takenOver) return false;
  const facts = { asked, touched, visible, busy: busy() };
  if (!reloadsForUpdate(facts)) {
    note(`waits: ${Object.entries(facts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    return false;
  }
  reloadIntoUpdate({ about: asked });
  return true;
}

/** Right after an update's reload: back in About if it was asked for there, and saying the app is up to date. */
function resumeAfterUpdate() {
  let updated = null;
  try {
    updated = JSON.parse(sessionStorage.getItem(UPDATED));
    sessionStorage.removeItem(UPDATED);
  } catch {
    return;
  }
  if (!updated) return;
  if (updated.about) persist({ ...state, tab: 'about' });
  showToast('appUpdated');
  setUpdateState('updated'); // About says so too, until the next look

}

/** One look for a new version, the app's own or the shopper's (`asking`); its outcome goes into the update state. */
async function look({ asking = false } = {}) {
  if (!registration || !controlled) {
    if (asking) setUpdateState('unavailable'); // no service worker (e.g. private mode), or not running one yet
    return;
  }
  note(`look ${asking ? 'asked' : 'own'}`);
  if (asking) {
    asked = true; // set before looking: a small update can land before the look even returns
    setUpdateState('checking');
  }
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch {
    asked = false;
    setUpdateState('offline');
    return;
  }
  const incoming = registration.installing ?? registration.waiting;
  if (!incoming) {
    if (await pageBehind()) return noticeTakeover('look'); // installed already: this page just hasn't caught up
    asked = false; // nothing coming: a later update isn't "asked for"
    setUpdateState('latest');
    return;
  }
  setUpdateState('found');
  watch(incoming);
}

/**
 * A newer version runs the service worker while this page still shows the old one: on screen now if nothing can be
 * lost, otherwise offered. Reached by the takeover event, or by a look that finds the page behind, since a paused page
 * (Android) can miss the event and must not stay behind for want of it.
 */
function noticeTakeover(how) {
  note(`taken over (${how})`);
  takenOver = true;
  if (!applyUpdate()) {
    offerUpdate();
    setUpdateState('waiting');
  }
}

/** Whether the installed version is a different one from the page's: the truth, whatever events arrived. */
async function pageBehind() {
  const installed = await versionOf(registration.active);
  return Boolean(pageVersion && installed && installed !== pageVersion);
}

/** Procurar atualização: the shopper's look. */
function checkForUpdate() {
  return look({ asking: true });
}

/** The version the running service worker was built as (sw.js VERSION), or null where none answers. */
function appVersion() {
  return versionOf(navigator.serviceWorker?.controller);
}

/** The version a service worker was built as, or null where none answers. */
function versionOf(worker) {
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
  controlled = Boolean(sw.controller);
  const firstInstall = !controlled;
  if (controlled) {
    appVersion().then((version) => {
      pageVersion = version;
      note(`start ${version}`);
    });
  } else note('start, first install');

  sw.register('./sw.js')
    .then((registered) => {
      registration = registered;
      lastCheck = Date.now(); // registering has just checked
      // Any download, whoever started it (opening the app makes the browser look too), is followed from its start.
      registration.addEventListener('updatefound', () => {
        note('download started');
        if (!controlled) return; // the first install, not an update
        setUpdateState('found');
        watch(registration.installing);
      });
      // Coming to the front, it always looks (it may have been away for days); while in front, it looks each minute
      // whether UPDATE_CHECK_MS have passed since the last look; in the background, never.
      const lookInFront = () => document.visibilityState === 'visible' && look();
      document.addEventListener('visibilitychange', lookInFront);
      setInterval(() => dueForUpdateCheck(Date.now(), lastCheck) && lookInFront(), UPDATE_POLL_MS);
      return sw.ready;
    })
    .then(() => firstInstall && showToast('offlineReady'))
    .catch(() => {}); // no SW (e.g. private mode): the app still works while the page is open

  // sw.js skips waiting and claims the page, so a new version takes over as soon as it has installed, while the screen
  // still runs the old one. It goes on screen by itself when nothing can be lost (see reloadsForUpdate); otherwise
  // Atualizar offers it, rather than a reload in the middle of typing.
  sw.addEventListener('controllerchange', () => {
    note('controller changed');
    if (controlled) noticeTakeover('event');
    controlled = true; // the first claim after a fresh install is not an update
  });

  // Coming back to the front starts afresh, as opening the app does; going out of sight is the other safe moment.
  document.addEventListener('visibilitychange', () => {
    note(`app ${document.visibilityState}`);
    if (document.visibilityState === 'visible') touched = false;
    applyUpdate();
  });
}

export {
  renderInstall,
  registerServiceWorker,
  resumeAfterUpdate,
  updateLog,
  reloadIntoUpdate,
  checkForUpdate,
  appVersion,
  onUpdateState,
};
