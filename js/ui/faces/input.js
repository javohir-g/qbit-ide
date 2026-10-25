/* Faces of the input modules: button, touch, switch, tilt, hall, pir, irrx, pot, slider, light, joystick, keypad, pulse. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var F = Q.Faces, P = Q.faceParts, S = Q.S, C = Q.COLORS, U = Q.util;

  function lerpHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), o = 0;
    for (var s = 16; s >= 0; s -= 8) {
      var ca = (pa >> s) & 255, cb = (pb >> s) & 255;
      o = (o << 8) | Math.round(ca + (cb - ca) * t);
    }
    return '#' + (o & 0xFFFFFF).toString(16).padStart(6, '0');
  }
  Q.lerpHex = lerpHex;

  /* ---------------------------------------------------------------- button */
  F.define('button', function (f) {
    f.base('BUTTON');
    var t = P.tact(f.root, 14.8, 12.6);
    f.hold(f.zone(7.6, 5.4, 14.4, 14.4, 3), function (v) { f.inst.set('pressed', v); });
    f.onUpdate(function () { t.press(f.inst.state.pressed); });
  });

  /* ---------------------------------------------------------------- touch */
  F.define('touch', function (f) {
    f.base('TOUCH');
    // the 9.6 mm electrode as on the board: copper under the white mask (a pale cream disc), the TTP223 right of it
    var cx = 14.85, cy = 10.85;
    f.add(S.circle(cx, cy, 4.8, { fill: '#ebe7dc', stroke: '#d6d0bf', 'stroke-width': 0.3 }));
    f.add(S.path('M' + (cx - 1.5) + ' ' + cy + 'a1.5 1.5 0 0 1 3 0M' + (cx - 2.5) + ' ' + cy + 'a2.5 2.5 0 0 1 5 0', { fill: 'none', stroke: C.silk, 'stroke-width': 0.3, 'stroke-opacity': 0.7 }));
    P.sot(f.root, 22.35, 10.65, 5);
    var glow = P.glow(f.root, cx, cy, 10, '#19c3ff');
    var ring = S.circle(cx, cy, 4.8, { fill: 'none', stroke: '#19c3ff', 'stroke-width': 0.6, opacity: 0 });
    f.add(ring);
    f.hold(f.zone(cx - 7, cy - 7, 14, 14, 7), function (v) { f.inst.set('touched', v); });
    f.bind(glow, 'opacity', function () { return f.inst.state.touched ? 0.9 : 0; });
    f.bind(ring, 'opacity', function () { return f.inst.state.touched ? 1 : 0; });
  });

  /* ---------------------------------------------------------------- switch */
  F.define('switch', function (f) {
    f.base('SWITCH');
    var cx = 14.8, cy = 12.6;
    f.add(S.rect(cx - 5.2, cy - 2.4, 10.4, 4.8, { r: 0.5, fill: 'url(#g-metal)', stroke: '#6f7885', 'stroke-width': 0.2 }));
    f.add(S.rect(cx - 3.6, cy - 0.9, 7.2, 1.8, { r: 0.9, fill: '#14161a' }));
    for (var i = 0; i < 3; i++) f.add(S.rect(cx - 3.3 + i * 3.3, cy + 2.4, 0.7, 1.1, { fill: C.silver }));
    var lever = S.g(null, S.rect(-1.5, -2.0, 3.0, 4.0, { r: 0.6, fill: 'url(#g-white)', stroke: '#8a93a1', 'stroke-width': 0.2 }),
                    S.line(-0.5, -1.0, -0.5, 1.0, { stroke: '#9aa3b0', 'stroke-width': 0.2 }), S.line(0.5, -1.0, 0.5, 1.0, { stroke: '#9aa3b0', 'stroke-width': 0.2 }));
    var lg = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' }, lever);
    f.add(lg);
    f.silk('ON', cx + 3.6, cy - 4.0, 1.8); f.silk('OFF', cx - 3.6, cy - 4.0, 1.8);
    f.tap(f.zone(cx - 7, cy - 6, 14, 12, 2), function () { f.inst.set('on', !f.inst.state.on); });
    var cur = f.inst.state.on ? 1 : 0;
    f.onUpdate(function (dt) {
      var tgt = f.inst.state.on ? 1 : 0;
      if (Math.abs(tgt - cur) > 0.002) { cur += (tgt - cur) * Math.min(1, dt * 22); lg.setAttribute('transform', 'translate(' + (cx + (cur - 0.5) * 3.8) + ' ' + cy + ')'); }
    });
    lg.setAttribute('transform', 'translate(' + (cx + (cur - 0.5) * 3.8) + ' ' + cy + ')');
  });

  /* ---------------------------------------------------------------- tilt */
  F.define('tilt', function (f) {
    f.base('TILT');
    var cx = 14.8, cy = 12.4;
    f.add(S.rect(cx - 6.4, cy - 2.2, 12.8, 4.4, { r: 2.2, fill: 'url(#g-black)', stroke: '#0a0b0d', 'stroke-width': 0.2 }));
    f.add(S.rect(cx - 6.6, cy - 2.3, 2.2, 4.6, { r: 1.0, fill: 'url(#g-metal)' }));
    f.add(S.rect(cx - 4.0, cy - 1.2, 8.8, 2.4, { r: 1.2, fill: '#0b0c0f', stroke: '#3a3d44', 'stroke-width': 0.15 }));
    P.pad(f.root, cx - 7.8, cy - 1.0, 0.7); P.pad(f.root, cx - 7.8, cy + 1.0, 0.7);
    var ball = S.circle(0, 0, 0.95, { fill: 'url(#g-ball)', stroke: '#4a5260', 'stroke-width': 0.1 });
    var bg = S.g({ transform: 'translate(' + (cx + 3) + ' ' + cy + ')' }, ball);
    f.add(bg);
    f.silk(T('наклон'), cx, cy + 6.6, 1.9);
    var bx = 3.2;
    f.tap(f.zone(cx - 8, cy - 5, 16, 10, 3), function () {
      var env = f.inst.board && f.inst.board.env;
      if (env) env.roll = Math.abs(env.roll) > 20 ? 0 : 50;
    });
    f.onUpdate(function (dt) {
      var env = f.inst.board && f.inst.board.env, up = !env || env.tiltDeg() < 30;
      var tgt = up ? 3.2 : -3.0;
      if (env && env.shakeLevel() > 0.05) tgt = Math.sin(f.t * 40) * 3.2;
      bx += (tgt - bx) * Math.min(1, dt * 14);
      bg.setAttribute('transform', 'translate(' + (cx + bx) + ' ' + cy + ')');
    });
  });

  /* ---------------------------------------------------------------- hall */
  F.define('hall', function (f) {
    f.base('HALL');
    var sx = 14.8, sy = 9.0;
    P.sot(f.root, sx, sy, 3);
    f.add(S.circle(sx, sy - 3.4, 0.01, { fill: 'none' }));
    f.silk('S  N', sx, sy + 4.2, 1.7);
    var led = S.rect(14.8 - 0.8, 14.6, 1.6, 0.8, { r: 0.1, fill: '#7a1c18', stroke: '#2a0907', 'stroke-width': 0.08 });
    f.add(led);
    var glow = P.glow(f.root, 14.8, 15.0, 7, '#ff3b30');
    // the magnet that is held over the sensor
    var mg = S.g({ transform: 'translate(14.8 9.2) rotate(-14)', opacity: 0, 'pointer-events': 'none' },
      S.rect(-7, -3, 14, 6, { r: 1.2, fill: '#fff', stroke: '#222', 'stroke-width': 0.3 }),
      S.path('M-7 -1.8Q-7 -3 -5.8 -3H0V3H-5.8Q-7 3 -7 1.8Z', { fill: '#e8353a' }),
      S.path('M7 -1.8Q7 -3 5.8 -3H0V3H5.8Q7 3 7 1.8Z', { fill: '#cfd6e0' }),
      S.text('N', -3.4, 1.0, { 'font-size': 3, 'font-weight': 800, fill: '#fff', 'text-anchor': 'middle', 'font-family': 'Arial' }),
      S.text('S', 3.4, 1.0, { 'font-size': 3, 'font-weight': 800, fill: '#222', 'text-anchor': 'middle', 'font-family': 'Arial' }));
    f.add(mg);
    f.hold(f.zone(6, 3.5, 18.5, 14.5, 3), function (v) { f.inst.set('magnet', v); });
    f.bind(glow, 'opacity', function () { return f.inst.state.magnet ? 1 : 0; });
    f.bind(led, 'fill', function () { return f.inst.state.magnet ? '#ff3b30' : '#7a1c18'; });
    f.bind(mg, 'opacity', function () { return f.inst.state.magnet ? 0.96 : 0; });
  });

  /* ---------------------------------------------------------------- pir */
  F.define('pir', function (f) {
    f.base('PIR');
    var cx = 14.8, cy = 8.6;                       // the AS312 where it sits on the board (icon left of it, logo above)
    f.add(S.circle(cx, cy, 4.0, { fill: 'url(#g-dome)', stroke: '#9aa3b2', 'stroke-width': 0.25 }));
    f.add(S.circle(cx, cy, 3.3, { fill: 'none', stroke: '#c5ccd8', 'stroke-width': 0.2 }));
    f.add(S.rect(cx - 1.7, cy - 1.25, 3.4, 2.5, { r: 0.3, fill: '#2a1b66', stroke: '#150d3a', 'stroke-width': 0.2 }));
    f.add(S.rect(cx - 1.45, cy - 1.0, 2.9, 0.9, { r: 0.25, fill: '#fff', 'fill-opacity': 0.18 }));
    var ring = S.circle(cx, cy, 5.4, { fill: 'none', stroke: '#ffb020', 'stroke-width': 0.7, opacity: 0 });
    var ring2 = S.circle(cx, cy, 5.4, { fill: 'none', stroke: '#ffb020', 'stroke-width': 0.4, opacity: 0 });
    f.add(ring, ring2);
    f.hold(f.zone(cx - 7, cy - 7, 14, 14, 7), function (v) { f.inst.set('motion', v); });
    f.onUpdate(function () {
      var h = f.inst.out.hold || 0;
      ring.setAttribute('opacity', h > 0 ? 0.5 + 0.5 * Math.sin(f.t * 9) : 0);
      ring2.setAttribute('r', h > 0 ? 5.4 + ((f.t * 6) % 3) : 5.4);
      ring2.setAttribute('opacity', h > 0 ? 0.6 - ((f.t * 6) % 3) / 5 : 0);
    });
  });

  /* ---------------------------------------------------------------- irrx */
  F.define('irrx', function (f) {
    f.base('IR RX');
    var cx = 14.8, cy = 11.6;
    f.add(S.rect(cx - 3.2, cy - 2.6, 6.4, 5.2, { r: 0.5, fill: 'url(#g-black)', stroke: '#050607', 'stroke-width': 0.2 }));
    f.add(S.circle(cx, cy - 0.2, 1.6, { fill: '#2a2d36', stroke: '#585d6b', 'stroke-width': 0.2 }));
    f.add(S.circle(cx - 0.4, cy - 0.7, 0.45, { fill: '#fff', opacity: 0.4 }));
    for (var i = 0; i < 4; i++) f.add(S.rect(cx - 2.6 + i * 1.7, cy + 2.6, 0.5, 0.9, { fill: C.silver }));
    f.silk('38 kHz', cx, cy + 6.2, 1.8);
    var glow = P.glow(f.root, cx, cy, 10, '#b06bff');
    f.bind(glow, 'opacity', function () { return (f.inst.out.burst || 0) > 0 ? 1 : 0; });
  });

  /* ---------------------------------------------------------------- pot */
  function knobAngle(p, cx, cy, cur) {
    var ang = Math.atan2(p.x - cx, -(p.y - cy)) / U.RAD;            // 0 = straight up, clockwise
    if (ang > 135) ang = cur > 0.5 ? 135 : -135;
    else if (ang < -135) ang = cur > 0.5 ? 135 : -135;
    return (ang + 135) / 270;
  }
  F.define('pot', function (f) {
    f.base('POT');
    var cx = 14.8, cy = 9.0;                       // up, like the RV09 on the board: the q.bit logo sits under the scale
    for (var i = 0; i <= 10; i++) {
      var a = (-135 + 27 * i) * U.RAD, r1 = 6.4, r2 = i % 5 === 0 ? 7.7 : 7.1;
      f.add(S.line(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1, cx + Math.sin(a) * r2, cy - Math.cos(a) * r2, { stroke: C.silk, 'stroke-width': 0.28, 'stroke-opacity': 0.85, 'stroke-linecap': 'round' }));
    }
    f.silk('0', cx - 5.6, cy + 7.4, 1.8); f.silk('10', cx + 5.8, cy + 7.4, 1.8);
    var k = P.knob(f.root, cx, cy, 4.3, 0);
    f.add(S.circle(cx, cy, 1.2, { fill: 'url(#g-metal)', opacity: 0.0 }));
    f.drag(f.zone(cx - 6.2, cy - 6.2, 12.4, 12.4, 6.2), {
      down: function (p) { f.inst.set('pos', knobAngle(p, cx, cy, f.inst.state.pos)); },
      move: function (p) { f.inst.set('pos', knobAngle(p, cx, cy, f.inst.state.pos)); },
      wheel: function (d) { f.inst.set('pos', U.clamp(f.inst.state.pos + d * 0.03, 0, 1)); }
    });
    f.bind(k.rot, 'transform', function () { return 'rotate(' + (-135 + 270 * f.inst.state.pos).toFixed(1) + ')'; });
  });

  /* ---------------------------------------------------------------- slider (65 mm) */
  F.define('slider', function (f) {
    f.base('SLIDER');
    var x0 = 17.3, trav = 30, y = 7.2;
    f.add(S.rect(x0 - 4.8, y - 4.6, trav + 9.6, 9.2, { r: 1.0, fill: 'url(#g-white)', stroke: '#8a93a1', 'stroke-width': 0.25 }));
    f.add(S.rect(x0 - 1.2, y - 1.0, trav + 2.4, 2.0, { r: 1.0, fill: '#0b0c0f', stroke: '#444a55', 'stroke-width': 0.15 }));
    for (var i = 0; i <= 10; i++) {
      var tx = x0 + trav * i / 10;
      f.add(S.line(tx, 12.6, tx, i % 5 === 0 ? 14.6 : 13.7, { stroke: C.silk, 'stroke-width': 0.28, 'stroke-opacity': 0.85 }));
    }
    f.silk('0', x0, 17.4, 1.9); f.silk('10', x0 + trav, 17.4, 1.9);
    var lever = S.g(null,
      S.rect(-2.4, -3.6, 4.8, 7.2, { r: 0.8, fill: 'url(#g-black)', stroke: '#050607', 'stroke-width': 0.2 }),
      S.line(0, -2.8, 0, 2.8, { stroke: '#e9edf3', 'stroke-width': 0.5, 'stroke-linecap': 'round' }),
      S.line(-1.3, -2.8, -1.3, 2.8, { stroke: '#555a66', 'stroke-width': 0.2 }), S.line(1.3, -2.8, 1.3, 2.8, { stroke: '#555a66', 'stroke-width': 0.2 }));
    var lg = S.g({ transform: 'translate(' + x0 + ' ' + y + ')' }, lever);
    f.add(lg);
    function setFrom(p) { f.inst.set('pos', U.clamp((p.x - x0) / trav, 0, 1)); }
    f.drag(f.zone(x0 - 5, y - 5, trav + 10, 10, 2), { down: setFrom, move: setFrom, wheel: function (d) { f.inst.set('pos', U.clamp(f.inst.state.pos + d * 0.04, 0, 1)); } });
    f.bind(lg, 'transform', function () { return 'translate(' + (x0 + trav * f.inst.state.pos).toFixed(2) + ' ' + y + ')'; });
  });

  /* ---------------------------------------------------------------- light */
  F.define('light', function (f) {
    f.base('LIGHT');
    var cx = 14.8, cy = 11.4;
    var halo = P.glow(f.root, cx, cy, 11, '#ffd34d');
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      f.add(S.line(cx + Math.cos(a) * 3.6, cy + Math.sin(a) * 3.6, cx + Math.cos(a) * 5.2, cy + Math.sin(a) * 5.2, { stroke: C.silk, 'stroke-width': 0.4, 'stroke-linecap': 'round', 'stroke-opacity': 0.9 }));
    }
    f.add(S.circle(cx, cy, 2.4, { fill: 'none', stroke: C.silk, 'stroke-width': 0.4 }));
    f.add(S.rect(cx - 0.9, cy - 0.5, 1.8, 1.0, { r: 0.15, fill: '#d68a2e', stroke: '#6b3d0a', 'stroke-width': 0.1 }));
    var shade = S.ellipse(cx, cy, 9.4, 8.2, { fill: 'url(#g-shade)', opacity: 0, 'pointer-events': 'none' });
    f.add(shade);
    f.hold(f.zone(cx - 8, cy - 8, 16, 16, 8), function (v) { f.inst.set('cover', v ? 0.95 : 0); });
    f.bind(halo, 'opacity', function () { var mv = f.inst.sigOut(); return mv === null ? 0 : Math.min(1, mv / 2900) * 0.7; });
    f.bind(shade, 'opacity', function () { return f.inst.state.cover * 0.8; });
  });

  /* ---------------------------------------------------------------- joystick */
  F.define('joystick', function (f) {
    f.base('JOY');
    var cx = 14.85, cy = 9.25, R = 2.4;            // the SKRH body (8.8 mm) where it sits on the board
    f.add(S.rect(cx - 4.4, cy - 4.4, 8.8, 8.8, { r: 0.8, fill: 'url(#g-black)', stroke: '#050607', 'stroke-width': 0.25 }));
    var cap = S.g(null, S.circle(0, 0, 3.4, { fill: 'url(#g-knob)', stroke: '#06070a', 'stroke-width': 0.25 }),
      S.circle(0, 0, 2.3, { fill: 'none', stroke: '#8c929e', 'stroke-width': 0.2, 'stroke-opacity': 0.6 }),
      S.circle(-0.6, -0.8, 0.9, { fill: '#fff', opacity: 0.22 }));
    var cg = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' }, cap);
    f.add(cg);
    var pushRing = S.circle(cx, cy, 4.2, { fill: 'none', stroke: '#19c3ff', 'stroke-width': 0.5, opacity: 0 });
    f.add(pushRing);
    function setFrom(p) {
      var dx = (p.x - cx) / R, dy = (p.y - cy) / R, m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      f.inst.set('dx', Math.round(dx * 100) / 100); f.inst.set('dy', Math.round(dy * 100) / 100);
    }
    f.drag(f.zone(cx - 4.8, cy - 4.8, 9.6, 9.6, 4.8), {
      down: function (p) { setFrom(p); },
      move: function (p, s) { if (Math.hypot(p.x - s.x, p.y - s.y) > 0.7) setFrom(p); },
      up: function (p, moved) {
        f.inst.set('dx', 0); f.inst.set('dy', 0);
        if (!moved) { f.inst.set('push', true); setTimeout(function () { f.inst.set('push', false); }, 180); }
      }
    });
    f.onUpdate(function () {
      var s = f.inst.state;
      cg.setAttribute('transform', 'translate(' + (cx + s.dx * R * 0.85).toFixed(2) + ' ' + (cy + s.dy * R * 0.85 + (s.push ? 0.25 : 0)).toFixed(2) + ') scale(' + (s.push ? 0.94 : 1) + ')');
      pushRing.setAttribute('opacity', s.push ? 1 : 0);
    });
  });

  /* ---------------------------------------------------------------- keypad (65 mm) */
  F.define('keypad', function (f) {
    f.base('KEYS');
    var xs = [14.35, 26.35, 38.35, 50.35], y = 8.55, tacts = [];       // the four keys as on the board; their numbers are in the print
    xs.forEach(function (x, i) {
      tacts.push(P.tact(f.root, x, y));
      f.hold(f.zone(x - 5, y - 4.5, 10, 10, 2), function (v) { Q.moduleDef('keypad').setKey(f.inst, i, v); });
    });
    f.onUpdate(function () { tacts.forEach(function (t, i) { t.press(f.inst.state.keys[i]); }); });
  });

  /* ---------------------------------------------------------------- pulse */
  F.define('pulse', function (f) {
    f.base('PULSE');
    var cx = 14.8, cy = 12.2;
    f.add(S.ellipse(cx, cy, 8.4, 5.6, { fill: 'none', stroke: C.silk, 'stroke-width': 0.3, 'stroke-dasharray': '1 0.8', 'stroke-opacity': 0.7 }));
    P.smd(f.root, 11.4, cy, 1.6, 0.8, 0, '#d9f5df');
    P.smd(f.root, 18.2, cy, 1.6, 0.8, 0, '#d68a2e');
    P.sot(f.root, 22.8, 8.0, 5);
    var glow = P.glow(f.root, 11.4, cy, 9, '#3dff7a');
    var heart = S.path('M0 1.4C-3 -1 -1.8 -3 0 -1.4C1.8 -3 3 -1 0 1.4Z', { fill: '#ff4d6d', opacity: 0 });
    var hg = S.g({ transform: 'translate(' + cx + ' 5.4) scale(0.8)' }, heart);
    f.add(hg);
    var finger = S.g({ opacity: 0, 'pointer-events': 'none', transform: 'translate(' + cx + ' ' + (cy + 0.2) + ') rotate(-8)' },
      S.rect(-8.6, -4.2, 17.2, 8.4, { r: 4.2, fill: '#f0b497', stroke: '#c98466', 'stroke-width': 0.3 }),
      S.ellipse(2.6, -1.6, 3.6, 1.8, { fill: '#fff', opacity: 0.18 }));
    f.add(finger);
    f.hold(f.zone(cx - 9, cy - 6.5, 18, 13, 5), function (v) { f.inst.set('finger', v); });
    f.bind(glow, 'opacity', function () { return f.inst.powered ? (f.inst.state.finger ? 0.55 : 0.8) : 0; });
    f.bind(finger, 'opacity', function () { return f.inst.state.finger ? 0.88 : 0; });
    f.onUpdate(function () {
      var on = f.inst.state.finger;
      heart.setAttribute('opacity', on ? 1 : 0);
      if (on) { var s = 0.8 + 0.35 * Math.max(0, Q.mod.ppg(f.inst.out.phase)); hg.setAttribute('transform', 'translate(' + cx + ' 5.4) scale(' + s.toFixed(2) + ')'); }
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
