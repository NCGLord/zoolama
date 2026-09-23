// A cart line as it looks while shopping (editable) and at the till (tick, what the till charged).

import { chargedDiff, dealSavings, lineTotal, nextUnitFree, tierNudge } from '../cart.js';
import { priceRise } from '../history.js';
import { formatKg, formatPct } from '../i18n.js';
import { formatMoney } from '../money.js';
import { state } from './app-state.js';
import { h, icon } from './dom.js';
import { memory, version as memoryVersion } from './price-memory.js';
import { eachText, signedMoney, tr } from './text.js';

function photoCell(item) {
  return item.photoId
    ? h(
        'button',
        { type: 'button', class: 'line-photo', 'data-action': 'view-photo', 'aria-label': tr('photoOf') },
        h('img', { alt: '', 'data-photo': item.photoId }),
      )
    : h(
        'button',
        { type: 'button', class: 'line-photo empty', 'data-action': 'take-photo', 'aria-label': tr('takePhoto') },
        icon('camera-icon'),
      );
}

const lineView = (item, n) => (state.checking ? checkLineView(item, n) : editLineView(item, n));

// Which line has a field open, and which tick just snapped. The line views read these; the #lines handlers set them.
const editing = {
  weightId: null, // weighed line whose weight field is open
  chargeId: null, // line whose "charged" field is open in checkout mode
  justTicked: null, // line ticked by the latest tap: its tick snaps in once
};

function weightControl(item) {
  const id = item.id;
  if (editing.weightId === id) {
    return h('input', {
      class: 'weight-input',
      'data-action': 'weight',
      'data-key': `weight-${id}`,
      inputmode: 'decimal',
      enterkeyhint: 'done',
      value: formatKg(item.grams, state.lang).replace(' kg', ''),
      'aria-label': tr('editWeight'),
    });
  }
  return h(
    'button',
    {
      type: 'button',
      class: 'weight-btn',
      'data-action': 'edit-weight',
      'data-key': `wb-${id}`,
      'aria-label': `${tr('editWeight')}: ${formatKg(item.grams, state.lang)}`,
    },
    formatKg(item.grams, state.lang),
  );
}

/** A line's arithmetic ("R$ 4,50 × 2"); tapping it opens the line sheet to correct its price or offer. */
function priceControl(item) {
  const label = tr(item.perKgCents ? 'editPricePerKg' : 'editPrice');
  return h(
    'button',
    {
      type: 'button',
      class: 'line-each',
      'data-action': 'edit-price',
      'data-key': `each-${item.id}`,
      'aria-label': `${label}: ${eachText(item)}`,
    },
    eachText(item),
  );
}

/**
 * What one tap could get a line: below an atacado tier, taking the tier's quantity (and what that costs and saves);
 * with "leve N pague M", the unit that would come free. Tapping it takes them.
 */
function tierNudgeView(item) {
  if (nextUnitFree(item)) {
    const attrs = { type: 'button', class: 'tier-nudge', 'data-action': 'take-free', 'data-key': `free-${item.id}` };
    return h('button', attrs, tr('nextFree'));
  }
  const nudge = tierNudge(item);
  if (!nudge) return '';
  const money = (cents) => formatMoney(cents, state.lang);
  const text =
    nudge.extraCents > 0
      ? tr('tierNudge', { n: nudge.qty, each: money(item.deal.eachCents), saves: money(nudge.savesCents) })
      : tr('tierCheaper', { n: nudge.qty, total: money(nudge.totalCents) });
  const attrs = { type: 'button', class: 'tier-nudge', 'data-action': 'take-tier', 'data-key': `tier-${item.id}` };
  return h('button', attrs, text);
}

