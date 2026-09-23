# Zoolama

Offline supermarket helper for your phone:

- **Cart (Carrinho)**: type a price, tap Add, and watch the running total. The cart survives closing the
  app, restarting the phone, or losing signal.
- **Compare (Comparar)**: enter two or more options (e.g. 1 kg for R$ 8,99 vs 5 kg for R$ 29,90) to see the
  price per kg, L or unit, which option is cheapest, and how much more the others cost. Tap **Add to cart**
  on the winner.
- PT/EN and light/dark toggles in the header.

It runs entirely offline as an installable web app (PWA), with no account, no tracking, no build step and
no dependencies. Your data stays in the phone's browser storage.

**App:** <https://ncglord.github.io/zoolama/>

## Install on your phone

Open the link once while online. When the *Pronto para usar offline* / *Ready to use offline* message appears,
the app is fully cached. Then add it to your home screen:

- **Android (Chrome):** menu ⋮ → **Add to Home screen** / **Install app**.
- **iPhone (Safari):** Share button → **Add to Home Screen**.

Launch it from the home-screen icon. It works in airplane mode from then on.

**Updates:** the app checks for a new version when you open it, and again when you bring it back to the front
(at most every 30 minutes). A new version downloads in the background; when it's ready you see
*Nova versão disponível · Atualizar*. Tap it to switch now, or keep shopping and get it on the next launch.

## Develop

```sh
npm test                      # unit tests (node --test), no install needed
python3 -m http.server 8765   # then open http://localhost:8765
```

After changing **any precached file** (anything listed in `ASSETS` in `sw.js`), run:

```sh
npm run stamp                 # rewrites sw.js VERSION = hash of the precached files
```

`npm test` fails until you do. This is deliberate: an unchanged `VERSION` would leave phones on the old cache
forever. New files the app references must also be added to `ASSETS`, and the tests catch it when they aren't.

Icons are generated from `icons/*.svg` with `tools/icons.sh` (needs `rsvg-convert`).

The header wordmark (the llama in *Zoolama*) is generated into `index.html` by `tools/wordmark.py`. It uses the
font's real letter outlines and needs `pip install fonttools brotli`. Run `npm run stamp` afterwards.

## Layout

| Path | What |
|---|---|
| `src/money.js`, `units.js`, `compare.js`, `cart.js`, `store.js`, `i18n.js`, `theme.js` | Pure logic, unit-tested |
| `src/app.js` | DOM wiring only |
| `sw.js` | Service worker: atomic precache, cache-first |
| `tools/` | `stamp-sw.mjs`, `sw-assets.mjs`, `icons.sh`, `wordmark.py` |
| `docs/superpowers/specs/` | Design spec |

The price font is Barlow Condensed Bold (SIL OFL 1.1, see `fonts/OFL.txt`).
