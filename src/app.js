// DOM wiring only: events → reducers → save → render. Business rules live in the other modules.

import { parseMoney, formatMoney, formatMoneyParts } from './money.js';
import { initialCart, cartReducer, total, counts, referencedPhotos } from './cart.js';
import { compare } from './compare.js';
import { UNITS, BASE_UNIT } from './units.js';
import { t, detectLang, formatPct, LOCALES } from './i18n.js';
import { load, save } from './store.js';
import { effectiveTheme, toggledTheme } from './theme.js';
import { installMode, isIOS } from './install.js';
import { dueForUpdateCheck } from './update.js';
import { shrinkPhoto, newPhotoId, savePhoto, getPhoto, photoIds, deletePhotos, orphans } from './photos.js';

const $ = (id) => document.getElementById(id);
const TOAST_MS = 5000;
const MAX_QTY = 999;

// Reading window.localStorage itself throws when storage is blocked; store.js copes with null.
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const blankOption = (unit = 'g') => ({ label: '', price: '', qty: '', unit });
const initialCompare = () => ({ options: [blankOption(), blankOption()] });

const saved = load(storage);
let state = {
  cart: saved?.cart ?? initialCart(),
  compare: saved?.compare ?? initialCompare(),
  lang: saved?.lang ?? detectLang(navigator.language),
  tab: saved?.tab ?? 'cart',
  theme: saved?.theme ?? null,
};

const tr = (key, params) => t(key, state.lang, params);

function persist(next) {
  state = next;
  save(storage, state);
}

function dispatchCart(action) {
  persist({ ...state, cart: cartReducer(state.cart, action) });
  renderCart();
  collectPhotos();
}

/* ---------- rendering helpers ---------- */

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children);
  return el;
}

function tagPrice(el, cents) {
  const p = formatMoneyParts(cents, state.lang);
  el.replaceChildren(
    h('span', { class: 'cur', text: p.currency }),
    h('span', { class: 'whole', text: p.whole }),
    h('span', { class: 'cents', text: p.decimal + p.fraction }),
  );
  el.setAttribute('aria-label', formatMoney(cents, state.lang));
}

/** Re-rendering replaces buttons; put focus back on the element with the same data-key. */
function keepingFocus(render) {
  const key = document.activeElement?.dataset?.key;
  render();
  if (key) document.querySelector(`[data-key="${key}"]`)?.focus();
}

function applyLang() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'pt-BR';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = tr(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', tr(el.dataset.i18nAriaLabel));
  }
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', b.dataset.lang === state.lang);
  $('price').placeholder = pricePlaceholder();
}

const pricePlaceholder = () => formatMoney(0, state.lang).replace(/^\D+/, '');
const unitLabel = (unit) => (unit === 'un' ? tr('unitCount') : unit);

/* ---------- cart ---------- */

function lineView(item, n) {
  const id = item.id;
  return h(
    'li',
    { class: 'line', 'data-id': id },
    item.photoId
      ? h(
          'button',
          { type: 'button', class: 'line-photo', 'data-action': 'view-photo', 'aria-label': tr('photoOf') },
          h('img', { alt: '', 'data-photo': item.photoId }),
        )
      : h(
          'button',
          { type: 'button', class: 'line-photo empty', 'data-action': 'take-photo', 'aria-label': tr('takePhoto') },
          $('camera-icon').content.firstElementChild.cloneNode(true),
        ),
    h('input', {
      class: 'line-name',
      value: item.name,
      placeholder: tr('itemN', { n }),
      'aria-label': tr('name'),
      enterkeyhint: 'done',
      'data-action': 'rename',
    }),
    h('span', { class: 'line-sub', text: formatMoney(item.priceCents * item.qty, state.lang) }),
    h('span', { class: 'line-each', text: `${formatMoney(item.priceCents, state.lang)} × ${item.qty}` }),
    h(
      'div',
      { class: 'line-ctl' },
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', 'data-action': 'dec', 'data-key': `dec-${id}`, 'aria-label': tr('oneLess') }, '−'),
        h('span', { text: item.qty }),
        h('button', { type: 'button', 'data-action': 'inc', 'data-key': `inc-${id}`, 'aria-label': tr('oneMore') }, '+'),
      ),
      h('button', { type: 'button', class: 'remove', 'data-action': 'remove', 'aria-label': tr('remove') }, '✕'),
    ),
  );
}

