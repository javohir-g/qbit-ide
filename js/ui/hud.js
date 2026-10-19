/* The strip under the board: what the INA226 and the fuel gauge would show, the Wi-Fi name, and the underside of the case
   (two LED windows and the PAIR / POWER key) - those cannot be seen from the lid. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h, S = Q.S, U = Q.util, GEO = Q.DATA.board;

  function Hud(el, board) {
    this.el = el; this.board = board;
    this.acc = 0;
    this.build();
  }

  Hud.prototype.build = function () {
    var self = this, b = this.board;
    this.el.textContent = '';
    var card = function (label, valEl, extra) { return h('div', { cls: 'hud-card' }, h('div', { cls: 'hud-col' }, h('span', { cls: 'lbl', text: label }), valEl), extra); };

    this.vPow = h('div', { cls: 'val' });
    this.vBat = h('div', { cls: 'val' });
    this.batBar = h('div', { cls: 'bar' }, h('i'));
    this.vMcu = h('div', { cls: 'val' });
    this.vWifi = h('div', { cls: 'val' });
    this.el.appendChild(card(T('Питание · INA226'), this.vPow));
    this.el.appendChild(card(T('Аккумулятор'), this.vBat, this.batBar));
    this.el.appendChild(card(T('Прошивка'), this.vMcu));
    this.el.appendChild(card(T('Wi-Fi точка'), this.vWifi));

    // underside
    var W = GEO.w, H = GEO.h;
    var svg = S('svg', { viewBox: '-3 -3 ' + (W + 6) + ' ' + (H + 6), xmlns: S.NS, 'aria-label': T('Дно платы: светодиоды и кнопка PAIR') });
    svg.appendChild(S.rect(0, 0, W, H, { r: 14, fill: '#2b2d32' }));
    var bat = GEO.battery;
    svg.appendChild(S.rect(W - bat.x - bat.w, bat.y, bat.w, bat.h, { r: 2, fill: '#222429', stroke: '#6d7380', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
    this.batFill = S.rect(W - bat.x - bat.w + 1.5, bat.y + 1.5, bat.w - 3, bat.h - 3, { r: 1.2, fill: '#2ee59d', opacity: 0.5 });
    svg.appendChild(this.batFill);
    svg.appendChild(S.text(T('АКБ'), W - bat.x - bat.w / 2, bat.y + bat.h / 2 + 4, { 'font-size': 12, 'text-anchor': 'middle', fill: '#c9ced6', opacity: 0.9, 'font-family': 'Arial', 'font-weight': 700 }));
    var lx = function (x) { return W - x; };
    this.pwrLed = S.circle(lx(GEO.pwrLed.x), GEO.pwrLed.y + 3.4, 4.6, { fill: '#14161a' });
    this.stLed = S.circle(lx(GEO.statusLed.x), GEO.statusLed.y + 3.4, 4.6, { fill: '#14161a' });
    this.pwrGlow = Q.faceParts.glow(svg, lx(GEO.pwrLed.x), GEO.pwrLed.y + 3.4, 12, '#ff3b30');
    this.stGlow = Q.faceParts.glow(svg, lx(GEO.statusLed.x), GEO.statusLed.y + 3.4, 13, '#19c3ff'); svg.appendChild(this.pwrLed); svg.appendChild(this.stLed);
    svg.appendChild(S.text('PWR', lx(GEO.pwrLed.x), GEO.pwrLed.y + 15, { 'font-size': 7, 'text-anchor': 'middle', fill: '#8a909c', 'font-weight': 700 }));
    svg.appendChild(S.text('STATUS', lx(GEO.statusLed.x), GEO.statusLed.y + 15, { 'font-size': 7, 'text-anchor': 'middle', fill: '#8a909c', 'font-weight': 700 }));
    var pr = GEO.pair;
    var pg = S.g({ cls: 'pair-btn ctl-hit', tabindex: 0, role: 'button', 'aria-label': T('Кнопка PAIR / POWER (под корпусом)') });
    pg.appendChild(S.circle(lx(pr.x), pr.y, 8.6, { fill: '#222429' }));
    this.pairCap = S.circle(lx(pr.x), pr.y, 6.2, { fill: '#4a4f5a' });
    pg.appendChild(this.pairCap);
    // the power symbol, drawn as two strokes (a 24-unit icon scaled into the key)
    var pw = S.g({ transform: 'translate(' + (lx(pr.x) - 4.6) + ' ' + (pr.y - 4.6) + ') scale(.383)', 'pointer-events': 'none', fill: 'none', stroke: '#fff', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    pw.appendChild(S.path('M12 3.5v8'));
    pw.appendChild(S.path('M7 6.9a7.2 7.2 0 1 0 10 0'));
    pg.appendChild(pw);
    svg.appendChild(pg);
    svg.appendChild(S.text('PAIR', lx(pr.x), pr.y + 19, { 'font-size': 7, 'text-anchor': 'middle', fill: '#8a909c', 'font-weight': 700 }));
    var down = false;
    function press(e) { e.preventDefault(); down = true; try { pg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } self.pairCap.setAttribute('fill', '#8a909c'); b.pressButton('pair', true); self.onPair && self.onPair(); }
    function release() { if (!down) return; down = false; self.pairCap.setAttribute('fill', '#4a4f5a'); b.pressButton('pair', false); }
    pg.addEventListener('pointerdown', press); pg.addEventListener('pointerup', release); pg.addEventListener('pointercancel', release); pg.addEventListener('lostpointercapture', release);
    pg.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); down = true; b.pressButton('pair', true); } });
    pg.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') { down = false; b.pressButton('pair', false); } });
    this.el.appendChild(h('div', { cls: 'hud-card under', title: T('Так плата выглядит снизу: светодиоды и кнопка PAIR / POWER смотрят через дно корпуса') },
      svg, h('div', { cls: 'hud-col' }, h('span', { cls: 'lbl', text: T('Дно корпуса') }), h('div', { cls: 'val', style: { fontSize: '12px', fontWeight: 500, color: 'var(--muted)', fontFamily: 'var(--sans)', lineHeight: 1.25 }, text: T('нажмите PAIR, чтобы включить от аккумулятора') }))));
  };

  /** every frame: the LEDs */
  Hud.prototype.frame = function () {
    var self = this, b = this.board, s = b.statusLed;
    var on = b.pwrLed;
    this.pwrLed.setAttribute('fill', on ? '#ff3b30' : '#14161a');
    this.pwrGlow.setAttribute('opacity', on ? 0.75 : 0);
    var lum = (s.r + s.g + s.b) / 255;
    var col = 'rgb(' + Math.min(255, s.r * 1.6) + ',' + Math.min(255, s.g * 1.6) + ',' + Math.min(255, s.b * 1.6) + ')';
    this.stLed.setAttribute('fill', lum > 0.02 ? col : '#14161a');
    [0, 1, 2].forEach(function (i) { self.stGlow.gradient.childNodes[i].setAttribute('stop-color', col); });
    this.stGlow.setAttribute('opacity', lum > 0.02 ? Math.min(0.9, 0.2 + lum * 0.7).toFixed(2) : 0);
  };

  Hud.prototype.update = function () {
    var b = this.board, pw = b.pw;
    var mcu = { off: T('выключена'), boot: T('загрузка…'), run: T('работает'), dfu: T('загрузчик') }[b.mcu.state];
    var small = function (text) { return '<small>' + text + '</small>'; };
    var unit = function (v, u) { return v + ' ' + small(u); };
    this.vPow.innerHTML = pw.on ? unit(pw.v5.toFixed(2), T('В')) + ' · ' + unit((pw.iMa / 1000).toFixed(2), T('А')) + ' · ' + unit(pw.pW.toFixed(1), T('Вт')) : small(T('нет питания'));
    this.vPow.style.color = pw.overload ? 'var(--err)' : '';
    this.vBat.innerHTML = Math.round(pw.soc) + ' ' + small('%') + ' ' + (pw.charging ? '<small style="color:var(--ok)">' + Q.iconHtml('bolt', 'ic-s') + ' ' + T('заряд') + '</small>' : pw.src.usb ? small(T('полный')) : small(T('расход')));
    var bar = this.batBar;
    bar.firstChild.style.width = pw.soc + '%';
    bar.className = 'bar' + (pw.soc < 15 ? ' err' : pw.soc < 35 ? ' warn' : '');
    this.vMcu.innerHTML = '<small>ESP32-S3</small> ' + mcu;
    this.vWifi.innerHTML = b.mcu.state === 'run' ? b.wifi.ssid : '<small>—</small>';
    var bat = GEO.battery, k = U.clamp(pw.soc / 100, 0, 1);
    this.batFill.setAttribute('width', ((bat.w - 3) * k).toFixed(1));
    this.batFill.setAttribute('x', (GEO.w - bat.x - bat.w + 1.5 + (bat.w - 3) * (1 - k)).toFixed(1));
    this.batFill.setAttribute('fill', pw.soc < 15 ? '#ff5d6c' : pw.soc < 35 ? '#ffb020' : '#2ee59d');
  };

  Q.Hud = Hud;
})(typeof globalThis !== 'undefined' ? globalThis : this);
