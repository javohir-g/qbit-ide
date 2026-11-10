"""Cutting mat texture for the hero: A2 (594 x 420 mm), 5 px/mm, the deck's blue, with ruler numbers along the LEFT and
BOTTOM edges every centimetre (the hero camera looks straight down at the mat's bottom-left corner, as on oryzo.ai).
Writes assets/3d/mat.webp.      py -3.14 make_mat.py"""
import pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "3d" / "mat.webp"
PX = 5
MW, MH, CELL, OFF = 594 * PX, 420 * PX, 10 * PX, 14 * PX
rng = np.random.default_rng(7)
FONT = "C:/Windows/Fonts/segoeui.ttf"

g = np.linspace(0, 1, MH)[:, None]
m = np.zeros((MH, MW, 3), np.float32)
for i, (c0, c1) in enumerate(zip((48, 96, 232), (38, 82, 218))):
    m[..., i] = c0 + (c1 - c0) * g
m += rng.normal(0, 2.0, (MH, MW, 1))
mat = Image.fromarray(np.clip(m, 0, 255).astype(np.uint8), "RGB")
d = ImageDraw.Draw(mat)
MINOR, MAJOR, FAINT, INK = (84, 126, 244), (146, 180, 255), (112, 152, 252), (206, 222, 255)

x0, x1, y0, y1 = OFF, MW - OFF, OFF, MH - OFF
nx, ny = (x1 - x0) // CELL, (y1 - y0) // CELL
x1, y1 = x0 + nx * CELL, y0 + ny * CELL
for k in range(nx + 1):
    x = x0 + k * CELL
    d.line([(x, y0), (x, y1)], fill=MAJOR if k % 5 == 0 else MINOR, width=4 if k % 5 == 0 else 2)
for k in range(ny + 1):
    y = y1 - k * CELL                                   # rows counted from the bottom, like the ruler
    d.line([(x0, y), (x1, y)], fill=MAJOR if k % 5 == 0 else MINOR, width=4 if k % 5 == 0 else 2)
span = min(nx, ny) * CELL
d.line([(x0, y1), (x0 + span, y1 - span)], fill=FAINT, width=2)
d.line([(x1, y1), (x1 - span, y1 - span)], fill=FAINT, width=2)
r = 15 * CELL
d.arc([x0 - r, y0 - r, x0 + r, y0 + r], 0, 90, fill=MAJOR, width=3)

# rulers: ticks every 2 mm, long ticks and numbers every centimetre
f = ImageFont.truetype(FONT, 21)
for mm in range(0, nx * 10 + 1, 2):                    # bottom edge, numbers read left to right
    x = x0 + mm * PX
    long = mm % 10 == 0
    d.line([(x, y1 + 6), (x, y1 + (22 if long else 12))], fill=INK, width=2)
    if long and mm:
        d.text((x, y1 + 26), str(mm // 10 * 10), font=f, fill=INK, anchor="mt")
for mm in range(0, ny * 10 + 1, 2):                    # left edge, numbers turned to read upwards
    y = y1 - mm * PX
    long = mm % 10 == 0
    d.line([(x0 - 6, y), (x0 - (22 if long else 12), y)], fill=INK, width=2)
    if long and mm:
        t = Image.new("RGBA", (80, 32), (0, 0, 0, 0))
        ImageDraw.Draw(t).text((40, 16), str(mm // 10 * 10), font=f, fill=INK + (255,), anchor="mm")
        t = t.rotate(90, expand=True)
        mat.paste(t, (x0 - 26 - t.width, y - t.height // 2), t)
d.text((x1, y0 - 14), "q.bit  ·  A2  ·  cm", font=ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 24), fill=INK, anchor="rb")
mat.save(OUT, quality=82, method=6)
print(OUT.name, mat.size, OUT.stat().st_size // 1024, "KB")