function renderCart() {
  const { cart } = state;
  keepingFocus(() => {
    // Newest first, so the line just added sits right under the entry form.
    $('lines').replaceChildren(...cart.items.map((item, i) => lineView(item, i + 1)).reverse());
  });
  hydratePhotos($('lines'));
  $('empty').hidden = cart.items.length > 0;
  tagPrice($('total'), total(cart));
  const { units } = counts(cart);
  $('count').textContent = tr('itemsCount', { n: units });
  $('clear').disabled = cart.items.length === 0;
  renderBadge(units);
}

let badgeUnits = null;

/** Item count on the Cart tab; bumps when it grows, so Add to cart from Compare is visible. */
function renderBadge(units) {
  const badge = $('cart-badge');
  badge.hidden = units === 0;
  badge.textContent = units > 99 ? '99+' : units;
  if (badgeUnits !== null && units > badgeUnits) {
    badge.classList.remove('bump');
    void badge.offsetWidth; // restart the animation
    badge.classList.add('bump');
  }
  badgeUnits = units;
  // The icon is aria-hidden, so carry the count in the tab's accessible name.
  if (units) $('tab-cart').setAttribute('aria-label', `${tr('tabCart')}, ${tr('itemsCount', { n: units })}`);
  else $('tab-cart').removeAttribute('aria-label');
}

function readQty() {
  const n = Number.parseInt($('qty').value, 10);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_QTY) : 1;
}

function setPriceError(key) {
  $('price-error').textContent = key ? tr(key) : '';
  $('price').setAttribute('aria-invalid', Boolean(key));
}

$('entry').addEventListener('submit', (e) => {
  e.preventDefault();
  const priceCents = parseMoney($('price').value);
  if (priceCents === null) {
    setPriceError('invalidPrice');
    $('price').focus();
    return;
  }
  dispatchCart({ type: 'add', priceCents, qty: readQty(), name: $('name').value, photoId: entryPhotoId });
  pendingPhotos.delete(entryPhotoId); // now the cart keeps it
  entryPhotoId = null;
  renderEntryPhoto();
  $('entry').reset();
  setPriceError(null);
  $('price').focus();
});

$('price').addEventListener('input', () => setPriceError(null));

$('entry').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]')?.dataset.step;
  if (step) $('qty').value = Math.max(1, Math.min(MAX_QTY, readQty() + Number(step)));
});

$('lines').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  const id = Number(e.target.closest('[data-id]')?.dataset.id);
  const item = state.cart.items.find((i) => i.id === id);
  if (!item) return;
  if (action === 'take-photo') takePhoto(id);
  if (action === 'view-photo') openViewer(item);
  if (action === 'inc') dispatchCart({ type: 'setQty', id, qty: Math.min(MAX_QTY, item.qty + 1) });
  if (action === 'dec' && item.qty > 1) dispatchCart({ type: 'setQty', id, qty: item.qty - 1 });
  if (action === 'remove' || (action === 'dec' && item.qty === 1)) {
    dispatchCart({ type: 'remove', id });
    showToast('removed', { action: 'undo' });
  }
});

// Renaming saves without re-rendering, so the list never swaps inputs under the user's finger.
$('lines').addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'rename') return;
  const id = Number(e.target.closest('[data-id]').dataset.id);
  persist({ ...state, cart: cartReducer(state.cart, { type: 'rename', id, name: e.target.value }) });
});

$('lines').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.action === 'rename') e.target.blur();
});

