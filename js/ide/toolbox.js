/* The Blockly theme (the look of the mock: soft Scratch-like blocks, one colour per category) and the toolbox:
   which blocks are offered, in which order, with which default values and which port already filled in.

   Q.Toolbox.theme(Blockly)                       -> Blockly theme
   Q.Toolbox.build({ kit, ports, query, all })    -> toolbox JSON for workspace.updateToolbox()
     kit    1..4: modules of the kits up to this one are offered (attached modules are always offered)
     ports  [{n, key}] what sits on the ports of the current device (shown first, and their port is the default)
     query  filter by words in the block text (the search box)
     all    true: every module, whatever the kit */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var CAT = Q.Catalog, SPEC = Q.SPEC;

  // the Scratch palette of the design: Motion, Looks, Events, Control, Sensing, Operators, Variables, My Blocks
  var COLOURS = {
    motion: '#4C97FF', action: '#9966FF', event: '#FFBF00', control: '#FFAB19', sensor: '#5CB1D6', operator: '#59C059', variable: '#FF8C1A', procedure: '#FF6680', text: '#59C059', list: '#FF661A'
  };
  // which module's actions live in which category
  var MOTION = { servo: 1, motor: 1, relay: 1, irtx: 1 };
  var LOOKS = { led: 1, rgb: 1, oled: 1, buzzer: 1 };
  var SENSOR_ACT = { button: 1, color: 1, encoder: 1, pressure: 1, compass: 1, rtc: 1 };
  function shade(hex, k) {                          // k > 0 lighter, k < 0 darker
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { return Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)); };
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }
  function style(hex, extra) { return Object.assign({ colourPrimary: hex, colourSecondary: shade(hex, 0.28), colourTertiary: shade(hex, -0.18) }, extra || {}); }

  function theme(Blockly) {
    // the same stack as --sans in css/ide.css: Blockly measures the text with this one and the page draws it with that one
    var font = 'Montserrat, "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
    return Blockly.Theme.defineTheme('qbit', {
      name: 'qbit', base: Blockly.Themes.Zelos,
      blockStyles: {
        event_blocks: style(COLOURS.event, { hat: 'cap' }), motion_blocks: style(COLOURS.motion),
        control_blocks: style(COLOURS.control), loop_blocks: style(COLOURS.control),
        action_blocks: style(COLOURS.action), sensor_blocks: style(COLOURS.sensor),
        math_blocks: style(COLOURS.operator), logic_blocks: style(COLOURS.operator), text_blocks: style(COLOURS.text), colour_blocks: style(COLOURS.operator),
        list_blocks: style(COLOURS.list), variable_blocks: style(COLOURS.variable), variable_dynamic_blocks: style(COLOURS.variable),
        procedure_blocks: style(COLOURS.procedure, { hat: 'cap' })
      },
      categoryStyles: {
        event_category: { colour: COLOURS.event }, control_category: { colour: COLOURS.control }, action_category: { colour: COLOURS.action }, sensor_category: { colour: COLOURS.sensor }, motion_category: { colour: COLOURS.motion },
        operator_category: { colour: COLOURS.operator }, variable_category: { colour: COLOURS.variable }, procedure_category: { colour: COLOURS.procedure }
      },
      componentStyles: {
        workspaceBackgroundColour: '#ffffff', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#27445f',
        flyoutBackgroundColour: '#f4faff', flyoutForegroundColour: '#27445f', flyoutOpacity: 1,
        scrollbarColour: '#b7d6ee', scrollbarOpacity: 0.7, insertionMarkerColour: '#27445f', insertionMarkerOpacity: 0.2,
        markerColour: '#1ea1ff', cursorColour: '#1ea1ff'
      },
      fontStyle: { family: font, weight: '600', size: 12 },
      startHats: true
    });
  }

  /* ---------------------------------------------------------------- toolbox */
  function num(v) { return { shadow: { type: 'math_number', fields: { NUM: v } } }; }
  function txt(v) { return { shadow: { type: 'text', fields: { TEXT: v } } }; }
  function blk(type, o) { return Object.assign({ kind: 'block', type: type }, o || {}); }

  function shadowInputs(rec) {
    var inputs = {};
    rec.args.forEach(function (a) {
      if (a.num) inputs[a.num] = num(a.def);
      if (a.text) inputs[a.text] = txt(a.def);
    });
    return inputs;
  }
  function recordBlock(rec, port) {
    var o = { fields: {}, inputs: shadowInputs(rec) };
    if (rec.args.some(function (a) { return a.port; })) o.fields.PORT = String(port);
    if (!Object.keys(o.inputs).length) delete o.inputs;
    return blk(rec.id, o);
  }

  function modulePorts(ports, key) { return (ports || []).filter(function (p) { return p.key === key; }).map(function (p) { return p.n; }); }
  function defaultPort(ports, key) {
    var here = modulePorts(ports, key);
    if (here.length) return here[0];
    var used = {}; (ports || []).forEach(function (p) { if (p.key) used[p.n] = 1; });
    for (var n = 1; n <= 8; n++) if (!used[n]) return n;
    return 1;
  }
  function kitOf(key) { var d = (Q.DATA.modules || []).filter(function (m) { return m.key === key; })[0]; return d ? d.kit : 1; }

  function words(rec) { return (rec.msg.replace(/%\d+/g, ' ') + ' ' + rec.id + ' ' + (rec.tip || '')).toLowerCase(); }
  function matches(rec, q) { return !q || q.split(/\s+/).every(function (w) { return words(rec).indexOf(w) >= 0 || (SPEC.modules[rec.mod] && SPEC.modules[rec.mod].title.toLowerCase().indexOf(w) >= 0); }); }

  function modulesInScope(opts) {
    var present = {}; (opts.ports || []).forEach(function (p) { if (p.key) present[p.key] = 1; });
    var inKit = function (k) { return opts.all || kitOf(k) <= (opts.kit || 4); };
    var list = CAT.moduleOrder.filter(function (k) { return present[k] || inKit(k); });
    // what is plugged in comes first
    return list.filter(function (k) { return present[k]; }).concat(list.filter(function (k) { return !present[k]; }));
  }

  /** blocks of the modules (those that match `pick`), grouped under a label per module; what is plugged in comes first */
  function moduleSection(pick, opts) {
    var out = [], ports = opts.ports || [], q = (opts.query || '').trim().toLowerCase();
    modulesInScope(opts).forEach(function (key) {
      var recs = CAT.forModule(key).filter(function (r) { return pick(r) && matches(r, q); });
      if (!recs.length) return;
      var here = modulePorts(ports, key), port = defaultPort(ports, key);
      var title = SPEC.modules[key] ? SPEC.modules[key].title : key;
      out.push({ kind: 'label', text: title + (here.length ? T(' · порт %1', here.join(', ')) : '') });
      recs.forEach(function (r) { out.push(recordBlock(r, port)); });
    });
    return out;
  }
  function boardSection(kind, opts) {
    var q = (opts.query || '').trim().toLowerCase();
    var recs = CAT.forModule('board').filter(function (r) { return (kind === 'action' ? r.kind === 'action' : r.kind !== 'action') && matches(r, q); });
    if (!recs.length) return [];
    var out = [{ kind: 'label', text: T('Плата') }];
    recs.forEach(function (r) { out.push(recordBlock(r, 1)); });
    return out;
  }

  function build(opts) {
    opts = opts || {};
    var q = (opts.query || '').trim().toLowerCase();
    var ports = opts.ports || [];
    var eventDefault = (function () {
      var p = ports.filter(function (x) { return x.key && SPEC.modules[x.key] && SPEC.modules[x.key].events.length; })[0];
      return p ? { MOD: p.key, PORT: String(p.n), EVENT: SPEC.modules[p.key].events[0].n } : { MOD: 'button', PORT: String(defaultPort(ports, 'button')), EVENT: 'press' };
    })();

    var events = [
      blk('qbit_when_started'),
      blk('qbit_when_event', { fields: eventDefault }),
      blk('qbit_when_pair', { fields: { EVENT: 'click' } }),
      blk('qbit_when_message', { fields: { MSG: T('старт') } }),
      blk('qbit_send_message', { fields: { MSG: T('старт') } }),
      blk('qbit_event_value')
    ];
    var control = [
      blk('qbit_wait', { inputs: { SEC: num(1) } }),
      blk('qbit_repeat', { inputs: { TIMES: num(10) } }),
      blk('qbit_forever'),
      blk('controls_if'),
      blk('controls_if', { extraState: { hasElse: true } }),
      blk('qbit_wait_until'),
      blk('qbit_repeat_until'),
      blk('qbit_while'),
      blk('qbit_for', { fields: { VAR: { name: 'i' } }, inputs: { FROM: num(1), TO: num(10), BY: num(1) } }),
      blk('controls_flow_statements'),
      blk('qbit_stop')
    ];
    var console_ = [{ kind: 'label', text: T('Консоль') }, blk('qbit_print', { inputs: { TEXT: txt(T('Привет!')) } })];
    var operators = [
      blk('math_arithmetic', { inputs: { A: num(1), B: num(1) } }),
      blk('math_number'),
      blk('math_random_int', { inputs: { FROM: num(1), TO: num(100) } }),
      blk('math_modulo', { inputs: { DIVIDEND: num(10), DIVISOR: num(3) } }),
      blk('math_round', { inputs: { NUM: num(3.7) } }),
      blk('math_single', { inputs: { NUM: num(9) } }),
      blk('qbit_map', { inputs: { X: num(50), A: num(0), B: num(100), C: num(0), D: num(180) } }),
      blk('qbit_constrain', { inputs: { X: num(120), A: num(0), B: num(100) } }),
      blk('logic_compare'),
      blk('logic_operation'),
      blk('logic_negate'),
      blk('logic_boolean'),
      blk('logic_ternary'),
      blk('text', { fields: { TEXT: T('текст') } }),
      blk('text_join'),
      blk('text_length', { inputs: { VALUE: txt(T('текст')) } })
    ];
    var isAction = function (r) { return r.kind === 'action'; };
    var motion = moduleSection(function (r) { return isAction(r) && MOTION[r.mod]; }, opts);
    var looks = moduleSection(function (r) { return isAction(r) && LOOKS[r.mod]; }, opts).concat(boardSection('action', opts), console_);
    var sensors = [blk('qbit_timer')].concat(boardSection('value', opts), moduleSection(function (r) { return !isAction(r) || SENSOR_ACT[r.mod]; }, opts));

    var cats = [
      { kind: 'category', name: T('Движение'), categorystyle: 'motion_category', contents: motion },
      { kind: 'category', name: T('Вид'), categorystyle: 'action_category', contents: looks },
      { kind: 'category', name: T('События'), categorystyle: 'event_category', contents: events },
      { kind: 'category', name: T('Управление'), categorystyle: 'control_category', contents: control },
      { kind: 'category', name: T('Датчики'), categorystyle: 'sensor_category', contents: sensors },
      { kind: 'category', name: T('Операторы'), categorystyle: 'operator_category', contents: operators },
      { kind: 'category', name: T('Переменные'), categorystyle: 'variable_category', custom: 'VARIABLE' },
      { kind: 'category', name: T('Мои блоки'), categorystyle: 'procedure_category', custom: 'PROCEDURE' }
    ];

    if (q) {
      var hits = [];
      cats.forEach(function (c) {
        (c.contents || []).forEach(function (b) {
          if (b.kind !== 'block') return;
          var rec = CAT.byId[b.type];
          var msg = rec ? words(rec) : (Q.Blocks && Q.Blocks.words ? Q.Blocks.words(b.type) : b.type).toLowerCase();
          if (q.split(/\s+/).every(function (w) { return msg.indexOf(w) >= 0; })) hits.push(b);
        });
      });
      cats.unshift({ kind: 'category', name: T('Найдено: %1', hits.length), categorystyle: 'sensor_category', contents: hits.length ? hits : [{ kind: 'label', text: T('Ничего не нашлось') }] });
    }
    return { kind: 'categoryToolbox', contents: cats };
  }

  Q.Toolbox = { theme: theme, build: build, COLOURS: COLOURS, shade: shade };
})(typeof globalThis !== 'undefined' ? globalThis : this);
