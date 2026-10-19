/* q.bit module passport (format 1) - decode / verify / rebuild the 256-byte EEPROM image.
   Layout: modules/docs/PASSPORT.md, reference implementation modules/tools/passport.py. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util;

  var IFACE = ['-', 'DI', 'DO', 'AI', 'I2C', 'MCU'];
  var FLAG = { SIG_IN: 0x01, SIG_OUT: 0x02, SIG_ANALOG: 0x04, SIG_INT: 0x08, USES_5V: 0x10, FIRMWARE: 0x20, LOAD: 0x40 };
  var FLAG_TEXT = {
    SIG_IN: T('модуль выдаёт сигнал на SIG'), SIG_OUT: T('плата управляет модулем через SIG'),
    SIG_ANALOG: T('SIG аналоговый (АЦП)'), SIG_INT: T('SIG — прерывание / «данные готовы»'),
    USES_5V: T('заметный ток от 5 V'), FIRMWARE: T('своя прошивка модуля'), LOAD: T('коммутирует внешнюю нагрузку')
  };
  var SIZE = 256, FACTORY_END = 0x80;

  function ascii(b, from, to) {
    var s = '';
    for (var i = from; i < to && b[i] !== 0; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  /** Decode an image. Never throws: a bad image gives { ok:false, reason }. */
  function decode(b) {
    var r = { ok: false, magicOk: false, crcOk: false, reason: '' };
    if (!b || b.length < 0x80) { r.reason = 'short'; return r; }
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    r.magicOk = b[0] === 0x51 && b[1] === 0x42;
    r.format = b[2];
    r.factoryEnd = b[3];
    r.typeId = dv.getUint16(4, true);
    r.hwRev = b[6];
    r.hwRevName = b[6] > 0 && b[6] < 27 ? String.fromCharCode(64 + b[6]) : '?';
    r.variant = b[7];
    r.iface = b[8];
    r.ifaceName = IFACE[b[8]] || '?';
    r.i2cAddr = b[9];
    r.formatMm = b[10];
    r.flags = b[11];
    r.serial = dv.getUint32(12, true);
    r.date = (2000 + b[16]) + '-' + (b[17] < 10 ? '0' : '') + b[17] + '-' + (b[18] < 10 ? '0' : '') + b[18];
    r.currentMa = dv.getUint16(0x14, true);
    r.label = ascii(b, 0x20, 0x40);
    var end = 0x7E;
    while (end > 0x40 && b[end - 1] === 0) end--;
    r.params = Array.prototype.slice.call(b, 0x40, end);
    r.crcStored = dv.getUint16(0x7E, true);
    r.crcCalc = U.crc16(b.subarray(0, 0x7E));
    r.crcOk = r.crcStored === r.crcCalc;
    r.flagNames = Object.keys(FLAG).filter(function (k) { return (r.flags & FLAG[k]) !== 0; });
    if (!r.magicOk) r.reason = 'magic';
    else if (r.format < 1 || r.format > 1) r.reason = 'format';
    else if (!r.crcOk) r.reason = 'crc';
    r.ok = r.reason === '';
    return r;
  }

  /** Copy of an image with a different VARIANT byte (and a fresh CRC): e.g. a blue LED from the white one. */
  function withVariant(img, variant) {
    var out = new Uint8Array(img);
    out[7] = variant;
    var crc = U.crc16(out.subarray(0, 0x7E));
    out[0x7E] = crc & 0xFF;
    out[0x7F] = crc >> 8;
    return out;
  }

  /** Copy with a serial number (bytes 12..15) and fresh CRC. */
  function withSerial(img, serial) {
    var out = new Uint8Array(img);
    new DataView(out.buffer).setUint32(12, serial >>> 0, true);
    var crc = U.crc16(out.subarray(0, 0x7E));
    out[0x7E] = crc & 0xFF;
    out[0x7F] = crc >> 8;
    return out;
  }

  /** Image from scratch (used for the debug modules). */
  function build(o) {
    var img = new Uint8Array(SIZE).fill(0xFF);
    var dv = new DataView(img.buffer);
    img[0] = 0x51; img[1] = 0x42; img[2] = 1; img[3] = FACTORY_END;
    dv.setUint16(4, o.typeId, true);
    img[6] = o.hwRev || 1; img[7] = o.variant || 0; img[8] = o.iface || 0; img[9] = o.i2cAddr || 0;
    img[10] = o.formatMm || 30; img[11] = o.flags || 0;
    dv.setUint32(12, o.serial || 0, true);
    var d = o.date ? new Date(o.date) : new Date();
    img[16] = d.getFullYear() - 2000; img[17] = d.getMonth() + 1; img[18] = d.getDate(); img[19] = 0;
    dv.setUint16(0x14, o.currentMa || 0, true);
    for (var i = 0x16; i < 0x20; i++) img[i] = 0;
    var lab = (o.label || '').slice(0, 31);
    for (i = 0x20; i < 0x40; i++) img[i] = i - 0x20 < lab.length ? lab.charCodeAt(i - 0x20) & 0x7F : 0;
    var params = o.params || [];
    for (i = 0x40; i < 0x7E; i++) img[i] = i - 0x40 < params.length ? params[i - 0x40] : 0;
    var crc = U.crc16(img.subarray(0, 0x7E));
    dv.setUint16(0x7E, crc, true);
    return img;
  }

  Q.Passport = { SIZE: SIZE, FACTORY_END: FACTORY_END, IFACE: IFACE, FLAG: FLAG, FLAG_TEXT: FLAG_TEXT,
                 decode: decode, build: build, withVariant: withVariant, withSerial: withSerial };
})(typeof globalThis !== 'undefined' ? globalThis : this);
