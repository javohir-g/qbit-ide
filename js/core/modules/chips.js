/* Modules with a real register map behind their I2C address:
     encoder    0x36  CH32V003 firmware, map from modules/firmware/README.md
     ultrasonic 0x39  CH32V003 firmware, map from modules/firmware/README.md
     motor      0x60  TI DRV8830 (two registers: CONTROL, FAULT)
   The drivers below talk to them through board.dev(port, addr) exactly like the main-board firmware has to. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, M = Q.mod;

  var HI = 3300;

  /** I2C slave with a byte register file: write([reg, v...]) sets the pointer and writes, read(n) returns from the pointer. */
  function regSlave(readReg, writeReg) {
    var ptr = 0;
    return {
      write: function (b) {
        if (!b.length) return true;
        ptr = b[0] & 0xFF;
        for (var i = 1; i < b.length; i++) { writeReg(ptr, b[i]); ptr = (ptr + 1) & 0xFF; }
        return true;
      },
      read: function (n) {
        var o = new Uint8Array(n);
        for (var i = 0; i < n; i++) { o[i] = readReg(ptr) & 0xFF; ptr = (ptr + 1) & 0xFF; }
        return o;
      }
    };
  }

  /* ---------------------------------------------------------------- encoder: EC11J + CH32V003, I2C 0x36, SIG = "changed" pulse */
  var ENC_LONG_S = 0.6;
  var enc = {
    pos: function (m) { return Math.trunc((m.state.counts - m.out.pos0) / m.out.cpd); },
    pulse: function (m) { if (m.out.ctrl & 0x80) m.out.pulse = 0.03; m.touch(); }
  };
  Q.defineModule('encoder', {
    state: function () { return { counts: 0, down: false }; },
    out: function () { return { pos0: 0, cpd: 4, ctrl: 0x80, delta: 0, btn: 0, lastPos: 0, downAt: 0, longDone: false, pulse: 0 }; },
    onState: function (m, k, v) {
      var o = m.out;
      if (k === 'counts') {
        var p = enc.pos(m);
        if (p !== o.lastPos) { o.delta = U.clamp(o.delta + (p - o.lastPos), -127, 127); o.lastPos = p; enc.pulse(m); m.ev.emit('turn', p); }
      } else if (k === 'down') {
        var t = m.board ? m.board.time : 0;
        if (v) { o.downAt = t; o.longDone = false; o.btn |= 1; m.ev.emit('press'); }
        else { o.btn &= ~1; if (!o.longDone && t - o.downAt < ENC_LONG_S) { o.btn |= 2; m.ev.emit('click'); } m.ev.emit('release'); }
        enc.pulse(m);
      }
    },
    update: function (m, dt) {
      var o = m.out;
      if (o.pulse > 0) { o.pulse = Math.max(0, o.pulse - dt); m.touch(); }
      if (m.state.down && !o.longDone && m.board && m.board.time - o.downAt >= ENC_LONG_S) {
        o.longDone = true; o.btn |= 4; m.ev.emit('long'); enc.pulse(m);
      }
    },
    sigOut: function (m) { return m.out.pulse > 0 ? HI : 0; },
    i2c: function (m) {
      var o = m.out;
      function rd(r) {
        switch (r) {
          case 0: return 0x36;
          case 1: return 1;
          case 2: return enc.pos(m) & 0xFF;
          case 3: return (enc.pos(m) >> 8) & 0xFF;
          case 4: return o.delta & 0xFF;
          case 5: return o.btn;
          case 6: return o.ctrl;
          case 7: return o.cpd;
          default: return 0xFF;
        }
      }
      function wr(r, v) {
        if (r === 6) {
          if (v & 1) { o.pos0 = m.state.counts; o.lastPos = 0; }
          if (v & 2) { o.delta = 0; o.btn &= 1; }
          o.ctrl = v & 0x80;
        } else if (r === 7) { if (v >= 1 && v <= 16) { o.cpd = v; o.lastPos = enc.pos(m); } }
        m.touch();
      }
      return { 0x36: regSlave(rd, wr) };
    },
    currentMa: function () { return 6; },
    controls: [{ type: 'action', label: T('Щелчок влево'), run: function (m) { m.set('counts', m.state.counts - m.out.cpd); } },
               { type: 'action', label: T('Щелчок вправо'), run: function (m) { m.set('counts', m.state.counts + m.out.cpd); } },
               { type: 'hold', id: 'down', label: T('Нажать ручку') }],
    readouts: function (m) {
      return [{ label: T('Позиция'), value: enc.pos(m), unit: T('щелчков') }, { label: T('Кнопка (рег. 5)'), value: '0b' + (m.out.btn & 7).toString(2).padStart(3, '0') }];
    },
    api: function (m, port, board) {
      var dev = board.dev(port.n, 0x36);
      function control(bits) { dev.writeReg(6, (dev.readReg(6, 1)[0] & 0x80) | bits); }   // keep the SIG-pulse bit
      return {
        position: function () { var b = dev.readReg(2, 2); var v = b[0] | (b[1] << 8); return v > 32767 ? v - 65536 : v; },
        delta: function () {                                               // detents since the last call
          var d = dev.readReg(4, 1)[0]; d = d > 127 ? d - 256 : d;
          control(0x02);
          return d;
        },
        isPressed: function () { return (dev.readReg(5, 1)[0] & 1) === 1; },
        wasClicked: function () { var b = dev.readReg(5, 1)[0]; if (b & 2) { control(0x02); return true; } return false; },
        wasLongPressed: function () { var b = dev.readReg(5, 1)[0]; if (b & 4) { control(0x02); return true; } return false; },
        reset: function () { control(0x01); },
        setCountsPerDetent: function (n) { dev.writeReg(7, n); },
        on: M.onApi(m)                     // 'turn' (position), 'press', 'release', 'click', 'long'
      };
    }
  });

  /* ---------------------------------------------------------------- ultrasonic: 2 x GU1610B + CH32V003, I2C 0x39, SIG = echo pulse / data ready */
  var US = {
    maxCm: 300, minCm: 2,
    c: function (t) { return 331.3 + 0.606 * t; },                          // m/s
    measure: function (m) {
      var o = m.out, e = m.board && m.board.env, air = e ? e.tempC : 20;
      var d = m.state.present ? m.state.objectCm : -1;
      o.status |= 1;
      if (d >= US.minCm && d <= US.maxCm) {
        o.echo = Math.round(2 * d / 100 / US.c(air) * 1e6);                   // the real round trip uses the real air
        o.dist = Math.round(US.c(o.temp) * o.echo * 1e-6 / 2 * 1000);         // the firmware converts with TEMP_C from its register
        o.status &= ~2;
      } else { o.echo = 0; o.dist = 0xFFFF; o.status |= 2; }
      o.pulse = Math.max(0.02, (o.ctrl & 4) ? o.echo * 1e-6 : 0);
      m.touch();
      m.ev.emit('data');
    }
  };
  Q.defineModule('ultrasonic', {
    state: function () { return { present: true, objectCm: 60 }; },
    out: function () { return { dist: 0xFFFF, echo: 0, status: 0, ctrl: 0x02, thr: 30, period: 6, temp: 20, acc: 0, pulse: 0 }; },
    update: function (m, dt) {
      var o = m.out;
      if (o.pulse > 0) { o.pulse = Math.max(0, o.pulse - dt); m.touch(); }
      if (o.ctrl & 2) {
        o.acc += dt;
        if (o.acc >= o.period * 0.01) { o.acc = 0; US.measure(m); }
      }
    },
    sigOut: function (m) { return m.out.pulse > 0 ? HI : 0; },
    i2c: function (m) {
      var o = m.out;
      function rd(r) {
        switch (r) {
          case 0: return 0x39;
          case 1: return 1;
          case 2: return o.dist & 0xFF;
          case 3: return (o.dist >> 8) & 0xFF;
          case 4: return o.echo & 0xFF;
          case 5: return (o.echo >> 8) & 0xFF;
          case 6: return o.status;
          case 7: return o.ctrl;
          case 8: return o.thr;
          case 9: return o.period;
          case 10: return o.temp & 0xFF;
          default: return 0xFF;
        }
      }
      function wr(r, v) {
        if (r === 7) {
          o.ctrl = v & 0x06;
          if (v & 8) o.status &= ~1;
          if (v & 1) US.measure(m);
        } else if (r === 8) o.thr = v;
        else if (r === 9) o.period = Math.max(1, v);
        else if (r === 10) o.temp = v > 127 ? v - 256 : v;
        m.touch();
      }
      return { 0x39: regSlave(rd, wr) };
    },
    currentMa: function (m) { return 5 + ((m.out.ctrl & 2) ? 22 : 4); },
    controls: [{ type: 'toggle', id: 'present', label: T('Предмет перед датчиком') },
               { type: 'range', id: 'objectCm', label: T('Расстояние до предмета'), min: 1, max: 320, step: 1, fmt: function (v) { return T('%1 см', v); } }],
    readouts: function (m) {
      var o = m.out;
      return [{ label: T('DISTANCE_MM (рег. 2–3)'), value: o.dist === 0xFFFF ? T('0xFFFF — нет эха') : o.dist, unit: o.dist === 0xFFFF ? '' : T('мм') },
              { label: T('ECHO_US (рег. 4–5)'), value: o.echo, unit: T('мкс') }];
    },
    hint: T('Дальность 2…300 см. Неверная температура воздуха в регистре TEMP_C даёт ошибку ≈ 0,17 % на градус.'),
    api: function (m, port, board) {
      var dev = board.dev(port.n, 0x39);
      return {
        distanceMm: function () { var b = dev.readReg(2, 2), v = b[0] | (b[1] << 8); return v === 0xFFFF ? null : v; },
        distanceCm: function () { var b = dev.readReg(2, 2), v = b[0] | (b[1] << 8); return v === 0xFFFF ? null : Math.round(v) / 10; },
        echoUs: function () { var b = dev.readReg(4, 2); return b[0] | (b[1] << 8); },
        measureOnce: function () { dev.writeReg(7, 0x01 | 0x08 | (m.out.ctrl & 6)); },
        setAirTemperature: function (c) { dev.writeReg(10, c & 0xFF); },
        setPeriodMs: function (ms) { dev.writeReg(9, Math.max(1, Math.round(ms / 10))); },
        on: M.onApi(m)                     // 'data'
      };
    }
  });

  /* ---------------------------------------------------------------- motor: DRV8830 0x60, 600 mA limit, nFAULT -> SIG */
  var MOT = { vcc: 5.0, ilim: 606, r: 8 };
  Q.defineModule('motor', {
    state: function () { return { load: 0 }; },
    out: function () { return { vset: 0, mode: 0, fault: 0, rpm: 0, iMa: 0, ptr: 0 }; },
    i2c: function (m) {
      var o = m.out;
      function rd(r) {
        if (r === 0) return (o.vset << 2) | o.mode;
        if (r === 1) return o.fault;
        return 0xFF;
      }
      function wr(r, v) {
        if (r === 0) { o.vset = (v >> 2) & 0x3F; o.mode = v & 3; }
        else if (r === 1 && (v & 0x80)) o.fault = 0;                       // CLEAR
        m.touch();
      }
      return { 0x60: regSlave(rd, wr) };
    },
    volts: function (m) {
      var o = m.out;
      if (o.mode === 0 || o.mode === 3 || o.vset < 6) return 0;
      return Math.min(MOT.vcc, 0.0803 * (o.vset + 1));
    },
    update: function (m, dt) {
      var o = m.out, v = Q.moduleDef('motor').volts(m), load = m.state.load;
      var dir = o.mode === 2 ? 1 : o.mode === 1 ? -1 : 0;
      var target = v > 0 ? dir * Math.max(0, v - 0.5) * 2200 * (1 - 0.75 * load) : 0;
      var tau = v > 0 ? 0.25 : o.mode === 3 ? 0.08 : 1.2;
      var rpm = o.rpm + (target - o.rpm) * (1 - Math.exp(-dt / tau));
      var i = 0;
      if (v > 0) {
        var demand = (v / MOT.vcc) * (70 + 760 * Math.pow(load, 1.6)) + Math.abs(target - o.rpm) * 0.03;      // spin-up needs more
        i = Math.min(demand, MOT.ilim);
        if (demand > MOT.ilim && !(o.fault & 0x10)) { o.fault |= 0x11; m.ev.emit('fault'); }                    // ILIMIT + FAULT -> nFAULT low
      } else if (o.mode === 3) i = Math.min(120, Math.abs(o.rpm) * 0.05);
      if (Math.abs(rpm - o.rpm) > 0.5 || Math.abs(i - o.iMa) > 1) m.touch();
      o.rpm = rpm; o.iMa = i;
    },
    sigOut: function (m) { return m.out.fault ? 0 : HI; },
    currentMa: function (m) { return 3 + m.out.iMa; },
    controls: [{ type: 'range', id: 'load', label: T('Нагрузка на вал'), min: 0, max: 1, step: 0.01, fmt: function (v) { return v >= 0.995 ? T('вал заклинило') : Math.round(v * 100) + ' %'; } }],
    readouts: function (m) {
      var o = m.out;
      return [{ label: T('Обороты'), value: Math.round(o.rpm), unit: T('об/мин') }, { label: T('Ток мотора'), value: Math.round(o.iMa), unit: T('мА') },
              { label: T('FAULT (рег. 1)'), value: '0x' + o.fault.toString(16).toUpperCase().padStart(2, '0') + (o.fault ? ' — nFAULT = LOW' : '') }];
    },
    tests: [
      { type: 'range', label: T('Скорость'), min: -100, max: 100, step: 5, value: 60, fmt: function (v) { return v + ' %'; }, run: function (m, v) { m.api && m.api.speed(v); } },
      { type: 'action', label: T('Тормоз'), run: function (m) { m.api && m.api.brake(); } },
      { type: 'action', label: T('Сбросить ошибку'), run: function (m) { m.api && m.api.clearFault(); } }
    ],
    hint: T('Предел тока 600 мА: заклинивание вала (нагрузка 100 %) включает ограничение и линию nFAULT.'),
    api: function (m, port, board) {
      var dev = board.dev(port.n, 0x60);
      return {
        /** -100 .. 100 %; 0 = coast */
        speed: function (pct) {
          pct = U.clamp(pct, -100, 100);
          if (pct === 0) return dev.writeReg(0, 0x00);
          var vset = Math.round(6 + Math.abs(pct) / 100 * (0x3F - 6));
          dev.writeReg(0, (vset << 2) | (pct > 0 ? 2 : 1));
        },
        stop: function () { dev.writeReg(0, 0x00); },                       // coast
        brake: function () { dev.writeReg(0, (0x3F << 2) | 3); },
        fault: function () { return dev.readReg(1, 1)[0]; },
        isFault: function () { return port.sig.read() === 0; },
        clearFault: function () { dev.writeReg(1, 0x80); },
        on: M.onApi(m)                     // 'fault'
      };
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
