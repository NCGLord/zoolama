// Trip history as a file the shopper keeps. History lives only in this phone's browser storage, which a new phone,
// "clear browsing data" or Safari's clean-up of sites not opened for a week can wipe; an exported file survives that.

import { isTrip } from './history.js';

const FORMAT = { app: 'zoolama', kind: 'history', version: 1 };

/** The export file's text: the trips, newest first, with what the file is and when it was made. */
export function backupJson(trips, now) {
  return JSON.stringify({ ...FORMAT, exportedAt: now, trips }, null, 1);
}

/** "zoolama-historico-2026-09-23.json", by the phone's local date. */
export function backupFileName(now) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `zoolama-historico-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * The trips in an export file: {trips} (the well-formed ones), or {error: 'importInvalid'} when the text isn't a
 * Zoolama history export or holds no trip the app could show.
 */
export function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'importInvalid' };
  }
  const ours = data?.app === FORMAT.app && data.kind === FORMAT.kind && data.version === FORMAT.version;
  if (!ours || !Array.isArray(data.trips)) return { error: 'importInvalid' };
  const trips = data.trips.filter(isTrip);
  return trips.length || !data.trips.length ? { trips } : { error: 'importInvalid' };
}

// Far past any history browser storage can hold (localStorage keeps 5–10 MB a site): a bigger file is something else,
// picked by mistake, and reading all of it could stall the phone.
export const MAX_BACKUP_BYTES = 50_000_000;

/** readBackup for a picked file; one bigger than MAX_BACKUP_BYTES is refused without being read. */
export async function readBackupFile(file) {
  if (file.size > MAX_BACKUP_BYTES) return { error: 'importInvalid' };
  return readBackup(await file.text().catch(() => ''));
}

/** History with the incoming trips it doesn't already have (same id), newest first; `added` counts them. */
export function mergeTrips(current, incoming) {
  const known = new Set(current.map((t) => t.id));
  const fresh = [];
  for (const trip of incoming) {
    if (known.has(trip.id)) continue;
    known.add(trip.id); // a file can list a trip twice
    fresh.push(trip);
  }
  return { trips: [...current, ...fresh].sort((a, b) => b.at - a.at), added: fresh.length };
}
