// Persistence over an injected Web Storage (localStorage in the app, a fake in tests).
// Never throws: private mode, a full quota or blocked storage must not break shopping.

export const KEY = 'zoolama:v1';
const SCHEMA = 1;

/** Returns the saved state, or null when there is none or it cannot be trusted. */
export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const data = JSON.parse(raw);
    if (data?.schema === SCHEMA) return data;
  } catch {
    // fall through to the backup below
  }
  // Keep the unreadable copy for manual recovery instead of silently overwriting it.
  try {
    storage.setItem(`${KEY}:corrupt`, raw);
  } catch {
    // nothing more we can do
  }
  return null;
}

/** Returns whether the state was written. */
export function save(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify({ schema: SCHEMA, ...state }));
    return true;
  } catch {
    return false;
  }
}
