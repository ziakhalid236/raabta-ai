from __future__ import annotations

from pathlib import Path
import math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "images"
SCALE = 3
TEAL = (15, 118, 110, 255)
PAPER = (247, 247, 243, 255)
SAGE = (231, 241, 238, 255)

# Cubic curves make the two linked conversation arcs scale cleanly with the brand.
CURVES = [
    [(655, 260), (585, 213), (495, 185), (405, 185)],
    [(405, 185), (268, 185), (164, 286), (164, 420)],
    [(164, 420), (164, 553), (265, 651), (402, 651)],
    [(367, 790), (425, 833), (493, 856), (570, 856)],
    [(570, 856), (706, 856), (810, 755), (810, 620)],
    [(810, 620), (810, 485), (706, 386), (570, 386)],
]
BRIDGE = [(340, 622), (414, 565), (556, 476), (670, 418)]


def cubic(points: list[tuple[int, int]], t: float) -> tuple[float, float]:
    u = 1.0 - t
    return (
        u**3 * points[0][0] + 3 * u**2 * t * points[1][0] + 3 * u * t**2 * points[2][0] + t**3 * points[3][0],
        u**3 * points[0][1] + 3 * u**2 * t * points[1][1] + 3 * u * t**2 * points[2][1] + t**3 * points[3][1],
    )


def draw_mark(size: int, color: tuple[int, int, int, int], transparent: bool, bg: tuple[int, int, int, int] = PAPER) -> Image.Image:
    hi = size * SCALE
    image = Image.new("RGBA", (hi, hi), (0, 0, 0, 0) if transparent else bg)
    draw = ImageDraw.Draw(image)

    # Mark occupies a centered, launcher-safe 66% area. Supersampling keeps every curve smooth.
    margin = size * 0.17
    available = size - 2 * margin
    factor = available / 646.0
    left = (size - available) / 2.0
    top = (size - available) / 2.0
    # The designed mark bounds are x=164..810 and y=185..856; center those bounds in the safe area.
    x_shift = (646.0 - (810 - 164)) / 2.0 - 164
    y_shift = (646.0 - (856 - 185)) / 2.0 - 185

    def xy(point: tuple[float, float]) -> tuple[int, int]:
        x = left + (point[0] + x_shift) * factor
        y = top + (point[1] + y_shift) * factor
        return round(x * SCALE), round(y * SCALE)

    stroke = max(1, round(size * 0.072 * SCALE))
    for curve in CURVES:
        points = [xy(cubic(curve, i / 120)) for i in range(121)]
        draw.line(points, fill=color, width=stroke, joint="curve")
        radius = stroke // 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    bridge_points = [xy(cubic(BRIDGE, i / 120)) for i in range(121)]
    draw.line(bridge_points, fill=color, width=stroke, joint="curve")
    radius = stroke // 2
    for x, y in (bridge_points[0], bridge_points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    draw_mark(1024, TEAL, False, SAGE).save(ASSETS / "icon.png", optimize=True)
    draw_mark(1024, TEAL, True).save(ASSETS / "android-icon-foreground.png", optimize=True)
    Image.new("RGBA", (512, 512), SAGE).save(ASSETS / "android-icon-background.png", optimize=True)
    draw_mark(432, (255, 255, 255, 255), True).save(ASSETS / "android-icon-monochrome.png", optimize=True)
    draw_mark(1024, TEAL, False, PAPER).save(ASSETS / "splash-icon.png", optimize=True)
    draw_mark(48, TEAL, False, SAGE).save(ASSETS / "favicon.png", optimize=True)

    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#E7F1EE"/>
  <g fill="none" stroke="#0F766E" stroke-width="64" stroke-linecap="round" stroke-linejoin="round">
    <path d="M655 260 C585 213 495 185 405 185 C268 185 164 286 164 420 C164 553 265 651 402 651"/>
    <path d="M367 790 C425 833 493 856 570 856 C706 856 810 755 810 620 C810 485 706 386 570 386"/>
    <path d="M340 622 C414 565 556 476 670 418"/>
  </g>
</svg>'''
    (ASSETS / "raabta-mark.svg").write_text(svg, encoding="utf-8")
    print("Generated Raabta brand assets:")
    for name in ("icon.png", "android-icon-foreground.png", "android-icon-background.png", "android-icon-monochrome.png", "splash-icon.png", "favicon.png", "raabta-mark.svg"):
        path = ASSETS / name
        print(f"- {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
