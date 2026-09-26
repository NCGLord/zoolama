import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIGITAL_MAX, clampZoom, pinchZoom, zoomRange } from '../src/magnifier.js';

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
  assert.equal(clampZoom(0.5, lens), 1);
  assert.equal(clampZoom(9, lens), 8);
});

test('a zoom snaps to the nearest step from the minimum, without float drift', () => {
  assert.equal(clampZoom(2.53, lens), 2.5);
  assert.equal(clampZoom(1 + 15 * 0.1, lens), 2.5);
  assert.equal(clampZoom(1.3, { min: 0.5, max: 10, step: 0.5, hardware: true }), 1.5);
  assert.equal(clampZoom(8.04, { min: 1, max: 8.05, step: 0.1, hardware: true }), 8, 'the grid below max');
  assert.equal(clampZoom(8.05, { min: 1, max: 8.05, step: 0.1, hardware: true }), 8.05, 'max, even off the grid');
});

test('pinching scales the zoom by how far the fingers spread', () => {
  assert.equal(pinchZoom(2, 100, 200, lens), 4);
  assert.equal(pinchZoom(2, 100, 50, lens), 1);
  assert.equal(pinchZoom(4, 100, 400, lens), 8, 'clamped to the range');
  assert.equal(pinchZoom(2, 0, 50, lens), 2, 'fingers that started together change nothing');
});
