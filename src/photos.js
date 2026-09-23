// Shelf-tag photos. Camera shots are 3–12 MB, far past localStorage, so they are shrunk to a readable
// JPEG and kept as Blobs in IndexedDB; cart items only hold the photo's id. Nothing leaves the phone.

export const MAX_EDGE = 1280;
const QUALITY = 0.8;
const DB_NAME = 'zoolama-photos';
const STORE = 'photos';

/** Size that fits within maxEdge on the long side, keeping the aspect ratio and never enlarging. */
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Stored photo ids that nothing keeps any more. */
export function orphans(storedIds, keep) {
  return storedIds.filter((id) => !keep.has(id));
}

/** Decode a camera file and re-encode it small. An <img> applies the EXIF rotation on every engine. */
export async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', QUALITY),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- IndexedDB ---------- */

let dbPromise;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Run `work` in one transaction; resolves with the result of the request it returns, once committed. */
async function transact(mode, work) {
  const tx = (await db()).transaction(STORE, mode);
  const req = work(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const newPhotoId = () => crypto.randomUUID();

export async function savePhoto(id, blob) {
  const record = { id, blob, takenAt: Date.now() };
  await transact('readwrite', (store) => store.put(record));
  return record;
}

/** { id, blob, takenAt } or null. */
export async function getPhoto(id) {
  return (await transact('readonly', (store) => store.get(id))) ?? null;
}

export function photoIds() {
  return transact('readonly', (store) => store.getAllKeys());
}

export async function deletePhotos(ids) {
  if (ids.length) await transact('readwrite', (store) => ids.forEach((id) => store.delete(id)));
}