$('clear').addEventListener('click', () => {
  dispatchCart({ type: 'clear' });
  showToast('cleared', { action: 'undo' });
});

/* ---------- shelf-tag photos ---------- */

// Saving now, or waiting in the entry form for Add: cleanup must never delete these.
const pendingPhotos = new Set();
const photoUrls = new Map(); // photo id → Promise of an object URL (or null)
let entryPhotoId = null;
let photoTarget = null; // 'entry', or the id of the cart item being photographed
let viewing = null; // id of the item open in the viewer

function photoUrl(id) {
  if (!photoUrls.has(id)) {
    photoUrls.set(id, getPhoto(id).then((p) => (p ? URL.createObjectURL(p.blob) : null)).catch(() => null));
  }
  return photoUrls.get(id);
}

function hydratePhotos(root) {
  for (const img of root.querySelectorAll('img[data-photo]')) {
    photoUrl(img.dataset.photo).then((url) => url && (img.src = url));
  }
}

/** Delete stored photos that no item, undo snapshot or pending shot points to. */
async function collectPhotos() {
  try {
    const stored = await photoIds();
    const keep = referencedPhotos(state.cart); // read after the await, so it sees the latest cart
    for (const id of pendingPhotos) keep.add(id);
    const dead = orphans(stored, keep);
    await deletePhotos(dead);
    for (const id of dead) {
      photoUrls.get(id)?.then((url) => url && URL.revokeObjectURL(url));
      photoUrls.delete(id);
    }
  } catch {
    // no IndexedDB (e.g. private mode): nothing to clean
  }
}

function takePhoto(target) {
  photoTarget = target;
  $('photo-input').click();
}

function renderEntryPhoto() {
  const img = $('entry-photo-img');
  img.hidden = !entryPhotoId;
  if (entryPhotoId) photoUrl(entryPhotoId).then((url) => url && (img.src = url));
  $('entry-photo').dataset.i18nAriaLabel = entryPhotoId ? 'retakePhoto' : 'takePhoto';
  $('entry-photo').setAttribute('aria-label', tr($('entry-photo').dataset.i18nAriaLabel));
}

$('entry-photo').addEventListener('click', () => takePhoto('entry'));

$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // so picking the same file again still fires change
  const target = photoTarget;
  photoTarget = null;
  if (!file || target === null) return;

  const id = newPhotoId();
  pendingPhotos.add(id);
  try {
    await savePhoto(id, await shrinkPhoto(file));
  } catch {
    pendingPhotos.delete(id);
    showToast('photoError');
    return;
  }
  if (target === 'entry') {
    if (entryPhotoId) pendingPhotos.delete(entryPhotoId); // a retake orphans the previous shot
    entryPhotoId = id; // stays pending until Add
    renderEntryPhoto();
    collectPhotos();
  } else {
    dispatchCart({ type: 'setPhoto', id: target, photoId: id });
    pendingPhotos.delete(id);
  }
});

async function openViewer(item) {
  viewing = item.id;
  const n = state.cart.items.findIndex((i) => i.id === item.id) + 1;
  const [url, photo] = await Promise.all([photoUrl(item.photoId), getPhoto(item.photoId).catch(() => null)]);
  $('viewer-img').src = url ?? '';
  $('viewer-img').alt = tr('photoOf');
  $('viewer-title').textContent = item.name || tr('itemN', { n });
  tagPrice($('viewer-price'), item.priceCents);
  const when = photo && new Intl.DateTimeFormat(LOCALES[state.lang], { dateStyle: 'short', timeStyle: 'short' }).format(photo.takenAt);
  $('viewer-when').textContent = when ? tr('photoTakenAt', { when }) : '';
  $('viewer').showModal();
}

$('viewer-retake').addEventListener('click', () => {
  $('viewer').close();
  takePhoto(viewing);
});

$('viewer-remove').addEventListener('click', () => {
  $('viewer').close();
  dispatchCart({ type: 'setPhoto', id: viewing, photoId: null });
  showToast('photoRemoved', { action: 'undo' });
});

