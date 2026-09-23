// Whether the on-screen keyboard is up. Browsers don't say, so it's inferred: a text field has focus and the visible
// height has fallen well below the tallest seen at this width. Android (with interactive-widget=resizes-content)
// shrinks the whole page for the keyboard and iOS shrinks the visual viewport; either way the visible height drops,
// by far more than a browser toolbar ever takes.

const SHARE_LEFT = 0.8; // a keyboard takes a third of a phone's height or more; toolbars take well under a fifth

export function keyboardOpen({ editing, height, tallest }) {
  return editing && height < tallest * SHARE_LEFT;
}

/** The tallest visible height to compare with, per width: turning the phone starts over. */
export function tallestHeight(seen, { width, height }) {
  return seen?.width === width ? { width, height: Math.max(seen.height, height) } : { width, height };
}
