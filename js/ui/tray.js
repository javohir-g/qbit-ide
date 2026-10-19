/* The module box on the left: every module type as a card, grouped by kit. Drag a card onto the board (or double-click it). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h;

  var LED_DOT = { white: '#f3efe3', red: '#ff3b30', yellow: '#ffc800', green: '#2fe06b', blue: '#3b82ff' };

  function Tray(el, board, opts) {
    this.el = el; this.board = board;
    this.kit = opts.kit || 4;
    this.query = '';
    this.compact = !!opts.compact;     // the IDE: just the cards (no stock limit, no counters, no debug modules, no tags)
    this.limited = !this.compact && !!opts.limited;
    this.variant = {};               // chosen variant per module key (LED colour)
    this.bv = opts.bv;
    this.onQuickAdd = opts.onQuickAdd || function () {};
    this.onDragStart = opts.onDragStart || function () {};
    this.cards = [];
    this.build();
  }

  Tray.prototype.build = function () {
    var self = this;
    this.el.textContent = '';
    this.count = h('small', { text: '' });
    this.search = h('input', { type: 'search', placeholder: T('Найти модуль…'), 'aria-label': T('Поиск модуля'), autocomplete: 'off' });
    this.search.addEventListener('input', function () { self.query = self.search.value.trim().toLowerCase(); self.render(); });
    this.limitBox = h('input', { type: 'checkbox' });
    this.limitBox.checked = this.limited;
    this.limitBox.addEventListener('change', function () { self.limited = self.limitBox.checked; self.render(); self.onLimit && self.onLimit(self.limited); });
    this.list = h('div', { cls: 'tray-list' });
    this.el.appendChild(h('div', { cls: 'tray-head' },
      this.compact ? null : h('div', { cls: 'tray-title' }, h('h2', { text: T('Модули') }), this.count),
      h('div', { cls: 'search' }, this.search),
      this.compact ? null : h('label', { cls: 'check', title: T('Сколько модулей лежит в выбранном комплекте') }, this.limitBox, T('Как в наборе (ограниченное число)'))));
    this.el.appendChild(this.list);
    this.render();
  };

  Tray.prototype.setKit = function (k) { this.kit = k; this.render(); };

  Tray.prototype.placed = function (key) {
    var n = 0;
    this.board.ports.forEach(function (p) { if (p.module && p.module.key === key) n++; });
    if (this.bv) this.bv.views.forEach(function (mv) { if (mv.inst.key === key && !mv.inst.port && !mv.removing) n++; });   // one being carried
    return n;
  };

  Tray.prototype.left = function (key) {
    var inv = Q.DATA.inventory[this.kit] || {};
    return (inv[key] || 0) - this.placed(key);
  };

  Tray.prototype.render = function () {
    var self = this, mods = Q.moduleList();
    this.list.textContent = '';
    this.cards = [];
    var shown = 0, q = this.query;
    var match = function (d) {
      if (!q) return true;
      return (d.name + ' ' + d.key + ' ' + d.part + ' ' + d.io + ' ' + (d.addr ? '0x' + d.addr.toString(16) : '')).toLowerCase().indexOf(q) >= 0;
    };
    for (var kit = 1; kit <= this.kit; kit++) {
      var group = mods.filter(function (d) { return d.kit === kit && match(d); });
      if (!group.length) continue;
      this.list.appendChild(h('div', { cls: 'tray-sec', text: T('Комплект %1 · %2%3', kit, Q.DATA.kits[kit], (this.compact ? '' : ' (' + group.length + ')')) }));
      var cards = h('div', { cls: 'cards' });
      group.forEach(function (d) { cards.appendChild(self.card(d)); shown++; });
      this.list.appendChild(cards);
    }
    var dbg = this.compact ? [] : Q.moduleList({ debug: true }).filter(function (d) { return d.debug && match(d); });
    if (dbg.length) {
      var det = h('details', { cls: 'debug' }, h('summary', { text: T('Для отладки платы (%1)', dbg.length) }));
      var cs = h('div', { cls: 'cards', style: { marginTop: '8px' } });
      dbg.forEach(function (d) { cs.appendChild(self.card(d)); });
      det.appendChild(cs);
      if (q) det.open = true;
      this.list.appendChild(det);
    }
    if (!shown && !dbg.length) this.list.appendChild(h('p', { cls: 'note', text: T('Ничего не найдено.') }));
    this.count.textContent = T('%1 из %2', shown, mods.filter(function (d) { return d.kit <= self.kit; }).length);
  };

  /** refresh stock badges without rebuilding the thumbnails */
  Tray.prototype.refresh = function () {
    var self = this;
    this.cards.forEach(function (c) {
      if (!self.limited || c.def.debug) { c.badge.hidden = true; c.el.classList.remove('empty'); return; }
      var n = self.left(c.def.key);
      c.badge.hidden = false; c.badge.textContent = '×' + Math.max(0, n);
      c.el.classList.toggle('empty', n <= 0);
    });
  };

  Tray.prototype.card = function (d) {
    var self = this;
    var variant = d.variants.length ? (this.variant[d.key] || d.defaultVariant) : null;
    var thumb = Q.Faces.thumbnail(d.key, variant);
    var badge = h('span', { cls: 'badge', hidden: true });
    var el = h('div', { cls: 'card' + (d.fmt === 65 ? ' wide' : ''), tabindex: 0, role: 'button', 'data-key': d.key, 'aria-label': T('%1: перетащите на порт или нажмите Enter', d.name) },
      badge, thumb,
      h('div', { cls: 'nm', text: d.name }),
      this.compact ? null : h('div', { cls: 'meta' },
        h('span', { cls: 'tag io-' + d.io, text: d.io === '-' ? T('ПАСС') : d.io }),
        d.addr ? h('span', { cls: 'tag', text: '0x' + d.addr.toString(16).toUpperCase() }) : null,
        h('span', { cls: 'tag', text: d.fmt === 65 ? T('2 порта') : T('1 порт') })));
    if (d.variants.length) {
      var row = h('div', { cls: 'variants' });
      d.variants.forEach(function (v) {
        var b = h('button', { type: 'button', title: v, 'aria-pressed': String(v === variant), 'aria-label': T('цвет %1', v), style: { background: LED_DOT[v] || '#ccc' } });
        b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          self.variant[d.key] = v;
          var old = el.querySelector('svg');
          var neu = Q.Faces.thumbnail(d.key, v);
          el.replaceChild(neu, old);
          Array.prototype.forEach.call(row.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        });
        row.appendChild(b);
      });
      el.appendChild(row);
    }
    this.wire(el, d);
    this.cards.push({ el: el, def: d, badge: badge });
    return el;
  };

  Tray.prototype.wire = function (el, d) {
    var self = this;
    el.addEventListener('pointerdown', function (e) {
      if (e.button || el.classList.contains('empty')) return;
      var sx = e.clientX, sy = e.clientY, started = false, id = e.pointerId, touch = e.pointerType === 'touch';
      try { el.setPointerCapture(id); } catch (x) { /* ignore */ }
      function varOf() { return d.variants.length ? (self.variant[d.key] || d.defaultVariant) : null; }
      function move(ev) {
        if (ev.pointerId !== id) return;
        if (!started) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy, dist = Math.hypot(dx, dy);
          var go = touch ? (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) : dist > 5;
          if (!go) return;
          started = true;
          self.onDragStart();
          self.bv.dragNew(d.key, varOf(), ev.clientX, ev.clientY);
          self.refresh();
        } else self.bv.dragMove(ev.clientX, ev.clientY);
      }
      function up(ev) {
        if (ev.pointerId !== id) return;
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        if (started) { self.bv.endDrag(ev.clientX, ev.clientY); self.refresh(); }
      }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', function () { self.onQuickAdd(d.key, d.variants.length ? (self.variant[d.key] || d.defaultVariant) : null); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.onQuickAdd(d.key, d.variants.length ? (self.variant[d.key] || d.defaultVariant) : null); } });
  };

  Q.Tray = Tray;
})(typeof globalThis !== 'undefined' ? globalThis : this);
