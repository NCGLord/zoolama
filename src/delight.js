// Small pure helpers behind the app's moments of joy (count-up, celebration, winner flip).
// The DOM side lives in app.js and is skipped entirely when the phone asks for reduced motion.

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** A total part-way through its count-up, in whole cents; progress runs 0 → 1 and is clamped. */
export function tweenCents(from, to, progress) {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(from + (to - from) * easeOutCubic(p));
}

/** A finished trip earns a celebration, unless it went over the budget. */
export function celebrates(totalCents, budgetCents) {
  return budgetCents == null || totalCents <= budgetCents;
}

/** Option indexes that are cheapest now but weren't before: those are the tags to flip. */
export function newWinners(before, after) {
  return [...after].filter((i) => !before.has(i));
}
