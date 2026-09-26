// The About tab: what zoolama is, what it keeps on this phone and how much space that takes, the version this phone
// runs and whether a newer one is waiting (with a check for one), its licence, where its code and its author are, and a
// way to share it. The logo is a copy of the header one, so tools/wordmark.py stays its one source; the rest is plain
// markup in index.html.

import { formatBytes } from '../i18n.js';
import { state } from './app-state.js';
import { $ } from './dom.js';
import { appVersion, checkForUpdate, onUpdateWaiting } from './pwa.js';
import { shareList } from './share-sheet.js';
import { tr } from './text.js';

$('about-logo').append(document.querySelector('.brand .wordmark').cloneNode(true));

/* ---------- the version, and updates ---------- */

/** The version this page runs: that of the worker that served it. */
async function renderVersion() {
  const version = await appVersion();
  $('about-version').hidden = !version;
  $('about-version').textContent = version ?? '';
}
renderVersion();
// A first visit has no worker to ask until one claims the page. Once the line shows a version, a worker that takes over
// is a newer one that the page only runs after a reload, so the line stays as it is: the update line says the rest.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if ($('about-version').hidden) renderVersion();
});

const RESULT = {
  found: 'updateFound',
  latest: 'updateLatest',
  offline: 'updateOffline',
  unavailable: 'updateUnavailable',
};

// What the update line says: the last check's outcome, or that a new version is waiting ({key: 'updatePending',
// version}), which outranks any outcome.
let update = null;

function waiting() {
  return update?.key === 'updatePending';
}

/** The update line and its button: Procurar atualização, or Atualizar while a new version waits to go on screen. */
function renderUpdate() {
  $('about-update-result').textContent = update ? tr(update.key, update) : '';
  $('about-update').dataset.i18n = waiting() ? 'update' : 'aboutCheckUpdate';
  $('about-update').textContent = tr($('about-update').dataset.i18n);
}

function showUpdate(next) {
  update = next;
  renderUpdate();
}

// A new version that took over without going on screen (the app was in use): About says so at once, with its number,
// in place of whatever an earlier check said. The worker answering now is the new one.
async function showWaiting() {
  showUpdate({ key: 'updatePending', version: (await appVersion()) ?? '' });
}
onUpdateWaiting(showWaiting);

$('about-update').addEventListener('click', async () => {
  if (waiting()) return location.reload(); // Atualizar: the waiting version goes on screen
  $('about-update').disabled = true;
  showUpdate({ key: 'updateChecking' });
  const result = await checkForUpdate();
  $('about-update').disabled = false;
  if (result === 'ready') await showWaiting();
  else if (!waiting()) showUpdate({ key: RESULT[result] }); // a version that landed meanwhile outranks the outcome
});

/* ---------- what else changes ---------- */

/** What the About tab says that changes: the update line, and the space in use (photos grow); if unknown, nothing. */
async function renderAbout() {
  renderUpdate();
  const usage = await navigator.storage?.estimate?.().then((e) => e.usage).catch(() => undefined);
  $('about-storage').hidden = usage === undefined;
  if (usage !== undefined) $('about-storage').textContent = tr('aboutStorage', { size: formatBytes(usage, state.lang) });
}
renderAbout();
$('tab-about').addEventListener('click', renderAbout);

// The app's own address, wherever it is served from (GitHub Pages, or a local copy).
$('about-share').addEventListener('click', () =>
  shareList(`${tr('shareAppText')} ${new URL('./', location.href).href}`, { copied: 'linkCopied' }),
);

export { renderAbout };
