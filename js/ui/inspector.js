/* The panel on the right: what is on the selected port (live values, controls, passport, I2C), the room around the board,
   and the board itself (power, port switches, bus tools). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h, U = Q.util, W = Q.widgets;

  var STATE_TEXT = {
    empty: [T('пусто'), ''], debounce: [T('опознаю…'), 'warn'], ready: [T('готов'), 'ok'], unknown: [T('неизвестный модуль'), 'err'],
    fault: [T('перегрузка'), 'err'], nobudget: [T('не хватает тока'), 'warn'], covered: [T('под двойным модулем'), '']
  };
  var NEC_KEYS = [['CH−', 0x45], ['CH', 0x46], ['CH+', 0x47], [{ icon: 'skip-back' }, 0x44, T('Назад')], [{ icon: 'skip-fwd' }, 0x40, T('Вперёд')], [{ icon: 'play-pause' }, 0x43, T('Пуск / пауза')], ['VOL−', 0x07], ['VOL+', 0x15], ['EQ', 0x09],
                  ['0', 0x16], ['100+', 0x19], ['200+', 0x0D], ['1', 0x0C], ['2', 0x18], ['3', 0x5E], ['4', 0x08], ['5', 0x1C], ['6', 0x5A], ['7', 0x42], ['8', 0x52], ['9', 0x4A]];

  function Inspector(el, board, app) {
    this.el = el; this.board = board; this.app = app;
    this.tab = 'module';
    this.sel = null;
    this.sig = '';
    this.dyn = [];
    this.acc = 0;
    this.build();
  }

  Inspector.prototype.build = function () {
    var self = this;
    this.el.textContent = '';
    this.tabs = h('div', { cls: 'tabs', role: 'tablist' });
    [['module', T('Модуль')], ['env', T('Среда')], ['board', T('Плата')]].forEach(function (t) {
      var b = h('button', { type: 'button', role: 'tab', 'data-tab': t[0], text: t[1] });
      b.addEventListener('click', function () { self.setTab(t[0]); });
      self.tabs.appendChild(b);
    });
    this.body = h('div', { cls: 'side-body' });
    this.el.appendChild(this.tabs);
    this.el.appendChild(this.body);
    this.setTab(this.tab, true);
  };

  Inspector.prototype.setTab = function (t, force) {
    if (this.tab === t && !force) return;
    this.tab = t;
    Array.prototype.forEach.call(this.tabs.children, function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === t)); });
    this.sig = '';
    this.rebuild();
  };

  Inspector.prototype.select = function (n) {
    this.sel = n;
    if (this.tab !== 'module') this.setTab('module');
    else { this.sig = ''; this.rebuild(); }
  };

  /** identity of what is on screen: when it changes the panel is rebuilt */
  Inspector.prototype.signature = function () {
    if (this.tab !== 'module') return this.tab;
    var p = this.sel ? this.board.port(this.sel) : null;
    if (!p) return 'overview';
    var m = p.module || p.covered;
    return [this.sel, m ? m.uid : '-', p.state, m ? m.variant : '', p.info ? 'i' : '', p.locked ? 'L' : '', p.tripped ? 'T' : ''].join('|');
  };

  Inspector.prototype.rebuild = function () {
    this.body.textContent = '';
    this.dyn = [];
    this.sig = this.signature();
    if (this.tab === 'env') this.buildEnv();
    else if (this.tab === 'board') this.buildBoard();
    else {
      var p = this.sel ? this.board.port(this.sel) : null;
      if (!p) this.buildOverview();
      else if (p.module || p.covered) this.buildModule(p, p.module || p.covered);
      else this.buildPort(p);
    }
    this.update(true);
  };

  Inspector.prototype.update = function (force) {
    if (!force && this.signature() !== this.sig) { this.rebuild(); return; }
    for (var i = 0; i < this.dyn.length; i++) this.dyn[i]();
  };

  /* ---------------------------------------------------------------- overview */
  Inspector.prototype.buildOverview = function () {
    var self = this, b = this.board, body = this.body;
    var ide = !!(this.app.opts && this.app.opts.ide);          // in the IDE the panel keeps to the facts: no how-to text
    body.appendChild(h('div', { cls: 'title-row' }, h('h2', { text: T('Порты платы') })));
    if (!ide) body.appendChild(h('p', { cls: 'note', text: T('Нажмите на порт или на модуль — здесь появятся его паспорт, сигналы и органы управления.') }));
    var grid = h('div', { cls: 'portgrid' }), cells = [];
    b.ports.forEach(function (p) {
      var st = h('i', { cls: 'st' }), nm = h('span');
      var c = h('button', { type: 'button', cls: 'pcell' }, st, h('b', { text: 'P' + p.n }), nm);
      c.addEventListener('click', function () { self.app.select(p.n); });
      grid.appendChild(c); cells.push([c, st, nm, p]);
    });
    body.appendChild(Q.widgets.section(T('Состояние портов'), grid));
    var info = h('div'); body.appendChild(Q.widgets.section(T('Питание и бюджет тока'), info));
    var help = Q.widgets.section(T('Как пользоваться'), h('ul', { cls: 'note', style: { paddingLeft: '18px', margin: 0 } },
      h('li', { text: T('Перетащите модуль из списка слева на порт: рядом с портом он примагнитится.') }),
      h('li', { text: T('Чтобы снять модуль, потяните его — магнит держит, пока не оттянете.') }),
      h('li', { text: T('Двойные модули (65 мм) занимают два порта в ряду.') }),
      h('li', { text: T('Кнопки, ручки, ползунки на модулях нажимаются и вращаются мышью или пальцем.') }),
      h('li', { text: T('Температура, свет, наклон платы — на вкладке «Среда».') })));
    if (!ide) body.appendChild(help);
    this.dyn.push(function () {
      cells.forEach(function (c) {
        var p = c[3], m = p.module || p.covered;
        c[1].className = 'st ' + p.state;
        c[2].textContent = ''; c[0].title = m ? m.name : '';
        if (m && p.covered && !p.module) { c[2].appendChild(Q.icon('swap', 'ic-s')); c[2].appendChild(document.createTextNode(' P' + (p.n - 1))); }
        else c[2].textContent = m ? m.name : '—';
        c[0].classList.toggle('sel', self.sel === p.n);
      });
      var pw = b.pw, decl = b.declaredMa(), bud = b.budgetMa();
      info.textContent = '';
      info.appendChild(W.kv([
        [T('Источник'), pw.src.label], [T('Шина 5 В'), pw.on ? T('%1 В', pw.v5.toFixed(2)) : T('нет')],
        [T('Ток платы'), T('%1 мА', Math.round(pw.iMa))], [T('Заявлено в паспортах'), T('%1 из %2 мА', Math.round(decl), Math.round(bud))]]));
      info.appendChild(h('div', { cls: 'bar ' + (decl > bud * 0.9 ? 'warn' : ''), style: { marginTop: '8px' } }, h('i', { style: { width: Math.min(100, decl / Math.max(1, bud) * 100) + '%' } })));
    });
  };

  /* ---------------------------------------------------------------- an empty port */
  Inspector.prototype.buildPort = function (p) {
    var self = this, b = this.board, body = this.body;
    body.appendChild(h('div', { cls: 'title-row' }, h('h2', { text: T('Порт P%1', p.n) })));
    var chips = h('div', { cls: 'chips' });
    body.appendChild(chips);
    if (!(this.app.opts && this.app.opts.ide)) body.appendChild(h('p', { cls: 'note', text: T('Свободен. Перетащите сюда модуль из списка или дважды нажмите на карточку.') }));
    var sw = h('input', { type: 'checkbox' });
    sw.addEventListener('change', function () { b.setPortEnable(p.n, sw.checked); });
    body.appendChild(W.section(T('Питание порта (PORT_EN)'), h('div', { cls: 'ctl' }, h('div', { cls: 'ctl-row' }, h('label', { text: T('Выход 5 В включён') }), h('span', { cls: 'switch' }, sw, h('i'))))));
    var reset = h('button', { cls: 'btn', type: 'button', text: T('Сбросить защиту порта') });
    reset.addEventListener('click', function () { b.resetPort(p.n); });
    body.appendChild(reset);
    body.appendChild(W.section(T('Разъём порта'), W.kv(Q.DATA.board.pins.map(function (n, i) {
      return [(i + 1) + ' · ' + n, [T('5 В от eFuse порта (до 1,8 А)'), T('общий провод'), T('сигнал, 3,3 В'), T('I²C данные'), T('I²C такт')][i]];
    }))));
    this.dyn.push(function () {
      chips.textContent = '';
      chips.appendChild(h('span', { cls: 'chip ' + (p.on ? 'ok' : 'warn'), text: p.on ? T('5 В есть') : T('5 В нет') }));
      chips.appendChild(h('span', { cls: 'chip', text: T('%1 В', p.v.toFixed(2)) }));
      if (p.tripped) chips.appendChild(h('span', { cls: 'chip err', text: T('защита сработала') }));
      if (sw.checked !== p.en && document.activeElement !== sw) sw.checked = p.en;
      reset.hidden = !(p.tripped || p.locked);
    });
  };

  /* ---------------------------------------------------------------- a module */
  Inspector.prototype.buildModule = function (p, m) {
    var self = this, b = this.board, body = this.body, def = m.def, covered = !p.module;
    if (covered) {
      body.appendChild(h('div', { cls: 'title-row' }, h('h2', { text: T('Порт P%1', p.n) })));
      body.appendChild(h('p', { cls: 'note', text: T('Здесь лежит вторая половина двойного модуля «%1» (он подключён к порту P%2).', m.name, m.port.n) }));
      var go = h('button', { cls: 'btn', type: 'button', text: T('Открыть модуль') });
      go.addEventListener('click', function () { self.app.select(m.port.n); });
      body.appendChild(go);
      return;
    }
    var rm = h('button', { cls: 'btn small danger', type: 'button', text: T('Снять'), title: T('Снять модуль с порта (Delete)') });
    rm.addEventListener('click', function () { self.app.removeFrom(p.n); });
    body.appendChild(h('div', { cls: 'title-row' }, h('h2', { text: m.name }), rm));
    var chips = h('div', { cls: 'chips' });
    body.appendChild(chips);
    var status = h('div'), live = h('div', { cls: 'chips' });
    body.appendChild(status); body.appendChild(live);
    if (def.hint) body.appendChild(h('p', { cls: 'note', text: def.hint }));

    // variant (LED colour)
    if (def.variants.length) {
      var all = Object.keys(def.variantIndex);
      var sel = h('select', { cls: 'sel', 'aria-label': T('Вариант') });
      all.forEach(function (v) { sel.appendChild(h('option', { value: v, text: ({ white: T('белый'), red: T('красный'), yellow: T('жёлтый'), green: T('зелёный'), blue: T('синий') })[v] || v })); });
      sel.value = m.variant;
      sel.addEventListener('change', function () { m.setVariant(sel.value); b.port(p.n).state = 'debounce'; b.port(p.n).t0 = b.time; b.log('info', T('P%1: вариант модуля → %2 (паспорт перезаписан)', p.n, sel.value)); });
      body.appendChild(W.section(T('Цвет (запись в паспорте)'), sel));
    }

    var ready = p.state === 'ready';
    // what a person does to the module
    if (def.controls && def.controls.length) {
      var box = h('div');
      def.controls.forEach(function (d) { var c = W.control(m, d, false); box.appendChild(c.el); self.dyn.push(c.update); });
      body.appendChild(W.section(T('Воздействие'), box));
    }
    if (def.remote) body.appendChild(W.section(T('ИК-пульт'), this.remote(m)));
    // live readings
    var ro = h('div');
    body.appendChild(W.section(T('Показания'), ro));
    // driving the outputs by hand
    if (def.tests && def.tests.length) {
      var tb = h('div'), tcs = [];
      def.tests.forEach(function (d) { var c = W.control(m, d, true); tb.appendChild(c.el); tcs.push(c); self.dyn.push(c.update); });
      var demoNote = h('div', { cls: 'note', text: T('Включено «Демо»: оно само управляет выходами. Выключите его вверху, чтобы проверять вручную.') });
      body.appendChild(W.section(T('Проверка выходов'), [demoNote, tb]));
      var app = this.app;
      this.dyn.push(function () {
        var demoOn = !!(app && app.demo && app.demo.on);
        demoNote.style.display = demoOn ? '' : 'none';
        tcs.forEach(function (c) { c.setDisabled(demoOn || !(m.api && p.state === 'ready')); });
      });
    }

    // SIG line
    var sigBox = h('div', { cls: 'sigmeter' });
    var sigTxt = h('span', { cls: 'mono' }), sigMeter = h('div', { cls: 'meter' }, h('i')), sigInfo = h('div', { cls: 'note', style: { gridColumn: '1 / -1', margin: 0 } });
    sigBox.appendChild(sigMeter); sigBox.appendChild(sigTxt); sigBox.appendChild(sigInfo);
    body.appendChild(W.section(T('Линия SIG (порт → GPIO %1)', ['', 'IO1', 'IO2', 'IO4', 'IO5', 'IO6', 'IO7', 'IO8', 'IO9'][p.n]), sigBox));

    // passport
    var pass = h('div'), hexBox = h('pre', { cls: 'hexdump' });
    var det = h('details', null, h('summary', { cls: 'note', text: T('Показать 256 байт EEPROM (I²C 0x50)'), style: { cursor: 'pointer' } }), hexBox);
    body.appendChild(W.section(T('Паспорт модуля'), [pass, det]));

    // I2C
    var i2c = h('div'), scanOut = h('div', { cls: 'note' });
    var scanBtn = h('button', { cls: 'btn small', type: 'button', text: T('Сканировать I²C-канал порта') });
    scanBtn.addEventListener('click', function () {
      var prev = b.i2c.muxMask; b.i2c.write(0x74, [1 << (p.n - 1)]);
      var found = b.i2c.scan(); b.i2c.write(0x74, [prev]);
      scanOut.textContent = T('Отвечают: %1 (0x74 — мультиплексор платы)', found.filter(function (a) { return a !== 0x74; }).map(function (a) { return U.hex(a); }).join(', '));
    });
    i2c.appendChild(scanBtn); i2c.appendChild(scanOut);
    body.appendChild(W.section('I²C', i2c));

    // driver
    var api = h('div', { cls: 'chips' });
    body.appendChild(W.section(T('Драйвер (что видит программа)'), api));

    // dynamic part -------------------------------------------------------------------------------
    var passVer = '';
    this.dyn.push(function () {
      var st = STATE_TEXT[p.state] || ['', ''];
      chips.textContent = '';
      chips.appendChild(h('span', { cls: 'chip', text: 'P' + p.n }));
      chips.appendChild(h('span', { cls: 'chip', text: U.hex(def.id, 4) }));
      chips.appendChild(h('span', { cls: 'chip', text: def.io === '-' ? T('пассивный') : def.io }));
      if (def.addr) chips.appendChild(h('span', { cls: 'chip', text: 'I²C ' + U.hex(def.addr) }));
      chips.appendChild(h('span', { cls: 'chip', text: def.fmt === 65 ? T('65×30 мм · P%1+P%2', p.n, (p.n + 1)) : T('30×30 мм') }));
      status.textContent = '';
      live.textContent = '';
      live.appendChild(h('span', { cls: 'chip ' + st[1], text: st[0] }));
      live.appendChild(h('span', { cls: 'chip', text: T('%1 В', p.v.toFixed(2)) }));
      live.appendChild(h('span', { cls: 'chip', text: T('%1 мА', Math.round(p.iMa)) }));
      if (p.reason) status.appendChild(h('p', { cls: 'note ' + (st[1] === 'err' ? 'warn' : ''), text: p.reason }));
      if (p.tripped || p.locked || p.state === 'nobudget') {
        var rb = h('button', { cls: 'btn small', type: 'button', text: p.state === 'nobudget' ? T('Включить порт всё равно') : T('Сбросить защиту порта') });
        rb.addEventListener('click', function () { if (p.state === 'nobudget') { p.state = 'debounce'; p.t0 = b.time; p.en = true; p.declaredMa = 0; b.log('warn', T('P%1: порт включён вручную, бюджет тока не проверяется', p.n)); } else b.resetPort(p.n); });
        status.appendChild(rb);
      }
      // readings
      ro.textContent = '';
      var rows = def.readouts ? def.readouts(m) : [];
      if (rows.length) ro.appendChild(W.kv(rows.map(function (r) { return [r.label, String(r.value) + (r.unit ? ' ' + r.unit : '')]; })));
      else ro.appendChild(h('p', { cls: 'note', text: T('У этого модуля нет значений для показа.') }));
      // SIG
      var mv = p.sig.readMv(), mode = p.sig.mode, d = p.sig.drive;
      sigMeter.firstChild.style.width = (mv / 3300 * 100).toFixed(1) + '%';
      sigTxt.textContent = T('%1 В', (mv / 1000).toFixed(2));
      var drv = mode === 'out' || mode === 'pwm' ? (d.type === 'pwm' ? T('ШИМ %1 Гц, %2 %', Math.round(d.freq), Math.round(d.duty * 100)) : d.type === 'frame' ? T('пакет %1', d.kind) : T('выход, уровень %1', (p.sig.level ? 'HIGH' : 'LOW')))
                                                       : mode === 'adc' ? T('вход АЦП, код %1 из 4095', p.sig.readRaw()) : T('цифровой вход: %1', (p.sig.read() ? 'HIGH' : 'LOW'));
      sigInfo.textContent = drv;
      // passport
      var ver = p.info ? p.info.crcStored + ':' + m.eeprom[0x80] : 'none';
      if (ver !== passVer || !pass.firstChild) {
        passVer = ver;
        pass.textContent = '';
        if (p.info) {
          var i = p.info;
          pass.appendChild(W.kv([[T('Тип'), U.hex(i.typeId, 4) + ' · ' + def.name], [T('Метка'), i.label], [T('Ревизия платы'), i.hwRevName], [T('Вариант'), String(i.variant)],
            [T('Интерфейс'), i.ifaceName], [T('I²C-адрес'), i.i2cAddr ? U.hex(i.i2cAddr) : '—'], [T('Размер'), T('%1×30 мм', i.formatMm)],
            [T('Ток (паспорт)'), T('%1 мА', i.currentMa)], [T('Флаги'), U.hex(i.flags) + (i.flagNames.length ? ' · ' + i.flagNames.join(' ') : '')],
            [T('Серийный №'), i.serial ? String(i.serial) : '—'], [T('Дата'), i.date], [T('Параметры'), i.params.length ? i.params.map(function (v) { return U.hex(v); }).join(' ') : '—'],
            ['CRC-16', i.crcOk ? T('%1 · верно', U.hex(i.crcStored, 4)) : T('ошибка')]]));
        } else pass.appendChild(h('p', { cls: 'note', text: p.state === 'debounce' ? T('Читаю паспорт…') : T('Паспорт не прочитан.') }));
      }
      hexBox.textContent = W.hexdump(m.eeprom);
      api.textContent = '';
      var names = m.api ? Object.keys(m.api).filter(function (k) { return typeof m.api[k] === 'function'; }) : [];
      if (names.length) names.forEach(function (k) { api.appendChild(h('span', { cls: 'chip', text: k + '()' })); });
      else api.appendChild(h('span', { cls: 'note', text: p.state === 'ready' ? T('нет функций') : T('драйвер ещё не загружен') }));
    });
    // dynamic parts are rebuilt every tick: keep the cost down by only refreshing at ~6 Hz
    var inner = this.dyn.pop(), n = 0;
    this.dyn.push(function () { if ((n++ % 3) === 0) inner(); });
  };

  Inspector.prototype.remote = function (m) {
    var g = h('div', { cls: 'remote' });
    NEC_KEYS.forEach(function (k) {
      var title = T('%1NEC, адрес 0x00, команда 0x%2', (k[2] ? k[2] + ' · ' : ''), k[1].toString(16).toUpperCase());
      var b = typeof k[0] === 'string' ? h('button', { type: 'button', text: k[0], title: title }) : h('button', { type: 'button', title: title, 'aria-label': k[2] }, Q.icon(k[0].icon));
      b.addEventListener('click', function () { m.def.irReceive(m, { protocol: 'NEC', address: 0, command: k[1], duration: 0.068 }); });
      g.appendChild(b);
    });
    return g;
  };

  /* ---------------------------------------------------------------- the room */
  function envRange(box, dyn, env, o) {
    var input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, 'aria-label': o.label });
    var val = h('span', { cls: 'val' });
    var get = o.get || function () { return env[o.key]; };
    var set = o.set || function (v) { env[o.key] = v; };
    function paint() { var v = +input.value; input.style.setProperty('--p', ((v - o.min) / (o.max - o.min) * 100).toFixed(1) + '%'); val.textContent = o.fmt ? o.fmt(v) : String(v); }
    input.addEventListener('input', function () { set(+input.value); paint(); });
    box.appendChild(h('div', { cls: 'ctl' }, h('div', { cls: 'ctl-row' }, h('label', { text: o.label }), val), input));
    dyn.push(function () { if (document.activeElement !== input) { input.value = get(); } paint(); });
  }

  Inspector.prototype.buildEnv = function () {
    var self = this, env = this.board.env, body = this.body, dyn = this.dyn;
    body.appendChild(h('div', { cls: 'title-row' }, h('h2', { text: T('Среда вокруг платы') })));
    if (!(this.app.opts && this.app.opts.ide)) body.appendChild(h('p', { cls: 'note', text: T('То, что измеряют датчики. Модули на плате читают эти значения.') }));
    var air = h('div');
    envRange(air, dyn, env, { key: 'tempC', label: T('Температура воздуха'), min: -20, max: 60, step: 0.5, fmt: function (v) { return v.toFixed(1) + ' °C'; } });
    envRange(air, dyn, env, { key: 'humidity', label: T('Влажность'), min: 0, max: 100, step: 1, fmt: function (v) { return v + ' %'; } });
    envRange(air, dyn, env, { key: 'pressureHpa', label: T('Давление'), min: 900, max: 1080, step: 0.5, fmt: function (v) { return T('%1 гПа', v.toFixed(1)); } });
    envRange(air, dyn, env, { key: 'voc', label: T('Загрязнение воздуха (VOC)'), min: 0, max: 500, step: 1, fmt: function (v) { return v + ''; } });
    body.appendChild(W.section(T('Воздух'), air));
    var light = h('div');
    envRange(light, dyn, env, { key: 'lux', label: T('Освещённость'), min: 0, max: 1500, step: 10, fmt: function (v) { return T('%1 лк', v); } });
    var presets = h('div', { cls: 'btnrow' });
    [[T('Темно'), 5], [T('Вечер'), 80], [T('Комната'), 400], [T('Окно'), 900], [T('Солнце'), 1500]].forEach(function (p) {
      var bt = h('button', { type: 'button', cls: 'btn small', text: p[0] });
      bt.addEventListener('click', function () { env.lux = p[1]; });
      presets.appendChild(bt);
    });
    light.appendChild(presets);
    body.appendChild(W.section(T('Свет'), light));
    var pose = h('div');
    envRange(pose, dyn, env, { key: 'pitch', label: T('Наклон вперёд-назад (USB вверх +)'), min: -90, max: 90, step: 1, fmt: function (v) { return v + '°'; } });
    envRange(pose, dyn, env, { key: 'roll', label: T('Наклон вправо-влево'), min: -90, max: 90, step: 1, fmt: function (v) { return v + '°'; } });
    envRange(pose, dyn, env, { key: 'yaw', label: T('Курс (разворот платы, 0° = USB на север)'), min: 0, max: 359, step: 1, fmt: function (v) { return v + '°'; } });
    var pb = h('div', { cls: 'btnrow' });
    var shake = h('button', { type: 'button', cls: 'btn with-ic' }, Q.icon('shake'), h('span', { text: T('Встряхнуть') }));
    shake.addEventListener('click', function () { env.shakeNow(); });
    var level = h('button', { type: 'button', cls: 'btn with-ic' }, Q.icon('level'), h('span', { text: T('Положить ровно') }));
    level.addEventListener('click', function () { env.pitch = 0; env.roll = 0; });
    pb.appendChild(shake); pb.appendChild(level);
    pose.appendChild(pb);
    body.appendChild(W.section(T('Положение платы (акселерометр, гироскоп, компас, наклон)'), pose));
    var misc = h('div', { cls: 'ctl' });
    var ir = h('input', { type: 'checkbox' });
    ir.addEventListener('change', function () { env.irCoupling = ir.checked; });
    misc.appendChild(h('div', { cls: 'ctl-row' }, h('label', { text: T('ИК-передатчик виден ИК-приёмнику на плате') }), h('span', { cls: 'switch' }, ir, h('i'))));
    dyn.push(function () { if (ir.checked !== env.irCoupling) ir.checked = env.irCoupling; });
    body.appendChild(W.section(T('Свет между модулями'), misc));
  };

  /* ---------------------------------------------------------------- the board itself */
  Inspector.prototype.buildBoard = function () {
    var self = this, b = this.board, body = this.body, dyn = this.dyn;
    body.appendChild(h('div', { cls: 'title-row' }, h('h2', { text: T('Плата q.bit') })));
    var info = h('div'); body.appendChild(W.section(T('Питание'), info));
    var soc = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': T('Заряд аккумулятора') }), socV = h('span', { cls: 'val' });
    soc.addEventListener('input', function () { b.pw.soc = +soc.value; });
    body.appendChild(h('div', { cls: 'ctl' }, h('div', { cls: 'ctl-row' }, h('label', { text: T('Заряд аккумулятора') }), socV), soc));
    var ports = h('div');
    body.appendChild(W.section(T('Выходы 5 В портов (PORT_EN, eFuse 1,8 А)'), ports));
    var rows = [];
    b.ports.forEach(function (p) {
      var cb = h('input', { type: 'checkbox' });
      cb.addEventListener('change', function () { b.setPortEnable(p.n, cb.checked); });
      var txt = h('span', { cls: 'mono' });
      ports.appendChild(h('div', { cls: 'ctl-row', style: { marginBottom: '6px' } }, h('label', { text: 'P' + p.n }), txt, h('span', { cls: 'switch' }, cb, h('i'))));
      rows.push([p, cb, txt]);
    });
    // raw bus tools
    var sel = h('select', { cls: 'sel', 'aria-label': T('Канал I²C') });
    sel.appendChild(h('option', { value: '0', text: T('все каналы выключены') }));
    for (var i = 1; i <= 8; i++) sel.appendChild(h('option', { value: String(1 << (i - 1)), text: T('канал порта P%1', i) }));
    sel.appendChild(h('option', { value: '255', text: T('все каналы сразу') }));
    var out = h('div', { cls: 'note' });
    var scan = h('button', { cls: 'btn small', type: 'button', text: T('Сканировать шину I²C (IO17/IO18)') });
    scan.addEventListener('click', function () {
      var prev = b.i2c.muxMask; b.i2c.write(0x74, [+sel.value]);
      out.textContent = T('Отвечают: %1', b.i2c.scan().map(function (a) { return U.hex(a); }).join(', '));
      b.i2c.write(0x74, [prev]);
    });
    var trace = h('div', { cls: 'i2ctrace' });
    body.appendChild(W.section(T('Шина I²C портов (TCA9548A 0x74)'), [sel, h('div', { style: { height: '8px' } }), scan, out, h('div', { style: { height: '8px' } }), trace]));
    var acts = h('div', { cls: 'btnrow' });
    [[T('Перезагрузить (RESET)'), function () { b.pressButton('reset', true); b.pressButton('reset', false); }],
     [T('Снять все модули'), function () { self.app.clearBoard(); }]].forEach(function (a) {
      var bt = h('button', { type: 'button', cls: 'btn', text: a[0] }); bt.addEventListener('click', a[1]); acts.appendChild(bt);
    });
    body.appendChild(W.section(T('Действия'), acts));
    var tick = 0;
    dyn.push(function () {
      var pw = b.pw;
      info.textContent = '';
      info.appendChild(W.kv([[T('Источник'), pw.src.label], [T('Прошивка'), b.mcu.state === 'run' ? T('работает') : b.mcu.state === 'boot' ? T('загрузка…') : b.mcu.state === 'dfu' ? T('режим загрузчика') : T('выключена')],
        ['5V_MAIN', pw.on ? T('%1 В', pw.v5.toFixed(2)) : '—'], [T('Ток (INA226)'), T('%1 мА', Math.round(pw.iMa))], [T('Мощность'), T('%1 Вт', pw.pW.toFixed(2))],
        ['VBUS', pw.vbus ? T('%1 В', pw.vbus.toFixed(1)) : '—'], [T('Аккумулятор'), T('%1 В · %2', pw.vbat.toFixed(2), (pw.charging ? T('заряжается') : pw.src.usb ? T('заряжен') : T('разряжается')))],
        ['Wi-Fi', b.wifi.ssid], [T('Бюджет тока'), T('%1 / %2 мА', Math.round(b.declaredMa()), Math.round(b.budgetMa()))]]));
      if (document.activeElement !== soc) soc.value = Math.round(pw.soc);
      socV.textContent = Math.round(pw.soc) + ' %';
      soc.style.setProperty('--p', pw.soc + '%');
      rows.forEach(function (r) {
        var p = r[0];
        if (document.activeElement !== r[1]) r[1].checked = p.en;
        r[2].textContent = (p.on ? T('%1 В · %2 мА', p.v.toFixed(2), Math.round(p.iMa)) : T('выкл')) + (p.pg ? '' : p.on ? ' · PG!' : '');
      });
      if ((tick++ % 3) === 0) {
        trace.textContent = '';
        b.i2c.trace.slice(-10).forEach(function (t) {
          trace.appendChild(h('div', { cls: t.ack ? '' : 'nack', text: t.t.toFixed(2) + ' ' + t.op + ' ' + U.hex(t.addr) + (t.bytes.length ? ' [' + t.bytes.map(function (v) { return v.toString(16).padStart(2, '0'); }).join(' ') + ']' : '') + (t.ack ? '' : ' NACK') }));
        });
      }
    });
  };

  Q.Inspector = Inspector;
})(typeof globalThis !== 'undefined' ? globalThis : this);
