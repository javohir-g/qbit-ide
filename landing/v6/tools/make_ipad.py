"""The qblock iPad loop for the dark page: the deck's frames (E:\\qbit_review\\cover_scene3d\\blocks\\ipad, RGBA)
kept on a transparent background -> assets/qblock_ipad.webp (animated, alpha) and assets/qblock_ipad_still.webp.
    py -3.14 make_ipad.py"""
import pathlib
from PIL import Image

SRC = pathlib.Path(r"E:/qbit_review/cover_scene3d/blocks/ipad")
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets"
files = sorted(SRC.glob("i_f*.png"))[:80]
frames = [Image.open(f).convert("RGBA") for f in files]
box = frames[0].getchannel("A").getbbox()                 # the device is the same in every frame: crop the empty margin once
frames = [f.crop(box) for f in frames]
path = OUT / "qblock_ipad.webp"
frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, quality=80, method=6, minimize_size=True)
still = OUT / "qblock_ipad_still.webp"
frames[-1].save(still, quality=86, method=6)              # last frame: the program is assembled, the RGB is green
back = Image.open(path)
print(path.name, back.size, back.mode, back.n_frames, "frames", path.stat().st_size // 1024, "KB;", still.name, still.stat().st_size // 1024, "KB")
