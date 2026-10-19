/* Faces of the sensor / smart modules: temphum, pressure, color, imu, compass, rtc, airq, gesture, ultrasonic, encoder, rfid,
   proto2 and the debug modules. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var F = Q.Faces, P = Q.faceParts, S = Q.S, C = Q.COLORS, U = Q.util;

  function env(f) { return f.inst.board && f.inst.board.env; }
  function lga(f, cx, cy, w, h, color) {
    f.add(S.rect(cx - w / 2, cy - h / 2, w, h, { r: 0.2, fill: color || 'url(#g-black)', stroke: '#000', 'stroke-width': 0.12 }));
    f.add(S.circle(cx - w / 2 + 0.5, cy - h / 2 + 0.5, 0.2, { fill: '#6b7280' }));
  }

  /* ---------------------------------------------------------------- temphum */
  F.define('temphum', function (f) {
    f.base('T / RH');
    var cx = 14.8, cy = 9.4;
    f.add(S.rect(cx - 1.8, cy - 1.8, 3.6, 3.6, { r: 0.3, fill: '#d8d3c4', stroke: '#7a7462', 'stroke-width': 0.15 }));
    f.add(S.circle(cx + 0.2, cy, 1.0, { fill: '#c9a227', stroke: '#6b5410', 'stroke-width': 0.12 }), S.circle(cx - 0.2, cy - 0.4, 0.3, { fill: '#fff', opacity: 0.6 }));
    P.smd(f.root, 9.6, 8.4, 1.0, 0.55, 90); P.smd(f.root, 20.0, 8.4, 1.0, 0.55, 90); P.smd(f.root, 22.0, 12.4, 1.0, 0.55, 0);
    f.silk('0x38', 22.4, 17.6, 1.7);
    // therm icon
    f.add(S.path('M7.2 15.6V11.4a1.1 1.1 0 0 1 2.2 0V15.6a2 2 0 1 1-2.2 0Z', { fill: 'none', stroke: C.silk, 'stroke-width': 0.3, 'stroke-opacity': 0.75 }));
    var mist = S.g({ opacity: 0, 'pointer-events': 'none' },
      S.circle(cx - 3.0, cy + 0.2, 4.2, { fill: 'url(#g-mist)' }),
      S.circle(cx + 2.4, cy - 0.8, 4.8, { fill: 'url(#g-mist)' }),
      S.circle(cx, cy + 2.2, 4.6, { fill: 'url(#g-mist)' }));
    f.add(mist);
    f.hold(f.zone(cx - 6.5, cy - 5.5, 13, 11, 4), function (v) { f.inst.set('warm', v); });
    f.bind(mist, 'opacity', function () { return f.inst.state.warm ? 1 : 0; });
  });

  /* ---------------------------------------------------------------- pressure */
  F.define('pressure', function (f) {
    f.base('hPa 0x76');
    lga(f, 14.8, 9.6, 3.2, 3.2, '#a9aeb8');
    f.add(S.circle(14.8, 9.6, 0.7, { fill: '#1b1d22' }));
    P.smd(f.root, 9.8, 9.0, 1.0, 0.55, 90); P.smd(f.root, 19.8, 9.0, 1.0, 0.55, 90);
    f.add(S.path('M18.8 14.4a5 5 0 0 1 8 0M20.6 16.6a2.6 2.6 0 0 1 4.4 0', { fill: 'none', stroke: C.silk, 'stroke-width': 0.35, 'stroke-opacity': 0.75, 'stroke-linecap': 'round' }));
  });

  /* ---------------------------------------------------------------- color */
  var SAMPLES = ['#ff5a28', '#ffd23f', '#3ddc84', '#2f80ff', '#b84dff', '#f4f4f4', '#202020', ''];
  F.define('color', function (f) {
    f.base('RGB 0x10');
    P.sot(f.root, 22.6, 22.0, 3);
    lga(f, 10.6, 12.0, 2.4, 2.0, '#9aa0ab'); f.add(S.rect(9.9, 11.5, 1.4, 1.0, { r: 0.2, fill: '#222a40' }));
    f.add(S.rect(17.6, 11.4, 2.0, 1.2, { r: 0.2, fill: '#efe8d2', stroke: '#8d8470', 'stroke-width': 0.1 }), S.rect(18.1, 11.7, 1.0, 0.6, { r: 0.1, fill: '#fff' }));
    var glow = P.glow(f.root, 18.6, 12.0, 11, '#ffffff');
    f.silk('RGBW', 10.6, 16.4, 1.5); f.silk('LED', 18.6, 16.4, 1.5);
    var sample = S.g({ 'pointer-events': 'none' },
      S.rect(7.0, 3.0, 15.6, 6.8, { r: 1.1, fill: '#ff5a28', stroke: '#fff', 'stroke-width': 0.35, 'stroke-opacity': 0.8 }),
      S.rect(7.8, 3.6, 14.0, 1.5, { r: 0.7, fill: '#fff', opacity: 0.2 }));
    f.add(sample);
    var rect = sample.childNodes[0];
    f.tap(f.zone(6.5, 2.5, 16.6, 8, 2), function () {
      var cur = f.inst.state.sample || '', i = SAMPLES.indexOf(cur);
      f.inst.set('sample', SAMPLES[(i + 1) % SAMPLES.length]);
    });
    f.onUpdate(function () {
      var s = f.inst.state.sample;
      sample.setAttribute('opacity', s ? 0.95 : 0.25);
      if (s) rect.setAttribute('fill', s);
      rect.setAttribute('stroke-dasharray', s ? '' : '1 0.8');
      glow.setAttribute('opacity', f.inst.out.led ? 1 : 0);
    });
  });

  /* ---------------------------------------------------------------- imu */
  F.define('imu', function (f) {
    f.base('IMU 0x6A');
    lga(f, 14.8, 9.6, 3.0, 2.5);
    P.smd(f.root, 10.0, 9.6, 1.0, 0.55, 90); P.smd(f.root, 19.6, 9.6, 1.0, 0.55, 90);
    // axes drawn on the silkscreen: X to the right, Y towards the USB-C edge (up)
    var ox = 8.0, oy = 17.0;
    f.add(S.path('M' + ox + ' ' + oy + 'H' + (ox + 7) + 'M' + (ox + 5.8) + ' ' + (oy - 1) + 'L' + (ox + 7) + ' ' + oy + 'L' + (ox + 5.8) + ' ' + (oy + 1), { fill: 'none', stroke: C.silk, 'stroke-width': 0.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    f.add(S.path('M' + ox + ' ' + oy + 'V' + (oy - 6) + 'M' + (ox - 1) + ' ' + (oy - 4.8) + 'L' + ox + ' ' + (oy - 6) + 'L' + (ox + 1) + ' ' + (oy - 4.8), { fill: 'none', stroke: C.silk, 'stroke-width': 0.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    f.silk('X', ox + 8.2, oy + 0.7, 1.7); f.silk('Y', ox, oy - 7.2, 1.7);
    var glow = P.glow(f.root, 14.8, 9.6, 8, '#ffb020');
    f.bind(glow, 'opacity', function () { return f.inst.out.int > 0 ? 1 : 0; });
  });

  /* ---------------------------------------------------------------- compass */
  F.define('compass', function (f) {
    f.base('MAG 0x1C');
    lga(f, 21.8, 8.8, 3.0, 3.0);
    var cx = 12.2, cy = 11.4;
    f.add(S.circle(cx, cy, 6.4, { fill: '#171b22', stroke: C.silk, 'stroke-width': 0.35, 'stroke-opacity': 0.85 }));
    f.silk('N', cx, cy - 7.6, 2.0); f.silk('S', cx, cy + 9.6, 1.6); f.silk('E', cx + 8.0, cy + 0.8, 1.6); f.silk('W', cx - 8.0, cy + 0.8, 1.6);
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      f.add(S.line(cx + Math.sin(a) * 5.2, cy - Math.cos(a) * 5.2, cx + Math.sin(a) * 6.0, cy - Math.cos(a) * 6.0, { stroke: C.silk, 'stroke-width': 0.2, 'stroke-opacity': 0.7 }));
    }
    var needle = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' },
      S.path('M0 -5L1.2 0L0 0L-1.2 0Z', { fill: '#ff3b30' }), S.path('M0 5L1.2 0L-1.2 0Z', { fill: '#e8ebef' }), S.circle(0, 0, 0.6, { fill: '#9aa3b0' }));
    f.add(needle);
    var calRing = S.circle(cx, cy, 7.2, { fill: 'none', stroke: '#ffb020', 'stroke-width': 0.5, 'stroke-dasharray': '1.2 0.8', opacity: 0 });
    f.add(calRing);
    var cur = 0, prev = '';
    f.onUpdate(function (dt) {
      var e = env(f), tgt = e ? -e.yaw : 0;
      var d = U.mod(tgt - cur + 180, 360) - 180;
      cur += d * Math.min(1, dt * 10);
      var v = cur.toFixed(1);
      if (v !== prev) { prev = v; needle.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') rotate(' + v + ')'); }
      calRing.setAttribute('opacity', f.inst.out.cal ? 1 : 0);
    });
  });

  /* ---------------------------------------------------------------- rtc */
  F.define('rtc', function (f) {
    f.base('RTC 0x68');
    P.soic(f.root, 22.6, 20.4, 3.9, 4.9, 4, 90, 'DS3231');
    var cx = 12.8, cy = 11.2;
    f.add(S.circle(cx, cy, 7.9, { fill: 'url(#g-metal)', stroke: '#6b7482', 'stroke-width': 0.3 }));
    f.add(S.circle(cx, cy, 6.7, { fill: '#d4b24a', stroke: '#8a6d12', 'stroke-width': 0.25 }));
    f.add(S.circle(cx, cy, 5.6, { fill: 'none', stroke: '#8a6d12', 'stroke-width': 0.2, 'stroke-opacity': 0.5 }));
    f.add(S.text('+', cx, cy - 1.2, { 'font-size': 3.6, 'font-weight': 800, 'text-anchor': 'middle', fill: '#5a4306', 'font-family': 'Arial' }));
    f.add(S.text('CR1220', cx, cy + 2.2, { 'font-size': 1.8, 'font-weight': 700, 'text-anchor': 'middle', fill: '#5a4306', 'font-family': 'Arial' }));
    f.add(S.text('3V', cx, cy + 4.0, { 'font-size': 1.6, 'font-weight': 700, 'text-anchor': 'middle', fill: '#5a4306', 'font-family': 'Arial' }));
    var dot = S.circle(25.6, 11.8, 0.7, { fill: '#2a3550' });
    f.add(dot);
    f.onUpdate(function () {
      var t = f.inst.board ? f.inst.board.now() : Date.now();
      dot.setAttribute('fill', f.inst.powered && Math.floor(t / 500) % 2 ? '#19c3ff' : '#2a3550');
    });
  });

  /* ---------------------------------------------------------------- airq */
  F.define('airq', function (f) {
    f.base('VOC 0x59');
    lga(f, 11.6, 9.2, 2.6, 2.6, '#a9aeb8'); f.add(S.circle(11.6, 9.2, 0.8, { fill: '#454b57', stroke: '#222', 'stroke-width': 0.1 }));
    f.add(S.rect(17.4, 8.0, 3.4, 3.4, { r: 0.3, fill: '#d8d3c4', stroke: '#7a7462', 'stroke-width': 0.15 }), S.circle(19.2, 9.7, 0.9, { fill: '#c9a227' }));
    P.smd(f.root, 15.0, 9.2, 1.0, 0.55, 90); P.smd(f.root, 23.6, 9.2, 1.0, 0.55, 90);
    f.silk('SGP40', 11.6, 13.4, 1.4); f.silk('AHT20', 19.2, 13.4, 1.4);
    var warm = S.circle(24.2, 15.6, 0.8, { fill: '#ffb020' });
    f.add(warm);
    var puffs = [0, 1, 2].map(function (i) { var p = S.circle(0, 0, 0.9, { fill: '#9fd7ff', opacity: 0 }); f.add(p); return p; });
    f.onUpdate(function () {
      var w = f.inst.out.age < 12;
      warm.setAttribute('opacity', w ? (Math.sin(f.t * 8) > 0 ? 1 : 0.2) : 0.15);
      var voc = env(f) ? env(f).voc : 100, k = U.clamp((voc - 100) / 300, 0, 1);
      puffs.forEach(function (p, i) {
        var t = (f.t * 0.7 + i / 3) % 1;
        p.setAttribute('cx', 11.6 + Math.sin(f.t * 2 + i * 2) * 1.8); p.setAttribute('cy', 7.6 - t * 6);
        p.setAttribute('r', 0.6 + t * 1.6); p.setAttribute('opacity', (1 - t) * 0.5 * k);
      });
    });
  });

  /* ---------------------------------------------------------------- gesture / proximity */
  F.define('gesture', function (f) {
    f.base('PROX 0x60');
    f.add(S.rect(12.4, 7.4, 4.8, 2.6, { r: 0.3, fill: 'url(#g-black)', stroke: '#000', 'stroke-width': 0.12 }));
    f.add(S.rect(13.0, 8.0, 1.4, 1.4, { r: 0.2, fill: '#3a1010' }), S.rect(15.2, 8.0, 1.4, 1.4, { r: 0.2, fill: '#10243a' }));
    P.smd(f.root, 9.6, 8.7, 1.0, 0.55, 90); P.smd(f.root, 20.0, 8.7, 1.0, 0.55, 90);
    f.silk('IR', 13.7, 12.2, 1.4); f.silk('ALS', 16.0, 12.2, 1.4);
    var hand = S.g({ 'pointer-events': 'none', opacity: 0 },
      S.ellipse(0, 0, 6, 4.6, { fill: '#f0b497', stroke: '#c98466', 'stroke-width': 0.3 }),
      [-3.6, -1.2, 1.2, 3.6].map(function (x, i) { return S.rect(x - 0.8, -7.4 + Math.abs(i - 1.5) * 0.7, 1.6, 4.2, { r: 0.8, fill: '#f0b497', stroke: '#c98466', 'stroke-width': 0.2 }); }));
    var hg = S.g({ transform: 'translate(14.8 9.6)' }, hand);
    f.add(hg);
    var start = null;
    f.drag(f.zone(9.0, 4.4, 11.6, 10.4, 3), {
      down: function (p) { start = p; f.inst.set('hand', 3); },
      move: function (p) { f.inst.set('hand', U.clamp(3 + (start.y - p.y) * 1.0 + (p.y - start.y > 0 ? 0 : 0), 1, 20)); },
      up: function () { f.inst.set('hand', 20); }
    });
    f.onUpdate(function () {
      var d = f.inst.state.hand, k = U.clamp(1 - d / 20, 0, 1);
      hand.setAttribute('opacity', d >= 20 ? 0 : (0.25 + 0.7 * k).toFixed(2));
      hg.setAttribute('transform', 'translate(14.8 9.8) scale(' + (0.7 + k * 0.9).toFixed(2) + ')');
    });
  });

  /* ---------------------------------------------------------------- ultrasonic (65 mm) */
  F.define('ultrasonic', function (f) {
    f.base('SONAR 0x39', { labelSize: 3.0 });
    var eyes = [[18.6, 11.4], [46.0, 11.4]];
    eyes.forEach(function (p) {
      f.add(S.circle(p[0], p[1], 8.1, { fill: 'url(#g-metal)', stroke: '#6b7482', 'stroke-width': 0.3 }));
      f.add(S.circle(p[0], p[1], 6.9, { fill: '#15171c', stroke: '#2f343e', 'stroke-width': 0.25 }));
      f.add(S.circle(p[0], p[1], 5.2, { fill: 'none', stroke: '#394050', 'stroke-width': 0.2 }), S.circle(p[0], p[1], 3.4, { fill: 'none', stroke: '#394050', 'stroke-width': 0.2 }), S.circle(p[0], p[1], 1.4, { fill: '#0b0c10', stroke: '#394050', 'stroke-width': 0.2 }));
      f.add(S.circle(p[0] - 2.4, p[1] - 2.6, 1.6, { fill: '#fff', opacity: 0.09 }));
    });
    f.add(S.text('TX', eyes[0][0], 22.6, { 'font-size': 1.7, 'font-weight': 700, 'text-anchor': 'middle', fill: C.silk, 'fill-opacity': 0.8, 'font-family': 'Arial' }));
    f.add(S.text('RX', eyes[1][0], 22.6, { 'font-size': 1.7, 'font-weight': 700, 'text-anchor': 'middle', fill: C.silk, 'fill-opacity': 0.8, 'font-family': 'Arial' }));
    P.soic(f.root, 28.6, 21.8, 3.9, 4.9, 4, 90, 'CH32');
    P.sot(f.root, 22.4, 23.2, 5);
    [0, 1, 2].forEach(function (i) { P.pad(f.root, 61.6, 12 + i * 2.4, 0.7); });
    var rings = [0, 1, 2].map(function () { var r = S.circle(eyes[0][0], eyes[0][1], 8, { fill: 'none', stroke: '#19c3ff', 'stroke-width': 0.4, opacity: 0 }); f.add(r); return r; });
    f.onUpdate(function () {
      var o = f.inst.out, on = f.inst.powered && (o.ctrl & 2);
      rings.forEach(function (r, i) {
        if (!on) { r.setAttribute('opacity', 0); return; }
        var t = (f.t * 1.2 + i / 3) % 1;
        r.setAttribute('r', 8.4 + t * 6); r.setAttribute('opacity', ((1 - t) * 0.35).toFixed(2));
      });
    });
  });

  /* ---------------------------------------------------------------- encoder (65 mm) */
  F.define('encoder', function (f) {
    f.base('ENC 0x36');
    var cx = 33.8, cy = 13.6;
    f.add(S.rect(cx - 6.6, cy - 6.6, 13.2, 13.2, { r: 1.0, fill: 'url(#g-metal)', stroke: '#6b7482', 'stroke-width': 0.3 }));
    [[-6.6, -3.0], [-6.6, 3.0], [6.6, -3.0], [6.6, 3.0]].forEach(function (p) { f.add(S.rect(cx + p[0] + (p[0] < 0 ? -0.9 : -0.1), cy + p[1] - 0.6, 1.0, 1.2, { fill: C.silver })); });
    var k = P.knob(f.root, cx, cy, 4.9, 24);
    var detent = 360 / 15;
    var angle = 0, lastCounts = f.inst.state.counts;
    function ring() { return f.inst.out.cpd || 4; }
    P.soic(f.root, 52.4, 17.4, 3.9, 9.9, 8, 0, 'CH32V003');
    [0, 1, 2].forEach(function (i) { P.pad(f.root, 59.0, 7.4 + i * 2.2, 0.7); });
    f.silk('SWIO', 57.4, 14.6, 1.1);
    var pressRing = S.circle(cx, cy, 5.6, { fill: 'none', stroke: '#19c3ff', 'stroke-width': 0.6, opacity: 0 });
    f.add(pressRing);
    // rotate by dragging round the knob; a short tap is a click, holding still is a press
    var acc = 0, prevA = null, holdTimer = 0, tapDown = false;
    function angleOf(p) { return Math.atan2(p.x - cx, -(p.y - cy)) / U.RAD; }
    f.drag(f.zone(cx - 6, cy - 6, 12, 12, 6), {
      down: function (p) {
        prevA = angleOf(p); acc = 0; tapDown = false;
        holdTimer = setTimeout(function () { holdTimer = 0; if (Math.abs(acc) < 6) { tapDown = true; f.inst.set('down', true); } }, 220);
      },
      move: function (p) {
        if (prevA === null) return;
        var a = angleOf(p), d = U.mod(a - prevA + 180, 360) - 180;
        prevA = a; acc += d; angle += d;
        if (Math.abs(acc) > 6 && holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
        var want = Math.round(angle / detent);
        var c = f.inst.state.counts, cur = Math.round(c / ring());
        if (want !== cur) f.inst.set('counts', c + (want - cur) * ring());
      },
      up: function (p, moved) {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; if (Math.abs(acc) < 6) { f.inst.set('down', true); setTimeout(function () { f.inst.set('down', false); }, 90); } }
        else if (tapDown) { tapDown = false; f.inst.set('down', false); }
        prevA = null;
      },
      wheel: function (d) { f.inst.set('counts', f.inst.state.counts + d * ring()); }
    });
    var shown = 0;
    f.onUpdate(function (dt) {
      var c = f.inst.state.counts;
      if (c !== lastCounts) { angle += (c - lastCounts) / ring() * detent * (Math.abs(angle - c / ring() * detent) > detent * 1.5 ? 1 : 0); lastCounts = c; }
      var target = c / ring() * detent;
      shown += (target - shown) * Math.min(1, dt * 30);
      k.rot.setAttribute('transform', 'rotate(' + shown.toFixed(1) + ')');
      pressRing.setAttribute('opacity', f.inst.state.down ? 1 : 0);
      k.wrap.setAttribute('transform', 'translate(' + cx + ' ' + (cy + (f.inst.state.down ? 0.25 : 0)) + ') scale(' + (f.inst.state.down ? 0.96 : 1) + ')');
    });
  });

  /* ---------------------------------------------------------------- rfid (65 mm) */
  F.define('rfid', function (f) {
    f.base('RFID 0x28');
    P.soic(f.root, 14.2, 12.4, 5.0, 5.0, 8, 0, 'MFRC522');
    P.smd(f.root, 20.4, 7.0, 1.0, 0.55, 0); P.smd(f.root, 20.4, 9.0, 1.0, 0.55, 0); P.smd(f.root, 8.0, 9.0, 1.0, 0.55, 90);
    // 20 x 20 mm antenna, 4 turns
    var ax = 36.0, ay = 2.4, aw = 20.0;
    for (var i = 0; i < 4; i++) {
      var o = i * 1.5;
      f.add(S.rect(ax + o, ay + o, aw - 2 * o, aw - 2 * o, { r: 1.4, fill: 'none', stroke: i % 2 ? '#c9a227' : '#d7b43a', 'stroke-width': 0.75, 'stroke-opacity': 0.9 }));
    }
    f.silk('13.56 MHz', ax + aw / 2, ay + aw / 2 + 1, 1.8);
    var field = P.glow(f.root, ax + aw / 2, ay + aw / 2, 17, '#19c3ff');
    var cardLabel = S.text('', 0, 4.4, { 'font-size': 1.6, 'font-weight': 700, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'Arial' });
    var card = S.g({ opacity: 0, 'pointer-events': 'none' },
      S.rect(-9.2, -5.8, 18.4, 11.6, { r: 1.4, fill: '#2f7bff', stroke: '#fff', 'stroke-width': 0.3 }),
      S.rect(-9.2, -5.8, 18.4, 4.2, { r: 1.4, fill: '#fff', opacity: 0.16 }),
      S.rect(-7.2, -1.0, 5.2, 3.6, { r: 0.6, fill: '#e9c85a', stroke: '#8a6d12', 'stroke-width': 0.2 }),
      cardLabel);
    var cg = S.g({ transform: 'translate(' + (ax + aw / 2) + ' ' + (ay + aw / 2) + ') rotate(-6)' }, card);
    f.add(cg);
    f.tap(f.zone(ax - 1, ay - 1, aw + 2, aw + 2, 2), function () {
      var n = Q.moduleDef('rfid').cards.length, c = f.inst.state.card;
      f.inst.set('card', c + 1 >= n ? -1 : c + 1);
    });
    var tcol = ['#2f7bff', '#ff7a2e', '#2fbf71'];
    f.onUpdate(function () {
      var c = f.inst.state.card;
      card.setAttribute('opacity', c >= 0 ? 0.95 : 0);
      if (c >= 0) { card.childNodes[0].setAttribute('fill', tcol[c % 3]); cardLabel.textContent = Q.moduleDef('rfid').cards[c].name.split(' ')[0]; }
      field.setAttribute('opacity', f.inst.powered ? (c >= 0 ? 0.55 : 0.12 + 0.05 * Math.sin(f.t * 4)) : 0);
    });
  });

  /* ---------------------------------------------------------------- proto2 (65 mm) */
  F.define('proto2', function (f) {
    f.base('PROTO 65');
    for (var i = 0; i < 6; i++) P.pad(f.root, 9.6 + i * 2.54, 5.6, 0.75);
    f.silk('5V G S D C 3V', 17.0, 8.6, 1.2);
    var rows = [[2, 20.6], [3, 20.6]];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 11; c++) {
      var x = 24.6 + c * 3.2, y = r < 2 ? 5.4 + r * 2.54 : 12.8 + (r - 2) * 2.54;
      f.add(S.circle(x, y, 0.95, { fill: 'none', stroke: 'url(#g-gold)', 'stroke-width': 0.55 }), S.circle(x, y, 0.42, { fill: '#c9d1dd' }));
    }
  });

  /* ---------------------------------------------------------------- debug modules */
  var DEBUG = { dbg_blank: ['BLANK', '#6b7380'], dbg_badcrc: ['BAD CRC', '#b97a2e'], dbg_short: ['SHORT', '#c0392b'] };
  Object.keys(DEBUG).forEach(function (key) {
    F.define(key, function (f) {
      f.base(DEBUG[key][0]);
      f.add(S.rect(6, 4.6, 17.6, 9.2, { r: 1.2, fill: 'none', stroke: DEBUG[key][1], 'stroke-width': 0.5, 'stroke-dasharray': '1.4 1' }));
      if (key === 'dbg_short') f.add(S.path('M16 6.4l-3.6 4h2.4l-.9 3.4 3.7-4.1h-2.4z', { fill: DEBUG[key][1] }));
      else f.add(S.text('?', 14.8, 11.8, { 'font-size': 6.4, 'text-anchor': 'middle', fill: DEBUG[key][1], 'font-weight': 800, 'font-family': 'Arial' }));
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
