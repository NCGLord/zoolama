// Finished trips: the Finalizar sheet (and its celebration), the History tab, and sharing or deleting a past trip.

import { backupFileName, backupJson, mergeTrips, readBackup } from '../backup.js';
import { counts, lineTotal, total } from '../cart.js';
import { celebrates } from '../delight.js';
import { monthlyGroups, storeNames, tripFromCart } from '../history.js';
import { LOCALES } from '../i18n.js';
import { formatMoney } from '../money.js';
import { shareText } from '../share.js';
import { loadHistory, saveHistory } from '../store.js';
import { persist, state, storage } from './app-state.js';
import { dispatchCart } from './cart-store.js';
import { $, h, reducedMotion } from './dom.js';
import { rememberPrices } from './price-memory.js';
import { shareList } from './share-sheet.js';
import { eachText, tagPrice, tr } from './text.js';
import { showToast } from './toast.js';

let trips = loadHistory(storage);
let lastFinishedId = null; // trip saved by the latest Finalizar, for its Undo
let lastDeleted = null; // { trip, index } for the latest delete's Undo

function setTrips(next) {
  trips = next;
  const saved = saveHistory(storage, trips);
  renderHistory();
  return saved;
}

$('finish').addEventListener('click', () => {
  tagPrice($('finish-total'), total(state.cart));
  $('finish-count').textContent = tr('itemsCount', { n: counts(state.cart).units });
  $('store-names').replaceChildren(...storeNames(trips).map((name) => h('option', { value: name })));
  $('finish-store').value = '';
  $('finish-sheet').showModal();
});

$('finish-cancel').addEventListener('click', () => $('finish-sheet').close());

$('finish-form').addEventListener('submit', () => {
  const party = celebrates(total(state.cart), state.budgetCents);
  const trip = tripFromCart(state.cart, { id: crypto.randomUUID(), at: Date.now(), store: $('finish-store').value });
  if (!setTrips([trip, ...trips])) {
    trips = trips.filter((t) => t.id !== trip.id); // not stored: keep the cart, don't pretend
    renderHistory();
    showToast('tripNotSaved');
    return;
  }
  lastFinishedId = trip.id;
  persist({ ...state, checking: false });
  dispatchCart({ type: 'clear' }); // photos stay while Undo can still bring the cart back
  showToast('tripSaved', { action: 'undoFinish' });
  if (party) burst();
});

/** A handful of little price tags in the theme's colours fly up from the total and fall away. */
function burst() {
  if (reducedMotion.matches) return;
  const root = getComputedStyle(document.documentElement);
  const colours = ['--tag', '--primary', '--dear', '--good'].map((v) => root.getPropertyValue(v).trim());
  const from = $('tally').getBoundingClientRect();
  const layer = h('div', { class: 'burst', 'aria-hidden': 'true' });
  document.body.append(layer);
  const PIECES = 22;
  let landed = 0;
  for (let i = 0; i < PIECES; i++) {
    const tag = h('span', { class: 'burst-tag' });
    tag.style.background = colours[i % colours.length];
    tag.style.left = `${from.left + from.width * (0.15 + Math.random() * 0.7)}px`;
    tag.style.top = `${from.top + 8}px`;
    layer.append(tag);
    const dx = (Math.random() - 0.5) * 320;
    const dy = -(180 + Math.random() * 300);
    const spin = (Math.random() - 0.5) * 900;
    tag.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.25}px, ${dy + 320}px) rotate(${spin * 1.6}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 400, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    ).onfinish = () => ++landed === PIECES && layer.remove();
  }
}

function undoFinish() {
  if (!state.cart.undo) return; // the cart can't come back, so the trip must stay
  setTrips(trips.filter((t) => t.id !== lastFinishedId));
  dispatchCart({ type: 'undo' });
}

function tripTitle(trip) {
  const date = new Intl.DateTimeFormat(LOCALES[state.lang], { dateStyle: 'short' }).format(trip.at);
  return `Zoolama — ${trip.store || tr('tripUnnamed')}, ${date}`;
}

$('history').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'share-trip') {
    const trip = trips.find((t) => t.id === e.target.closest('[data-trip]').dataset.trip);
    shareList(shareText(trip.items, { lang: state.lang, title: tripTitle(trip) }));
  }
  if (action !== 'delete-trip') return;
  const id = e.target.closest('[data-trip]').dataset.trip;
  const index = trips.findIndex((t) => t.id === id);
  lastDeleted = { trip: trips[index], index };
  setTrips(trips.filter((t) => t.id !== id));
  showToast('tripDeleted', { action: 'undoDelete' });
});

