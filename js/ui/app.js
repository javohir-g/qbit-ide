/* Puts the simulator together: the board, its picture, the module box, the inspector, sound, saving, the main loop. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h, S = Q.S, U = Q.util;

  var STORE = 'qbit-sim-v1';
  var STEP = 0.02;
  var STARTER = [[1, 'button'], [2, 'pot'], [3, 'led', 'red'], [4, 'rgb'], [5, 'oled'], [7, 'servo'], [8, 'buzzer']];
  /** the kits the catalogue ships (modules/catalog.py STAGE_NAMES), lowest first: one since 2026-10-24 */
  function kitNames() {
    var k = (Q.DATA && Q.DATA.kits) || {};
    return Object.keys(k).sort(function (a, b) { return a - b; }).map(function (n) { return k[n]; });
  }
  Q.kitNames = kitNames;

  /** opts.ide: the block IDE embeds the simulator (no demo, no global keyboard shortcuts, its own console and header) */
  function App(opts) {
    this.opts = opts || {};
    this.store = this.opts.store || STORE;
    this.frameHooks = [];
    this.saved = this.load();
    this.kit = Math.max(1, Math.min(this.saved.kit || 99, kitNames().length));     // a saved kit 4 from the four-kit days -> the full one
    this.lastUsb = 'usb-pd';
    this.dirty = false;
    this.toasts = {};
  }

  /* ---------------------------------------------------------------- storage */
  App.prototype.load = function () {
    try { var s = JSON.parse(G.localStorage.getItem(this.store) || 'null'); if (s && s.v === 1) return s; } catch (e) { /* private mode, bad JSON */ }
    return {};
  };
  App.prototype.save = function () {
    this.dirty = false;
    try {
      G.localStorage.setItem(this.store, JSON.stringify({ v: 1, board: this.board.serialize(), kit: this.kit, limited: this.tray.limited, sound: this.sound.enabled, demo: this.demo.on, tab: this.inspector.tab }));
    } catch (e) { /* storage full or blocked: the simulator works without it */ }
  };
  App.prototype.touch = function () { this.dirty = true; };

  /* ---------------------------------------------------------------- start */
  App.prototype.start = function () {
    var self = this, sv = this.saved;
    var $ = function (id) { return document.getElementById(id); };
    Q.installDefs($('svg-defs'));
    Q.i18n.dom();                                       // the static text of the page, in the chosen language

    this.board = new Q.Board({ source: (sv.board && Q.SOURCES[sv.board.source]) ? sv.board.source : 'usb-pd' });
    if (sv.board && sv.board.source && Q.SOURCES[sv.board.source] && sv.board.source !== 'battery') this.lastUsb = sv.board.source;
    this.sound = new Q.Sound();
    this.sound.enabled = sv.sound !== false;
    this.demo = new Q.Demo(this.board);

    this.bv = new Q.BoardView($('board-svg'), this.board, {
      dragSvg: $('drag-svg'), dragRoot: $('drag-root'),
      onSelect: function (n) { self.inspector.select(n); },
      onSound: function (n) { self.sound.play(n); },
      onToast: function (t, k, key) { self.toast(t, k, key); },
      onUsbClick: function () { self.toggleUsb(); }
    });
    this.tray = new Q.Tray($('tray'), this.board, {
      kit: this.kit, limited: !!sv.limited, bv: this.bv, compact: !!this.opts.ide,
      onQuickAdd: function (key, variant) { self.quickAdd(key, variant); },
      onDragStart: function () { self.closeDrawers(); }
    });
    this.tray.onLimit = function () { self.touch(); };
    this.inspector = new Q.Inspector($('side'), this.board, this);
    if (sv.tab) this.inspector.tab = sv.tab;
    this.inspector.setTab(this.inspector.tab, true);
    this.hud = $('hud') ? new Q.Hud($('hud'), this.board) : null;
    this.console = $('console') ? new Q.Console($('console'), this.board) : null;

    // what is on the board: the saved scene, or the starter set on the very first run
    var firstRun = !sv.board;
    if (sv.board) this.board.restore(sv.board);
    else STARTER.forEach(function (s) { self.board.attach(s[0], s[1], { variant: s[2] }); });
    this.bv.syncFromBoard();
    this.demo.on = this.opts.ide ? false : firstRun ? true : !!sv.demo;
    if (firstRun && !this.opts.ide) this.board.log('info', T('Демо включено: выходы повторяют входы (пока нет блочных программ)'));

    this.header();
    this.wire();
    if (!this.opts.ide) this.hint(firstRun ? T('Нажмите кнопку на плате или покрутите ручку · перетащите модуль из списка на любой порт') : T('Перетащите модуль из списка на порт — он примагнитится'));
    this.tray.refresh();

    this.fresh = {};   // ports where a module was just put on: only those chime when the module is recognised (not after a reload)
    this.board.on('attach', function (p) { if (p) self.fresh[p.n] = true; self.tray.refresh(); self.touch(); self.hint(null); });
    this.board.on('detach', function () { self.tray.refresh(); self.touch(); });
    this.board.on('fx', function (e) { if (e.type === 'relay-click') self.sound.play('relay'); else if (e.type === 'ir-send') self.sound.play('ir'); });
    this.board.on('fault', function (p) { self.sound.play('error'); self.toast('P' + p.n + ': ' + p.reason, 'err', 'f' + p.n); });
    this.board.on('brownout', function () { self.sound.play('error'); self.toast(T('Просадка питания: плата перезагрузилась. Подключите источник мощнее.'), 'err', 'brown'); });
    this.board.on('ready', function (p, m) { if (self.fresh[p.n]) { self.fresh[p.n] = false; self.sound.play('ok'); } });
    this.board.on('unknown', function (p, m, why) { self.sound.play('error'); self.toast(T('P%1: неизвестный модуль — %2', p.n, why), 'warn', 'u' + p.n); });
    this.board.on('budget', function (p) { self.toast('P' + p.n + ': ' + p.reason, 'warn', 'b' + p.n); });
    this.board.on('power', function () { self.syncHeader(); });

    this.syncHeader();
    this.loop();
    G.QBIT.app = this;
    return this;
  };

  /* ---------------------------------------------------------------- header */
  App.prototype.header = function () {
    var self = this, $ = function (id) { return document.getElementById(id); };
    var seg = $('kit-seg');
    if (seg && kitNames().length < 2) seg.hidden = true;           // one kit: nothing to choose
    else if (seg) kitNames().forEach(function (n, i) {
      var b = h('button', { type: 'button', text: n, title: T('Модули комплектов 1…%1', (i + 1)) });
      b.addEventListener('click', function () { self.setKit(i + 1); });
      seg.appendChild(b);
    });
    var sel = $('sel-source');
    if (sel) {
      Object.keys(Q.SOURCES).forEach(function (id) { sel.appendChild(h('option', { value: id, text: Q.SOURCES[id].label })); });
      sel.addEventListener('change', function () { self.board.setSource(sel.value); if (Q.SOURCES[sel.value].usb) self.lastUsb = sel.value; self.touch(); self.syncHeader(); });
    }
    var on = function (id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); };
    on('btn-sound', function () { self.sound.setEnabled(!self.sound.enabled); if (self.sound.enabled) self.sound.play('ok'); self.syncHeader(); self.touch(); });
    on('btn-demo', function () { self.demo.set(!self.demo.on); self.syncHeader(); self.touch(); });
    on('btn-menu', function (e) { e.stopPropagation(); self.toggleMenu(); });
    on('btn-tray', function () { self.drawer('tray'); });
    on('btn-side', function () { self.drawer('side'); });
    on('scrim', function () { self.closeDrawers(); });
    document.addEventListener('click', function (e) { if (!e.target.closest('#menu') && !e.target.closest('#btn-menu')) self.closeMenu(); });
  };

  App.prototype.setKit = function (k) {
    this.kit = k; this.tray.setKit(k); this.tray.refresh(); this.syncHeader(); this.touch();
    if (this.onKit) this.onKit(k);
  };

  App.prototype.syncHeader = function () {
    var $ = function (id) { return document.getElementById(id); }, self = this;
    if ($('kit-seg')) Array.prototype.forEach.call($('kit-seg').children, function (b, i) { b.setAttribute('aria-pressed', String(i + 1 === self.kit)); });
    if ($('sel-source')) $('sel-source').value = this.board.sourceId;
    var sb = $('btn-sound');
    if (sb) {
      if (!sb.hasAttribute('data-keep')) { sb.textContent = ''; sb.appendChild(Q.icon(this.sound.enabled ? 'sound-on' : 'sound-off')); }
      sb.setAttribute('aria-pressed', String(this.sound.enabled));
    }
    var db = $('btn-demo'); if (db) db.setAttribute('aria-pressed', String(this.demo.on));
    if (this.onHeader) this.onHeader();
  };

  App.prototype.drawer = function (which) {
    var el = document.getElementById(which), other = document.getElementById(which === 'tray' ? 'side' : 'tray');
    var open = !el.classList.contains('open');
    other.classList.remove('open');
    el.classList.toggle('open', open);
    document.getElementById('scrim').hidden = !open;
  };
  App.prototype.closeDrawers = function () {
    var t = document.getElementById('tray'), s = document.getElementById('side'), c = document.getElementById('scrim');
    if (t) t.classList.remove('open');
    if (s) s.classList.remove('open');
    if (c) c.hidden = true;
  };

  App.prototype.toggleMenu = function () {
    var self = this, m = document.getElementById('menu');
    if (!m) return;
    if (!m.hidden) return this.closeMenu();
    m.textContent = '';
    var item = function (ic, t, fn) { var b = h('button', { type: 'button' }, Q.icon(ic), h('span', { text: t })); b.addEventListener('click', function () { self.closeMenu(); fn(); }); m.appendChild(b); };
    item('save', T('Сохранить сцену в файл'), function () { self.exportScene(); });
    item('folder', T('Открыть сцену из файла'), function () { self.importScene(); });
    m.appendChild(h('hr'));
    item('board', T('Выложить стартовый набор'), function () { self.starter(); });
    item('trash', T('Снять все модули'), function () { self.clearBoard(); });
    item('refresh', T('Сбросить симулятор'), function () { try { G.localStorage.removeItem(STORE); } catch (e) { /* ignore */ } G.location.reload(); });
    m.hidden = false;
  };
  App.prototype.closeMenu = function () { var m = document.getElementById('menu'); if (m) m.hidden = true; };

  /* ---------------------------------------------------------------- actions */
  App.prototype.select = function (n) { this.bv.select(n); };
  App.prototype.toggleUsb = function () {
    var b = this.board;
    if (b.sourceId === 'battery') b.setSource(this.lastUsb || 'usb-pd');
    else { this.lastUsb = b.sourceId; b.setSource('battery'); }
    this.syncHeader(); this.touch();
  };

  App.prototype.quickAdd = function (key, variant) {
    var def = Q.moduleDef(key), b = this.board;
    for (var n = 1; n <= 8; n++) {
      if (b.canPlace(n, def).ok) {
        if (this.tray.limited && !def.debug && this.tray.left(key) <= 0) { this.toast(T('Этот модуль в наборе закончился'), 'warn', 'stock'); return; }
        b.attach(n, key, { variant: variant });
        this.bv.select(n);
        return;
      }
    }
    this.toast(T('Нет свободного места на плате'), 'warn', 'full');
  };

  App.prototype.removeFrom = function (n) {
    var p = this.board.port(n), m = p && (p.module || p.covered);
    if (!m) return;
    this.board.detach(n);
    this.sound.play('detach');
    this.inspector.select(n);
  };

  App.prototype.clearBoard = function () { this.board.clear(); this.sound.play('detach'); };

  App.prototype.starter = function () {
    var self = this;
    this.board.clear();
    STARTER.forEach(function (s, i) { setTimeout(function () { try { self.board.attach(s[0], s[1], { variant: s[2] }); } catch (e) { /* ignore */ } }, i * 130); });
  };

  App.prototype.exportScene = function () {
    var data = JSON.stringify(Object.assign({ app: 'qbit-sim', demo: this.demo.on }, this.board.serialize()), null, 1);
    var a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'qbit-scene.json' });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  App.prototype.importScene = function () {
    var self = this, inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var j = JSON.parse(r.result);
          self.board.restore(j);
          self.bv.syncFromBoard();
          self.tray.refresh(); self.syncHeader(); self.touch();
          self.toast(T('Сцена открыта: %1', f.name), 'ok', 'imp');
        } catch (e) { self.toast(T('Не удалось открыть файл: %1', e.message), 'err', 'imp'); }
      };
      r.readAsText(f);
    });
    inp.click();
  };

  /* ---------------------------------------------------------------- small UI */
  App.prototype.toast = function (text, kind, key) {
    var now = performance.now();
    if (key && this.toasts[key] && now - this.toasts[key] < 2500) return;
    if (key) this.toasts[key] = now;
    var t = h('div', { cls: 'toast ' + (kind || ''), text: text });
    var box = document.getElementById('toasts');
    box.appendChild(t);
    while (box.childNodes.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(function () { t.remove(); }, 320); }, 3600);
  };

  App.prototype.hint = function (text) {
    var el = document.getElementById('hint');
    if (!el) return;
    if (text) { el.textContent = text; el.classList.remove('hide'); this._hintT = performance.now(); }
    else if (this._hintT && performance.now() - this._hintT > 800) { var self = this; clearTimeout(this._hintHide); this._hintHide = setTimeout(function () { el.classList.add('hide'); }, 6000); }
  };

  /* ---------------------------------------------------------------- events */
  App.prototype.wire = function () {
    var self = this;
    G.addEventListener('pointermove', function (e) { self.bv.pointerMove(e); });
    G.addEventListener('pointerup', function (e) { self.bv.pointerUp(e); });
    G.addEventListener('pointercancel', function (e) { self.bv.pointerUp(e); });
    G.addEventListener('pointerdown', function () { self.sound.ensure(); }, true);
    G.addEventListener('keydown', function (e) {
      if (self.opts.ide) return;                       // in the IDE the keys belong to the block editor
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') { self.closeMenu(); self.closeDrawers(); self.bv.select(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && self.bv.sel) { e.preventDefault(); self.removeFrom(self.bv.sel); }
      else if (e.key >= '1' && e.key <= '8' && !e.ctrlKey && !e.metaKey && !e.altKey) self.bv.select(+e.key);
    });
    G.addEventListener('beforeunload', function () { self.save(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { self.sound.stopAll(); self.save(); } });
    setInterval(function () { if (self.dirty) self.save(); }, 2000);
  };

  /* ---------------------------------------------------------------- main loop */
  App.prototype.loop = function () {
    var self = this, last = performance.now(), acc = 0, ui = 0;
    function frame(now) {
      var dt = Math.max(0, Math.min(0.1, (now - last) / 1000));      // the first frame can be stamped before the slow start-up ended
      last = now;
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 6) { self.board.step(STEP); acc -= STEP; n++; }
      if (n === 6) acc = 0;
      self.bv.update(dt);
      if (self.hud) self.hud.frame();
      self.sound.sync(self.board);
      if (self.console) self.console.flush();
      for (var fh = 0; fh < self.frameHooks.length; fh++) self.frameHooks[fh](dt, now);
      ui += dt;
      if (ui >= 0.1) {
        ui = 0;
        self.inspector.update();
        if (self.hud) self.hud.update();
        if (self.board.modules().some(function (m) { return m.dirty; })) self.touch();
      }
      G.requestAnimationFrame(frame);
    }
    G.requestAnimationFrame(frame);
  };

  Q.App = App;
  function boot() { new App().start(); }
  if (!G.QBIT_NO_AUTOBOOT) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
