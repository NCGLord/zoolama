// What the app keeps on this phone, as About shows it: the space in use, split into the app's own files, the shelf-tag
// photos and the lists and history, and the space still left, from what the browser reports.

const OWN = 'zoolama:'; // every entry the app saves starts so

/**
 * The size of the app's own entries in a Web Storage (`localStorage`), two bytes a character as the browser keeps them.
 * Only the app's: its address, github.io, is shared by every site of its author. 0 when storage can't be read.
 */
export function savedBytes(storage) {
  try {
    let chars = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key.startsWith(OWN)) chars += key.length + (storage.getItem(key)?.length ?? 0);
    }
    return 2 * chars;
  } catch {
    return 0;
  }
}

/**
 * The space in use from `estimate` (navigator.storage.estimate()) and `saved` (savedBytes), which the estimate leaves
 * out: `total`; its `parts` where the browser splits it (Chromium), the photos being IndexedDB and everything else the
 * app's files, so they add up; and the space `free` under the browser's quota. Null where the browser says nothing.
 */
export function storageUsage(estimate, saved) {
  if (typeof estimate?.usage !== 'number') return null;
  const { usage, quota, usageDetails } = estimate;
  const photos = usageDetails?.indexedDB ?? 0;
  return {
    total: usage + saved,
    parts: usageDetails ? { app: usage - photos, photos, lists: saved } : null,
    free: typeof quota === 'number' ? Math.max(0, quota - usage) : null, // the lists have a limit of their own, apart
  };
}
