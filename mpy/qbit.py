"""qbit: the module a q.bit program imports.  Runs on the board (MicroPython + uasyncio) and on a computer (CPython + asyncio).

It is the board-side twin of ide/js/runtime/runtime.js: the block editor produces Python that calls this module, the simulator
runs that Python with the JavaScript twin, the board runs it with this file. Both read the same contract table (qbit_spec.py,
generated from ide/js/runtime/spec.js), so the names cannot drift apart.

What this module needs from the firmware is the native module `_qbit` (a thin binding over firmware/qbit_core, see docs/PROTOCOL.md):

    _qbit.module(port)            -> driver key on the port ("led") or None
    _qbit.get(port, name)         -> the value `name` of the module on the port (number, or str for text values)
    _qbit.cmd(port, words)        -> run a driver command, words is a list of str: ["brightness", "50"]. Raises ValueError("why")
    _qbit.events()                -> list of (port, kind, value, text) since the last call; port 0 = the board (kind "key")
    _qbit.board_get(name)         -> "battery" | "charging" | "usb" | "volts" | "amps"
    _qbit.board_cmd(words)        -> ["led", "green"] | ["led_off"]
    _qbit.ms()                    -> milliseconds, monotonic

Tests (tests/mpy.test.js) replace `_qbit` by a fake: set qbit._backend = fake.
"""
try:
    import uasyncio as asyncio
    _MICRO = True
except ImportError:
    import asyncio
    _MICRO = False
import sys
import time

from qbit_spec import MODULES, BOARD, SAFE

version = "0.1"

try:
    import _qbit as _native
except ImportError:
    _native = None
_backend = None


class QbitError(Exception):
    pass


def _be():
    b = _backend if _backend is not None else _native
    if b is None:
        raise QbitError("this is not a q.bit board: no _qbit module")
    return b


# ------------------------------------------------------------------------------------------------ values and commands
def _words(name, args):
    out = [name]
    for a in args:
        if a is None:
            continue
        if a is True:
            out.append("on")
        elif a is False:
            out.append("off")
        elif isinstance(a, float):
            out.append(str(int(a)) if a == int(a) else str(round(a, 4)))
        else:
            out.append(str(a))
    return out


def _typed(kind, raw):
    if kind == "bool":
        return bool(raw)
    if kind == "int":
        return int(round(raw))
    if kind == "text":
        return str(raw) if raw is not None else ""
    return raw


def _call(fn, *args):
    try:
        return fn(*args)
    except ValueError as e:               # the core says no: a plain, readable message
        raise QbitError(str(e))


_handlers = []        # [port, key, (kind, value, text, arg), fn, task]
_starts = []
_tasks = []
_state = {"stop": False, "running": False, "t0": 0}


class _Thing:
    """what qbit.led(1), qbit.button(2) ... return, and qbit.board"""

    def __init__(self, key, port, spec):
        self._key, self._port, self._spec = key, port, spec

    def _check(self):
        if self._key == "board":
            return
        have = _call(_be().module, self._port)
        if have is None:
            raise QbitError("на порту %d нет модуля: поставьте «%s»" % (self._port, self._spec["title"]))
        if have != self._key:
            raise QbitError("на порту %d стоит другой модуль (%s), а программа ждёт «%s»" % (self._port, have, self._spec["title"]))

    def __getattr__(self, name):
        spec = self._spec
        if name == "when":
            return self._when
        v = spec["values"].get(name)
        if v is not None:
            if self._key == "board":
                return _typed(v[1], _call(_be().board_get, v[0]))
            self._check()
            return _typed(v[1], _call(_be().get, self._port, v[0]))
        if name in spec["commands"]:
            def command(*args):
                if self._key == "board":
                    _call(_be().board_cmd, _words(name, args))
                else:
                    self._check()
                    _call(_be().cmd, self._port, _words(name, args))
            return command
        raise AttributeError("«%s» нет «%s»" % (spec["title"], name))

    def _when(self, event, fn):
        ev = self._spec["events"].get(event)
        if ev is None:
            raise QbitError("у «%s» нет события «%s». Есть: %s" % (self._spec["title"], event, ", ".join(sorted(self._spec["events"]))))
        _handlers.append([self._port if self._key != "board" else 0, self._key, ev, fn, None])