/* ---------- compare ---------- */

function setCompare(options) {
  persist({ ...state, compare: { ...state.compare, options } });
}

function optionView(opt, i, removable) {
  return h(
    'li',
    { class: 'option', 'data-index': i },
    h(
      'div',
      { class: 'option-head' },
      h('span', { class: 'option-title', text: tr('optionN', { n: i + 1 }) }),
      removable
        ? h('button', { type: 'button', class: 'remove', 'data-action': 'remove-option', 'aria-label': tr('removeOption') }, '✕')
        : '',
    ),
    h('input', { class: 'option-label', 'data-field': 'label', value: opt.label, placeholder: tr('label'), 'aria-label': tr('label') }),
    h(
      'div',
      { class: 'option-fields' },
      h(
        'label',
        {},
        tr('price'),
        h(
          'span',
          { class: 'money-field' },
          h('span', { 'aria-hidden': 'true', text: 'R$' }),
          h('input', { 'data-field': 'price', 'data-key': `price-${i}`, inputmode: 'decimal', value: opt.price, placeholder: pricePlaceholder() }),
        ),
      ),
      h('label', {}, tr('quantity'), h('input', { class: 'qty-field', 'data-field': 'qty', inputmode: 'decimal', value: opt.qty, placeholder: '0' })),
      unitChoice(opt.unit, i),
    ),
    h('div', { class: 'option-result' }),
  );
}

/** One tap per unit: g kg · ml L · un, with a gap between families (mass, volume, count). */
function unitChoice(selected, i) {
  return h(
    'fieldset',
    { class: 'unit-choice' },
    h('legend', { class: 'visually-hidden', text: tr('unit') }),
    ...Object.entries(UNITS).map(([u, { dim }], k, all) =>
      h(
        'label',
        { class: k > 0 && all[k - 1][1].dim !== dim ? 'new-family' : null },
        h('input', { type: 'radio', name: `unit-${i}`, value: u, checked: u === selected, 'data-field': 'unit' }),
        h('span', { text: unitLabel(u) }),
      ),
    ),
  );
}

/** Rebuilds the cards; only for structural changes, never while the user is typing in one. */
function renderOptions() {
  const { options } = state.compare;
  $('options').replaceChildren(...options.map((opt, i) => optionView(opt, i, options.length > 2)));
  renderResults();
}

/** Updates only the result areas, so typing never loses focus. */
function renderResults() {
  const { options } = state.compare;
  const { error, results } = compare(options);
  document.querySelectorAll('#options .option').forEach((li, i) => {
    const r = results[i];
    li.classList.toggle('winner', Boolean(r?.isCheapest));
    const box = li.querySelector('.option-result');
    if (!r) return box.replaceChildren();

    const price = h('output', { class: 'tag-price' });
    tagPrice(price, Math.round(r.unitPrice));
    const per = BASE_UNIT[UNITS[options[i].unit].dim];
    const kids = [h('span', { class: 'unit-price' }, price, h('span', { class: 'per', text: `/${unitLabel(per)}` }))];
    if (r.isCheapest) {
      kids.push(
        h('span', { class: 'verdict', text: tr('cheapest') }),
        h('button', { type: 'button', class: 'add-winner', 'data-action': 'add-to-cart', text: tr('addToCart') }),
      );
    } else if (r.pctMore !== null) {
      kids.push(h('span', { class: 'verdict dear', text: tr('pctMore', { pct: formatPct(r.pctMore, state.lang) }) }));
    }
    box.replaceChildren(...kids);
  });

  const valid = results.filter(Boolean).length;
  $('compare-msg').textContent = error ? tr(error) : valid < 2 ? tr('compareHint') : '';
  $('compare-msg').classList.toggle('error', Boolean(error));
}

