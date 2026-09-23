// An optional spending limit for the trip, compared with the cart total (all in cents).

/** null when no budget is set; otherwise what's left, or by how much the cart is over. */
export function budgetStatus(totalCents, budgetCents) {
  if (budgetCents == null) return null;
  const over = totalCents > budgetCents;
  return {
    budgetCents,
    leftCents: over ? 0 : budgetCents - totalCents,
    overCents: over ? totalCents - budgetCents : 0,
    over,
  };
}
