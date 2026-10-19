/* The IDE shell: the layout of the mock (top bar with Run / Pause / Stop, blocks and Python tabs, categories and blocks on the left,
   console / devices / data below, the board on the right) and everything that ties the pieces together:

     blocks ──generate──> Python ──run──> device (simulator, or a real board)
                                              │
        highlight / warnings / console  <─────┘  (the device reports lines, errors, prints, ports)

   Q.ide is the running instance. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h;
  var $ = function (id) { return document.getElementById(id); };

  var PROJECT = 'qbit-ide-project-v1', PREFS = 'qbit-ide-prefs-v1';
  var STATUS_TEXT = { idle: T('Готов'), running: T('Выполняется'), paused: T('Пауза'), finished: T('Программа завершилась'), stopped: T('Остановлено'), error: T('Ошибка') };

  function Ide() {
    this.hub = new Q.DeviceHub();
    this.runMap = {}; this.runCode = '';
    this.mode = 'blocks';
    this.saveTimer = 0;
    this.prefs = this.loadPrefs();
    this.project = { name: T('Новый проект') };
    this.link = null;
    this.errorBlock = null;
  }
  var I = Ide.prototype;

  /* ---------------------------------------------------------------- storage */
  I.loadPrefs = function () { try { return JSON.parse(G.localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; } };
  I.savePrefs = function () { try { G.localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch (e) { /* private mode */ } };
  I.device = function () { return this.hub.active; };

  /* ---------------------------------------------------------------- start */
  I.start = function () {
    var self = this;
    Q.installDefs($('svg-defs'));

    // the simulated board with its picture, the module box and the inspector
    this.app = new Q.App({ ide: true, store: 'qbit-ide-board-v1' }).start();
    var app = this.app;
    app.toggleMenu = function () { self.toggleMenu(); };
    var selectOrig = app.inspector.select.bind(app.inspector);
    app.inspector.select = function (n) { selectOrig(n); if (n) self.leftTab('props'); };

    this.sim = new Q.SimDevice(app);
    this.hub.add(this.sim);
    if (Q.RemoteLink) this.link = new Q.RemoteLink(this);

    // the editor
    this.editor = new Q.BlockEditor($('blockly-div'), {});
    this.codeView = new Q.CodeView($('code-view'));
    this.console = new Q.ConsolePane($('pane-console'), this);
    this.data = new Q.DataPane($('pane-data'), this);
    this.devices = new Q.DevicesPane($('device-list'), this);

    Q.Blocks.hooks.portOptions = function (mod) { return self.portOptions(mod); };
    Q.Blocks.hooks.moduleAt = function (n) { var p = self.ports()[n - 1]; return p && p.key; };

    this.wireDevice(this.sim);
    this.hub.on('select', function (d, was) { if (was) self.unwireDevice(was); self.wireDevice(d); self.deviceChanged(); });
    this.editor.on('change', function (code) { self.onEditorChange(code); });
    this.editor.on('select', function () {});
    app.onKit = function (k) { self.prefs.kit = k; self.savePrefs(); self.editor.refreshToolbox({ kit: k }); if ($('sel-kit')) $('sel-kit').value = String(k); };
    // the header sound button also mutes the clicks of the blocks
    var blockAudio = this.editor.ws.getAudioManager(), setSound = app.sound.setEnabled;
    app.sound.setEnabled = function (on) { setSound.call(this, on); blockAudio.setMuted(!on); };
    blockAudio.setMuted(!app.sound.enabled);
    app.frameHooks.push(function (dt) { self.data.frame(dt); });

    this.buildChrome();
    this.loadProject();
    this.deviceChanged();
    this.syncRun();
    G.QBIT.ide = this;
    this.editor.resize();
    return this;
  };

  /* ---------------------------------------------------------------- ports */
  I.ports = function () { var d = this.device(); return d ? d.ports() : []; };
  I.portOptions = function (mod) {
    var ports = this.ports(), out = [];
    for (var i = 1; i <= 8; i++) {
      var p = ports[i - 1], label = T('порт %1', i);
      if (p && p.key) label += ' · ' + p.title.toLowerCase();
      out.push([label, String(i)]);
    }
    return out;
  };
  I.deviceChanged = function () {
    var d = this.device();
    $('target-name').textContent = d && d.kind !== 'sim' ? T('Отключить') : T('Подключить');
    $('btn-target').title = d && d.kind !== 'sim' ? T('Отключить «%1» и вернуться к симулятору', d.name) : T('Подключить настоящую плату (Wi-Fi или USB)');
    $('btn-target').classList.toggle('on', !!(d && d.connected));
    var self = this;
    clearTimeout(this._tb);
    this._tb = setTimeout(function () {
      var ports = self.ports();
      self.editor.refreshToolbox({ ports: ports, kit: self.app.kit });
      self.editor.checkPorts(ports);
    }, 150);
    this.updatePower();
    this.syncRun();
  };

  /* ---------------------------------------------------------------- device events */
  I.wireDevice = function (d) {
    var self = this, off = [];
    off.push(d.on('print', function (s) { self.console.print(s); }));
    off.push(d.on('error', function (e) { self.showError(e); }));
    off.push(d.on('status', function (s) { self.onStatus(s); }));
    off.push(d.on('line', function (n) { self.onLine(n); }));
    off.push(d.on('ports', function () { self.deviceChanged(); }));
    off.push(d.on('power', function () { self.updatePower(); }));
    off.push(d.on('connection', function () { self.deviceChanged(); }));
    d._offs = off;
    if (d.kind === 'sim') {
      d.board.on('log', function (e) { self.console.boardLog(e); });
    }
  };
  I.unwireDevice = function (d) { (d._offs || []).forEach(function (f) { f(); }); d._offs = []; };

  I.onEditorChange = function (code) {
    if (this.mode === 'python') this.codeView.render(code.code);
    this.editor.checkPorts(this.ports());
    var self = this;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () { self.saveProject(); }, 600);
  };

  /* ---------------------------------------------------------------- running */
  I.run = function () {
    var self = this, d = this.device();
    if (!d) return;
    if (!d.connected) { this.console.line('err', T('Устройство «%1» не подключено.', d.name)); this.bottomTab('devices'); return; }
    var gen = this.editor.regenerate();
    if (!gen.hats) {
      this.console.line('warn', T('Нечего запускать: поставьте блок «когда программа запущена» (или «когда …»), а под него — остальные блоки.'));
      this.bottomTab('console');
      return;
    }
    this.clearError();
    this.runMap = gen.map; this.runCode = gen.code;
    this.console.line('info', T('Запуск на «%1»', d.name), { icon: 'play' });
    try { d.run(gen.code, gen.map); }
    catch (e) { this.showError({ message: (e.type ? e.type + ': ' : '') + (e.msg || e.message), line: e.line, type: e.type }); }
    this.syncRun();
  };
  I.stop = function () { var d = this.device(); if (d) d.stop(); this.syncRun(); };
  I.pauseResume = function () {
    var d = this.device();
    if (!d) return;
    if (d.status === 'paused') d.resume(); else if (d.status === 'running') d.pause();
    this.syncRun();
  };
  I.onStatus = function (s) {
    var d = this.device();
    if (s === 'finished') this.console.line('info', T('Программа завершилась'));
    else if (s === 'stopped') { this.console.line('info', T('Остановлено'), { icon: 'stop' }); this.editor.clearGlow(); }
    else if (s === 'paused') this.console.line('info', T('Пауза'), { icon: 'pause' });
    this.syncRun();
  };
  I.syncRun = function () {
    var d = this.device(), s = d ? d.status : 'idle';
    var active = s === 'running' || s === 'paused';
    $('btn-run').title = active ? T('Перезапустить программу (Ctrl+Enter)') : T('Запустить программу (Ctrl+Enter)');
    $('btn-pause').disabled = !active;
    $('btn-pause').title = s === 'paused' ? T('Продолжить программу') : T('Приостановить программу');
    $('btn-pause').setAttribute('aria-label', s === 'paused' ? T('Продолжить') : T('Пауза'));
    $('btn-stop').disabled = !active;
    var el = $('run-status');
    el.className = 'ide-status ' + s;
    el.querySelector('span').textContent = STATUS_TEXT[s] + (active && d && d.kind !== 'sim' ? ' · ' + d.name : '');
    document.body.classList.toggle('program-running', active);
  };
  I.onLine = function (n) {
    var id = this.runMap[n];
    if (id) this.editor.pulse(id);
    if (this.mode === 'python') this.codeView.flash(n);
  };
  I.showError = function (e) {
    var self = this, line = e.line || 0, id = this.runMap[line];
    // a line inside a block's own code (a hat or a loop) belongs to the nearest block above it
    for (var l = line; !id && l > 0; l--) id = this.runMap[l];
    this.console.line('err', e.message + (line ? '  (' + T('строка %1', line) + ')' : ''), id ? { icon: 'alert', onClick: function () { self.showBlock(id); }, title: T('Показать блок с ошибкой') } : { icon: 'alert' });
    this.editor.clearGlow();
    if (id) this.flagError(id);
    this.bottomTab('console', true);
    this.syncRun();
  };
  I.flagError = function (id) {
    this.clearError();
    var b = this.editor.ws.getBlockById(id);
    if (!b || !b.getSvgRoot) return;
    this.errorBlock = id;
    b.getSvgRoot().classList.add('qbit-error');
    this.editor.select(id);
  };
  I.clearError = function () {
    if (!this.errorBlock) return;
    var b = this.editor.ws.getBlockById(this.errorBlock);
    if (b && b.getSvgRoot && b.getSvgRoot()) b.getSvgRoot().classList.remove('qbit-error');
    this.errorBlock = null;
  };
  I.showBlock = function (id) { this.setMode('blocks'); this.editor.select(id); };
  I.consoleCleared = function () {};

  /* ---------------------------------------------------------------- the chrome around */
  I.buildChrome = function () {
    var self = this;
    $('btn-run').addEventListener('click', function () { self.run(); });
    $('btn-pause').addEventListener('click', function () { self.pauseResume(); });
    $('btn-stop').addEventListener('click', function () { self.stop(); });
    $('btn-file').addEventListener('click', function (e) { e.stopPropagation(); self.toggleMenu(); });
    $('btn-lang').addEventListener('click', function (e) { e.stopPropagation(); self.langMenu(); });
    $('lang-short').textContent = Q.i18n.langs.filter(function (l) { return l.id === Q.i18n.lang; })[0].short;
    $('btn-save').addEventListener('click', function () { self.saveProject(); self.exportFile(); });
    $('btn-target').addEventListener('click', function () {
      var d = self.device();
      if (d && d.kind !== 'sim') d.disconnect(); else self.leftTab('devices');
    });
    $('tab-blocks').addEventListener('click', function () { self.setMode('blocks'); });
    $('tab-python').addEventListener('click', function () { self.setMode('python'); });
    ['console', 'modules', 'props', 'data', 'devices'].forEach(function (t) { $('btab-' + t).addEventListener('click', function () { self.leftTab(t); }); });
    $('btn-board').addEventListener('click', function () { self.toggleBoard(); });
    $('project-name').addEventListener('input', function () { self.project.name = this.value; clearTimeout(self.saveTimer); self.saveTimer = setTimeout(function () { self.saveProject(); }, 500); });
    $('project-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });

    // block search: the round button under the categories opens the field; the cross or Esc clears it and closes it
    var search = $('block-search');
    $('btn-find').addEventListener('click', function () { self.openFind($('find-pop').hidden); });
    $('find-close').addEventListener('click', function () { self.openFind(false); });
    search.addEventListener('input', function () { clearTimeout(self.findTimer); self.findTimer = setTimeout(function () { self.applyFind(); }, 180); });
    search.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); self.openFind(false); } });
    search.addEventListener('blur', function () {          // an empty field closes when it loses the focus
      setTimeout(function () { if (!search.value.trim() && document.activeElement !== search) self.openFind(false); }, 150);
    });
    this.buildKitField();

    G.addEventListener('resize', function () { self.editor.resize(); });
    G.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); self.run(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); self.saveProject(); self.app.toast(T('Сохранено'), 'ok', 'save'); }
      else if (e.key === 'Escape' && tag !== 'input' && tag !== 'textarea') { self.closeMenu(); var d = self.device(); if (d && d.running && d.running()) self.stop(); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#menu') && !e.target.closest('#btn-file') && !e.target.closest('#btn-lang')) self.closeMenu(); });

    // the left column is a sheet on narrow screens
    this.boardVisible = false;
    this.applyBoard();
    // battery chip
    setInterval(function () { self.updatePower(); }, 1000);
  };

  I.setMode = function (mode) {
    this.mode = mode;
    var py = mode === 'python';
    $('tab-blocks').setAttribute('aria-selected', String(!py));
    $('tab-python').setAttribute('aria-selected', String(py));
    $('blockly-div').hidden = py;
    $('code-view').hidden = !py;
    document.body.classList.toggle('mode-python', py);
    if (py) this.codeView.render(this.editor.regenerate().code);
    else this.editor.resize();
  };
  I.openFind = function (open) {
    var pop = $('find-pop'), search = $('block-search');
    pop.hidden = !open;
    $('btn-find').setAttribute('aria-expanded', String(open));
    if (open) search.focus();
    else if (search.value) { search.value = ''; clearTimeout(this.findTimer); this.applyFind(); }
  };
  I.applyFind = function () {
    var q = $('block-search').value.trim();
    this.editor.refreshToolbox({ query: q });
    if (q) this.editor.searchSelect();
  };
  var PANES = { console: 'pane-console', modules: 'tray', props: 'side', data: 'pane-data', devices: 'pane-devices' };
  /** one tab bar for everything under the board picture */
  I.leftTab = function (name) {
    Object.keys(PANES).forEach(function (t) {
      $('btab-' + t).setAttribute('aria-selected', String(t === name));
      $(PANES[t]).hidden = t !== name;
    });
    this.tab = name;
    if (name === 'devices') this.devices.render();
    if (!this.boardVisible && G.innerWidth < 1100 && name !== 'console') { this.boardVisible = true; this.applyBoard(); }
  };
  I.bottomTab = function (name) { this.leftTab(name); };
  I.rightTab = function (name) { this.leftTab(name); };
  I.toggleBoard = function () { this.boardVisible = !this.boardVisible; this.applyBoard(); };
  I.applyBoard = function () {
    $('ide').classList.toggle('board-visible', this.boardVisible);
    $('btn-board').setAttribute('aria-pressed', String(this.boardVisible));
    var self = this; setTimeout(function () { self.editor.resize(); }, 60);
  };

  I.updatePower = function () {
    var d = this.device(), p = d ? d.power() : null;
    $('top-batt-text').textContent = p ? p.battery + '%' : '—';
    $('top-batt').classList.toggle('charging', !!(p && p.charging));
    var fill = $('top-batt-fill');
    if (p) { fill.setAttribute('width', String(Math.max(0.5, 15 * p.battery / 100))); fill.setAttribute('fill', p.battery < 15 ? '#d93a4d' : p.battery < 35 ? '#c27a00' : '#12a36b'); }
  };

  /* ---------------------------------------------------------------- project */
  /** saving is silent; only a failure is worth a word */
  I.saveProject = function () {
    try { G.localStorage.setItem(PROJECT, JSON.stringify({ v: 1, rev: 2, name: this.project.name, blocks: this.editor.serialize() })); }
    catch (e) { this.app.toast(T('Не удалось сохранить проект в браузере'), 'err', 'save'); }
  };
  I.loadProject = function () {
    var saved = null;
    try { saved = JSON.parse(G.localStorage.getItem(PROJECT) || 'null'); } catch (e) { /* ignore */ }
    if (saved && saved.v === 1 && saved.blocks && !untouchedStartExample(saved)) {
      this.project.name = saved.name || T('Мой проект');
      try { this.editor.load(saved.blocks); } catch (e) { if (G.console) G.console.error(e); this.editor.clear(); }
    } else {
      this.project.name = T('Новый проект');                // the first start is an empty project (examples are in File)
      this.editor.clear();
    }
    $('project-name').value = this.project.name;
  };
  /** versions before rev 2 opened the first example at the first start and saved it as the project: a save of theirs that is still
      exactly that example counts as no project (an example opened on purpose is saved with rev 2 and stays) */
  function untouchedStartExample(saved) {
    var ex = Q.Examples && Q.Examples.list[0], count = function (j) { return (JSON.stringify(j).match(/"type":/g) || []).length; };
    return !saved.rev && !!ex && saved.name === ex.title && count(saved.blocks) === count(ex.build({ led: 1 }));
  }
  I.newProject = function () {
    if (this.editor.ws.getAllBlocks(false).length && !G.confirm(T('Начать новый проект? Текущие блоки пропадут (сохраните их в файл, если нужны).'))) return;
    this.stop();
    this.project.name = T('Новый проект'); $('project-name').value = this.project.name;
    this.editor.clear(); this.saveProject();
  };
  I.exportFile = function () {
    var data = JSON.stringify({ app: 'qbit-ide', v: 1, name: this.project.name, blocks: this.editor.serialize(), board: this.sim.board.serialize() }, null, 1);
    this.download(this.fileName() + '.qbit.json', data, 'application/json');
  };
  I.exportPython = function () { this.download(this.fileName() + '.py', this.editor.regenerate().code, 'text/x-python'); };
  I.fileName = function () { return (this.project.name || 'project').replace(/[^\wа-яё\- ]+/gi, '').trim().replace(/\s+/g, '-') || 'project'; };
  I.download = function (name, text, type) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  I.importFile = function () {
    var self = this, inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var j = JSON.parse(r.result);
          if (!j.blocks) throw new Error(T('в файле нет блоков'));
          self.stop();
          if (j.board && self.sim.board && j.app === 'qbit-ide') { self.sim.board.restore(j.board); self.app.bv.syncFromBoard(); self.app.tray.refresh(); }
          self.project.name = j.name || f.name.replace(/\.qbit\.json$|\.json$/i, ''); $('project-name').value = self.project.name;
          self.editor.load(j.blocks); self.saveProject();
          self.app.toast(T('Проект открыт: %1', f.name), 'ok', 'imp');
        } catch (e) { self.app.toast(T('Не получилось открыть файл: %1', e.message), 'err', 'imp'); }
      };
      r.readAsText(f);
    });
    inp.click();
  };

  /* ---------------------------------------------------------------- examples */
  I.examplesMenu = function () {
    var self = this, m = $('menu');
    if (!m.hidden && m.dataset.kind === 'examples') return this.closeMenu();
    m.textContent = ''; m.dataset.kind = 'examples';
    m.classList.add('wide');
    Q.Examples.list.forEach(function (ex) {
      var btn = h('button', { type: 'button' }, h('b', { text: ex.title }), h('small', { text: ex.info }));
      btn.addEventListener('click', function () { self.closeMenu(); self.openExample(ex); });
      m.appendChild(btn);
    });
    var r = $('btn-file').getBoundingClientRect();
    m.style.left = Math.max(8, r.left) + 'px'; m.style.top = (r.bottom + 6) + 'px'; m.style.right = 'auto'; m.style.bottom = 'auto';
    m.hidden = false;
  };
  I.toggleMenu = function () {
    var self = this, m = $('menu');
    if (!m.hidden && m.dataset.kind === 'main') return this.closeMenu();
    m.textContent = ''; m.dataset.kind = 'main'; m.classList.remove('wide');
    var item = function (ic, t, fn) { var b = h('button', { type: 'button' }, Q.icon(ic), h('span', { text: t })); b.addEventListener('click', function () { self.closeMenu(); fn(); }); m.appendChild(b); };
    item('file-plus', T('Новый проект'), function () { self.newProject(); });
    item('book', T('Примеры…'), function () { setTimeout(function () { self.examplesMenu(); }, 0); });
    item('pencil', T('Переименовать проект…'), function () {
      var n = G.prompt(T('Название проекта'), self.project.name);
      if (n !== null && n.trim()) { self.project.name = n.trim().slice(0, 60); $('project-name').value = self.project.name; self.saveProject(); }
    });
    item('folder', T('Открыть из файла…'), function () { self.importFile(); });
    item('save', T('Сохранить в файл'), function () { self.exportFile(); });
    item('code', T('Сохранить как Python (.py)'), function () { self.exportPython(); });
    m.appendChild(h('hr'));
    item('trash', T('Снять все модули с платы'), function () { self.sim.board.clear(); });
    item('refresh', T('Сбросить симулятор'), function () { try { G.localStorage.removeItem('qbit-ide-board-v1'); } catch (e) { /* ignore */ } G.location.reload(); });
    var r = $('btn-file').getBoundingClientRect();
    m.style.left = Math.max(8, r.left) + 'px'; m.style.right = 'auto'; m.style.top = (r.bottom + 6) + 'px'; m.style.bottom = 'auto';
    m.hidden = false;
  };
  /** For which kit's modules the Modules tab and the block palette offer blocks (attached modules always have theirs): a list at the top of the Modules tab */
  I.buildKitField = function () {
    var self = this, head = $('tray') && $('tray').querySelector('.tray-head');
    if (!head || $('sel-kit')) return;
    var sel = h('select', { id: 'sel-kit', 'aria-label': T('Комплект модулей') });
    [T('Старт'), T('Базовый'), T('Продвинутый'), T('Профи')].forEach(function (name, i) {
      var k = i + 1, count = Q.moduleList().filter(function (d) { return d.kit <= k; }).length;
      sel.appendChild(h('option', { value: String(k), text: T('Комплект %1 · %2', k, name) + ' · ' + T('%1 модулей', count) }));
    });
    sel.value = String(this.app.kit);
    sel.addEventListener('change', function () { self.app.setKit(+sel.value); });
    head.insertBefore(h('label', { cls: 'field kit-field', title: T('Какие модули показывать в блоках') }, Q.icon('board'), sel), head.firstChild);
  };
  /** the interface language: Russian, Uzbek, English (names in their own language); the page reloads in the new one, the project is kept */
  I.langMenu = function () {
    var self = this, m = $('menu');
    if (!m.hidden && m.dataset.kind === 'lang') return this.closeMenu();
    m.textContent = ''; m.dataset.kind = 'lang'; m.classList.remove('wide');
    Q.i18n.langs.forEach(function (l) {
      var b = h('button', { type: 'button', cls: 'kit-row', lang: l.id }, h('span', { text: l.name }), l.id === Q.i18n.lang ? Q.icon('check') : null);
      b.addEventListener('click', function () { self.closeMenu(); self.setLanguage(l.id); });
      m.appendChild(b);
    });
    var r = $('btn-lang').getBoundingClientRect();
    m.style.left = 'auto'; m.style.right = Math.max(8, G.innerWidth - r.right) + 'px'; m.style.top = (r.bottom + 6) + 'px'; m.style.bottom = 'auto';
    m.hidden = false;
  };
  I.setLanguage = function (id) {
    if (id === Q.i18n.lang) return;
    clearTimeout(this.saveTimer);
    this.saveProject(); this.app.save();
    Q.i18n.setLang(id);
  };
  I.closeMenu = function () { var m = $('menu'); if (m) { m.hidden = true; m.dataset.kind = ''; } };

  /** open an example: put the modules it needs on the simulator board, fill in their ports, load the blocks */
  I.openExample = function (ex, quiet) {
    var d = this.device(), self = this;
    if (!quiet && this.editor.ws.getAllBlocks(false).length && !G.confirm(T('Заменить текущую программу примером «%1»?', ex.title))) return;
    this.stop();
    var board = this.sim.board, ports = {};
    function place(key) {
      var def = Q.moduleDef(key), j;
      for (j = 1; j <= 8; j++) if (board.canPlace(j, def).ok) { try { board.attach(j, key, key === 'led' ? { variant: 'green' } : undefined); return j; } catch (e) { /* try the next port */ } }
      return 0;
    }
    ex.needs.forEach(function (key) {
      var n = 0;
      for (var i = 1; i <= 8; i++) { var m = board.port(i).module; if (m && m.key === key) { n = i; break; } }
      if (!n && d === self.sim) {
        n = place(key);
        // no room: take off a module this example does not use (from the last port backwards) and try again
        for (var k = 8; !n && k >= 1; k--) {
          var occ = board.port(k).module;
          if (occ && ex.needs.indexOf(occ.key) < 0) { board.detach(k); n = place(key); }
        }
      }
      ports[key] = n || 1;
    });
    this.app.bv.syncFromBoard(); this.app.tray.refresh();
    this.project.name = ex.title; $('project-name').value = ex.title;
    this.editor.load(ex.build(ports));
    this.saveProject();
  };

  Q.Ide = Ide;
  /** Blockly measures every block's text when it draws it, so the editor starts once the page font is there (or after a short wait) */
  function boot() {
    var go = function () { new Ide().start(); };
    var f = G.document && G.document.fonts;
    if (!f || !f.load) return go();
    var done = false, once = function () { if (!done) { done = true; go(); } };
    Promise.all([f.load('600 12px Montserrat', 'Абв'), f.load('600 12px Montserrat', 'Abc')]).then(once, once);
    setTimeout(once, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
