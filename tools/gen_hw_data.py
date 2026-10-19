#!/usr/bin/env python3
"""
Builds ide/js/data/hw-data.js - the hardware facts the simulator is built on - from the project's
own sources of truth, so the digital twin never drifts from the real design:

  modules/catalog.py            module types: ID, key, name, 30/65 mm, interface, I2C address, kit
  modules/passports/*.bin       the real 256-byte EEPROM images (passport.py output)
  modules/tools/kit_panel.py    PANELS: which modules each kit ships (-> inventory)
  qbit_main_revA/docs/revB/     board geometry (numbers are copied from enclosure_revB.svg, see BOARD)

    python ide/tools/gen_hw_data.py
"""
import ast
import datetime
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
IDE = os.path.dirname(HERE)
ROOT = os.path.dirname(IDE)
MODS = os.path.join(ROOT, "modules")
OUT = os.path.join(IDE, "js", "data", "hw-data.js")

sys.stdout.reconfigure(encoding="utf-8")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


sys.path.insert(0, MODS)
catalog = load("catalog", os.path.join(MODS, "catalog.py"))
passport = load("passport", os.path.join(MODS, "tools", "passport.py"))
catalog.check()

# ---------------------------------------------------------------- board geometry (mm)
# Board coordinates: origin = top-left corner of the PCB, x right, y down, USB-C edge = top.
# Source: qbit_main_revA/docs/revB/enclosure_revB.svg (generated from the Rev B PCB).
BOARD = {
    "w": 155.0, "h": 85.0, "r": 14.0,
    "ports": [{"n": n + 1, "x": 25.0 + 35.0 * (n % 4), "y": 25.0 + 35.0 * (n // 4)} for n in range(8)],
    "pitch": 35.0,
    "pocket": {"w": 30.0, "h": 30.0, "r": 4.0},            # lid pocket per port
    "window": {"w": 22.4, "h": 4.3},                       # pogo connector window (stadium)
    "pins": ["5V", "GND", "SIG", "SDA", "SCL"],            # J1..J8 pin order, left to right (top view)
    "pinPitch": 2.54,
    "magnetDx": 10.04,                                     # magnets at x = C -+ 10.04, N left, S right
    "holes": [[7.0, 7.0], [148.0, 7.0], [7.0, 78.0], [148.0, 78.0]],     # H1..H4 M2.5
    "usb": {"x": 77.5},
    "reset": {"x": 67.7}, "boot": {"x": 87.3},
    "pwrLed": {"x": 67.7, "y": 6.4}, "statusLed": {"x": 87.3, "y": 6.4},
    "pair": {"x": 149.0, "y": 64.0, "d": 4.0},
    "battery": {"x": 45.5, "y": 14.0, "w": 95.0, "h": 70.0},
    "antenna": {"x": 90.25, "y": -1.9, "w": 48.09, "h": 14.9},
    "moduleSize": {"30": [29.6, 29.6], "65": [64.6, 29.6]},
    "moduleHoleInset": 3.2,
}

IFACE_NAMES = {0: "-", 1: "DI", 2: "DO", 3: "AI", 4: "I2C", 5: "MCU"}


def kit_panels():
    """PANELS literal from kit_panel.py (that file imports pcbnew, so it is parsed, not imported)."""
    tree = ast.parse(open(os.path.join(MODS, "tools", "kit_panel.py"), encoding="utf-8").read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "PANELS" for t in node.targets):
            return ast.literal_eval(node.value)
    raise SystemExit("PANELS not found in kit_panel.py")


def main():
    pdir = os.path.join(MODS, "passports")
    passports = {}
    for fn in sorted(os.listdir(pdir)):
        if fn.endswith(".bin"):
            raw = open(os.path.join(pdir, fn), "rb").read()
            info = passport.decode(raw)
            if not (info["magic_ok"] and info["crc_ok"]):
                raise SystemExit(f"{fn}: bad passport image ({info})")
            passports[fn[:-4]] = raw.hex()

    modules = []
    for (mid, key, name, fmt, io_, part, addr, kit, note) in catalog.MODULES:
        names = [n for n in passports if n == key or n.startswith(key + "_")]
        # "led" -> led_white / led_red ...; a key never matches another key's prefix by accident
        names = [n for n in names if n == key or n[len(key) + 1:] in passport.VARIANTS.get(key, {})]
        variants = [n[len(key) + 1:] for n in names if n != key]
        if not names:
            raise SystemExit(f"no passport image for {key}")
        modules.append({
            "id": mid, "key": key, "name": name, "fmt": int(fmt), "io": io_, "part": part,
            "addr": int(addr, 16) if addr else 0, "kit": kit, "note": note, "cat": mid >> 8,
            "variants": variants,                       # shipped colours: [] or e.g. ["white", "red", "yellow", "green"]
            "variantIndex": dict(passport.VARIANTS.get(key, {})),     # every colour the passport format knows (adds blue)
        })

    # what a kit contains: every kit also holds the lower ones (catalog.py: "каждый следующий дополняет")
    panels = kit_panels()
    per_kit = {1: {}, 2: {}, 3: {}, 4: {}}
    for name, rows in panels.items():
        kit = {"S": 1, "B": 2, "A": 3, "P": 4}[name[0]]
        for row in rows:
            for key in row:
                per_kit[kit][key] = per_kit[kit].get(key, 0) + 1
    inventory, acc = {}, {}
    for kit in (1, 2, 3, 4):
        for key, n in per_kit[kit].items():
            acc[key] = acc.get(key, 0) + n
        inventory[kit] = dict(acc)

    data = {
        "generated": datetime.date.today().isoformat(),
        "categories": {str(k): v for k, v in catalog.CATEGORIES.items()},
        "kits": {str(k): v.split(" - ")[1] for k, v in catalog.STAGE_NAMES.items()},
        "removedIds": [m[0] for m in catalog.REMOVED],
        "ifaceNames": {str(k): v for k, v in IFACE_NAMES.items()},
        "modules": modules,
        "passports": passports,
        "inventory": {str(k): v for k, v in inventory.items()},
        "panels": panels,
        "board": BOARD,
    }
    body = json.dumps(data, ensure_ascii=False, indent=1)
    js = ("/* GENERATED by ide/tools/gen_hw_data.py from modules/catalog.py, modules/passports/*.bin and "
          "modules/tools/kit_panel.py - do not edit by hand. */\n"
          "(function (G) {\n  'use strict';\n  var Q = G.QBIT = G.QBIT || {};\n  Q.DATA = " +
          body.replace("\n", "\n  ") + ";\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    print(f"{len(modules)} modules, {len(passports)} passport images, {sum(len(v) for v in panels.values())} panels "
          f"-> {os.path.relpath(OUT, ROOT)} ({len(js) // 1024} KB)")
    print("inventory by kit:", {k: sum(v.values()) for k, v in inventory.items()})


if __name__ == "__main__":
    main()
