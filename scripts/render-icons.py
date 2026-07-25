"""Rasterise the Inkline mark ("The Nib Rise") into favicon / app-icon PNGs.

Geometry is taken verbatim from the design study:
  glyph path (24-unit grid):
    M3.4 18.9 L5.0 21.0 C11.0 20.3 16.9 15.1 21.9 3.5 C16.1 12.3 10.2 17.2 3.4 18.9 Z
  512 app icon: paper field, coral margin rule at x=104, two faint ruled lines
    at y=316 / y=400, glyph at translate(60 44) scale(16.8).
"""

import os

from PIL import Image, ImageDraw

PAPER = (0xF7, 0xF4, 0xED)
INK = (0x1A, 0x1A, 0x2E)
CORAL = (0xE0, 0x61, 0x3E)

SS = 8  # supersample factor


def cubic(p0, p1, p2, p3, n=160):
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        out.append(
            (
                u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
            )
        )
    return out


def glyph_points():
    """The path flattened to a polygon, in 24-unit space."""
    a = (3.4, 18.9)
    b = (5.0, 21.0)
    pts = [a, b]
    pts += cubic(b, (11.0, 20.3), (16.9, 15.1), (21.9, 3.5))
    pts += cubic((21.9, 3.5), (16.1, 12.3), (10.2, 17.2), a)
    return pts


def blend(fg, bg, alpha):
    return tuple(round(f * alpha + b * (1 - alpha)) for f, b in zip(fg, bg))


def favicon(size):
    """Glyph full-bleed on the paper field — the 16x16 proof from the study."""
    n = size * SS
    img = Image.new("RGBA", (n, n), PAPER + (255,))
    d = ImageDraw.Draw(img)
    k = n / 24
    d.polygon([(x * k, y * k) for x, y in glyph_points()], fill=INK)
    return img.resize((size, size), Image.LANCZOS)


def app_icon(size):
    """Not the small mark enlarged: a page, mid-sentence."""
    n = size * SS
    img = Image.new("RGB", (n, n), PAPER)
    d = ImageDraw.Draw(img)
    k = n / 512
    rule = blend(INK, PAPER, 0.12)
    w = max(1, round(3 * k))
    d.line([(104 * k, 0), (104 * k, n)], fill=CORAL, width=w)
    for y in (316, 400):
        d.line([(0, y * k), (n, y * k)], fill=rule, width=w)
    # glyph: translate(60 44) scale(16.8), then into pixel space
    d.polygon(
        [((60 + x * 16.8) * k, (44 + y * 16.8) * k) for x, y in glyph_points()],
        fill=INK,
    )
    return img.resize((size, size), Image.LANCZOS)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

favicon(48).save(
    f"{ROOT}/app/favicon.ico",
    sizes=[(16, 16), (32, 32), (48, 48)],
)
app_icon(180).save(f"{ROOT}/app/apple-icon.png")
app_icon(192).save(f"{ROOT}/public/icon-192.png")
app_icon(512).save(f"{ROOT}/public/icon-512.png")
print("ok")
