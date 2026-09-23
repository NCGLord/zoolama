#!/usr/bin/env python3
"""Regenerate the header wordmark inside index.html.

The letters of "Zoo" and "ama" are real Barlow Condensed Bold outlines taken from the vendored
font, so the logo draws instantly and never waits on the font. The "l" is hand-drawn as a llama
whose neck is the letter's stem. Everything is in one coordinate space: 100 units per em, baseline
at y=100.

Needs fonttools and brotli (for woff2):  pip install fonttools brotli
Run from anywhere:  python3 tools/wordmark.py   then  npm run stamp
"""

import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "fonts" / "barlow-condensed-700.woff2"
INDEX = ROOT / "index.html"
SIZE, BASELINE = 100, 100

# The llama "l": stem (neck) from the baseline up, banana ears, head looking right over "ama".
# The eye is a second subpath, cut out by fill-rule evenodd so it shows whatever is behind.
LLAMA = (
    "M132.6 100V33C132.6 21 133.4 11 135.2 3L134.2 -11Q134.6 -18 139 -12.5L141.6 -2.5L143.6 -11.5"
    "Q145.2 -17.5 148.6 -11.5L148.8 -2.5C158 -4.5 171 -1 176.5 5.5C179.8 9.5 177.6 16 170.5 16"
    "C161.5 16 154 17 150.4 22.5C147.6 26 147.6 29.5 147.6 34V100Z"
    "M155.3 4a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0Z"
)
STRING = "M147.6 29.5 157.5 33.5"
# A tiny shelf tag hanging from the neck; its punched hole is cut out the same way as the eye.
# The tag's 3-unit stroke also rings the hole, so the cut-out is 1.5 wider than the visible hole.
TAG = "M160 28H179V42H160L154 35ZM157.9 35a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z"


def outline(font, text, x):
    """SVG path data for `text` set from x, plus the advance to where the next glyph starts."""
    cmap, glyphs, hmtx = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]
    scale = SIZE / font["head"].unitsPerEm
    parts = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, BASELINE)))
        parts.append(pen.getCommands())
        x += hmtx[name][0] * scale
    return "".join(parts), x


def svg():
    font = TTFont(FONT)
    zoo, l_start = outline(font, "Zoo", 0)
    _, ama_start = outline(font, "l", l_start)  # the llama replaces the real "l"; keep its advance
    ama, width = outline(font, "ama", ama_start)
    rnd = lambda d: re.sub(r"\d+\.\d+", lambda m: f"{float(m.group()):.1f}".rstrip("0").rstrip("."), d)
    return f"""<svg class="wordmark" viewBox="0 -20 {width:.0f} 122" role="img" aria-label="Zoolama">
          <path fill="currentColor" d="{rnd(zoo + ama)}" />
          <path fill="currentColor" fill-rule="evenodd" d="{LLAMA}" />
          <path d="{STRING}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          <path d="{TAG}" fill="#ffd60a" fill-rule="evenodd" stroke="#ffd60a" stroke-width="3" stroke-linejoin="round" transform="rotate(14 166 35)" />
        </svg>"""


def main():
    html = INDEX.read_text()
    block = re.compile(r"(<!-- wordmark:start -->)(.*?)(\s*<!-- wordmark:end -->)", re.S)
    if not block.search(html):
        raise SystemExit("index.html has no <!-- wordmark:start --> … <!-- wordmark:end --> block")
    INDEX.write_text(block.sub(lambda m: f"{m.group(1)}\n        {svg()}{m.group(3)}", html))
    print("index.html wordmark updated — now run: npm run stamp")


if __name__ == "__main__":
    main()
