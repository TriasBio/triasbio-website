#!/usr/bin/env python3
"""Favicons and app icons from the logo mark (public/logo.png). Owner: chrome.

The mark is a green rounded tile with the strand cut out of it (transparent).
Icons fill the strand with warm off-white so it reads on light and dark tab
bars alike. The source is only 200px, so both masks are upsampled and
re-sharpened before each downscale.

Writes into public/: favicon-16.png, favicon-32.png, favicon.ico (16/32/48),
apple-touch-icon.png (180, full-bleed, opaque), icon-192.png, icon-512.png,
site.webmanifest, and the header mark logo-56.png / logo-112.png (the logo as is,
strand still transparent, sized for a 28px mark at 2x and 4x).

Run: python3 scripts/gen-icons.py
"""
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
SRC = PUB / "logo.png"

GREEN = (77, 136, 104)      # the tile color sampled from logo.png (#4D8868)
STRAND = (244, 241, 234)    # site off-white (#F4F1EA)
NIGHT = "#07090f"           # page background at 00:00
HI = 2048                   # working resolution


def sharpen(mask):
    """Upsampled masks are soft; push them back to a crisp edge with a little anti-aliasing."""
    mask = mask.filter(ImageFilter.GaussianBlur(HI / 400))
    return mask.point(lambda v: max(0, min(255, int((v - 128) * 5 + 128))))


CORNER = 64  # the top-left 64x64 of the mark holds a clean tile corner (no strand)


def build_masks():
    """Tile and strand masks at working resolution.

    The tile's corners are a soft squircle, so the outline is rebuilt by mirroring the
    clean top-left corner into all four. The strand is whatever the tile covers that
    the mark leaves transparent; it runs off the top and bottom edges by design.
    """
    src = Image.open(SRC).convert("RGBA")
    alpha = src.split()[3]
    x0, y0, x1, y1 = alpha.getbbox()
    crop = alpha.crop((x0, y0, x1, y1))
    w, h = crop.size
    cpx = crop.load()

    tile_lo = Image.new("L", (w, h), 255)
    tpx = tile_lo.load()
    for y in range(h):
        dy = min(y, h - 1 - y)
        for x in range(w):
            dx = min(x, w - 1 - x)
            if dx < CORNER and dy < CORNER:
                tpx[x, y] = cpx[dx, dy]
    strand_lo = ImageChops.multiply(tile_lo, ImageChops.invert(crop))

    tile = sharpen(tile_lo.resize((HI, HI), Image.LANCZOS))
    strand = sharpen(strand_lo.resize((HI, HI), Image.LANCZOS))
    return tile, ImageChops.multiply(strand, tile)


def compose(tile, strand, size, full_bleed=False, pad=0.0):
    """Render one icon. full_bleed fills the square (for iOS, which masks its own corners)."""
    base = Image.new("RGBA", (HI, HI), (0, 0, 0, 0))
    green = Image.new("RGBA", (HI, HI), GREEN + (255,))
    white = Image.new("RGBA", (HI, HI), STRAND + (255,))
    shape = Image.new("L", (HI, HI), 255) if full_bleed else tile
    base.paste(green, (0, 0), shape)
    base.paste(white, (0, 0), strand)
    if pad:
        inner = round(HI * (1 - 2 * pad))
        canvas = Image.new("RGBA", (HI, HI), GREEN + (255,) if full_bleed else (0, 0, 0, 0))
        canvas.alpha_composite(base.resize((inner, inner), Image.LANCZOS), ((HI - inner) // 2, (HI - inner) // 2))
        base = canvas
    out = base.resize((size, size), Image.LANCZOS)
    if full_bleed:
        out = out.convert("RGB")
    return out


def main():
    tile, strand = build_masks()
    outputs = {
        "favicon-16.png": compose(tile, strand, 16),
        "favicon-32.png": compose(tile, strand, 32),
        "icon-192.png": compose(tile, strand, 192),
        "icon-512.png": compose(tile, strand, 512),
        "apple-touch-icon.png": compose(tile, strand, 180, full_bleed=True),
    }
    for name, im in outputs.items():
        im.save(PUB / name, optimize=True)
        print("wrote", name, im.size)

    ico48 = compose(tile, strand, 48)
    ico48.save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)],
               append_images=[outputs["favicon-16.png"], outputs["favicon-32.png"]])
    print("wrote favicon.ico")

    # Header mark: the 200px logo shrunk for a 28px slot (srcset in partials/header.html).
    src = Image.open(SRC).convert("RGBA")
    for size in (56, 112):
        name = f"logo-{size}.png"
        src.resize((size, size), Image.LANCZOS).save(PUB / name, optimize=True)
        print("wrote", name)

    manifest = {
        "name": "TriasBio",
        "short_name": "TriasBio",
        "description": "mRNA medicines that make their protein at the right hour.",
        "start_url": "/",
        "display": "browser",
        "background_color": NIGHT,
        "theme_color": NIGHT,
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }
    (PUB / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote site.webmanifest")


if __name__ == "__main__":
    main()
