# Zoolama — offline supermarket cart + unit-price compare (PWA)

> **Status: MVP design record, approved 2026-09-22.** It keeps the reasoning behind the first release and is not
> updated feature by feature. The [README](../../../README.md) describes the app as it is now; where the two
> disagree, the README and the code win.
>
> **Shipped since** (two of these are listed as out of scope below):
> - **Weighed items**: price per kg × weight, kept in whole grams.
> - **Shopping budget** on the total tag.
> - **Checkout mode** at the till: tick lines, note a different charged amount, see the overcharge and the
>   lower-price rule (Lei 10.962/2004).
> - **Shelf-tag photos**, shrunk and kept in IndexedDB (`zoolama-photos`).
> - **Trip history** (Histórico), grouped by month; **share** a cart or a trip as text; **sort** the cart.
> - **Updates** no longer wait silently for the next launch: the app re-checks on resume (at most every 30 min)
>   and offers *Nova versão disponível · Atualizar*. There is also an in-app **Install** button.
> - **Stored state:** `zoolama:v1` also holds `tab`, `theme`, `checking`, `budgetCents` and `sort`; trips live
>   under their own key, `zoolama:v1:history`.
> - **Compare** reads `1.000` g/ml/un as a thousand, like prices; kg and L keep three decimals.
> - **Look:** the Feira theme and its small animations, all off under reduced motion.
> - **Deploy:** GitHub Actions tests every push and publishes Pages only from a green `main`, instead of
>   Pages serving `main` at `/` (step 15).

## Context

The user wants to use their phone **offline, inside a supermarket** to:
1. keep a running sum of the items they pick (the cart must survive closing the app or losing signal), and
2. compare products of different sizes by **price per unit** (R$/kg, R$/L, R$/un) to find the cheaper one.

`/d00/anthrpc/zoolama` is empty (not a git repo), so this is greenfield work. The toolchain on the box is
Node 26, python3, git, `gh` (logged in as **NCGLord**, ssh), rsvg-convert and ImageMagick 7.

### Decisions made with the user
| Topic | Decision |
|---|---|
| Delivery | PWA on GitHub Pages, public repo **NCGLord/zoolama**, served at `https://ncglord.github.io/zoolama/` |
| Stack | Vanilla ES modules, **no build step, zero runtime deps**, hand-written service worker, tests with `node --test` |
| Memory | Persist the **current cart** (and compare inputs + language) in `localStorage`. No autocomplete, no price history, no M+ |
| Cart line | Optional name + price + integer qty → subtotal; a big total pinned at the bottom |
| Calculations | **Compare tool only**: 2+ options → cheapest per base unit, and the others shown as "+x%" |
| Link | The winner card has an "Add to cart" button that adds its price at qty 1 |
| Locale | **PT/EN toggle**. Currency is always BRL |
| Theme | **Light/dark toggle** (added mid-build at the user's request): follows the system until tapped, then persists. An inline pre-paint script avoids a flash |

**One call I made (easy to flip):** number *display* follows the chosen language: PT → `R$ 8,99`, EN → `R$8.99`.
*Input* accepts either `,` or `.` in both modes.

Out of scope (YAGNI): unit price on cart lines, weighed items (price × weight), multipacks (`12 × 350 ml`),
budget limit, sync or accounts.

## Architecture

```
index.html              shell: header (title, PT|EN toggle), two tab panels, bottom tab bar
styles.css              mobile-first, prefers-color-scheme dark/light, ≥44px targets, inputs ≥16px (no iOS zoom)
manifest.webmanifest    name, icons, display: standalone, start_url/scope/id = "./" (relative → works under /zoolama/)
sw.js                   classic SW: versioned precache, cache-first, navigation → cached index.html
.nojekyll               Pages serves files verbatim
icons/icon.svg          source; icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon-180.png (generated)
tools/icons.sh          rsvg-convert/magick → PNGs
tools/stamp-sw.mjs      writes sha256(precached assets) into sw.js VERSION
src/money.js            parseMoney(str) → cents | null ; formatMoney(cents, lang)
src/units.js            UNITS {g,kg,ml,L,un} → {dim: mass|volume|count, toBase}; parseQuantity(str) → number | null
src/compare.js          compare(options) → {dim, results:[{unitPrice, isCheapest, pctMore}], error?}
src/cart.js             pure reducer: add | setQty | rename | remove | clear | undo ; total(state)
src/store.js            load()/save(state) over an injected Storage (localStorage in app, a fake in tests)
src/i18n.js             {pt:{…}, en:{…}}, t(key, lang), detectLang(navigator.language)
src/app.js              DOM wiring only: events → reducer → save → render. No business logic here
test/*.test.js          node --test
package.json            {"type":"module","private":true,"scripts":{"test":"node --test"}}, no dependencies
docs/superpowers/specs/2026-09-22-zoolama-shopping-pwa-design.md   this design, committed
```

### Module contracts (the logic lives here; all pure and tested)
- **money**: store integer **cents** everywhere, never floats. `parseMoney` strips `R$`/spaces. If both `.` and `,` appear,
  the last one is the decimal separator. With a single separator, 1–2 trailing digits mean a decimal
  (`8,99`, `8.9`), and exactly 3 trailing digits mean thousands grouping (`1.299` → 129900). Invalid, empty or ≤0 input → `null`.
  `formatMoney` uses `Intl.NumberFormat(pt-BR|en-US, {style:'currency', currency:'BRL'})`.
- **units**: `parseQuantity` accepts `0,350`, `1.5` and `350`, with any number of decimals; >0 required. Base units are kg, L and un
  (g→×0.001, ml→×0.001).
- **compare**: it ignores incomplete options, needs ≥2 valid ones, and returns `error: 'mixedUnits'` when the dimensions differ
  (kg vs L). `unitPrice = cents / baseQty` in full precision; a tie means several cheapest.
  `pctMore = (p/pmin − 1)·100`, rounded to 1 decimal for display.
  Worked example (it becomes a test): 1 kg R$ 8,99 vs 5 kg R$ 29,90 → 5,98/kg is cheapest, and the other is **+50,3%**.
- **cart**: items `{id, name, priceCents, qty≥1}`. `setQty(0)` removes the item. `clear` and `remove` keep a one-level
  `undo` snapshot, so the UI shows an "Undo" toast instead of a confirm dialog. `total = Σ priceCents·qty`.
- **store**: the key is `zoolama:v1`, holding `{schema:1, cart, compare, lang}`. If the stored value is corrupt JSON, the raw string is copied to
  `zoolama:v1:corrupt` and the app starts empty. It never throws: quota or private-mode errors are swallowed.
  The app calls `navigator.storage.persist()` once, where it exists.
- **i18n**: the key sets must be identical across `pt` and `en` (enforced by a test). The toggle sets `<html lang>` and persists.

### UI (mobile-first; refine the visuals with `frontend-design` during implementation)
- **Cart tab**: the price field (`inputmode="decimal"`) is refocused after each Add but not autofocused on load, so reopening the app to glance at the total doesn't pop the keyboard over it, with a qty stepper, an optional name and an Add button (Enter submits,
  then focus goes back to price for fast entry). Each line shows its name (or "Item N"), `price × qty`, the subtotal, ± buttons and delete.
  A sticky footer shows the total (`aria-live`), the line/unit counts and Clear (with undo).
