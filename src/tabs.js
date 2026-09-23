// The keyboard side of the tab bar (the ARIA tabs pattern): arrows move between tabs, wrapping at the ends, and
// Home/End jump to the first and last. Only the selected tab is in the Tab order, so one Tab press leaves the bar.

const MOVES = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (i, n) => n - 1,
};

/** Index of the tab `key` moves to from tab `current` of `count`, or null when the key doesn't move. */
export function rovingIndex(current, key, count) {
  const move = MOVES[key];
  return move && current >= 0 && current < count ? move(current, count) : null;
}