function undoDeleteTrip() {
  if (!lastDeleted) return;
  const next = [...trips];
  next.splice(lastDeleted.index, 0, lastDeleted.trip);
  lastDeleted = null;
  setTrips(next);
}

function tripView(trip, whenFormat) {
  const amount = (cents) => formatMoney(cents, state.lang);
  return h(
    'details',
    { class: 'trip', 'data-trip': trip.id },
    h(
      'summary',
      {},
      h('span', { class: 'trip-store', text: trip.store || tr('tripUnnamed') }),
      h('span', { class: 'trip-total', text: amount(trip.totalCents) }),
      h(
        'span',
        { class: 'trip-meta' },
        h('span', { text: whenFormat.format(trip.at) }),
        h('span', { text: tr('itemsCount', { n: trip.units }) }),
        trip.overchargeCents ? h('span', { class: 'over', text: tr('overcharged', { amount: amount(trip.overchargeCents) }) }) : '',
        trip.receiptCents ? h('span', { text: tr('tripReceipt', { amount: amount(trip.receiptCents) }) }) : '',
      ),
    ),
    h(
      'ul',
      { class: 'trip-items' },
      ...trip.items.map((item, i) =>
        h(
          'li',
          {},
          h('span', { text: item.name || tr('itemN', { n: i + 1 }) }),
          h('span', { class: 'each', text: eachText(item) }),
          h('span', { class: 'sub', text: amount(lineTotal(item)) }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'trip-actions' },
      h('button', { type: 'button', class: 'secondary', 'data-action': 'share-trip' }, tr('share')),
      h('button', { type: 'button', class: 'secondary', 'data-action': 'delete-trip' }, tr('deleteTrip')),
    ),
  );
}

function renderHistory() {
  rememberPrices(trips); // every change to the history comes through here
  $('history-empty').hidden = trips.length > 0;
  $('export-history').hidden = trips.length === 0;
  // Nothing to export yet: the hint is about bringing a history over instead.
  $('backup-hint').dataset.i18n = trips.length ? 'backupHint' : 'backupHintEmpty';
  $('backup-hint').textContent = tr($('backup-hint').dataset.i18n);
  const locale = LOCALES[state.lang];
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const whenFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const open = new Set([...document.querySelectorAll('.trip[open]')].map((d) => d.dataset.trip));
  $('history').replaceChildren(
    ...monthlyGroups(trips).map((group) =>
      h(
        'section',
        { class: 'month' },
        h(
          'h2',
          { class: 'month-head' },
          h('span', { text: monthFormat.format(new Date(group.year, group.month, 1)) }),
          h('span', { class: 'month-total', text: formatMoney(group.totalCents, state.lang) }),
        ),
        ...group.trips.map((trip) => {
          const view = tripView(trip, whenFormat);
          view.open = open.has(trip.id); // keep expanded trips expanded across re-renders
          return view;
        }),
      ),
    ),
  );
}

/* ---------- backup ---------- */

let beforeImport = null; // history as it was before the latest import, for its Undo

/** The share sheet where it takes the file (iOS: Save to Files); a download elsewhere (Android won't share .json). */
async function exportTrips() {
  const now = Date.now();
  const file = new File([backupJson(trips, now)], backupFileName(now), { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      // any other failure: fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: file.name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking at once can cancel the download
}

$('export-history').addEventListener('click', exportTrips);
$('import-history').addEventListener('click', () => $('import-input').click());

$('import-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // so picking the same file again still fires change
  if (!file) return;
  const backup = readBackup(await file.text().catch(() => ''));
  if (backup.error) return showToast(backup.error);
  const { trips: merged, added } = mergeTrips(trips, backup.trips);
  if (!added) return showToast('importNothing');
  const previous = trips;
  if (!setTrips(merged)) {
    trips = previous; // not stored: don't pretend
    renderHistory();
    return showToast('importNotSaved');
  }
  beforeImport = previous;
  showToast('importedTrips', { action: 'undoImport' });
});

function undoImport() {
  if (!beforeImport) return;
  setTrips(beforeImport);
  beforeImport = null;
}

export { renderHistory, undoFinish, undoDeleteTrip, undoImport };
