/* Input modules: what a person (or the room) does to them, and what appears on SIG.
   Electrical facts are from modules/specs/*.py (resistor values, pull-ups, which level means what). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, M = Q.mod;

  var HI = 3270;      // 3.3 V through a 1k into a 100k pull-down: 3.27 V

  /* ---------------------------------------------------------------- button: pressed = HIGH */
  Q.defineModule('button', {
    state: function () { return { pressed: false }; },
    sigOut: function (m) { return m.state.pressed ? HI : 0; },
    currentMa: function () { return 3; },
    controls: [{ type: 'hold', id: 'pressed', label: T('Нажать кнопку') }],
    readouts: function (m) { return [{ label: T('Кнопка'), value: m.state.pressed ? T('нажата') : T('отпущена') }]; },
    api: function (m, port) {
      var latch = false;
      M.edgeEvents(m, port, 'press', 'release');
      port.sig.on('edge', function (v) { if (v) latch = true; });
      return {
        isPressed: function () { return port.sig.read() === 1; },
        wasPressed: function () { var r = latch; latch = false; return r; },
        on: M.onApi(m)                       // 'press', 'release'
      };
    }
  });

  /* ---------------------------------------------------------------- touch: HIGH while touched */
  Q.defineModule('touch', {
    state: function () { return { touched: false }; },
    sigOut: function (m) { return m.state.touched ? HI : 0; },
    currentMa: function () { return 3; },
    controls: [{ type: 'hold', id: 'touched', label: T('Коснуться пальцем') }],
    readouts: function (m) { return [{ label: T('Касание'), value: m.state.touched ? T('есть') : T('нет') }]; },
    api: function (m, port) {
      M.edgeEvents(m, port, 'touch', 'release');
      return { isTouched: function () { return port.sig.read() === 1; }, on: M.onApi(m) };
    }
  });

  /* ---------------------------------------------------------------- switch: SPDT, 3.3 V or GND */
  Q.defineModule('switch', {
    state: function () { return { on: false }; },
    sigOut: function (m) { return m.state.on ? 3300 : 0; },
    currentMa: function () { return 3; },
    controls: [{ type: 'toggle', id: 'on', label: T('Рычаг включён') }],
    readouts: function (m) { return [{ label: T('Рычаг'), value: m.state.on ? T('вкл') : T('выкл') }]; },
    api: function (m, port) {
      M.edgeEvents(m, port, 'on', 'off');
      return {
        isOn: function () { return port.sig.read() === 1; },
        on: M.onApi(m)                       // 'on', 'off'
      };
    }
  });

  /* ---------------------------------------------------------------- tilt: SW-520D ball switch, closed (HIGH) when upright */
  Q.defineModule('tilt', {
    state: function () { return {}; },
    sigOut: function (m) {
      var env = m.board && m.board.env;
      if (!env) return HI;
      var up = env.tiltDeg() < 30;
      if (env.shakeLevel() > 0.05 && Math.sin(env.t * 55 + m.uid) > 0) up = !up;      // the ball rattles
      return up ? HI : 0;
    },
    currentMa: function () { return 3; },
    readouts: function (m) {
      var env = m.board && m.board.env;
      return [{ label: T('Наклон платы'), value: env ? Math.round(env.tiltDeg()) : 0, unit: '°' },
              { label: T('Контакт'), value: m.sigOut() ? T('замкнут (ровно)') : T('разомкнут (наклон)') }];
    },
    hint: T('Реагирует на положение всей платы: вкладка «Среда» → наклон / встряхнуть.'),
    api: function (m, port) {
      M.edgeEvents(m, port, 'upright', 'tilt');
      return { isTilted: function () { return port.sig.read() === 0; }, on: M.onApi(m) };   // 'tilt', 'upright'
    }
  });

  /* ---------------------------------------------------------------- hall: DRV5032FA, OUT low while a magnet is near */
  Q.defineModule('hall', {
    state: function () { return { magnet: false }; },
    sigOut: function (m) { return m.state.magnet ? 0 : HI; },
    currentMa: function (m) { return 3 + (m.state.magnet ? 2 : 0); },
    controls: [{ type: 'hold', id: 'magnet', label: T('Поднести магнит') }],
    readouts: function (m) { return [{ label: T('Магнит'), value: m.state.magnet ? T('рядом') : T('нет') }]; },
    api: function (m, port) {
      M.edgeEvents(m, port, 'away', 'near');
      return { isMagnetNear: function () { return port.sig.read() === 0; }, on: M.onApi(m) };   // 'near', 'away'
    }
  });

  /* ---------------------------------------------------------------- pir: AS312, REL high while there is motion */
  Q.defineModule('pir', {
    state: function () { return { motion: false }; },
    out: function () { return { hold: 0 }; },
    sigOut: function (m) { return m.out.hold > 0 ? HI : 0; },
    update: function (m, dt) {
      if (m.state.motion) m.out.hold = 2.5;                        // retriggerable, about 2.5 s after the last movement
      else if (m.out.hold > 0) m.out.hold = Math.max(0, m.out.hold - dt);
      m.touch();
    },
    currentMa: function () { return 3; },
    controls: [{ type: 'hold', id: 'motion', label: T('Двигаться перед датчиком') },
               { type: 'action', label: T('Один взмах'), run: function (m) { m.out.hold = 2.5; m.touch(); } }],
    readouts: function (m) { return [{ label: T('Движение'), value: m.out.hold > 0 ? T('есть') : T('нет') }]; },
    api: function (m, port) {
      M.edgeEvents(m, port, 'motion', 'still');
      return { isMotion: function () { return port.sig.read() === 1; }, on: M.onApi(m) };   // 'motion', 'still'
    }
  });

  /* ---------------------------------------------------------------- pot: 3.3 V - 1k - 10k pot - GND, wiper 0 .. 3.0 V */
  Q.defineModule('pot', {
    state: function () { return { pos: 0.5 }; },
    sigOut: function (m) { return 3000 * m.state.pos; },
    currentMa: function () { return 6; },                           // 3.3 V / 11k
    controls: [{ type: 'range', id: 'pos', label: T('Поворот ручки'), min: 0, max: 1, step: 0.005, fmt: function (v) { return Math.round(v * 100) + ' %'; } }],
    readouts: function (m) { return [{ label: T('Положение'), value: Math.round(m.state.pos * 100), unit: '%' }]; },
    api: function (m, port) {
      return {
        percent: function () { return U.clamp(port.sig.readMv() / 3000 * 100, 0, 100); },
        raw: function () { return port.sig.readRaw(); },
        millivolts: function () { return port.sig.readMv(); }
      };
    }
  });

  /* ---------------------------------------------------------------- slider: same circuit, 30 mm travel */
  Q.defineModule('slider', {
    state: function () { return { pos: 0.5 }; },
    sigOut: function (m) { return 3000 * m.state.pos; },
    currentMa: function () { return 6; },
    controls: [{ type: 'range', id: 'pos', label: T('Ползунок'), min: 0, max: 1, step: 0.005, fmt: function (v) { return Math.round(v * 100) + ' %'; } }],
    readouts: function (m) { return [{ label: T('Положение'), value: Math.round(m.state.pos * 100), unit: '%' }]; },
    api: function (m, port) {
      return {
        percent: function () { return U.clamp(port.sig.readMv() / 3000 * 100, 0, 100); },
        raw: function () { return port.sig.readRaw(); },
        millivolts: function () { return port.sig.readMv(); }
      };
    }
  });

  /* ---------------------------------------------------------------- light: PT19-21C, 10k load, saturates at ~2.9 V (about 1 mW/cm2) */
  Q.defineModule('light', {
    state: function () { return { cover: 0 }; },
    lux: function (m) { var env = m.board && m.board.env; return (env ? env.lux : 400) * (1 - m.state.cover); },
    sigOut: function (m) { return U.clamp(Q.moduleDef('light').lux(m) * 2.9, 0, 2900); },
    currentMa: function () { return 3; },
    controls: [{ type: 'range', id: 'cover', label: T('Закрыть ладонью'), min: 0, max: 1, step: 0.01, fmt: function (v) { return Math.round(v * 100) + ' %'; } }],
    readouts: function (m) { return [{ label: T('Освещённость'), value: Math.round(Q.moduleDef('light').lux(m)), unit: T('лк') }]; },
    hint: T('Яркость комнаты задаётся на вкладке «Среда».'),
    api: function (m, port) {
      return {
        percent: function () { return U.clamp(port.sig.readMv() / 2900 * 100, 0, 100); },
        raw: function () { return port.sig.readRaw(); },
        millivolts: function () { return port.sig.readMv(); }
      };
    }
  });

  /* ---------------------------------------------------------------- joystick: Alps SKRHABE010 + resistor ladder (10k pull-up)
     contacts: CENTER 2.2k, A 4.7k, B 10k, C 22k, D 47k to GND. Which of A..D is up / right / down / left is decided on the first
     sample (modules/docs/PASSPORT.md); the sim assumes A = up, B = right, C = down, D = left. */
  var JOY_R = [2200, 4700, 10000, 22000, 47000];
  var JOY_DIRS = ['center', 'up', 'right', 'down', 'left'];
  function joyActive(m) {
    var s = m.state, t = 0.38;
    return [!!s.push, s.dy < -t, s.dx > t, s.dy > t, s.dx < -t];
  }
  Q.defineModule('joystick', {
    state: function () { return { dx: 0, dy: 0, push: false }; },
    sigOut: function (m) { return M.ladderMv(JOY_R, joyActive(m), 10000); },
    currentMa: function () { return 3; },
    controls: [{ type: 'range', id: 'dx', label: T('Влево — вправо'), min: -1, max: 1, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
               { type: 'range', id: 'dy', label: T('Вверх — вниз'), min: -1, max: 1, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
               { type: 'hold', id: 'push', label: T('Нажать стик') }],
    readouts: function (m) {
      var a = joyActive(m), names = [];
      a.forEach(function (on, i) { if (on) names.push(JOY_DIRS[i]); });
      return [{ label: T('Контакты'), value: names.join(' + ') || T('нет') }];
    },
    hint: T('Диагональ = два контакта сразу; уровни на SIG отличаются не меньше чем на 30 мВ.'),
    api: function (m, port, board) {
      function dirs() {
        var act = M.ladderDecode(JOY_R, port.sig.readMv(), 10000);
        return { center: act[0], up: act[1], right: act[2], down: act[3], left: act[4] };
      }
      function direction() {
        var d = dirs(), s = '';
        if (d.up) s = 'up'; else if (d.down) s = 'down';
        if (d.left) s += (s ? '-' : '') + 'left'; else if (d.right) s += (s ? '-' : '') + 'right';
        return s || 'none';
      }
      var prev = 'none', prevPush = false;
      m.cleanups.push(board.on('step', function () {
        var d = direction(), p = dirs().center;
        if (d !== prev) { prev = d; m.ev.emit('direction', d); }
        if (p !== prevPush) { prevPush = p; m.ev.emit(p ? 'press' : 'release'); }
      }));
      return {
        direction: direction,                // 'none' | 'up' | 'up-right' | ... | 'left'
        isPressed: function () { return dirs().center; },
        x: function () { var d = dirs(); return (d.right ? 1 : 0) - (d.left ? 1 : 0); },
        y: function () { var d = dirs(); return (d.up ? 1 : 0) - (d.down ? 1 : 0); },
        raw: function () { return port.sig.readRaw(); },
        on: M.onApi(m)                       // 'direction', 'press', 'release'
      };
    }
  });

  /* ---------------------------------------------------------------- keypad: 4 keys, 2.2k / 4.7k / 10k / 22k */
  var KEY_R = [2200, 4700, 10000, 22000];
  Q.defineModule('keypad', {
    state: function () { return { keys: [false, false, false, false] }; },
    sigOut: function (m) { return M.ladderMv(KEY_R, m.state.keys, 10000); },
    currentMa: function () { return 3; },
    setKey: function (m, i, down) {
      var k = m.state.keys.slice();
      k[i] = !!down;
      m.set('keys', k);
    },
    controls: [1, 2, 3, 4].map(function (n) {
      return { type: 'hold', label: T('Клавиша %1', n), get: function (m) { return m.state.keys[n - 1]; },
               set: function (m, v) { Q.moduleDef('keypad').setKey(m, n - 1, v); } };
    }),
    readouts: function (m) {
      var p = []; m.state.keys.forEach(function (k, i) { if (k) p.push(i + 1); });
      return [{ label: T('Нажаты'), value: p.join(', ') || T('ничего') }];
    },
    api: function (m, port, board) {
      function keys() { return M.ladderDecode(KEY_R, port.sig.readMv(), 10000); }
      var prev = [false, false, false, false];
      m.cleanups.push(board.on('step', function () {
        var k = keys();
        for (var i = 0; i < 4; i++) if (k[i] !== prev[i]) { prev[i] = k[i]; m.ev.emit(k[i] ? 'press' : 'release', i + 1); }
      }));
      return {
        pressed: function () { var k = keys(), out = []; k.forEach(function (on, i) { if (on) out.push(i + 1); }); return out; },
        isPressed: function (n) { return !!keys()[n - 1]; },
        raw: function () { return port.sig.readRaw(); },
        on: M.onApi(m)                       // 'press' (key number), 'release'
      };
    }
  });

  /* ---------------------------------------------------------------- pulse: green LED + PT19 + MCP6001 gain 101, idles at 1.65 V */
  Q.defineModule('pulse', {
    state: function () { return { finger: false, bpm: 72 }; },
    out: function () { return { phase: 0, t: 0 }; },
    update: function (m, dt) {
      m.out.t += dt;
      if (m.state.finger) m.out.phase += dt * m.state.bpm / 60;
      m.touch();
    },
    sigOut: function (m) {
      var n = Math.sin(m.out.t * 91) * 14 + Math.sin(m.out.t * 37 + 1) * 9;       // electrical noise, mV
      if (!m.state.finger) return 1650 + n;
      return U.clamp(1650 + 520 * (M.ppg(m.out.phase) - 0.2) + n, 0, 3300);
    },
    currentMa: function () { return 8; },
    controls: [{ type: 'hold', id: 'finger', label: T('Приложить палец') },
               { type: 'range', id: 'bpm', label: T('Пульс'), min: 40, max: 200, step: 1, fmt: function (v) { return T('%1 уд/мин', Math.round(v)); } }],
    readouts: function (m) { return [{ label: T('Палец'), value: m.state.finger ? T('на датчике') : T('нет') }]; },
    api: function (m, port, board) {
      // a small peak detector over the ADC, like the firmware has to do: sample every step, find the pulse peaks
      var lo = 1650, hi = 1650, prev = 0, peaks = [], lastPeakT = -10;
      m.cleanups.push(board.on('step', function () {
        var v = port.sig.readMv(), t = board.time;
        lo += (v - lo) * 0.02; hi += (v - hi) * 0.02;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
        var thr = (hi + lo) / 2 + (hi - lo) * 0.15;
        if (prev < thr && v >= thr && t - lastPeakT > 0.28 && hi - lo > 150) {
          if (lastPeakT > 0) peaks.push(t - lastPeakT);
          if (peaks.length > 5) peaks.shift();
          lastPeakT = t;
          m.ev.emit('beat');
        }
        prev = v;
      }));
      return {
        raw: function () { return port.sig.readRaw(); },
        millivolts: function () { return port.sig.readMv(); },
        bpm: function () {
          if (board.time - lastPeakT > 3 || !peaks.length) return 0;
          var avg = peaks.reduce(function (a, b) { return a + b; }, 0) / peaks.length;
          return Math.round(60 / avg);
        },
        on: M.onApi(m)                     // 'beat'
      };
    }
  });

  /* ---------------------------------------------------------------- IR receiver: IRM-H638T, idles HIGH, LOW during a 38 kHz burst */
  Q.defineModule('irrx', {
    state: function () { return {}; },
    out: function () { return { burst: 0, last: null }; },
    sigOut: function (m) { return m.out.burst > 0 ? 0 : 3300; },
    update: function (m, dt) { if (m.out.burst > 0) { m.out.burst = Math.max(0, m.out.burst - dt); m.touch(); } },
    /** a frame arrives through the air: {protocol:'NEC', address, command, duration} */
    irReceive: function (m, frame) {
      m.out.burst = Math.max(m.out.burst, frame.duration || 0.068);
      m.out.last = frame;
      m.touch();
      m.ev.emit('code', frame);
    },
    currentMa: function () { return 4; },
    readouts: function (m) {
      var f = m.out.last;
      return [{ label: T('Последний код'), value: f ? T('%1 адрес 0x%2 команда 0x%3', f.protocol, f.address.toString(16).toUpperCase(), f.command.toString(16).toUpperCase()) : '—' }];
    },
    hint: T('Нажимайте клавиши виртуального пульта (в инспекторе) или поставьте ИК-передатчик на соседний порт.'),
    remote: true,
    api: function (m, port) {
      var queue = [];
      m.ev.on('code', function (f) { queue.push(f); if (queue.length > 16) queue.shift(); });
      return {
        available: function () { return queue.length; },
        read: function () { return queue.shift() || null; },
        last: function () { return m.out.last; },
        isReceiving: function () { return port.sig.read() === 0; },
        on: M.onApi(m)                     // 'code'
      };
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
