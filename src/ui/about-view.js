// The About tab: what zoolama is, what it keeps on this phone and how much space that takes, the version this phone
// runs and whether a newer one is waiting (with a check for one), its licence, where its code and its author are, and a
// way to share it. The logo is a copy of the header one, so tools/wordmark.py stays its one source; the rest is plain
// markup in index.html.

import { formatBytes } from '../i18n.js';
import { state } from './app-state.js';
import { $ } from './dom.js';
import { appVersion, checkForUpdate, onUpdateState } from './pwa.js';
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

// The update line says where updates stand, as the app's one update state has it (see pwa.js): whoever looked, the
// latest look, and a new version waiting to go on screen above all, with its number.
const LINE = {
  checking: 'updateChecking',
  latest: 'updateLatest',
  offline: 'updateOffline',
  unavailable: 'updateUnavailable',
  found: 'updateFound',
  failed: 'updateFailed',
};
let updateState = null;
let waitingVersion = ''; // the number of the version waiting, asked of it as it takes over

/** The update line and its button: Procurar atualização, or Atualizar while a new version waits to go on screen. */
function renderUpdate() {
  const waiting = updateState === 'waiting';
  let line = '';
  if (waiting) line = waitingVersion ? tr('updatePending', { version: waitingVersion }) : tr('updateReady');
  else if (updateState) line = tr(LINE[updateState]);
  $('about-update-result').textContent = line;
  $('about-update').dataset.i18n = waiting ? 'update' : 'aboutCheckUpdate';
  $('about-update').textContent = tr($('about-update').dataset.i18n);
  $('about-update').disabled = updateState === 'checking';
}

onUpdateState(async (next) => {
  updateState = next;
  if (next === 'waiting') waitingVersion = (await appVersion()) ?? ''; // the worker answering now is the new one
  renderUpdate();
});

$('about-update').addEventListener('click', () => {
  if (updateState === 'waiting') location.reload(); // Atualizar: the waiting version goes on screen
  else checkForUpdate();
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
