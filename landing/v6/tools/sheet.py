"""Contact sheets from the screenshots of shots.js: <dir>/_sheet_N.jpg, each frame labelled with its file name.
    py -3.14 sheet.py <dir> [cols=2] [rows=3] [cell_width=960]"""
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1]
cols, rows, cw = (int(sys.argv[i]) if len(sys.argv) > i else v for i, v in ((2, 2), (3, 3), (4, 960)))
files = sorted(f for f in glob.glob(os.path.join(d, "*.jpg")) if not os.path.basename(f).startswith("_"))
for old in glob.glob(os.path.join(d, "_sheet_*.jpg")):
    os.remove(old)
font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 20)
per = cols * rows
for k in range(0, len(files), per):
    part = files[k:k + per]
    ims = [Image.open(f).convert("RGB") for f in part]
    ch = max(round(im.height * cw / im.width) for im in ims)
    LH = 26                                              # label strip under every frame
    sheet = Image.new("RGB", (cols * cw + (cols - 1) * 6, -(-len(part) // cols) * (ch + LH)), (255, 0, 160))
    dr = ImageDraw.Draw(sheet)
    for i, (f, im) in enumerate(zip(part, ims)):
        x, y = (i % cols) * (cw + 6), (i // cols) * (ch + LH)
        sheet.paste(im.resize((cw, round(im.height * cw / im.width)), Image.LANCZOS), (x, y))
        dr.text((x + 8, y + ch + 3), os.path.basename(f)[:-4], font=font, fill=(255, 255, 255))
    out = os.path.join(d, f"_sheet_{k // per}.jpg")
    sheet.save(out, quality=88)
    print(out, sheet.size, len(part))
