/* How a module looks from above, and the small framework that draws and animates it.

   A face is drawn in millimetres in the module's own frame: origin top-left, 29.6 x 29.6 (one port) or 64.6 x 29.6 (two ports).
   The connector sits at the centre of the first half (14.8, 14.8), so that point is what snaps onto a port.

   Q.Faces.define(key, function (f) { ... })  registers a drawing; inside, f.base('LABEL') paints the PCB, f.add(el) adds parts,
   f.bind(el, attr, getter) keeps an attribute in sync with the module, f.hold / f.tap / f.drag make a part respond to the pointer. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var S = Q.S, C = Q.COLORS, U = Q.util;

  var defs = {};

  function Face(inst, opts) {
    opts = opts || {};
    this.inst = inst;
    this.interactive = !!opts.interactive;
    this.w = inst.slots === 2 ? 64.6 : 29.6;
    this.h = 29.6;
    this.root = S.g({ cls: 'face' });
    this.binds = [];
    this.ups = [];
    this.t = 0;
  }

  Face.prototype.add = function () {
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) this.root.appendChild(arguments[i]);
    return arguments[0];
  };
  Face.prototype.onUpdate = function (fn) { this.ups.push(fn); };

  /** keep attribute `attr` of `el` equal to getter(); only touches the DOM when the value changes */
  Face.prototype.bind = function (el, attr, getter) {
    var b = { el: el, attr: attr, get: getter, last: undefined };
    this.binds.push(b);
    return b;
  };

  Face.prototype.update = function (dt) {
    this.t += dt;
    var i, b, v;
    for (i = 0; i < this.binds.length; i++) {
      b = this.binds[i];
      v = b.get(this);
      if (v !== b.last) {
        b.last = v;
        if (b.attr === 'text') b.el.textContent = v;
        else if (v === null || v === undefined) b.el.removeAttribute(b.attr);
        else b.el.setAttribute(b.attr, v);
      }
    }
    for (i = 0; i < this.ups.length; i++) this.ups[i](dt, this);
  };

  /** pointer position in the module's millimetres */
  Face.prototype.local = function (e) {
    var m = this.root.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  function guard(el) {
    el.classList.add('ctl-hit');
    el.setAttribute('data-ctl', '1');
  }

  /** press and hold: cb(true) on pointer down, cb(false) when it ends.
   *  The event is not swallowed: if the pointer then travels far, the module takes it over (board-view) and the press is released. */
  Face.prototype.hold = function (el, cb) {
    if (!this.interactive) return el;
    var self = this, down = false;
    guard(el);
    function end() {
      window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      if (down) { down = false; cb(false); }
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      if (!down) { down = true; cb(true, self.local(e)); }
      window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      e.qbitControl = { release: end };
    });
    return el;
  };

  /** a click: cb(point). Dragging away does not count, the module moves instead. */
  Face.prototype.tap = function (el, cb) {
    if (!this.interactive) return el;
    var self = this;
    guard(el);
    el.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      var sx = e.clientX, sy = e.clientY, id = e.pointerId, t0 = performance.now();
      function off() { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', off); }
      function up(ev) {
        if (ev.pointerId !== id) return;
        off();
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6 && performance.now() - t0 < 800) cb(self.local(ev));
      }
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', off);
      e.qbitControl = { release: off };
    });
    return el;
  };

  /** drag: h.down(p), h.move(p, start), h.up(p, moved) in module millimetres */
  Face.prototype.drag = function (el, hd) {
    if (!this.interactive) return el;
    var self = this, start = null, moved = false;
    guard(el);
    el.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.stopPropagation(); e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      start = self.local(e); moved = false;
      if (hd.down) hd.down(start, e);
    });
    el.addEventListener('pointermove', function (e) {
      if (!start) return;
      var p = self.local(e);
      if (Math.hypot(p.x - start.x, p.y - start.y) > 0.4) moved = true;
      if (hd.move) hd.move(p, start, e);
    });
    function end(e) {
      if (!start) return;
      var s = start; start = null;
      if (hd.up) hd.up(self.local(e), moved, s);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', function (e) { if (hd.wheel) { e.preventDefault(); e.stopPropagation(); hd.wheel(e.deltaY < 0 ? 1 : -1, e); } }, { passive: false });
    return el;
  };

  /** an invisible, larger hit area for a small part */
  Face.prototype.zone = function (x, y, w, h, r) {
    var z = S.rect(x, y, w, h, { r: r || 1, fill: '#fff', 'fill-opacity': 0, stroke: 'none' });
    this.root.appendChild(z);
    return z;
  };

  /* -------------------------------------------------------------- the PCB every module shares */
  var HOLE = 3.2;

  Face.prototype.base = function (label, o) {
    o = o || {};
    var f = this, w = this.w, h = this.h, g = this.root;
    g.appendChild(S.rect(0, 0, w, h, { r: 3.4, fill: 'url(#g-pcb)' }));
    [[HOLE, HOLE], [w - HOLE, HOLE], [HOLE, h - HOLE], [w - HOLE, h - HOLE]].forEach(function (p) {
      g.appendChild(S.circle(p[0], p[1], 1.7, { fill: '#222429', stroke: C.gold, 'stroke-width': 0.8 }));
    });
    if (label) {
      // as big as the room allows: between the left hole and the right hole (about 17.6 mm on a one-port module)
      var room = (o.labelRoom || (w - 12.0)), size = Math.min(o.labelSize || 3.5, room / (0.8 * label.length));
      g.appendChild(S.text(label, o.labelX !== undefined ? o.labelX : (w < 40 ? w / 2 : w - 6.8), o.labelY || 26.5, { 'font-size': size.toFixed(2), 'font-weight': 700, fill: '#ffffff',
        'text-anchor': o.labelAnchor || (w < 40 ? 'middle' : 'end'), 'letter-spacing': 0.4, 'font-family': '"DejaVu Sans", "Segoe UI", Arial, sans-serif' }));
    }
    return this;
  };

  /** a text on the silkscreen */
  Face.prototype.silk = function (str, x, y, size, anchor, o) {
    this.root.appendChild(S.text(str, x, y, Object.assign({ 'font-size': size || 2, 'font-weight': 700, fill: C.silk, 'fill-opacity': 0.85, 'text-anchor': anchor || 'middle',
      'font-family': '"DejaVu Sans", "Segoe UI", Arial, sans-serif' }, o)));
  };

  /* -------------------------------------------------------------- shared parts */
  var Parts = {
    /** surface-mount passive; tone = body colour */
    smd: function (parent, x, y, w, h, rot, tone) {
      var g = S.g({ transform: 'translate(' + x + ' ' + y + ') rotate(' + (rot || 0) + ')' });
      g.appendChild(S.rect(-w / 2, -h / 2, w, h, { r: 0.08, fill: tone || '#c8b58c', stroke: '#6a5a3a', 'stroke-width': 0.08 }));
      g.appendChild(S.rect(-w / 2, -h / 2, w * 0.22, h, { fill: C.silver }));
      g.appendChild(S.rect(w / 2 - w * 0.22, -h / 2, w * 0.22, h, { fill: C.silver }));
      parent.appendChild(g);
      return g;
    },
    /** SOIC-style IC: body w x h centred on cx, cy, `pins` leads per long side, rotation in degrees */
    soic: function (parent, cx, cy, w, h, pins, rot, text) {
      var g = S.g({ transform: 'translate(' + cx + ' ' + cy + ') rotate(' + (rot || 0) + ')' });
      var pitch = h / pins;
      for (var i = 0; i < pins; i++) {
        var y = -h / 2 + pitch * (i + 0.5);
        g.appendChild(S.rect(-w / 2 - 0.9, y - 0.22, 1.1, 0.44, { fill: C.silver }));
        g.appendChild(S.rect(w / 2 - 0.2, y - 0.22, 1.1, 0.44, { fill: C.silver }));
      }
      g.appendChild(S.rect(-w / 2, -h / 2, w, h, { r: 0.25, fill: 'url(#g-black)', stroke: '#000', 'stroke-width': 0.1 }));
      g.appendChild(S.circle(-w / 2 + 0.7, -h / 2 + 0.7, 0.26, { fill: '#555a64' }));
      parent.appendChild(g);
      return g;
    },
    /** SOT-23-ish transistor / regulator */
    sot: function (parent, cx, cy, pins) {
      var g = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' });
      var n = pins || 3;
      for (var i = 0; i < 3; i++) g.appendChild(S.rect(-1.1 + i * 1.0 - 0.17, 0.7, 0.34, 0.7, { fill: C.silver }));
      for (i = 0; i < (n === 5 ? 2 : 1); i++) g.appendChild(S.rect(n === 5 ? -0.6 + i * 1.2 - 0.17 : -0.17, -1.4, 0.34, 0.7, { fill: C.silver }));
      g.appendChild(S.rect(-1.5, -0.8, 3.0, 1.6, { r: 0.2, fill: 'url(#g-black)' }));
      parent.appendChild(g);
      return g;
    },
    /** one gold pad / test point */
    pad: function (parent, x, y, r) { var c = S.circle(x, y, r || 0.6, { fill: 'url(#g-gold)', stroke: '#8a6a14', 'stroke-width': 0.08 }); parent.appendChild(c); return c; },
    /** glow behind a lit part: returns the circle, set its opacity / fill from an updater */
    glow: function (parent, cx, cy, r, color) {
      var id = S.uid('gl');
      var grad = S('radialGradient', { id: id }, S('stop', { offset: 0, 'stop-color': color, 'stop-opacity': 0.95 }), S('stop', { offset: 0.35, 'stop-color': color, 'stop-opacity': 0.45 }), S('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }));
      var c = S.circle(cx, cy, r, { fill: 'url(#' + id + ')', opacity: 0, 'pointer-events': 'none' });
      var g = S.g({ 'pointer-events': 'none' }, S('defs', null, grad), c);
      parent.appendChild(g);
      c.gradient = grad;
      return c;
    },
    /** tactile switch, 6 x 6 mm, with the yellow cap: returns { g, press(bool) } */
    tact: function (parent, cx, cy, scale) {
      var g = S.g({ transform: 'translate(' + cx + ' ' + cy + ') scale(' + (scale || 1) + ')' });
      g.appendChild(S.rect(-3.1, -3.1, 6.2, 6.2, { r: 0.9, fill: '#c4c9d2' }));
      var ring = S.circle(0, 0, 2.3, { fill: '#e8ebf0' });
      var cap = S.circle(0, 0, 1.7, { fill: '#2b2d33' });
      var capG = S.g(null, ring, cap);
      g.appendChild(capG);
      parent.appendChild(g);
      return { g: g, press: function (on) { capG.setAttribute('transform', on ? 'scale(0.92)' : ''); cap.setAttribute('fill', on ? '#000' : '#2b2d33'); } };
    },
    /** 2.54 mm gold pin(s) in a row */
    pins: function (parent, x, y, n, vertical) {
      for (var i = 0; i < n; i++) {
        var px = vertical ? x : x + i * 2.54, py = vertical ? y + i * 2.54 : y;
        parent.appendChild(S.rect(px - 0.32, py - 0.32, 0.64, 0.64, { fill: 'url(#g-gold)' }));
      }
    },
    /** knurled round knob; returns the rotating group */
    knob: function (parent, cx, cy, r, notches, color) {
      var wrap = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' });
      wrap.appendChild(S.circle(0, 0, r + 1.4, { fill: '#2b2d33' }));
      var rot = S.g();
      rot.appendChild(S.circle(0, 0, r, { fill: color || '#5a9bd8' }));
      rot.appendChild(S.line(0, -r * 0.22, 0, -r + 0.7, { stroke: '#102a4a', 'stroke-width': 0.7, 'stroke-linecap': 'round' }));
      wrap.appendChild(rot);
      parent.appendChild(wrap);
      return { wrap: wrap, rot: rot };
    }
  };

  /* -------------------------------------------------------------- registry */
  function define(key, fn) { defs[key] = fn; }

  function build(inst, opts) {
    var f = new Face(inst, opts);
    var fn = defs[inst.key] || function (ff) { ff.base((ff.inst.key || '').toUpperCase().slice(0, 9)); };
    fn(f);
    return f;
  }

  /** a still picture of a module for the tray */
  function thumbnail(key, variant) {
    var inst = Q.createModule(key, { variant: variant });
    var f = build(inst, { interactive: false });
    var svg = S('svg', { viewBox: '-1.2 -1.2 ' + (f.w + 2.4) + ' ' + (f.h + 2.4), xmlns: S.NS });
    svg.appendChild(f.root);
    f.update(0);
    return svg;
  }

  Q.Faces = { define: define, build: build, thumbnail: thumbnail, Face: Face, defs: defs };
  Q.faceParts = Parts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
