/* "Демо": a stand-in for a user program, so the board is alive before the block editor exists.
   Every output module follows an input module - the drivers are called exactly as a program would call them.
   Pairing is by port order: the k-th output follows the k-th input (wrapping round when there are fewer inputs). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util;

  var clamp01 = function (v) { return U.clamp(v, 0, 1); };

  /* what each input module offers: b = a yes/no, v = a 0..1 amount (null when it has none), label = text for the OLED */
  var SOURCES = {
    button:   function (a) { return { b: a.isPressed(), v: null, label: T('кнопка') }; },
    touch:    function (a) { return { b: a.isTouched(), v: null, label: T('касание') }; },
    switch:   function (a) { return { b: a.isOn(), v: null, label: T('тумблер') }; },
    tilt:     function (a) { return { b: a.isTilted(), v: null, label: T('наклон') }; },
    hall:     function (a) { return { b: a.isMagnetNear(), v: null, label: T('магнит') }; },
    pir:      function (a) { return { b: a.isMotion(), v: null, label: T('движение') }; },
    joystick: function (a) { return { b: a.direction() !== 'none' || a.isPressed(), v: clamp01((a.x() + 1) / 2), label: T('джойстик') }; },
    keypad:   function (a) { var k = a.pressed(); return { b: k.length > 0, v: k.length ? clamp01(k[0] / 4) : 0, label: T('клавиши') }; },
    pot:      function (a) { var v = a.percent() / 100; return { b: v > 0.5, v: v, label: T('ручка %1%', Math.round(v * 100)) }; },
    slider:   function (a) { var v = a.percent() / 100; return { b: v > 0.5, v: v, label: T('ползунок %1%', Math.round(v * 100)) }; },
    light:    function (a) { var v = a.percent() / 100; return { b: v < 0.25, v: v, label: T('свет %1%', Math.round(v * 100)) }; },
    pulse:    function (a) { var bpm = a.bpm(); return { b: bpm > 0, v: clamp01(bpm / 200), label: T('пульс %1', bpm) }; },
    encoder:  function (a) { var p = a.position(); return { b: a.isPressed(), v: clamp01((((p % 20) + 20) % 20) / 19), label: T('энкодер %1', p) }; },
    ultrasonic: function (a) { var d = a.distanceCm(); return { b: d !== null && d < 30, v: d === null ? 0 : clamp01(1 - d / 100), label: d === null ? T('нет эха') : T('%1 см', Math.round(d)) }; },
    gesture:  function (a) { var p = a.proximity() / 100; return { b: p > 0.4, v: p, label: T('рука %1%', Math.round(p * 100)) }; },
    rfid:     function (a) { var u = a.uid(); return { b: !!u, v: u ? clamp01((parseInt(u.slice(0, 2), 16) % 8) / 7) : 0, label: u || T('нет метки') }; },
    irrx:     function (a, m, board) {
      while (a.available()) { var c = a.read(); m._demoCmd = c.command; m._demoRx = board.time; }
      var fresh = m._demoRx !== undefined && board.time - m._demoRx < 0.6;
      return { b: fresh, v: clamp01(((m._demoCmd || 0) % 32) / 31), label: T('ИК 0x%1', (m._demoCmd || 0).toString(16).toUpperCase()) };
    },
    temphum:  function (a) { var t = a.temperature(); return { b: t > 28, v: clamp01((t - 15) / 20), label: t.toFixed(1) + ' C ' + Math.round(a.humidity()) + '%' }; },
    pressure: function (a) { var p = a.pressure(); return { b: false, v: clamp01((p - 980) / 60), label: T('%1 гПа', Math.round(p)) }; },
    compass:  function (a) { var hd = a.heading(); return { b: false, v: hd / 360, label: T('курс %1', Math.round(hd)) }; },
    imu:      function (a) { var g = a.accel(); return { b: a.isShaken(), v: clamp01((g[0] + 1) / 2), label: T('наклон %1g', g[0].toFixed(1)) }; },
    airq:     function (a) { var v = a.vocIndex(); return { b: v > 150, v: clamp01(v / 500), label: 'VOC ' + v }; },
    rtc:      function (a) { var t = a.now(); return { b: t.second % 2 === 0, v: t.second / 59, label: ('0' + t.hour).slice(-2) + ':' + ('0' + t.minute).slice(-2) + ':' + ('0' + t.second).slice(-2) }; },
    color:    function (a, m) { var s = m.state.sample; return { b: !!s, v: null, rgb: s || null, label: s ? T('цвет %1', s) : T('нет предмета') }; }
  };

  function changed(m, key, val) {
    var c = m._demo || (m._demo = {});
    if (c[key] === val) return false;
    c[key] = val;
    return true;
  }

  /* what each output module does with what it is given */
  var SINKS = {
    led: function (m, s) {
      if (s.v !== null && s.v !== undefined) { var p = Math.round(s.v * 20) * 5; if (changed(m, 'p', p)) m.api.brightness(p); }
      else if (changed(m, 'b', s.b)) m.api.set(s.b);
    },
    rgb: function (m, s) {
      var key;
      if (s.rgb) { key = s.rgb; if (changed(m, 'c', key)) m.api.hex(s.rgb); }
      else if (s.v !== null && s.v !== undefined) { key = Math.round(s.v * 60); if (changed(m, 'c', key)) m.api.hsv(key * 5, 1, 0.8); }
      else { key = s.b ? 1 : 0; if (changed(m, 'c', key)) { if (s.b) m.api.color(40, 220, 120); else m.api.off(); } }
    },
    buzzer: function (m, s) {
      if (s.v !== null && s.v !== undefined) {
        if (s.v < 0.03) { if (changed(m, 'f', 0)) m.api.stop(); }
        else { var f = Math.round((200 + s.v * 1800) / 20) * 20; if (changed(m, 'f', f)) m.api.tone(f); }
      } else if (changed(m, 'f', s.b ? 880 : 0)) { if (s.b) m.api.tone(880); else m.api.stop(); }
    },
    servo: function (m, s) {
      var a = s.v !== null && s.v !== undefined ? Math.round(s.v * 36) * 5 : (s.b ? 150 : 30);
      if (changed(m, 'a', a)) m.api.angle(a);
    },
    relay: function (m, s) { if (changed(m, 'b', s.b)) m.api.set(s.b); },
    motor: function (m, s) {
      var sp = s.v !== null && s.v !== undefined ? Math.round((s.v * 2 - 1) * 10) * 10 : (s.b ? 70 : 0);
      if (changed(m, 's', sp)) m.api.speed(sp);
    },
    irtx: function (m, s) { if (s.b && changed(m, 'b', true)) m.api.send(0x00, 0x45); else if (!s.b) changed(m, 'b', false); },
    oled: function (m, s, all, board) {
      var t = board.time;
      if (t - (m._demoT || -9) < 0.2) return;
      m._demoT = t;
      var lines = all.slice(0, 5).map(function (x) { return x.label; });
      var key = lines.join('|');
      if (!changed(m, 'text', key)) return;
      var o = m.api;
      o.clear();
      o.text('q.bit', 0, 0, 1);
      o.line(0, 9, 127, 9);
      lines.forEach(function (l, i) { o.text(l.slice(0, 21), 0, 13 + i * 10, 1); });
      o.show();
    }
  };

  function Demo(board) {
    this.board = board;
    this.on = false;
    var self = this;
    board.on('step', function () { if (self.on) self.tick(); });
  }

  Demo.prototype.set = function (on) {
    if (this.on === on) return;
    this.on = on;
    if (!on) this.release();
    this.board.log('info', on ? T('Демо включено: выходы повторяют входы (пока нет блочных программ)') : T('Демо выключено'));
  };

  Demo.prototype.release = function () {
    // hand the outputs back: everything stops where it is switched off
    this.board.ports.forEach(function (p) {
      var m = p.module;
      if (!m) return;
      m._demo = null;
      if (!m.api || p.state !== 'ready') return;
      try {
        if (SINKS[m.key] && m.key !== 'oled' && m.key !== 'irtx') {
          if (m.key === 'led') m.api.off(); else if (m.key === 'rgb') m.api.off(); else if (m.key === 'buzzer') m.api.stop();
          else if (m.key === 'relay') m.api.off(); else if (m.key === 'motor') m.api.stop(); else if (m.key === 'servo') m.api.angle(90);
        }
      } catch (e) { /* ignore */ }
    });
  };

  Demo.prototype.tick = function () {
    var b = this.board;
    if (!b.running) return;
    var sources = [], sinks = [];
    for (var i = 0; i < 8; i++) {
      var p = b.ports[i], m = p.module;
      if (!m || p.state !== 'ready' || !m.api) continue;
      if (SOURCES[m.key]) sources.push(m); else if (SINKS[m.key]) sinks.push(m);
    }
    if (!sources.length) return;
    var vals = sources.map(function (m) { try { return SOURCES[m.key](m.api, m, b); } catch (e) { return { b: false, v: null, label: '?' }; } });
    sinks.forEach(function (m, k) {
      var j = k % sources.length;
      try { SINKS[m.key](m, vals[j], vals, b); } catch (e) { /* a module that just went away */ }
    });
  };

  Q.Demo = Demo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
