/* Design study: four visual directions for the main board and three modules (button, potentiometer, RGB LED).
   Self-contained - it does not touch the simulator; geometry is the real one (155 x 85 board, 30 mm pockets, 35 mm pitch, 29.6 mm modules). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, a) {
    var e = document.createElementNS(NS, tag);
    if (a) for (var k in a) { if (a[k] === null || a[k] === undefined) continue; e.setAttribute(k, a[k]); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function rect(x, y, w, h, a) { a = a || {}; var r = a.r; delete a.r; return el('rect', Object.assign({ x: x, y: y, width: w, height: h, rx: r, ry: r }, a)); }
  function circ(cx, cy, r, a) { return el('circle', Object.assign({ cx: cx, cy: cy, r: r }, a)); }
  function txt(s, x, y, a) { var t = el('text', Object.assign({ x: x, y: y }, a)); t.textContent = s; return t; }
  function path(d, a) { return el('path', Object.assign({ d: d }, a)); }
  function g(a) { var e = el('g', a); for (var i = 1; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]); return e; }

  var PORTS = [[25, 25], [60, 25], [95, 25], [130, 25], [25, 60], [60, 60], [95, 60], [130, 60]];
  var uid = 0;

  /* ------------------------------------------------------------------------------------------------ the four directions */
  var STYLES = {
    A: {
      key: 'A', name: 'Flat · как в Tinkercad', tag: 'светлая сцена, плоские фигуры, чёрные платы с цветным «уголком» (как micro:bit)',
      scene: '#f3f5f8', grid: '#e7ebf1', ink: '#1d2a44', sub: '#7d8aa0',
      board: { fill: '#ffffff', stroke: '#3d8fe0', sw: 0.9, shadow: 'soft', inner: null, pocket: '#eef2f7', pocketStroke: '#cfd8e3', win: '#2a2d33', pin: '#e0b840', label: '#8d9ab0', brand: '#3d8fe0', font: 'Arial, Helvetica, sans-serif' },
      mod: { pcb: '#1c1c1f', stroke: '#000', sw: 0.2, r: 3.6, accent: 'tri', shadow: false, label: '#ffffff', labelFont: 'Arial, Helvetica, sans-serif', labelWeight: 800, outline: false, ring: '#e0b840', hole: '#f3f5f8', silk: '#c9ced6' },
      colors: { button: '#2fc79a', pot: '#3d8fe0', rgb: '#e8264f' },
      comp: { btnBody: '#c9ced6', btnCap: '#2b2d33', btnRing: '#9aa1ad', knob: '#4f90d6', knobRing: '#22252b', pointer: '#0f2342', lens: '#f3f3ef' },
      swatches: ['#ffffff', '#3d8fe0', '#1c1c1f', '#2fc79a', '#e8264f', '#e0b840']
    },
    B: {
      key: 'B', name: 'Toy · конструктор', tag: 'для детей: толстый контур, цветные платы-кубики по типу модуля, «наклейка»-тень',
      scene: '#fff4dc', grid: '#ffe9bd', ink: '#232a55', sub: '#8a8fb5',
      board: { fill: '#fffdf8', stroke: '#232a55', sw: 1.3, shadow: 'hard', inner: null, pocket: '#e6e9ff', pocketStroke: '#232a55', pocketSw: 0.7, win: '#232a55', pin: '#ffcf3f', label: '#232a55', brand: '#ff6b57', font: '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", Arial, sans-serif' },
      mod: { pcb: null, stroke: '#232a55', sw: 1.1, r: 5.2, accent: 'full', shadow: 'hard', label: '#232a55', labelFont: '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", Arial, sans-serif', labelWeight: 900, outline: true, ring: '#232a55', hole: '#fffdf8', silk: '#232a55' },
      colors: { button: '#ffcf3f', pot: '#5ec8ff', rgb: '#ff8fb5' },
      comp: { btnBody: '#ffffff', btnCap: '#ff5a4f', btnRing: '#232a55', knob: '#ffffff', knobRing: '#232a55', pointer: '#ff5a4f', lens: '#ffffff' },
      swatches: ['#fffdf8', '#232a55', '#ffcf3f', '#5ec8ff', '#ff8fb5', '#ff5a4f']
    },
    C: {
      key: 'C', name: 'Blueprint · тёмная техно', tag: 'тёмная тема: графит и неон, чертёжные линии; хорошо для вечернего режима и «взрослых» наборов',
      scene: '#0b1426', grid: '#13213d', ink: '#e4eeff', sub: '#6f86ad',
      board: { fill: '#111c33', stroke: '#2f5aa8', sw: 0.9, shadow: 'glow', inner: '#1b2d52', pocket: '#0a1222', pocketStroke: '#19c3ff', pocketSw: 0.4, win: '#050912', pin: '#ffc857', label: '#6f86ad', brand: '#19c3ff', font: 'Consolas, "Cascadia Mono", "Courier New", monospace' },
      mod: { pcb: '#0e1a30', stroke: '#19c3ff', sw: 0.5, r: 3.2, accent: 'band', shadow: false, label: '#e4eeff', labelFont: 'Consolas, "Cascadia Mono", "Courier New", monospace', labelWeight: 700, outline: true, ring: '#19c3ff', hole: '#0a1222', silk: '#4d6a9c' },
      colors: { button: '#2ee59d', pot: '#19c3ff', rgb: '#ff5d9a' },
      comp: { btnBody: '#16294d', btnCap: '#0a1222', btnRing: '#2ee59d', knob: '#0a1222', knobRing: '#19c3ff', pointer: '#19c3ff', lens: '#e4eeff' },
      swatches: ['#0b1426', '#111c33', '#19c3ff', '#2ee59d', '#ff5d9a', '#ffc857']
    },
    D: {
      key: 'D', name: 'Brand · фирменная q.bit', tag: 'белый матовый корпус, тёмно-синие платы, оранжевые и голубые акценты, мягкие тени: ближе к будущему продукту',
      scene: '#e9eff7', grid: '#dde6f2', ink: '#0f2347', sub: '#6d7f9e',
      board: { fill: 'url(#D-lid)', stroke: '#b7c4d8', sw: 0.5, shadow: 'deep', inner: '#ffffff', pocket: '#d6deea', pocketStroke: '#b3c0d3', win: '#161b26', pin: '#e3b93f', label: '#8696b0', brand: '#19a8e6', font: 'Inter, "Segoe UI", Arial, sans-serif' },
      mod: { pcb: '#0f2347', stroke: '#091a36', sw: 0.3, r: 3.6, accent: 'pill', shadow: 'soft', label: '#ffffff', labelFont: 'Inter, "Segoe UI", Arial, sans-serif', labelWeight: 800, outline: false, ring: '#e3b93f', hole: '#d6deea', silk: '#b9c6e0' },
      colors: { button: '#ffab2e', pot: '#19c3ff', rgb: '#7c6bff' },
      comp: { btnBody: '#e5eaf2', btnCap: '#ffab2e', btnRing: '#b9c4d6', knob: '#f2f5fa', knobRing: '#1b2f57', pointer: '#ffab2e', lens: '#f6f7f4' },
      swatches: ['#f4f7fb', '#0f2347', '#ffab2e', '#19c3ff', '#7c6bff', '#e3b93f']
    }
  };

  /* ------------------------------------------------------------------------------------------------ defs */
  function defs(st) {
    var k = st.key;
    return el('defs', null,
      el('linearGradient', { id: k + '-lid', x1: 0, y1: 0, x2: 0.3, y2: 1 }, el('stop', { offset: 0, 'stop-color': '#ffffff' }), el('stop', { offset: 0.6, 'stop-color': '#eef2f8' }), el('stop', { offset: 1, 'stop-color': '#dfe6f0' })),
      el('radialGradient', { id: k + '-glow' }, el('stop', { offset: 0, 'stop-color': '#3df08a', 'stop-opacity': 0.85 }), el('stop', { offset: 0.5, 'stop-color': '#3df08a', 'stop-opacity': 0.35 }), el('stop', { offset: 1, 'stop-color': '#3df08a', 'stop-opacity': 0 })),
      el('radialGradient', { id: k + '-dome', cx: '38%', cy: '32%', r: '75%' }, el('stop', { offset: 0, 'stop-color': '#ffffff' }), el('stop', { offset: 1, 'stop-color': '#c9d1de' })),
      el('linearGradient', { id: k + '-plug', x1: 0, y1: 0, x2: 0, y2: 1 }, el('stop', { offset: 0, 'stop-color': '#f3f6fa' }), el('stop', { offset: 1, 'stop-color': '#aeb7c4' }))
    );
  }

  /* ------------------------------------------------------------------------------------------------ module bodies */
  function accentFor(st, id) { return st.colors[id]; }

  function moduleBase(st, id, label) {
    var m = st.mod, S = 29.6, h = S / 2, acc = accentFor(st, id), clip = 'clip' + (++uid);
    var pcb = m.accent === 'full' ? acc : m.pcb;
    var root = g();
    if (m.shadow === 'hard') root.appendChild(rect(-h + 1.3, -h + 1.5, S, S, { r: m.r, fill: st.ink, opacity: 0.2 }));
    if (m.shadow === 'soft') {
      root.appendChild(rect(-h - 0.2, -h + 0.9, S + 0.4, S + 0.4, { r: m.r + 0.3, fill: '#0b1a35', opacity: 0.12 }));
      root.appendChild(rect(-h - 0.6, -h + 1.8, S + 1.2, S + 1.2, { r: m.r + 0.8, fill: '#0b1a35', opacity: 0.07 }));
    }
    root.appendChild(el('clipPath', { id: clip }, rect(-h, -h, S, S, { r: m.r })));
    root.appendChild(rect(-h, -h, S, S, { r: m.r, fill: pcb, stroke: m.stroke, 'stroke-width': m.sw }));
    var deco = g({ 'clip-path': 'url(#' + clip + ')' });
    if (m.accent === 'tri') {
      deco.appendChild(el('polygon', { points: [-h, -h, -2.5, -h, -h, -2.5].join(' '), fill: acc }));
      deco.appendChild(el('polygon', { points: [-1.2, -h, 2.4, -h, -h, 2.4, -h, -1.2].join(' '), fill: acc }));
      deco.appendChild(el('polygon', { points: [3.8, -h, 5.6, -h, -h, 5.6, -h, 3.8].join(' '), fill: acc }));
    } else if (m.accent === 'band') {
      deco.appendChild(rect(-h, -h, S, 4.2, { fill: acc, opacity: 0.9 }));
      deco.appendChild(rect(-h, -h + 4.2, S, 0.5, { fill: '#fff', opacity: 0.25 }));
    } else if (m.accent === 'pill') {
      deco.appendChild(rect(-h, -h, 6, S, { fill: acc }));
      deco.appendChild(rect(-h + 6, -h, 0.7, S, { fill: '#fff', opacity: 0.25 }));
    } else if (m.accent === 'full') {
      deco.appendChild(rect(-h + 1.4, -h + 1.4, S - 2.8, S - 2.8, { r: m.r - 1.2, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 0.7 }));
      deco.appendChild(path('M' + (-h + 3) + ' ' + (-h + 2) + 'H' + (h - 7), { stroke: '#fff', 'stroke-opacity': 0.7, 'stroke-width': 1.3, 'stroke-linecap': 'round' }));
    }
    root.appendChild(deco);
    // corner mounting holes with a gold / dark ring
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      root.appendChild(circ(c[0] * 12.4, c[1] * 12.4, 2.05, { fill: m.hole, stroke: m.ring, 'stroke-width': m.accent === 'full' ? 0.9 : 0.8 }));
    });
    // label + tiny brand
    var lblCol = m.label;
    if (m.accent === 'tri') root.appendChild(txt(label, 0, 11.6, { 'text-anchor': 'middle', fill: lblCol, 'font-size': 3.8, 'font-weight': m.labelWeight, 'font-family': m.labelFont, 'letter-spacing': 0.4 }));
    else if (m.accent === 'pill') {
      root.appendChild(rect(-6.0, 8.6, 14.4, 4.8, { r: 2.4, fill: acc }));
      root.appendChild(txt(label, 1.2, 12.1, { 'text-anchor': 'middle', fill: id === 'button' ? '#3a2400' : '#fff', 'font-size': 3.4, 'font-weight': m.labelWeight, 'font-family': m.labelFont, 'letter-spacing': 0.3 }));
    } else root.appendChild(txt(label, 0, 11.7, { 'text-anchor': 'middle', fill: lblCol, 'font-size': 3.9, 'font-weight': m.labelWeight, 'font-family': m.labelFont, 'letter-spacing': 0.35 }));
    var tiny = m.accent === 'tri' ? '#9aa1ad' : m.accent === 'full' ? st.ink : st.sub;
    root.appendChild(txt('q.bit', 6.0, -11.4, { 'text-anchor': 'middle', fill: m.accent === 'full' ? st.ink : '#c9d4ea', 'font-size': 2.9, 'font-weight': 800, 'font-style': 'italic', 'font-family': 'Arial, sans-serif', opacity: 0.9 }));
    // SMD parts on the left, same on every variant (they are not the point of the study)
    var smd = st.key === 'B' ? '#ffffff' : st.key === 'C' ? '#16294d' : '#d4d8de';
    var smdStroke = st.key === 'B' ? st.ink : st.key === 'C' ? '#19c3ff' : null;
    [[-10.2, 3.6], [-10.2, 6.6]].forEach(function (p) {
      root.appendChild(rect(p[0] - 1.6, p[1] - 0.8, 3.2, 1.6, { r: 0.3, fill: smd, stroke: smdStroke, 'stroke-width': smdStroke ? 0.25 : 0 }));
    });
    return root;
  }

  function bodyStroke(st, w) { return st.mod.outline ? { stroke: st.key === 'C' ? '#19c3ff' : st.ink, 'stroke-width': w || 0.7 } : {}; }

  function buttonModule(st) {
    var c = st.comp, root = moduleBase(st, 'button', 'BUTTON');
    var body = rect(-5.4, -7.4, 10.8, 10.8, Object.assign({ r: 1.6, fill: c.btnBody }, bodyStroke(st)));
    root.appendChild(body);
    [[-5.4, -4.6], [-5.4, 0.6], [5.4, -4.6], [5.4, 0.6]].forEach(function (p) { root.appendChild(rect(p[0] - (p[0] < 0 ? 1.6 : -0.0), p[1] - 0.5, 1.6, 1.1, { r: 0.3, fill: st.key === 'C' ? '#2ee59d' : '#9aa1ad' })); });
    root.appendChild(circ(0, -2, 4.4, Object.assign({ fill: c.btnRing === c.btnBody ? '#fff' : 'none', stroke: c.btnRing, 'stroke-width': st.key === 'B' ? 0.9 : 0.7 })));
    root.appendChild(circ(0, -2, 3.3, Object.assign({ fill: c.btnCap }, st.key === 'B' ? { stroke: st.ink, 'stroke-width': 0.9 } : st.key === 'C' ? { stroke: '#2ee59d', 'stroke-width': 0.5 } : {})));
    if (st.key === 'B') root.appendChild(path('M-1.9 -3.4a2.6 2.6 0 0 1 2.6 -1', { fill: 'none', stroke: '#fff', 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.8 }));
    if (st.key === 'D' || st.key === 'A') root.appendChild(path('M-2.2 -3.6a2.7 2.7 0 0 1 3 -1.1', { fill: 'none', stroke: '#fff', 'stroke-width': 0.7, 'stroke-linecap': 'round', opacity: 0.55 }));
    return root;
  }

  function potModule(st) {
    var c = st.comp, root = moduleBase(st, 'pot', 'POT');
    var cx = 0, cy = -1.6, R = 9.4;
    // scale ticks, 270 degrees
    for (var i = 0; i <= 10; i++) {
      var a = (-225 + i * 27) * Math.PI / 180, r0 = R + 0.5, r1 = R + (i % 5 === 0 ? 2.1 : 1.4);
      root.appendChild(el('line', { x1: cx + Math.cos(a) * r0, y1: cy + Math.sin(a) * r0, x2: cx + Math.cos(a) * r1, y2: cy + Math.sin(a) * r1, stroke: st.mod.silk, 'stroke-width': i % 5 === 0 ? 0.6 : 0.4, 'stroke-linecap': 'round' }));
    }
    var fs = { 'font-size': 2.6, 'font-weight': 700, fill: st.mod.silk, 'font-family': st.mod.labelFont };
    root.appendChild(txt('0', -7.2, 8.9, Object.assign({ 'text-anchor': 'middle' }, fs)));
    root.appendChild(txt('10', 7.6, 8.9, Object.assign({ 'text-anchor': 'middle' }, fs)));
    root.appendChild(circ(cx, cy, R, Object.assign({ fill: c.knobRing }, st.key === 'C' ? { stroke: '#19c3ff', 'stroke-width': 0.5 } : st.key === 'B' ? { stroke: st.ink, 'stroke-width': 1 } : {})));
    var knobFill = st.key === 'A' ? c.knob : st.key === 'D' ? c.knob : c.knob;
    root.appendChild(circ(cx, cy, R - 2.2, Object.assign({ fill: knobFill }, st.key === 'B' ? { stroke: st.ink, 'stroke-width': 0.9 } : st.key === 'C' ? { stroke: '#19c3ff', 'stroke-width': 0.4 } : {})));
    if (st.key === 'A') root.appendChild(circ(cx, cy, R - 4.4, { fill: '#6aa6e6', opacity: 0.55 }));
    if (st.key === 'D') root.appendChild(circ(cx, cy, R - 4.6, { fill: '#e2e8f1' }));
    if (st.key === 'C') root.appendChild(circ(cx, cy, R - 4.4, { fill: 'none', stroke: '#19c3ff', 'stroke-width': 0.3, 'stroke-dasharray': '0.8 0.8' }));
    var a2 = -50 * Math.PI / 180;
    root.appendChild(el('line', { x1: cx + Math.cos(a2) * 1.2, y1: cy + Math.sin(a2) * 1.2, x2: cx + Math.cos(a2) * (R - 2.6), y2: cy + Math.sin(a2) * (R - 2.6), stroke: c.pointer, 'stroke-width': st.key === 'B' ? 1.8 : 1.4, 'stroke-linecap': 'round' }));
    root.appendChild(circ(cx, cy, 1.1, { fill: c.pointer }));
    return root;
  }

  function rgbModule(st) {
    var c = st.comp, root = moduleBase(st, 'rgb', 'RGB');
    root.appendChild(circ(0, -2, 13, { fill: 'url(#' + st.key + '-glow)', 'pointer-events': 'none' }));
    root.appendChild(rect(-4.4, -6.4, 8.8, 8.8, Object.assign({ r: 1.4, fill: c.lens }, bodyStroke(st))));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { root.appendChild(rect(q[0] * 5.7 - 0.9, q[1] * 3.2 - 2 - 0.5, 1.8, 1.0, { r: 0.25, fill: st.key === 'C' ? '#ffc857' : '#9aa1ad' })); });
    root.appendChild(circ(0, -2, 3.2, Object.assign({ fill: '#46f08a' }, st.key === 'B' ? { stroke: st.ink, 'stroke-width': 0.8 } : st.key === 'C' ? { stroke: '#e4eeff', 'stroke-width': 0.35 } : {})));
    root.appendChild(circ(-0.9, -3.1, 1.1, { fill: '#fff', opacity: 0.65 }));
    return root;
  }

  var MODULES = { button: buttonModule, pot: potModule, rgb: rgbModule };

  /* ------------------------------------------------------------------------------------------------ the main board */
  function usbPlug(st, ux) {
    var root = g();
    var cable = st.key === 'C' ? '#2a3550' : '#15171c';
    root.appendChild(path('M' + ux + ' -12 C' + ux + ' -22 ' + (ux + 9) + ' -24 ' + (ux + 9) + ' -33', { fill: 'none', stroke: cable, 'stroke-width': 4.4, 'stroke-linecap': 'round' }));
    if (st.key === 'B') root.appendChild(path('M' + ux + ' -12 C' + ux + ' -22 ' + (ux + 9) + ' -24 ' + (ux + 9) + ' -33', { fill: 'none', stroke: st.ink, 'stroke-width': 5.8, 'stroke-linecap': 'round', opacity: 0.0 }));
    // ribbed boot + metal tip, like the micro-USB plug in the references
    var boot = '#17191f', rib = '#2c3038';
    if (st.key === 'B') { boot = '#ff6b57'; rib = '#c8402f'; }
    if (st.key === 'C') { boot = '#1b2640'; rib = '#2f5aa8'; }
    if (st.key === 'D') { boot = '#1b2236'; rib = '#33415f'; }
    root.appendChild(path('M' + (ux - 2.6) + ' -17 h5.2 l1.2 6 h-7.6 z', { fill: boot }));
    root.appendChild(rect(ux - 4.6, -13, 9.2, 8.4, Object.assign({ r: 1.6, fill: boot }, st.key === 'B' ? { stroke: st.ink, 'stroke-width': 0.9 } : {})));
    [-2.4, 0, 2.4].forEach(function (d) { root.appendChild(rect(ux - 3.2, -11.4 + d + 2.4, 6.4, 0.8, { r: 0.4, fill: rib })); });
    root.appendChild(rect(ux - 4.0, -5.0, 8.0, 5.0, Object.assign({ r: 0.8, fill: 'url(#' + st.key + '-plug)' }, st.key === 'B' ? { stroke: st.ink, 'stroke-width': 0.8 } : { stroke: '#8b94a3', 'stroke-width': 0.25 })));
    root.appendChild(rect(ux - 2.2, -3.6, 4.4, 3.4, { r: 0.5, fill: '#1a1d24' }));
    return root;
  }

  function pocket(st, n, x, y, empty) {
    var b = st.board, root = g({ transform: 'translate(' + x + ' ' + y + ')' });
    var r = 4.2;
    if (b.shadow === 'deep') root.appendChild(rect(-15, -15, 30, 30, { r: r, fill: '#b3c0d3', opacity: 0.0 }));
    root.appendChild(rect(-15, -15, 30, 30, { r: r, fill: b.pocket, stroke: b.pocketStroke, 'stroke-width': b.pocketSw || 0.35 }));
    if (st.key === 'D') {   // soft inner shadow
      root.appendChild(rect(-15, -15, 30, 30, { r: r, fill: 'none', stroke: '#8fa0ba', 'stroke-opacity': 0.35, 'stroke-width': 1.4, 'clip-path': null }));
      root.appendChild(path('M-14.5 -9 V-10.8 a4 4 0 0 1 4 -4 H10.8', { fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.0 }));
    }
    if (st.key === 'C') root.appendChild(rect(-15, -15, 30, 30, { r: r, fill: 'none', stroke: '#19c3ff', 'stroke-opacity': 0.15, 'stroke-width': 2.2 }));
    if (st.key === 'B') root.appendChild(rect(-15, -15, 30, 30, { r: r, fill: 'none', stroke: st.ink, 'stroke-width': 0.5, 'stroke-dasharray': '1.6 1.4', opacity: 0 }));
    // the connector window: five pogo pins and two magnets
    root.appendChild(rect(-11.2, -2.15, 22.4, 4.3, { r: 2.1, fill: b.win }));
    for (var i = 0; i < 5; i++) root.appendChild(circ((i - 2) * 2.54, 0, 0.7, { fill: b.pin }));
    [-1, 1].forEach(function (s) {
      root.appendChild(circ(s * 9.3, 0, 1.3, { fill: st.key === 'C' ? '#2f5aa8' : '#c3cad4', stroke: st.key === 'B' ? st.ink : null, 'stroke-width': 0.4 }));
    });
    // port label + status dot
    root.appendChild(txt('P' + n, -14.8, -16.6, { 'font-size': 2.9, 'font-weight': 800, fill: b.label, 'font-family': b.font }));
    root.appendChild(circ(-8.0, -17.5, 1.0, { fill: empty ? (st.key === 'C' ? '#2d4a7d' : '#b9c4d6') : '#2ee59d' }));
    return root;
  }

  function board(st, mods) {
    var b = st.board, W = 155, H = 85, root = g({ 'font-family': b.font });
    // shadows
    if (b.shadow === 'soft') [[6, 0.05], [3.4, 0.06], [1.6, 0.08]].forEach(function (l) { root.appendChild(rect(-1.9 - l[0] + 0.5, 1.6 - l[0] + 2, W + 3.8 + 2 * l[0] - 1, H + 3.8 + 2 * l[0] - 1, { r: 15.9 + l[0], fill: '#1d3a63', opacity: l[1] })); });
    if (b.shadow === 'deep') [[9, 0.05], [6, 0.06], [3.6, 0.08], [1.8, 0.1], [0.7, 0.14]].forEach(function (l) { root.appendChild(rect(-1.9 - l[0], 2.4 - l[0], W + 3.8 + 2 * l[0], H + 3.8 + 2 * l[0], { r: 15.9 + l[0], fill: '#14284a', opacity: l[1] })); });
    if (b.shadow === 'hard') root.appendChild(rect(-1.9 + 2.2, -1.9 + 2.6, W + 3.8, H + 3.8, { r: 15.9, fill: st.ink, opacity: 0.22 }));
    if (b.shadow === 'glow') [[5, 0.05], [3, 0.07], [1.4, 0.1]].forEach(function (l) { root.appendChild(rect(-1.9 - l[0], -1.9 - l[0], W + 3.8 + 2 * l[0], H + 3.8 + 2 * l[0], { r: 15.9 + l[0], fill: '#19c3ff', opacity: l[1] * 0.6 })); });
    root.appendChild(rect(-1.9, -1.9, W + 3.8, H + 3.8, { r: 15.9, fill: b.fill, stroke: b.stroke, 'stroke-width': b.sw }));
    if (b.inner) root.appendChild(rect(-0.4, -0.4, W + 0.8, H + 0.8, { r: 14.4, fill: 'none', stroke: b.inner, 'stroke-width': st.key === 'C' ? 0.5 : 0.7 }));
    if (st.key === 'B') root.appendChild(rect(1.2, 1.2, W - 2.4, H - 2.4, { r: 12.8, fill: 'none', stroke: '#ffcf3f', 'stroke-width': 1.2, 'stroke-dasharray': '0.1 3', 'stroke-linecap': 'round' }));
    if (st.key === 'A') root.appendChild(rect(1.0, 1.0, W - 2.0, H - 2.0, { r: 13, fill: 'none', stroke: '#3d8fe0', 'stroke-opacity': 0.18, 'stroke-width': 0.4 }));
    // mounting screws
    [[7, 7], [148, 7], [7, 78], [148, 78]].forEach(function (p) {
      root.appendChild(circ(p[0], p[1], 2.1, { fill: st.scene, stroke: b.stroke, 'stroke-width': st.key === 'B' ? 0.9 : 0.5 }));
      if (st.key === 'D') root.appendChild(circ(p[0], p[1], 2.1, { fill: 'none', stroke: '#fff', 'stroke-width': 0.4, opacity: 0.9, transform: 'translate(0.3 0.4)' }));
    });
    // the front wall: USB-C opening, RESET and BOOT plungers
    var ux = 77.5;
    root.appendChild(rect(ux - 5.6, -2.0, 11.2, 2.8, { r: 1.2, fill: st.key === 'C' ? '#050912' : '#23262d' }));
    [['RESET', 67.7, '#e8523f'], ['BOOT', 87.3, '#4f7de0']].forEach(function (p) {
      root.appendChild(rect(p[1] - 2.5, -2.4, 5, 2.8, Object.assign({ r: 1, fill: p[2] }, st.key === 'B' ? { stroke: st.ink, 'stroke-width': 0.6 } : {})));
      root.appendChild(txt(p[0], p[1], 3.9, { 'text-anchor': 'middle', 'font-size': 2.1, 'font-weight': 800, fill: b.label, 'font-family': b.font, 'letter-spacing': 0.2 }));
    });
    // wifi mark and brand
    root.appendChild(g({ transform: 'translate(139 5.6) scale(.8)', fill: 'none', stroke: b.brand, 'stroke-width': 0.8, 'stroke-linecap': 'round', opacity: 0.7 },
      path('M-4 -1.6a5.8 5.8 0 0 1 8 0'), path('M-2.4 0.4a3.4 3.4 0 0 1 4.8 0'), circ(0, 2.6, 0.5, { fill: b.brand, stroke: 'none' })));
    root.appendChild(txt('q.bit', 10, 79.8, { 'font-size': st.key === 'B' ? 7.2 : 6.4, 'font-weight': 900, 'font-style': st.key === 'C' ? 'normal' : 'italic', fill: b.brand, 'font-family': st.key === 'C' ? b.font : 'Arial, sans-serif', opacity: st.key === 'D' ? 0.55 : 1 }));
    root.appendChild(txt('модульная плата', st.key === 'B' ? 31 : 29, 79.7, { 'font-size': 2.2, fill: b.label, 'letter-spacing': 0.5 }));
    // the pockets, then the three modules snapped in
    PORTS.forEach(function (p, i) { root.appendChild(pocket(st, i + 1, p[0], p[1], !mods[i])); });
    mods.forEach(function (m, i) {
      if (!m) return;
      var mm = MODULES[m](st);
      mm.setAttribute('transform', 'translate(' + PORTS[i][0] + ' ' + PORTS[i][1] + ')');
      root.appendChild(mm);
    });
    root.appendChild(usbPlug(st, ux));
    return root;
  }

  /* ------------------------------------------------------------------------------------------------ page */
  function scene(st, w, h, vb, content) {
    var svg = el('svg', { viewBox: vb, width: '100%', role: 'img', 'aria-label': st.name });
    svg.appendChild(defs(st));
    var pid = 'grid' + st.key + (++uid);
    svg.appendChild(el('pattern', { id: pid, width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, el('path', { d: 'M10 0H0V10', fill: 'none', stroke: st.grid, 'stroke-width': 0.35 })));
    var v = vb.split(' ').map(Number);
    svg.appendChild(rect(v[0], v[1], v[2], v[3], { fill: st.scene }));
    svg.appendChild(rect(v[0], v[1], v[2], v[3], { fill: 'url(#' + pid + ')' }));
    svg.appendChild(content);
    return svg;
  }

  function build() {
    var host = document.getElementById('variants');
    ['A', 'B', 'C', 'D'].forEach(function (k) {
      var st = STYLES[k];
      var card = document.createElement('section');
      card.className = 'card'; card.id = 'v' + k;
      var head = '<header><span class="badge">' + k + '</span><div><h2>' + st.name + '</h2><p>' + st.tag + '</p></div></header>';
      card.innerHTML = head;
      var big = document.createElement('div'); big.className = 'big';
      big.appendChild(scene(st, 0, 0, '-8 -35 171 135', board(st, ['button', 'pot', 'rgb'])));
      card.appendChild(big);
      var row = document.createElement('div'); row.className = 'row';
      ['button', 'pot', 'rgb'].forEach(function (id, i) {
        var cell = document.createElement('figure');
        var m = MODULES[id](st);
        cell.appendChild(scene(st, 0, 0, '-18 -18 36 36', m));
        var cap = document.createElement('figcaption'); cap.textContent = ['Кнопка', 'Потенциометр', 'RGB-светодиод'][i]; cell.appendChild(cap);
        row.appendChild(cell);
      });
      card.appendChild(row);
      var sw = document.createElement('div'); sw.className = 'sw';
      st.swatches.forEach(function (c) { var s = document.createElement('i'); s.style.background = c; s.title = c; sw.appendChild(s); });
      card.appendChild(sw);
      host.appendChild(card);
    });
  }
  build();
})();
