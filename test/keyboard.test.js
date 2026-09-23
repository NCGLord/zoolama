import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardOpen, tallestHeight } from '../src/keyboard.js';

test('the keyboard is up when a text field has focus and the visible height has dropped well below its tallest', () => {
  assert.equal(keyboardOpen({ editing: true, height: 480, tallest: 844 }), true);
  assert.equal(keyboardOpen({ editing: false, height: 480, tallest: 844 }), false, 'nothing to type in');
  assert.equal(keyboardOpen({ editing: true, height: 844, tallest: 844 }), false, 'a hardware keyboard, or none');
  assert.equal(keyboardOpen({ editing: true, height: 788, tallest: 844 }), false, 'a browser toolbar, not a keyboard');
});

test('the tallest height is kept per width, and starts over when the phone turns', () => {
  let seen = tallestHeight(null, { width: 390, height: 844 });
  seen = tallestHeight(seen, { width: 390, height: 480 });
  assert.deepEqual(seen, { width: 390, height: 844 });
  seen = tallestHeight(seen, { width: 844, height: 390 });
  assert.deepEqual(seen, { width: 844, height: 390 });
});
