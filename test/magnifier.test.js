import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIGITAL_MAX, exposureRange, hasTorch, pinchZoom, snapToRange, zoomRange } from '../src/magnifier.js';

const lens = { min: 1, max: 8, step: 0.1, hardware: true };

test("a camera that can zoom sets the range, in the camera's own steps", () => {
  assert.deepEqual(zoomRange({ zoom: { min: 1, max: 8, step: 0.1 } }), lens);
  assert.deepEqual(zoomRange({ zoom: { min: 1, max: 10, step: 0 } }), { min: 1, max: 10, step: 0.1, hardware: true });
});

test('without camera zoom the picture is enlarged on screen instead, up to DIGITAL_MAX', () => {
  const digital = { min: 1, max: DIGITAL_MAX, step: 0.1, hardware: false };
  assert.deepEqual(zoomRange(undefined), digital, 'no getCapabilities');
  assert.deepEqual(zoomRange({}), digital, 'no zoom capability');
  assert.deepEqual(zoomRange({ zoom: { min: 1, max: 1, step: 0.1 } }), digital, 'a zoom that goes nowhere');
});

test('a zoom stays inside the range', () => {
  assert.equal(snapToRange(0.5, lens), 1);
  assert.equal(snapToRange(9, lens), 8);
});

test('a zoom snaps to the nearest step from the minimum, without float drift', () => {
  assert.equal(snapToRange(2.53, lens), 2.5);
  assert.equal(snapToRange(1 + 15 * 0.1, lens), 2.5);
  assert.equal(snapToRange(1.3, { min: 0.5, max: 10, step: 0.5, hardware: true }), 1.5);
  assert.equal(snapToRange(8.04, { min: 1, max: 8.05, step: 0.1, hardware: true }), 8, 'the grid below max');
  assert.equal(snapToRange(8.05, { min: 1, max: 8.05, step: 0.1, hardware: true }), 8.05, 'max, even off the grid');
});

test('pinching scales the zoom by how far the fingers spread', () => {
  assert.equal(pinchZoom(2, 100, 200, lens), 4);
  assert.equal(pinchZoom(2, 100, 50, lens), 1);
  assert.equal(pinchZoom(4, 100, 400, lens), 8, 'clamped to the range');
  assert.equal(pinchZoom(2, 0, 50, lens), 2, 'fingers that started together change nothing');
});

test("a torch counts in Chrome's form (true) and in the spec's list form ([false, true])", () => {
  assert.equal(hasTorch({ torch: true }), true);
  assert.equal(hasTorch({ torch: [false, true] }), true);
  assert.equal(hasTorch({ torch: false }), false);
  assert.equal(hasTorch({ torch: [false] }), false, 'the list form of "no torch"');
  assert.equal(hasTorch({}), false);
  assert.equal(hasTorch(undefined), false);
});

const thirds = { min: -2, max: 2, step: 1 / 3 }; // Android's exposure steps are often a third of an EV

test("exposure uses the camera's own range, and there is none where the camera can't adjust it", () => {
  assert.deepEqual(exposureRange({ exposureCompensation: { min: -2, max: 2, step: 1 / 3 } }), thirds);
  assert.deepEqual(exposureRange({ exposureCompensation: { min: -2, max: 2, step: 0 } }), { min: -2, max: 2, step: 0.1 });
  assert.equal(exposureRange({ exposureCompensation: { min: 0, max: 0, step: 0 } }), null);
  assert.equal(exposureRange({}), null);
  assert.equal(exposureRange(undefined), null);
});

test('exposure snaps to the camera steps', () => {
  assert.equal(snapToRange(0, thirds), 0);
  assert.equal(snapToRange(1, thirds), 1);
  assert.equal(snapToRange(0.4, thirds), 0.333333);
  assert.equal(snapToRange(-5, thirds), -2);
});
