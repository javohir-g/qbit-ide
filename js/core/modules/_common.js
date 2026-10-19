/* Helpers shared by the module definitions. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var U = Q.util;

  var M = Q.mod = {};

  /** Voltage on a SIG line that is pulled up by `pullup` ohm to 3.3 V and shorted to GND through the resistors
   *  of the pressed contacts (joystick, keypad). No contact pressed = 3.3 V. */
  M.ladderMv = function (rs, active, pullup) {
    var g = 0;
    for (var i = 0; i < rs.length; i++) if (active[i]) g += 1 / rs[i];
    if (g === 0) return 3300;
    var r = 1 / g;
    return 3300 * r / ((pullup || 10000) + r);
  };

  /** Which contact combination gives the voltage closest to `mv`? (what a driver does with the ADC value) */
  M.ladderDecode = function (rs, mv, pullup) {
    var n = rs.length, best = null, bestD = 1e9;
    for (var mask = 0; mask < (1 << n); mask++) {
      var act = [];
      for (var i = 0; i < n; i++) act.push(((mask >> i) & 1) === 1);
      var d = Math.abs(M.ladderMv(rs, act, pullup) - mv);
      if (d < bestD) { bestD = d; best = act; }
    }
    return best;
  };

  /** Subscribe a digital input driver: 'press' on a rising edge, 'release' on a falling one (invert = active low). */
  M.edgeEvents = function (m, port, rise, fall, invert) {
    return port.sig.on('edge', function (v) {
      var high = invert ? !v : !!v;
      m.ev.emit(high ? rise : fall);
    });
  };

  /** One-line 'on' / 'once' subscriber for a driver. */
  M.onApi = function (m) {
    return function (ev, fn) { return m.ev.on(ev, fn); };
  };

  M.round = function (v, d) { var k = Math.pow(10, d || 0); return Math.round(v * k) / k; };

  /** Photoplethysmogram-like pulse shape for phase 0..1 (systolic peak, dicrotic notch), roughly -0.4 .. 1. */
  M.ppg = function (phase) {
    var p = phase - Math.floor(phase);
    var g = function (c, w) { var x = (p - c) / w; return Math.exp(-x * x); };
    return g(0.16, 0.07) - 0.30 * g(0.52, 0.09) + 0.18 * g(0.40, 0.06);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
