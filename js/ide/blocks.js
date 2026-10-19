/* Blockly blocks and the Python generator for q.bit programs.

   Q.Blocks.install(Blockly)          define every block (catalogue.js + the control / event blocks below) and the generators
   Q.Blocks.generate(workspace)       -> { code, map, hats, warnings }
                                         code  the Python program (what runs in the simulator and on the board)
                                         map   {lineNumber: blockId} for highlighting the running block
   Q.Blocks.hooks                     set by the IDE: portOptions(modKey) -> dropdown options, moduleAt(port) -> key or null

   Only blocks under a hat (a "when ..." block) or a function definition are turned into code: loose blocks do nothing,
   the same as in Scratch, and get a warning. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var SPEC = Q.SPEC, CAT = Q.Catalog;

  var B = Q.Blocks = {
    hooks: {
      portOptions: function () { var o = []; for (var i = 1; i <= 8; i++) o.push([T('порт %1', i), String(i)]); return o; },
      moduleAt: function () { return null; }
    },
    HATS: ['qbit_when_started', 'qbit_when_event', 'qbit_when_pair', 'qbit_when_message'],
    PROC_DEFS: ['procedures_defnoreturn', 'procedures_defreturn']
  };

  var STYLE = { action: 'action_blocks', value: 'sensor_blocks', bool: 'sensor_blocks' };
  var MOTION_MODS = { servo: 1, motor: 1, relay: 1, irtx: 1 };           // blue "Движение"
  var SENSOR_MODS = { button: 1, color: 1, encoder: 1, pressure: 1, compass: 1, rtc: 1 };   // an action of a sensor (reset, calibrate ...) keeps the sensor colour
  function styleOf(rec) { return rec.kind === 'action' ? (MOTION_MODS[rec.mod] ? 'motion_blocks' : SENSOR_MODS[rec.mod] ? 'sensor_blocks' : 'action_blocks') : 'sensor_blocks'; }

  /* ---------------------------------------------------------------- helpers shared by the block definitions */
  function portField(modKey) {
    return { type: 'field_dropdown', name: 'PORT', options: function () { return B.hooks.portOptions(modKey); } };
  }
  function eventArgSpec(modKey, eventName) {
    var spec = modKey === 'board' ? SPEC.board : SPEC.modules[modKey];
    var ev = spec && spec.events.filter(function (e) { return e.n === eventName; })[0];
    return ev && ev.arg ? ev : null;
  }
  function moduleTitle(key) { return key === 'board' ? T('плата') : (SPEC.modules[key] ? SPEC.modules[key].title : key); }

  /* ---------------------------------------------------------------- definitions */
  B.install = function (Blockly) {
    var gen = Blockly.Python;
    B.Blockly = Blockly;

    /* ---- one Blockly block per catalogue record */
    CAT.blocks.forEach(function (rec) {
      Blockly.Blocks[rec.id] = {
        init: function () {
          var args = rec.args.map(function (a) {
            if (a.port) return portField(rec.mod);
            if (a.drop) return { type: 'field_dropdown', name: a.drop, options: a.opts };
            if (a.num) return { type: 'input_value', name: a.num, check: 'Number' };
            if (a.text) return { type: 'input_value', name: a.text, check: ['String', 'Number', 'Boolean'] };     // a number or a sensor value is turned into text by the module
            throw new Error('catalogue: bad arg in ' + rec.id);
          });
          var def = { type: rec.id, message0: rec.msg, args0: args, style: styleOf(rec), tooltip: rec.tip || '', inputsInline: true };
          if (rec.kind === 'action') { def.previousStatement = null; def.nextStatement = null; }
          else def.output = rec.kind === 'bool' ? 'Boolean' : (rec.id === 'rfid_uid' ? 'String' : 'Number');
          this.jsonInit(def);
          this.qbitMod = rec.mod;
        }
      };
      gen.forBlock[rec.id] = function (block, g) {
        var code = rec.py.replace(/\{(\w+)\}/g, function (all, name) {
          for (var i = 0; i < rec.args.length; i++) {
            var a = rec.args[i];
            if (a.port && name === 'PORT') return block.getFieldValue('PORT') || '1';
            if (a.drop === name) return block.getFieldValue(name);
            if (a.num === name) { var v = g.valueToCode(block, name, g.ORDER_NONE); return v === '' ? String(a.def) : v; }
            if (a.text === name) { var t = g.valueToCode(block, name, g.ORDER_NONE); return t === '' ? g.quote_(String(a.def)) : t; }
          }
          return all;
        });
        if (rec.kind === 'action') return code + '\n';
        return [code, code.charAt(0) === '(' ? g.ORDER_ATOMIC : g.ORDER_MEMBER];
      };
    });

    /* ---- events */
    Blockly.Blocks.qbit_when_started = {
      init: function () {
        this.jsonInit({ type: 'qbit_when_started', message0: T('когда программа запущена %1 %2'), args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], style: 'event_blocks',
          tooltip: T('Эти блоки начинают работать, когда нажата кнопка «Запустить»') });
      }
    };
    var evModules = SPEC.keys.filter(function (k) { return SPEC.modules[k].events.length; });
    function eventOptions(mod) {
      var spec = SPEC.modules[mod];
      return spec ? spec.events.map(function (e) { return [e.label, e.n]; }) : [['—', '']];
    }
    Blockly.Blocks.qbit_when_event = {
      init: function () {
        var self = this;
        this.jsonInit({ type: 'qbit_when_event', message0: T('когда %1 %2 %3 %4 %5'), style: 'event_blocks', tooltip: T('Запускается каждый раз, когда с модулем случилось это событие'),
          args0: [
            { type: 'field_dropdown', name: 'MOD', options: CAT.moduleOrder.filter(function (k) { return evModules.indexOf(k) >= 0; }).map(function (k) { return [moduleTitle(k).toLowerCase(), k]; }) },
            { type: 'field_dropdown', name: 'PORT', options: function () { return B.hooks.portOptions(self.getFieldValue ? self.getFieldValue('MOD') : null); } },
            { type: 'field_dropdown', name: 'EVENT', options: function () { return eventOptions(self.modOverride || self.getFieldValue('MOD')); } },
            { type: 'input_dummy' },
            { type: 'input_statement', name: 'DO' }] });
        var modField = this.getField('MOD');
        // the event list depends on the module; a dropdown caches its list, so it is regenerated whenever the module changes
        var fixEvent = function () {
          var ev = self.getField('EVENT');
          if (!ev) return;
          var opts = ev.getOptions(false);
          if (!opts.some(function (o) { return o[1] === ev.getValue(); })) ev.setValue(opts[0][1]);
        };
        modField.setValidator(function (v) { self.modOverride = v; try { fixEvent(); } finally { self.modOverride = null; } return v; });
        fixEvent();
      }
    };
    Blockly.Blocks.qbit_when_pair = {
      init: function () {
        this.jsonInit({ type: 'qbit_when_pair', message0: T('когда кнопка PAIR на плате %1 %2 %3'), style: 'event_blocks', tooltip: T('Кнопка PAIR / POWER под корпусом платы'),
          args0: [{ type: 'field_dropdown', name: 'EVENT', options: SPEC.board.events.filter(function (e) { return e.n !== 'long'; }).map(function (e) { return [e.n === 'click' ? T('нажата') : T('нажата дважды'), e.n]; }) }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }] });
      }
    };
    Blockly.Blocks.qbit_when_message = {
      init: function () {
        this.jsonInit({ type: 'qbit_when_message', message0: T('когда получено сообщение %1 %2 %3'), style: 'event_blocks', tooltip: T('Запускается, когда другой скрипт отправит сообщение с таким названием'),
          args0: [{ type: 'field_input', name: 'MSG', text: T('старт') }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }] });
      }
    };
    Blockly.Blocks.qbit_send_message = {
      init: function () {
        this.jsonInit({ type: 'qbit_send_message', message0: T('отправить сообщение %1'), args0: [{ type: 'field_input', name: 'MSG', text: T('старт') }], style: 'event_blocks',
          previousStatement: null, nextStatement: null, tooltip: T('Запускает все блоки «когда получено сообщение» с таким названием') });
      }
    };
    Blockly.Blocks.qbit_event_value = {
      init: function () {
        this.jsonInit({ type: 'qbit_event_value', message0: T('значение события'), style: 'event_blocks', output: null,
          tooltip: T('Число или текст, который принёс сам случай: насколько повернули ручку, какое направление у джойстика, номер метки') });
      }
    };

    /* ---- control */
    function simple(type, msg, args, extra, style) {
      Blockly.Blocks[type] = { init: function () { this.jsonInit(Object.assign({ type: type, message0: msg, args0: args, style: style || 'control_blocks' }, extra)); } };
    }
    simple('qbit_wait', T('ждать %1 секунд'), [{ type: 'input_value', name: 'SEC', check: 'Number' }], { previousStatement: null, nextStatement: null, tooltip: T('Пауза. Другие блоки в это время работают') });
    simple('qbit_wait_until', T('ждать, пока %1'), [{ type: 'input_value', name: 'COND', check: 'Boolean' }], { previousStatement: null, nextStatement: null, tooltip: T('Стоит на месте, пока условие не станет верным') });
    simple('qbit_repeat', T('повторить %1 раз %2 %3'), [{ type: 'input_value', name: 'TIMES', check: 'Number' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { previousStatement: null, nextStatement: null });
    simple('qbit_forever', T('всегда %1 %2'), [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { previousStatement: null, tooltip: T('Повторяет блоки внутри, пока программа не остановится') });
    simple('qbit_repeat_until', T('повторять, пока не %1 %2 %3'), [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { previousStatement: null, nextStatement: null });
    simple('qbit_while', T('пока %1 %2 %3'), [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { previousStatement: null, nextStatement: null });
    simple('qbit_for', T('считать %1 от %2 до %3 шаг %4 %5 %6'), [{ type: 'field_variable', name: 'VAR', variable: 'i' }, { type: 'input_value', name: 'FROM', check: 'Number' }, { type: 'input_value', name: 'TO', check: 'Number' },
      { type: 'input_value', name: 'BY', check: 'Number' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { previousStatement: null, nextStatement: null, inputsInline: true, tooltip: T('Только целые числа') });
    simple('qbit_stop', T('остановить программу'), [], { previousStatement: null, tooltip: T('Останавливает все блоки') });
    simple('qbit_print', T('вывести в консоль %1'), [{ type: 'input_value', name: 'TEXT' }], { previousStatement: null, nextStatement: null, tooltip: T('Показывает значение на вкладке «Консоль»') }, 'action_blocks');
    simple('qbit_timer', T('секунд с запуска'), [], { output: 'Number', tooltip: T('Сколько секунд работает программа') }, 'sensor_blocks');
    simple('qbit_map', T('пересчитать %1 из %2 … %3 в %4 … %5'), [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'A', check: 'Number' }, { type: 'input_value', name: 'B', check: 'Number' },
      { type: 'input_value', name: 'C', check: 'Number' }, { type: 'input_value', name: 'D', check: 'Number' }], { output: 'Number', inputsInline: true, tooltip: T('Например, значение ручки 0…100 превратить в угол 0…180') }, 'math_blocks');
    simple('qbit_constrain', T('ограничить %1 от %2 до %3'), [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'A', check: 'Number' }, { type: 'input_value', name: 'B', check: 'Number' }],
      { output: 'Number', inputsInline: true }, 'math_blocks');

    /* ---------------------------------------------------------------- generators */
    var P = gen;
    function body(block, name) { return P.statementToCode(block, name) || P.PASS; }
    function val(block, name, def) { var v = P.valueToCode(block, name, P.ORDER_NONE); return v === '' ? def : v; }
    function nameOf(base) { return P.nameDB_.getDistinctName(base, Blockly.Names.NameType.PROCEDURE); }
    function varDeclaration(workspace) {
      var names = workspace.getVariableMap().getAllVariables().map(function (v) { return P.getVariableName(v.getId()); });
      return names.length ? P.INDENT + 'global ' + names.join(', ') + '\n' : '';
    }
    function hat(block, base, params, regLine) {
      var fn = nameOf(base);
      var code = "#@" + "'" + block.id + "'\n" + 'async def ' + fn + '(' + params + '):\n' + varDeclaration(block.workspace) + body(block, 'DO');
      P.definitions_['%' + fn] = code;
      P.qbitRegs.push(regLine(fn));
      return null;
    }
    P.forBlock.qbit_when_started = function (block) { return hat(block, 'on_start', '', function (fn) { return 'qbit.start(' + fn + ')'; }); };
    P.forBlock.qbit_when_event = function (block) {
      var mod = block.getFieldValue('MOD'), port = block.getFieldValue('PORT') || '1', ev = block.getFieldValue('EVENT');
      var withArg = !!eventArgSpec(mod, ev);
      return hat(block, 'when_' + mod + '_p' + port + '_' + ev, withArg ? 'event_value' : '', function (fn) { return 'qbit.' + mod + '(' + port + ").when('" + ev + "', " + fn + ')'; });
    };
    P.forBlock.qbit_when_pair = function (block) {
      var ev = block.getFieldValue('EVENT');
      return hat(block, 'when_pair_' + ev, '', function (fn) { return "qbit.board.when('" + ev + "', " + fn + ')'; });
    };
    P.forBlock.qbit_when_message = function (block) {
      var msg = P.quote_(block.getFieldValue('MSG') || '');
      return hat(block, 'on_message', '', function (fn) { return 'qbit.on_message(' + msg + ', ' + fn + ')'; });
    };
    P.forBlock.qbit_send_message = function (block) { return 'qbit.send(' + P.quote_(block.getFieldValue('MSG') || '') + ')\n'; };
    P.forBlock.qbit_event_value = function () { return ['event_value', P.ORDER_ATOMIC]; };

    P.forBlock.qbit_wait = function (block) { return 'await qbit.wait(' + val(block, 'SEC', '1') + ')\n'; };
    P.forBlock.qbit_wait_until = function (block) { return 'while not (' + val(block, 'COND', 'False') + '):\n' + P.INDENT + 'await qbit.tick()\n'; };
    P.forBlock.qbit_repeat = function (block) { return 'for _ in range(int(' + val(block, 'TIMES', '10') + ')):\n' + body(block, 'DO') + P.INDENT + 'await qbit.tick()\n'; };
    P.forBlock.qbit_forever = function (block) { return 'while True:\n' + body(block, 'DO') + P.INDENT + 'await qbit.tick()\n'; };
    P.forBlock.qbit_repeat_until = function (block) { return 'while not (' + val(block, 'COND', 'False') + '):\n' + body(block, 'DO') + P.INDENT + 'await qbit.tick()\n'; };
    P.forBlock.qbit_while = function (block) { return 'while ' + val(block, 'COND', 'False') + ':\n' + body(block, 'DO') + P.INDENT + 'await qbit.tick()\n'; };
    P.forBlock.qbit_for = function (block) {
      var v = P.getVariableName(block.getFieldValue('VAR'));
      var from = val(block, 'FROM', '1'), to = val(block, 'TO', '10'), by = val(block, 'BY', '1');
      var isNum = function (s) { return /^-?\d+$/.test(s); };
      var rng = isNum(from) && isNum(to) && isNum(by) ? 'range(' + from + ', ' + (parseInt(to, 10) + (parseInt(by, 10) < 0 ? -1 : 1)) + (by === '1' ? '' : ', ' + by) + ')'
        : 'range(int(' + from + '), int(' + to + ') + 1, int(' + by + '))';
      return 'for ' + v + ' in ' + rng + ':\n' + body(block, 'DO') + P.INDENT + 'await qbit.tick()\n';
    };
    P.forBlock.qbit_stop = function () { return 'qbit.stop()\nawait qbit.tick()\n'; };
    P.forBlock.qbit_print = function (block) { return 'print(' + val(block, 'TEXT', "''") + ')\n'; };
    P.forBlock.qbit_timer = function () { return ['qbit.seconds()', P.ORDER_FUNCTION_CALL]; };
    P.forBlock.qbit_map = function (block) { return ['qbit.map(' + [val(block, 'X', '0'), val(block, 'A', '0'), val(block, 'B', '100'), val(block, 'C', '0'), val(block, 'D', '180')].join(', ') + ')', P.ORDER_FUNCTION_CALL]; };
    P.forBlock.qbit_constrain = function (block) { return ['qbit.constrain(' + [val(block, 'X', '0'), val(block, 'A', '0'), val(block, 'B', '100')].join(', ') + ')', P.ORDER_FUNCTION_CALL]; };

    /* ---- functions ("My blocks") run as async def, a call waits for the result */
    ['procedures_defnoreturn', 'procedures_defreturn'].forEach(function (t) {
      var orig = P.forBlock[t];
      P.forBlock[t] = function (block, g) {
        var fn = g.getProcedureName(block.getFieldValue('NAME'));
        var r = orig.call(this, block, g);
        var key = '%' + fn;
        if (g.definitions_[key]) g.definitions_[key] = g.definitions_[key].replace(/^(\s*)def /m, '$1async def ');
        return r;
      };
    });
    var callNo = P.forBlock.procedures_callnoreturn, callRet = P.forBlock.procedures_callreturn;
    P.forBlock.procedures_callnoreturn = function (block, g) { return 'await ' + callNo.call(this, block, g).replace(/^\s+/, ''); };
    P.forBlock.procedures_callreturn = function (block, g) { var r = callRet.call(this, block, g); return ['(await ' + r[0] + ')', P.ORDER_ATOMIC]; };
    var ifRet = P.forBlock.procedures_ifreturn;

    /* ---- the program as a whole */
    var origInit = P.init;
    P.init = function (workspace) {
      origInit.call(this, workspace);
      this.qbitRegs = [];
      this.definitions_['import_qbit'] = 'import qbit';
    };
    P.STATEMENT_PREFIX = "#@%1\n";
    P.INDENT = '    ';                                    // PEP 8, the same on the board
    var origFinish = P.finish;
    P.finish = function (code) {
      var tail = this.qbitRegs.length ? this.qbitRegs.join('\n') + '\nqbit.run()\n' : '';
      return origFinish.call(this, tail);
    };
  };

  /** the readable text of a block type (for the search box) */
  var wordsCache = {}, scratch = null;
  B.words = function (type) {
    if (wordsCache[type] !== undefined) return wordsCache[type];
    var text = type;
    try {
      scratch = scratch || new B.Blockly.Workspace();
      var b = scratch.newBlock(type);
      text = b.toString() + ' ' + (b.tooltip && typeof b.tooltip === 'string' ? b.tooltip : '');
      b.dispose();
    } catch (e) { /* keep the type name */ }
    return (wordsCache[type] = text);
  };

  /* ---------------------------------------------------------------- code for a whole workspace */
  B.generate = function (workspace) {
    var Blockly = B.Blockly, P = Blockly.Python;
    P.init(workspace);
    var tops = workspace.getTopBlocks(true), hats = 0;
    tops.forEach(function (b) {
      if (B.HATS.indexOf(b.type) >= 0 || B.PROC_DEFS.indexOf(b.type) >= 0) {
        if (B.HATS.indexOf(b.type) >= 0) hats++;
        P.blockToCode(b);
      }
    });
    var raw = P.finish('');
    // markers "#@'blockId'" -> a line map, then removed from the text
    var lines = raw.split('\n'), out = [], map = {}, pending = null;
    lines.forEach(function (l) {
      var m = /^\s*#@'([^']*)'\s*$/.exec(l);
      if (m) { pending = m[1]; return; }
      out.push(l);
      if (pending && l.trim() !== '') { map[out.length] = pending; pending = null; }
    });
    return { code: out.join('\n'), map: map, hats: hats };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
