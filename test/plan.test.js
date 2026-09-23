import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPlan, restorePlan, planReducer, planNames, planView } from '../src/plan.js';

const run = (...actions) => actions.reduce(planReducer, initialPlan());
const names = (plan) => plan.items.map((i) => i.name);
const cart = (...items) => ({ items: items.map((name, i) => ({ id: i + 1, name, priceCents: 100, qty: 1 })) });

test('addNames appends names not on the list yet, once each, however they are spelled', () => {
  const s = run(
    { type: 'addNames', names: ['Leite', ' Café ', 'leite', '', 'Pão'] },
    { type: 'addNames', names: ['CAFE', 'Arroz'] },
  );
  assert.deepEqual(names(s), ['Leite', 'Café', 'Pão', 'Arroz']);
  assert.deepEqual(s.items.map((i) => i.id), [1, 2, 3, 4]);
  assert.equal(s.nextId, 5);
});

test('addNames with nothing new returns the same list, so the app can say so', () => {
  const s = run({ type: 'addNames', names: ['Leite'] });
  assert.equal(planReducer(s, { type: 'addNames', names: ['leite', ''] }), s);
});

test('addNames and clear can be undone', () => {
  const s = run({ type: 'addNames', names: ['Leite'] }, { type: 'addNames', names: ['Café'] });
  assert.deepEqual(names(planReducer(s, { type: 'undo' })), ['Leite']);
  const cleared = planReducer(s, { type: 'clear' });
  assert.deepEqual(names(cleared), []);
  assert.deepEqual(names(planReducer(cleared, { type: 'undo' })), ['Leite', 'Café']);
  assert.equal(planReducer(initialPlan(), { type: 'clear' }).items.length, 0);
});

test('dropBought takes off what the finished trip bought and keeps the rest, with Undo', () => {
  const s = run({ type: 'addNames', names: ['Leite', 'Café', 'Pão'] });
  const after = planReducer(s, { type: 'dropBought', names: ['café', 'Arroz'] });
  assert.deepEqual(names(after), ['Leite', 'Pão']);
  assert.deepEqual(names(planReducer(after, { type: 'undo' })), ['Leite', 'Café', 'Pão']);
});

test('dropBought with nothing bought clears the undo, so undoing a trip never revives an older list', () => {
  const s = run({ type: 'addNames', names: ['Leite'] }, { type: 'addNames', names: ['Café'] });
  const after = planReducer(s, { type: 'dropBought', names: ['Arroz'] });
  assert.equal(after.undo, null);
  assert.equal(planReducer(after, { type: 'undo' }), after);
});

test('the reducer never changes the list it is given', () => {
  const s = run({ type: 'addNames', names: ['Leite', 'Café'] });
  const snapshot = structuredClone(s);
  planReducer(s, { type: 'addNames', names: ['Pão'] });
  planReducer(s, { type: 'dropBought', names: ['Leite'] });
  planReducer(s, { type: 'clear' });
  assert.deepEqual(s, snapshot);
});

test('planNames lists a trip\'s names once each, in order, without unnamed lines', () => {
  const trip = { items: [{ name: 'Leite ' }, { name: '' }, { name: 'Café' }, { name: 'leite' }] };
  assert.deepEqual(planNames(trip), ['Leite', 'Café']);
});

test('planView marks what the cart already holds and puts what is left to buy first', () => {
  const s = run({ type: 'addNames', names: ['Leite', 'Café', 'Pão'] });
  assert.deepEqual(
    planView(s, cart('cafe', 'Arroz')).map((r) => [r.name, r.bought]),
    [
      ['Leite', false],
      ['Pão', false],
      ['Café', true],
    ],
  );
});

test('a saved list comes back; anything that does not hold up starts an empty one', () => {
  const s = run({ type: 'addNames', names: ['Leite'] }, { type: 'addNames', names: ['Café'] });
  assert.deepEqual(restorePlan(structuredClone(s)), s);
  const broken = [undefined, null, 'x', { items: 'x' }, { items: [{ id: 1, name: '' }] }];
  broken.push({ items: [{ id: 0, name: 'a' }] });
  for (const saved of broken) {
    assert.deepEqual(restorePlan(saved), initialPlan(), JSON.stringify(saved));
  }
  assert.equal(restorePlan({ items: [{ id: 3, name: 'Leite' }], nextId: 2 }).nextId, 4);
});
