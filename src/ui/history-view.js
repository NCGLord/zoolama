// Finished trips: the Finalizar sheet (and its celebration), the History tab, and sharing or deleting a past trip.

import { backupFileName, backupJson, mergeTrips, readBackupFile } from '../backup.js';
import { counts, lineTotal, total } from '../cart.js';
import { celebrates } from '../delight.js';
import { averageTripCents, monthlyGroups, monthlySeries, storeNames, storeStats, tripFromCart } from '../history.js';
import { LOCALES } from '../i18n.js';
import { formatMoney } from '../money.js';
import { shareText } from '../share.js';
import { planNames, planReducer } from '../plan.js';
import { loadHistory, saveHistory } from '../store.js';
import { persist, state, storage } from './app-state.js';
import { dispatchCart } from './cart-store.js';
import { $, h, keepingFocus, reducedMotion } from './dom.js';
import { setPlan } from './plan-view.js';
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
  // What this trip bought comes off the shopping list; the rest waits for the next one.
  const plan = planReducer(state.plan, { type: 'dropBought', names: state.cart.items.map((i) => i.name) });
  persist({ ...state, checking: false, plan });
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
  persist({ ...state, plan: planReducer(state.plan, { type: 'undo' }) });
  dispatchCart({ type: 'undo' });
}

function tripTitle(trip) {
  const date = new Intl.DateTimeFormat(LOCALES[state.lang], { dateStyle: 'short' }).format(trip.at);
  return `Zoolama — ${trip.store || tr('tripUnnamed')}, ${date}`;
}

$('history').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'buy-again') {
    const trip = trips.find((t) => t.id === e.target.closest('[data-trip]').dataset.trip);
    const plan = planReducer(state.plan, { type: 'addNames', names: planNames(trip) });
    if (plan === state.plan) return showToast('planAlready');
    setPlan(plan);
    showToast('planAdded', { action: 'undoPlan' });
  }
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

/** A trip as History lists it: its heading. What it shows once opened comes from tripBody, on its first opening. */
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
  );
}

/** An opened trip under its heading: its lines, then Buy again, Share and Delete. */
function tripBody(trip) {
  const amount = (cents) => formatMoney(cents, state.lang);
  return [
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
      h('button', { type: 'button', class: 'secondary', 'data-action': 'buy-again' }, tr('buyAgain')),
      h('button', { type: 'button', class: 'secondary', 'data-action': 'share-trip' }, tr('share')),
      h('button', { type: 'button', class: 'secondary', 'data-action': 'delete-trip' }, tr('deleteTrip')),
    ),
  ];
}

/**
 * Builds an opened trip's body, once. Building every trip's lines whenever History was drawn (at each start and each
 * change) took most of the app's start on a phone once it held a few hundred trips, for a tab that's mostly closed.
 */
function fillTrip(details) {
  if (details.querySelector('.trip-items')) return;
  const trip = trips.find((t) => t.id === details.dataset.trip);
  if (trip) details.append(...tripBody(trip));
}

// A tap on a heading builds the body before the trip opens, so it never opens empty for a frame. Any other way a trip
// opens (find in page, say) is caught when it has.
$('history').addEventListener('click', (e) => {
  const summary = e.target.closest('.trip > summary');
  if (summary) fillTrip(summary.parentElement);
});
$('history').addEventListener(
  'toggle',
  (e) => {
    if (e.target.open) fillTrip(e.target);
  },
  true, // toggle doesn't bubble
);

function renderHistory() {
  rememberPrices(trips); // every change to the history comes through here
  renderInsights();
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
          if (open.has(trip.id)) {
            view.append(...tripBody(trip)); // keep expanded trips expanded across re-renders
            view.open = true;
          }
          return view;
        }),
      ),
    ),
  );
}

/* ---------- summary: spending by month and by store ---------- */

let pickedMonth = null; // "year-month" of the bar tapped last; null means this month

/** Six months of totals as bars (tap one to read it), the average trip, and each store's trips and total. */
function renderInsights() {
  $('insights').hidden = trips.length < 2;
  if (trips.length < 2) return;
  const money = (cents) => formatMoney(cents, state.lang);
  const locale = LOCALES[state.lang];
  const short = new Intl.DateTimeFormat(locale, { month: 'short' });
  const long = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const series = monthlySeries(trips, { now: Date.now() });
  const key = (m) => `${m.year}-${m.month}`;
  const picked = series.find((m) => key(m) === pickedMonth) ?? series.at(-1);
  const max = Math.max(1, ...series.map((m) => m.totalCents));

  keepingFocus(() => {
    $('month-bars').replaceChildren(
      ...series.map((m) => {
        const date = new Date(m.year, m.month, 1);
        const fill = h('span', { class: 'month-fill' });
        fill.style.height = `${(m.totalCents / max) * 100}%`; // through the CSSOM: the CSP forbids style attributes
        return h(
          'button',
          {
            type: 'button',
            class: 'month-bar',
            'data-month': key(m),
            'data-key': `month-${key(m)}`,
            'aria-pressed': String(m === picked),
            'aria-label': `${long.format(date)}: ${money(m.totalCents)}`,
          },
          h('span', { class: 'month-track' }, fill),
          h('span', { class: 'month-label', text: short.format(date).replace('.', '') }),
        );
      }),
    );
  });
  const month = long.format(new Date(picked.year, picked.month, 1));
  $('month-value').textContent = tr('monthValue', { month, amount: money(picked.totalCents), n: picked.trips });
  $('avg-trip').textContent = tr('avgTrip', { amount: money(averageTripCents(trips)) });
  $('store-stats').replaceChildren(
    ...storeStats(trips).map((s) =>
      h(
        'li',
        {},
        h('span', { class: 'store-name', text: s.name || tr('noStore') }),
        h('span', { class: 'store-total', text: money(s.totalCents) }),
        h('span', { class: 'store-line', text: tr('storeLine', { n: s.trips, avg: money(s.avgCents) }) }),
      ),
    ),
  );
}

$('month-bars').addEventListener('click', (e) => {
  const month = e.target.closest('[data-month]')?.dataset.month;
  if (!month) return;
  pickedMonth = month;
  renderInsights();
});

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
  const backup = await readBackupFile(file);
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
