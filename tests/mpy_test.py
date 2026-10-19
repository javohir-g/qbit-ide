"""The board-side qbit module (ide/mpy/qbit.py) run on CPython with a fake `_qbit` backend:  python -I ide/tests/mpy_test.py
The programs below are the shape the block generator produces (see tests/ide.test.js)."""
import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mpy"))
import qbit  # noqa: E402


class Fake:
    """a board with a few modules; records every command, lets a test push events"""

    def __init__(self, modules):
        self.modules = dict(modules)
        self.values = {}
        self.log = []
        self.queue = []
        self.t0 = time.monotonic()

    def module(self, port):
        return self.modules.get(port)

    def get(self, port, name):
        return self.values.get((port, name), 0)

    def cmd(self, port, words):
        if words[0] == "blink" and words[1:] == ["-1"]:
            raise ValueError("period must be positive")
        self.log.append((port, words))

    def events(self):
        q, self.queue = self.queue, []
        return q

    def board_get(self, name):
        return {"battery": 80, "charging": 0, "usb": 1, "volts": 5.0, "amps": 0.2}[name]

    def board_cmd(self, words):
        self.log.append((0, words))

    def ms(self):
        return int((time.monotonic() - self.t0) * 1000)


def reset(fake):
    qbit._backend = fake
    del qbit._handlers[:]
    del qbit._starts[:]
    del qbit._tasks[:]


class QbitModule(unittest.TestCase):
    def test_blink(self):
        fake = Fake({1: "led"})
        reset(fake)

        async def main():
            qbit.led(1).on()
            await qbit.wait(0.05)
            qbit.led(1).off()
        qbit.start(main)
        qbit.run()
        self.assertEqual(fake.log, [(1, ["on"]), (1, ["off"])])

    def test_values_and_aliases(self):
        fake = Fake({1: "led", 2: "pot", 3: "button", 4: "relay"})
        fake.values = {(1, "brightness"): 40, (2, "value"): 73, (3, "pressed"): 1, (4, "on"): 1}
        reset(fake)
        self.assertEqual(qbit.led(1).level, 40)
        self.assertEqual(qbit.pot(2).value, 73)
        self.assertIs(qbit.button(3).pressed, True)
        self.assertIs(qbit.relay(4).is_on, True)
        self.assertEqual(qbit.board.battery, 80)
        self.assertIs(qbit.board.usb, True)

    def test_commands_become_words(self):
        fake = Fake({1: "led", 2: "rgb", 3: "oled"})
        reset(fake)
        qbit.led(1).brightness(50)
        qbit.led(1).blink(500, 3)
        qbit.rgb(2).color("red")
        qbit.rgb(2).color(255, 80, 0)
        qbit.oled(3).invert(True)
        qbit.oled(3).text(10, 20, "Привет")
        self.assertEqual([w for _, w in fake.log], [["brightness", "50"], ["blink", "500", "3"], ["color", "red"], ["color", "255", "80", "0"], ["invert", "on"], ["text", "10", "20", "Привет"]])

    def test_event_handler_gets_each_event_once_at_a_time(self):
        fake = Fake({1: "button", 2: "led"})
        reset(fake)
        seen = []

        async def pressed():
            seen.append("p")
            qbit.led(2).toggle()
            await qbit.wait(0.05)

        qbit.button(1).when("press", pressed)

        def poke():
            time.sleep(0.05)
            fake.queue.append((1, "press", 1, ""))
            time.sleep(0.01)
            fake.queue.append((1, "press", 1, ""))        # arrives while the first handler is still waiting: skipped
            time.sleep(0.15)
            fake.queue.append((1, "press", 1, ""))        # after it finished: runs again
            time.sleep(0.15)
            qbit.stop()
        threading.Thread(target=poke).start()
        qbit.run()
        self.assertEqual(seen, ["p", "p"])
        self.assertIn((2, ["toggle"]), fake.log)

    def test_event_argument_and_text(self):
        fake = Fake({1: "encoder", 2: "joystick"})
        reset(fake)
        got = []

        async def turned(delta):
            got.append(("turn", delta))

        async def direction(name):
            got.append(("dir", name))
        qbit.encoder(1).when("turn", turned)
        qbit.joystick(2).when("direction", direction)

        def poke():
            time.sleep(0.05)
            fake.queue.extend([(1, "turn", -2, ""), (2, "change", 3, "right")])
            time.sleep(0.1)
            qbit.stop()
        threading.Thread(target=poke).start()
        qbit.run()
        self.assertEqual(got, [("turn", -2), ("dir", "right")])

    def test_wrong_module_is_a_clear_error_and_outputs_are_made_safe(self):
        fake = Fake({1: "button", 2: "led"})
        reset(fake)

        async def main():
            qbit.led(2).on()
            qbit.led(1).on()                               # a button is on port 1
        qbit.start(main)
        with self.assertRaises(qbit.QbitError) as cm:
            qbit.run()
        self.assertIn("порту 1", str(cm.exception))
        self.assertIn((2, ["off"]), fake.log)               # the LED the program had switched on is switched off again

    def test_core_error_becomes_qbit_error(self):
        fake = Fake({1: "led"})
        reset(fake)
        with self.assertRaises(qbit.QbitError):
            qbit.led(1).blink(-1)

    def test_messages(self):
        fake = Fake({1: "led"})
        reset(fake)
        order = []

        async def on_go():
            order.append("go")

        async def main():
            order.append("before")
            qbit.send("go")
            await qbit.wait(0.03)
            order.append("after")
        qbit.on_message("go", on_go)
        qbit.start(main)

        def poke():
            time.sleep(0.15)
            qbit.stop()
        threading.Thread(target=poke).start()
        qbit.run()
        self.assertEqual(order, ["before", "go", "after"])

    def test_unknown_event_and_attribute(self):
        fake = Fake({1: "button"})
        reset(fake)
        with self.assertRaises(qbit.QbitError):
            qbit.button(1).when("push", print)
        with self.assertRaises(AttributeError):
            qbit.button(1).colour

    def test_helpers(self):
        self.assertEqual(qbit.constrain(120, 0, 100), 100)
        self.assertEqual(qbit.map(50, 0, 100, 0, 180), 90)


if __name__ == "__main__":
    unittest.main(verbosity=1)