function editLineView(item, n) {
  const id = item.id;
  const rise = priceRise(item, memory);
  return h(
    'li',
    { class: 'line', 'data-id': id },
    photoCell(item),
    h('input', {
      class: 'line-name',
      value: item.name,
      placeholder: tr('itemN', { n }),
      'aria-label': tr('name'),
      enterkeyhint: 'done',
      'data-action': 'rename',
    }),
    h('span', { class: 'line-sub', text: formatMoney(lineTotal(item), state.lang) }),
    priceControl(item),
    h(
      'div',
      { class: 'line-ctl' },
      item.perKgCents
        ? weightControl(item)
        : h(
            'div',
            { class: 'stepper' },
            h('button', { type: 'button', 'data-action': 'dec', 'data-key': `dec-${id}`, 'aria-label': tr('oneLess') }, '−'),
            h('span', { text: item.qty }),
            h('button', { type: 'button', 'data-action': 'inc', 'data-key': `inc-${id}`, 'aria-label': tr('oneMore') }, '+'),
          ),
      h('button', { type: 'button', class: 'remove', 'data-action': 'remove', 'aria-label': tr('remove') }, '✕'),
    ),
    rise ? h('span', { class: 'line-rise', text: tr('priceRise', { pct: formatPct(rise.pct, state.lang) }) }) : '',
    tierNudgeView(item),
  );
}

/** A line at the till: tick, photo, name, noted total, and what the till charged when it differs. */
function checkLineView(item, n) {
  const id = item.id;
  const noted = lineTotal(item);
  const diff = chargedDiff(item);
  let detail;
  if (editing.chargeId === id) {
    detail = h('input', {
      class: 'charge-input',
      'data-action': 'charge',
      'data-key': `charge-${id}`,
      inputmode: 'decimal',
      enterkeyhint: 'done',
      value: item.chargedCents == null ? '' : formatMoney(item.chargedCents, state.lang).replace(/^\D+/, ''),
      placeholder: formatMoney(noted, state.lang).replace(/^\D+/, ''),
      'aria-label': tr('chargedAmount'),
    });
  } else if (diff !== 0) {
    detail = h(
      'span',
      { class: `line-charged ${diff > 0 ? 'dear' : 'good'}` },
      h('span', { text: tr('chargedLine', { amount: formatMoney(item.chargedCents, state.lang) }) }),
      h('span', { text: signedMoney(diff) }),
    );
  } else {
    detail = h('span', { class: 'line-each', text: eachText(item) });
  }
  // Receipts often print a "leve N pague M" discount at the end, not on its line: say so before it reads as an
  // overcharge.
  const multibuyOff = item.deal?.kind === 'multibuy' && dealSavings(item) > 0;
  const note = multibuyOff ? h('span', { class: 'line-note', text: tr('multibuyReceipt') }) : '';
  return h(
    'li',
    { class: `line check${item.checked ? ' checked' : ''}`, 'data-id': id, 'data-action': 'toggle-check' },
    h(
      'button',
      {
        type: 'button',
        class: id === editing.justTicked ? 'tick snap' : 'tick',
        'data-action': 'toggle-check',
        'data-key': `tick-${id}`,
        'aria-pressed': String(Boolean(item.checked)),
        'aria-label': tr('markChecked'),
      },
      icon('tick-icon'),
    ),
    photoCell(item),
    h('span', { class: 'line-name', text: item.name || tr('itemN', { n }) }),
    h('span', { class: 'line-sub', text: formatMoney(noted, state.lang) }),
    detail,
    h(
      'button',
      {
        type: 'button',
        class: `charge-btn${item.chargedCents == null ? '' : ' set'}`,
        'data-action': 'edit-charge',
        'data-key': `ne-${id}`,
        'aria-label': tr('chargedDifferent'),
      },
      '≠',
    ),
    note,
  );
}

// A line node remembers the look it was drawn with. Saving one line's field on blur redraws the list in the middle
// of the tap that caused the blur; lines whose look didn't change keep their node, so that tap still lands.
const looks = new WeakMap();

/** Everything a line's view depends on: the item, its number, the mode, the language, the price memory (for the
 * price-rise note) and which field is open. */
function lineLook(item, n) {
  const id = item.id;
  const open = [editing.weightId, editing.chargeId, editing.justTicked].map((x) => x === id);
  return JSON.stringify([item, n, state.checking, state.lang, memoryVersion, ...open]);
}

/** Nodes for the sorted rows: the same node where a line looks the same as in `current`, a new one where it changed. */
function lineNodes(rows, current) {
  const byLook = new Map(current.map((li) => [looks.get(li), li]));
  return rows.map(({ item, n }) => {
    const look = lineLook(item, n);
    if (byLook.has(look)) return byLook.get(look);
    const li = lineView(item, n);
    looks.set(li, look);
    return li;
  });
}

export { lineNodes, editing };
