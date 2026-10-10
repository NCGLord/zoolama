// The About tab: what zoolama is, what it keeps on this phone and the space and memory that takes, the version this
// phone runs and whether a newer one is waiting (with a check for one), its licence, where its code and its author are,
// and a way to share it. The logo is a copy of the header one, so tools/wordmark.py stays its one source; the rest is
// plain markup in index.html.

import { formatBytes } from '../i18n.js';
import { savedBytes, storageUsage } from '../usage.js';
import { state, storage } from './app-state.js';
import { $ } from './dom.js';
import {
  checkForUpdate,
  installedVersion,
  onUpdateLog,
  onUpdateState,
  pageVersion,
  reloadIntoUpdate,
  updateLog,
} from './pwa.js';
import { shareList } from './share-sheet.js';
import { tr } from './text.js';

$('about-logo').append(document.querySelector('.brand .wordmark').cloneNode(true));

/* ---------- the version, and updates ---------- */

// The version this page runs: its own, stamped into index.html. A worker that takes over later is a newer one that the
// page only runs after a reload, so the line stays as it is: the update line says the rest.
$('about-version').hidden = !pageVersion;
$('about-version').textContent = pageVersion ?? '';

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
let shownVersion = ''; // the number About names: the version waiting, or the one just updated to

/** The update line and its button: Procurar atualização, or Atualizar while a new version waits to go on screen. */
function renderUpdate() {
  const waiting = updateState === 'waiting';
  let line = '';
  if (waiting) line = shownVersion ? tr('updatePending', { version: shownVersion }) : tr('updateReady');
  else if (updateState === 'updated') line = tr('updateDone', { version: shownVersion });
  else if (updateState) line = tr(LINE[updateState]);
  $('about-update-result').textContent = line;
  $('about-update').dataset.i18n = waiting ? 'update' : 'aboutCheckUpdate';
  $('about-update').textContent = tr($('about-update').dataset.i18n);
  $('about-update').disabled = updateState === 'checking';
}

onUpdateState(async (next) => {
  updateState = next;
  if (next === 'waiting') shownVersion = (await installedVersion()) ?? ''; // the one a reload puts on screen
  if (next === 'updated') shownVersion = pageVersion ?? ''; // the one now on screen
  renderUpdate();
});

$('about-update').addEventListener('click', () => {
  if (updateState === 'waiting') reloadIntoUpdate({ about: true }); // Atualizar: the waiting version, on screen
  else checkForUpdate();
});

// The update log, drawn when opened and redrawn with each step while it stays open: time, then what happened, newest
// first. Its box scrolls (styles.css): it opens at the top, where each new step shows; scrolled down to read an older
// step, the view stays on that one as steps come in above it.
const clock = (t) => new Date(t).toLocaleTimeString('en-GB');
function renderLog({ opened = false } = {}) {
  if (!$('about-log').open) return;
  const box = $('about-log-steps');
  const reading = opened || box.scrollTop === 0 ? null : stepInView(box);
  box.replaceChildren(
    ...updateLog()
      .toReversed()
      .map(([t, e]) => Object.assign(document.createElement('li'), { textContent: `${clock(t)} ${e}` })),
  );
  const same = reading && [...box.children].find((li) => li.textContent === reading.text);
  box.scrollTop = same ? box.scrollTop + same.getBoundingClientRect().top - reading.top : 0;
}

/** The step at the top of the log's view, and where on screen it is. */
function stepInView(box) {
  const top = box.getBoundingClientRect().top + box.clientTop;
  const step = [...box.children].find((li) => li.getBoundingClientRect().bottom > top);
  return step && { text: step.textContent, top: step.getBoundingClientRect().top };
}
$('about-log').addEventListener('toggle', () => renderLog({ opened: true }));
onUpdateLog(() => renderLog());

/* ---------- what else changes ---------- */

/** Shows the line `id` saying `text`, or hides it when there's nothing to say (null). */
function say(id, text) {
  $(id).hidden = text === null;
  if (text !== null) $(id).textContent = text;
}

/**
 * What the About tab says that changes: the update line; the space in use (photos grow), split, and the space left;
 * whether the phone has agreed to keep it all; and the memory in use. What the browser doesn't say is left out.
 */
async function renderAbout() {
  renderUpdate();
  const size = (bytes) => formatBytes(bytes, state.lang);
  const [estimate, kept] = await Promise.all([
    navigator.storage?.estimate?.().catch(() => undefined),
    navigator.storage?.persisted?.().catch(() => undefined),
  ]);
  const usage = storageUsage(estimate, savedBytes(storage));
  say('about-storage', usage ? tr('aboutStorage', { size: size(usage.total) }) : null);
  $('about-storage-parts').hidden = !usage?.parts;
  for (const [part, bytes] of Object.entries(usage?.parts ?? {})) $(`about-storage-${part}`).textContent = size(bytes);
  say('about-storage-free', usage?.free == null ? null : tr('storageFree', { size: size(usage.free) }));
  say('about-storage-kept', typeof kept === 'boolean' ? tr(kept ? 'storageKept' : 'storageNotKept') : null);
  // Chromium's own figure, for this page's JavaScript alone and rounded: far below what the phone counts for the app.
  const heap = performance.memory?.usedJSHeapSize;
  say('about-memory', typeof heap === 'number' ? tr('memoryInUse', { size: size(heap) }) : null);
}
renderAbout();
$('tab-about').addEventListener('click', renderAbout);

// The app's own address, wherever it is served from (GitHub Pages, or a local copy).
$('about-share').addEventListener('click', () =>
  shareList(`${tr('shareAppText')} ${new URL('./', location.href).href}`, { copied: 'linkCopied' }),
);

export { renderAbout };