def _factory(key):
    spec = MODULES[key]
    cache = {}

    def make(port):
        if not isinstance(port, int) or not 1 <= port <= 8:
            raise QbitError("qbit.%s(порт): порт — число от 1 до 8" % key)
        t = cache.get(port)
        if t is None:
            t = cache[port] = _Thing(key, port, spec)
        return t
    return make


for _key in MODULES:
    globals()[_key] = _factory(_key)
board = _Thing("board", 0, BOARD)


class _Port:
    def __init__(self, n):
        self.n = n

    @property
    def module(self):
        return _call(_be().module, self.n)

    def value(self, name):
        k = self.module
        if k is None:
            raise QbitError("на порту %d нет модуля" % self.n)
        for pyname, (fw, kind) in MODULES[k]["values"].items():
            if pyname == name or fw == name:
                return _typed(kind, _call(_be().get, self.n, fw))
        raise QbitError("у «%s» нет значения «%s»" % (MODULES[k]["title"], name))

    def cmd(self, *words):
        _call(_be().cmd, self.n, _words(str(words[0]), words[1:]))


def port(n):
    if not 1 <= n <= 8:
        raise QbitError("порты считаются с 1 до 8")
    return _Port(n)


def find(key, nth=0):
    for n in range(1, 9):
        if _call(_be().module, n) == key:
            if nth == 0:
                return n
            nth -= 1
    return 0


# ------------------------------------------------------------------------------------------------ time and flow
def wait(seconds):
    return asyncio.sleep(seconds)


def wait_ms(ms):
    return asyncio.sleep(ms / 1000)


def tick():
    return asyncio.sleep(0)


def millis():
    return _be().ms() - _state["t0"]


def seconds():
    return round(millis() / 1000, 3)


def constrain(x, a, b):
    return a if x < a else b if x > b else x


def map(x, a, b, c, d):
    return c + (x - a) * (d - c) / (b - a)


def log(*args):
    print(*args)


def start(fn, *args):
    _starts.append((fn, args))


def on_message(name, fn):
    _handlers.append([-1, "msg", ("message", None, str(name), None), fn, None])


def send(name):
    for h in list(_handlers):
        if h[1] == "msg" and h[2][2] == str(name):
            _launch(h, None)


def stop():
    _state["stop"] = True


def run():
    """Start the program: the event loop runs until nothing is left to do (or qbit.stop(), or an error)."""
    asyncio.run(_main())


# ------------------------------------------------------------------------------------------------ the event loop
def _is_coro(r):
    return hasattr(r, "send") and hasattr(r, "throw")


async def _guard(coro):
    try:
        await coro
    except asyncio.CancelledError:
        raise
    except Exception as e:                      # a program error ends the program, like in the simulator
        _state["stop"] = True
        _state["error"] = e
        if _MICRO:
            sys.print_exception(e)
        else:
            import traceback
            traceback.print_exc()


def _spawn(coro):
    t = asyncio.create_task(_guard(coro))
    _tasks.append(t)
    return t


def _done(t):
    if _MICRO:
        return t.done()
    return t.done()


def _launch(h, arg):
    if h[4] is not None and not _done(h[4]):    # the previous run of this handler is still going: skip the new event
        return
    try:
        r = h[3]() if arg is None else h[3](arg)
    except TypeError:
        r = h[3]()
    if _is_coro(r):
        h[4] = _spawn(r)


def _dispatch(port, kind, value, text):
    for h in list(_handlers):
        if h[0] != port:
            continue
        _kind, _value, _text, _arg = h[2]
        if _kind != kind or (_value is not None and _value != value) or (_text is not None and _text != text):
            continue
        _launch(h, text if _arg == "text" else value if _arg == "value" else None)


def _safe_state():
    for n in range(1, 9):
        try:
            k = _be().module(n)
            if k in SAFE:
                _be().cmd(n, [SAFE[k]])
        except Exception:
            pass


async def _main():
    _state["stop"] = False
    _state["error"] = None
    _state["t0"] = _be().ms()
    del _tasks[:]
    for fn, args in _starts:
        _spawn(fn(*args))
    del _starts[:]
    try:
        while not _state["stop"]:
            for ev in _be().events():
                _dispatch(*ev)
            live = [t for t in _tasks if not _done(t)]
            _tasks[:] = live
            if not live and not _handlers:
                break
            await asyncio.sleep(0.004)
    finally:
        for t in _tasks:
            if not _done(t):
                t.cancel()
        await asyncio.sleep(0)
        if _state["stop"]:
            _safe_state()
        del _handlers[:]
    if _state["error"] is not None:
        raise _state["error"]
