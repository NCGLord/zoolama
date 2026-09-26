// The header logo, tapped, lifts off and grows into the middle of the screen, to see the llama and its price tag up
// close; a tap anywhere, Esc or the back gesture puts it back where it came from. The large one is a copy of the header
// logo, made on opening, so tools/wordmark.py stays its one source. With reduced motion it just appears and goes.

import { flipFrom } from '../delight.js';
import { $, reducedMotion } from './dom.js';

const dialog = $('logo-view');
const small = document.querySelector('.brand .wordmark');
const MOVE = { duration: 400, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

let big = null;
let closing = false;

/** The large logo's transform when it sits exactly over the header one. */
const overHeader = () => {
  const { x, y, scale } = flipFrom(small.getBoundingClientRect(), big.getBoundingClientRect());
  return `translate(${x}px, ${y}px) scale(${scale})`;
};

$('brand-btn').addEventListener('click', () => {
  big = small.cloneNode(true);
  dialog.replaceChildren(big);
  dialog.showModal();
  small.style.visibility = 'hidden'; // it has lifted off; through the CSSOM, since the CSP forbids style attributes
  if (reducedMotion.matches) return;
  big.animate({ transform: [overHeader(), 'none'] }, MOVE);
  dialog.animate({ backgroundColor: ['transparent', getComputedStyle(dialog).backgroundColor] }, MOVE);
});

function putBack() {
  if (closing || !dialog.open) return;
  if (reducedMotion.matches) {
    dialog.close();
    return;
  }
  closing = true;
  const shrink = big.animate({ transform: ['none', overHeader()] }, { ...MOVE, fill: 'forwards' });
  dialog.animate({ backgroundColor: [getComputedStyle(dialog).backgroundColor, 'transparent'] }, { ...MOVE, fill: 'forwards' });
  shrink.finished.catch(() => {}).then(() => dialog.close());
}

dialog.addEventListener('click', putBack);

// Esc and the back gesture shrink it back too. Where the browser won't let the dialog stay open for that (no recent
// tap), it closes at once, and the close handler still puts the header logo back.
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  putBack();
});

dialog.addEventListener('close', () => {
  small.style.removeProperty('visibility');
  dialog.replaceChildren();
  big = null;
  closing = false;
});
