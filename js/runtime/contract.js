/* The simulator's side of the qbit contract (spec.js): for every module on the virtual board it plays the part of the firmware's C driver
   - turns what the module's hardware model shows (SIG level, I2C registers) into the named values, events and commands a program uses.
   The module models in js/core/modules know nothing about this layer; they are the "hardware", this is the "firmware".

   Contract(board):
     .info(n)                     port summary {n, state, key, title, values, text}
     .module(n, key)              the driver on port n; throws a clear error if the port is empty or holds another module
     .get(n, key, name)           a value, typed as in the spec
     .command(n, key, name, args) run a command (args are Python values; they are turned into words like the console does)
     .on(fn)                      fn({port, kind, value, text}) for every event (kinds as in the firmware: press, release, click, long, change, turn, code, fault, key)
     .find(key, nth)              port number of the nth module of that kind, 0 = none */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util;

  function ContractError(msg) { var e = new Error(msg); e.name = 'ContractError'; return e; }
  function num(s, def) { var v = parseFloat(s); return isNaN(v) ? def : v; }
  function intArg(argv, i, def) { if (i >= argv.length) return def; var v = parseInt(argv[i], 10); return isNaN(v) ? def : v; }
  function fArg(argv, i, def) { if (i >= argv.length) return def; var v = parseFloat(argv[i]); return isNaN(v) ? def : v; }
  function need(argv, n, usage) { if (argv.length < n) throw ContractError(T('не хватает аргументов: %1', usage)); }
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
  function is(a, b) { return String(a).toLowerCase() === b; }

  /* ================================================================================================ the drivers */
  var DRIVERS = {};

  /* ---- digital inputs: debounce, press / release / click / double click / long, like drv_input.c */
  var CLICK_MS = 600, DOUBLE_MS = 300, LONG_MS = 800;
  function digital(read, debounce, buttonlike) {
    return function (c) {
      var level = -1, raw = -1, rawT = 0, downT = 0, clickT = 0, clicks = 0, longSent = false, count = 0, vals = [0, 0];
      return {
        vals: function () { return { _: 0 }; },
        value: function (name) {
          if (name === 'pressed' || name === 'on' || name === 'tilted' || name === 'motion' || name === 'magnet') return level === 1 ? 1 : 0;
          return count;
        },
        poll: function (now) {
          var r = read(c.api) ? 1 : 0;
          if (r !== raw) { raw = r; rawT = now; }
          if (r !== level && now - rawT >= debounce) {
            var first = level < 0;
            level = r;
            if (!first) {
              if (buttonlike) {
                if (r) { downT = now; longSent = false; c.emit('press', 1); }
                else { c.emit('release', 0); if (!longSent && now - downT < CLICK_MS) { clicks++; clickT = now; } }
              } else { if (r) count++; c.emit('change', r); }
            }
          }
          if (buttonlike) {
            if (level === 1 && !longSent && now - downT >= LONG_MS) { longSent = true; clicks = 0; c.emit('long', 1); }
            if (clicks && level === 0 && now - clickT > DOUBLE_MS) { count++; c.emit('click', clicks >= 2 ? 2 : 1); clicks = 0; }
          }
        },
        cmd: function (argv) { if (is(argv[0], 'reset')) { count = 0; return; } throw ContractError(T('нет такой команды: %1', argv[0])); }
      };
    };
  }
  DRIVERS.button = digital(function (a) { return a.isPressed(); }, 15, true);
  DRIVERS.touch = digital(function (a) { return a.isTouched(); }, 15, true);
  DRIVERS['switch'] = digital(function (a) { return a.isOn(); }, 30, false);
  DRIVERS.tilt = digital(function (a) { return a.isTilted(); }, 40, false);
  DRIVERS.pir = digital(function (a) { return a.isMotion(); }, 50, false);
  DRIVERS.hall = digital(function (a) { return a.isMagnetNear(); }, 20, false);

  /* ---- analog: pot / slider / light */
  function linear(second) {
    return function (c) {
      return { value: function (name) { return name === 'mv' ? Math.round(c.api.millivolts()) : Math.round(c.api.percent()); }, cmd: noCmd };
    };
  }
  function noCmd(argv) { throw ContractError(T('у этого модуля нет команд (%1)', argv[0])); }
  DRIVERS.pot = linear(); DRIVERS.slider = linear(); DRIVERS.light = linear();

  /* ---- joystick and keypad */
  DRIVERS.joystick = function (c) {
    var names = Q.SPEC.modules.joystick.dirNames, dir = 0, pressed = false;
    function dirNow() { var d = c.api.direction(); var i = names.indexOf(d); return i < 0 ? 0 : i; }
    return {
      value: function (name) {
        if (name === 'x') return c.api.x(); if (name === 'y') return c.api.y();
        if (name === 'pressed') return c.api.isPressed() ? 1 : 0;
        return dirNow();
      },
      poll: function () {
        var d = dirNow(), p = c.api.isPressed();
        if (p !== pressed) { pressed = p; c.emit(p ? 'press' : 'release', 0); }
        if (d !== dir) { dir = d; c.emit('change', d, names[d]); }
      },
      cmd: noCmd
    };
  };
  DRIVERS.keypad = function (c) {
    var key = 0, count = 0;
    return {
      value: function (name) { return name === 'count' ? count : (c.api.pressed()[0] || 0); },
      poll: function () {
        var k = c.api.pressed()[0] || 0;
        if (k !== key) { if (key) c.emit('release', key); if (k) { count++; c.emit('press', k); } key = k; }
      },
      cmd: noCmd
    };
  };
  DRIVERS.pulse = function (c) {
    var beatUntil = 0;
    c.m.ev.on('beat', function () { beatUntil = c.now() + 100; c.emit('change', c.api.bpm(), 'beat'); });
    return {
      value: function (name) {
        if (name === 'bpm') return c.api.bpm();
        if (name === 'signal') return Math.round(c.api.millivolts() - 1650);
        return c.now() < beatUntil ? 1 : 0;
      },
      cmd: noCmd
    };
  };
  DRIVERS.encoder = function (c) {
    var last = c.api.position();
    ['press', 'release', 'long'].forEach(function (k) { c.m.ev.on(k, function () { c.emit(k, k === 'press' ? 1 : k === 'long' ? 1 : 0); }); });
    c.m.ev.on('click', function () { c.emit('click', 1); });
    return {
      value: function (name) { return name === 'position' ? c.api.position() : (c.api.isPressed() ? 1 : 0); },
      poll: function () { var p = c.api.position(); if (p !== last) { c.emit('turn', p - last); last = p; } },
      cmd: function (argv) {
        if (is(argv[0], 'zero')) { c.api.reset(); last = 0; return; }
        if (is(argv[0], 'counts')) { var n = intArg(argv, 1, 0); if (n < 1 || n > 8) throw ContractError('counts: 1…8'); c.api.setCountsPerDetent(n); return; }
        throw ContractError(T('нет такой команды: %1', argv[0]));
      }
    };
  };

  /* ---- environment sensors */
  DRIVERS.temphum = function (c) { return { value: function (n) { return n === 'temperature' ? Math.round(c.api.temperature() * 10) / 10 : Math.round(c.api.humidity()); }, cmd: noCmd }; };
  DRIVERS.pressure = function (c) {
    var sea = 1013.25, zeroP = null;
    return {
      value: function (n) {
        if (n === 'pressure') return Math.round(c.api.pressure() * 10) / 10;
        if (n === 'temperature') return Math.round(c.api.temperature() * 10) / 10;
        if (zeroP !== null) return Math.round(44330 * (1 - Math.pow(c.api.pressure() / zeroP, 1 / 5.255)) * 10) / 10;
        return c.api.altitude(sea);
      },
      cmd: function (argv) {
        if (is(argv[0], 'sealevel')) { var v = fArg(argv, 1, 0); if (v < 800 || v > 1200) throw ContractError(T('sealevel: 800…1200 гПа')); sea = v; zeroP = null; return; }
        if (is(argv[0], 'zero')) { zeroP = c.api.pressure(); return; }
        throw ContractError(T('нет такой команды: %1', argv[0]));
      }
    };
  };
  DRIVERS.airq = function (c) {
    return { value: function (n) { return n === 'voc' ? c.api.vocIndex() : n === 'raw' ? c.api.vocRaw() : n === 'temperature' ? Math.round(c.api.temperature() * 10) / 10 : Math.round(c.api.humidity()); }, cmd: noCmd };
  };
  DRIVERS.color = function (c) {
    var light = false;
    return {
      value: function (n) {
        if (n === 'light') return light ? 1 : 0;
        if (n === 'lux') return Math.round((c.board.env && c.board.env.lux) || 0);
        var rgb = c.api.rgb(); return n === 'r' ? rgb[0] : n === 'g' ? rgb[1] : rgb[2];
      },
      cmd: function (argv) {
        if (is(argv[0], 'light') && argv.length >= 2) { light = is(argv[1], 'on') || argv[1] === '1'; c.api.light(light); return; }
        throw ContractError('light on | light off');
      }
    };
  };
  DRIVERS.ultrasonic = function (c) {
    return {
      value: function (n) { if (n === 'echo') return c.api.echoUs(); var d = c.api.distanceCm(); return d === null ? 0 : Math.round(d); },
      cmd: function (argv) {
        if (is(argv[0], 'temperature')) { c.api.setAirTemperature(intArg(argv, 1, 20)); return; }
        if (is(argv[0], 'threshold')) return;
        throw ContractError(T('нет такой команды: %1', argv[0]));
      }
    };
  };
  DRIVERS.imu = function (c) {
    c.m.ev.on('shake', function () { c.emit('change', 1, 'shake'); });
    return {
      value: function (n) {
        var a = c.api.accel(), g = c.api.gyro(), t = c.api.tilt();
        switch (n) { case 'ax': return Math.round(a[0] * 100) / 100; case 'ay': return Math.round(a[1] * 100) / 100; case 'az': return Math.round(a[2] * 100) / 100;
          case 'gx': return Math.round(g[0]); case 'gy': return Math.round(g[1]); case 'gz': return Math.round(g[2]);
          case 'pitch': return Math.round(t.pitch); default: return Math.round(t.roll); }
      },
      cmd: noCmd
    };
  };
  DRIVERS.compass = function (c) {
    var calTimer = 0;
    return {
      value: function (n) { if (n === 'heading') return Math.round(c.api.heading()); var f = c.api.field(); return Math.round(f[n === 'x' ? 0 : n === 'y' ? 1 : 2] * 1000) / 10; },
      cmd: function (argv) {
        if (is(argv[0], 'calibrate')) {
          var s = fArg(argv, 1, 10); c.api.calibrate(true);
          if (calTimer) c.board.cancel(calTimer);
          calTimer = c.board.after(s, function () { c.api.calibrate(false); calTimer = 0; });
          return;
        }
        if (is(argv[0], 'uncalibrate')) { c.api.clearCalibration(); return; }
        throw ContractError(T('нет такой команды: %1', argv[0]));
      },
      deinit: function () { if (calTimer) c.board.cancel(calTimer); }
    };
  };
  DRIVERS.gesture = function (c) {
    var near = false, since = 0, held = false;
    c.m.ev.on('wave', function () { c.emit('click', 1, 'wave'); });
    return {
      value: function (n) { return n === 'proximity' ? Math.round(c.api.proximity()) : n === 'near' ? (near ? 1 : 0) : c.api.light(); },
      poll: function (now) {
        var p = c.api.proximity();
        if (!near && p > 40) { near = true; since = now; held = false; c.emit('change', 1, 'near'); }
        else if (near && p < 25) { near = false; c.emit('change', 0, 'far'); }
        if (near && !held && now - since > 1000) { held = true; c.emit('long', 1, 'hold'); }
      },
      cmd: function (argv) {
        if (is(argv[0], 'threshold')) { c.api.setThreshold(clamp(intArg(argv, 1, 0) / 10, 0, 100)); return; }
        if (is(argv[0], 'relearn')) return;
        throw ContractError(T('нет такой команды: %1', argv[0]));
      }
    };
  };
  DRIVERS.rtc = function (c) {
    return {
      value: function (n) { if (n === 'temperature') return Math.round(c.api.temperature() * 100) / 100; var t = c.api.now(); return t[n]; },
      cmd: function (argv) {
        if (!is(argv[0], 'set')) throw ContractError('set YYYY-MM-DD HH:MM[:SS]');
        var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(argv[1] || ''), t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(argv[2] || '');
        if (!m || !t) throw ContractError('set YYYY-MM-DD HH:MM[:SS]');
        c.api.setTime(+m[1], +m[2], +m[3], +t[1], +t[2], +(t[3] || 0));
      }
    };
  };
  DRIVERS.irrx = function (c) {
    var last = null, count = 0;
    c.m.ev.on('code', function (f) { last = f; count++; c.emit('code', (f.command & 255) | ((f.address & 0xFFFF) << 8), f.protocol + ' ' + f.address + '/' + f.command); });
    return { value: function (n) { return n === 'code' ? (last ? last.command : 0) : n === 'address' ? (last ? last.address : 0) : n === 'count' ? count : 0; }, cmd: noCmd };
  };
  DRIVERS.irtx = function (c) {
    var sent = 0, code = 0;
    return {
      value: function (n) { return n === 'sent' ? sent : code; },
      cmd: function (argv) {
        if (!is(argv[0], 'nec')) throw ContractError('nec <address> <command> [repeats]');
        need(argv, 3, 'nec <address> <command> [repeats]');
        c.api.send(intArg(argv, 1, 0), intArg(argv, 2, 0)); sent++; code = intArg(argv, 2, 0);
      }
    };
  };
  DRIVERS.rfid = function (c) {
    var count = 0;
    c.m.ev.on('card', function (uid) { count++; c.emit('code', parseInt(uid.replace(/:/g, '').slice(0, 8), 16) | 0, uid); });
    c.m.ev.on('removed', function () { c.emit('change', 0, 'removed'); });
    return {
      value: function (n) { return n === 'present' ? (c.api.cardPresent() ? 1 : 0) : n === 'count' ? count : (c.api.uid() || ''); },
      text: function () { return c.api.uid() || ''; },
      cmd: noCmd
    };
  };

  /* ---- outputs */
  DRIVERS.led = function (c) {
    var level = 100, on = false, out = false, blinkMs = 0, blinkLeft = -1, blinkT = 0;
    function apply(lit) { out = lit; c.api.brightness(lit ? Math.pow(level / 100, 2.2) * 100 : 0); }
    apply(false);
    return {
      value: function () { return out ? Math.round(level) : 0; },
      text: function () { return ['white', 'red', 'yellow', 'green', 'blue'][c.m.variant] || ''; },
      poll: function (now) {
        if (!blinkMs || now - blinkT < blinkMs / 2) return;
        blinkT = now; apply(!out);
        if (blinkLeft > 0 && --blinkLeft === 0) { blinkMs = 0; apply(on); }
      },
      cmd: function (argv) {
        blinkMs = 0;
        var w = String(argv[0]).toLowerCase();
        if (w === 'on') { if (argv.length > 1) level = clamp(fArg(argv, 1, level), 0, 100); on = true; }
        else if (w === 'off') on = false;
        else if (w === 'toggle') on = !on;
        else if (w === 'brightness') { need(argv, 2, 'brightness <0..100>'); level = clamp(fArg(argv, 1, 100), 0, 100); on = level > 0; }
        else if (w === 'blink') {
          var p = intArg(argv, 1, 500); blinkMs = p >= 40 ? p : 500;
          var n = intArg(argv, 2, 0); blinkLeft = n > 0 ? 2 * n : -1;
          blinkT = c.now(); apply(true); return;
        } else throw ContractError(T('нет такой команды: %1', argv[0]));
        apply(on);
      },
      deinit: function () { try { c.api.off(); } catch (e) { /* the module is gone */ } }
    };
  };

  var RGB_NAMES = { red: 0xFF0000, green: 0x00FF00, blue: 0x0000FF, white: 0xFFFFFF, yellow: 0xFFB000, orange: 0xFF4000, purple: 0x8000FF, pink: 0xFF2060, cyan: 0x00FFFF, magenta: 0xFF00FF };
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var cc = v * s, x = cc * (1 - Math.abs((h / 60) % 2 - 1)), m = v - cc, r, g, b;
    if (h < 60) { r = cc; g = x; b = 0; } else if (h < 120) { r = x; g = cc; b = 0; } else if (h < 180) { r = 0; g = cc; b = x; }
    else if (h < 240) { r = 0; g = x; b = cc; } else if (h < 300) { r = x; g = 0; b = cc; } else { r = cc; g = 0; b = x; }
    return [Math.floor((r + m) * 255), Math.floor((g + m) * 255), Math.floor((b + m) * 255)];
  }
  DRIVERS.rgb = function (c) {
    var rgb = [0, 0, 0], bright = 30, on = false, anim = 0, t0 = 0;
    function send(r, g, b) { var k = bright / 100; k *= k; c.api.color(Math.floor(r * k), Math.floor(g * k), Math.floor(b * k)); }
    function show() { send(on ? rgb[0] : 0, on ? rgb[1] : 0, on ? rgb[2] : 0); }
    show();
    return {
      value: function (n) { return n === 'brightness' ? bright : on ? rgb[n === 'r' ? 0 : n === 'g' ? 1 : 2] : 0; },
      poll: function (now) {
        var t = now - t0;
        if (anim === 1) { var q = hsvToRgb(t * 0.12, 1, 1); send(q[0], q[1], q[2]); }
        else if (anim === 2) { var lit = Math.floor(t / 250) % 2 === 0; send(lit ? rgb[0] : 0, lit ? rgb[1] : 0, lit ? rgb[2] : 0); }
      },
      cmd: function (argv) {
        anim = 0;
        var w = String(argv[0]).toLowerCase();
        if (w === 'color' || w === 'colour') {
          if (argv.length >= 4 && !isNaN(parseInt(argv[1], 10))) rgb = [clamp(intArg(argv, 1, 0), 0, 255), clamp(intArg(argv, 2, 0), 0, 255), clamp(intArg(argv, 3, 0), 0, 255)];
          else if (argv.length >= 2) {
            var name = String(argv[1]).toLowerCase(), v;
            if (RGB_NAMES[name] !== undefined) v = RGB_NAMES[name];
            else if (argv[1][0] === '#' && /^#[0-9a-fA-F]{6}$/.test(argv[1])) v = parseInt(argv[1].slice(1), 16);
            else throw ContractError(T('неизвестный цвет: %1', argv[1]));
            rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
          } else throw ContractError('color <r> <g> <b> | color red | color #FF8000');
          on = true;
        } else if (w === 'hsv') { rgb = hsvToRgb(fArg(argv, 1, 0), fArg(argv, 2, 100) / 100, fArg(argv, 3, 100) / 100); on = true; }
        else if (w === 'brightness') { bright = clamp(fArg(argv, 1, 30), 0, 100); }
        else if (w === 'on') { if (!(rgb[0] | rgb[1] | rgb[2])) rgb = [255, 255, 255]; on = true; }
        else if (w === 'off') on = false;
        else if (w === 'rainbow') { anim = 1; t0 = c.now(); return; }
        else if (w === 'blink') { anim = 2; on = true; t0 = c.now(); return; }
        else throw ContractError(T('нет такой команды: %1', argv[0]));
        show();
      },
      deinit: function () { try { c.api.off(); } catch (e) { /* gone */ } }
    };
  };

  DRIVERS.relay = function (c) {
    var on = false, pulseEnd = 0;
    function set(v) { on = v; v ? c.api.on() : c.api.off(); }
    set(false);
    return {
      value: function () { return on ? 1 : 0; },
      poll: function (now) { if (pulseEnd && now >= pulseEnd) { pulseEnd = 0; set(false); } },
      cmd: function (argv) {
        pulseEnd = 0;
        var w = String(argv[0]).toLowerCase();
        if (w === 'on') set(true); else if (w === 'off') set(false); else if (w === 'toggle') set(!on);
        else if (w === 'pulse') { var ms = intArg(argv, 1, 500); set(true); pulseEnd = c.now() + Math.max(20, ms); }
        else throw ContractError(T('нет такой команды: %1', argv[0]));
      },
      deinit: function () { try { c.api.off(); } catch (e) { /* gone */ } }
    };
  };

  var NOTE_SEMI = { A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 };
  function parseNote(s, dur) {
    var ms = dur, colon = s.indexOf(':');
    if (colon >= 0) { ms = parseInt(s.slice(colon + 1), 10) || dur; }
    var ch = s[0].toUpperCase();
    if (ch === 'R') return { f: 0, ms: ms };
    if (/[0-9]/.test(ch)) return { f: parseInt(s, 10), ms: ms };
    if (!(ch in NOTE_SEMI)) return null;
    var st = NOTE_SEMI[ch], i = 1;
    if (s[i] === '#') { st++; i++; } else if (s[i] === 'b') { st--; i++; }
    var oct = /[0-9]/.test(s[i] || '') ? +s[i] : 4, midi = 12 * (oct + 1) + st;
    return { f: Math.round(440 * Math.pow(2, (midi - 69) / 12)), ms: ms };
  }
  DRIVERS.buzzer = function (c) {
    var freq = 0, volume = 1, until = 0, seq = [], idx = 0, playing = false;
    function tone(f) {
      if (f < 20 || volume <= 0) { c.port.sig.write(0); freq = 0; }
      else { c.port.sig.pwm(f, 0.5 * volume); freq = f; }
    }
    return {
      value: function (n) { return n === 'freq' ? freq : (playing ? 1 : 0); },
      poll: function (now) {
        if (!until || now < until) return;
        if (idx < seq.length) { tone(seq[idx].f); until = now + seq[idx].ms; idx++; }
        else { tone(0); until = 0; seq = []; playing = false; }
      },
      cmd: function (argv) {
        seq = []; idx = 0; until = 0; playing = false;
        var w = String(argv[0]).toLowerCase();
        if (w === 'tone') { need(argv, 2, 'tone <Hz> [ms]'); tone(intArg(argv, 1, 0)); var ms = intArg(argv, 2, 0); if (ms > 0) until = c.now() + ms; }
        else if (w === 'beep') { tone(2700); until = c.now() + intArg(argv, 1, 100); }
        else if (w === 'off') tone(0);
        else if (w === 'volume') { volume = clamp(intArg(argv, 1, 100), 0, 100) / 100; }
        else if (w === 'play') {
          var dur = 200;
          for (var i = 1; i < argv.length && seq.length < 64; i++) {
            var nt = parseNote(String(argv[i]), dur);
            if (!nt) throw ContractError(T('не понимаю ноту «%1»', argv[i]));
            dur = nt.ms;
            seq.push({ f: nt.f, ms: Math.floor(nt.ms * 9 / 10) }, { f: 0, ms: nt.ms - Math.floor(nt.ms * 9 / 10) });
          }
          playing = true; until = c.now();
        } else throw ContractError(T('нет такой команды: %1', argv[0]));
      },
      deinit: function () { try { c.port.sig.write(0); } catch (e) { /* gone */ } }
    };
  };

  DRIVERS.servo = function (c) {
    var angle = NaN;
    return {
      value: function () { return isNaN(angle) ? -1 : angle; },
      cmd: function (argv) {
        var w = String(argv[0]).toLowerCase();
        if (w === 'angle') { need(argv, 2, 'angle <0..180>'); var v = clamp(fArg(argv, 1, 90), 0, 180); angle = Math.round(v); c.api.angle(v); }
        else if (w === 'us') { need(argv, 2, 'us <500..2500>'); var us = clamp(fArg(argv, 1, 1500), 400, 2600); angle = Math.round((us - 500) / 2000 * 180); c.api.pulse(us); }
        else if (w === 'off') { c.api.release(); angle = NaN; }
        else throw ContractError(T('нет такой команды: %1', argv[0]));
      },
      deinit: function () { try { c.api.release(); } catch (e) { /* gone */ } }
    };
  };

  DRIVERS.motor = function (c) {
    var speed = 0, faulted = false;
    c.m.ev.on('fault', function () { faulted = true; c.emit('fault', 0x11, 'current limit'); });
    return {
      value: function (n) { return n === 'speed' ? speed : (c.api.isFault() ? 1 : 0); },
      cmd: function (argv) {
        var w = String(argv[0]).toLowerCase();
        if (w === 'speed') { need(argv, 2, 'speed <-100..100>'); speed = clamp(intArg(argv, 1, 0), -100, 100); c.api.speed(speed); }
        else if (w === 'forward') { speed = clamp(intArg(argv, 1, 100), 0, 100); c.api.speed(speed); }
        else if (w === 'backward') { speed = -clamp(intArg(argv, 1, 100), 0, 100); c.api.speed(speed); }
        else if (w === 'stop') { speed = 0; c.api.stop(); }
        else if (w === 'brake') { speed = 0; c.api.brake(); }
        else throw ContractError(T('нет такой команды: %1', argv[0]));
      },
      deinit: function () { try { c.api.stop(); } catch (e) { /* gone */ } }
    };
  };

  /* ---- OLED: a console-like text area (21 x 8) over the free-drawing commands, as in drv_oled.c */
  DRIVERS.oled = function (c) {
    var cx = 0, cy = 0, scale = 1, dirty = true;
    var a = c.api;
    a.clear(); a.show();
    function drawChar(ch, col, row) { a.rect(col * 6, row * 8, 6, 8, true, 0); a.text(ch, col * 6, row * 8, 1); }
    function scrollUp() { a.scrollUp(8); }
    return {
      value: function () { return 0; },
      poll: function (now) { if (dirty) { dirty = false; a.show(); } },
      cmd: function (argv) {
        var w = String(argv[0]).toLowerCase(), text;
        function join(from) { return argv.slice(from).join(' '); }
        if (w === 'clear') { a.clear(); cx = cy = 0; }
        else if (w === 'text') { need(argv, 4, 'text <x> <y> <text>'); a.text(join(3), intArg(argv, 1, 0), intArg(argv, 2, 0), scale); }
        else if (w === 'print') {
          text = join(1);
          for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (cx >= 21 || ch === '\n') { cx = 0; if (++cy >= 8) { scrollUp(); cy = 7; } if (ch === '\n') continue; }
            drawChar(ch, cx, cy); cx++;
          }
          cx = 0; if (++cy >= 8) { scrollUp(); cy = 7; }
        }
        else if (w === 'size') { scale = clamp(intArg(argv, 1, 1), 1, 4); return; }
        else if (w === 'pixel') { need(argv, 3, 'pixel x y [0|1|2]'); a.pixel(intArg(argv, 1, 0), intArg(argv, 2, 0), intArg(argv, 3, 1) ? 1 : 0); }
        else if (w === 'line') { need(argv, 5, 'line x0 y0 x1 y1'); a.line(intArg(argv, 1, 0), intArg(argv, 2, 0), intArg(argv, 3, 0), intArg(argv, 4, 0), intArg(argv, 5, 1) ? 1 : 0); }
        else if (w === 'rect' || w === 'fill') { need(argv, 5, w + ' x y w h'); a.rect(intArg(argv, 1, 0), intArg(argv, 2, 0), intArg(argv, 3, 0), intArg(argv, 4, 0), w === 'fill', intArg(argv, 5, 1) ? 1 : 0); }
        else if (w === 'bar') {
          var v = clamp(intArg(argv, 1, 0), 0, 100);
          for (var yy = 56; yy < 64; yy++) for (var xx = 0; xx < 128; xx++) a.pixel(xx, yy, (yy === 56 || yy === 63 || xx === 0 || xx === 127) ? 1 : (xx * 100 < v * 127 ? 1 : 0));
        }
        else if (w === 'contrast') { a.contrast(clamp(intArg(argv, 1, 207), 0, 255)); return; }
        else if (w === 'invert') { a.invert(is(argv[1], 'on') || argv[1] === '1'); return; }
        else throw ContractError(T('нет такой команды: %1', argv[0]));
        dirty = true;
      },
      deinit: function () { try { a.power(false); } catch (e) { /* gone */ } }
    };
  };

  DRIVERS.proto2 = function (c) { return { value: function () { return c.port.sig.read(); }, cmd: noCmd }; };

  /* ================================================================================================ the contract itself */
  function Contract(board) {
    this.board = board;
    this.drv = [null, null, null, null, null, null, null, null];
    this.listeners = [];
    this.pairT = -9;
    var self = this;
    board.on('step', function () { self.poll(); });
    board.on('detach', function (p) { self.drop(p.n); });
    board.on('pair', function () {
      var t = board.time, dbl = t - self.pairT < 0.4;
      self.pairT = dbl ? -9 : t;
      self.emit({ port: 0, kind: 'key', value: dbl ? 2 : 1, text: '' });
    });
  }
  Contract.prototype.nowMs = function () { return this.board.time * 1000; };
  Contract.prototype.on = function (fn) { this.listeners.push(fn); var l = this.listeners; return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; };
  Contract.prototype.emit = function (e) {
    this.listeners.slice().forEach(function (fn) { try { fn(e); } catch (x) { if (G.console) G.console.error('[qbit] event handler failed:', x); } });
  };
  Contract.prototype.drop = function (n) {
    var d = this.drv[n - 1];
    if (d && d.deinit) d.deinit();
    this.drv[n - 1] = null;
  };
  /** make sure every ready module has its driver, and drivers of vanished modules are dropped */
  Contract.prototype.sync = function () {
    if (this.suspended) return;                         // the board picture mirrors a real board: no drivers here
    for (var i = 0; i < 8; i++) {
      var p = this.board.ports[i], m = p.module, d = this.drv[i];
      var ok = m && p.state === 'ready' && m.api && DRIVERS[m.key];
      if (d && (!ok || d.api !== m.api)) { this.drop(i + 1); d = null; }
      if (!d && ok) this.start(i + 1, p, m);
    }
  };
  Contract.prototype.start = function (n, p, m) {
    var self = this;
    var ctx = { m: m, api: m.api, port: p, board: this.board, now: function () { return self.nowMs(); },
      emit: function (kind, value, text) { self.emit({ port: n, kind: kind, value: value === undefined ? 0 : value, text: text || '' }); } };
    try { var d = DRIVERS[m.key](ctx); d.api = m.api; d.key = m.key; this.drv[n - 1] = d; }
    catch (e) { if (G.console) G.console.error('[qbit] driver ' + m.key + ' failed to start:', e); }
  };
  Contract.prototype.poll = function () {
    if (this.suspended) return;
    this.sync();
    var now = this.nowMs();
    for (var i = 0; i < 8; i++) { var d = this.drv[i]; if (d && d.poll) d.poll(now); }
  };

  Contract.prototype.info = function (n) {
    var p = this.board.port(n), m = p && p.module;
    var out = { n: n, state: p ? p.state : 'empty', key: m ? m.key : null, title: m ? m.name : '', values: {}, text: '' };
    var d = this.drv[n - 1];
    if (m && d && Q.SPEC.modules[m.key]) {
      Q.SPEC.modules[m.key].values.forEach(function (v) { try { out.values[v.n] = this.get(n, m.key, v.n); } catch (e) { /* not available */ } }, this);
      if (d.text) out.text = d.text();
    }
    return out;
  };
  Contract.prototype.find = function (key, nth) {
    var k = nth || 0;
    for (var i = 0; i < 8; i++) { var m = this.board.ports[i].module; if (m && m.key === key) { if (k === 0) return i + 1; k--; } }
    return 0;
  };
  Contract.prototype.module = function (n, key) {
    if (!(n >= 1 && n <= 8) || n !== Math.floor(n)) throw ContractError(T('порта %1 нет: порты считаются с 1 до 8', n));
    this.sync();
    var p = this.board.port(n), m = p.module, spec = Q.SPEC.modules[key];
    var title = spec ? spec.title : key;
    if (!m) throw ContractError(T('на порту %1 нет модуля: поставьте «%2»', n, title));
    if (m.key !== key) throw ContractError(T('на порту %1 стоит «%2», а программа ждёт «%3»', n, m.name, title));
    if (p.state !== 'ready' || !this.drv[n - 1]) {
      var why = { debounce: T('плата ещё опознаёт модуль'), unknown: T('модуль не опознан'), fault: T('порт отключён защитой по току'), nobudget: T('не хватает мощности источника'), empty: T('порт пуст') }[p.state] || T('модуль не готов');
      throw ContractError(T('модуль «%1» на порту %2 не готов: %3', title, n, why));
    }
    return this.drv[n - 1];
  };
  Contract.prototype.get = function (n, key, name) {
    var d = this.module(n, key), spec = Q.SPEC.modules[key], vs = spec && spec.values.filter(function (v) { return v.n === name; })[0];
    if (!vs) throw ContractError(T('у модуля «%1» нет значения «%2»', spec.title, name));
    var raw = d.value(name);
    if (vs.t === 'bool') return !!raw;
    if (vs.t === 'text') return String(raw === undefined || raw === null ? '' : raw);
    if (vs.t === 'int') return Math.round(raw);
    return raw;
  };
  /** words of a command, the way the console splits them: True -> on, numbers -> text, None dropped at the end */
  Contract.words = function (name, args) {
    var out = [name];
    args.forEach(function (a) {
      if (a === null || a === undefined) return;
      if (a === true) out.push('on'); else if (a === false) out.push('off');
      else if (typeof a === 'number') out.push(Number.isInteger(a) ? String(a) : String(+a.toFixed(4)));
      else out.push(String(a));
    });
    return out;
  };
  Contract.prototype.command = function (n, key, name, args) {
    var d = this.module(n, key), spec = Q.SPEC.modules[key];
    if (!spec.commands.some(function (c) { return c.n === name; })) throw ContractError(T('у модуля «%1» нет команды «%2»', spec.title, name));
    return d.cmd(Contract.words(name, args || []));
  };
  /** board level values (power) */
  Contract.prototype.boardValue = function (name) {
    var pw = this.board.pw;
    switch (name) {
      case 'battery': return Math.round(pw.soc);
      case 'charging': return !!pw.charging;
      case 'usb': return !!pw.src.usb;
      case 'volts': return Math.round(pw.v5 * 100) / 100;
      case 'amps': return Math.round(pw.iMa) / 1000;
    }
    throw ContractError(T('у платы нет значения «%1»', name));
  };
  Contract.prototype.reset = function () { for (var i = 1; i <= 8; i++) this.drop(i); };

  Q.Contract = Contract;
  Q.ContractError = ContractError;
  Q.ContractDrivers = DRIVERS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
