// Browsers only look for a new service worker when a page loads, and an installed app is usually
// resumed from the background rather than reloaded, so the app asks again whenever it comes to the front, and every
// UPDATE_CHECK_MS while it stays there: a shopping trip can keep it open for an hour.

export const UPDATE_CHECK_MS = 7 * 60 * 1000;
export const UPDATE_POLL_MS = 60 * 1000; // how often an open app looks whether a check is due

export function dueForUpdateCheck(now, lastCheck, interval = UPDATE_CHECK_MS) {
  return now - lastCheck >= interval;
}

/**
 * Whether a new version that has taken over goes on screen now, by reloading, instead of waiting for Atualizar: when
 * the shopper asked for it (Procurar atualização found it), before the first touch since the app came to the front (to
 * the shopper it's still opening), or once the app is out of sight; never while `busy`, with a sheet open or something
 * half-entered, which a reload would lose.
 */
export function reloadsForUpdate({ asked = false, touched, visible, busy }) {
  return !busy && (asked || !touched || !visible);
}
