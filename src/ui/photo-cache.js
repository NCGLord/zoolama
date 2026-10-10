// Shelf-tag photos as the screen sees them: object URLs made once per photo, and cleanup of photos nothing uses.

import { referencedPhotos } from '../cart.js';
import { collectable, deletePhotos, getPhoto, orphans, photoIds, takenTimes } from '../photos.js';
import { state } from './app-state.js';

// Saving now, or waiting in the entry form for Add: cleanup must never delete these.
const pendingPhotos = new Set();
// Every photo this copy has seen in use: once unused, they go at once. One it never saw may be another open copy's
// shot, waiting in that copy's entry form for Add, so it goes only once it's old (see collectable).
const seenPhotos = new Set();
const photoUrls = new Map(); // photo id → Promise of an object URL (or null)

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
    const takenAt = await takenTimes(stored.filter((id) => !seenPhotos.has(id)));
    const keep = referencedPhotos(state.cart); // read after the awaits, so it sees the latest cart
    for (const id of pendingPhotos) keep.add(id);
    for (const id of keep) seenPhotos.add(id);
    const dead = collectable(orphans(stored, keep), { seen: seenPhotos, takenAt, now: Date.now() });
    await deletePhotos(dead);
    for (const id of dead) {
      seenPhotos.delete(id);
      photoUrls.get(id)?.then((url) => url && URL.revokeObjectURL(url));
      photoUrls.delete(id);
    }
  } catch {
    // no IndexedDB (e.g. private mode): nothing to clean
  }
}

export { pendingPhotos, photoUrl, hydratePhotos, collectPhotos };
