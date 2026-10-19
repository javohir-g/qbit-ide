/* The block editor: a Blockly workspace with the q.bit look, plus what the IDE needs around it:
   regenerating Python on every change, highlighting the block that is running, warnings when a block points at a port
   with the wrong (or no) module, saving and loading.

   const ed = new Q.BlockEditor(element, { media: 'vendor/blockly/media/' });
   ed.on('change', fn)           workspace changed by the user (debounced); fn(code)
   ed.code -> { code, map, hats }   the current program
   ed.serialize() / ed.load(json)   project data
   ed.refreshToolbox({ kit, ports, query })
   ed.pulse(blockId)             flash the running block
   ed.checkPorts(ports)          warnings for blocks whose port holds another module */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var START_SCALE = 0.8;                 // the workspace starts at this zoom and the palette of blocks stays at it
  var FLYOUT_SCALE = START_SCALE;

  /** Blockly fetch()es its sounds from media/, which a page opened from a file may not do:
      the sounds come from js/ide/sounds.js (data: URLs) instead, on every page */
  function builtInSounds(Blockly) {
    var A = Blockly.WorkspaceAudio, data = Q.BLOCKLY_SOUNDS;
    if (!A || !data || A.prototype.qbitSounds) return;
    var load = A.prototype.load;
    A.prototype.load = function (files, name) { return load.call(this, data[name] ? [data[name]] : files, name); };
    A.prototype.qbitSounds = true;
  }

  function BlockEditor(el, opts) {
    opts = opts || {};
    var self = this, Blockly = G.Blockly;
    this.Blockly = Blockly;
    this.el = el;
    this.listeners = { change: [], select: [], ready: [] };
    this.toolboxState = { kit: 4, ports: [], query: '', all: false };
    this.running = {};                                   // blockId -> time it stops glowing
    this.timer = 0;
    this.code = { code: '', map: {}, hats: 0 };

    Q.i18n.blockly(Blockly);                             // Blockly's own sentences (menus, variables, built-in blocks)
    Q.Blocks.install(Blockly);
    builtInSounds(Blockly);
    this.ws = Blockly.inject(el, {
      toolbox: Q.Toolbox.build(this.toolboxState),
      theme: Q.Toolbox.theme(Blockly),
      renderer: 'zelos',
      media: opts.media || G.QBIT_MEDIA || 'vendor/blockly/media/',
      sounds: true,                                      // click / snap / delete sounds from media/
      trashcan: true,
      collapse: false,
      comments: false,
      disable: false,
      grid: { spacing: 24, length: 24, colour: '#eef5fb', snap: false },   // faint full-line grid behind the blocks
      zoom: { controls: true, wheel: true, startScale: START_SCALE, maxScale: 2, minScale: 0.35, scaleSpeed: 1.12, pinch: true },
      move: { scrollbars: true, drag: true, wheel: true },
      toolboxPosition: 'start'
    });

    this.ws.addChangeListener(function (e) {
      if (e.isUiEvent) {
        if (e.type === Blockly.Events.SELECTED) self.emit('select', e.newElementId || null);
        return;
      }
      if (e.type === Blockly.Events.FINISHED_LOADING) return;
      self.schedule();
    });
    this.skinToolbox();
    this.skinControls();
    // like in the design the block column stays open: pick the first category and keep the flyout from closing after a drag
    var tb = this.ws.getToolbox();
    this.fixFlyoutScale();
    this.layoutFlyout();
    setTimeout(function () {
      var fl = tb && tb.getFlyout && tb.getFlyout();
      if (tb && tb.selectItemByPosition && fl && !fl.autoClose) tb.selectItemByPosition(0);      // a permanent column starts open
      self.skinToolbox();
    }, 0);
    this.schedule(true);
  }
  var E = BlockEditor.prototype;

  E.on = function (name, fn) { this.listeners[name].push(fn); };
  E.emit = function (name, a) { this.listeners[name].slice().forEach(function (fn) { try { fn(a); } catch (e) { if (G.console) G.console.error(e); } }); };

  /** regenerate the program shortly after the last change */
  E.schedule = function (now) {
    var self = this;
    clearTimeout(this._t);
    this._t = setTimeout(function () { self.regenerate(); self.emit('change', self.code); }, now ? 0 : 120);
  };
  E.regenerate = function () {
    try { this.code = Q.Blocks.generate(this.ws); }
    catch (e) { this.code = { code: T('# не удалось собрать программу: %1\n', e.message), map: {}, hats: 0, error: e }; if (G.console) G.console.error(e); }
    this.markLoose();
    return this.code;
  };

  /* ---------------------------------------------------------------- project data */
  E.serialize = function () { return this.Blockly.serialization.workspaces.save(this.ws); };
  E.load = function (json) {
    this.Blockly.Events.disable();
    try { this.ws.clear(); if (json) this.Blockly.serialization.workspaces.load(json, this.ws); }
    finally { this.Blockly.Events.enable(); }
    this.ws.scrollCenter();
    this.regenerate(); this.emit('change', this.code);
  };
  E.clear = function () { this.load(null); };
  /** add blocks (an example, a pasted stack) without removing what is there */
  E.append = function (json) {
    var Blockly = this.Blockly;
    if (json && json.blocks) json.blocks.blocks.forEach(function () {});
    Blockly.serialization.workspaces.load(json, this.ws, { recordUndo: true });
  };
  E.undo = function () { this.ws.undo(false); };
  E.redo = function () { this.ws.undo(true); };
  E.resize = function () { this.layoutFlyout(); this.Blockly.svgResize(this.ws); this.alignControls(); };
  /** The blocks on offer keep one size: Blockly draws the flyout at the zoom of the workspace, so zooming the editor would resize the palette.
      A block taken from it becomes a block of the workspace (at its zoom). */
  E.fixFlyoutScale = function () {
    var tb = this.ws.getToolbox(), fl = tb && tb.getFlyout && tb.getFlyout();
    if (!fl || fl.getFlyoutScale === FIXED_SCALE) return;
    fl.getFlyoutScale = FIXED_SCALE;
    if (fl.reflow) fl.reflow();
  };
  function FIXED_SCALE() { return FLYOUT_SCALE; }

  /** On a wide window the block column is permanent (workspace starts after it, as in the design); on a narrow one it slides over the workspace and closes after a drag. */
  E.layoutFlyout = function () {
    var tb = this.ws.getToolbox(), fl = tb && tb.getFlyout && tb.getFlyout();
    if (fl) fl.autoClose = this.el.clientWidth < 1250;
  };

  /** Blockly draws its zoom buttons and the bin from a grey sprite sheet. They get the look of the other round buttons (white circle,
      thin edge, line icon from js/ui/icons.js) drawn into Blockly's own groups, so its clicks, keyboard focus and the bin's drop zone
      and opening lid stay as they are. The sprite pictures stay too, invisible (CSS): the bin measures its drop zone from them.
      In the bin's own coordinates (47 x 60) the circle sits where the zoom circles are (right-aligned), the lid hinges at its right end. */
  var CTL = { r: 15, icon: 15, binX: 31, binY: 7 };
  E.skinControls = function () {
    var root = this.el, NS = 'http://www.w3.org/2000/svg';
    function add(parent, tag, attrs, before) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      parent.insertBefore(e, before || null);
      return e;
    }
    function icon(parent, name, cx, cy, before) {
      var s = CTL.icon;
      return add(parent, 'use', { href: '#i-' + name, x: cx - s / 2, y: cy - s / 2, width: s, height: s, 'class': 'qbit-ctl-ic' }, before);
    }
    [['.blocklyZoomReset', 'focus'], ['.blocklyZoomIn', 'plus'], ['.blocklyZoomOut', 'minus']].forEach(function (z) {
      var g = root.querySelector(z[0]);
      if (!g || g.querySelector('.qbit-ctl-bg')) return;
      add(g, 'circle', { cx: 16, cy: 16, r: CTL.r, 'class': 'qbit-ctl-bg' });
      icon(g, z[1], 16, 16);
    });
    // undo / redo on top of the same column (in the zoom buttons' group, so Blockly moves them along): undo, redo, centre, +, -, bin
    var reset = root.querySelector('.blocklyZoomReset'), ws = this.ws;
    if (reset) reset.parentNode.classList.add('qbit-ctl-col');
    if (reset && !root.querySelector('.qbit-undo')) {
      [['qbit-undo', 'undo', T('Отменить (Ctrl+Z)'), -80, false], ['qbit-redo', 'redo', T('Повторить (Ctrl+Y)'), -40, true]].forEach(function (u) {
        var g = add(reset.parentNode, 'g', { 'class': 'qbit-ctl ' + u[0], role: 'button', tabindex: 0, 'aria-label': u[2], transform: 'translate(0, ' + u[3] + ')' });
        add(g, 'title', {}).textContent = u[2];
        add(g, 'circle', { cx: 16, cy: 16, r: CTL.r, 'class': 'qbit-ctl-bg' });
        icon(g, u[1], 16, 16);
        g.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        g.addEventListener('click', function (e) { e.stopPropagation(); ws.undo(u[4]); });
        g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ws.undo(u[4]); } });
      });
    }
    var bin = root.querySelector('.blocklyTrash'), lid = bin && bin.querySelector('.blocklyTrashLid');
    if (!lid || bin.querySelector('.qbit-ctl-bg')) return;
    add(bin, 'circle', { cx: CTL.binX, cy: CTL.binY, r: CTL.r, 'class': 'qbit-ctl-bg' }, lid);    // under the lid
    icon(bin, 'trash-can', CTL.binX, CTL.binY, lid);
    icon(lid, 'trash-lid', CTL.binX, CTL.binY);
    // the lid's right end (19.5, 7 in the 24-unit icon) is its hinge
    var k = CTL.icon / 24, x0 = CTL.binX - CTL.icon / 2, y0 = CTL.binY - CTL.icon / 2;
    lid.style.transformOrigin = (x0 + 19.5 * k).toFixed(2) + 'px ' + (y0 + 7 * k).toFixed(2) + 'px';
  };

  /** the column of round buttons sits --edge-gap from the editor's right and bottom edges, like Blocks / Python in the top corner */
  E.alignControls = function () {
    var el = this.el, circles = el.querySelectorAll('.qbit-ctl-bg');
    if (!circles.length) return;
    el.style.setProperty('--ctl-dx', '0px'); el.style.setProperty('--ctl-dy', '0px');
    var box = el.getBoundingClientRect(), right = -Infinity, bottom = -Infinity;
    if (!box.width) return;                                // hidden (Python view)
    circles.forEach(function (c) { var r = c.getBoundingClientRect(); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom); });
    var gap = parseFloat(G.getComputedStyle(el).getPropertyValue('--edge-gap')) || 14;
    el.style.setProperty('--ctl-dx', (box.right - gap - right).toFixed(2) + 'px');
    el.style.setProperty('--ctl-dy', (box.bottom - gap - bottom).toFixed(2) + 'px');
  };

  /* ---------------------------------------------------------------- toolbox */
  /** Blockly paints the category colour as a left border; the IDE shows it as a round dot instead (the CSS reads --cat).
      The CSS also divides the column's height between the rows: it needs to know how many there are (--n). */
  E.skinToolbox = function () {
    var root = this.el.querySelector('.blocklyToolbox');
    if (!root) return;
    var rows = root.querySelectorAll('.blocklyToolboxCategory');
    rows.forEach(function (row) {
      var c = row.style.borderLeftColor || row.getAttribute('data-cat');
      if (!c) return;
      row.setAttribute('data-cat', c); row.style.setProperty('--cat', c);
      // the dot gets the outline its blocks have: the same darker shade of the colour (the theme's colourTertiary)
      var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c), hex = m ? '#' + ((1 << 24) | (+m[1] << 16) | (+m[2] << 8) | +m[3]).toString(16).slice(1) : (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
      if (hex) row.style.setProperty('--cat-edge', Q.Toolbox.shade(hex, -0.18));
    });
    root.style.setProperty('--n', String(Math.max(1, rows.length)));
  };
  E.refreshToolbox = function (state) {
    Object.assign(this.toolboxState, state || {});
    var tb = this.ws.getToolbox();
    var sel = tb && tb.getSelectedItem ? tb.getSelectedItem() : null;
    var name = sel && sel.getName ? sel.getName() : null;
    this.ws.updateToolbox(Q.Toolbox.build(this.toolboxState));
    this.fixFlyoutScale();
    this.skinToolbox();
    if (name && this.ws.getToolbox()) {
      var items = this.ws.getToolbox().getToolboxItems();
      for (var i = 0; i < items.length; i++) if (items[i].getName && items[i].getName() === name) { this.ws.getToolbox().selectItemByPosition(i); break; }
    }
  };
  E.searchSelect = function () { var tb = this.ws.getToolbox(); if (tb) tb.selectItemByPosition(0); };

  /* ---------------------------------------------------------------- ports */
  /** warn on blocks whose port has another module (or none): ports = [{n, key, title}] */
  E.checkPorts = function (ports) {
    var byPort = {};
    (ports || []).forEach(function (p) { byPort[p.n] = p; });
    var changed = false;
    this.ws.getAllBlocks(false).forEach(function (b) {
      var warn = null, mod = b.qbitMod;
      if (b.type === 'qbit_when_event') mod = b.getFieldValue('MOD');
      if (mod && mod !== 'board' && b.getField('PORT')) {
        var n = +b.getFieldValue('PORT'), p = byPort[n], title = Q.SPEC.modules[mod] ? Q.SPEC.modules[mod].title : mod;
        if (!p || !p.key) warn = T('На порту %1 пока нет модуля. Поставьте «%2» на плату.', n, title);
        else if (p.key !== mod) warn = T('На порту %1 стоит «%2», а блок для «%3».', n, p.title, title);
      }
      if (b.type === 'qbit_event_value' && !hasEventArg(b)) warn = T('Это значение есть только внутри блока «когда …» с числом или текстом (например, энкодер повернули).');
      if ((b.qbitWarn || null) !== warn) { b.qbitWarn = warn; try { b.setWarningText(warn); } catch (e) { /* the block was just disposed */ } changed = true; }
    });
    return changed;
  };
  function hasEventArg(b) {
    var root = b.getRootBlock();
    if (root.type !== 'qbit_when_event') return false;
    var mod = root.getFieldValue('MOD'), ev = root.getFieldValue('EVENT');
    var spec = Q.SPEC.modules[mod], e = spec && spec.events.filter(function (x) { return x.n === ev; })[0];
    return !!(e && e.arg);
  }
  /** blocks outside any hat do nothing: say so on the loose stacks */
  E.markLoose = function () {
    var Blockly = this.Blockly, hats = Q.Blocks.HATS.concat(Q.Blocks.PROC_DEFS);
    this.ws.getTopBlocks(false).forEach(function (top) {
      var loose = hats.indexOf(top.type) < 0 && top.previousConnection && !top.outputConnection;
      var text = loose ? T('Эти блоки не запустятся: поставьте их под блок «когда …».') : null;
      if ((top.qbitWarn || null) !== text) { top.qbitWarn = text; try { top.setWarningText(text); } catch (e) { /* disposed */ } }
    });
  };

  /* ---------------------------------------------------------------- running highlight */
  /** glow a block for a moment (the program is executing it) */
  E.pulse = function (id) {
    if (!id) return;
    var now = performance.now();
    if (!this.running[id]) this.setGlow(id, true);
    this.running[id] = now + 380;
    if (!this.timer) this.tick();
  };
  E.tick = function () {
    var self = this;
    this.timer = G.requestAnimationFrame(function () {
      var now = performance.now(), any = false;
      Object.keys(self.running).forEach(function (id) {
        if (self.running[id] <= now) { delete self.running[id]; self.setGlow(id, false); } else any = true;
      });
      self.timer = 0;
      if (any) self.tick();
    });
  };
  E.setGlow = function (id, on) {
    var b = this.ws.getBlockById(id);
    if (!b || !b.getSvgRoot) return;
    var root = b.getSvgRoot();
    if (root) root.classList.toggle('qbit-running', on);
  };
  E.clearGlow = function () { var self = this; Object.keys(this.running).forEach(function (id) { self.setGlow(id, false); }); this.running = {}; };
  E.select = function (id) {
    var b = this.ws.getBlockById(id);
    if (!b) return;
    b.select();
    this.ws.centerOnBlock ? this.ws.centerOnBlock(id) : 0;
  };

  Q.BlockEditor = BlockEditor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
