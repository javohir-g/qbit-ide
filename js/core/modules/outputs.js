/* Output modules: the main board drives SIG (level, PWM or a frame from the RMT peripheral), the module does something. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, M = Q.mod;

  function fx(m, type, extra) {
    if (m.board) m.board.emit('fx', Object.assign({ type: type, module: m, port: m.port && m.port.n }, extra || {}));
  }

  /* ---------------------------------------------------------------- led: SIG -> 100R -> AO3400A, ~20 mA through the LED */
  Q.defineModule('led', {
    out: function () { return { b: 0, pwm: null }; },
    onSig: function (m, d) {
      if (d.type === 'level') { m.out.pwm = null; m.out.b = d.v ? 1 : 0; }
      else if (d.type === 'pwm') {
        if (d.freq >= 60) { m.out.pwm = null; m.out.b = d.duty; }      // too fast to see: average brightness
        else { m.out.pwm = d; }                                         // slow PWM is visible flicker / blinking
      } else if (d.type === 'hiz') { m.out.pwm = null; m.out.b = 0; }   // the 100k pull-down turns it off
      m.touch();
    },
    update: function (m) {
      var p = m.out.pwm;
      if (p) {
        var t = m.board ? m.board.time : 0;
        var b = ((t * p.freq) % 1) < p.duty ? 1 : 0;
        if (b !== m.out.b) { m.out.b = b; m.touch(); }
      }
    },
    currentMa: function (m) { return 3 + 22 * m.out.b; },
    readouts: function (m) { return [{ label: T('Яркость'), value: Math.round(m.out.b * 100), unit: '%' }]; },
    tests: [
      { type: 'toggle', label: T('Включить'), get: function (m) { return m.api && m.api.isOn(); },
        set: function (m, v) { m.api && (v ? m.api.on() : m.api.off()); } },
      { type: 'range', label: T('Яркость'), min: 0, max: 100, step: 1, value: 100, fmt: function (v) { return v + ' %'; },
        run: function (m, v) { m.api && m.api.brightness(v); } }
    ],
    api: function (m, port) {
      return {
        on: function () { port.sig.write(1); },
        off: function () { port.sig.write(0); },
        set: function (v) { port.sig.write(v ? 1 : 0); },
        brightness: function (percent) { port.sig.pwm(1000, U.clamp(percent, 0, 100) / 100); },      // LEDC 1 kHz
        isOn: function () { return m.out.b > 0.02; }
      };
    }
  });

  /* ---------------------------------------------------------------- rgb: WS2812B behind a 74AHCT1G125 level shifter */
  Q.defineModule('rgb', {
    out: function () { return { rgb: [0, 0, 0] }; },
    onSig: function (m, d) {
      if (d.type === 'frame' && d.kind === 'ws2812') {
        var px = (d.data && d.data[0]) || [0, 0, 0];
        m.out.rgb = [0, 1, 2].map(function (i) { return U.clamp(Math.round(px[i] || 0), 0, 255); });
        m.touch();
      }                                                              // anything else: the WS2812 keeps its colour
    },
    currentMa: function (m) { var c = m.out.rgb; return 4 + 60 * (c[0] + c[1] + c[2]) / 765; },
    readouts: function (m) { var c = m.out.rgb; return [{ label: T('Цвет'), value: 'R ' + c[0] + ' · G ' + c[1] + ' · B ' + c[2] }]; },
    tests: [
      { type: 'color', label: T('Цвет'), value: '#ff3b6b', run: function (m, v) {
        if (!m.api) return; var n = parseInt(v.slice(1), 16); m.api.color((n >> 16) & 255, (n >> 8) & 255, n & 255);
      } },
      { type: 'action', label: T('Выключить'), run: function (m) { m.api && m.api.off(); } }
    ],
    api: function (m, port) {
      return {
        color: function (r, g, b) { port.sig.frame('ws2812', [[r, g, b]]); },
        hex: function (s) { var n = parseInt(String(s).replace('#', ''), 16); port.sig.frame('ws2812', [[(n >> 16) & 255, (n >> 8) & 255, n & 255]]); },
        hsv: function (h, s, v) {
          h = ((h % 360) + 360) % 360; s = U.clamp(s, 0, 1); v = U.clamp(v, 0, 1);
          var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), mm = v - c, r = 0, g = 0, b = 0;
          if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
          else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
          port.sig.frame('ws2812', [[Math.round((r + mm) * 255), Math.round((g + mm) * 255), Math.round((b + mm) * 255)]]);
        },
        off: function () { port.sig.frame('ws2812', [[0, 0, 0]]); }
      };
    }
  });

  /* ---------------------------------------------------------------- buzzer: MLT-8530 magnetic, tone = PWM frequency, resonance 2.7 kHz */
  Q.defineModule('buzzer', {
    out: function () { return { freq: 0, duty: 0, dc: false }; },
    onSig: function (m, d) {
      if (d.type === 'pwm') { m.out.freq = d.freq; m.out.duty = d.duty; m.out.dc = false; }
      else if (d.type === 'level') { m.out.freq = 0; m.out.duty = 0; m.out.dc = !!d.v; }
      else if (d.type === 'hiz') { m.out.freq = 0; m.out.duty = 0; m.out.dc = false; }
      m.touch();
    },
    /** how loud (0..1) the buzzer is right now: duty symmetry x closeness to the 2.7 kHz resonance */
    loudness: function (m) {
      var o = m.out;
      if (!(o.freq > 0)) return 0;
      var sym = Math.sin(Math.PI * U.clamp(o.duty, 0, 1));
      var x = (o.freq - 2700) / 1800;
      return sym * (0.25 + 0.75 / (1 + x * x));
    },
    currentMa: function (m) {
      var o = m.out;
      if (o.dc) return 3 + 310;                                       // DC through a 16 ohm coil: the NPN and the port get hot
      if (!(o.freq > 0)) return 3;
      return 3 + 95 * Math.sin(Math.PI * U.clamp(o.duty, 0, 1));
    },
    readouts: function (m) {
      var o = m.out;
      return [{ label: T('Тон'), value: o.dc ? T('постоянный ток!') : o.freq > 0 ? T('%1 Гц, скважность %2 %', Math.round(o.freq), Math.round(o.duty * 100)) : T('тишина') }];
    },
    tests: [
      { type: 'range', label: T('Частота тона'), min: 100, max: 5000, step: 10, value: 880, fmt: function (v) { return T('%1 Гц', v); },
        run: function (m, v) { m.api && m.api.tone(v, 400); } },
      { type: 'action', label: T('Мелодия: до-ре-ми'), run: function (m) {
        if (!m.api) return;
        var notes = [523, 587, 659, 698, 784];
        notes.forEach(function (f, i) { m.board.after(i * 0.32, function () { m.api && m.api.tone(f, 280); }); });
      } },
      { type: 'action', label: T('Стоп'), run: function (m) { m.api && m.api.stop(); } }
    ],
    api: function (m, port, board) {
      var timer = 0;
      return {
        /** play freq Hz; with ms it stops by itself */
        tone: function (freq, ms) {
          if (timer) board.cancel(timer);
          port.sig.pwm(freq, 0.5);
          timer = ms ? board.after(ms / 1000, function () { port.sig.write(0); }) : 0;
        },
        stop: function () { if (timer) board.cancel(timer); timer = 0; port.sig.write(0); },
        beep: function (ms) { this.tone(2700, ms || 120); },
        isPlaying: function () { return m.out.freq > 0; }
      };
    }
  });

  /* ---------------------------------------------------------------- servo: SG90 class on a 3-pin header, 50 Hz pulse 0.5 .. 2.4 ms */
  var SERVO_MIN_US = 500, SERVO_MAX_US = 2400, SERVO_DPS = 600;       // 0.1 s per 60 degrees
  Q.defineModule('servo', {
    state: function () { return { blocked: false }; },
    out: function () { return { target: 90, angle: 90, moving: false, stalled: false, pulseUs: 0, valid: false }; },
    onSig: function (m, d) {
      var o = m.out;
      if (d.type === 'pwm' && d.freq >= 30 && d.freq <= 400) {
        var us = d.duty / d.freq * 1e6;
        o.pulseUs = us;
        if (us >= 400 && us <= 2600) { o.target = U.clamp((us - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US) * 180, 0, 180); o.valid = true; }
      } else { o.valid = false; o.pulseUs = 0; }                       // no pulses: the servo stops holding
      m.touch();
    },
    update: function (m, dt) {
      var o = m.out, diff = o.target - o.angle;
      var was = o.moving + '' + o.stalled;
      o.stalled = o.valid && m.state.blocked && Math.abs(diff) > 1;
      if (o.valid && !m.state.blocked && Math.abs(diff) > 0.05) {
        var step = SERVO_DPS * dt;
        o.angle = Math.abs(diff) <= step ? o.target : o.angle + Math.sign(diff) * step;
        o.moving = true;
      } else o.moving = false;
      if (o.moving || was !== o.moving + '' + o.stalled) m.touch();
    },
    currentMa: function (m) {
      var o = m.out;
      return 6 + (o.valid ? 12 : 0) + (o.moving ? 230 : 0) + (o.stalled ? 640 : 0);
    },
    controls: [{ type: 'toggle', id: 'blocked', label: T('Зажать вал пальцем (стопор)') }],
    readouts: function (m) {
      var o = m.out;
      return [{ label: T('Угол'), value: Math.round(o.angle), unit: '°' }, { label: T('Команда'), value: o.valid ? T('%1° (%2 мкс)', Math.round(o.target), Math.round(o.pulseUs)) : T('нет импульсов') }];
    },
    tests: [
      { type: 'range', label: T('Угол'), min: 0, max: 180, step: 1, value: 90, fmt: function (v) { return v + '°'; },
        run: function (m, v) { m.api && m.api.angle(v); } },
      { type: 'action', label: T('Качнуть 0°–180°'), run: function (m) {
        if (!m.api) return;
        m.api.angle(0);
        m.board.after(0.6, function () { m.api && m.api.angle(180); });
        m.board.after(1.4, function () { m.api && m.api.angle(90); });
      } }
    ],
    api: function (m, port) {
      var cmd = 90;
      return {
        angle: function (deg) {
          cmd = U.clamp(deg, 0, 180);
          port.sig.pwm(50, (SERVO_MIN_US + cmd / 180 * (SERVO_MAX_US - SERVO_MIN_US)) / 20000);
        },
        pulse: function (us) { port.sig.pwm(50, us / 20000); },
        release: function () { port.sig.write(0); },
        getAngle: function () { return cmd; }
      };
    }
  });

  /* ---------------------------------------------------------------- irtx: IR333C 940 nm + red TX LED, 38 kHz carrier from SIG */
  Q.defineModule('irtx', {
    out: function () { return { sending: 0, carrier: false, last: null }; },
    onSig: function (m, d) {
      var o = m.out;
      if (d.type === 'frame' && d.kind === 'ir') {
        var f = { protocol: d.data.protocol || 'NEC', address: d.data.address | 0, command: d.data.command | 0, duration: d.data.duration || 0.068 };
        o.sending = f.duration; o.last = f;
        if (m.board) m.board.irBroadcast(f, m);
        fx(m, 'ir-send');
      } else if (d.type === 'pwm' && d.freq >= 30000 && d.freq <= 60000) o.carrier = true;
      else o.carrier = false;
      m.touch();
    },
    update: function (m, dt) { if (m.out.sending > 0) { m.out.sending = Math.max(0, m.out.sending - dt); m.touch(); } },
    currentMa: function (m) { return 3 + (m.out.sending > 0 || m.out.carrier ? 33 : 0); },
    readouts: function (m) {
      var f = m.out.last;
      return [{ label: T('Последняя передача'), value: f ? T('%1 адрес 0x%2 команда 0x%3', f.protocol, f.address.toString(16).toUpperCase(), f.command.toString(16).toUpperCase()) : '—' }];
    },
    tests: [
      { type: 'action', label: T('Передать код (адрес 0, команда 0x45)'), run: function (m) { m.api && m.api.send(0x00, 0x45); } },
      { type: 'action', label: T('Передать код (адрес 0, команда 0x15)'), run: function (m) { m.api && m.api.send(0x00, 0x15); } }
    ],
    hint: T('ИК-передатчик «видит» ИК-приёмник на соседнем порту (вкладка «Среда» → ИК-связь между модулями).'),
    api: function (m, port) {
      return {
        send: function (address, command) { port.sig.frame('ir', { protocol: 'NEC', address: address, command: command, duration: 0.068 }); },
        isSending: function () { return m.out.sending > 0 || m.out.carrier; }
      };
    }
  });

  /* ---------------------------------------------------------------- relay: SRD-05VDC, coil 72 mA, <= 30 V DC / 3 A contacts */
  Q.defineModule('relay', {
    out: function () { return { on: false }; },
    onSig: function (m, d) {
      var on = d.type === 'level' ? !!d.v : d.type === 'pwm' ? d.duty >= 0.5 : false;
      if (on !== m.out.on) { m.out.on = on; m.touch(); fx(m, 'relay-click', { on: on }); }
    },
    currentMa: function (m) { return 3 + (m.out.on ? 75 : 0); },
    readouts: function (m) { return [{ label: T('Контакты'), value: m.out.on ? T('COM — NO замкнуты') : T('COM — NC замкнуты') }]; },
    tests: [
      { type: 'toggle', label: T('Включить реле'), get: function (m) { return m.out.on; }, set: function (m, v) { m.api && (v ? m.api.on() : m.api.off()); } }
    ],
    api: function (m, port) {
      return {
        on: function () { port.sig.write(1); },
        off: function () { port.sig.write(0); },
        set: function (v) { port.sig.write(v ? 1 : 0); },
        isOn: function () { return m.out.on; }
      };
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
