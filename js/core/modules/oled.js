/* OLED 0.96" 128x64, SSD1306 at I2C 0x3C. The chip is emulated at the command level (control byte + commands / data, the three
   addressing modes, inversion, remap, contrast), so the driver below is the same code a real firmware driver would be.
   RAM layout: byte = page * 128 + column, bit 0 = top row of the page. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, M = Q.mod;

  var W = 128, H = 64;

  function ssd1306(m) {
    var o = m.out;
    var pend = null, params = [];                       // a command waiting for its parameter bytes
    var NEED = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0x8D: 1, 0xA8: 1, 0xD3: 1, 0xD5: 1, 0xD9: 1, 0xDA: 1, 0xDB: 1, 0xA3: 2,
                 0x26: 6, 0x27: 6, 0x29: 5, 0x2A: 5 };
    function cmd(b) {
      if (pend !== null) {
        params.push(b);
        if (params.length >= NEED[pend]) { apply(pend, params); pend = null; params = []; }
        return;
      }
      if (NEED[b]) { pend = b; params = []; return; }
      if (b <= 0x0F) { o.col = (o.col & 0xF0) | b; }
      else if (b <= 0x1F) { o.col = (o.col & 0x0F) | ((b & 0x0F) << 4); }
      else if (b >= 0xB0 && b <= 0xB7) { o.page = b & 7; }
      else if (b === 0xAE) o.on = false;
      else if (b === 0xAF) o.on = true;
      else if (b === 0xA6) o.inverse = false;
      else if (b === 0xA7) o.inverse = true;
      else if (b === 0xA4) o.allOn = false;
      else if (b === 0xA5) o.allOn = true;
      else if (b === 0xA0) o.segRemap = false;
      else if (b === 0xA1) o.segRemap = true;
      else if (b === 0xC0) o.comRev = false;
      else if (b === 0xC8) o.comRev = true;
      o.version++;
    }
    function apply(c, p) {
      if (c === 0x20) o.mode = p[0] & 3;
      else if (c === 0x21) { o.c0 = p[0] & 127; o.c1 = p[1] & 127; o.col = o.c0; }
      else if (c === 0x22) { o.p0 = p[0] & 7; o.p1 = p[1] & 7; o.page = o.p0; }
      else if (c === 0x81) o.contrast = p[0];
      else if (c === 0x8D) o.pump = p[0] === 0x14;
      o.version++;
    }
    function data(b) {
      o.ram[o.page * W + o.col] = b;
      if (o.mode === 2) { o.col = (o.col + 1) & 127; }
      else if (o.mode === 0) {
        if (o.col >= o.c1) { o.col = o.c0; o.page = o.page >= o.p1 ? o.p0 : o.page + 1; } else o.col++;
      } else {
        if (o.page >= o.p1) { o.page = o.p0; o.col = o.col >= o.c1 ? o.c0 : o.col + 1; } else o.page++;
      }
      o.version++;
    }
    return {
      write: function (bytes) {
        var i = 0, n = bytes.length;
        while (i < n) {
          var ctl = bytes[i++];
          if (ctl & 0x80) {                                  // Co = 1: exactly one byte follows
            if (i >= n) break;
            var b = bytes[i++];
            if (ctl & 0x40) data(b); else cmd(b);
          } else {
            while (i < n) { var d = bytes[i++]; if (ctl & 0x40) data(d); else cmd(d); }
          }
        }
        m.touch();
        return true;
      },
      read: function (n) {                                   // status byte: bit 6 = display off
        return new Uint8Array(n).fill(o.on ? 0x00 : 0x40);
      }
    };
  }

  /** What the panel shows right now: 128 x 64 values 0/1 in screen coordinates (header at the top). */
  function screen(m, out) {
    var o = m.out;
    out = out || new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      var row = o.comRev ? y : H - 1 - y, pg = row >> 3, bit = row & 7;
      for (var x = 0; x < W; x++) {
        var col = o.segRemap ? x : W - 1 - x;
        var v = (o.ram[pg * W + col] >> bit) & 1;
        if (o.allOn) v = 1;
        if (o.inverse) v ^= 1;
        out[y * W + x] = o.on ? v : 0;
      }
    }
    return out;
  }

  Q.defineModule('oled', {
    out: function () {
      return { ram: new Uint8Array(W * H / 8), on: false, inverse: false, allOn: false, segRemap: false, comRev: false,
               contrast: 0x7F, pump: false, mode: 2, c0: 0, c1: 127, p0: 0, p1: 7, col: 0, page: 0, version: 0 };
    },
    i2c: function (m) { return { 0x3C: ssd1306(m) }; },
    screen: screen,
    lit: function (m) {
      var n = 0, r = m.out.ram;
      for (var i = 0; i < r.length; i++) { var b = r[i]; while (b) { n += b & 1; b >>= 1; } }
      return n;
    },
    currentMa: function (m) {
      var o = m.out;
      if (!o.on) return 3 + 1;
      return 3 + 6 + 16 * Math.min(1, Q.moduleDef('oled').lit(m) / 2048) * (0.4 + 0.6 * o.contrast / 255);
    },
    readouts: function (m) {
      var o = m.out;
      return [{ label: T('Дисплей'), value: o.on ? T('включён') : T('выключен') }, { label: T('Светящихся точек'), value: Q.moduleDef('oled').lit(m) },
              { label: T('Режим адресации'), value: [T('горизонтальный'), T('вертикальный'), T('страничный')][o.mode] || '?' }];
    },
    tests: [
      { type: 'action', label: T('Показать «Привет, q.bit!»'), run: function (m) { m.api && m.api.demo(); } },
      { type: 'action', label: T('Очистить'), run: function (m) { if (m.api) { m.api.clear(); m.api.show(); } } },
      { type: 'toggle', label: T('Инверсия'), get: function (m) { return m.out.inverse; }, set: function (m, v) { m.api && m.api.invert(v); } }
    ],
    api: function (m, port, board) {
      var dev = board.dev(port.n, 0x3C);
      var fb = new Uint8Array(W * H);
      var inited = false;
      function cmd() { dev.write([0x00].concat(Array.prototype.slice.call(arguments))); }
      function init() {
        // the usual sequence for a 128x64 module with the charge pump (Adafruit / u8g2): origin at the top left, 180 degrees remap
        cmd(0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x00, 0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF);
        inited = true;
      }
      function px(x, y, on) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = on === 0 ? 0 : 1;
      }
      var api = {
        width: W, height: H,
        init: init,
        clear: function () { fb.fill(0); },
        pixel: px,
        line: function (x0, y0, x1, y1, on) {
          x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
          var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
          for (;;) {
            px(x0, y0, on);
            if (x0 === x1 && y0 === y1) break;
            var e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
          }
        },
        rect: function (x, y, w, h, fill, on) {
          for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
            if (fill || i === 0 || j === 0 || i === w - 1 || j === h - 1) px(x + i, y + j, on);
          }
        },
        circle: function (cx, cy, r, fill, on) {
          for (var j = -r; j <= r; j++) for (var i = -r; i <= r; i++) {
            var d = i * i + j * j;
            if (fill ? d <= r * r + r * 0.3 : Math.abs(Math.sqrt(d) - r) < 0.5) px(cx + i, cy + j, on);
          }
        },
        scrollUp: function (rows) { fb.copyWithin(0, rows * W); fb.fill(0, (H - rows) * W); },
        /** text at (x, y) = top-left corner; size 1 = 5x7 font (21 columns, 8 lines), 2 = double ... */
        text: function (s, x, y, size) { Q.font5x7.draw(fb, W, H, String(s), x, y, size || 1, 1); },
        textWidth: function (s, size) { return Q.font5x7.measure(String(s), size || 1); },
        show: function () {
          if (!inited) init();
          var ram = new Array(W * H / 8);
          for (var pg = 0; pg < 8; pg++) for (var x = 0; x < W; x++) {
            var b = 0;
            for (var bit = 0; bit < 8; bit++) if (fb[(pg * 8 + bit) * W + x]) b |= 1 << bit;
            // the init sequence uses A1/C8: RAM column = screen column, RAM row = screen row
            ram[pg * W + x] = b;
          }
          cmd(0x21, 0, 127); cmd(0x22, 0, 7);
          for (var i = 0; i < ram.length; i += 128) dev.write([0x40].concat(ram.slice(i, i + 128)));
        },
        contrast: function (v) { if (!inited) init(); cmd(0x81, U.clamp(v | 0, 0, 255)); },
        invert: function (on) { if (!inited) init(); cmd(on ? 0xA7 : 0xA6); },
        power: function (on) { if (!inited) init(); cmd(on ? 0xAF : 0xAE); },
        demo: function () {
          api.clear();
          api.text(T('Привет, q.bit!'), 4, 4, 1);          // Привет, q.bit!
          api.text('OLED 128x64', 4, 16, 1);
          api.rect(2, 30, 124, 32, false);
          api.text('q.bit', 22, 38, 3);
          api.show();
        }
      };
      return api;
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
