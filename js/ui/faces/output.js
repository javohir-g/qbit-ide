/* Faces of the output modules: led, rgb, buzzer, servo, irtx, relay, motor, oled. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var F = Q.Faces, P = Q.faceParts, S = Q.S, C = Q.COLORS, U = Q.util;
  var mix = function (a, b, t) { return Q.lerpHex(a, b, U.clamp(t, 0, 1)); };

  function resistorsAndFet(f) {
    P.sot(f.root, 22.4, 20.4, 3);
    P.smd(f.root, 20.0, 15.6, 1.0, 0.55, 90); P.smd(f.root, 23.8, 15.6, 1.0, 0.55, 90); P.smd(f.root, 25.6, 20.6, 1.0, 0.55, 90);
  }

  /* ---------------------------------------------------------------- led */
  var LED_OFF = { white: '#cfc9bb', red: '#5a1713', yellow: '#5e4a0c', green: '#10481f', blue: '#12275f' };
  F.define('led', function (f) {
    f.base('LED');
    resistorsAndFet(f);
    var cx = 14.8, cy = 12.4;
    var col = function () { return C.led[f.inst.variant || 'white']; };
    var glow = P.glow(f.root, cx, cy, 12, col());
    var body = S.rect(cx - 1.5, cy - 1.0, 3.0, 2.0, { r: 0.25, fill: '#e9e1cf', stroke: '#8d8470', 'stroke-width': 0.12 });
    var lens = S.rect(cx - 0.9, cy - 0.55, 1.8, 1.1, { r: 0.2, fill: LED_OFF[f.inst.variant || 'white'] });
    f.add(body, lens);
    f.add(S.rect(cx - 2.0, cy - 0.7, 0.5, 1.4, { fill: 'url(#g-gold)' }), S.rect(cx + 1.5, cy - 0.7, 0.5, 1.4, { fill: 'url(#g-gold)' }));
    f.silk(({ white: '', red: 'RED', yellow: 'YEL', green: 'GRN', blue: 'BLU' })[f.inst.variant || 'white'], cx, cy + 5.2, 1.8);
    var cur = 0;
    f.onUpdate(function (dt) {
      var b = f.inst.powered ? f.inst.out.b : 0;
      cur += (b - cur) * Math.min(1, dt * 30);
      var v = f.inst.variant || 'white';
      lens.setAttribute('fill', mix(LED_OFF[v], C.led[v], cur));
      glow.setAttribute('opacity', (cur * 0.95).toFixed(3));
      glow.gradient.firstChild.setAttribute('stop-color', C.led[v]);
      glow.gradient.childNodes[1].setAttribute('stop-color', C.led[v]);
      glow.gradient.childNodes[2].setAttribute('stop-color', C.led[v]);
    });
  });

  /* ---------------------------------------------------------------- rgb */
  F.define('rgb', function (f) {
    f.base('RGB');
    var cx = 14.8, cy = 12.2;
    P.sot(f.root, 22.6, 8.6, 5);
    P.smd(f.root, 19.8, 14.4, 1.0, 0.55, 90); P.smd(f.root, 22.4, 5.6, 1.0, 0.55, 0); P.smd(f.root, 9.6, 14.2, 1.0, 0.55, 90); P.smd(f.root, 8.2, 14.2, 1.0, 0.55, 90);
    var glow = P.glow(f.root, cx, cy, 13, '#ffffff');
    f.add(S.path('M' + (cx - 2.6) + ' ' + (cy - 2.6) + 'h4.5l1 1v4.2h-5.5Z', { fill: 'none' }));
    f.add(S.path('M' + (cx - 2.6) + ' ' + (cy - 2.6) + 'H' + (cx + 1.7) + 'L' + (cx + 2.6) + ' ' + (cy - 1.7) + 'V' + (cy + 2.6) + 'H' + (cx - 2.6) + 'Z', { fill: 'url(#g-white)', stroke: '#8e97a5', 'stroke-width': 0.2 }));
    [[-3.2, -1.6], [-3.2, 0.4], [2.4, -1.6], [2.4, 0.4]].forEach(function (p) { f.add(S.rect(cx + p[0] - 0.2, cy + p[1], 1.0, 1.0, { fill: C.silver })); });
    var lens = S.circle(cx, cy, 1.85, { fill: '#e6e9ee', stroke: '#9aa3b0', 'stroke-width': 0.15 });
    var shine = S.ellipse(cx - 0.55, cy - 0.7, 0.7, 0.4, { fill: '#fff', opacity: 0.55 });
    f.add(lens, shine);
    var cur = [0, 0, 0];
    f.onUpdate(function (dt) {
      var tgt = f.inst.powered ? f.inst.out.rgb : [0, 0, 0], k = Math.min(1, dt * 28), c = [], i;
      for (i = 0; i < 3; i++) { cur[i] += (tgt[i] - cur[i]) * k; c.push(Math.round(cur[i])); }
      var lum = (c[0] + c[1] + c[2]) / 765, on = lum > 0.004;
      var hex = '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
      lens.setAttribute('fill', on ? mix('#cfd3da', hex, 0.35 + 0.65 * Math.min(1, lum * 2.2)) : '#d9dce2');
      shine.setAttribute('opacity', on ? 0.3 : 0.55);
      glow.setAttribute('opacity', on ? Math.min(1, 0.35 + lum * 1.4).toFixed(2) : 0);
      var mxc = Math.max(c[0], c[1], c[2], 1);
      var bright = '#' + c.map(function (v) { return Math.round(v / mxc * 255).toString(16).padStart(2, '0'); }).join('');
      glow.gradient.childNodes[0].setAttribute('stop-color', bright);
      glow.gradient.childNodes[1].setAttribute('stop-color', bright);
      glow.gradient.childNodes[2].setAttribute('stop-color', bright);
    });
  });

  /* ---------------------------------------------------------------- buzzer */
  F.define('buzzer', function (f) {
    f.base('BUZZER');
    resistorsAndFet(f);
    var cx = 14.8, cy = 12.0;
    f.add(S.rect(cx - 4.5, cy - 4.5, 9, 9, { r: 1.0, fill: 'url(#g-black)', stroke: '#000', 'stroke-width': 0.2 }));
    f.add(S.circle(cx, cy, 3.6, { fill: '#0e0f12', stroke: '#2f323a', 'stroke-width': 0.25 }));
    f.add(S.circle(cx, cy, 1.0, { fill: '#000', stroke: '#3a3d46', 'stroke-width': 0.2 }));
    f.silk('+', cx - 3.2, cy - 2.6, 2.2);
    var waves = [0, 1, 2].map(function () { var p = S.path('', { fill: 'none', stroke: '#ffffff', 'stroke-width': 0.45, 'stroke-linecap': 'round', opacity: 0 }); f.add(p); return p; });
    var phase = 0;
    f.onUpdate(function (dt) {
      var loud = f.inst.powered ? Q.moduleDef('buzzer').loudness(f.inst) : 0;
      if (loud > 0.02) phase += dt * 2.4;
      waves.forEach(function (w, i) {
        if (loud <= 0.02) { w.setAttribute('opacity', 0); return; }
        var t = (phase + i / 3) % 1, r = 5.4 + t * 5.0, a = 0.9 * (1 - t) * Math.min(1, loud * 1.6);
        w.setAttribute('d', 'M' + (cx + 4.4 + t * 0.5) + ' ' + (cy - r * 0.55) + 'Q' + (cx + 4.4 + r * 0.8) + ' ' + cy + ' ' + (cx + 4.4 + t * 0.5) + ' ' + (cy + r * 0.55));
        w.setAttribute('opacity', a.toFixed(2));
      });
    });
  });

  /* ---------------------------------------------------------------- servo */
  F.define('servo', function (f) {
    f.base('SERVO');
    P.smd(f.root, 19.8, 8.4, 1.0, 0.55, 90); P.smd(f.root, 22.0, 8.4, 1.0, 0.55, 90);
    f.add(S.rect(6.4, 3.4, 7.8, 2.9, { r: 0.3, fill: 'url(#g-black)', stroke: '#000', 'stroke-width': 0.15 }));
    for (var i = 0; i < 3; i++) f.add(S.rect(8.1 + i * 2.54 - 0.32, 2.6, 0.64, 1.7, { fill: 'url(#g-gold)' }));
    f.silk('G  5V  S', 10.3, 8.2, 1.4);
    var cx = 17.6, cy = 20.0, R = 6.6;
    f.add(S.path('M' + (cx - R) + ' ' + cy + 'A' + R + ' ' + R + ' 0 0 1 ' + (cx + R) + ' ' + cy, { fill: 'none', stroke: C.silk, 'stroke-width': 0.3, 'stroke-opacity': 0.7 }));
    for (i = 0; i <= 6; i++) {
      var a = Math.PI * i / 6;
      f.add(S.line(cx - Math.cos(a) * (R - 0.2), cy - Math.sin(a) * (R - 0.2), cx - Math.cos(a) * (R + 0.9), cy - Math.sin(a) * (R + 0.9), { stroke: C.silk, 'stroke-width': 0.3, 'stroke-opacity': 0.8 }));
    }
    f.silk('0°', cx - R - 2.0, cy + 1.0, 1.6); f.silk('180°', cx + R + 3.0, cy + 1.0, 1.6);
    var horn = S.g(null, S.path('M-0.9 0.2L0 -5.8L0.9 0.2Z', { fill: '#e9edf3', stroke: '#6b7482', 'stroke-width': 0.2 }),
                   S.circle(0, -5.4, 0.6, { fill: '#9aa3b0' }));
    var hub = S.circle(cx, cy, 1.5, { fill: 'url(#g-metal)', stroke: '#4a5260', 'stroke-width': 0.2 });
    var hg = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' }, horn);
    f.add(hg, hub);
    var glow = P.glow(f.root, cx, cy, 9, '#ff5d6c');
    var prev = null;
    f.tap(f.zone(cx - R - 1, cy - R - 1, R * 2 + 2, R + 2, 3), function () { f.inst.set('blocked', !f.inst.state.blocked); });
    f.onUpdate(function () {
      var o = f.inst.out, ang = o.angle;
      var rot = ang - 90 + (o.stalled ? Math.sin(f.t * 60) * 1.2 : 0);
      var v = rot.toFixed(1);
      if (v !== prev) { prev = v; hg.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') rotate(' + v + ')'); }
      glow.setAttribute('opacity', f.inst.state.blocked ? (o.stalled ? 0.9 : 0.35) : 0);
    });
  });

  /* ---------------------------------------------------------------- irtx */
  F.define('irtx', function (f) {
    f.base('IR TX');
    resistorsAndFet(f);
    var cx = 14.8, cy = 11.2;
    var glow = P.glow(f.root, cx, cy, 11, '#c27bff');
    f.add(S.circle(cx, cy, 2.9, { fill: 'url(#g-dome)', stroke: '#b4bccb', 'stroke-width': 0.2, opacity: 0.96 }));
    f.add(S.circle(cx, cy, 1.5, { fill: '#8d96a8', opacity: 0.55 }), S.circle(cx, cy, 0.6, { fill: '#4a4f5f' }));
    var tx = S.rect(21.6, 17.0, 1.6, 0.8, { r: 0.1, fill: '#7a1c18', stroke: '#2a0907', 'stroke-width': 0.08 });
    f.add(tx);
    var txGlow = P.glow(f.root, 22.4, 17.4, 5, '#ff3b30');
    f.silk('TX', 22.4, 15.8, 1.5);
    f.onUpdate(function () {
      var on = f.inst.out.sending > 0 || f.inst.out.carrier;
      glow.setAttribute('opacity', on ? 0.9 : 0);
      txGlow.setAttribute('opacity', on ? 1 : 0);
      tx.setAttribute('fill', on ? '#ff3b30' : '#7a1c18');
    });
  });

  /* ---------------------------------------------------------------- relay (65 mm) */
  F.define('relay', function (f) {
    f.base('RELAY 30VDC', { labelSize: 3.2 });
    P.sot(f.root, 28.0, 22.6, 3);
    var body = S.g(null,
      S.rect(9.6, 3.4, 19.4, 15.8, { r: 0.8, fill: '#1c9cf2', stroke: '#0d62a8', 'stroke-width': 0.3 }),
      S.rect(10.2, 4.0, 18.2, 4.0, { r: 0.4, fill: '#fff', opacity: 0.18 }),
      S.rect(12.6, 9.2, 13.4, 5.4, { r: 0.3, fill: '#e6f4ff', opacity: 0.95 }),
      S.text('SRD-05VDC-SL-C', 19.3, 11.6, { 'font-size': 1.6, 'font-weight': 700, 'text-anchor': 'middle', fill: '#10304e', 'font-family': 'Arial' }),
      S.text('5V  10A 250VAC', 19.3, 13.7, { 'font-size': 1.3, 'text-anchor': 'middle', fill: '#10304e', 'font-family': 'Arial' }));
    f.add(body);
    var tb = S.g(null, S.rect(40.4, 3.6, 17.6, 9.6, { r: 0.6, fill: '#1c8fe0', stroke: '#0d5a9a', 'stroke-width': 0.25 }));
    for (var i = 0; i < 3; i++) {
      var x = 43.8 + i * 5.1;
      tb.appendChild(S.circle(x, 7.2, 1.7, { fill: 'url(#g-metal)', stroke: '#5a6472', 'stroke-width': 0.2 }));
      tb.appendChild(S.line(x - 1.1, 7.2, x + 1.1, 7.2, { stroke: '#4a5260', 'stroke-width': 0.35, transform: 'rotate(' + (20 + i * 40) + ' ' + x + ' 7.2)' }));
      tb.appendChild(S.rect(x - 1.3, 10.4, 2.6, 1.6, { r: 0.3, fill: '#0b1a2a' }));
    }
    f.add(tb);
    ['NC', 'COM', 'NO'].forEach(function (t, k) { f.silk(t, 43.8 + k * 5.1, 16.6, 1.6); });
    var contact = S.path('M0 0', { fill: 'none', stroke: '#ffd34d', 'stroke-width': 0.6, 'stroke-linecap': 'round' });
    f.add(contact);
    var led = S.rect(35.0, 18.2, 1.6, 0.8, { r: 0.1, fill: '#7a1c18', stroke: '#2a0907', 'stroke-width': 0.08 });
    f.add(led);
    var glow = P.glow(f.root, 35.8, 18.6, 6, '#ff3b30');
    f.silk('ON', 35.8, 21.4, 1.5);
    var shift = 0;
    f.onUpdate(function (dt) {
      var on = f.inst.powered && f.inst.out.on;
      led.setAttribute('fill', on ? '#ff3b30' : '#7a1c18');
      glow.setAttribute('opacity', on ? 1 : 0);
      var tgt = on ? 1 : 0; shift += (tgt - shift) * Math.min(1, dt * 40);
      var a = 43.8 + 5.1, b = on ? 43.8 + 10.2 : 43.8;
      contact.setAttribute('d', 'M' + a + ' 15.2L' + (a + (b - a) * 0.5) + ' 14.6L' + b + ' 15.2');
      body.setAttribute('transform', 'translate(' + (on ? 0.05 : 0) + ' 0)');
    });
  });

  /* ---------------------------------------------------------------- motor (65 mm) */
  F.define('motor', function (f) {
    f.base('MOTOR 0x60');
    P.soic(f.root, 12.4, 12.6, 3.0, 3.0, 4, 90, 'DRV8830');
    P.smd(f.root, 7.6, 8.0, 1.0, 0.55, 0); P.smd(f.root, 17.2, 8.0, 1.0, 0.55, 0); P.smd(f.root, 17.2, 17.6, 1.0, 0.55, 90);
    var tb = S.g(null, S.rect(50.4, 4.2, 10.6, 10.2, { r: 0.6, fill: '#1c8fe0', stroke: '#0d5a9a', 'stroke-width': 0.25 }));
    for (var i = 0; i < 2; i++) {
      var x = 53.6 + i * 5.0;
      tb.appendChild(S.circle(x, 8.0, 1.7, { fill: 'url(#g-metal)', stroke: '#5a6472', 'stroke-width': 0.2 }));
      tb.appendChild(S.line(x - 1.1, 8.0, x + 1.1, 8.0, { stroke: '#4a5260', 'stroke-width': 0.35, transform: 'rotate(' + (30 + i * 50) + ' ' + x + ' 8)' }));
    }
    f.add(tb);
    f.silk('X1', 55.4, 17.0, 1.7);
    // the motor shaft, seen from the end: stator ring and a three-blade rotor
    var cx = 36.0, cy = 12.6;
    f.add(S.circle(cx, cy, 7.4, { fill: 'url(#g-metal)', stroke: '#6b7482', 'stroke-width': 0.3 }));
    f.add(S.circle(cx, cy, 6.1, { fill: '#171a20', stroke: '#2f343e', 'stroke-width': 0.2 }));
    var rotor = S.g({ transform: 'translate(' + cx + ' ' + cy + ')' });
    for (i = 0; i < 3; i++) rotor.appendChild(S.path('M0 0L5.3 -1.7A5.6 5.6 0 0 1 5.3 1.7Z', { fill: i === 0 ? '#ff7a2e' : '#8d96a8', transform: 'rotate(' + (i * 120) + ')', stroke: '#2b2f38', 'stroke-width': 0.15 }));
    rotor.appendChild(S.circle(0, 0, 1.2, { fill: 'url(#g-metal)' }));
    f.add(rotor);
    var arrow = S.path('M0 0', { fill: 'none', stroke: '#19c3ff', 'stroke-width': 0.5, 'stroke-linecap': 'round', opacity: 0 });
    f.add(arrow);
    var spin = 0, last = '';
    f.onUpdate(function (dt) {
      var rpm = f.inst.powered ? f.inst.out.rpm : 0;
      spin += Math.sign(rpm) * Math.min(Math.abs(rpm), 900) / 60 * 360 * dt;
      var v = (spin % 360).toFixed(1);
      if (v !== last) { last = v; rotor.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') rotate(' + v + ')'); }
      if (Math.abs(rpm) > 30) {
        var s = rpm > 0 ? 1 : -1;
        arrow.setAttribute('d', 'M' + (cx - 5 * s) + ' ' + (cy - 8.8) + 'Q' + cx + ' ' + (cy - 11) + ' ' + (cx + 5 * s) + ' ' + (cy - 8.8) + 'l' + (-1.1 * s) + ' -1.2m' + (1.1 * s) + ' 1.2l' + (-1.4 * s) + ' 0.9');
        arrow.setAttribute('opacity', 0.9);
      } else arrow.setAttribute('opacity', 0);
    });
    f.hold(f.zone(cx - 8, cy - 8, 16, 16, 8), function (v) { f.inst.set('load', v ? 1 : 0); });      // hold the shaft = stall
  });

  /* ---------------------------------------------------------------- oled (65 mm) */
  F.define('oled', function (f) {
    f.base('OLED 0x3C', { labelX: 8.2, labelAnchor: 'start', labelRoom: 22, labelSize: 3.0 });
    P.smd(f.root, 11.4, 13.4, 1.0, 0.55, 90); P.smd(f.root, 11.4, 11.0, 1.0, 0.55, 90);
    var x0 = 30.4, y0 = 1.4;
    f.add(S.rect(x0, y0, 29.0, 26.8, { r: 1.2, fill: '#101821', stroke: '#2a3b50', 'stroke-width': 0.3 }));
    for (var i = 0; i < 4; i++) f.add(S.rect(x0 + 8.2 + i * 2.54 - 0.6, y0 + 0.7, 1.2, 1.2, { r: 0.2, fill: 'url(#g-gold)' }));
    f.silk('GND VCC SCL SDA', x0 + 14.5, y0 + 4.2, 1.2, 'middle', { fill: '#9fb4cc' });
    var gx = x0 + 2.6, gy = y0 + 5.6, gw = 23.8, gh = 14.6;
    f.add(S.rect(gx, gy, gw, gh, { r: 0.4, fill: '#030507', stroke: '#222c38', 'stroke-width': 0.25 }));
    var aw = 21.74, ah = 10.87, ax = gx + (gw - aw) / 2, ay = gy + (gh - ah) / 2;
    var canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(128, 64);
    var image = S('image', { x: ax, y: ay, width: aw, height: ah, preserveAspectRatio: 'none', style: 'image-rendering: pixelated' });
    f.add(image);
    f.add(S.rect(gx, gy, gw, gh, { r: 0.4, fill: 'url(#g-glass)', 'pointer-events': 'none' }));
    var lastVer = -1, lastOn = null, buf = null, acc = 0, dirty = true;
    function paint() {
      var o = f.inst.out;
      buf = Q.moduleDef('oled').screen(f.inst, buf);
      var d = img.data, k = 0.35 + 0.65 * (o.contrast / 255);
      for (var p = 0; p < 8192; p++) {
        var v = buf[p] ? 1 : 0, q = p * 4;
        d[q] = v ? 190 * k : 0; d[q + 1] = v ? 232 * k : 0; d[q + 2] = v ? 255 * k : 0; d[q + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      image.setAttribute('href', canvas.toDataURL('image/png'));
    }
    f.onUpdate(function (dt) {
      acc += dt;
      var o = f.inst.out, key = o.version + ':' + o.on + ':' + (f.inst.powered ? 1 : 0);
      if (key !== lastVer && acc >= 0.04) { lastVer = key; acc = 0; paint(); }
    });
    paint();
    lastVer = f.inst.out.version + ':' + f.inst.out.on + ':' + (f.inst.powered ? 1 : 0);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