- **Compare tab**: two option cards to start (label?, price, quantity, unit `<select>`), plus "+ option" and Reset.
  Results update live: each card shows its R$/kg|L|un, the winner gets a "Mais barato / Cheapest" badge and **Add to cart**,
  and the others show "+x%". Mixed units produce an inline i18n error.

### Offline / PWA specifics
- **Relative paths everywhere** (`./sw.js`, `./src/app.js`, manifest `start_url: "./"`), because Pages serves the app under `/zoolama/`.
- **SW**: `install` precaches `ASSETS` (a JSON array between `/* ASSETS:start */ … /* ASSETS:end */` markers) into
  `zoolama-${VERSION}` and calls `skipWaiting`. `activate` deletes the other caches and calls `clients.claim`. `fetch` is cache-first,
  and navigations fall back to cached `./index.html`. Install is atomic, so a flaky in-store signal can never leave a
  half-updated mix of modules. A new version is silently used on the next launch.
- **Cache-staleness guard**: `test/sw.test.js` asserts that (a) every shipped file is in `ASSETS` and every `ASSETS` entry exists,
  and (b) `VERSION === sha256(ASSETS contents)`. Editing any asset without running `node tools/stamp-sw.mjs`
  fails the test suite, so a stale cache cannot ship.
- **iOS**: `apple-touch-icon`, `apple-mobile-web-app-capable` and a status-bar meta tag. Storage for home-screen web apps is exempt from Safari's
  7-day eviction.

## Implementation sequence (branch `feat/mvp`; every commit green under `npm test`)
1. `chore: scaffold repo`: `git init -b main`, `git switch -c feat/mvp`, `.gitignore`, `package.json`, `.nojekyll`, README stub
2. `docs: add design spec` (docs/superpowers/specs/…)
3. `feat(money): parse and format BRL cents` + tests
4. `feat(units): normalize g/kg/ml/L/un to base units` + tests
5. `feat(compare): rank options by unit price` + tests (including the 8,99 vs 29,90 example and mixedUnits)
6. `feat(cart): add pure cart reducer with undo` + tests
7. `feat(i18n): add pt/en dictionaries` + key-parity test
8. `feat(store): persist state to localStorage` + tests (fake Storage, corrupt JSON, throwing setItem)
9. `feat(ui): build cart tab` (index.html, styles.css, app.js)
10. `feat(ui): build compare tab with add-to-cart`
11. `chore(icons): add icon source and generator`, then a separate `chore(icons): generate PNG icons` (generated files in their own commit)
12. `feat(pwa): add manifest and install metadata`
13. `feat(pwa): add service worker with hash-stamped precache` + sw.test.js + tools/stamp-sw.mjs
14. `docs: add install-to-home-screen instructions` (Android Chrome / iPhone Safari)
15. **Checkpoint: stop and ask before publishing** (public and outward-facing). Then fast-forward `main`,
    run `gh repo create NCGLord/zoolama --public --source=. --remote=origin --push`, and enable Pages from `main` at `/` via
    `gh api -X POST repos/NCGLord/zoolama/pages -f 'source[branch]=main' -f 'source[path]=/'`

## Verification
- `npm test` passes at every commit. Confirm the guard works by editing `styles.css` without re-stamping: the test must fail.
- Local E2E: run `python3 -m http.server 8765` in the background and drive it with the Playwright MCP at a 390×844 viewport:
  - add 3 items and change a qty → the total is correct; reload → the cart persists; Clear then Undo → it is restored
  - compare 1 kg/8,99 vs 5 kg/29,90 → the 5 kg option wins and the other shows +50,3%; Add to cart → the line appears in the cart
  - g vs ml → mixedUnits error; toggle EN → labels and number format switch and persist across reload
  - `navigator.serviceWorker.controller` is set; then `page.context().setOffline(true)` + reload → the app still loads and works
  - console has zero errors
- On the device (after publishing): open the Pages URL, Add to Home Screen, turn on airplane mode, launch, add items,
  kill the app, relaunch → the cart is intact.
