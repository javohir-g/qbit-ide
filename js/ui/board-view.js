/* The picture of the board (lid, 8 pockets, USB-C, RESET / BOOT) and everything that happens on it:
   modules snapping onto ports like magnets, being pulled off, selected, animated.
   All coordinates are board millimetres (origin = top-left corner of the PCB, USB-C edge on top). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var S = Q.S, U = Q.util, C = Q.COLORS, GEO = Q.DATA.board;

  var VIEW = { x: -8, y: -27, w: 171, h: 123 };
  var A = 14.8;                         // connector centre inside a module
  var PULL = 10.5, HOLD = 13.5;         // magnet reach: to catch a module / to keep it
  var DETACH = 7;                       // a held module lets go of its port when it is this far away

  /* ---------------------------------------------------------------- one module on (or above) the board */
  function ModuleView(bv, inst) {
    this.bv = bv; this.inst = inst;
    this.face = Q.Faces.build(inst, { interactive: true });
    this.w = this.face.w; this.h = this.face.h;
    this.inner = S.g(null, this.face.root);
    this.badge = S.g({ 'pointer-events': 'none' });
    this.g = S.g({ cls: 'mv grab', 'data-uid': inst.uid }, this.inner, this.badge);
    this.x = 0; this.y = 0; this.tx = 0; this.ty = 0;
    this.lift = 0; this.tlift = 0;
    this.pop = 0; this.fade = 0; this.opacity = 1;
    this.following = false;            // springing towards (tx, ty)
    this.removing = false;
    this._f = '';
    this.apply(true);
  }
  ModuleView.prototype.apply = function () {
    var cx = this.w / 2, cy = this.h / 2;
    var s = (1 + 0.07 * this.lift) * (1 + 0.05 * Math.sin(this.pop * Math.PI)) * (1 - 0.16 * this.fade);
    this.g.setAttribute('transform', 'translate(' + this.x.toFixed(3) + ' ' + this.y.toFixed(3) + ') translate(' + cx + ' ' + cy + ') scale(' + s.toFixed(4) + ') translate(' + (-cx) + ' ' + (-cy) + ')');
    var op = (1 - this.fade) * this.opacity;
    if (op !== this._op) { this._op = op; this.g.setAttribute('opacity', op.toFixed(3)); }
  };
  ModuleView.prototype.placeAt = function (port) { this.x = this.tx = port.x - A; this.y = this.ty = port.y - A; };
  ModuleView.prototype.step = function (dt) {
    var moved = false;
    if (this.following) {
      var k = 1 - Math.exp(-dt * 22);
      var dx = this.tx - this.x, dy = this.ty - this.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.004) { this.x += dx * k; this.y += dy * k; moved = true; } else { this.x = this.tx; this.y = this.ty; this.following = false; }
    }
    if (Math.abs(this.tlift - this.lift) > 0.002) { this.lift += (this.tlift - this.lift) * (1 - Math.exp(-dt * 16)); moved = true; }
    if (this.pop > 0) { this.pop = Math.max(0, this.pop - dt * 4.2); moved = true; }
    if (this.removing) { this.fade = Math.min(1, this.fade + dt * 5); moved = true; }
    else if (this.fade > 0) { this.fade = Math.max(0, this.fade - dt * 6); moved = true; }
    if (moved) this.apply();
  };

  /* ---------------------------------------------------------------- the board */
  function BoardView(svg, board, opts) {
    opts = opts || {};
    this.svg = svg; this.board = board;
    this.dragSvg = opts.dragSvg; this.dragRoot = opts.dragRoot;
    this.views = new Map();
    this.pvs = [];
    this.hl = {};
    this.sel = null;
    this.drag = null;
    this.pending = null;
    this.fxs = [];
    this.t = 0;
    this.onSelect = opts.onSelect || function () {};
    this.onSound = opts.onSound || function () {};
    this.onToast = opts.onToast || function () {};
    this.onUsbClick = opts.onUsbClick || function () {};
    this.build();
    var self = this;
    board.on('attach', function (port, inst) { self.onAttach(port, inst); });
    board.on('detach', function (port, inst) { self.onDetach(port, inst); });
  }

  BoardView.prototype.toMm = function (cx, cy) {
    var m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  /* ---- scene -------------------------------------------------------------------------------- */
  BoardView.prototype.build = function () {
    var svg = this.svg, self = this;
    svg.setAttribute('viewBox', VIEW.x + ' ' + VIEW.y + ' ' + VIEW.w + ' ' + VIEW.h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.textContent = '';
    var W = GEO.w, H = GEO.h;

    // a flat graphite plate: no shadows, no highlights
    svg.appendChild(S.rect(-1.9, -1.9, W + 3.8, H + 3.8, { r: 15.9, fill: 'url(#g-lid)' }));
    GEO.holes.forEach(function (p) { svg.appendChild(S.circle(p[0], p[1], 2.1, { fill: '#f3f5f8' })); });
    svg.appendChild(S.text('q.bit', 12, 79.8, { 'font-size': 6.2, 'font-weight': 800, fill: '#ffffff', 'fill-opacity': 0.92 }));

    // pockets
    this.pocketLayer = S.g(); svg.appendChild(this.pocketLayer);
    GEO.ports.forEach(function (p) { self.pvs.push(self.buildPocket(p)); });

    this.layerMods = S.g({ id: 'layer-mods' }); svg.appendChild(this.layerMods);
    this.layerFx = S.g({ 'pointer-events': 'none' }); svg.appendChild(this.layerFx);
    this.buildEdge();

    svg.addEventListener('pointerdown', function (e) {
      if (e.target === svg || e.target.closest('#layer-mods') === null && !e.target.closest('[data-port]') && !e.target.closest('[data-edge]')) self.select(null);
    });
  };

  BoardView.prototype.buildPocket = function (p) {
    var self = this, pm = GEO.pocket;
    var g = S.g({ transform: 'translate(' + p.x + ' ' + p.y + ')', 'data-port': p.n });
    g.appendChild(S.rect(-pm.w / 2, -pm.h / 2, pm.w, pm.h, { r: pm.r, cls: 'pocket-floor' }));
    // connector window with the five pogo pins and the two magnets
    var win = GEO.window;
    g.appendChild(S.rect(-win.w / 2, -win.h / 2, win.w, win.h, { r: win.h / 2, fill: '#14161a' }));
    GEO.pins.forEach(function (n, i) {
      g.appendChild(S.circle((i - 2) * GEO.pinPitch, 0, 0.65, { fill: C.gold }));
    });
    [-1, 1].forEach(function (s) { g.appendChild(S.circle(s * 9.3, 0, 1.2, { fill: '#c9ced6' })); });
    // port number + status dot, in the frame next to the pocket
    var lx = -pm.w / 2 + 0.2, ly = p.n <= 4 ? -pm.h / 2 - 1.8 : -pm.h / 2 - 1.6;
    g.appendChild(S.text('P' + p.n, lx, ly, { cls: 'port-label' }));
    var dot = S.circle(lx + 7.6, ly - 0.95, 0.95, { fill: '#5d6370' });
    g.appendChild(dot);
    var ring = S.rect(-pm.w / 2 - 0.9, -pm.h / 2 - 0.9, pm.w + 1.8, pm.h + 1.8, { r: pm.r + 0.9, fill: 'none', stroke: '#0c78d4', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
    var scan = S.rect(-pm.w / 2 - 0.3, -pm.h / 2 - 0.3, pm.w + 0.6, pm.h + 0.6, { r: pm.r + 0.3, fill: 'none', stroke: '#ffb020', 'stroke-width': 0.6, opacity: 0, 'pointer-events': 'none' });
    var hit = S.rect(-pm.w / 2, -pm.h / 2, pm.w, pm.h, { r: pm.r, fill: '#fff', 'fill-opacity': 0, cls: 'ctl-hit' });
    g.appendChild(hit); g.appendChild(scan); g.appendChild(ring);
    hit.addEventListener('pointerdown', function (e) { e.stopPropagation(); self.select(p.n); });
    this.pocketLayer.appendChild(g);
    return { n: p.n, g: g, dot: dot, ring: ring, scan: scan, last: '' };
  };

  BoardView.prototype.buildEdge = function () {
    var self = this, svg = this.svg, ux = GEO.usb.x;
    // USB-C opening in the front wall, and a plain plug with a straight cable
    var usb = S.g({ 'data-edge': 'usb' });
    usb.appendChild(S.rect(ux - 5.2, -1.8, 10.4, 2.8, { r: 1.4, fill: '#14161a' }));
    var cable = S.g({ opacity: 0 });
    cable.appendChild(S.rect(ux - 1.8, -44, 3.6, 32, { fill: '#16181d' }));
    cable.appendChild(S.rect(ux - 5.8, -16, 11.6, 10.4, { r: 2.4, fill: '#16181d' }));
    cable.appendChild(S.rect(ux - 4.6, -6.4, 9.2, 6.4, { r: 1.8, fill: '#c9ced6' }));
    cable.appendChild(S.rect(ux - 3.1, -4.6, 6.2, 2.4, { r: 1.2, fill: '#6d7380' }));
    var tagBg = S.rect(ux + 9, -15.6, 25, 6.2, { r: 3.1, fill: '#ffffff', stroke: '#d3dae6', 'stroke-width': 0.3 });
    var tag = S.text('', ux + 21.5, -11.3, { 'font-size': 3.0, 'font-weight': 700, 'text-anchor': 'middle', fill: '#1d2a44' });
    cable.appendChild(tagBg); cable.appendChild(tag);
    usb.appendChild(S.rect(ux - 7.5, -32, 15, 33, { fill: '#fff', 'fill-opacity': 0, cls: 'ctl-hit' }));
    usb.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    usb.addEventListener('click', function (e) { e.stopPropagation(); self.onUsbClick(); });
    svg.appendChild(usb);
    svg.appendChild(cable);
    this.usb = { g: usb, cable: cable, tag: tag, tagBg: tagBg, t: this.board.pw.src.usb ? 1 : 0, label: '' };
    usb.appendChild(S.text('USB-C', ux, 5.4, { 'font-size': 2.0, 'text-anchor': 'middle', fill: '#8a909c', 'font-weight': 700, 'letter-spacing': 0.3 }));

    // RESET / BOOT plungers in the same wall
    [['reset', GEO.reset.x, 'RESET', '#e0533f'], ['boot', GEO.boot.x, 'BOOT', '#4f7de0']].forEach(function (b) {
      var g = S.g({ 'data-edge': b[0], cls: 'ctl-hit' });
      var cap = S.rect(b[1] - 2.6, -2.7, 5.2, 2.8, { r: 1.0, fill: b[3] });
      g.appendChild(cap);
      g.appendChild(S.rect(b[1] - 5, -6, 10, 7, { fill: '#fff', 'fill-opacity': 0 }));
      g.appendChild(S.text(b[2], b[1], -4.2, { 'font-size': 2.1, 'font-weight': 700, fill: '#66748f', 'text-anchor': 'middle' }));
      function down(e) { e.stopPropagation(); e.preventDefault(); try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } cap.setAttribute('transform', 'translate(0 0.5)'); self.board.pressButton(b[0], true); }
      function up() { if (cap.getAttribute('transform')) { cap.removeAttribute('transform'); self.board.pressButton(b[0], false); } }
      g.addEventListener('pointerdown', down); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up); g.addEventListener('lostpointercapture', up);
      svg.appendChild(g);
    });
  };

  /* ---- selection / state of the ports ---------------------------------------------------------- */
  BoardView.prototype.select = function (n) {
    if (this.sel === n) return;
    this.sel = n;
    this.onSelect(n);
  };

  var DOT = { empty: '#5d6370', debounce: '#ffb020', ready: '#2ee59d', unknown: '#ff5d6c', fault: '#ff5d6c', nobudget: '#ffab2e', covered: '#7c6bff' };

  BoardView.prototype.updatePockets = function () {
    var b = this.board, t = this.t;
    for (var i = 0; i < this.pvs.length; i++) {
      var pv = this.pvs[i], p = b.ports[i];
      var col = DOT[p.state] || '#5d6370';
      if (p.state === 'empty' && !p.on) col = '#e07a7a';
      if (p.state === 'debounce' && Math.floor(t * 6) % 2) col = '#7a5a10';
      if (!b.pw.on) col = '#454a55';
      if (pv.dotCol !== col) { pv.dotCol = col; pv.dot.setAttribute('fill', col); }
      var mode = this.hl[p.n] || (this.sel === p.n ? 'sel' : '');
      var key = mode + (p.state === 'debounce' ? 'S' : '') + (p.state === 'fault' ? 'F' : '');
      var ro = 0, rc = '#19c3ff', dash = '';
      if (mode === 'target') { ro = 1; rc = '#19c3ff'; }
      else if (mode === 'candidate') { ro = 0.5; rc = '#19c3ff'; dash = '2 1.4'; }
      else if (mode === 'blocked') { ro = 1; rc = '#ff5d6c'; }
      else if (mode === 'sel') { ro = 0.95; rc = '#19c3ff'; }
      if (p.state === 'fault' && !mode) { ro = 0.55 + 0.45 * Math.sin(t * 8); rc = '#ff5d6c'; key += Math.floor(t * 8); }
      var k2 = key + ro.toFixed(2);
      if (pv.last !== k2) {
        pv.last = k2;
        pv.ring.setAttribute('opacity', ro); pv.ring.setAttribute('stroke', rc);
        if (dash) pv.ring.setAttribute('stroke-dasharray', dash); else pv.ring.removeAttribute('stroke-dasharray');
      }
      pv.scan.setAttribute('opacity', p.state === 'debounce' ? (0.35 + 0.45 * Math.sin(t * 12)).toFixed(2) : 0);
    }
  };

  /* ---- modules ------------------------------------------------------------------------------------ */
  BoardView.prototype.makeView = function (inst) {
    var mv = new ModuleView(this, inst);
    this.views.set(inst.uid, mv);
    this.wire(mv);
    return mv;
  };

  /** pointer handling on a module that sits on the board: click selects, a drag lifts it off */
  BoardView.prototype.wire = function (mv) {
    var self = this;
    mv.g.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      if (self.drag) return;
      e.stopPropagation();
      var port = mv.inst.port, ctl = e.qbitControl || null;
      self.pending = { mv: mv, x: e.clientX, y: e.clientY, id: e.pointerId, port: port, ctl: ctl };
      if (port) self.select(port.n);
      if (!ctl) { try { self.svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
    });
  };

  BoardView.prototype.syncFromBoard = function () {
    var self = this;
    this.views.forEach(function (mv) { if (mv.g.parentNode) mv.g.parentNode.removeChild(mv.g); });
    this.views.clear();
    this.board.ports.forEach(function (p) {
      if (p.module) {
        var mv = self.makeView(p.module);
        mv.placeAt(p);
        mv.apply();
        self.layerMods.appendChild(mv.g);
      }
    });
  };

  BoardView.prototype.onAttach = function (port, inst) {
    var mv = this.views.get(inst.uid), fresh = false;
    if (!mv) { mv = this.makeView(inst); fresh = true; }
    mv.removing = false; mv.fade = 0;
    mv.tx = port.x - A; mv.ty = port.y - A; mv.following = true; mv.tlift = 0; mv.pop = 1;
    if (fresh) { mv.x = mv.tx; mv.y = mv.ty - 7; mv.lift = 1; mv.fade = 0.9; }
    if (mv.g.parentNode !== this.layerMods) this.layerMods.appendChild(mv.g);
    this.ripple(port.x, port.y);
    this.onSound('snap');
    mv.apply();
  };

  BoardView.prototype.onDetach = function (port, inst) {
    var mv = this.views.get(inst.uid);
    if (!mv) return;
    if (this.drag && this.drag.mv === mv) return;          // being carried: the view stays alive
    this.dispose(mv);
  };

  BoardView.prototype.dispose = function (mv) {
    mv.removing = true; mv.following = false;
    var self = this;
    setTimeout(function () { if (mv.g.parentNode) mv.g.parentNode.removeChild(mv.g); self.views.delete(mv.inst.uid); }, 240);
  };

  BoardView.prototype.ripple = function (x, y) {
    var c = S.circle(x, y, 6, { fill: 'none', stroke: '#0c78d4', 'stroke-width': 0.8, opacity: 0.9 });
    this.layerFx.appendChild(c);
    this.fxs.push({ el: c, t: 0, kind: 'ripple' });
  };

  /* ---- dragging ----------------------------------------------------------------------------------- */
  /** a module from the tray starts to follow the pointer */
  BoardView.prototype.dragNew = function (key, variant, cx, cy) {
    var inst = Q.createModule(key, { variant: variant, board: this.board });
    var mv = this.makeView(inst);
    var p = this.toMm(cx, cy);
    mv.x = mv.tx = p.x - A; mv.y = mv.ty = p.y - A;
    this.beginDrag(mv, { x: A, y: A }, null, cx, cy);
  };

  BoardView.prototype.beginDrag = function (mv, grab, origin, cx, cy) {
    this.drag = { mv: mv, grab: grab, origin: origin, detached: !origin, snapped: null, pointer: this.toMm(cx, cy) };
    document.body.classList.add('dragging');
    mv.following = false; mv.tlift = 1; mv.removing = false; mv.fade = 0;
    this.dragRoot.appendChild(mv.g);
    this.syncDragMatrix();
    this.onSound('pick');
  };

  BoardView.prototype.syncDragMatrix = function () {
    var m = this.svg.getScreenCTM();
    if (m) this.dragRoot.setAttribute('transform', 'matrix(' + m.a + ' ' + m.b + ' ' + m.c + ' ' + m.d + ' ' + m.e + ' ' + m.f + ')');
  };

  BoardView.prototype.dragMove = function (cx, cy) {
    if (this.drag) this.drag.pointer = this.toMm(cx, cy);
  };

  BoardView.prototype.updateDrag = function (dt) {
    var d = this.drag, mv = d.mv, def = mv.inst.def, b = this.board;
    this.syncDragMatrix();
    var px = d.pointer.x - d.grab.x, py = d.pointer.y - d.grab.y, ax = px + A, ay = py + A;
    var bestOk = null, bestBad = null, hl = {};
    for (var i = 0; i < b.ports.length; i++) {
      var p = b.ports[i];
      var dist = Math.hypot(ax - p.x, ay - p.y);
      var chk = b.canPlace(p.n, def, mv.inst);
      if (chk.ok) { if (!bestOk || dist < bestOk.dist) bestOk = { p: p, dist: dist }; if (dist < 42) hl[p.n] = 'candidate'; }
      else if (!bestBad || dist < bestBad.dist) bestBad = { p: p, dist: dist, reason: chk.reason };
    }
    var tx = px, ty = py, snapped = null, blocked = null;
    if (bestOk && bestOk.dist < (d.snapped ? HOLD : PULL)) {
      snapped = bestOk.p; tx = snapped.x - A; ty = snapped.y - A; hl[snapped.n] = 'target';
    } else if (bestBad && bestBad.dist < 9) {
      blocked = bestBad;
      var vx = ax - bestBad.p.x, vy = ay - bestBad.p.y, m = Math.hypot(vx, vy) || 1, k = (9 - bestBad.dist) * 0.45;
      tx = px + vx / m * k; ty = py + vy / m * k;
      hl[bestBad.p.n] = 'blocked';
    }
    d.blockedP = blocked ? blocked : null;
    d.snapped = snapped;
    this.hl = hl;
    var kf = 1 - Math.exp(-dt * (snapped ? 20 : 60));
    mv.x += (tx - mv.x) * kf; mv.y += (ty - mv.y) * kf;
    mv.tlift = snapped ? 0.3 : 1;
    if (d.origin && !d.detached && Math.hypot(mv.x + A - d.origin.x, mv.y + A - d.origin.y) > DETACH) {
      b.detach(d.origin.n); d.detached = true; this.onSound('detach');
    }
    mv.step(dt);
    mv.apply();
  };

  BoardView.prototype.endDrag = function (cx, cy) {
    var d = this.drag;
    if (!d) return;
    this.drag = null;
    this.hl = {};
    document.body.classList.remove('dragging');
    var mv = d.mv, inst = mv.inst, b = this.board;
    var over = document.elementFromPoint(cx, cy);
    var overTray = !!(over && over.closest && over.closest('#tray'));
    mv.tlift = 0;
    var snapOk = d.snapped && b.canPlace(d.snapped.n, inst.def, inst).ok;
    if (snapOk && !overTray) {
      if (d.origin && !d.detached) {
        if (d.snapped === d.origin) { this.layerMods.appendChild(mv.g); mv.tx = d.origin.x - A; mv.ty = d.origin.y - A; mv.following = true; mv.pop = 1; this.onSound('snap'); return; }
        b.detach(d.origin.n);
      }
      b.attachInstance(d.snapped.n, inst);
      this.select(d.snapped.n);
      return;
    }
    if (d.blockedP && !overTray) this.onToast(d.blockedP.reason, 'warn', 'block:' + d.blockedP.reason);
    if (overTray || !d.origin) {                    // put back in the box
      if (d.origin && !d.detached) b.detach(d.origin.n);
      this.discard(mv);
      if (d.origin) this.onToast(T('Модуль возвращён в набор'), 'info');
      return;
    }
    // dropped on empty lid: it jumps back to the port it came from
    if (d.detached) {
      if (b.canPlace(d.origin.n, inst.def, inst).ok) b.attachInstance(d.origin.n, inst);
      else this.discard(mv);
    } else {
      this.layerMods.appendChild(mv.g); mv.tx = d.origin.x - A; mv.ty = d.origin.y - A; mv.following = true; mv.pop = 1;
    }
  };

  BoardView.prototype.discard = function (mv) {
    mv.removing = true; mv.following = false; mv.tlift = 0;
    var self = this;
    setTimeout(function () { if (mv.g.parentNode) mv.g.parentNode.removeChild(mv.g); self.views.delete(mv.inst.uid); }, 260);
    this.onSound('detach');
  };

  /** mouse / touch started on a module: decide between a click and a drag */
  BoardView.prototype.pointerMove = function (e) {
    if (this.drag) { this.dragMove(e.clientX, e.clientY); return; }
    var pd = this.pending;
    if (!pd || e.pointerId !== pd.id) return;
    if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 5) {
      this.pending = null;
      if (pd.ctl) pd.ctl.release();                         // a button that was being held lets go: this is a drag of the module
      var mv = pd.mv, grab = this.toMm(pd.x, pd.y);
      var origin = mv.inst.port;
      this.beginDrag(mv, { x: grab.x - mv.x, y: grab.y - mv.y }, origin, e.clientX, e.clientY);
    }
  };
  BoardView.prototype.pointerUp = function (e) {
    if (this.drag) { this.endDrag(e.clientX, e.clientY); return; }
    this.pending = null;
  };

  /* ---- per frame ---------------------------------------------------------------------------------- */
  BoardView.prototype.update = function (dt) {
    dt = Math.max(0, dt);
    this.t += dt;
    var self = this;
    this.views.forEach(function (mv) {
      mv.face.update(dt);
      if (!(self.drag && self.drag.mv === mv)) mv.step(dt);
      self.updateBadge(mv);
    });
    if (this.drag) this.updateDrag(dt);
    this.updatePockets();
    // fx
    for (var i = this.fxs.length - 1; i >= 0; i--) {
      var f = this.fxs[i]; f.t += dt;
      var k = f.t / 0.5;
      if (k >= 1) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); this.fxs.splice(i, 1); continue; }
      f.el.setAttribute('r', (6 + k * 13).toFixed(2)); f.el.setAttribute('opacity', ((1 - k) * 0.8).toFixed(2));
    }
    this.updateUsb(dt);
  };

  BoardView.prototype.updateBadge = function (mv) {
    var p = mv.inst.port, st = p ? p.state : 'free', key = st + (p && p.locked ? 'L' : '');
    if (mv._badge === key) return;
    mv._badge = key;
    mv.badge.textContent = '';
    var mark = null;
    if (st === 'unknown') mark = ['?', '#ff5d6c'];
    else if (st === 'fault') mark = ['!', '#ff5d6c'];
    else if (st === 'nobudget') mark = ['bolt', '#ffab2e'];
    if (mark) {
      mv.badge.appendChild(S.circle(25.4, 4.2, 2.6, { fill: '#ffffff', stroke: mark[1], 'stroke-width': 0.5 }));
      if (mark[0] === 'bolt') mv.badge.appendChild(S.path('M25.9 2.6l-1.9 2.2h1.2l-.6 1.7 1.9-2.2h-1.2z', { fill: mark[1] }));
      else mv.badge.appendChild(S.text(mark[0], 25.4, 5.5, { 'font-size': 3.6, 'font-weight': 800, 'text-anchor': 'middle', fill: mark[1], 'font-family': 'Arial' }));
    }
    var dim = st === 'unknown' || st === 'nobudget';
    mv.opacity = dim ? 0.82 : 1;
    mv.apply();
  };

  BoardView.prototype.updateUsb = function (dt) {
    var u = this.usb, src = this.board.pw.src;
    var tgt = src.usb ? 1 : 0;
    u.t += (tgt - u.t) * Math.min(1, dt * 9);
    var k = u.t;
    u.cable.setAttribute('opacity', k.toFixed(3));
    u.cable.setAttribute('transform', 'translate(0 ' + ((1 - k) * -8).toFixed(2) + ')');
    var label = src.usb ? src.short : '';
    if (label !== u.label) { u.label = label; u.tag.textContent = label; }
  };

  Q.BoardView = BoardView;
  Q.BoardView.VIEW = VIEW;
  Q.BoardView.ANCHOR = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
