#!/usr/bin/env python3
"""Build fonts/zoolama-double-400.woff2, the Altura dupla font: Roboto with every letter twice as tall and as wide.

A thermal printer's double-height mode prints each dot row twice: the letters come out twice as tall at the same
width, easy to read at arm's length and at any age. This does the same to Roboto (the face Android shows) once, at
build time: every glyph, accent position and line metric is stretched 2x vertically, widths untouched, so a line set
in it makes room for the tall letters by itself. Regular weight, Latin only; a character outside it falls back to the
normal font. Roboto is SIL OFL 1.1 with no reserved name: the result is renamed "Zoolama Altura Dupla", as the licence
asks of a modified font, and fonts/Roboto-OFL.txt travels with it.

Roboto comes from Google's fonts repository at a pinned commit, checked against its SHA-256: the same input always
gives the same font.

Needs fonttools and brotli (for woff2):  pip install fonttools brotli
Run from anywhere:  python3 tools/double-height.py   then  npm run stamp
"""

import hashlib
import urllib.request
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "fonts" / "zoolama-double-400.woff2"
LICENCE = ROOT / "fonts" / "Roboto-OFL.txt"

SOURCE = "https://raw.githubusercontent.com/google/fonts/1c627bfa375fc51cf86fabeca4f6e08a95f0aa5c/ofl/roboto/"
ROBOTO = ("Roboto%5Bwdth,wght%5D.ttf", "d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134")
OFL = ("OFL.txt", "061402327a96aadb0bfb694a960ed289ecd38d383e396243831ab81feb109c41")

FAMILY = "Zoolama Altura Dupla"
# Latin, Latin-1 and Latin Extended-A (Portuguese, English and their neighbours), and the punctuation names use.
UNICODES = [
    *range(0x20, 0x7F),
    *range(0xA0, 0x180),
    *(0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x2039, 0x203A),
    *(0x20AC, 0x2122, 0x2212),
]


def fetch(name, sha256):
    data = urllib.request.urlopen(SOURCE + name, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise SystemExit(f"{name} isn't the pinned file (SHA-256 differs): check SOURCE before going on")
    return data


def regular_latin(data):
    """Roboto's regular weight at its normal width, Latin only, without hinting (it wouldn't fit stretched outlines)."""
    font = instancer.instantiateVariableFont(TTFont(BytesIO(data), recalcTimestamp=False), {"wght": 400, "wdth": 100})
    options = subset.Options()
    options.hinting = False
    options.name_IDs = ["*"]
    options.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    return font


def double_y(node, seen):
    """Every vertical position in a GPOS subtree, doubled: the accents' anchors keep their place on the tall letters."""
    if id(node) in seen or isinstance(node, (int, float, str, bytes)) or node is None:
        return
    seen.add(id(node))
    if isinstance(node, (list, tuple)):
        for item in node:
            double_y(item, seen)
        return
    for attr in ("YCoordinate", "YPlacement", "YAdvance"):
        if isinstance(getattr(node, attr, None), int):
            setattr(node, attr, 2 * getattr(node, attr))
    for value in vars(node).values() if hasattr(node, "__dict__") else ():
        double_y(value, seen)


def double_height(font):
    """Each glyph, accent anchor and line metric twice as tall; every width as it was."""
    glyf = font["glyf"]
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.isComposite():
            for component in glyph.components:
                component.y *= 2
        elif glyph.numberOfContours > 0:
            glyph.coordinates.scale((1, 2))
    for name in font.getGlyphOrder():
        glyf[name].recalcBounds(glyf)
    if "GPOS" in font:
        double_y(font["GPOS"].table, set())
    hhea, os2 = font["hhea"], font["OS/2"]
    for table, attrs in (
        (hhea, ("ascent", "descent", "lineGap")),
        (os2, ("sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "sxHeight", "sCapHeight")),
    ):
        for attr in attrs:
            setattr(table, attr, 2 * getattr(table, attr))


def rename(font):
    names = font["name"]
    for name_id in (16, 17):  # Roboto's typographic family: the renamed font is a family of its own
        names.removeNames(nameID=name_id)
    for name_id, text in (
        (1, FAMILY),
        (2, "Regular"),
        (3, f"{FAMILY} Regular; Roboto at double height"),
        (4, f"{FAMILY} Regular"),
        (6, FAMILY.replace(" ", "") + "-Regular"),
    ):
        names.setName(text, name_id, 3, 1, 0x409)
        names.setName(text, name_id, 1, 0, 0)


def main():
    font = regular_latin(fetch(*ROBOTO))
    double_height(font)
    rename(font)
    font.flavor = "woff2"
    font.save(FONT)
    LICENCE.write_bytes(fetch(*OFL))
    print(f"{FONT.relative_to(ROOT)}: {FONT.stat().st_size} bytes; {LICENCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
