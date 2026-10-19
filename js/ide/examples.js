/* Ready-made programs. Each one lists the modules it needs; when it is opened on the simulator the missing modules are put on the board,
   and the blocks get the ports where those modules are. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;

  /* tiny builders for Blockly's JSON format */
  function b(type, fields, inputs, next, extra) {
    var o = { type: type };
    if (extra) Object.assign(o, extra);
    if (fields) o.fields = fields;
    if (inputs) { o.inputs = {}; Object.keys(inputs).forEach(function (k) { var v = inputs[k]; o.inputs[k] = v && v.type ? { block: v } : v; }); }
    if (next) o.next = { block: next };
    return o;
  }
  function n(v) { return { shadow: { type: 'math_number', fields: { NUM: v } } }; }
  function t(v) { return { shadow: { type: 'text', fields: { TEXT: v } } }; }
  function chain() {                                       // chain(a, b, c): a -> b -> c
    var list = Array.prototype.slice.call(arguments), first = list[0], cur = first;
    for (var i = 1; i < list.length; i++) { cur.next = { block: list[i] }; cur = list[i]; }
    return first;
  }
  function program(top) { return { blocks: { languageVersion: 0, blocks: [Object.assign({ x: 40, y: 36 }, top)] } }; }
  function more(list) { return { blocks: { languageVersion: 0, blocks: list.map(function (blk, i) { return Object.assign({ x: 40, y: 36 + i * 230 }, blk); }) } }; }
  function hatStart(body) { return b('qbit_when_started', null, { DO: body }); }
  function wait(s) { return b('qbit_wait', null, { SEC: n(s) }); }
  var P = function (v) { return String(v); };

  var EXAMPLES = [
    { id: 'blink', title: T('Мигаем светодиодом'), info: T('Светодиод включается и выключается каждые полсекунды'), needs: ['led'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: chain(
          b('led_turn', { PORT: P(p.led), STATE: 'on' }), wait(0.5), b('led_turn', { PORT: P(p.led), STATE: 'off' }), wait(0.5)) })));
      } },
    { id: 'button-led', title: T('Кнопка зажигает светодиод'), info: T('Пока кнопка нажата, светодиод горит'), needs: ['button', 'led'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: b('controls_if', null, {
          IF0: b('button_pressed', { PORT: P(p.button) }), DO0: b('led_turn', { PORT: P(p.led), STATE: 'on' }) }, null) })));
      } },
    { id: 'toggle', title: T('Кнопка переключает светодиод'), info: T('Каждое нажатие включает или выключает свет'), needs: ['button', 'led'],
      build: function (p) {
        return program(b('qbit_when_event', { MOD: 'button', PORT: P(p.button), EVENT: 'press' }, { DO: b('led_turn', { PORT: P(p.led), STATE: 'toggle' }) }));
      } },
    { id: 'dimmer', title: T('Ручка меняет яркость'), info: T('Крутите потенциометр: светодиод светит ярче или тусклее'), needs: ['pot', 'led'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: b('led_brightness', { PORT: P(p.led) }, { LEVEL: b('pot_value', { PORT: P(p.pot) }) }) })));
      } },
    { id: 'rainbow', title: T('Радуга'), info: T('RGB-светодиод плавно меняет цвет по кругу'), needs: ['rgb'],
      build: function (p) {
        return program(hatStart(chain(b('rgb_brightness', { PORT: P(p.rgb) }, { LEVEL: n(60) }),
          b('qbit_forever', null, { DO: b('qbit_for', { VAR: { name: T('угол') } }, { FROM: n(0), TO: n(360), BY: n(4), DO: chain(b('rgb_hsv', { PORT: P(p.rgb) }, { H: b('variables_get', { VAR: { name: T('угол') } }) }), wait(0.02)) }) }))));
      } },
    { id: 'siren', title: T('Сирена'), info: T('По кнопке зуммер три раза пищит двумя тонами'), needs: ['button', 'buzzer'],
      build: function (p) {
        return program(b('qbit_when_event', { MOD: 'button', PORT: P(p.button), EVENT: 'press' }, { DO: b('qbit_repeat', null, { TIMES: n(3), DO: chain(
          b('buzzer_tone_wait', { PORT: P(p.buzzer) }, { HZ: n(880), MS: n(250) }), b('buzzer_tone_wait', { PORT: P(p.buzzer) }, { HZ: n(440), MS: n(250) })) }) }));
      } },
    { id: 'servo', title: T('Сервопривод по ручке'), info: T('Угол сервопривода повторяет положение ручки'), needs: ['pot', 'servo'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: b('servo_angle', { PORT: P(p.servo) }, { DEG: b('qbit_map', null, { X: b('pot_value', { PORT: P(p.pot) }), A: n(0), B: n(100), C: n(0), D: n(180) }) }) })));
      } },
    { id: 'nightlight', title: T('Ночник'), info: T('Когда в комнате темно, светодиод включается сам'), needs: ['light', 'led'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: b('controls_if', { }, {
          IF0: b('logic_compare', { OP: 'LT' }, { A: b('light_value', { PORT: P(p.light) }), B: n(30) }),
          DO0: b('led_turn', { PORT: P(p.led), STATE: 'on' }), ELSE: b('led_turn', { PORT: P(p.led), STATE: 'off' }) }, null, { extraState: { hasElse: true } }) })));
      } },
    { id: 'thermo', title: T('Термометр на экране'), info: T('Температура и влажность выводятся на OLED-дисплей'), needs: ['temphum', 'oled'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: chain(
          b('oled_clear', { PORT: P(p.oled) }),
          b('oled_print', { PORT: P(p.oled) }, { TEXT: t(T('Температура, °C')) }),
          b('oled_print', { PORT: P(p.oled) }, { TEXT: b('temphum_temp', { PORT: P(p.temphum) }) }),
          b('oled_print', { PORT: P(p.oled) }, { TEXT: t(T('Влажность, %')) }),
          b('oled_print', { PORT: P(p.oled) }, { TEXT: b('temphum_hum', { PORT: P(p.temphum) }) }),
          wait(1)) })));
      } },
    { id: 'rangefinder', title: T('Парктроник'), info: T('Чем ближе предмет, тем чаще пищит зуммер'), needs: ['ultrasonic', 'buzzer'],
      build: function (p) {
        return program(hatStart(b('qbit_forever', null, { DO: b('controls_if', null, {
          IF0: b('logic_operation', { OP: 'AND' }, { A: b('logic_compare', { OP: 'GT' }, { A: b('ultrasonic_cm', { PORT: P(p.ultrasonic) }), B: n(0) }), B: b('logic_compare', { OP: 'LT' }, { A: b('ultrasonic_cm', { PORT: P(p.ultrasonic) }), B: n(100) }) }),
          DO0: chain(b('buzzer_beep', { PORT: P(p.buzzer) }), b('qbit_wait', null, { SEC: b('math_arithmetic', { OP: 'DIVIDE' }, { A: b('ultrasonic_cm', { PORT: P(p.ultrasonic) }), B: n(100) }) })) }, null) })));
      } }
  ];

  /** which port holds the module: the first one that does, else a free one (the caller makes sure it is placed) */
  Q.Examples = { list: EXAMPLES, builders: { b: b, n: n, t: t, chain: chain, program: program } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
