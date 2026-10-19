/* The panes around the editor: the Python view, and the bottom tabs Console / Devices / Data. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h;

  /* ================================================================================================ Python view */
  var PY_KW = /^(and|as|async|await|break|continue|def|elif|else|for|from|global|if|import|in|is|lambda|not|or|pass|return|while|True|False|None)$/;
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function highlight(line) {
    var out = '', re = /(#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_Ѐ-ӿ][A-Za-z0-9_Ѐ-ӿ]*)|(\s+|.)/g, m;
    while ((m = re.exec(line)) && m[0] !== '') {
      if (m[1]) out += '<i class="c">' + esc(m[1]) + '</i>';
      else if (m[2]) out += '<i class="s">' + esc(m[2]) + '</i>';
      else if (m[3]) out += '<i class="n">' + m[3] + '</i>';
      else if (m[4]) out += PY_KW.test(m[4]) ? '<i class="k">' + m[4] + '</i>' : m[4] === 'qbit' ? '<i class="q">qbit</i>' : esc(m[4]);
      else out += esc(m[5]);
    }
    return out;
  }

  function CodeView(el) {
    this.el = el; this.lines = []; this.hot = {};
    this.pre = h('div', { cls: 'code-lines', role: 'region', 'aria-label': T('Код на Python'), tabindex: 0 });
    this.copy = h('button', { cls: 'code-copy', type: 'button', title: T('Копировать код'), 'aria-label': T('Копировать код') }, Q.icon('copy'));
    this.copy.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(this._code || '').catch(function () {}); }.bind(this));
    el.textContent = '';
    el.appendChild(this.copy); el.appendChild(this.pre);
  }
  CodeView.prototype.render = function (code) {
    this._code = code;
    var lines = code.replace(/\n+$/, '').split('\n');
    if (lines.join('\n') === (this.lines || []).join('\n') && this.rendered) return;
    this.lines = lines; this.rendered = true;
    this.pre.textContent = '';
    var frag = document.createDocumentFragment();
    lines.forEach(function (l, i) {
      var row = h('div', { cls: 'cl', 'data-n': i + 1 });
      row.appendChild(h('span', { cls: 'ln', text: i + 1 }));
      row.appendChild(h('span', { cls: 'lt', html: highlight(l) || '&nbsp;' }));
      frag.appendChild(row);
    });
    this.pre.appendChild(frag);
    this.hot = {};
  };
  /** show which lines run right now (line numbers of the Python text) */
  CodeView.prototype.flash = function (line) {
    var row = this.pre.children[line - 1];
    if (!row) return;
    row.classList.add('hot');
    var self = this;
    this.hot[line] = performance.now() + 220;
    if (!this._t) this._t = setTimeout(function () { self._t = 0; self.fade(); }, 120);
  };
  CodeView.prototype.fade = function () {
    var now = performance.now(), any = false, self = this;
    Object.keys(this.hot).forEach(function (l) {
      if (self.hot[l] <= now) { delete self.hot[l]; var r = self.pre.children[l - 1]; if (r) r.classList.remove('hot'); } else any = true;
    });
    if (any && !this._t) this._t = setTimeout(function () { self._t = 0; self.fade(); }, 120);
  };
  CodeView.prototype.reveal = function (line) { var r = this.pre.children[line - 1]; if (r && r.scrollIntoView) r.scrollIntoView({ block: 'center' }); };

  /* ================================================================================================ Console */
  function ConsolePane(el, ide) {
    this.el = el; this.ide = ide;
    this.cur = null; this.count = 0;
    var self = this;
    this.log = h('div', { cls: 'clog', role: 'log', 'aria-live': 'off' });
    this.clearBtn = h('button', { cls: 'cbtn', type: 'button', title: T('Очистить'), 'aria-label': T('Очистить') }, Q.icon('trash'));
    this.clearBtn.addEventListener('click', function () { self.clear(); });
    this.copyBtn = h('button', { cls: 'cbtn', type: 'button', title: T('Копировать'), 'aria-label': T('Копировать') }, Q.icon('copy'));
    this.copyBtn.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(self.log.innerText).catch(function () {}); });
    this.tools = h('div', { cls: 'cbar' }, this.copyBtn, this.clearBtn);
    el.textContent = '';
    el.appendChild(this.log); el.appendChild(this.tools);
  }
  ConsolePane.prototype.clear = function () { this.log.textContent = ''; this.cur = null; this.count = 0; this.ide.consoleCleared(); };
  ConsolePane.prototype.scrollDown = function () { this.log.scrollTop = this.log.scrollHeight; };
  ConsolePane.prototype.line = function (kind, text, opts) {
    var atEnd = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 24;
    var row = h('div', { cls: 'cl2 ' + kind });
    if (opts && opts.icon) row.appendChild(Q.icon(opts.icon));
    row.appendChild(h('span', { cls: 'tx', text: text }));
    if (opts && opts.onClick) { row.classList.add('link'); row.addEventListener('click', opts.onClick); row.title = opts.title || T('Показать блок'); }
    this.log.appendChild(row);
    this.cur = null;
    while (this.log.childNodes.length > 400) this.log.removeChild(this.log.firstChild);
    if (atEnd) this.scrollDown();
    this.count++;
    return row;
  };
  /** program output arrives in pieces ("print" adds the newline itself) */
  ConsolePane.prototype.print = function (text) {
    var parts = String(text).split('\n');
    for (var i = 0; i < parts.length; i++) {
      var last = i === parts.length - 1;
      if (last && parts[i] === '') break;
      if (!this.cur) { this.line('out', ''); this.cur = this.log.lastChild; }
      this.cur.querySelector('.tx').textContent += parts[i];
      if (!last) this.cur = null;
    }
    if (this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 60) this.scrollDown();
  };
  /** the board's own log (found modules, overloads) is not shown in the console: it is noise for the programmer */
  ConsolePane.prototype.boardLog = function () {};

  /* ================================================================================================ Data */
  function Spark(canvas) { this.c = canvas; this.v = []; }
  Spark.prototype.push = function (x) { this.v.push(x); if (this.v.length > 60) this.v.shift(); };
  Spark.prototype.draw = function (color) {
    var c = this.c, dpr = window.devicePixelRatio || 1, w = c.clientWidth, hgt = c.clientHeight;
    if (!w) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    var v = this.v;
    if (v.length < 2) return;
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    g.strokeStyle = color || '#0c78d4'; g.lineWidth = 1.5; g.lineJoin = 'round'; g.beginPath();
    v.forEach(function (x, i) { var px = i / 59 * (w - 2) + 1, py = hgt - 2 - (x - lo) / (hi - lo) * (hgt - 4); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
    g.stroke();
  };

  function DataPane(el, ide) {
    this.el = el; this.ide = ide; this.cards = {}; this.acc = 0;
    this.empty = h('div', { cls: 'empty', text: T('Поставьте модуль на плату: здесь появятся его значения в реальном времени.') });
    this.grid = h('div', { cls: 'data-grid' });
    el.textContent = '';
    el.appendChild(this.empty); el.appendChild(this.grid);
  }
  DataPane.prototype.frame = function (dt) {
    if (this.el.hidden) return;
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    var dev = this.ide.device(), self = this, seen = {};
    if (!dev) return;
    dev.ports().forEach(function (p) {
      if (!p.key || !Q.SPEC.modules[p.key] || !Q.SPEC.modules[p.key].values.length) return;
      var info = dev.info(p.n);
      var id = p.n + ':' + p.key; seen[id] = true;
      var card = self.cards[id];
      if (!card) card = self.cards[id] = self.card(p, info);
      self.fill(card, info, p);
    });
    Object.keys(this.cards).forEach(function (id) { if (!seen[id]) { self.cards[id].el.remove(); delete self.cards[id]; } });
    this.empty.hidden = Object.keys(this.cards).length > 0;
  };
  DataPane.prototype.card = function (p, info) {
    var spec = Q.SPEC.modules[p.key], rows = {}, el = h('div', { cls: 'dcard' });
    el.appendChild(h('div', { cls: 'dhead' }, h('b', { text: spec.title }), h('span', { cls: 'tag', text: T('порт %1', p.n) })));
    spec.values.forEach(function (v) {
      var val = h('span', { cls: 'dv' }), unit = h('small', { text: v.unit ? ' ' + v.unit : '' }), cv = h('canvas', { cls: 'spark' });
      el.appendChild(h('div', { cls: 'drow', title: T('%1  ·  в Python: %2', v.label, v.py) }, h('span', { cls: 'dl', text: v.label }), h('span', { cls: 'dval' }, val, unit), v.t === 'text' ? null : cv));
      rows[v.n] = { val: val, spark: v.t === 'text' ? null : new Spark(cv), t: v.t };
    });
    this.grid.appendChild(el);
    return { el: el, rows: rows };
  };
  DataPane.prototype.fill = function (card, info, p) {
    var vals = info.values || {};
    Object.keys(card.rows).forEach(function (n) {
      var r = card.rows[n], v = vals[n];
      if (v === undefined) { r.val.textContent = '—'; return; }
      r.val.textContent = typeof v === 'boolean' ? (v ? T('да') : T('нет')) : typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v) : +v.toFixed(2)) : (v === '' ? '—' : v);
      if (r.spark) { r.spark.push(typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0); r.spark.draw(); }
    });
  };

  /* ================================================================================================ Devices */
  function DevicesPane(el, ide) {
    this.el = el; this.ide = ide;
    var self = this;
    ide.hub.on('list', function () { self.render(); });
    ide.hub.on('select', function () { self.render(); });
    this.render();
  }
  DevicesPane.prototype.render = function () {
    var self = this, hub = this.ide.hub;
    this.el.textContent = '';
    hub.devices.forEach(function (d) {
      var active = hub.active === d;
      var row = h('div', { cls: 'dev' + (active ? ' active' : '') });
      row.appendChild(h('i', { cls: 'dot ' + (d.connected ? 'ok' : '') }));
      row.appendChild(h('div', { cls: 'dev-info' }, h('b', { text: d.name }), h('small', { text: d.describe ? d.describe() : (d.kind === 'sim' ? T('в браузере') : '') })));
      var use = h('button', { cls: 'btn small' + (active ? ' primary' : ''), type: 'button', text: active ? T('Запускается здесь') : T('Выбрать') });
      use.addEventListener('click', function () { hub.select(d); });
      row.appendChild(use);
      if (d.kind !== 'sim') {
        var off = h('button', { cls: 'btn small', type: 'button', text: T('Отключить') });
        off.addEventListener('click', function () { d.disconnect(); });
        row.appendChild(off);
      }
      self.el.appendChild(row);
    });
    if (this.ide.link) this.el.appendChild(this.ide.link.connectUi());
  };

  Q.CodeView = CodeView; Q.ConsolePane = ConsolePane; Q.DataPane = DataPane; Q.DevicesPane = DevicesPane; Q.highlightPython = highlight;
})(typeof globalThis !== 'undefined' ? globalThis : this);
