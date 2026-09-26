// The About tab: what zoolama is, the version this phone runs (with a check for a newer one), its licence, and where
// its code and its author are. The logo is a copy of the header one, so tools/wordmark.py stays its one source; the
// rest is plain markup in index.html.

import { $ } from './dom.js';
import { appVersion, checkForUpdate } from './pwa.js';
import { tr } from './text.js';

$('about-logo').append(document.querySelector('.brand .wordmark').cloneNode(true));

// Asked again when a new service worker takes over: on a first visit there is none to ask until then.
async function renderVersion() {
  const version = await appVersion();
  $('about-version').hidden = !version;
  $('about-version').textContent = version ?? '';
}
renderVersion();
navigator.serviceWorker?.addEventListener('controllerchange', renderVersion);

const RESULT = { found: 'updateFound', latest: 'updateLatest', offline: 'updateOffline', unavailable: 'updateUnavailable' };

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
