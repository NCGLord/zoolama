// The one toast at the bottom of the screen: a short message, maybe with one action (Undo, Update).

import { state } from './app-state.js';
import { $ } from './dom.js';
import { tr } from './text.js';

const TOAST_MS = 5000;

let toastTimer;
let toastAction = null;
let updatePending = false;

// The toast's one button: what it runs, and the i18n key of its label. The actions reach into the views that show
// toasts, so boot defines them.
let toastActions = {};

function defineToastActions(actions) {
  toastActions = actions;
}

function showToast(key, { action = null, persist = false } = {}) {
  $('toast-text').dataset.i18n = key;
  $('toast-text').textContent = tr(key);
  toastAction = action;
  const button = $('toast-action');
  button.hidden = !action;
  if (action) {
    button.dataset.i18n = toastActions[action].label;
    button.textContent = tr(button.dataset.i18n);
  }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  $('toast').hidden = true;
  // A waiting update outlives short-lived toasts like Undo: bring its prompt back afterwards.
  if (updatePending) showToast('updateReady', { action: 'update', persist: true });
}

/** A new version has taken over: offer the reload, and keep offering it after shorter-lived toasts. */
function offerUpdate() {
  updatePending = true;
  showToast('updateReady', { action: 'update', persist: true });
}

/** An Undo that can no longer undo anything must not stay on screen. */
function dropStaleUndo() {
  if (!$('toast').hidden && toastActions[toastAction]?.cartUndo && !state.cart.undo) hideToast();
}

$('toast-action').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  toastActions[action]?.run();
});

export { showToast, hideToast, offerUpdate, dropStaleUndo, defineToastActions };
