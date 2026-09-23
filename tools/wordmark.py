#!/usr/bin/env python3
"""Regenerate the header wordmark inside index.html, and the app icon sources built from its llama.

The letters of "Zoo" and "ama" are real Barlow Condensed Bold outlines taken from the vendored
font, so the logo draws instantly and never waits on the font. The "l" is hand-drawn as a llama
whose neck is the letter's stem. Everything is in one coordinate space: 100 units per em, baseline
at y=100.

Needs fonttools and brotli (for woff2):  pip install fonttools brotli
Run from anywhere:  python3 tools/wordmark.py   then  tools/icons.sh  and  npm run stamp
"""

import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "fonts" / "barlow-condensed-700.woff2"
INDEX = ROOT / "index.html"
ICONS = ROOT / "icons"
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
          <path d="{TAG}" fill="#ffcf33" fill-rule="evenodd" stroke="#ffcf33" stroke-width="3" stroke-linejoin="round" transform="rotate(14 166 35)" />
        </svg>"""


def icon_svg(maskable):
    """The llama alone on shelf-tag yellow, rising from the bottom edge. Ink tag instead of yellow, so
    it shows on the yellow ground; the eye and tag hole are cut out, so the yellow shows through.
    Maskable (full bleed) keeps the head inside the 40% safe circle; the neck may run off the edge."""
    ground = (
        '<rect width="512" height="512" fill="#ffd60a" />'
        if maskable
        else '<clipPath id="r"><rect width="512" height="512" rx="112" /></clipPath>'
        '<rect width="512" height="512" rx="112" fill="#ffd60a" />'
    )
    clip = "" if maskable else ' clip-path="url(#r)"'
    ink = "#1b1f24"
    # Map the llama's head/neck junction to just above centre, at 4.5x, so the neck bleeds off the bottom.
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  {ground}
  <g{clip}>
    <g transform="translate(256 222) scale(4.5) translate(-155.5 -15)">
      <path fill="{ink}" fill-rule="evenodd" d="{LLAMA.replace('V100Z', 'V140Z').replace('M132.6 100V33', 'M132.6 140V33')}" />
      <path d="{STRING}" stroke="{ink}" stroke-width="2.2" stroke-linecap="round" />
      <path d="{TAG}" fill="{ink}" fill-rule="evenodd" stroke="{ink}" stroke-width="3" stroke-linejoin="round" transform="rotate(14 166 35)" />
    </g>
  </g>
</svg>
"""


def main():
    html = INDEX.read_text()
    block = re.compile(r"(<!-- wordmark:start -->)(.*?)(\s*<!-- wordmark:end -->)", re.S)
    if not block.search(html):
        raise SystemExit("index.html has no <!-- wordmark:start --> … <!-- wordmark:end --> block")
    INDEX.write_text(block.sub(lambda m: f"{m.group(1)}\n        {svg()}{m.group(3)}", html))
    (ICONS / "icon.svg").write_text(icon_svg(maskable=False))
    (ICONS / "icon-maskable.svg").write_text(icon_svg(maskable=True))
    print("index.html wordmark and icons/*.svg updated — now run: tools/icons.sh && npm run stamp")


if __name__ == "__main__":
    main()
