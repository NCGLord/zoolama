// Browsers only look for a new service worker when a page loads, and an installed app is usually
// resumed from the background rather than reloaded, so the app asks again when it comes to the front.

export const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function dueForUpdateCheck(now, lastCheck, interval = UPDATE_CHECK_MS) {
  return now - lastCheck >= interval;
}
