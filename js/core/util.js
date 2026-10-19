/* q.bit simulator - small helpers shared by the core and the UI. No DOM here. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  if (Q.i18n && Q.DATA) Q.i18n.localizeData(Q.DATA);          // names in the generated hardware table, before module.js copies them

  var clamp =function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smoothstep = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var mod = function (a, n) { return ((a % n) + n) % n; };
  var RAD = Math.PI / 180;

  /** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) - the passport checksum. */
  function crc16(bytes, crc) {
    crc = crc === undefined ? 0xFFFF : crc;
    for (var i = 0; i < bytes.length; i++) {
      crc ^= bytes[i] << 8;
      for (var k = 0; k < 8; k++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc;
  }

  function toHex(bytes, sep) {
    var out = [];
    for (var i = 0; i < bytes.length; i++) out.push((bytes[i] < 16 ? '0' : '') + bytes[i].toString(16));
    return out.join(sep === undefined ? '' : sep);
  }

  function fromHex(str) {
    var n = str.length >> 1, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = parseInt(str.substr(i * 2, 2), 16);
    return out;
  }

  function hex(n, width) {
    var s = n.toString(16).toUpperCase();
    while (s.length < (width || 2)) s = '0' + s;
    return '0x' + s;
  }

  /** Tiny event emitter. on() returns an unsubscribe function. */
  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (ev, fn) {
    var self = this;
    (this._h[ev] = this._h[ev] || []).push(fn);
    return function () { self.off(ev, fn); };
  };
  Emitter.prototype.off = function (ev, fn) {
    var a = this._h[ev];
    if (!a) return;
    var i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
  Emitter.prototype.emit = function (ev) {
    var a = this._h[ev];
    if (!a) return;
    var args = Array.prototype.slice.call(arguments, 1);
    a = a.slice();
    for (var i = 0; i < a.length; i++) {
      try { a[i].apply(this, args); } catch (e) { if (G.console) G.console.error('[qbit] handler for "' + ev + '" failed:', e); }
    }
  };

  /** Deterministic PRNG (mulberry32) so tests and "noise" are repeatable. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  Q.util = { clamp: clamp, lerp: lerp, smoothstep: smoothstep, mod: mod, RAD: RAD, crc16: crc16,
             toHex: toHex, fromHex: fromHex, hex: hex, Emitter: Emitter, rng: rng };
})(typeof globalThis !== 'undefined' ? globalThis : this);
