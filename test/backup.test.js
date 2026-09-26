import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupJson, backupFileName, readBackup, mergeTrips } from '../src/backup.js';

const trip = (id, at, extra = {}) => ({
  id,
  at,
  store: 'Assaí',
  items: [{ name: 'Leite', priceCents: 450, qty: 2 }],
  totalCents: 900,
  units: 2,
  ...extra,
});
const trips = [trip('b', 2000, { overchargeCents: 50 }), trip('a', 1000)];

test('an export reads back as the same trips', () => {
  assert.deepEqual(readBackup(backupJson(trips, 3000)), { trips });
});

test('an export says what it is and when it was made', () => {
  const data = JSON.parse(backupJson(trips, 3000));
  assert.equal(data.app, 'zoolama');
  assert.equal(data.kind, 'history');
  assert.equal(data.version, 1);
  assert.equal(data.exportedAt, 3000);
});

test('an empty history exports and imports as no trips', () => {
  assert.deepEqual(readBackup(backupJson([], 0)), { trips: [] });
});

test('the file is named after the local date', () => {
  assert.equal(backupFileName(new Date(2026, 8, 3, 23, 59).getTime()), 'zoolama-historico-2026-09-03.json');
});

test('anything that is not a Zoolama history export is refused', () => {
  const refused = [
    'not json',
    '[]',
    'null',
    JSON.stringify({ trips }),
    JSON.stringify({ app: 'zoolama', kind: 'cart', version: 1, trips }),
    JSON.stringify({ app: 'zoolama', kind: 'history', version: 2, trips }),
    JSON.stringify({ app: 'zoolama', kind: 'history', version: 1, trips: 'x' }),
    JSON.stringify({ app: 'zoolama', kind: 'history', version: 1, trips: [{ id: 'x' }] }),
  ];
  for (const text of refused) assert.deepEqual(readBackup(text), { error: 'importInvalid' }, text);
});

test('malformed trips in an export are left out and the rest imported', () => {
  const text = JSON.stringify({ app: 'zoolama', kind: 'history', version: 1, trips: [trips[0], { id: 'x' }] });
  assert.deepEqual(readBackup(text), { trips: [trips[0]] });
});

// A trip whose date can't be shown would break History at every start, with no way left to delete it.
test('a trip dated beyond what a Date can hold is left out of an import', () => {
  const text = JSON.stringify({ app: 'zoolama', kind: 'history', version: 1, trips: [trips[0], trip('far', 1e300)] });
  assert.deepEqual(readBackup(text), { trips: [trips[0]] });
});

test('merging adds only trips the history lacks, newest first', () => {
  const current = [trip('c', 5000), trip('a', 1000)];
  const { trips: merged, added } = mergeTrips(current, [trip('a', 1000), trip('b', 3000), trip('b', 3000)]);
  assert.deepEqual(
    merged.map((t) => t.id),
    ['c', 'b', 'a'],
  );
  assert.equal(added, 1);
});

test('merging keeps the phone’s own copy of a trip both sides have', () => {
  const mine = trip('a', 1000, { store: 'Extra' });
  assert.equal(mergeTrips([mine], [trip('a', 1000)]).trips[0].store, 'Extra');
});

test('merging nothing new changes nothing', () => {
  assert.deepEqual(mergeTrips(trips, trips), { trips, added: 0 });
});
