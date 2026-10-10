// Altura dupla: the reading text (what's read while shopping: item names, the list, the labels) twice as tall at the
// same width, as a thermal printer's double-height mode prints it. The header button turns it on and off, and it's kept
// like the theme. The font is fonts/zoolama-double-400.woff2 (tools/double-height.py); styles.css says which text it
// takes, under the page's data-double-height.

import { persist, state } from './app-state.js';
import { $ } from './dom.js';

function renderDoubleHeight() {
  document.documentElement.toggleAttribute('data-double-height', state.doubleHeight);
  $('double-height').setAttribute('aria-pressed', String(state.doubleHeight));
}

$('double-height').addEventListener('click', () => {
  persist({ ...state, doubleHeight: !state.doubleHeight });
  renderDoubleHeight();
});

export { renderDoubleHeight };
