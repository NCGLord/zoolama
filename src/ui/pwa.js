// Living on the home screen: the Install button, and the service worker that keeps the app offline and up to date.

import { installMode, isIOS } from '../install.js';
import {
  LOG_KEEP,
  UPDATE_GIVE_UP_MS,
  UPDATE_POLL_MS,
  dueForUpdateCheck,
  mergeLogs,
  nextUpdateState,
  reloadsForUpdate,
} from '../update.js';
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
// The version on screen: this page's own, which `npm run stamp` writes into index.html. Not asked of the controller: a
// new version can take the page over while it's still loading, before anything here listens, and answer for a page it
// never served.
const pageVersion = document.querySelector('meta[name="version"]')?.content || null;

// A page that reloaded for being behind and came back as the same version can't catch up by reloading again (a cache
// whose page isn't its version's): it stops taking a version comparison for a takeover, so it never reloads in a loop.
const BEHIND = 'zoolama:behind-from';
let stuckBehind = false;

// A short record of what the update machinery did, kept across restarts (About shows it), to see on the phone where an
// update stopped. Each open copy (the installed app, a browser tab) keeps its own, as two copies writing one log lose
// each other's steps; About shows them merged. Never breaks anything: without storage it just isn't kept.
const LOG = 'zoolama:update-log'; // each copy's is LOG:<copy>; LOG alone is the one log of earlier versions
const COPY = 'zoolama:copy';
const isLogKey = (key) => key === LOG || key.startsWith(`${LOG}:`);

/** This copy's log: sessionStorage is per copy and outlives its reloads, so an update's reload keeps writing the same. */
const ownLog = (() => {
  const fresh = () => Math.random().toString(36).slice(2, 8);
  try {
    const copy = sessionStorage.getItem(COPY) ?? fresh();
    sessionStorage.setItem(COPY, copy);
    return `${LOG}:${copy}`;
  } catch {
    return `${LOG}:${fresh()}`;
  }
})();

function readLog(key) {
  try {
    const log = JSON.parse(localStorage.getItem(key));
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

let logListener = () => {}; // About, which redraws the log while it's open

function onUpdateLog(listener) {
  logListener = listener;
}

function note(event) {
  try {
    const log = readLog(ownLog);
    log.push([Date.now(), event]);
    localStorage.setItem(ownLog, JSON.stringify(log.slice(-LOG_KEEP)));
  } catch {
    // not kept
  }
  logListener();
}

const logKeys = () => {
  try {
    return Object.keys(localStorage).filter(isLogKey);
  } catch {
    return [];
  }
};

/** Every copy's steps, merged in time order: the log About shows. */
function updateLog() {
  return mergeLogs(logKeys().map(readLog));
}

/** Drops the logs of copies long closed: those with no step among the ones About shows. */
function pruneLogs() {
  const oldestShown = updateLog()[0]?.[0] ?? Infinity;
  for (const key of logKeys()) {
    if (key !== ownLog && !(readLog(key).at(-1)?.[0] >= oldestShown)) localStorage.removeItem(key);
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

/** `promise`, or a failure once `ms` have passed without it settling. */
function withinTime(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer)); // cleared, `late` never fails unheard
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
    await withinTime(registration.update(), UPDATE_GIVE_UP_MS);
  } catch {
    asked = false;
    // With the signal fine, it's the server that failed (sw.js answered 404 or 500): no use asking for signal.
    setUpdateState(navigator.onLine ? 'unavailable' : 'offline');
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
  if (how !== 'event') {
    // seen by comparing versions, not told by the browser: one reload to catch up, never a loop
    if (stuckBehind) return;
    try {
      sessionStorage.setItem(BEHIND, pageVersion);
    } catch {
      // no session storage: no guard, and no loop either, as each reload starts afresh
    }
  }
  note(`taken over (${how})`);
  takenOver = true;
  if (!applyUpdate()) {
    asked = false; // it waits, offered like any other: a later look mustn't reload mid-shop on that old ask
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


/**
 * The version installed to go on screen next: the active worker's, which a reload runs. Not the controller's, which
 * stays the old worker when no controllerchange came (a look noticed the takeover); and not via register(), which
 * waits while a download is under way.
 */
async function installedVersion() {
  const current = await navigator.serviceWorker?.getRegistration();
  return versionOf(current?.active ?? null);
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
  pruneLogs();
  if (controlled) {
    note(`start ${pageVersion}`);
    try {
      stuckBehind = sessionStorage.getItem(BEHIND) === pageVersion;
      sessionStorage.removeItem(BEHIND);
    } catch {
      // no session storage: no guard needed, see noticeTakeover
    }
    if (stuckBehind) note('back behind after a reload: not again');
    // Taken over while loading, before the controllerchange listener below existed: the worker now in charge isn't the
    // one that served this page, and no event will come.
    versionOf(sw.controller).then((serving) => {
      if (pageVersion && serving && serving !== pageVersion) noticeTakeover('start');
    });
  } else note('start, first install');

  // A download that started before this page could hear of it (one an update's reload left running, say) has had its
  // updatefound already: follow it from here. Not from register(), which resolves only once that download is done.
  if (controlled) {
    sw.getRegistration().then((current) => {
      if (!current?.installing) return;
      note('download under way');
      setUpdateState('found');
      watch(current.installing);
    });
  }

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
  onUpdateLog,
  reloadIntoUpdate,
  checkForUpdate,
  pageVersion,
  installedVersion,
  onUpdateState,
};
