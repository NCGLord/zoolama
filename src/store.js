// Persistence over an injected Web Storage (localStorage in the app, a fake in tests).
// Never throws: private mode, a full quota or blocked storage must not break shopping.

import { isTrip } from './history.js';

export const KEY = 'zoolama:v1';
// Trips live apart from the cart state, which is saved on every keystroke; history only changes on a finished trip.
export const HISTORY_KEY = 'zoolama:v1:history';
const SCHEMA = 1;

/**
 * Parsed JSON under `key` if it passes `valid`, else null. An unreadable value is copied to `key:corrupt`
 * for manual recovery instead of being silently overwritten by the next save.
 */
function read(storage, key, valid) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const data = JSON.parse(raw);
    if (valid(data)) return data;
  } catch {
    // fall through to the backup below
  }
  backUp(storage, key, raw);
  return null;
}

/** Keeps a stored value we can't fully use under `key:corrupt`, so the next save doesn't destroy it. */
function backUp(storage, key, raw) {
  try {
    storage.setItem(`${key}:corrupt`, raw ?? storage.getItem(key));
  } catch {
    // nothing more we can do
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Returns the saved state, or null when there is none or it cannot be trusted. */
export function load(storage) {
  return read(storage, KEY, (data) => data?.schema === SCHEMA);
}

/** Returns whether the state was written. */
export function save(storage, state) {
  return write(storage, KEY, { schema: SCHEMA, ...state });
}

/**
 * Finished trips, newest first; [] when there are none or they cannot be read. A trip without the shape the app
 * saves is left out, so it can't break History, and the stored list is backed up before anything overwrites it.
 */
export function loadHistory(storage) {
  const trips = read(storage, HISTORY_KEY, Array.isArray) ?? [];
  const valid = trips.filter(isTrip);
  if (valid.length < trips.length) backUp(storage, HISTORY_KEY);
  return valid;
}

/** Returns whether the history was written. */
export function saveHistory(storage, trips) {
  return write(storage, HISTORY_KEY, trips);
}
