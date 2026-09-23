// Sharing a list as text: the phone's share sheet, or the clipboard where there is none. The cart's Share button.

import { shareText } from '../share.js';
import { state } from './app-state.js';
import { $ } from './dom.js';
import { tr } from './text.js';
import { showToast } from './toast.js';

/** The phone's share sheet where there is one; otherwise copy the list. Closing the sheet is not an error. */
async function shareList(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      // any other failure: fall back to copying
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('copied');
  } catch {
    showToast('shareFailed');
  }
}

$('share-cart').addEventListener('click', () =>
  shareList(shareText(state.cart.items, { lang: state.lang, title: tr('shareCartTitle') })),
);

export { shareList };
