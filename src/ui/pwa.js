// Living on the home screen: the Install button, and the service worker that keeps the app offline and up to date.

import { installMode, isIOS } from '../install.js';
import { UPDATE_POLL_MS, dueForUpdateCheck } from '../update.js';
import { $ } from './dom.js';
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

/** Looks for a new version now: 'found' (it downloads, then Atualizar is offered), 'latest', 'offline' or 'unavailable'. */
async function checkForUpdate() {
  if (!registration) return 'unavailable'; // no service worker (e.g. private mode), or not registered yet
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  lastCheck = Date.now();
  return registration.installing || registration.waiting ? 'found' : 'latest';
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
      // On coming to the front, and every minute while there, it asks whether a check is due (UPDATE_CHECK_MS since
      // the last) and checks only then; in the background it never looks.
      const check = () => {
        if (document.visibilityState !== 'visible' || !dueForUpdateCheck(Date.now(), lastCheck)) return;
        lastCheck = Date.now();
        registration.update().catch(() => {}); // offline: the next check tries again
      };
      document.addEventListener('visibilitychange', check);
      setInterval(check, UPDATE_POLL_MS);
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

export { renderInstall, registerServiceWorker, checkForUpdate, appVersion };
