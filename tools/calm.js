/* Design study 2: one calm, minimal flat-vector direction. Colours follow the reference boards (Arduino blue, micro:bit black),
   nothing is drawn that does not exist on the real part. Geometry is the real one (155 x 85 board, 30 mm pockets, 29.6 mm modules). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, a) {
    var e = document.createElementNS(NS, tag);
    if (a) for (var k in a) { if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]); }
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
    return e;
  }
  function rect(x, y, w, h, r, a) { return el('rect', Object.assign({ x: x, y: y, width: w, height: h, rx: r || 0, ry: r || 0 }, a)); }
  function circ(cx, cy, r, a) { return el('circle', Object.assign({ cx: cx, cy: cy, r: r }, a)); }
  function txt(s, x, y, a) { var t = el('text', Object.assign({ x: x, y: y }, a)); t.textContent = s; return t; }
  function g(a) { var e = el('g', a); for (var i = 1; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]); return e; }

  var C = {
    scene: '#f3f5f8',
    board: '#2b2d32', pocket: '#222429', window: '#14161a', boardText: '#8a909c', screw: '#f3f5f8',
    pcb: '#101113', silk: '#ffffff', gold: '#dcb74e', metal: '#c9ced6',
    btnBody: '#c4c9d2', btnRing: '#e8ebf0', btnCap: '#2b2d33',
    knobBezel: '#2b2d33', knob: '#5a9bd8', pointer: '#102a4a',
    lens: '#f2f2ee', led: '#45e07f',
    cable: '#16181d', rib: '#2b2f37', reset: '#e0533f', boot: '#4f7de0'
  };
  var FONT = 'Arial, Helvetica, sans-serif';
  var PORTS = [[25, 25], [60, 25], [95, 25], [130, 25], [25, 60], [60, 60], [95, 60], [130, 60]];

  function moduleBase(label) {
    var S = 29.6, h = S / 2, root = g();
    root.appendChild(rect(-h, -h, S, S, 3.2, { fill: C.pcb }));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      root.appendChild(circ(c[0] * 12.4, c[1] * 12.4, 1.7, { fill: C.pocket, stroke: C.gold, 'stroke-width': 0.8 }));
    });
    root.appendChild(txt(label, 0, 11.8, { 'text-anchor': 'middle', fill: C.silk, 'font-size': 3.7, 'font-weight': 700, 'font-family': FONT, 'letter-spacing': 0.5 }));
    return root;
  }
  function button() {
    var r = moduleBase('BUTTON');
    r.appendChild(rect(-5.2, -8.2, 10.4, 10.4, 1.4, { fill: C.btnBody }));
    r.appendChild(circ(0, -3, 3.9, { fill: C.btnRing }));
    r.appendChild(circ(0, -3, 2.8, { fill: C.btnCap }));
    return r;
  }
  function pot() {
    var r = moduleBase('POT');
    r.appendChild(circ(0, -2, 8.8, { fill: C.knobBezel }));
    r.appendChild(circ(0, -2, 6.4, { fill: C.knob }));
    var a = -50 * Math.PI / 180;
    r.appendChild(el('line', { x1: Math.cos(a) * 1.4, y1: -2 + Math.sin(a) * 1.4, x2: Math.cos(a) * 5.4, y2: -2 + Math.sin(a) * 5.4, stroke: C.pointer, 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
    return r;
  }
  function rgb() {
    var r = moduleBase('RGB');
    r.appendChild(circ(0, -2.6, 12, { fill: 'url(#glow)', opacity: 0.8 }));
    r.appendChild(rect(-4.2, -6.8, 8.4, 8.4, 1.2, { fill: C.lens }));
    r.appendChild(circ(0, -2.6, 2.9, { fill: C.led }));
    return r;
  }

  function pocket(n, x, y) {
    var r = g({ transform: 'translate(' + x + ' ' + y + ')' });
    r.appendChild(rect(-15, -15, 30, 30, 4.2, { fill: C.pocket }));
    r.appendChild(rect(-11.2, -2.1, 22.4, 4.2, 2.1, { fill: C.window }));
    for (var i = 0; i < 5; i++) r.appendChild(circ((i - 2) * 2.54, 0, 0.65, { fill: C.gold }));
    [-1, 1].forEach(function (s) { r.appendChild(circ(s * 9.3, 0, 1.2, { fill: C.metal })); });
    r.appendChild(txt('P' + n, -14.8, -17.2, { 'font-size': 2.9, 'font-weight': 700, fill: C.boardText, 'font-family': FONT }));
    return r;
  }

  function usb(ux) {
    var r = g();
    // plain USB-C: a straight cable, a plastic body and the flat metal shell that goes into the slot
    r.appendChild(rect(ux - 1.8, -44, 3.6, 32, 0, { fill: C.cable }));
    r.appendChild(rect(ux - 5.8, -16, 11.6, 10.4, 2.4, { fill: C.cable }));
    r.appendChild(rect(ux - 4.6, -6.4, 9.2, 6.4, 1.8, { fill: C.metal }));
    r.appendChild(rect(ux - 3.1, -4.6, 6.2, 2.4, 1.2, { fill: '#6d7380' }));
    return r;
  }

  function board() {
    var W = 155, H = 85, root = g({ 'font-family': FONT });
    root.appendChild(rect(-1.9, -1.9, W + 3.8, H + 3.8, 15.9, { fill: C.board }));
    [[7, 7], [148, 7], [7, 78], [148, 78]].forEach(function (p) { root.appendChild(circ(p[0], p[1], 2.1, { fill: C.screw })); });
    root.appendChild(rect(67.7 - 2.5, -2.4, 5, 2.8, 1, { fill: C.reset }));
    root.appendChild(rect(87.3 - 2.5, -2.4, 5, 2.8, 1, { fill: C.boot }));
    root.appendChild(txt('RESET', 67.7, 3.9, { 'text-anchor': 'middle', 'font-size': 2.1, 'font-weight': 700, fill: C.boardText, 'letter-spacing': 0.2 }));
    root.appendChild(txt('BOOT', 87.3, 3.9, { 'text-anchor': 'middle', 'font-size': 2.1, 'font-weight': 700, fill: C.boardText, 'letter-spacing': 0.2 }));
    root.appendChild(txt('q.bit', 12, 79.8, { 'font-size': 6.2, 'font-weight': 800, fill: '#ffffff', opacity: 0.92 }));
    PORTS.forEach(function (p, i) { root.appendChild(pocket(i + 1, p[0], p[1])); });
    [button, pot, rgb].forEach(function (f, i) {
      var m = f(); m.setAttribute('transform', 'translate(' + PORTS[i][0] + ' ' + PORTS[i][1] + ')'); root.appendChild(m);
    });
    root.appendChild(usb(77.5));
    return root;
  }

  function scene(vb, content) {
    var v = vb.split(' ').map(Number);
    var svg = el('svg', { viewBox: vb, width: '100%' },
      el('defs', null, el('radialGradient', { id: 'glow' }, el('stop', { offset: 0, 'stop-color': '#45e07f', 'stop-opacity': 0.8 }), el('stop', { offset: 0.55, 'stop-color': '#45e07f', 'stop-opacity': 0.28 }), el('stop', { offset: 1, 'stop-color': '#45e07f', 'stop-opacity': 0 }))),
      rect(v[0], v[1], v[2], v[3], 0, { fill: C.scene }), content);
    return svg;
  }

  document.getElementById('board').appendChild(scene('-8 -38 171 138', board()));
  var row = document.getElementById('mods');
  [[button, 'Кнопка'], [pot, 'Потенциометр'], [rgb, 'RGB-светодиод']].forEach(function (m) {
    var f = document.createElement('figure');
    f.appendChild(scene('-18 -18 36 36', m[0]()));
    var c = document.createElement('figcaption'); c.textContent = m[1]; f.appendChild(c); row.appendChild(f);
  });
  var sw = document.getElementById('sw');
  [['board', 'плата'], ['pocket', 'гнёзда'], ['pcb', 'модули'], ['knob', 'ручка'], ['gold', 'контакты'], ['led', 'светодиод']].forEach(function (k) {
    var d = document.createElement('div'); d.className = 'chip';
    d.innerHTML = '<i style="background:' + C[k[0]] + '"></i>' + k[1] + ' <b>' + C[k[0]] + '</b>'; sw.appendChild(d);
  });
})();
