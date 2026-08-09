#!/usr/bin/env python3
"""
Regenerate the site icon set from the brand logo.

    python3 scripts/generate-icons.py

The logo is white line art on a transparent background. Left transparent, it
disappears against the white cards that Google, Brave, and browser bookmark bars
draw behind a favicon — so every icon here is flattened onto the brand near-black
first. Run this after changing public/werewolf-ai-logo-2.png.

Outputs (Next.js App Router file conventions pick these up automatically):
    app/favicon.ico     16/32/48 — /favicon.ico, what search crawlers fetch
    app/icon.png        192x192  — <link rel="icon">; 192 is 48x4, which is what
                                   Google asks for (a multiple of 48px square)
    app/apple-icon.png  180x180  — <link rel="apple-touch-icon">, must be opaque

Requires Pillow (pip install Pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "werewolf-ai-logo-2.png"

# Brand near-black, lifted slightly off pure black so the icon still reads as a
# shape (not a void) on a dark browser chrome.
BG = (13, 16, 22, 255)
# Breathing room inside the square. Search engines and mobile launchers often mask
# icons into a circle, and this keeps the emblem clear of the crop.
PAD = 0.06


def squared_logo() -> Image.Image:
    """Trim the logo's transparent margin and pad it back to a centered square."""
    logo = Image.open(LOGO).convert("RGBA")
    trimmed = logo.crop(logo.getchannel("A").getbbox())
    side = max(trimmed.size)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(trimmed, ((side - trimmed.width) // 2, (side - trimmed.height) // 2))
    return out


def render(logo: Image.Image, size: int, circular: bool = True) -> Image.Image:
    """
    One icon at `size`: the logo flattened onto the brand near-black.

    Circular by default, because the logo is itself a circular emblem — on a square
    backing the dark corners read as stray padding around the ring. The disc is cut
    from a 4x-supersampled mask so the edge stays smooth at 16px, where a directly
    drawn ellipse aliases into visible steps.

    `circular=False` keeps the full square, which Apple touch icons require: iOS
    composites them with no alpha handling (transparency comes out black) and applies
    its own rounded-rect mask.
    """
    canvas = Image.new("RGBA", (size, size), BG)
    inner = int(size * (1 - 2 * PAD))
    canvas.alpha_composite(logo.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2,) * 2)

    if circular:
        ss = 4
        mask = Image.new("L", (size * ss, size * ss), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
        canvas.putalpha(mask.resize((size, size), Image.LANCZOS))

    return canvas


def main() -> None:
    logo = squared_logo()
    app = ROOT / "app"

    # A single high-res source; save_all writes each size as its own ico frame so
    # browsers pick the one they need instead of downscaling 256px in a tab strip.
    base = render(logo, 256)
    base.save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    render(logo, 192).save(app / "icon.png")
    # Square on purpose — see render(): iOS renders transparency black and rounds the
    # corners itself, so a pre-rounded apple-icon would show black notches.
    render(logo, 180, circular=False).save(app / "apple-icon.png")

    for name in ("favicon.ico", "icon.png", "apple-icon.png"):
        print(f"wrote app/{name}")


if __name__ == "__main__":
    main()
