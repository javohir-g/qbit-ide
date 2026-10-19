/* I2C modules (3.3 V devices on the port channel). Register-level emulation is only done where this project defines the
   registers itself (smart modules: smart.js) or where the chip is tiny and well known (DRV8830, SSD1306: motor.js / oled.js).
   For the other chips the module answers the address (so a scan finds it) and the driver reads the model's logical values:
   what a person would get after the chip's own conversion. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, M = Q.mod;

  var HI = 3300;
  function env(m) { return (m.board && m.board.env) || null; }
  function hexToRgb(h) {
    var n = parseInt(String(h).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ---------------------------------------------------------------- temphum: AHT20 0x38 */
  Q.defineModule('temphum', {
    i2cAddrs: [0x38],
    state: function () { return { warm: false }; },
    out: function () { return { dT: 0, dH: 0 }; },
    update: function (m, dt) {
      var o = m.out, w = m.state.warm;
      var tT = w ? 6 : 0, tH = w ? 28 : 0, kT = dt / (w ? 6 : 9), kH = dt / (w ? 4 : 7);
      var nT = o.dT + (tT - o.dT) * Math.min(1, kT), nH = o.dH + (tH - o.dH) * Math.min(1, kH);
      if (Math.abs(nT - o.dT) > 0.001 || Math.abs(nH - o.dH) > 0.001) m.touch();
      o.dT = nT; o.dH = nH;
    },
    temperature: function (m) { var e = env(m); return (e ? e.tempC : 24) + m.out.dT; },
    humidity: function (m) { var e = env(m); return U.clamp((e ? e.humidity : 45) + m.out.dH, 0, 100); },
    currentMa: function () { return 3; },
    controls: [{ type: 'hold', id: 'warm', label: T('Подышать на датчик / согреть пальцем') }],
    readouts: function (m) {
      var d = Q.moduleDef('temphum');
      return [{ label: T('Температура'), value: M.round(d.temperature(m), 1), unit: '°C' }, { label: T('Влажность'), value: M.round(d.humidity(m), 0), unit: '%' }];
    },
    hint: T('Температура и влажность комнаты — на вкладке «Среда».'),
    api: function (m) {
      var d = Q.moduleDef('temphum');
      return {
        temperature: function () { return M.round(d.temperature(m), 2); },        // °C
        humidity: function () { return M.round(d.humidity(m), 1); }               // %RH
      };
    }
  });

  /* ---------------------------------------------------------------- pressure: SPL07-003 0x76 */
  Q.defineModule('pressure', {
    i2cAddrs: [0x76],
    pressure: function (m) { var e = env(m); return e ? e.pressureHpa : 1013; },
    temperature: function (m) { var e = env(m); return (e ? e.tempC : 24) + 0.4; },
    currentMa: function () { return 3; },
    readouts: function (m) {
      var d = Q.moduleDef('pressure');
      return [{ label: T('Давление'), value: M.round(d.pressure(m), 1), unit: T('гПа') }, { label: T('Температура'), value: M.round(d.temperature(m), 1), unit: '°C' }];
    },
    hint: T('Давление воздуха — на вкладке «Среда».'),
    api: function (m) {
      var d = Q.moduleDef('pressure');
      return {
        pressure: function () { return M.round(d.pressure(m), 2); },               // hPa
        temperature: function () { return M.round(d.temperature(m), 2); },
        altitude: function (seaLevel) { return M.round(44330 * (1 - Math.pow(d.pressure(m) / (seaLevel || 1013.25), 1 / 5.255)), 1); }   // metres
      };
    }
  });

  /* ---------------------------------------------------------------- color: VEML6040 0x10 + white LED switched by SIG (~20 mA) */
  Q.defineModule('color', {
    i2cAddrs: [0x10],
    state: function () { return { sample: '#ff5a28' }; },       // the object under the sensor ('' = nothing there)
    out: function () { return { led: false }; },
    onSig: function (m, d) { m.out.led = d.type === 'level' ? !!d.v : d.type === 'pwm' ? d.duty > 0.5 : false; m.touch(); },
    counts: function (m) {
      var e = env(m), amb = Math.min(20000, (e ? e.lux : 400) * 6);
      var s = m.state.sample ? hexToRgb(m.state.sample) : null;
      var refl = s && m.out.led ? s.map(function (c) { return c / 255 * 24000; }) : [0, 0, 0];
      var r = U.clamp(amb * 0.95 + refl[0], 0, 65535), g = U.clamp(amb + refl[1], 0, 65535), b = U.clamp(amb * 0.85 + refl[2], 0, 65535);
      return { r: Math.round(r), g: Math.round(g), b: Math.round(b), w: Math.round(U.clamp((r + g + b) * 0.6, 0, 65535)) };
    },
    currentMa: function (m) { return 3 + (m.out.led ? 20 : 0); },
    controls: [{ type: 'color', id: 'sample', label: T('Предмет под датчиком'), allowNone: true }],
    readouts: function (m) {
      var c = Q.moduleDef('color').counts(m);
      return [{ label: 'R G B W', value: c.r + ' · ' + c.g + ' · ' + c.b + ' · ' + c.w }, { label: T('Подсветка'), value: m.out.led ? T('включена') : T('выключена') }];
    },
    tests: [{ type: 'toggle', label: T('Белая подсветка'), get: function (m) { return m.out.led; }, set: function (m, v) { m.api && m.api.light(v); } }],
    hint: T('Поднесите предмет (выберите цвет) и включите подсветку: без неё датчик видит только свет комнаты.'),
    api: function (m, port) {
      var d = Q.moduleDef('color');
      return {
        light: function (on) { port.sig.write(on ? 1 : 0); },
        read: function () { return d.counts(m); },                                       // raw 16-bit counts {r,g,b,w}
        rgb: function () {                                                                // brightest channel scaled to 255
          var c = d.counts(m), mx = Math.max(c.r, c.g, c.b, 1);
          return [Math.round(c.r / mx * 255), Math.round(c.g / mx * 255), Math.round(c.b / mx * 255)];
        }
      };
    }
  });

  /* ---------------------------------------------------------------- imu: LSM6DS3TR-C 0x6A, INT1 -> SIG */
  Q.defineModule('imu', {
    i2cAddrs: [0x6A],
    out: function () { return { int: 0, shaking: false, lastShake: -9 }; },
    sigOut: function (m) { return m.out.int > 0 ? HI : 0; },
    update: function (m, dt) {
      var e = env(m), o = m.out;
      if (o.int > 0) { o.int = Math.max(0, o.int - dt); m.touch(); }
      if (!e) return;
      var s = e.shakeLevel();
      if (s > 0.4 && !o.shaking) { o.shaking = true; o.int = 0.06; o.lastShake = e.t; m.ev.emit('shake'); m.touch(); }
      else if (s < 0.1) o.shaking = false;
    },
    currentMa: function () { return 4; },
    readouts: function (m) {
      var e = env(m);
      if (!e) return [];
      var a = e.accel(), g = e.gyro();
      return [{ label: T('Ускорение x y z'), value: a.map(function (v) { return v.toFixed(2); }).join(' · '), unit: 'g' },
              { label: T('Гироскоп x y z'), value: g.map(function (v) { return Math.round(v); }).join(' · '), unit: T('°/с') }];
    },
    hint: T('Наклон и «встряхнуть» — на вкладке «Среда».'),
    api: function (m) {
      return {
        accel: function () { var a = env(m).accel(); return a.map(function (v) { return M.round(v, 3); }); },    // g, board frame
        gyro: function () { return env(m).gyro().map(function (v) { return M.round(v, 1); }); },                 // deg/s
        tilt: function () {                                                                                      // degrees from gravity
          var a = env(m).accel();
          return { pitch: M.round(Math.atan2(a[1], a[2]) / U.RAD, 1), roll: M.round(-Math.atan2(a[0], Math.hypot(a[1], a[2])) / U.RAD, 1) };
        },
        isShaken: function () { return env(m).t - m.out.lastShake < 0.6; },
        on: M.onApi(m)                       // 'shake'
      };
    }
  });

  /* ---------------------------------------------------------------- compass: LIS3MDL 0x1C. Hard-iron offset is stored in the passport user area */
  var CAL_MARK = 0xC5, CAL_AT = 0x80;
  Q.defineModule('compass', {
    i2cAddrs: [0x1C],
    out: function () { return { cal: null }; },
    update: function (m) {
      var c = m.out.cal, e = env(m);
      if (c && e) {
        var f = e.field();
        for (var i = 0; i < 3; i++) { c.min[i] = Math.min(c.min[i], f[i]); c.max[i] = Math.max(c.max[i], f[i]); }
        m.touch();
      }
    },
    offsets: function (m) {
      var ee = m.eeprom;
      if (ee[CAL_AT] !== CAL_MARK) return null;
      var dv = new DataView(ee.buffer, ee.byteOffset, ee.byteLength);
      return [dv.getInt16(CAL_AT + 1, true) / 1000, dv.getInt16(CAL_AT + 3, true) / 1000, dv.getInt16(CAL_AT + 5, true) / 1000];
    },
    currentMa: function () { return 4; },
    readouts: function (m) {
      var e = env(m), d = Q.moduleDef('compass');
      if (!e) return [];
      var f = e.field(), off = d.offsets(m) || [0, 0, 0];
      var hd = U.mod(Math.atan2(-(f[0] - off[0]), f[1] - off[1]) / U.RAD, 360);
      return [{ label: T('Поле x y z'), value: f.map(function (v) { return v.toFixed(2); }).join(' · '), unit: T('Гс') },
              { label: T('Курс'), value: Math.round(hd), unit: '°' },
              { label: T('Калибровка'), value: d.offsets(m) ? T('есть') : m.out.cal ? T('идёт — повращайте плату') : T('нет') }];
    },
    hint: T('Поворот платы (курс) — на вкладке «Среда». Магниты порта дают постоянное смещение: сделайте калибровку.'),
    tests: [
      { type: 'action', label: T('Начать калибровку'), run: function (m) { m.api && m.api.calibrate(true); } },
      { type: 'action', label: T('Закончить калибровку'), run: function (m) { m.api && m.api.calibrate(false); } },
      { type: 'action', label: T('Стереть калибровку'), run: function (m) { m.api && m.api.clearCalibration(); } }
    ],
    api: function (m) {
      var d = Q.moduleDef('compass');
      return {
        field: function () { return env(m).field().map(function (v) { return M.round(v, 3); }); },          // gauss, raw
        heading: function () {                                                                              // degrees, board kept flat
          var f = env(m).field(), off = d.offsets(m) || [0, 0, 0];
          return M.round(U.mod(Math.atan2(-(f[0] - off[0]), f[1] - off[1]) / U.RAD, 360), 1);
        },
        isCalibrated: function () { return !!d.offsets(m); },
        calibrate: function (on) {
          if (on) { var f = env(m).field(); m.out.cal = { min: f.slice(), max: f.slice() }; return; }
          var c = m.out.cal;
          if (!c) return;
          var dv = new DataView(m.eeprom.buffer, m.eeprom.byteOffset, m.eeprom.byteLength);
          m.eeprom[CAL_AT] = CAL_MARK;
          for (var i = 0; i < 3; i++) dv.setInt16(CAL_AT + 1 + 2 * i, Math.round((c.min[i] + c.max[i]) / 2 * 1000), true);
          m.out.cal = null; m.touch();
        },
        clearCalibration: function () { m.eeprom[CAL_AT] = 0xFF; m.touch(); }
      };
    }
  });

  /* ---------------------------------------------------------------- rtc: DS3231 0x68, INT/SQW -> SIG, CR1220 back-up */
  Q.defineModule('rtc', {
    i2cAddrs: [0x68],
    state: function () { return { offsetMs: 0 }; },
    out: function () { return { sqw: false, alarm: null, alarmFlag: false }; },
    time: function (m) { return new Date((m.board ? m.board.now() : Date.now()) + m.state.offsetMs); },
    sigOut: function (m) {
      if (m.out.sqw) return Math.floor((m.board ? m.board.now() : Date.now()) / 500) % 2 ? HI : 0;      // 1 Hz square wave
      return m.out.alarmFlag ? 0 : HI;                                                                       // open drain, 10k pull-up
    },
    update: function (m) {
      var a = m.out.alarm;
      if (a && !m.out.alarmFlag) {
        var t = Q.moduleDef('rtc').time(m);
        if (t.getHours() === a[0] && t.getMinutes() === a[1] && t.getSeconds() === a[2]) { m.out.alarmFlag = true; m.ev.emit('alarm'); m.touch(); }
      }
    },
    currentMa: function () { return 3; },
    readouts: function (m) {
      var t = Q.moduleDef('rtc').time(m), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      return [{ label: T('Время'), value: p2(t.getHours()) + ':' + p2(t.getMinutes()) + ':' + p2(t.getSeconds()) },
              { label: T('Дата'), value: p2(t.getDate()) + '.' + p2(t.getMonth() + 1) + '.' + t.getFullYear() }];
    },
    tests: [
      { type: 'action', label: T('Поставить время «сейчас + 1 час»'), run: function (m) { m.set('offsetMs', m.state.offsetMs + 3600e3); } },
      { type: 'action', label: T('Сбросить на время компьютера'), run: function (m) { m.set('offsetMs', 0); } }
    ],
    api: function (m, port) {
      var d = Q.moduleDef('rtc');
      return {
        now: function () {
          var t = d.time(m);
          return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), hour: t.getHours(), minute: t.getMinutes(), second: t.getSeconds(), weekday: t.getDay() };
        },
        unix: function () { return Math.floor(d.time(m).getTime() / 1000); },
        setTime: function (y, mo, dd, h, mi, s) {
          var target = new Date(y, mo - 1, dd, h, mi, s).getTime();
          m.set('offsetMs', target - (m.board ? m.board.now() : Date.now()));
        },
        temperature: function () { var e = env(m); return M.round((e ? e.tempC : 24) + 1.5, 2); },
        squareWave: function (on) { m.out.sqw = !!on; m.touch(); },
        setAlarm: function (h, mi, s) { m.out.alarm = [h, mi, s || 0]; m.out.alarmFlag = false; m.touch(); },
        alarmFired: function () { return m.out.alarmFlag; },
        clearAlarm: function () { m.out.alarm = null; m.out.alarmFlag = false; m.touch(); },
        on: M.onApi(m)                       // 'alarm'
      };
    }
  });

  /* ---------------------------------------------------------------- airq: SGP40 0x59 (VOC) + AHT20 0x38 */
  Q.defineModule('airq', {
    i2cAddrs: [0x59, 0x38],
    out: function () { return { age: 0 }; },
    update: function (m, dt) { if (m.out.age < 12) { m.out.age += dt; m.touch(); } },
    voc: function (m) { var e = env(m); return e ? e.voc : 100; },
    currentMa: function () { return 6; },
    readouts: function (m) {
      var warm = m.out.age >= 12;
      return [{ label: T('Индекс VOC'), value: warm ? Math.round(Q.moduleDef('airq').voc(m)) : T('прогрев… %1 с', Math.max(0, Math.ceil(12 - m.out.age))) },
              { label: T('Температура'), value: M.round(env(m) ? env(m).tempC : 24, 1), unit: '°C' }];
    },
    hint: T('Загрязнение воздуха — на вкладке «Среда». Первые секунды датчику нужен прогрев.'),
    api: function (m) {
      var d = Q.moduleDef('airq');
      return {
        vocIndex: function () { return m.out.age >= 12 ? Math.round(d.voc(m)) : 0; },            // 0..500, 100 = normal air
        vocRaw: function () { return Math.round(U.clamp(30000 - (d.voc(m) - 100) * 55, 1000, 65000)); },
        temperature: function () { return M.round(env(m).tempC, 2); },
        humidity: function () { return M.round(env(m).humidity, 1); },
        isWarm: function () { return m.out.age >= 12; }
      };
    }
  });

  /* ---------------------------------------------------------------- gesture / proximity: VCNL4040 0x60, INT -> SIG (active low) */
  Q.defineModule('gesture', {
    i2cAddrs: [0x60],
    state: function () { return { hand: 20 }; },                     // cm to the hand, 20 = no hand
    out: function () { return { thr: 0, int: false, wave: -1 }; },
    percent: function (m) { return U.clamp(100 * Math.pow(1 - m.state.hand / 20, 2.2), 0, 100); },
    sigOut: function (m) { return m.out.int ? 0 : HI; },
    update: function (m, dt) {
      var o = m.out;
      if (o.wave >= 0) {                                              // a scripted hand wave: 20 cm -> 3 cm -> 20 cm in 0.7 s
        o.wave += dt;
        var k = o.wave / 0.7;
        if (k >= 1) { o.wave = -1; m.set('hand', 20); }
        else m.set('hand', 20 - 17 * Math.sin(Math.PI * k));
      }
      var on = o.thr > 0 && Q.moduleDef('gesture').percent(m) >= o.thr;
      if (on !== o.int) { o.int = on; m.touch(); }
    },
    currentMa: function () { return 5; },
    controls: [{ type: 'range', id: 'hand', label: T('Расстояние до руки'), min: 1, max: 20, step: 0.5, fmt: function (v) { return v >= 20 ? T('нет руки') : T('%1 см', v); } },
               { type: 'action', label: T('Взмах рукой'), run: function (m) { m.out.wave = 0; } }],
    readouts: function (m) {
      var e = env(m);
      return [{ label: T('Близость'), value: Math.round(Q.moduleDef('gesture').percent(m)), unit: '%' },
              { label: T('Освещённость'), value: Math.round(e ? e.lux : 400), unit: T('лк') }];
    },
    api: function (m, port, board) {
      var d = Q.moduleDef('gesture'), above = false, t0 = -9;
      m.cleanups.push(board.on('step', function () {                  // wave detector: up and down again within 0.8 s
        var p = d.percent(m);
        if (p > 30 && !above) { above = true; t0 = board.time; }
        if (p < 12 && above) { above = false; if (board.time - t0 < 0.8) m.ev.emit('wave'); }
      }));
      return {
        proximity: function () { return M.round(d.percent(m), 1); },     // 0 .. 100 %
        distanceCm: function () { return m.state.hand >= 20 ? null : M.round(m.state.hand, 1); },
        light: function () { return Math.round(env(m).lux); },
        setThreshold: function (percent) { m.out.thr = U.clamp(percent, 0, 100); },     // INT on SIG goes low above it (0 = off)
        isNear: function () { return port.sig.read() === 0; },
        on: M.onApi(m)                       // 'wave'
      };
    }
  });

  /* ---------------------------------------------------------------- rfid: MFRC522 0x28, IRQ -> SIG */
  var CARDS = [
    { name: T('Карта MIFARE Classic 1K'), uid: [0x04, 0xA3, 0x5F, 0x21] },
    { name: T('Брелок MIFARE'), uid: [0xDE, 0xAD, 0xBE, 0xEF] },
    { name: T('Метка NTAG213'), uid: [0x04, 0x5B, 0xC2, 0x1A, 0x7D, 0x6E, 0x80] }
  ];
  function uidText(u) { return u.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16).toUpperCase(); }).join(':'); }
  Q.defineModule('rfid', {
    cards: CARDS,
    i2c: function () {
      var ptr = 0;
      return { 0x28: { partial: true,
        write: function (b) { if (b.length) ptr = b[0] & 0x3F; return true; },
        read: function (n) { var o = new Uint8Array(n); for (var i = 0; i < n; i++) { o[i] = ((ptr + i) & 0x3F) === 0x37 ? 0x92 : 0; } return o; } } };   // only VersionReg
    },
    state: function () { return { card: -1 }; },                     // index in CARDS, -1 = none
    out: function () { return { irq: 0, pending: 0, seen: -1 }; },
    sigOut: function (m) { return m.out.irq > 0 ? 0 : HI; },
    onState: function (m, k, v) { if (k === 'card') m.out.pending = 0.08; },
    update: function (m, dt) {
      var o = m.out;
      if (o.irq > 0) { o.irq = Math.max(0, o.irq - dt); m.touch(); }
      if (o.pending > 0) {
        o.pending -= dt;
        if (o.pending <= 0) {
          var c = m.state.card;
          if (c >= 0 && o.seen !== c) { o.seen = c; o.irq = 0.03; m.ev.emit('card', uidText(CARDS[c].uid)); }
          else if (c < 0 && o.seen >= 0) { o.seen = -1; m.ev.emit('removed'); }
          m.touch();
        }
      }
    },
    currentMa: function (m) { return 6 + (m.state.card >= 0 ? 55 : 22); },
    controls: [{ type: 'select', id: 'card', label: T('Приложить к антенне'),
                 options: [{ v: -1, t: T('ничего') }].concat(CARDS.map(function (c, i) { return { v: i, t: c.name }; })) }],
    readouts: function (m) {
      var c = m.state.card;
      return [{ label: T('Метка'), value: c >= 0 ? CARDS[c].name : T('нет') }, { label: 'UID', value: c >= 0 ? uidText(CARDS[c].uid) : '—' }];
    },
    api: function (m) {
      return {
        cardPresent: function () { return m.out.seen >= 0 && m.state.card >= 0; },
        uid: function () { return m.state.card >= 0 && m.out.seen >= 0 ? uidText(CARDS[m.state.card].uid) : null; },
        cardType: function () { return m.state.card >= 0 ? CARDS[m.state.card].name : null; },
        on: M.onApi(m)                       // 'card' (uid text), 'removed'
      };
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
