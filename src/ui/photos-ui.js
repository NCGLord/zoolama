// Shelf-tag photos on screen: taking one for the entry form or for a cart line, and the full-size viewer.

import { chargedDiff } from '../cart.js';
import { LOCALES } from '../i18n.js';
import { formatMoney } from '../money.js';
import { getPhoto, newPhotoId, savePhoto, shrinkPhoto } from '../photos.js';
import { state } from './app-state.js';
import { dispatchCart } from './cart-store.js';
import { $, h } from './dom.js';
import { collectPhotos, pendingPhotos, photoUrl } from './photo-cache.js';
import { signedMoney, tagPrice, tr } from './text.js';
import { showToast } from './toast.js';

let entryPhotoId = null;
let photoTarget = null; // 'entry', or the id of the cart item being photographed
let viewing = null; // id of the item open in the viewer

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

/** The entry's photo went into the cart with its item: the cart keeps it now, and the next item starts without one. */
function entryPhotoAdded() {
  pendingPhotos.delete(entryPhotoId);
  entryPhotoId = null;
  renderEntryPhoto();
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
  // A weighed item's shelf tag shows R$/kg, so the viewer does too.
  tagPrice($('viewer-price'), item.perKgCents ?? item.priceCents);
  if (item.perKgCents) {
    $('viewer-price').append(h('span', { class: 'per', text: '/kg' }));
    $('viewer-price').setAttribute('aria-label', `${formatMoney(item.perKgCents, state.lang)}/kg`);
  }
  const diff = chargedDiff(item);
  $('viewer-charged').hidden = diff === 0;
  $('viewer-charged').className = `viewer-charged ${diff > 0 ? 'dear' : 'good'}`;
  $('viewer-charged').textContent = diff
    ? `${tr('chargedLine', { amount: formatMoney(item.chargedCents, state.lang) })} (${signedMoney(diff)})`
    : '';
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

export { entryPhotoId, entryPhotoAdded, takePhoto, openViewer };
