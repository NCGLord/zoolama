// The About page full screen, opened by tapping the header logo: the logo lifts off the header and lands, large, at
// the top of About while the rest fades in; ✕, Esc or the back gesture send it back. There is one About content,
// #about-content: this borrows it from the Sobre tab while open and gives it back on closing, so the two can never
// drift apart. With reduced motion it just appears and goes.

import { flipFrom } from '../delight.js';
import { renderAbout } from './about-view.js';
import { $, reducedMotion } from './dom.js';

const dialog = $('about-view');
const content = $('about-content');
const home = content.parentElement;
const small = document.querySelector('.brand .wordmark');
const MOVE = { duration: 400, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

let closing = false;

const big = () => content.querySelector('.about-logo .wordmark');

/** The large logo's transform when it sits exactly over the header one. */
const overHeader = () => {
  const { x, y, scale } = flipFrom(small.getBoundingClientRect(), big().getBoundingClientRect());
  return `translate(${x}px, ${y}px) scale(${scale})`;
};

/** What fades rather than flies: the ✕, and every part of the content but the logo. */
const fading = () => [$('about-close'), ...[...content.children].filter((el) => !el.contains(big()))];

$('brand-btn').addEventListener('click', () => {
  dialog.append(content);
  dialog.showModal();
  dialog.scrollTop = 0;
  renderAbout();
  small.style.visibility = 'hidden'; // it has lifted off; through the CSSOM, since the CSP forbids style attributes
  if (reducedMotion.matches) return;
  big().animate({ transform: [overHeader(), 'none'] }, MOVE);
  for (const el of fading()) el.animate({ opacity: [0, 1] }, MOVE);
  dialog.animate({ backgroundColor: ['transparent', getComputedStyle(dialog).backgroundColor] }, MOVE);
});

function putBack() {
  if (closing || !dialog.open) return;
  if (reducedMotion.matches) {
    dialog.close();
    return;
  }
  closing = true;
  const out = { ...MOVE, fill: 'forwards' };
  const shrink = big().animate({ transform: ['none', overHeader()] }, out);
  for (const el of fading()) el.animate({ opacity: [1, 0] }, out);
  dialog.animate({ backgroundColor: [getComputedStyle(dialog).backgroundColor, 'transparent'] }, out);
  shrink.finished.catch(() => {}).then(() => dialog.close());
}

$('about-close').addEventListener('click', putBack);

// Esc and the back gesture shrink it back too. Where the browser won't let the dialog stay open for that (no recent
// tap), it closes at once, and the close handler still gives everything back.
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  putBack();
});

dialog.addEventListener('close', () => {
  // The closing animations hold their last frame (fill: forwards): dropped here, or the content would go back to the
  // tab with its logo shrunk and the rest faded out.
  for (const a of dialog.getAnimations({ subtree: true })) a.cancel();
  home.append(content);
  small.style.removeProperty('visibility');
  closing = false;
});
