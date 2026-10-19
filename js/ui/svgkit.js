/* Tiny SVG / DOM helpers and the gradients every drawing shares. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var NS = 'http://www.w3.org/2000/svg';
  var seq = 0;

  // Blink invalidates style and paint even when setAttribute() stores the value that is already there, and the faces refresh dozens of
  // attributes every frame (87 % of those writes change nothing). Skipping the no-ops took the board from ~20 to 60 frames per second.
  var nativeSet = Element.prototype.setAttribute;
  SVGElement.prototype.setAttribute = function (name, value) {
    value = String(value);
    if (this.getAttribute(name) === value) return;
    nativeSet.call(this, name, value);
  };

  function apply(e, attrs) {
    if (!attrs) return e;
    for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'cls') e.setAttribute('class', v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    return e;
  }
  function add(e, kids) {
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) add(e, c); else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  function S(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    apply(e, attrs);
    return add(e, Array.prototype.slice.call(arguments, 2));
  }
  S.g = function (attrs) { return add(apply(document.createElementNS(NS, 'g'), attrs), Array.prototype.slice.call(arguments, 1)); };
  S.rect = function (x, y, w, h, a) {
    a = Object.assign({ x: x, y: y, width: w, height: h }, a);
    if (a.r !== undefined) { a.rx = a.r; delete a.r; }
    return apply(document.createElementNS(NS, 'rect'), a);
  };
  S.circle = function (cx, cy, r, a) { return apply(document.createElementNS(NS, 'circle'), Object.assign({ cx: cx, cy: cy, r: r }, a)); };
  S.ellipse = function (cx, cy, rx, ry, a) { return apply(document.createElementNS(NS, 'ellipse'), Object.assign({ cx: cx, cy: cy, rx: rx, ry: ry }, a)); };
  S.line = function (x1, y1, x2, y2, a) { return apply(document.createElementNS(NS, 'line'), Object.assign({ x1: x1, y1: y1, x2: x2, y2: y2 }, a)); };
  S.path = function (d, a) { return apply(document.createElementNS(NS, 'path'), Object.assign({ d: d }, a)); };
  S.poly = function (pts, a) { return apply(document.createElementNS(NS, 'polygon'), Object.assign({ points: pts }, a)); };
  S.text = function (str, x, y, a) { return apply(document.createElementNS(NS, 'text'), Object.assign({ x: x, y: y, text: str }, a)); };
  S.set = apply;
  S.uid = function (p) { return (p || 'u') + (++seq); };
  S.NS = NS;

  /** HTML element helper: h('div', {cls:'x', onclick: fn}, kids...) */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'cls') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    add(e, Array.prototype.slice.call(arguments, 2));
    return e;
  }

  /** gradients / filters used by the board, the modules and the tray */
  function installDefs(svg) {
    var lin = function (id, x1, y1, x2, y2, stops) {
      return S('linearGradient', { id: id, x1: x1, y1: y1, x2: x2, y2: y2 }, stops.map(function (s) { return S('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] === undefined ? 1 : s[2] }); }));
    };
    var rad = function (id, stops, a) {
      return S('radialGradient', Object.assign({ id: id }, a), stops.map(function (s) { return S('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] === undefined ? 1 : s[2] }); }));
    };
    // calm flat style: every "gradient" below is a single colour, so the faces stay vector-flat; only the soft glows are real gradients
    var flat = function (id, c, o) { return lin(id, 0, 0, 0, 1, [[0, c, o], [1, c, o]]); };
    var defs = S('defs', null,
      flat('g-brand', '#0c78d4'),
      flat('g-lid', '#2b2d32'),
      flat('g-lid-rim', '#2b2d32'),
      flat('g-pocket', '#222429'),
      flat('g-pocket-shade', '#000', 0),
      flat('g-pcb', '#101113'),
      flat('g-gold', '#dcb74e'),
      flat('g-metal', '#c9ced6'),
      flat('g-black', '#2b2d33'),
      flat('g-white', '#e8ebf0'),
      flat('g-housing', '#2b2d33'),
      flat('g-knob', '#2b2d33'),
      flat('g-dome', '#eef0f4'),
      flat('g-yellow', '#f2c94c'),
      flat('g-ball', '#c6ccd6'),
      flat('g-glass', '#fff', 0),
      // soft round shadow / mist: a radial gradient is far cheaper to repaint than a blur filter (the faces animate every frame)
      rad('g-shade', [[0, '#000', 0.4], [0.6, '#000', 0.25], [1, '#000', 0]], { cx: '50%', cy: '50%', r: '50%' }),
      rad('g-mist', [[0, '#e6f3ff', 0.7], [0.55, '#e6f3ff', 0.35], [1, '#e6f3ff', 0]], { cx: '50%', cy: '50%', r: '50%' })
    );
    svg.appendChild(defs);
  }

  Q.S = S;
  Q.h = h;
  Q.installDefs = installDefs;
  Q.COLORS = { gold: '#e7c14a', silver: '#c9ced6', black: '#17181b', white: '#eceef1', silk: '#f1ede2',
               led: { white: '#fff3d6', red: '#ff3b30', yellow: '#ffc800', green: '#2fe06b', blue: '#3b82ff' } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
