# Zoolama

Offline supermarket helper for your phone:

- **Cart (Carrinho)**: type a price, tap Add, and watch the running total. The cart survives closing the
  app, restarting the phone, or losing signal. While the keyboard is up, the total shrinks to one slim row, so the
  form stays in view above it.
- **Price memory**: the name field suggests items from past trips, and once a name matches it shows what that item
  cost last time, where and when (*Última vez: R$ 4,29 · Assaí, 12/09*), adding *+7% desde a última vez* when the
  price you type is higher; a cart line that costs more than last time says so too. Weighed items are remembered by
  their price per kg.
- **Fix a price, add an atacado price**: tap a line's arithmetic (*R$ 4,50 × 2*) to open its sheet: correct the
  price (per kg on a weighed line; quantity, photo and checkout marks stay) or note an atacarejo price — *a partir de
  6 un, R$ 4,99* — which applies to every unit once the line reaches it. Below it, the line says what taking that many
  would cost and save (*Levando 6: R$ 4,99 cada, economiza R$ 6,00*); tap that to take them. Or a *leve 3 pague 2*:
  the line shows the discount as a receipt prints it (*R$ 3,50 × 3 − R$ 3,50*), says when one more is free, and at the
  till notes that the discount may come at the end of the receipt. The **%** key beside the quantity notes either
  offer while adding an item.
- **Sort**: order the cart by *Adicionado* (when added), *Valor* (line total) or *Nome*; tap the active one again to
  flip ascending/descending. The choice is remembered and applies in checkout mode too.
- **Weighed items**: switch the entry to *Peso*, type the price per kg and the weight from the scale label
  (`1,250`), and see the line price before adding it. Tap a line's weight to correct it.
- **Shelf-tag photos**: tap 📷 to photograph the price tag as you add an item, or later from its line. Tap the
  thumbnail at checkout to show the photo full-screen with the price you noted. By law (Lei 10.962/2004, art. 5º),
  when the shelf and the checkout disagree, you pay the lower price. Photos stay on the phone and are deleted
  with their item.
- **Magnifier (Lupa)**: tap 🔍 in the header to read small print, such as a best-before date, through the back
  camera. Hold the phone back where it can focus and zoom in with the slider or two fingers: the camera's own zoom where
  the phone offers it (Chrome on Android), otherwise the picture is enlarged on screen, up to 4×. *Congelar* holds the
  picture still, so a shaky hand doesn't get in the way, and where the phone has a torch, the 🔦 button beside it lights
  up the print. Where the camera allows it, the ☀ slider above the zoom brightens a dim shelf or tames the torch's glare
  on a shiny pack. Nothing is recorded, and the camera turns off when you close the magnifier or leave the app.
- **Checkout (Conferir no caixa)**: at the till, tick each item as it's scanned. If the till charges a different
  amount for a line, tap ≠ and type it: the app shows the difference, the total overcharge (and the lower-price
  rule), and anything charged in your favour. Or type the receipt's total under the list (*Total do cupom*): the app
  says whether it matches the cart, by how much it's over or under, and whether the lines you marked ≠ account for
  the difference. The screen stays on while you check, where the phone allows it.
- **Trip history (Histórico)**: *Finalizar compra* under the cart saves the trip (date, optional store, items,
  total, and any overcharge found at the till) and clears the cart, with Undo. The Histórico tab lists trips by
  month with monthly totals; tap one to see its items or delete it. With two trips or more, *Resumo* at the top shows
  the last six months as bars (tap one to read its total), the average trip, and each store's trips and total.
- **Backup**: history lives only in this phone's browser, so *Exportar histórico* (under the trips) saves it as a
  small JSON file: through the share sheet on iPhone (e.g. *Save to Files*), as a download on Android. *Importar*
  merges such a file back, on this phone or a new one, adding only trips it doesn't already have, with Undo.
- **Buy again**: *Comprar de novo* on a past trip puts its items on a shopping list at the top of the cart. Tap one to
  start entering it (in *Peso* if you last bought it by weight); it's struck off while the cart holds an item of that
  name, and finishing the trip takes the bought ones off the list, keeping the rest for next time.
- **Share**: *Compartilhar* sends the cart, or any past trip from Histórico, as plain text through the phone's
  share sheet (WhatsApp, SMS, e-mail…). Where there's no share sheet, it copies the list instead.
- **Budget**: tap *+ Orçamento* under the total to set a limit. The tag shows what's left, and turns red with the
  amount over when you pass it. The budget stays when you clear the cart.
- **Compare (Comparar)**: enter two or more options (e.g. 1 kg for R$ 8,99 vs 5 kg for R$ 29,90) to see the
  price per kg, L or unit, which option is cheapest, and how much more the others cost. Type sizes as the pack
  prints them: *1.000 g* is a thousand grams, while *1,250 kg* keeps its decimals. For a multipack, type the count,
  tap **×** and the size (*12×350* ml): the card shows what it adds up to (*= 4,2 L*). Tap **Add to cart** on the
  winner; a pack goes in named the way it prints (*12 × 350 ml*).
- **About (Sobre)**: the fourth tab says what zoolama is, that what you enter stays on this phone (and how much space
  it takes there), the version this phone runs (*Procurar atualização* checks for a newer one right away), its MIT
  licence, and links to the source code, to report a problem and to e-mail the author. *Compartilhar o Zoolama* sends
  the app's link through the share sheet. Tapping the logo opens the same page full screen, with the
  🇧🇷/🇬🇧 flags still at hand.
