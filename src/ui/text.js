// Words and amounts on screen, in the chosen language: translation, price tags and the formats the views share.

import { LOCALES, t } from '../i18n.js';
import { formatMoney, formatMoneyParts } from '../money.js';
import { lineEach } from '../share.js';
import { state } from './app-state.js';
import { $, h } from './dom.js';

const tr = (key, params) => t(key, state.lang, params);

function tagPrice(el, cents) {
  const p = formatMoneyParts(cents, state.lang);
  el.replaceChildren(
    h('span', { class: 'cur', text: p.currency }),
    h('span', { class: 'whole', text: p.whole }),
    h('span', { class: 'cents', text: p.decimal + p.fraction }),
  );
  el.setAttribute('aria-label', formatMoney(cents, state.lang));
}

function applyLang() {
  document.documentElement.lang = LOCALES[state.lang];
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = tr(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', tr(el.dataset.i18nAriaLabel));
  }
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', b.dataset.lang === state.lang);
  $('price').placeholder = pricePlaceholder();
}

const pricePlaceholder = () => formatMoney(0, state.lang).replace(/^\D+/, '');
const unitLabel = (unit) => (unit === 'un' ? tr('unitCount') : unit);

const signedMoney = (cents) => `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), state.lang)}`;

const eachText = (item) => lineEach(item, state.lang);

export { tr, tagPrice, applyLang, pricePlaceholder, unitLabel, signedMoney, eachText };
