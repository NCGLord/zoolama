// The About tab: what zoolama is, what it keeps on this phone and how much space that takes, the version this phone
// runs (with a check for a newer one), its licence, where its code and its author are, and a way to share it. The logo is a copy of the header one, so tools/wordmark.py stays its one source; the
// rest is plain markup in index.html.

import { formatBytes } from '../i18n.js';
import { state } from './app-state.js';
import { $ } from './dom.js';
import { appVersion, checkForUpdate } from './pwa.js';
import { shareList } from './share-sheet.js';
import { tr } from './text.js';

$('about-logo').append(document.querySelector('.brand .wordmark').cloneNode(true));

/** What the About tab says that changes: the space in use, which photos grow. Where the browser won't say, nothing. */
async function renderAbout() {
  const usage = await navigator.storage?.estimate?.().then((e) => e.usage).catch(() => undefined);
  $('about-storage').hidden = usage === undefined;
  if (usage !== undefined) $('about-storage').textContent = tr('aboutStorage', { size: formatBytes(usage, state.lang) });
}
renderAbout();
$('tab-about').addEventListener('click', renderAbout);

/** The version this page runs: that of the worker that served it. */
async function renderVersion() {
  const version = await appVersion();
  $('about-version').hidden = !version;
  $('about-version').textContent = version ?? '';
}
renderVersion();
// A first visit has no worker to ask until one claims the page. Once the line shows a version, a worker that takes over
// is a newer one that the page only runs after a reload (the update toast offers it), so the line stays as it is.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if ($('about-version').hidden) renderVersion();
});

const RESULT = {
  ready: 'updatePending',
  found: 'updateFound',
  latest: 'updateLatest',
  offline: 'updateOffline',
  unavailable: 'updateUnavailable',
};

/** The check's outcome, kept as a data-i18n key so a language switch translates it too. */
function showResult(key) {
  $('about-update-result').dataset.i18n = key;
  $('about-update-result').textContent = tr(key);
}

$('about-update').addEventListener('click', async () => {
  $('about-update').disabled = true;
  showResult('updateChecking');
  showResult(RESULT[await checkForUpdate()]);
  $('about-update').disabled = false;
});

// The app's own address, wherever it is served from (GitHub Pages, or a local copy).
$('about-share').addEventListener('click', () =>
  shareList(`${tr('shareAppText')} ${new URL('./', location.href).href}`, { copied: 'linkCopied' }),
);

export { renderAbout };