- PT/EN and light/dark toggles in the header.

It runs entirely offline as an installable web app (PWA), with no account, no tracking, no build step and
no runtime dependencies. Your data stays in the phone's browser storage, and a Content Security Policy lets only the
app's own files run.

**Look:** the *Feira* theme (a hortifruti stall: lettuce-green actions, a mango total tag, tomato for warnings), in
light and dark, plus small moments of joy. The total counts up, finishing a trip within budget throws little
price tags, checkout ticks snap (with a haptic tick on Android), the cheapest option in Compare flips like a
shelf tag, past trips look like torn receipts, and tapping the logo lifts it off the header into the About page, full
screen, with the llama and its price tag large. All motion switches off when the phone asks for reduced motion, and
`test/contrast.test.js` keeps every text colour readable in both themes.

**App:** <https://ncglord.github.io/zoolama/>

## Install on your phone

Open the link once while online. When the *Pronto para usar offline* / *Ready to use offline* message appears,
the app is fully cached. Then add it to your home screen:

- **Android (Chrome):** menu ⋮ → **Add to Home screen** / **Install app**.
- **iPhone (Safari):** Share button → **Add to Home Screen**.

Where the browser can install it, an **Instalar** / **Install** button also appears in the header: on Android it opens
the install prompt, on iPhone it shows the two steps above. It hides once the app runs from the home screen.

Launch it from the home-screen icon. It works in airplane mode from then on. On Android, long-press the icon for three
shortcuts: *Comparar preços* opens Compare, *Conferir no caixa* opens the cart ready to check at the till, and *Lupa*
opens the magnifier.

**Updates:** the app checks for a new version when you open it, every 7 minutes while it's open, and when you bring it
back to the front after 7 minutes or more. A new version downloads in the background; when it's ready you see
*Nova versão disponível · Atualizar*. Tap it to switch now, or keep shopping and get it on the next launch.

## Develop

```sh
npm test                      # unit tests (node --test), no install needed
python3 -m http.server 8765   # then open http://localhost:8765
```

The browser tests (`e2e/*.spec.js`) drive the app in Chromium at phone size (390×844, pt-BR) and fail on any console
error. They are the only thing that needs an install, the pinned `@playwright/test` dev dependency:

```sh
npm ci && npx playwright install --only-shell chromium   # once
npm run e2e                                             # builds the site, serves it at :8799/zoolama/
```

After changing **any precached file** (anything listed in `ASSETS` in `sw.js`), run:

```sh
npm run stamp                 # rewrites sw.js VERSION = hash of the precached files
```

`npm test` fails until you do. This is deliberate: an unchanged `VERSION` would leave phones on the old cache
forever. New files the app references must also be added to `ASSETS`, and the tests catch it when they aren't.

**CI:** every push runs `npm test` and `npm run e2e` on GitHub Actions (`.github/workflows/test-and-deploy.yml`).
Only a `main` where both pass is published to GitHub Pages, whose source is set to *GitHub Actions*, so a failing
test (a forgotten `npm run stamp` included) never reaches the phone. What gets published is `npm run site`'s `_site/`:
`sw.js`, the files it precaches and the font licence, never the tests, tools or docs.

Icons are generated from `icons/*.svg` with `tools/icons.sh` (needs `rsvg-convert`). The install-sheet screenshots in
`screenshots/` are generated by `node tools/screenshots.mjs` (needs the browser-test install above and ImageMagick with
WebP); they are published but not precached, so no phone carries them.

The header wordmark (the llama in *Zoolama*) is generated into `index.html` by `tools/wordmark.py`. It uses the
font's real letter outlines and needs `pip install fonttools brotli`. Run `npm run stamp` afterwards.

## Layout

| Path | What |
|---|---|
| `src/money.js`, `units.js`, `compare.js`, `cart.js`, `budget.js`, `history.js`, `share.js`, `store.js`, `i18n.js`, `theme.js`, `install.js`, `update.js`, `delight.js`, `magnifier.js` | Pure logic, unit-tested |
| `src/photos.js` | Shelf-tag photos: shrinks them on a canvas and keeps them in IndexedDB; its pure helpers are unit-tested |
| `src/app.js` | Entry point: wires the views together and boots them |
| `src/ui/` | The screen, one module per part, importing only downwards (`test/modules.test.js` keeps the graph acyclic): `dom`, `app-state` (the state and `persist()`), `text`, `toast`, `photo-cache`, `cart-store` (every cart change), `share-sheet`, `photos-ui`, `entry`, `cart-lines`, `cart-view`, `history-view`, `compare-view`, `shell` (tabs, theme), `pwa` (install, service worker), `magnifier-ui`, `about-view`, `about-screen` (About full screen, from the logo) |
| `sw.js` | Service worker: atomic precache, cache-first |
| `test/` | Unit tests (`node --test`) |
| `e2e/`, `playwright.config.js` | Browser tests (`npm run e2e`) |
| `tools/` | `stamp-sw.mjs`, `sw-assets.mjs`, `icons.sh`, `wordmark.py` |
| `docs/superpowers/specs/` | The MVP design record; this README describes the app as it is now |

The price font is Barlow Condensed Bold (SIL OFL 1.1, see `fonts/OFL.txt`).

## Licence

Zoolama is [MIT](LICENSE)-licensed, © 2026 Geraldo Viana. The font keeps its own licence, the SIL OFL 1.1 above.
