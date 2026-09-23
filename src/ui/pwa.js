// Living on the home screen: the Install button, and the service worker that keeps the app offline and up to date.

import { installMode, isIOS } from '../install.js';
import { dueForUpdateCheck } from '../update.js';
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

export { renderInstall, registerServiceWorker };
