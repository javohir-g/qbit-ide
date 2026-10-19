/* The q.bit main board: 8 magnetic ports, power tree, I2C mux, status LEDs and the "core firmware" that
   notices modules, reads their passports and keeps the current budget.  No DOM in here.

   Port numbers are 1..8 everywhere (P1..P4 top row, P5..P8 bottom row, USB-C edge on top).
   What the real firmware does and what the sim only assumes is marked "policy" in the comments. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util, P = Q.POWER;

  var DEBOUNCE_S = 0.2;            // policy: wait for the contacts to settle before reading the passport
  var BUDGET_FRACTION = 0.9;       // policy: never promise more than 90 % of the source to the modules
  var RETRY_S = 1.0, RETRY_MAX = 3;// policy: re-arm a tripped port eFuse three times, then lock it
  var BOOT_S = 1.2;

  /* ------------------------------------------------------------------ SIG line (ESP32 GPIO of a port) */
  function SigLine(port) {
    U.Emitter.call(this);
    this.port = port;
    this.reset();
  }
  SigLine.prototype = Object.create(U.Emitter.prototype);
  SigLine.prototype.reset = function () {
    this.mode = 'in';           // 'in' | 'adc' | 'out' | 'pwm'
    this.level = 0;
    this.freq = 0;
    this.duty = 0;
    this.drive = { type: 'hiz' };
    this._last = 0;
    this.activity = 0;          // for the UI: counts writes
    if (this.port.module) this.port.module.onSig(this.drive);   // the pin floats again: the module's pull-down wins
  };
  SigLine.prototype._board = function () { return this.port.board; };
  /** Drivers subscribe to 'edge'; a new driver must not inherit the old one's listeners. */
  SigLine.prototype.clearHandlers = function () { this._h = {}; };
  SigLine.prototype._push = function (d) {
    this.drive = d;
    this.activity++;
    var m = this.port.module;
    if (m) m.onSig(d);
  };
  /** Configure as input ('in' digital, 'adc' analogue). */
  SigLine.prototype.config = function (mode) {
    if (mode === 'in' || mode === 'adc') {
      var was = this.mode;
      this.mode = mode;
      if (was === 'out' || was === 'pwm') this._push({ type: 'hiz' });
    } else if (mode === 'out') {
      this.write(this.level);
    }
  };
  SigLine.prototype.write = function (v) {
    if (!this._board().running) return;
    this.mode = 'out';
    this.level = v ? 1 : 0;
    this.freq = 0; this.duty = 0;
    this._push({ type: 'level', v: this.level });
  };
  /** PWM like ESP32 LEDC: freq Hz, duty 0..1. freq <= 0 or duty <= 0 is plain "low". */
  SigLine.prototype.pwm = function (freq, duty) {
    if (!this._board().running) return;
    duty = U.clamp(duty, 0, 1);
    if (!(freq > 0) || duty <= 0) return this.write(0);
    if (duty >= 1) return this.write(1);
    this.mode = 'pwm';
    this.freq = freq; this.duty = duty; this.level = 0;
    this._push({ type: 'pwm', freq: freq, duty: duty });
  };
  /** A one-shot burst the peripheral (RMT) produces: WS2812 pixels, an IR code ... */
  SigLine.prototype.frame = function (kind, data) {
    if (!this._board().running) return;
    this.mode = 'out';
    this._push({ type: 'frame', kind: kind, data: data });
    this.drive = { type: 'level', v: this.level };
  };
  SigLine.prototype.readMv = function () {
    var b = this._board();
    if (!b.pw.on) return 0;
    if (this.mode === 'out') return this.level ? 3300 : 0;
    if (this.mode === 'pwm') return Math.round(this.duty * 3300);
    var m = this.port.module;
    var mv = m ? m.sigOut() : null;
    return mv === null || mv === undefined ? 0 : U.clamp(mv, 0, 3300);
  };
  SigLine.prototype.read = function () { return this.readMv() > 1650 ? 1 : 0; };
  /** 12-bit ADC reading, 0 .. 3.1 V full scale (ESP32-S3 ADC1, 11 dB). */
  SigLine.prototype.readRaw = function () { return U.clamp(Math.round(this.readMv() / 3100 * 4095), 0, 4095); };
  /** Called every step by the board: turns level changes into 'edge' events. */
  SigLine.prototype.poll = function () {
    var v = this.read();
    if (v !== this._last) {
      this._last = v;
      this.emit('edge', v);
    }
  };

  /* ------------------------------------------------------------------ I2C port bus (ESP32 IO17/IO18) */
  function I2CBus(board) {
    this.board = board;
    this.muxMask = 0;              // TCA9548A (0x74): bit n-1 = channel of port n
    this.trace = [];
    var self = this;
    this._mux = {
      write: function (bytes) { if (bytes.length) self.muxMask = bytes[0] & 0xFF; return true; },
      read: function (n) { return new Uint8Array(n).fill(self.muxMask); }
    };
  }
  I2CBus.prototype._log = function (op, addr, bytes, ack) {
    this.trace.push({ t: this.board.time, op: op, addr: addr, bytes: Array.prototype.slice.call(bytes || []).slice(0, 16), ack: ack });
    if (this.trace.length > 60) this.trace.shift();
  };
  I2CBus.prototype._targets = function (addr) {
    if (addr === 0x74) return [this._mux];
    var out = [];
    for (var i = 0; i < 8; i++) {
      if (!(this.muxMask & (1 << i))) continue;
      var m = this.board.ports[i].module;
      if (!m || !m.powered || !this.board.ports[i].on) continue;
      var d = m.i2cDevices()[addr];
      if (d) out.push(d);
    }
    return out;
  };
  /** Addresses that answer with the current mux selection (0x74 itself always answers). */
  I2CBus.prototype.scan = function () {
    var found = { 0x74: true };
    for (var i = 0; i < 8; i++) {
      if (!(this.muxMask & (1 << i))) continue;
      var p = this.board.ports[i], m = p.module;
      if (!m || !m.powered || !p.on) continue;
      var map = m.i2cDevices();
      for (var a in map) found[+a] = true;
    }
    return Object.keys(found).map(Number).sort(function (a, b) { return a - b; });
  };
  I2CBus.prototype.write = function (addr, bytes) {
    var t = this._targets(addr);
    this._log('W', addr, bytes, t.length > 0);
    if (!t.length) return false;
    t.forEach(function (d) { d.write(bytes); });
    return true;
  };
  I2CBus.prototype.read = function (addr, n) {
    var t = this._targets(addr);
    if (!t.length) { this._log('R', addr, [], false); return null; }
    var out = t[0].read(n);
    for (var k = 1; k < t.length; k++) {            // two devices on one address: the open-drain bus ANDs them
      var o = t[k].read(n);
      for (var i = 0; i < n; i++) out[i] &= o[i];
    }
    this._log('R', addr, out, true);
    return out;
  };
  I2CBus.prototype.writeRead = function (addr, bytes, n) {
    if (!this.write(addr, bytes)) return null;
    return this.read(addr, n);
  };

  /* ------------------------------------------------------------------ port */
  function Port(board, g) {
    U.Emitter.call(this);
    this.board = board;
    this.n = g.n;
    this.x = g.x; this.y = g.y;
    this.row = (g.n - 1) >> 2;
    this.col = (g.n - 1) & 3;
    this.sig = new SigLine(this);
    this.module = null;            // module whose connector sits on this port
    this.covered = null;           // 65 mm module whose second half lies over this port
    this.en = true;                // PORT_EN (TCA9535): 100k pull-up = on by default
    this.on = false;               // eFuse conducting
    this.pg = false;               // PORT_PG: 5V_Pn above 4.5 V
    this.v = 0;                    // volts at the contacts
    this.iMa = 0;
    this.tripped = false;
    this.locked = false;           // retries exhausted
    this.retries = 0;
    this.retryAt = 0;
    this.overT = 0;
    this._soft = 0;
    this.state = 'empty';          // empty | debounce | ready | unknown | fault | nobudget | covered
    this.reason = '';
    this.t0 = 0;
    this.info = null;              // decoded passport
    this.declaredMa = 0;
  }
  Port.prototype = Object.create(U.Emitter.prototype);

  /* ------------------------------------------------------------------ board */
  function Board(opts) {
    U.Emitter.call(this);
    opts = opts || {};
    var geom = Q.DATA.board;
    this.geom = geom;
    this.time = 0;
    this.env = new Q.Environment();
    this.ports = geom.ports.map(function (g) { return new Port(this, g); }, this);
    this.i2c = new I2CBus(this);
    this.logs = [];
    this.sourceId = opts.source || 'usb-pd';
    this.pw = {
      src: Q.SOURCES[this.sourceId], on: false, v5: 0, iMa: 0, pW: 0, brownT: 0,
      overload: false, soc: opts.soc === undefined ? 78 : opts.soc, charging: false, vbat: 3.9, vbus: 0
    };
    this.mcu = { state: 'off', t: 0, script: [], bootNo: 0 };
    this.statusLed = { r: 0, g: 0, b: 0 };
    this.statusOverride = null;      // a program may paint the status LED: [r, g, b]
    this.pwrLed = false;
    this.pairUntil = 0;
    this._keyDown = false;           // PAIR/POWER key physically pressed
    this._pairDown = 0;              // time it went down
    this._pairWakes = false;         // this press is what switched the board on
    this._pairHandled = false;       // the long press already did its job
    this._stagger = 0;               // after a brown-out the ports come back one by one
    this._bootHeld = false;
    this._timers = [];
    this._timerId = 0;
    this.wifi = { ssid: 'q.bit-' + (opts.ssid || '4F2A'), clients: 0 };
    this.runtime = null;             // the program runner plugs in here (IDE step)
    if (opts.autostart !== false) this.log('info', 'USB-C: ' + this.pw.src.label);
  }
  Board.prototype = Object.create(U.Emitter.prototype);

  Object.defineProperty(Board.prototype, 'running', { get: function () { return this.mcu.state === 'run'; } });

  Board.prototype.port = function (n) { return this.ports[n - 1] || null; };
  Board.prototype.modules = function () {
    return this.ports.filter(function (p) { return p.module; }).map(function (p) { return p.module; });
  };

  Board.prototype.log = function (level, text) {
    var e = { t: this.time, level: level, text: text };
    this.logs.push(e);
    if (this.logs.length > 400) this.logs.shift();
    this.emit('log', e);
  };

  /* ---- placing modules ------------------------------------------------------------------------ */
  /** Can this module type go on port n? -> {ok, code, reason} */
  Board.prototype.canPlace = function (n, keyOrDef, ignoreModule) {
    var def = typeof keyOrDef === 'string' ? Q.moduleDef(keyOrDef) : keyOrDef;
    var p = this.port(n);
    if (!def || !p) return { ok: false, code: 'bad', reason: T('нет такого порта') };
    var free = function (q) { return (!q.module || q.module === ignoreModule) && (!q.covered || q.covered === ignoreModule); };
    if (!free(p)) return { ok: false, code: 'busy', reason: T('порт P%1 занят', n) };
    if (def.fmt === 65) {
      if (p.col === 3) return { ok: false, code: 'edge', reason: T('двойной модуль не помещается: справа нет порта') };
      var nb = this.ports[n];
      if (!free(nb)) return { ok: false, code: 'busy', reason: T('соседний порт P%1 занят', (n + 1)) };
    }
    return { ok: true };
  };

  Board.prototype.attach = function (n, key, opts) {
    var def = Q.moduleDef(key);
    if (!def) throw new Error(T('неизвестный модуль: %1', key));
    var chk = this.canPlace(n, def);
    if (!chk.ok) { var err = new Error(chk.reason); err.code = chk.code; throw err; }
    var inst = Q.createModule(key, Object.assign({}, opts || {}, { board: this }));
    this._seat(this.port(n), inst);
    return inst;
  };

  /** Put an existing module instance (one that was picked up before) onto port n. */
  Board.prototype.attachInstance = function (n, inst) {
    var chk = this.canPlace(n, inst.def, inst);
    if (!chk.ok) { var err = new Error(chk.reason); err.code = chk.code; throw err; }
    inst.board = this;
    this._seat(this.port(n), inst);
    return inst;
  };

  Board.prototype._seat = function (port, inst) {
    port.module = inst;
    inst.port = port;
    if (inst.slots === 2) { this.ports[port.n].covered = inst; this.ports[port.n].state = 'covered'; }
    port.sig.reset();
    port.state = 'debounce';
    port.reason = '';
    port.info = null;
    port.t0 = this.time;
    port.retries = 0; port.locked = false; port.tripped = false; port.overT = 0;
    // the module may already have been driven by an earlier SIG write on this port: nothing to resend
    this.log('info', T('P%1: вставлен модуль «%2»%3', port.n, inst.name, (inst.slots === 2 ? T(' (занимает P%1+P%2)', port.n, (port.n + 1)) : '')));
    this.emit('attach', port, inst);
  };

  /** Pull a module off. n may be the connector port or the covered one. Returns the instance (or null). */
  Board.prototype.detach = function (n) {
    var p = this.port(n);
    if (!p) return null;
    var inst = p.module || p.covered;
    if (!inst) return null;
    var host = inst.port;
    inst.setPowered(false);
    host.module = null;
    if (inst.slots === 2) { var nb = this.ports[host.n]; nb.covered = null; nb.state = 'empty'; }
    host.state = 'empty'; host.info = null; host.reason = '';
    host.sig.reset();
    host.tripped = false; host.locked = false; host.retries = 0; host.iMa = 0;
    inst.port = null;
    inst.unload();
    this.log('info', T('P%1: модуль «%2» снят', host.n, inst.name));
    this.emit('detach', host, inst);
    return inst;
  };

  Board.prototype.move = function (fromN, toN) {
    var inst = (this.port(fromN) || {}).module;
    if (!inst) return null;
    var chk = this.canPlace(toN, inst.def, inst);
    if (!chk.ok) return null;
    this.detach(fromN);
    this._seat(this.port(toN), inst);
    return inst;
  };

  Board.prototype.clear = function () {
    for (var i = 1; i <= 8; i++) if (this.port(i).module) this.detach(i);
  };

  Board.prototype.setPortEnable = function (n, on) {
    var p = this.port(n);
    if (!p) return;
    p.en = !!on;
    if (on && p.locked) this.resetPort(n);
    this.emit('portEnable', p, p.en);
  };

  /** "Сбросить защиту": clear a locked eFuse and let the port try again. */
  Board.prototype.resetPort = function (n) {
    var p = this.port(n);
    if (!p) return;
    p.tripped = false; p.locked = false; p.retries = 0; p.overT = 0;
    if (p.module) { p.state = 'debounce'; p.t0 = this.time; p.reason = ''; }
    this.log('info', T('P%1: защита сброшена', n));
  };

  /* ---- sources, power key, buttons ----------------------------------------------------------- */
  Board.prototype.setSource = function (id) {
    if (!Q.SOURCES[id] || id === this.sourceId) return;
    this.sourceId = id;
    this.pw.src = Q.SOURCES[id];
    this.log('info', this.pw.src.usb ? 'USB-C: ' + this.pw.src.label : T('USB-C отключён, питание от аккумулятора'));
    this.emit('power');
  };

  /** Physical buttons: 'reset' / 'boot' on the front wall, 'pair' under the case. down = pressed. */
  Board.prototype.pressButton = function (name, down) {
    if (name === 'pair') {
      if (down && !this._keyDown) {
        this._keyDown = true;
        this._pairDown = this.time;
        this._pairHandled = false;
        // on battery the key itself powers the boost (Q4); the firmware then holds PWR_HOLD
        this._pairWakes = this.mcu.state === 'off' && !this.pw.src.usb;
        if (this._pairWakes) this.log('info', T('Кнопка PAIR/POWER: включение от аккумулятора'));
      } else if (!down && this._keyDown) {
        var held = this.time - this._pairDown;
        this._keyDown = false;
        var skip = this._pairWakes || this._pairHandled;
        this._pairWakes = false;
        if (!skip && this.mcu.state === 'run') this._pairTap(held);
      }
    } else if (name === 'boot') {
      this._bootHeld = !!down;
    } else if (name === 'reset') {
      if (!down) this._reset(this._bootHeld ? 'dfu' : 'normal');
    }
  };

  Board.prototype._pairTap = function () {
    this.pairUntil = this.time + 3;
    this.log('info', T('PAIR: режим сопряжения (Bluetooth появится позже)'));
    this.emit('pair');
  };

  /** The firmware lets go of PWR_HOLD. Only has an effect on battery: with USB the board stays powered. */
  Board.prototype.shutdown = function () {
    if (this.pw.src.usb) { this.log('warn', T('Выключить можно только от аккумулятора — отключите USB-C')); return; }
    this.log('info', T('Выключение: порты отключены, PWR_HOLD отпущен'));
    this._mcuStop();
    this.emit('power');
  };

  Board.prototype._reset = function (kind) {
    if (this.mcu.state === 'off') return;
    this.log('info', kind === 'dfu' ? T('BOOT + RESET: режим загрузчика, ждёт прошивку по USB') : T('RESET: перезагрузка'));
    this._mcuStart(kind === 'dfu' ? 'dfu' : 'boot');
    this.emit('reset', kind);
  };

  /* ---- MCU / firmware ------------------------------------------------------------------------- */
  Board.prototype._mcuStart = function (state) {
    this.mcu.state = state || 'boot';
    this.mcu.t = 0;
    this.mcu.bootNo++;
    this.statusOverride = null;
    var src = this.pw.src;
    var script = [
      [0.05, 'info', T('q.bit core 0.1 (симулятор) · ESP32-S3 240 МГц · 8 МБ PSRAM')],
      [0.30, 'info', src.usb ? T('USB-C: %1, лимит ≈ %2 А', (src.vbus > 6 ? T('PD-контракт %1 В → buck 5 В', src.vbus) : T('VBUS 5 В → обходной eFuse')), (src.maxMa / 1000).toFixed(1))
                             : T('Питание от аккумулятора: бустер 5 В, лимит ≈ %1 А', (src.maxMa / 1000).toFixed(1))],
      [0.55, 'info', T('INA226 0x40 · MAX17048 0x36 · TCA9535 0x20 · TCA9548A 0x74: ок')],
      [0.85, 'info', T('Wi-Fi AP «%1» запущена', this.wifi.ssid)]
    ];
    this.mcu.script = state === 'dfu' ? [[0.1, 'warn', T('Загрузчик ROM: жду прошивку')]] : script;
    if (this.runtime && this.runtime.onReset) this.runtime.onReset();
    this._rescan();
    this.emit('mcu', this.mcu.state);
  };

  Board.prototype._mcuStop = function () {
    if (this.mcu.state === 'off') return;
    this.mcu.state = 'off';
    this.mcu.script = [];
    if (this.runtime && this.runtime.onReset) this.runtime.onReset();
    this._rescan();
    this.emit('mcu', 'off');
  };

  /** A reset forgets everything the firmware knew: GPIOs float, drivers are gone, passports get read again. */
  Board.prototype._rescan = function () {
    this._timers = [];
    for (var i = 0; i < 8; i++) {
      var p = this.ports[i];
      p.sig.reset();
      p.declaredMa = 0;
      if (p.module) {
        p.module.unload();
        p.info = null;
        if (p.state !== 'covered') { p.state = 'debounce'; p.t0 = this.time; p.reason = ''; }
      }
    }
  };

  Board.prototype._stepMcu = function (dt) {
    var m = this.mcu;
    if (m.state === 'off' || m.state === 'dfu') {
      this._runScript(dt);
      return;
    }
    m.t += dt;
    this._runScript(dt);
    if (m.state === 'boot' && m.t >= BOOT_S) {
      m.state = 'run';
      this.log('info', T('Прошивка запущена. Порты: ищу модули…'));
      // after a brown-out the ports come back one by one (policy)
      this.emit('mcu', 'run');
    }
  };

  Board.prototype._runScript = function (dt) {
    var m = this.mcu;
    if (m.state === 'off') return;
    var t = m.state === 'dfu' ? (m.t += dt) : m.t;
    while (m.script.length && m.script[0][0] <= t) {
      var e = m.script.shift();
      this.log(e[1], e[2]);
    }
  };

  /* ---- time ----------------------------------------------------------------------------------- */
  /** Wall-clock time the RTC module follows (ms since epoch). Tests replace it. */
  Board.prototype.now = function () { return Date.now(); };

  /** Run fn after `seconds` of simulated time (what a driver does for tone(f, ms)). Cleared by a reset. */
  Board.prototype.after = function (seconds, fn) {
    var id = ++this._timerId;
    this._timers.push({ id: id, at: this.time + seconds, fn: fn });
    return id;
  };
  Board.prototype.cancel = function (id) {
    this._timers = this._timers.filter(function (t) { return t.id !== id; });
  };
  Board.prototype._runTimers = function () {
    if (!this._timers.length) return;
    var due = this._timers.filter(function (t) { return t.at <= this.time; }, this);
    if (!due.length) return;
    this._timers = this._timers.filter(function (t) { return t.at > this.time; }, this);
    due.sort(function (a, b) { return a.at - b.at; });
    for (var i = 0; i < due.length; i++) {
      try { due[i].fn(); } catch (e) { if (G.console) G.console.error('[qbit] timer failed:', e); }
    }
  };

  /** An I2C device as the firmware sees it: every call selects the port's mux channel first. */
  Board.prototype.dev = function (portN, addr) {
    var self = this, bus = this.i2c;
    function ch(fn) {
      var prev = bus.muxMask;
      bus.write(0x74, [1 << (portN - 1)]);
      try { return fn(); } finally { bus.write(0x74, [prev]); }
    }
    return {
      addr: addr,
      write: function (bytes) { return ch(function () { return bus.write(addr, bytes); }); },
      read: function (n) { return ch(function () { return bus.read(addr, n); }); },
      writeRead: function (bytes, n) { return ch(function () { return bus.writeRead(addr, bytes, n); }); },
      readReg: function (reg, n) { return self.dev(portN, addr).writeRead([reg], n || 1); },
      writeReg: function (reg, v) { return self.dev(portN, addr).write([reg].concat(Array.isArray(v) ? v : [v])); }
    };
  };

  /** Advance the whole world by dt seconds. */
  Board.prototype.step = function (dt) {
    dt = U.clamp(dt, 0, 0.1);
    this.time += dt;
    this.env.step(dt, this.time);
    this._stepPowerKey(dt);
    this._stepMcu(dt);
    this._runTimers();
    var i, p, m;
    var rail = this.pw.on && this.pw.v5 > 3.9;
    // 1. eFuses and what the modules see
    for (i = 0; i < 8; i++) {
      p = this.ports[i];
      m = p.module;
      if (!rail) { p.on = false; p._soft = 0; }
      else if (p.tripped) {
        p.on = false;
        if (!p.locked && this.time >= p.retryAt) { p.tripped = false; p._soft = 0; this.log('info', T('P%1: повторное включение (%2/%3)', p.n, p.retries, RETRY_MAX)); }
      } else if (p.en && this.time >= this._stagger + 0.15 * (p.n - 1) * (this._stagger > 0 ? 1 : 0)) {
        p._soft += dt;
        if (p._soft >= 0.015) p.on = true;
      } else { p.on = false; p._soft = 0; }
      if (m) m.setPowered(p.on && this.pw.v5 > 3.9);
    }
    // 2. what the modules do
    for (i = 0; i < 8; i++) { m = this.ports[i].module; if (m) m.update(dt); }
    // 3. currents, eFuse protection
    var total = this.pw.on ? P.baseMa : 0;
    for (i = 0; i < 8; i++) {
      p = this.ports[i]; m = p.module;
      var cur = p.on && m ? m.currentMa() : 0;
      if (cur > P.portIlimMa) {
        p.overT += dt;
        cur = P.portIlimMa;
        if (p.overT >= P.portTripMs / 1000) this._trip(p);
      } else p.overT = Math.max(0, p.overT - dt);
      p.iMa = p.on ? cur : 0;
      total += p.iMa;
    }
    this.pw.iMa = total;
    // 4. the supply
    this._stepSupply(dt);
    for (i = 0; i < 8; i++) {
      p = this.ports[i];
      p.v = p.on ? Math.max(0, this.pw.v5 - p.iMa / 1000 * P.portRon) : 0;
      p.pg = p.on && p.v >= P.portPgV;
      if (p.module) this._stepPort(p, dt);
      p.sig.poll();
    }
    this._stepLeds();
    this.emit('step', dt);
    if (this.runtime && this.runtime.tick) this.runtime.tick(dt);
  };

  Board.prototype._stepPowerKey = function () {
    // policy: PAIR held for 2 s while running on battery switches the board off
    if (this._keyDown && !this._pairWakes && !this._pairHandled && this.mcu.state === 'run' &&
        !this.pw.src.usb && this.time - this._pairDown >= 2) {
      this._pairHandled = true;
      this.log('info', T('Удержание PAIR 2 с: выключение'));
      this.shutdown();
    }
  };

  Board.prototype._trip = function (p) {
    if (p.tripped) return;
    p.tripped = true;
    p.on = false;
    p.retries++;
    p.retryAt = this.time + RETRY_S;
    p.state = 'fault';
    if (p.retries > RETRY_MAX) {
      p.locked = true;
      p.reason = T('перегрузка: защита заблокировала порт');
      this.log('err', T('P%1: перегрузка > %2 А — порт отключён, нужна ручная разблокировка', p.n, (P.portIlimMa / 1000).toFixed(1)));
    } else {
      p.reason = T('перегрузка > %1 А', (P.portIlimMa / 1000).toFixed(1));
      this.log('err', T('P%1: перегрузка > %2 А — eFuse выключил порт', p.n, (P.portIlimMa / 1000).toFixed(1)));
    }
    if (p.module) p.module.setPowered(false);
    this.emit('fault', p, p.module);
  };

  Board.prototype._stepSupply = function (dt) {
    var pw = this.pw, src = pw.src;
    var usbPresent = src.usb;
    var wasOn = pw.on;
    // USB: always powered. Battery: the boost runs while the PAIR key is down or the firmware holds PWR_HOLD
    pw.on = usbPresent || ((this._keyDown || this.mcu.state !== 'off') && pw.soc > 0);
    if (!wasOn && pw.on && this.mcu.state === 'off') this._mcuStart();
    if (wasOn !== pw.on) this.emit('power');
    if (wasOn && !pw.on) {
      if (this.mcu.state !== 'off') { this.log('info', T('Питание пропало')); this._mcuStop(); }
      for (var i = 0; i < 8; i++) {
        var q = this.ports[i];
        q.on = false; q.pg = false; q.iMa = 0; q.v = 0;
        if (q.module) q.module.setPowered(false);
      }
    }
    if (!pw.on) {
      pw.v5 = 0; pw.iMa = 0; pw.pW = 0; pw.charging = false; pw.brownT = 0; pw.vbus = 0;
      pw.vbat = 3.0 + 1.2 * U.clamp(pw.soc, 0, 100) / 100;
      return;
    }
    var i5 = pw.iMa;
    var v;
    if (i5 <= src.maxMa) v = src.volts - i5 / 1000 * P.sourceRs;
    else v = Math.max(0, src.volts * (1 - (i5 - src.maxMa) / src.maxMa * 1.6));        // current limit: the rail collapses
    pw.overload = i5 > src.maxMa;
    // INA226 sits before the port eFuses, so shunt drop is tiny
    pw.v5 = v - i5 / 1000 * P.shuntOhm;
    pw.pW = pw.v5 * i5 / 1000;
    pw.vbus = src.usb ? src.vbus : 0;
    // battery
    pw.vbat = 3.0 + 1.2 * U.clamp(pw.soc, 0, 100) / 100;
    if (usbPresent) {
      pw.charging = pw.soc < 100;
      if (pw.charging) pw.soc = Math.min(100, pw.soc + P.chargeMa * dt / 3600 / P.batteryMah * 100);
    } else {
      pw.charging = false;
      var ibat = pw.pW * 1000 / (0.9 * pw.vbat);                           // mA from the cell through the boost
      pw.soc = Math.max(0, pw.soc - ibat * dt / 3600 / P.batteryMah * 100);
      if (pw.soc <= 0) { this.log('err', T('Аккумулятор разряжен — выключение')); this._mcuStop(); }
    }
    // brown-out
    // the collapse makes the loads drop out and the rail recover again: the counter must not forget that quickly
    if (pw.v5 < P.brownoutV) pw.brownT += dt; else pw.brownT = Math.max(0, pw.brownT - dt * 0.25);
    if (pw.brownT > 0.04) {
      pw.brownT = 0;
      this.log('err', T('Просадка 5 В до %1 В — перезагрузка. Источник даёт ≈ %2 А, плата просит %3 А', pw.v5.toFixed(1), (src.maxMa / 1000).toFixed(1), (i5 / 1000).toFixed(1)));
      this.emit('brownout');
      this._stagger = this.time;
      this._mcuStart();
    }
  };

  /** Port manager: debounce, read the passport, pick the driver, keep the budget. */
  Board.prototype._stepPort = function (p, dt) {
    var m = p.module;
    if (p.state === 'fault' && !p.tripped) { p.state = 'debounce'; p.t0 = this.time; }
    if (p.state === 'debounce') {
      if (this.running && p.on && this.time - p.t0 >= DEBOUNCE_S && m.powered) this._readPassport(p);
    } else if (p.state === 'nobudget') {
      if (this._budgetLeft() >= p.declaredMa) { this.log('info', T('P%1: тока хватает — включаю порт', p.n)); this.setPortEnable(p.n, true); p.state = 'debounce'; p.t0 = this.time; p.reason = ''; }
    }
  };

  Board.prototype.budgetMa = function () { return this.pw.src.maxMa * BUDGET_FRACTION; };
  /** declared (passport) current of everything that is ready, plus the board itself */
  Board.prototype.declaredMa = function () {
    var s = P.baseMa;
    this.ports.forEach(function (p) { if (p.state === 'ready') s += p.declaredMa; });
    return s;
  };
  Board.prototype._budgetLeft = function () { return this.budgetMa() - this.declaredMa(); };

  Board.prototype._readPassport = function (p) {
    var bus = this.i2c, m = p.module;
    var prevMask = bus.muxMask;
    bus.write(0x74, [1 << (p.n - 1)]);
    var raw = bus.writeRead(0x50, [0x00], 128);
    bus.write(0x74, [prevMask]);
    if (!raw) return this._unknown(p, T('EEPROM 0x50 не отвечает'));
    var info = Q.Passport.decode(raw);
    if (!info.ok) {
      var why = info.reason === 'magic' ? T('нет метки «QB» (пустая EEPROM?)') : info.reason === 'crc' ? T('не сошёлся CRC паспорта') : T('неизвестный формат паспорта %1', info.format);
      return this._unknown(p, why);
    }
    var def = Q.moduleByTypeId(info.typeId);
    if (!def) return this._unknown(p, T('тип %1 этой прошивке неизвестен', U.hex(info.typeId, 4)), info);
    p.info = info;
    p.declaredMa = info.currentMa;
    if (this.declaredMa() + info.currentMa > this.budgetMa()) {
      p.state = 'nobudget';
      p.reason = T('не хватает тока: нужно %1 мА, свободно %2 мА', info.currentMa, Math.max(0, Math.round(this._budgetLeft())));
      this.log('warn', T('P%1: %2 — %3. Порт выключен.', p.n, def.name, p.reason));
      p.en = false;
      this.emit('budget', p, m);
      return;
    }
    // configure SIG from the passport flags before the driver is loaded (docs/PASSPORT.md, step 4)
    var F = Q.Passport.FLAG;
    if (info.flags & F.SIG_ANALOG) p.sig.config('adc');
    else if (info.flags & F.SIG_OUT) p.sig.write(0);
    else p.sig.config('in');
    p.state = 'ready';
    p.reason = '';
    p.sig.clearHandlers();
    m.unload();
    m.api = def.api ? def.api(m, p, this) : {};
    this.log('ok', T('P%1: %2 %3%4 · %5 · ~%6 мА%7', p.n, def.name, U.hex(info.typeId, 4), (info.i2cAddr ? ' · I²C ' + U.hex(info.i2cAddr) : ''), info.ifaceName, info.currentMa, (m.variant ? ' · ' + m.variant : '')));
    this.emit('ready', p, m);
  };

  Board.prototype._unknown = function (p, why, info) {
    p.state = 'unknown';
    p.reason = why;
    p.info = info || null;
    p.sig.config('in');
    this.log('warn', T('P%1: неизвестный модуль — %2. SIG остаётся входом, 5 В в бюджет не берётся.', p.n, why));
    this.emit('unknown', p, p.module, why);
  };

  Board.prototype._stepLeds = function () {
    var t = this.time, st = this.mcu.state;
    this.pwrLed = st !== 'off';
    var c = [0, 0, 0];
    if (st === 'boot') { var k = 0.5 + 0.5 * Math.sin(t * 9); c = [Math.round(60 * k), Math.round(60 * k), Math.round(80 * k)]; }
    else if (st === 'dfu') c = (t * 2) % 1 < 0.5 ? [90, 40, 0] : [0, 0, 0];
    else if (st === 'run') {
      var fault = this.ports.some(function (p) { return p.state === 'fault'; });
      if (this.statusOverride) c = this.statusOverride.slice();
      else if (this.pw.overload) c = (t * 4) % 1 < 0.5 ? [160, 0, 0] : [0, 0, 0];
      else if (fault) c = (t * 2) % 1 < 0.5 ? [140, 0, 0] : [30, 0, 0];
      else if (t < this.pairUntil) c = (t * 3) % 1 < 0.5 ? [100, 0, 170] : [10, 0, 20];
      else { var b = 0.55 + 0.45 * Math.sin(t * 2.2); c = [0, Math.round(70 * b), Math.round(150 * b)]; }   // slow cyan breathing = ready, AP is up
    }
    this.statusLed.r = c[0]; this.statusLed.g = c[1]; this.statusLed.b = c[2];
  };

  /* ---- IR light between modules on the same board ---------------------------------------------- */
  Board.prototype.irBroadcast = function (frame, from) {
    if (!this.env.irCoupling) return;
    for (var i = 0; i < 8; i++) {
      var m = this.ports[i].module;
      if (m && m !== from && m.powered && m.def.irReceive) m.def.irReceive(m, frame);
    }
  };

  /* ---- convenience for tests and the runtime ----------------------------------------------------- */
  /** Run seconds of simulated time in 20 ms steps. */
  Board.prototype.run = function (seconds, dt) {
    dt = dt || 0.02;
    var n = Math.round(seconds / dt);
    for (var i = 0; i < n; i++) this.step(dt);
  };

  Board.prototype.serialize = function () {
    return {
      v: 1, source: this.sourceId, soc: Math.round(this.pw.soc * 10) / 10,
      ports: this.ports.filter(function (p) { return p.module; }).map(function (p) {
        var j = p.module.toJSON(); j.port = p.n; return j;
      }),
      env: this.env.toJSON()
    };
  };

  Board.prototype.restore = function (o) {
    if (!o) return;
    this.clear();
    if (o.source && Q.SOURCES[o.source]) this.setSource(o.source);
    if (typeof o.soc === 'number') this.pw.soc = o.soc;
    if (o.env) this.env.restore(o.env);
    var self = this;
    (o.ports || []).forEach(function (j) {
      try { self.attach(j.port, j.key, { variant: j.variant, state: j.state }); }
      catch (e) { self.log('warn', T('не удалось восстановить P%1: %2', j.port, e.message)); }
    });
  };

  Q.Board = Board;
  Q.Port = Port;
  Q.NUMBERS = { DEBOUNCE_S: DEBOUNCE_S, BUDGET_FRACTION: BUDGET_FRACTION, RETRY_S: RETRY_S, RETRY_MAX: RETRY_MAX, BOOT_S: BOOT_S };
})(typeof globalThis !== 'undefined' ? globalThis : this);