function onOptionInput(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  const i = Number(e.target.closest('[data-index]').dataset.index);
  setCompare(state.compare.options.map((o, j) => (j === i ? { ...o, [field]: e.target.value } : o)));
  renderResults();
}

// Radios fire 'change' everywhere but 'input' only in newer engines; handling both is harmless.
$('options').addEventListener('input', onOptionInput);
$('options').addEventListener('change', onOptionInput);

$('options').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  const i = Number(e.target.closest('[data-index]')?.dataset.index);
  const opt = state.compare.options[i];
  if (!opt) return;
  if (action === 'remove-option') {
    setCompare(state.compare.options.filter((_, j) => j !== i));
    renderOptions();
    $('add-option').focus();
  }
  if (action === 'add-to-cart') {
    const name = [opt.label.trim(), `${opt.qty.trim()} ${unitLabel(opt.unit)}`].filter(Boolean).join(' ');
    dispatchCart({ type: 'add', priceCents: parseMoney(opt.price), name });
    showToast('addedToCart');
  }
});

$('add-option').addEventListener('click', () => {
  const { options } = state.compare;
  setCompare([...options, blankOption(options.at(-1)?.unit)]);
  renderOptions();
  document.querySelector(`[data-key="price-${options.length}"]`)?.focus();
});

$('reset-compare').addEventListener('click', () => {
  setCompare(initialCompare().options);
  renderOptions();
});

/* ---------- tabs ---------- */

function renderTab() {
  for (const b of document.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === state.tab;
    b.setAttribute('aria-selected', on);
    $(`panel-${b.dataset.tab}`).hidden = !on;
  }
}

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    persist({ ...state, tab: b.dataset.tab });
    renderTab();
  });
}

/* ---------- theme ---------- */

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m, m.content]);

function renderTheme() {
  const root = document.documentElement;
  if (state.theme) root.dataset.theme = state.theme;
  else delete root.dataset.theme;

  const shown = effectiveTheme(state.theme, systemDark.matches);
  $('theme').dataset.showing = shown;
  $('theme').setAttribute('aria-label', tr(shown === 'dark' ? 'themeToLight' : 'themeToDark'));

  // A forced theme must also recolour the browser chrome, whatever the system says.
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  for (const [meta, systemColor] of themeMetas) meta.content = state.theme ? paper : systemColor;
}

$('theme').addEventListener('click', () => {
  persist({ ...state, theme: toggledTheme(state.theme, systemDark.matches) });
  renderTheme();
});

systemDark.addEventListener('change', renderTheme);

/* ---------- install ---------- */

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

/* ---------- toast ---------- */

let toastTimer;
let toastAction = null;
let updatePending = false;

// The toast's one button; its label is the i18n key of the same name.
const TOAST_ACTIONS = {
  undo: () => dispatchCart({ type: 'undo' }),
  update: () => location.reload(),
};

function showToast(key, { action = null, persist = false } = {}) {
  $('toast-text').dataset.i18n = key;
  $('toast-text').textContent = tr(key);
  toastAction = action;
  const button = $('toast-action');
  button.hidden = !action;
  if (action) {
    button.dataset.i18n = action;
    button.textContent = tr(action);
  }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  $('toast').hidden = true;
  // A waiting update outlives short-lived toasts like Undo: bring its prompt back afterwards.
  if (updatePending) showToast('updateReady', { action: 'update', persist: true });
}

$('toast-action').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  TOAST_ACTIONS[action]?.();
});

/* ---------- language ---------- */

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    persist({ ...state, lang: b.dataset.lang });
    applyLang();
    renderTheme();
    renderCart();
    renderOptions();
  });
}

/* ---------- boot ---------- */

applyLang();
renderTheme();
renderCart();
renderOptions();
renderTab();
renderInstall();
collectPhotos();
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator) {
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
    if (controlled) {
      updatePending = true;
      showToast('updateReady', { action: 'update', persist: true });
    }
    controlled = true; // the first claim after a fresh install is not an update
  });
}
