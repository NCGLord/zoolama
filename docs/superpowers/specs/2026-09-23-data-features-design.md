# Zoolama — data features: design

> **Status: design record, 2026-09-23.** The reasoning behind six features built on data the app already keeps. Like
> the [MVP record](2026-09-22-zoolama-shopping-pwa-design.md), it is not updated feature by feature: the
> [README](../../../README.md) and the code win where they disagree.

## Context

After the MVP the app keeps a trip history, a cart with checkout marks, and a Compare tool. Six features make more of
that data without accounts, network or dependencies:

1. **Multipacks in Compare** — `12 × 350 ml` against `2 L`.
2. **Receipt-total check** — one number from the receipt against the cart, at the till.
3. **Price memory** — what an item cost last time, while typing it.
4. **Buy again** — a past trip's items as a checklist for the next one.
5. **History insights** — spending by month and by store.
6. **Offers** — *atacarejo* tier prices (Assaí, Atacadão: "R$ 5,99 un · a partir de 6 un R$ 4,99") and *leve N pague M*.

## Rules the code sets for all six

- **Never bump the stored schema.** `load()` backs up any other `schema` to `zoolama:v1:corrupt` and starts empty, so a
  bump would wipe every stored cart. Every new field is optional and read with a default; `restoreState` (src/state.js)
  and `isTrip` (src/history.js) validate each new field, and old carts and trips load unchanged.
- **`cart.add` keeps cart-level fields** (`{...state, …}`), or the receipt total would vanish on the next Add.
- **`tripFromCart` whitelists item fields**: anything that changes `lineTotal` (an offer) must be copied into the trip,
  or History's re-totalled lines stop adding up to `trip.totalCents`.
- **`lineTotal` is the single source of a line's cost.** Totals, budget, checkout differences, sorting, share text and
  History all go through it; an offer changes it in one place.
- Toast texts take no parameters and i18n has no plurals: counts use the `'Itens: {n}'` pattern.

## Decisions

### Multipacks
- A new `parsePack(input, {grouping})` in units.js reads `12x350`, `12 x 350`, `12×350`, `6 × 1,5`: the pack count first,
  a whole number; the size by the unit's usual rule (`2 x 1.000 g` is 2000 g). `parseQuantity` and `parseGrams` stay
  strict — a scale weight must never accept `2x1,250`.
- Decimal keypads have no `x`, so the quantity field gets an explicit **×** key rather than `inputmode="text"`, which
  would lose the number pad for every other entry.

### Receipt check
- Stored as `cart.receiptCents`: the camera can kill the PWA on a low-memory phone mid-checkout, so it can't be
  transient. Clear and Undo keep it; an Add into an empty cart (a new trip) drops it. The finished trip keeps it.
- Two comparisons: the receipt against the noted total (shelf prices, the lower-price-law baseline), and — when lines
  carry what the till charged — against the charged total, to say whether the noted differences explain it.

### Price memory
- **The last price, not the lowest.** With food inflation a minimum makes nearly every line look dear; the question at
  the shelf is "did it go up since I last bought it".
- Names match case- and accent-insensitively (`nameKey`: NFD, marks stripped, lower case, spaces collapsed), which agrees
  with the pt-BR collator at base sensitivity.
- Unit and weighed purchases of one name are remembered apart, and only like is compared with like: price per unit, or
  price per kg — never a weighed line's total, which depends on the weight.
- Rebuilt only when the history changes.

### Buy again
- `state.plan = {items: [{id, name, done}], nextId, undo}`, top level of the saved state: it outlives Clear, and it is
  edited while shopping, so it can't live in the cart or under the history key.
- *Comprar de novo* merges a trip's names (skipping ones already listed); adding an item of the same name ticks it off;
  finishing a trip drops the ticked items and keeps the rest for next time.
- Deferred: adding to the list by hand, quantities, reordering, sharing the list.

### Insights
- Totals are the noted totals History already shows. The last six local months as bars (the current one highlighted);
  stores grouped by `nameKey`. No month-over-month percentage: a partial month against a full one misleads.
- Chart marks use `--muted` and `--primary`, which pass 3:1 against both backgrounds in both themes; never `--rule` or
  the light theme's `--tag`, which don't.

### Offers
- Optional `item.deal` on unit lines: `{kind: 'tier', minQty, eachCents}` — from `minQty` units the bulk price applies to
  every unit, as atacarejos print it — or `{kind: 'multibuy', buy, pay}`. Validated where the reducer receives it.
- Tier first, multibuy second: each changes `lineTotal` on its own, and receipts print them differently (atacarejos put
  the bulk price on the line; *leve-pague* usually appears as a discount at the end), so a multibuy line can show a
  false per-line overcharge at the till — the receipt check is the authority there.
- One sheet edits what a line costs: its price and its offer. It replaces the inline price editor on unit lines.
- Deferred: thresholds across several lines, "N por R$ X", "2ª unidade 50%", tier prices in Compare.

## Order

Multipacks (isolated) → receipt check (first cart-level field) → price memory (introduces `nameKey`) → buy again
(needs it) → insights → offers (changes `lineTotal`, so last, when every consumer is already pinned by tests).
