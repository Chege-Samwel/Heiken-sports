#!/usr/bin/env python3
"""Generate Android launcher icons + TV banner PNGs for the StreamSports99 app.

Pure stdlib (zlib/struct) — no dependencies. Run from the repo root:

    python3 scripts/make_icons.py

Outputs:
  android/app/src/main/res/mipmap-*/ic_launcher.png   (48/72/96/144/192)
  android/app/src/main/res/drawable/tv_banner.png     (320x180, required for TV)
"""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.normpath(os.path.join(HERE, "..", "android", "app", "src", "main", "res"))

# --- 5x7 pixel font (rows are 5-bit ints, MSB = leftmost pixel) -------------
FONT = {
    "A": [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "C": [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
    "D": [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
    "E": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
    "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    "H": [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "I": [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
    "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    "R": [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    "S": [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E],
    "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    "V": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    "-": [0x00, 0x00, 0x00, 0x0E, 0x00, 0x00, 0x00],
    " ": [0, 0, 0, 0, 0, 0, 0],
}

GREEN = (34, 197, 94)     # #22c55e
TEAL = (13, 148, 136)     # #0d9488
DARK = (7, 11, 18)        # #070b12
WHITE = (255, 255, 255)
MIST = (154, 168, 189)    # #9aa8bd


def clamp(v):
    return max(0, min(255, int(v)))


def lerp(a, b, t):
    return tuple(clamp(a[i] + (b[i] - a[i]) * t) for i in range(3))


def write_png(path, w, h, pixels):
    """pixels: list of rows, each a list of (r, g, b, a)."""
    raw = b""
    for row in pixels:
        line = bytearray()
        for (r, g, b, a) in row:
            line += bytes((r, g, b, a))
        raw += b"\x00" + bytes(line)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, "(%dx%d, %d bytes)" % (w, h, len(png)))


def rounded_gradient_bg(w, h, radius):
    """Vertical green->teal gradient with rounded corners, per-pixel alpha."""
    rows = []
    for y in range(h):
        row = []
        for x in range(w):
            col = lerp(GREEN, TEAL, (x / max(1, w - 1) + y / max(1, h - 1)) / 2)
            alpha = 255
            # rounded corner test
            r = radius
            cx = min(max(x, r), w - 1 - r)
            cy = min(max(y, r), h - 1 - r)
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy > r * r:
                alpha = 0
            row.append((col[0], col[1], col[2], alpha))
        rows.append(row)
    return rows


def draw_play_triangle(rows, x0, y0, x1, y1, color=WHITE):
    """Right-pointing triangle inside the bbox (x0,y0)-(x1,y1)."""
    h = y1 - y0
    w = x1 - x0
    for y in range(y0, y1):
        t = (y - y0) / max(1, h - 1)          # 0..1 top->bottom
        half = (w - 1) * (1 - abs(2 * t - 1))  # triangle half-width
        mid = x0 + w / 2
        for x in range(x0, x1):
            if abs(x - mid) <= half:
                rows[y][x] = color + (255,)


def draw_text(rows, text, x, y, scale, color=WHITE):
    cx = x
    for ch in text:
        glyph = FONT.get(ch.upper())
        if glyph is None:
            cx += 6 * scale
            continue
        for gy in range(7):
            bits = glyph[gy]
            for gx in range(5):
                if bits & (1 << (4 - gx)):
                    for sy in range(scale):
                        for sx in range(scale):
                            yy, xx = y + gy * scale + sy, cx + gx * scale + sx
                            if 0 <= yy < len(rows) and 0 <= xx < len(rows[0]):
                                rows[yy][xx] = color + (255,)
        cx += 5 * scale + 1  # 5*scale glyph + 1px gap
    return cx


def make_launcher(size):
    rows = rounded_gradient_bg(size, size, size // 5)
    # white play triangle, inset ~28%
    m = int(size * 0.28)
    draw_play_triangle(rows, m, m, size - m, size - m)
    write_png(os.path.join(RES, "mipmap-%s" % DPI[size], "ic_launcher.png"), size, size, rows)


def make_banner():
    w, h = 320, 180
    rows = rounded_gradient_bg(w, h, 0)  # TV banners must be square-cornered
    # dark left panel with the brand play triangle
    for y in range(h):
        for x in range(96):
            rows[y][x] = DARK + (255,)
    draw_play_triangle(rows, 28, 60, 88, 120, color=GREEN)
    # app name (two lines, scale 4) + tagline (scale 2) — all fit in 320px
    draw_text(rows, "STREAM", 108, 40, 4, WHITE)      # 6*21 = 126px -> ends 234
    draw_text(rows, "SPORTS 99", 108, 78, 4, WHITE)   # 9*21 = 189px -> ends 297
    draw_text(rows, "LIVE SPORTS - API", 108, 120, 2, MIST)  # 17*11 = 187px -> ends 295
    write_png(os.path.join(RES, "drawable", "tv_banner.png"), w, h, rows)


DPI = {48: "mdpi", 72: "hdpi", 96: "xhdpi", 144: "xxhdpi", 192: "xxxhdpi"}

if __name__ == "__main__":
    for s in (48, 72, 96, 144, 192):
        make_launcher(s)
    make_banner()
    print("done.")
