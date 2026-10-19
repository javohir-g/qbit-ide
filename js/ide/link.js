/* A real q.bit board as a device: the IDE sends the program (Python text) over Wi-Fi (WebSocket) or USB (Web Serial) and gets back
   what the board sees. The board runs the program with MicroPython and the `qbit` module; this file only speaks the protocol
   (docs/PROTOCOL.md; tools/fake-board.js is a reference implementation of the board side).

   Messages are JSON objects, one per WebSocket frame / one per line on a serial port:
     IDE -> board   {t:'hello', v:1}  {t:'run', code}  {t:'stop'}  {t:'pause'}  {t:'resume'}  {t:'cmd', port, words:[...]}  {t:'ping'}
     board -> IDE   {t:'hello', v, fw, name, board}  {t:'state', ports:[{n,key,title,state,values,text}], power:{...}, run}
                    {t:'print', text}  {t:'error', type, message, line}  {t:'status', status}  {t:'line', n}  {t:'pong'}

   While a real board is the active device, the board picture shows a mirror of it (modules, buttons, LEDs ...). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, h = Q.h;
  function modTitle(p) { var s = p.key && Q.SPEC && Q.SPEC.modules[p.key]; return s ? s.title : p.title || ''; }

  /* ---------------------------------------------------------------- transports */
  function WsTransport(url) {
    var self = this;
    this.url = url; this.kind = 'wifi';
    this.ws = new WebSocket(url);
    this.ws.onopen = function () { self.onopen && self.onopen(); };
    this.ws.onclose = function () { self.onclose && self.onclose(); };
    this.ws.onerror = function () { self.onerror && self.onerror(new Error(T('нет связи с %1', url))); };
    this.ws.onmessage = function (e) { try { self.onmessage && self.onmessage(JSON.parse(e.data)); } catch (x) { /* not JSON: ignore */ } };
  }
  WsTransport.prototype.send = function (o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); };
  WsTransport.prototype.close = function () { try { this.ws.close(); } catch (e) { /* closed */ } };
  WsTransport.prototype.label = function () { return this.url.replace(/^wss?:\/\//, '').replace(/\/ws$/, ''); };

  /** Web Serial: one JSON object per line (Chrome / Edge on a computer) */
  function SerialTransport(port) {
    var self = this;
    this.port = port; this.kind = 'usb'; this.closed = false;
    port.open({ baudRate: 115200 }).then(function () {
      self.writer = port.writable.getWriter();
      self.onopen && self.onopen();
      var dec = new TextDecoderStream(), buf = '';
      port.readable.pipeTo(dec.writable).catch(function () {});
      var reader = dec.readable.getReader();
      (function pump() {
        reader.read().then(function (r) {
          if (r.done) { if (!self.closed) self.onclose && self.onclose(); return; }
          buf += r.value;
          var i;
          while ((i = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (line.charAt(0) === '{') { try { self.onmessage && self.onmessage(JSON.parse(line)); } catch (x) { /* a console line, not a message */ } }
          }
          pump();
        }).catch(function () { if (!self.closed) self.onclose && self.onclose(); });
      })();
    }).catch(function (e) { self.onerror && self.onerror(e); });
  }
  SerialTransport.prototype.send = function (o) { if (this.writer) this.writer.write(new TextEncoder().encode(JSON.stringify(o) + '\n')).catch(function () {}); };
  SerialTransport.prototype.close = function () { this.closed = true; try { if (this.writer) this.writer.releaseLock(); this.port.close(); } catch (e) { /* closed */ } };
  SerialTransport.prototype.label = function () { return 'USB'; };

  /* ---------------------------------------------------------------- the board as a device */
  function RemoteDevice(transport, link) {
    U.Emitter.call(this);
    var self = this;
    this.t = transport; this.link = link;
    this.kind = transport.kind; this.name = 'q.bit'; this.connected = false; this.info_ = {}; this.state = { ports: [], power: null };
    this.status_ = 'idle';
    this.lastLine = 0; this.pingAt = 0;
    transport.onopen = function () { transport.send({ t: 'hello', v: 1, client: 'qbit-ide' }); };
    transport.onmessage = function (m) { self.handle(m); };
    transport.onclose = function () { if (self.connected) { self.connected = false; self.emit('connection'); } link.lost(self); };
    transport.onerror = function (e) { link.failed(self, e); };
  }
  RemoteDevice.prototype = Object.create(U.Emitter.prototype);
  var R = RemoteDevice.prototype;
  Object.defineProperty(R, 'status', { get: function () { return this.status_; } });

  R.handle = function (m) {
    switch (m.t) {
      case 'hello':
        this.info_ = m; this.name = m.name || 'q.bit'; this.connected = true;
        this.emit('connection');
        this.link.ready(this);
        break;
      case 'state':
        this.state = { ports: m.ports || [], power: m.power || this.state.power };
        if (m.run && m.run.status && m.run.status !== this.status_) { this.status_ = m.run.status; this.emit('status', this.status_); }
        this.emit('ports'); this.emit('power'); this.emit('state');
        break;
      case 'print': this.emit('print', m.text); break;
      case 'error': this.emit('error', { message: m.message, line: m.line, type: m.type }); break;
      case 'status': this.status_ = m.status; this.emit('status', m.status); break;
      case 'line': this.emit('line', m.n); break;
      case 'pong': break;
    }
  };
  R.describe = function () {
    var i = this.info_;
    return (this.kind === 'wifi' ? 'Wi-Fi ' : 'USB ') + this.t.label() + (i.fw ? T(' · прошивка %1', i.fw) : '') + (this.connected ? '' : T(' · нет связи'));
  };
  R.ports = function () {
    // the board names its modules in its own language: the title shown here is the one of the chosen interface language
    return (this.state.ports || []).map(function (p) { return { n: p.n, key: p.key || null, title: modTitle(p), state: p.state || 'empty', covered: p.state === 'covered' }; });
  };
  R.info = function (n) {
    var p = (this.state.ports || [])[n - 1] || {};
    return { n: n, state: p.state || 'empty', key: p.key || null, title: modTitle(p), values: p.values || {}, text: p.text || '' };
  };
  R.power = function () {
    var p = this.state.power || {};
    return { battery: p.battery === undefined ? 0 : p.battery, usb: !!p.usb, charging: !!p.charging, volts: p.volts || 0, amps: p.amps || 0, source: p.source || '', on: true };
  };
  R.run = function (code, map) { this.status_ = 'running'; this.emit('status', 'running'); this.t.send({ t: 'run', code: code }); };
  R.stop = function () { this.t.send({ t: 'stop' }); };
  R.pause = function () { this.t.send({ t: 'pause' }); };
  R.resume = function () { this.t.send({ t: 'resume' }); };
  R.running = function () { return this.status_ === 'running' || this.status_ === 'paused'; };
  R.command = function (port, words) { this.t.send({ t: 'cmd', port: port, words: words }); };
  R.disconnect = function () { this.t.close(); };

  /* ---------------------------------------------------------------- the picture of the real board */
  var MIRROR = {
    inputs: {
      button: function (m, v) { m.set('pressed', !!v.pressed); }, touch: function (m, v) { m.set('touched', !!v.pressed); },
      'switch': function (m, v) { m.set('on', !!v.on); }, pir: function (m, v) { m.set('motion', !!v.motion); }, hall: function (m, v) { m.set('magnet', !!v.magnet); },
      pot: function (m, v) { m.set('pos', (v.value || 0) / 100); }, slider: function (m, v) { m.set('pos', (v.position || 0) / 100); },
      joystick: function (m, v) { m.set('dx', v.x || 0); m.set('dy', -(v.y || 0)); m.set('push', !!v.pressed); }
    },
    outputs: {
      led: function (m, v) { m.out.b = (v.brightness || 0) / 100; m.touch(); },
      rgb: function (m, v) { var k = (v.brightness === undefined ? 100 : v.brightness) / 100; k *= k; m.out.rgb = [(v.r || 0) * k, (v.g || 0) * k, (v.b || 0) * k]; m.touch(); },
      relay: function (m, v) { if (m.out.on !== !!v.on) { m.out.on = !!v.on; m.touch(); } },
      servo: function (m, v) { if (v.angle >= 0) { m.out.target = v.angle; m.out.angle = v.angle; m.out.valid = true; m.touch(); } },
      buzzer: function (m, v) { m.out.freq = v.freq || 0; m.out.duty = v.freq ? 0.5 : 0; m.touch(); }
    }
  };

  /** keeps the board picture equal to the real board while it is the active device */
  function Mirror(ide) {
    this.ide = ide; this.sim = ide.sim; this.board = ide.sim.board; this.on = false; this.saved = null;
  }
  Mirror.prototype.enter = function (dev) {
    if (this.on) return;
    this.on = true; this.dev = dev;
    this.saved = this.board.serialize();
    this.board.runtime && this.board.runtime.stop && this.board.runtime.stop(true);
    this.board.contract.reset();
    this.board.contract.suspended = true;
    this.board.clear();
    document.getElementById('ide-right').classList.add('mirroring');
    this.apply();
  };
  Mirror.prototype.leave = function () {
    if (!this.on) return;
    this.on = false;
    this.board.clear();
    this.board.contract.suspended = false;
    if (this.saved) this.board.restore(this.saved);
    this.ide.app.bv.syncFromBoard(); this.ide.app.tray.refresh();
    document.getElementById('ide-right').classList.remove('mirroring');
  };
  Mirror.prototype.apply = function () {
    if (!this.on || !this.dev) return;
    var board = this.board, dev = this.dev;
    var power = dev.power();
    dev.ports().forEach(function (rp) {
      var lp = board.port(rp.n), cur = lp.module;
      if (rp.covered) return;
      if ((cur && cur.key) !== rp.key) {
        if (cur) board.detach(rp.n);
        if (rp.key && Q.moduleDef(rp.key)) {
          var color = rp.key === 'led' ? dev.info(rp.n).text : '';                // the LED reports its colour as text
          try { board.attach(rp.n, rp.key, ['white', 'red', 'yellow', 'green', 'blue'].indexOf(color) >= 0 ? { variant: color } : undefined); } catch (e) { /* the picture cannot hold it: skip */ }
        }
        cur = board.port(rp.n).module;
      }
      if (!cur) return;
      var info = dev.info(rp.n), v = info.values || {};
      if (MIRROR.inputs[cur.key]) MIRROR.inputs[cur.key](cur, v);
      if (MIRROR.outputs[cur.key]) MIRROR.outputs[cur.key](cur, v);
    });
  };

  /* ---------------------------------------------------------------- the list of boards */
  function RemoteLink(ide) {
    this.ide = ide; this.mirror = new Mirror(ide); this.error = '';
    var self = this;
    ide.hub.on('select', function (d, was) {
      if (was && was.kind !== 'sim') { was.off_ && was.off_(); }
      if (d && d.kind !== 'sim') { self.mirror.enter(d); d.on('state', function () { self.mirror.apply(); }); }
      else self.mirror.leave();
    });
    this.autodetect();
  }
  RemoteLink.prototype.connect = function (kind, target) {
    var ide = this.ide, self = this, t;
    this.error = '';
    try { t = kind === 'usb' ? new SerialTransport(target) : new WsTransport(target); }
    catch (e) { this.failed(null, e); return null; }
    var dev = new RemoteDevice(t, this);
    dev.pending = true;
    this.pending = dev;
    ide.devices.render();
    return dev;
  };
  RemoteLink.prototype.connectWifi = function (addr) {
    addr = (addr || '').trim() || '192.168.4.1';
    var url = /^wss?:\/\//.test(addr) ? addr : 'ws://' + addr.replace(/\/.*$/, '') + '/ws';
    return this.connect('wifi', url);
  };
  RemoteLink.prototype.connectSerial = function () {
    var self = this;
    if (!navigator.serial) { this.error = T('Браузер не умеет Web Serial: нужен Chrome или Edge на компьютере'); this.ide.devices.render(); return; }
    navigator.serial.requestPort().then(function (p) { self.connect('usb', p); }).catch(function (e) { if (e && e.name !== 'NotFoundError') { self.error = e.message; self.ide.devices.render(); } });
  };
  RemoteLink.prototype.ready = function (dev) {
    var hub = this.ide.hub;
    dev.pending = false;
    if (hub.devices.indexOf(dev) < 0) hub.add(dev);
    hub.select(dev);
    this.ide.app.toast(T('Подключено: %1', dev.name), 'ok', 'link');
    this.ide.console.line('info', T('Подключена плата «%1»%2', dev.name, (dev.info_.fw ? T(', прошивка %1', dev.info_.fw) : '')));
  };
  RemoteLink.prototype.lost = function (dev) {
    var hub = this.ide.hub;
    if (hub.devices.indexOf(dev) >= 0) {
      hub.remove(dev);
      this.ide.app.toast(T('Связь с «%1» потеряна', dev.name), 'warn', 'link');
      this.ide.console.line('warn', T('Связь с платой «%1» потеряна. Программа на плате продолжает работать, пока плата включена.', dev.name));
    }
    if (this.pending === dev) this.pending = null;
  };
  RemoteLink.prototype.failed = function (dev, e) {
    this.error = (e && e.message) || T('не удалось подключиться');
    this.pending = null;
    this.ide.devices.render();
  };
  /** the IDE served by the board itself: connect without asking */
  RemoteLink.prototype.autodetect = function () {
    var self = this;
    if (!/^https?:$/.test(location.protocol) || !G.fetch) return;
    G.fetch('qbit.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.qbit) self.connectWifi(location.host);
    }).catch(function () { /* served by something that is not a board */ });
  };
  RemoteLink.prototype.connectUi = function () {
    var self = this, hub = this.ide.hub;
    var addr = h('input', { type: 'text', placeholder: '192.168.4.1', value: this._addr || '', 'aria-label': T('Адрес платы') });
    addr.addEventListener('input', function () { self._addr = addr.value; });
    var wifi = h('button', { cls: 'btn small', type: 'button', text: T('Подключиться') });
    wifi.addEventListener('click', function () { self.connectWifi(addr.value); });
    addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') wifi.click(); });
    var usb = h('button', { cls: 'btn small', type: 'button', text: T('Подключить по USB…') });
    usb.addEventListener('click', function () { self.connectSerial(); });
    var box = h('div', { cls: 'connect-box' },
      h('div', { text: T('Настоящая плата: Wi-Fi «q.bit-…», адрес обычно 192.168.4.1, или USB-C.') }),
      h('div', { cls: 'row' }, addr, wifi, usb));
    if (this.pending) box.appendChild(h('div', { text: T('Подключаюсь…') }));
    if (this.error) box.appendChild(h('div', { style: { color: 'var(--err)' }, text: this.error }));
    return box;
  };

  Q.RemoteLink = RemoteLink; Q.RemoteDevice = RemoteDevice; Q.Mirror = Mirror;
})(typeof globalThis !== 'undefined' ? globalThis : this);
