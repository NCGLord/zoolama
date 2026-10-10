# Zoolama — Altura dupla (double-height reading text): design

> **Status: design record, approved 2026-10-10 and shipped with it.** It keeps the reasoning; the
> [README](../../../README.md) and the code describe the app as it is now.

## Why

A thermal printer's double-height mode prints each dot row twice: letters twice as tall at the same width. The user has
printed with it since 1994 and finds it easier to read at any age. Altura dupla brings that to the screen as a mode.

## What

- **One header button** (beside the theme's) turns it on and off from any screen; off by default, kept like the theme
  (`state.doubleHeight`, validated in `src/state.js`).
- **The reading text only**: item names in the cart, the name being typed, the list's chips, History's item names and
  Compare's labels. Buttons, tabs, labels, prices and totals stay as they are, so every screen still fits.
- **The printer's look, done right**: letters exactly twice as tall at the same width, crisp at any size, and lines and
  fields make room for them by themselves.

## Choices, and the ones turned down

| Option | Verdict |
|---|---|
| A condensed face, ~40% larger (looks tall, stays crisp) | Shown side by side; the user picked true double height |
| CSS `transform: scaleY(2)` | Stretched letters take no room: each screen would need its own fitting |
| Everything larger (`zoom`) | Crowds every screen; not the printer's look |
| **A double-height font, made at build time** | **Chosen**: the browser lays it out like any font |

The font is Roboto (the face Android shows, SIL OFL 1.1, no reserved name), regular, Latin only, with every glyph,
accent anchor and line metric stretched 2x vertically and every width kept (`tools/double-height.py`, fonttools; Roboto
pinned to a google/fonts commit and checked by SHA-256; hinting dropped). It is renamed "Zoolama Altura Dupla" as the
OFL asks of a modified font; 14.8 KB, precached; its licence is published beside it and named in About's copyrights.
In the mode, the reading text takes that font with `line-height: normal`, so its line metrics give the room.

## The header

The header already held every tool at 360 px. While the browser offers Install (before the app is installed), phones
under 412 px have room for all but one: there Altura dupla steps aside until the app is installed, and Install's word
label now needs 480 px. In the installed app the button always shows. (`e2e/shell.spec.js` holds the header to fitting.)

## Tests

- Unit: `doubleHeight` round-trips and falls back to off.
- e2e (`e2e/double-height.spec.js`): each kind of reading text draws in the font with an "H" twice as tall as wide,
  buttons and prices don't change, the field grows; the mode survives a restart and turns off; the switch is named in
  both languages; it steps aside only while Install is offered on a narrow phone.
