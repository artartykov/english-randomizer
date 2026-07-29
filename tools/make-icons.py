#!/usr/bin/env python3
"""Generates the PWA icons in html/icons/ with no third-party dependencies.

The mark is a rounded square holding three stacked bars of different widths,
echoing the list of words the app produces. Everything is rendered at 4x and
box-filtered down, which is what gives the edges their anti-aliasing.

Usage: python3 tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

SCALE = 4  # Supersampling factor used for anti-aliasing.

BACKGROUND_TOP = (99, 102, 241)  # Indigo, matches --accent in styles.css.
BACKGROUND_BOTTOM = (139, 92, 246)  # Violet.
BAR_COLOR = (255, 255, 255)

# Bar widths as a fraction of the content box, top to bottom.
BAR_WIDTHS = (1.0, 0.68, 0.86)


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_rect_coverage(x, y, left, top, right, bottom, radius):
    """Returns True when the pixel centre falls inside a rounded rectangle."""
    if x < left or x > right or y < top or y > bottom:
        return False
    # Clamp the point into the inner rectangle; whatever is left over is the
    # offset into a corner, which only counts if it fits inside the radius.
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= radius * radius


def render(size, content_ratio):
    """Renders one icon.

    content_ratio shrinks the bars towards the centre so that maskable icons
    keep their content inside the safe zone platforms may crop to.
    """
    big = size * SCALE
    corner = big * 0.22

    content = big * content_ratio
    margin = (big - content) / 2
    bar_height = content * 0.16
    gap = (content - 3 * bar_height) / 2
    bar_radius = bar_height / 2

    bars = []
    for index, width_ratio in enumerate(BAR_WIDTHS):
        top = margin + index * (bar_height + gap)
        bars.append((margin, top, margin + content * width_ratio, top + bar_height))

    # Render the supersampled image one row at a time, accumulating into the
    # final buffer so the whole 4x bitmap never has to be held in memory.
    pixels = bytearray(size * size * 4)
    accumulator = [[0, 0, 0, 0] for _ in range(size)]
    samples = SCALE * SCALE

    for by in range(big):
        out_y = by // SCALE
        t = by / (big - 1)
        bg = tuple(int(lerp(BACKGROUND_TOP[i], BACKGROUND_BOTTOM[i], t)) for i in range(3))

        for bx in range(big):
            px, py = bx + 0.5, by + 0.5
            if not rounded_rect_coverage(px, py, 0, 0, big, big, corner):
                continue

            color = bg
            for left, top, right, bottom in bars:
                if rounded_rect_coverage(px, py, left, top, right, bottom, bar_radius):
                    color = BAR_COLOR
                    break

            cell = accumulator[bx // SCALE]
            cell[0] += color[0]
            cell[1] += color[1]
            cell[2] += color[2]
            cell[3] += 255

        if by % SCALE == SCALE - 1:
            base = out_y * size * 4
            for x, cell in enumerate(accumulator):
                alpha = cell[3] // samples
                offset = base + x * 4
                if alpha:
                    # Un-premultiply so partially covered edge pixels keep the
                    # colour of the shape rather than fading towards black.
                    weight = cell[3] / 255
                    pixels[offset] = int(cell[0] / weight)
                    pixels[offset + 1] = int(cell[1] / weight)
                    pixels[offset + 2] = int(cell[2] / weight)
                pixels[offset + 3] = alpha
                cell[0] = cell[1] = cell[2] = cell[3] = 0

    return bytes(pixels)


def write_png(path, size, pixels):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # Filter type 0 (None).
        raw.extend(pixels[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"Wrote {path} ({len(png)} bytes)")


def main():
    icons_dir = Path(__file__).resolve().parent.parent / "html" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        write_png(icons_dir / f"icon-{size}.png", size, render(size, 0.56))

    # Maskable icons may be cropped to a circle, so the bars sit further in.
    write_png(icons_dir / "icon-maskable-512.png", 512, render(512, 0.42))
    write_png(icons_dir / "favicon-64.png", 64, render(64, 0.60))


if __name__ == "__main__":
    main()
