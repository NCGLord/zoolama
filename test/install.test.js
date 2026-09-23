import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMode, isIOS } from '../src/install.js';

test('an installed app (standalone) never shows the install button', () => {
  assert.equal(installMode({ standalone: true, hasPrompt: true, ios: false }), 'hidden');
  assert.equal(installMode({ standalone: true, hasPrompt: false, ios: true }), 'hidden');
});

test('when the browser offered an install prompt, the button triggers it', () => {
  assert.equal(installMode({ standalone: false, hasPrompt: true, ios: false }), 'prompt');
});

test('on iOS, where no page can prompt, the button shows the Share → Add to Home Screen steps', () => {
  assert.equal(installMode({ standalone: false, hasPrompt: false, ios: true }), 'ios');
});

test('with no prompt and no iOS, there is nothing to offer', () => {
  assert.equal(installMode({ standalone: false, hasPrompt: false, ios: false }), 'hidden');
});

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

test('isIOS recognises an iPhone', () => {
  assert.equal(isIOS(IPHONE, 'iPhone', 5), true);
});

test('isIOS recognises an iPad that reports itself as a Mac (it has touch)', () => {
  assert.equal(isIOS(MAC, 'MacIntel', 5), true);
});

test('isIOS rejects a real Mac and Android', () => {
  assert.equal(isIOS(MAC, 'MacIntel', 0), false);
  assert.equal(isIOS(ANDROID, 'Linux armv8l', 5), false);
});
