// When to offer "Install": Chromium browsers hand us a prompt to trigger; iOS never does,
// so there the button can only explain Share → Add to Home Screen.

/** 'prompt' | 'ios' | 'hidden' */
export function installMode({ standalone, hasPrompt, ios }) {
  if (standalone) return 'hidden';
  if (hasPrompt) return 'prompt';
  return ios ? 'ios' : 'hidden';
}

/** iPadOS reports itself as a Mac, so a touch-capable "MacIntel" counts as iOS too. */
export function isIOS(userAgent, platform, maxTouchPoints) {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}
