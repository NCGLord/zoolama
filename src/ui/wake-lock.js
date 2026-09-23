// Keeps the screen on while checking at the till: the cashier takes a while, and a dimmed screen means unlocking the
// phone mid-check. Browsers drop the lock whenever the page is hidden, so it is asked for again when the app returns.
// Where there is no Wake Lock API, or the browser refuses (e.g. battery saver), the screen just dims as usual.

let lock = null;
let wanted = false;
let requesting = false; // one request at a time, so two quick calls can't leave a second lock held

async function acquire() {
  if (lock || requesting || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  requesting = true;
  try {
    const held = await navigator.wakeLock.request('screen');
    if (!wanted) {
      held.release().catch(() => {}); // checkout ended while the request was pending
      return;
    }
    lock = held;
    held.addEventListener('release', () => {
      if (lock === held) lock = null;
    });
  } catch {
    // refused: nothing to do
  } finally {
    requesting = false;
  }
}

/** On while `on` is true; safe to call on every render. */
function keepScreenOn(on) {
  wanted = on;
  if (on) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (wanted) acquire();
});

export { keepScreenOn };
