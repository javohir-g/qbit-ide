/* Runs a program on the simulated board: the Python interpreter (pyinterp.js) plus the `qbit` module a program imports (the same module
   the real board has), wired to the board through the contract layer (contract.js).

   const rt = new Q.Runtime(board);
   rt.on('print' | 'error' | 'status' | 'line', fn);
   rt.run(pythonSource);   rt.stop();   rt.pause(); rt.resume();

   Programs are cooperative tasks (see pyinterp.js). "when ..." handlers start a new task per event; if the previous run of the same handler is
   still going, the new event is skipped (the same rule the firmware uses, so a slow handler cannot pile up). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var Py = Q.Py, SPEC = Q.SPEC;

  var ERR_RU = [
    [/^name '(.+)' is not defined$/, function (m) { return T('переменная или функция «%1» не задана', m[1]); }],
    [/^division by zero$|^integer division or modulo by zero$/, function () { return T('деление на ноль'); }],
    [/^list index out of range$/, function () { return T('в списке нет элемента с таким номером'); }],
    [/^unsupported operand type\(s\) for (.+): '(.+)' and '(.+)'$/, function (m) { return T('нельзя применить «%1» к %2 и %3', m[1], m[2], m[3]); }],
    [/the program runs too long without a pause/, function () { return T('программа слишком долго работает без паузы (бесконечный цикл?); добавьте блок «ждать»'); }]
  ];
  function explain(e) {
    for (var i = 0; i < ERR_RU.length; i++) { var m = ERR_RU[i][0].exec(e.msg); if (m) return ERR_RU[i][1](m); }
    return e.msg;
  }

  function Runtime(board, opts) {
    var self = this;
    opts = opts || {};
    this.board = board;
    this.contract = board.contract || (board.contract = new Q.Contract(board));
    this.handlers = [];
    this.listeners = { print: [], error: [], status: [], line: [] };
    this.status = 'idle';          // idle | running | paused | finished | stopped | error
    this.interp = null; this.sched = null;
    this.paused = false;
    this.line = 0;
    this.speed = 1;
    this.t0 = 0;
    this.watchLines = false;
    board.runtime = this;
    board.on('step', function () { self.update(); });
    this.contract.on(function (e) { self.deliver(e); });
  }
  Runtime.explain = explain;
  var R = Runtime.prototype;

  R.on = function (name, fn) {
    this.listeners[name].push(fn);
    if (name === 'line') this.watchLines = true;
    var l = this.listeners[name];
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };
  R.emit = function (name, a, b) { this.listeners[name].slice().forEach(function (fn) { try { fn(a, b); } catch (e) { if (G.console) G.console.error(e); } }); };
  R.setStatus = function (s) { if (this.status !== s) { this.status = s; this.emit('status', s); } };
  R.running = function () { return this.status === 'running' || this.status === 'paused'; };
  R.now = function () { return this.board.time; };

  /* ---------------------------------------------------------------- the qbit module */
  R.buildModule = function () {
    var self = this, C = this.contract;
    var attrs = {};

    function ModuleProxy(n, key) { this.n = n; this.key = key; this.spec = SPEC.modules[key]; this.cache = {}; }
    ModuleProxy.prototype.$type = 'module';
    ModuleProxy.prototype.$str = function () { return T('<%1 на порту %2>', this.key, this.n); };
    ModuleProxy.prototype.$get = function (name) {
      var self2 = this, spec = this.spec;
      if (name === 'port') return this.n;
      if (name === 'when') return function (event, fn) { return self.register(self2.n, self2.key, spec.events, event, fn, self2.spec.title); };
      for (var i = 0; i < spec.values.length; i++) if (spec.values[i].py === name) return C.get(this.n, this.key, spec.values[i].n);
      for (var j = 0; j < spec.commands.length; j++) if (spec.commands[j].n === name) {
        return this.cache[name] || (this.cache[name] = function () { C.command(self2.n, self2.key, name, Array.prototype.slice.call(arguments)); return null; });
      }
      var known = spec.values.map(function (v) { return v.py; }).concat(spec.commands.map(function (c) { return c.n + '()'; })).concat(['when()']);
      throw new Py.PyError('AttributeError', T('у модуля «%1» нет «%2». Есть: %3', spec.title, name, known.join(', ')));
    };
    ModuleProxy.prototype.$set = function (name) { throw new Py.PyError('AttributeError', T('значение «%1» только для чтения', name)); };

    var proxies = {};
    SPEC.keys.forEach(function (key) {
      attrs[key] = function (n) {
        if (typeof n !== 'number') throw new Py.PyError('TypeError', T('qbit.%1(порт): номер порта должен быть числом от 1 до 8', key));
        var id = key + n;
        return proxies[id] || (proxies[id] = new ModuleProxy(n, key));
      };
    });

    function PortProxy(n) { this.n = n; }
    PortProxy.prototype.$type = 'port';
    PortProxy.prototype.$get = function (name) {
      var n = this.n;
      var info = function () { return C.info(n); };
      if (name === 'module') return info().key;
      if (name === 'state') return info().state;
      if (name === 'text') return info().text;
      if (name === 'value') return function (v) { var i = info(); if (!i.key) throw new Py.PyError('QbitError', T('на порту %1 нет модуля', n)); return C.get(n, i.key, v); };
      if (name === 'cmd') return function () { var i = info(); if (!i.key) throw new Py.PyError('QbitError', T('на порту %1 нет модуля', n)); var w = Array.prototype.slice.call(arguments); C.command(n, i.key, String(w[0]), w.slice(1)); return null; };
      throw new Py.PyError('AttributeError', T('у порта нет «%1»', name));
    };
    attrs.port = function (n) { if (!(n >= 1 && n <= 8)) throw new Py.PyError('ValueError', T('порты считаются с 1 до 8')); return new PortProxy(n); };
    attrs.find = function (key, nth) { return C.find(String(key), nth || 0); };

    var board = {
      $type: 'board',
      $get: function (name) {
        if (name === 'when') return function (event, fn) { return self.register(0, 'board', SPEC.board.events, event, fn, T('плата')); };
        if (name === 'led') return function (color) { self.statusLed(color); return null; };
        if (name === 'led_off') return function () { self.statusLed(null); return null; };
        return C.boardValue(name);
      }
    };
    attrs.board = board;

    // time and flow
    attrs.wait = function (s) { s = Number(s); if (!(s >= 0)) throw new Py.PyError('ValueError', T('время ожидания должно быть числом, не меньше нуля')); return new Py.Sleep(s); };
    attrs.wait_ms = function (ms) { return new Py.Sleep(Number(ms) / 1000); };
    attrs.tick = function () { return Py.TICK; };
    attrs.start = function () {
      var args = Array.prototype.slice.call(arguments), f = args.shift();
      var co = self.interp.callValue(f, args, null);
      if (co instanceof Py.PyCoroutine) self.sched.spawn(co, f.name || 'task');
      return null;
    };
    attrs.on_message = function (name, fn) {
      if (typeof fn !== 'function' && !(fn instanceof Py.PyFunction)) throw new Py.PyError('TypeError', T('on_message(название, функция)'));
      self.handlers.push({ port: -1, key: 'msg', ev: { n: String(name), kind: 'message' }, fn: fn, task: null });
      return null;
    };
    attrs.send = function (name) {
      self.handlers.slice().forEach(function (h) { if (h.key === 'msg' && h.ev.n === String(name)) self.startHandler(h, undefined); });
      return null;
    };
    attrs.run = function () { return null; };           // on the board this starts the event loop; here the simulator always runs it
    attrs.stop = function () { self.stopRequested = true; return null; };
    attrs.millis = function () { return Math.floor((self.now() - self.t0) * 1000); };
    attrs.seconds = function () { return Math.round((self.now() - self.t0) * 1000) / 1000; };
    attrs.constrain = function (x, a, b) { return Math.min(Math.max(x, a), b); };
    attrs.map = function (x, a, b, c, d) { if (a === b) throw new Py.PyError('ZeroDivisionError', T('qbit.map: входной диапазон пуст')); return c + (x - a) * (d - c) / (b - a); };
    attrs.log = function () { self.emit('print', Array.prototype.map.call(arguments, Py.str).join(' ') + '\n'); return null; };
    attrs.version = '0.1';
    return new Py.PyModule('qbit', attrs);
  };

  R.statusLed = function (color) {
    var b = this.board;
    if (color === null) { b.statusOverride = null; return; }
    var names = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], white: [255, 255, 255], yellow: [255, 176, 0], orange: [255, 64, 0], purple: [128, 0, 255], pink: [255, 32, 96], cyan: [0, 255, 255], magenta: [255, 0, 255], off: [0, 0, 0] };
    var c = typeof color === 'string' ? (names[color.toLowerCase()] || (/^#[0-9a-f]{6}$/i.test(color) ? [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)] : null)) : null;
    if (!c) throw new Py.PyError('ValueError', T('неизвестный цвет индикатора: %1', color));
    b.statusOverride = { r: c[0], g: c[1], b: c[2] };
  };

  /* ---------------------------------------------------------------- events */
  R.register = function (port, key, events, name, fn, title) {
    var ev = null;
    for (var i = 0; i < events.length; i++) if (events[i].n === name) ev = events[i];
    if (!ev) {
      var known = events.map(function (e) { return "'" + e.n + "'"; }).join(', ') || T('нет событий');
      throw new Py.PyError('QbitError', T('у «%1» нет события «%2». Есть: %3', title, name, known));
    }
    if (typeof fn !== 'function' && !(fn instanceof Py.PyFunction)) throw new Py.PyError('TypeError', T('второй аргумент on() — функция'));
    this.handlers.push({ port: port, key: key, ev: ev, fn: fn, task: null });
    return null;
  };
  R.deliver = function (e) {
    if (!this.running() || this.paused || !this.handlers.length) return;
    for (var i = 0; i < this.handlers.length; i++) {
      var h = this.handlers[i], ev = h.ev;
      if (h.port !== e.port || ev.kind !== e.kind) continue;
      if (ev.value !== undefined && ev.value !== e.value) continue;
      if (ev.text !== undefined && ev.text !== e.text) continue;
      if (h.key !== 'board') {
        var p = this.board.port(h.port);
        if (!p || !p.module || p.module.key !== h.key) continue;
      }
      this.startHandler(h, ev.arg === 'text' ? e.text : ev.arg === 'value' ? e.value : undefined);
    }
  };
  R.startHandler = function (h, arg) {
    if (h.task && !h.task.done) return;                    // still running: skip this one
    var interp = this.interp, f = h.fn, args = arg === undefined ? [] : [arg];
    if (f instanceof Py.PyFunction && f.def.params.length === 0) args = [];
    try {
      var co = interp.callValue(f, args, null);
      if (co instanceof Py.PyCoroutine) h.task = this.sched.spawn(co, 'on ' + h.key);
    } catch (e) { this.fail(e); }
  };

  /* ---------------------------------------------------------------- running */
  R.run = function (source) {
    var self = this, ast = Py.compile(source);             // a SyntaxError leaves the board untouched: nothing below runs
    this.stop(true);
    this.stopRequested = false;
    this.handlers = [];
    this.contract.reset();
    this.interp = new Py.Interp({
      print: function (s, end) { self.emit('print', s + end); },
      onLine: function (line) { self.line = line; if (self.watchLines) self.emit('line', line); }
    });
    this.interp.modules.qbit = this.buildModule();
    this.sched = new Py.Scheduler(this.interp, { onError: function (e) { self.fail(e); } });
    this.t0 = this.now();
    this.paused = false;
    this.sched.spawn(this.interp.module(ast), 'main');
    this.setStatus('running');
    this.update();
  };
  R.fail = function (e) {
    var out;
    if (e instanceof Py.PyError) out = { type: e.type, message: explain(e), line: e.line || this.line, raw: e.msg };
    else out = { type: 'InternalError', message: String(e && e.message || e), line: this.line, raw: String(e && e.stack || e) };
    this.safeState();
    if (this.sched) this.sched.clear();
    this.handlers = [];
    this.setStatus('error');
    this.emit('error', out);
  };
  R.update = function () {
    if (this.status !== 'running' || this.paused) return;
    try { this.sched.step(this.now()); } catch (e) { this.fail(e); return; }
    if (this.stopRequested) { this.stop(); return; }
    if (this.status === 'running' && this.sched.idle() && !this.handlers.length) this.setStatus('finished');
  };
  R.pause = function () { if (this.status === 'running') { this.paused = true; this.setStatus('paused'); } };
  R.resume = function () { if (this.status === 'paused') { this.paused = false; this.status = 'running'; this.emit('status', 'running'); } };
  /** Stop button: every task ends and the outputs go to a safe state (LED off, motor stopped ...) */
  R.stop = function (silent) {
    var was = this.running();
    if (this.sched) this.sched.clear();
    this.handlers = [];
    this.stopRequested = false;
    if (was) { this.safeState(); }
    if (!silent) { if (was || this.status === 'finished') this.setStatus('stopped'); }
    else if (was) this.status = 'stopped';
  };
  R.safeState = function () {
    var C = this.contract;
    try { C.sync(); } catch (e) { /* ignore */ }
    var offs = { led: 'off', rgb: 'off', buzzer: 'off', motor: 'stop', relay: 'off' };
    for (var n = 1; n <= 8; n++) {
      var p = this.board.port(n), m = p.module;
      if (m && offs[m.key] && C.drv[n - 1]) { try { C.drv[n - 1].cmd([offs[m.key]]); } catch (e) { /* ignore */ } }
    }
    this.board.statusOverride = null;
  };
  /** the firmware resets everything on RESET / power loss, and so does the program */
  R.onReset = function () {
    if (this.sched) this.sched.clear();
    this.handlers = [];
    this.contract.reset();
    if (this.running()) this.setStatus('stopped');
  };

  Q.Runtime = Runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this);
