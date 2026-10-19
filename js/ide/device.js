/* A device is "where the program runs": the simulator in the browser, or a real board over Wi-Fi / USB.
   The IDE talks to every device through this one interface, so a program, the console, the Data tab and the block warnings work the same way:

     device.kind, device.name, device.connected
     device.ports()         [{ n, key, title, state }]              what sits on the ports right now
     device.info(n)         { n, key, title, state, values, text }  live values of the module on port n (the qbit contract)
     device.power()         { battery, usb, charging, volts, amps, source }
     device.run(code, map)  start the program (Python text + {line: blockId}); throws on a syntax error
     device.stop() / pause() / resume()        device.status: idle | running | paused | finished | stopped | error
     device.on(name, fn)    'print' (text) | 'error' ({message, line, type}) | 'status' (s) | 'line' (n) | 'ports' | 'power' | 'connection'

   The remote board (js/ide/link.js) implements the same interface; SimDevice below is the reference. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util;

  /** the virtual board of the simulator */
  function SimDevice(app) {
    U.Emitter.call(this);
    var self = this, board = app.board;
    this.kind = 'sim'; this.name = T('Симулятор'); this.connected = true; this.app = app; this.board = board;
    this.runtime = new Q.Runtime(board);
    this.map = {};
    this.runtime.on('print', function (s) { self.emit('print', s); });
    this.runtime.on('error', function (e) { self.emit('error', e); });
    this.runtime.on('status', function (s) { self.emit('status', s); });
    this.runtime.on('line', function (n) { self.emit('line', n); });
    ['attach', 'detach', 'ready', 'unknown', 'fault', 'budget', 'portEnable'].forEach(function (ev) { board.on(ev, function () { self.emit('ports'); }); });
    board.on('power', function () { self.emit('power'); });
  }
  SimDevice.prototype = Object.create(U.Emitter.prototype);
  var S = SimDevice.prototype;
  Object.defineProperty(S, 'status', { get: function () { return this.runtime.status; } });

  S.ports = function () {
    return this.board.ports.map(function (p) {
      var m = p.module;
      return { n: p.n, key: m ? m.key : null, title: m ? m.name : '', state: p.state, covered: !!p.covered && !m };
    });
  };
  S.info = function (n) { return this.board.contract.info(n); };
  S.power = function () {
    var pw = this.board.pw;
    return { battery: Math.round(pw.soc), usb: !!pw.src.usb, charging: !!pw.charging, volts: pw.v5, amps: pw.iMa / 1000, source: pw.src.label, on: pw.on };
  };
  S.run = function (code, map) {
    this.map = map || {};
    if (this.app.demo && this.app.demo.on) this.app.demo.set(false);   // the demo would fight the program for the outputs
    this.runtime.run(code);
  };
  S.stop = function () { this.runtime.stop(); };
  S.pause = function () { this.runtime.pause(); };
  S.resume = function () { this.runtime.resume(); };
  S.running = function () { return this.runtime.running(); };
  /** the board as the block warnings see it */
  S.shutdown = function () { this.runtime.stop(true); };

  /** the list of devices the IDE can run on, and which one is active */
  function DeviceHub() {
    U.Emitter.call(this);
    this.devices = [];
    this.active = null;
  }
  DeviceHub.prototype = Object.create(U.Emitter.prototype);
  DeviceHub.prototype.add = function (d) {
    var self = this;
    this.devices.push(d);
    if (!this.active) this.select(d);
    this.emit('list');
    return d;
  };
  DeviceHub.prototype.remove = function (d) {
    var i = this.devices.indexOf(d);
    if (i < 0) return;
    this.devices.splice(i, 1);
    if (this.active === d) this.select(this.devices[0] || null);
    this.emit('list');
  };
  DeviceHub.prototype.select = function (d) {
    if (this.active === d) return;
    var was = this.active;
    this.active = d;
    this.emit('select', d, was);
  };

  Q.SimDevice = SimDevice;
  Q.DeviceHub = DeviceHub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
