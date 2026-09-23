// The shopping list at the top of the cart, filled by "Comprar de novo" in History: what's left to buy, then what's
// already in the cart. Tapping an item still to buy starts entering it. It steps aside in checkout mode.

import { planReducer, planView } from '../plan.js';
import { persist, state } from './app-state.js';
import { $, h } from './dom.js';
import { enterName } from './entry.js';
import { tr } from './text.js';
import { dropStaleUndo, showToast } from './toast.js';

function renderPlan() {
  const rows = planView(state.plan, state.cart);
  $('plan').hidden = rows.length === 0 || state.checking;
  const bought = rows.filter((r) => r.bought).length;
  $('plan-progress').textContent = tr('planProgress', { done: bought, total: rows.length });
  $('plan-items').replaceChildren(
    ...rows.map(({ id, name, bought }) =>
      h(
        'li',
        {},
        bought
          ? h('span', { class: 'plan-chip bought', 'aria-label': tr('planInCart', { name }) }, name)
          : h('button', { type: 'button', class: 'plan-chip', 'data-name': name, 'data-key': `plan-${id}` }, name),
      ),
    ),
  );
}

function setPlan(plan) {
  persist({ ...state, plan });
  dropStaleUndo();
  renderPlan();
}

function undoPlan() {
  setPlan(planReducer(state.plan, { type: 'undo' }));
}

$('plan-items').addEventListener('click', (e) => {
  const name = e.target.closest('[data-name]')?.dataset.name;
  if (name) enterName(name);
});

$('clear-plan').addEventListener('click', () => {
  setPlan(planReducer(state.plan, { type: 'clear' }));
  showToast('planCleared', { action: 'undoPlan' });
});

export { renderPlan, setPlan, undoPlan };
