// The app's frame: the bottom tabs, sheets, the light/dark theme (with the browser chrome coloured to match), and
// whether the on-screen keyboard is up.

import { keyboardOpen, tallestHeight } from '../keyboard.js';
import { rovingIndex } from '../tabs.js';
import { effectiveTheme, toggledTheme } from '../theme.js';
import { persist, state } from './app-state.js';
import { $, isTextField } from './dom.js';
import { tr } from './text.js';

function renderTab() {
  for (const b of document.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === state.tab;
    b.setAttribute('aria-selected', on);
    b.tabIndex = on ? 0 : -1; // only the selected tab is in the Tab order; arrows move between them
    $(`panel-${b.dataset.tab}`).hidden = !on;
  }
}

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    persist({ ...state, tab: b.dataset.tab });
    renderTab();
  });
}

// Arrow keys select the tab they land on, the same as tapping it.
document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const next = rovingIndex(tabs.indexOf(e.target.closest('[data-tab]')), e.key, tabs.length);
  if (next === null) return;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
});

/* ---------- sheets ---------- */

const outside = (el, e) => {
  const r = el.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

// A tap on the dimmed backdrop closes a sheet, the same as Cancel. Taps on the backdrop and on the sheet's own padding
// both land on the <dialog>, so only its box tells them apart; and the press must start outside too, so a drag out
// of a field never closes it.
for (const sheet of document.querySelectorAll('dialog.sheet')) {
  let pressedOutside = false;
  sheet.addEventListener('pointerdown', (e) => {
    pressedOutside = e.target === sheet && outside(sheet, e);
  });
  sheet.addEventListener('click', (e) => {
    if (pressedOutside && e.target === sheet && outside(sheet, e)) sheet.close();
    pressedOutside = false;
  });
}

/* ---------- keyboard ---------- */

// While the keyboard is up, <html data-keyboard="open"> lets the total tag shrink to one row (see styles.css), so the
// list keeps the room the keyboard leaves. Width is the layout's, so pinch-zooming doesn't count as turning.
const view = window.visualViewport ?? window;
let seen = null;

function renderKeyboard() {
  const height = view.height ?? innerHeight;
  seen = tallestHeight(seen, { width: innerWidth, height });
  const open = keyboardOpen({ editing: isTextField(document.activeElement), height, tallest: seen.height });
  if (open) document.documentElement.dataset.keyboard = 'open';
  else delete document.documentElement.dataset.keyboard;
}

view.addEventListener('resize', renderKeyboard);
document.addEventListener('focusin', renderKeyboard);
document.addEventListener('focusout', renderKeyboard);
renderKeyboard(); // the height before any keyboard: the one to compare with

/* ---------- theme ---------- */

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m, m.content]);

function renderTheme() {
  const root = document.documentElement;
  if (state.theme) root.dataset.theme = state.theme;
  else delete root.dataset.theme;

  const shown = effectiveTheme(state.theme, systemDark.matches);
  $('theme').dataset.showing = shown;
  $('theme').setAttribute('aria-label', tr(shown === 'dark' ? 'themeToLight' : 'themeToDark'));

  // A forced theme must also recolour the browser chrome, whatever the system says.
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  for (const [meta, systemColor] of themeMetas) meta.content = state.theme ? paper : systemColor;
}

$('theme').addEventListener('click', () => {
  persist({ ...state, theme: toggledTheme(state.theme, systemDark.matches) });
  renderTheme();
});

systemDark.addEventListener('change', renderTheme);

export { renderTab, renderTheme };
