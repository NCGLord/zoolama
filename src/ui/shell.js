// The app's frame: the bottom tabs, and the light/dark theme (with the browser chrome coloured to match).

import { rovingIndex } from '../tabs.js';
import { effectiveTheme, toggledTheme } from '../theme.js';
import { persist, state } from './app-state.js';
import { $ } from './dom.js';
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
