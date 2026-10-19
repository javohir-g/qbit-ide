/* The qbit contract: what a program can read from, tell to, and hear from every module.

   It mirrors the firmware core (firmware/qbit_core): each driver publishes named VALUES (qbit_field_t), accepts COMMANDS (strings such as
   "brightness 50") and posts EVENTS (qbit_event_kind_t + value + text). The names below are exactly the firmware's, so the same Python program
   works on the simulator and on the board (MicroPython `qbit` module). tests/runtime.test.js checks this file against the C sources.

   Python view of one module (the object returned by qbit.led(1), qbit.button(2) ...):
     m.<value>            a value, e.g. qbit.pot(3).value, qbit.button(1).pressed
     m.<command>(args)    a command, e.g. qbit.led(1).brightness(50);  booleans are sent as on / off
     m.when(event, fn)    call fn when the event happens (fn gets the event argument, if the event has one)
   A value whose name is also a command gets another Python name (the `py` field): led.level (value) / led.brightness(50) (command).
   Value types: 'bool' (True / False), 'int', 'float', 'text'. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;

  function v(name, type, label, unit, py) { return { n: name, t: type, label: label, unit: unit || '', py: py || name }; }
  function ev(name, label, kind, o) { return Object.assign({ n: name, label: label, kind: kind }, o || {}); }
  function cmd(name, label, args) { return { n: name, label: label, args: args || [] }; }
  function arg(name, type, label, def, o) { return Object.assign({ n: name, t: type, label: label, def: def }, o || {}); }

  var BUTTONLIKE_EVENTS = [
    ev('press', T('нажата'), 'press'), ev('release', T('отпущена'), 'release'),
    ev('click', T('клик'), 'click', { value: 1 }), ev('double_click', T('двойной клик'), 'click', { value: 2 }),
    ev('long', T('долгое нажатие'), 'long')
  ];

  var MODULES = {
    button: { title: T('Кнопка'), values: [v('pressed', 'bool', T('нажата')), v('clicks', 'int', T('число нажатий'))], events: BUTTONLIKE_EVENTS,
      commands: [cmd('reset', T('обнулить счётчик'))] },
    touch: { title: T('Сенсорная кнопка'), values: [v('pressed', 'bool', T('касание')), v('clicks', 'int', T('число касаний'))], events: BUTTONLIKE_EVENTS,
      commands: [cmd('reset', T('обнулить счётчик'))] },
    switch: { title: T('Переключатель'), values: [v('on', 'bool', T('включён')), v('count', 'int', T('число переключений'))],
      events: [ev('on', T('включён'), 'change', { value: 1 }), ev('off', T('выключен'), 'change', { value: 0 })], commands: [cmd('reset', T('обнулить счётчик'))] },
    tilt: { title: T('Наклон / вибрация'), values: [v('tilted', 'bool', T('наклонён')), v('count', 'int', T('число наклонов'))],
      events: [ev('tilt', T('наклонён'), 'change', { value: 1 }), ev('level', T('ровно'), 'change', { value: 0 })], commands: [cmd('reset', T('обнулить счётчик'))] },
    pir: { title: T('Датчик движения'), values: [v('motion', 'bool', T('есть движение')), v('count', 'int', T('число срабатываний'))],
      events: [ev('motion', T('движение'), 'change', { value: 1 }), ev('still', T('тихо'), 'change', { value: 0 })], commands: [cmd('reset', T('обнулить счётчик'))] },
    hall: { title: T('Датчик магнита'), values: [v('magnet', 'bool', T('магнит рядом')), v('count', 'int', T('число срабатываний'))],
      events: [ev('near', T('магнит рядом'), 'change', { value: 1 }), ev('away', T('магнит убран'), 'change', { value: 0 })], commands: [cmd('reset', T('обнулить счётчик'))] },

    pot: { title: T('Потенциометр'), values: [v('value', 'int', T('положение'), '%'), v('mv', 'int', T('напряжение'), T('мВ'))], events: [], commands: [] },
    slider: { title: T('Ползунок'), values: [v('position', 'int', T('положение'), '%'), v('mv', 'int', T('напряжение'), T('мВ'))], events: [], commands: [] },
    light: { title: T('Освещённость'), values: [v('light', 'int', T('освещённость'), '%'), v('mv', 'int', T('напряжение'), T('мВ'))], events: [], commands: [] },

    joystick: { title: T('Джойстик'), values: [v('x', 'int', T('влево−вправо (−1, 0, 1)')), v('y', 'int', T('вниз−вверх (−1, 0, 1)')), v('pressed', 'bool', T('стик нажат')), v('dir', 'int', T('направление 0…8'))],
      events: [ev('press', T('стик нажат'), 'press'), ev('release', T('стик отпущен'), 'release'), ev('direction', T('направление изменилось'), 'change', { arg: 'text' })], commands: [],
      dirNames: ['none', 'up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'] },
    keypad: { title: T('Клавиатура'), values: [v('key', 'int', T('нажатая клавиша (0 — нет)')), v('count', 'int', T('число нажатий'))],
      events: [ev('press', T('клавиша нажата'), 'press', { arg: 'value' }), ev('release', T('клавиша отпущена'), 'release', { arg: 'value' })], commands: [] },
    pulse: { title: T('Пульс'), values: [v('bpm', 'int', T('пульс'), T('уд/мин')), v('signal', 'int', T('сигнал'), T('мВ')), v('beat', 'bool', T('удар'))],
      events: [ev('beat', T('удар сердца'), 'change', { text: 'beat', arg: 'value' })], commands: [] },
    encoder: { title: T('Энкодер'), values: [v('position', 'int', T('позиция'), T('щелчков')), v('pressed', 'bool', T('ручка нажата'))],
      events: [ev('turn', T('повёрнут'), 'turn', { arg: 'value' })].concat(BUTTONLIKE_EVENTS),
      commands: [cmd('zero', T('обнулить позицию')), cmd('counts', T('импульсов на щелчок'), [arg('n', 'int', T('импульсов'), 4, { min: 1, max: 8 })])] },

    temphum: { title: T('Температура и влажность'), values: [v('temperature', 'float', T('температура'), '°C'), v('humidity', 'int', T('влажность'), '%')], events: [], commands: [] },
    pressure: { title: T('Давление'), values: [v('pressure', 'float', T('давление'), T('гПа')), v('temperature', 'float', T('температура'), '°C'), v('altitude', 'float', T('высота'), T('м'))], events: [],
      commands: [cmd('sealevel', T('давление на уровне моря'), [arg('hpa', 'float', T('гПа'), 1013.25, { min: 800, max: 1200 })]), cmd('zero', T('считать здесь высоту 0'))] },
    airq: { title: T('Качество воздуха'), values: [v('voc', 'int', T('индекс загрязнения 0…500')), v('raw', 'int', T('сырой сигнал')), v('temperature', 'float', T('температура'), '°C'), v('humidity', 'int', T('влажность'), '%')], events: [], commands: [] },
    color: { title: T('Датчик цвета'), values: [v('r', 'int', T('красный')), v('g', 'int', T('зелёный')), v('b', 'int', T('синий')), v('lux', 'int', T('освещённость'), T('лк')), v('light', 'bool', T('подсветка включена'), '', 'light_on')], events: [],
      commands: [cmd('light', T('подсветка'), [arg('on', 'bool', T('включена'), true)])] },
    ultrasonic: { title: T('Расстояние (ультразвук)'), values: [v('distance', 'int', T('расстояние'), T('см')), v('echo', 'int', T('эхо'), T('мкс'))], events: [],
      commands: [cmd('temperature', T('температура воздуха'), [arg('c', 'int', '°C', 20, { min: -40, max: 80 })]), cmd('threshold', T('порог'), [arg('n', 'int', T('шагов'), 30)])] },
    imu: { title: T('Акселерометр и гироскоп'), values: [v('ax', 'float', T('ускорение X'), 'g'), v('ay', 'float', T('ускорение Y'), 'g'), v('az', 'float', T('ускорение Z'), 'g'),
        v('gx', 'int', T('вращение X'), T('°/с')), v('gy', 'int', T('вращение Y'), T('°/с')), v('gz', 'int', T('вращение Z'), T('°/с')), v('pitch', 'int', T('наклон вперёд-назад'), '°'), v('roll', 'int', T('наклон влево-вправо'), '°')],
      events: [ev('shake', T('встряхнули'), 'change', { text: 'shake' })], commands: [] },
    compass: { title: T('Компас'), values: [v('heading', 'int', T('курс'), '°'), v('x', 'float', T('поле X'), T('мкТл')), v('y', 'float', T('поле Y'), T('мкТл')), v('z', 'float', T('поле Z'), T('мкТл'))], events: [],
      commands: [cmd('calibrate', T('калибровка'), [arg('seconds', 'int', T('секунд'), 10, { min: 1, max: 60 })]), cmd('uncalibrate', T('стереть калибровку'))] },
    gesture: { title: T('Приближение и свет'), values: [v('proximity', 'int', T('близость')), v('near', 'bool', T('рука рядом')), v('light', 'int', T('освещённость'), T('лк'))],
      events: [ev('near', T('рука рядом'), 'change', { text: 'near' }), ev('far', T('рука убрана'), 'change', { text: 'far' }), ev('wave', T('взмах рукой'), 'click', { text: 'wave' }), ev('hold', T('рука удержана'), 'long', { text: 'hold' })],
      commands: [cmd('threshold', T('порог'), [arg('n', 'int', T('отсчётов'), 100)]), cmd('relearn', T('заново запомнить фон'))] },
    rtc: { title: T('Часы'), values: [v('hour', 'int', T('часы')), v('minute', 'int', T('минуты')), v('second', 'int', T('секунды')), v('day', 'int', T('день')), v('month', 'int', T('месяц')), v('year', 'int', T('год')), v('temperature', 'float', T('температура'), '°C')],
      events: [], commands: [cmd('set', T('установить время'), [arg('when', 'text', T('ГГГГ-ММ-ДД ЧЧ:ММ:СС'), '2026-01-01 12:00:00')])] },
    irrx: { title: T('ИК-приёмник'), values: [v('code', 'int', T('команда')), v('address', 'int', T('адрес')), v('count', 'int', T('число кодов')), v('held', 'bool', T('кнопка удерживается'))],
      events: [ev('code', T('принят код'), 'code', { arg: 'value' })], commands: [] },
    rfid: { title: 'RFID', values: [v('present', 'bool', T('метка рядом')), v('count', 'int', T('число меток')), v('text', 'text', T('номер метки (UID)'))],
      events: [ev('card', T('метка приложена'), 'code', { arg: 'text' }), ev('removed', T('метка убрана'), 'change', { text: 'removed' })], commands: [] },

    led: { title: T('Светодиод'), values: [v('brightness', 'int', T('яркость'), '%', 'level')], events: [],
      commands: [cmd('on', T('включить'), [arg('level', 'int', T('яркость, %'), 100, { min: 0, max: 100, optional: true })]), cmd('off', T('выключить')), cmd('toggle', T('переключить')),
        cmd('brightness', T('яркость'), [arg('level', 'int', '%', 100, { min: 0, max: 100 })]),
        cmd('blink', T('мигать'), [arg('period', 'int', T('период, мс'), 500, { min: 40, optional: true }), arg('count', 'int', T('раз'), 0, { min: 0, optional: true })])] },
    rgb: { title: T('RGB-светодиод'), values: [v('r', 'int', T('красный')), v('g', 'int', T('зелёный')), v('b', 'int', T('синий')), v('brightness', 'int', T('яркость'), '%', 'level')], events: [],
      commands: [cmd('color', T('цвет'), [arg('r', 'any', T('красный 0…255 или имя цвета'), 255), arg('g', 'int', T('зелёный'), 0, { optional: true }), arg('b', 'int', T('синий'), 0, { optional: true })]),
        cmd('hsv', T('цвет по тону'), [arg('h', 'int', T('тон 0…360'), 0), arg('s', 'int', T('насыщенность %'), 100, { optional: true }), arg('v', 'int', T('яркость %'), 100, { optional: true })]),
        cmd('brightness', T('яркость'), [arg('level', 'int', '%', 30, { min: 0, max: 100 })]), cmd('on', T('включить')), cmd('off', T('выключить')), cmd('rainbow', T('радуга')), cmd('blink', T('мигать'))],
      colorNames: ['red', 'green', 'blue', 'white', 'yellow', 'orange', 'purple', 'pink', 'cyan', 'magenta'] },
    oled: { title: T('Дисплей OLED'), values: [], events: [],
      commands: [cmd('clear', T('очистить')), cmd('print', T('вывести строку'), [arg('text', 'text', T('текст'), T('Привет!'))]),
        cmd('text', T('текст в точке'), [arg('x', 'int', 'x', 0), arg('y', 'int', 'y', 0), arg('text', 'text', T('текст'), 'q.bit')]), cmd('size', T('размер букв'), [arg('n', 'int', '1…4', 1, { min: 1, max: 4 })]),
        cmd('pixel', T('точка'), [arg('x', 'int', 'x', 0), arg('y', 'int', 'y', 0), arg('c', 'int', '0 / 1 / 2', 1, { optional: true })]),
        cmd('line', T('линия'), [arg('x0', 'int', 'x0', 0), arg('y0', 'int', 'y0', 0), arg('x1', 'int', 'x1', 127), arg('y1', 'int', 'y1', 63), arg('c', 'int', '0 / 1 / 2', 1, { optional: true })]),
        cmd('rect', T('рамка'), [arg('x', 'int', 'x', 0), arg('y', 'int', 'y', 0), arg('w', 'int', T('ширина'), 20), arg('h', 'int', T('высота'), 10), arg('c', 'int', '0 / 1 / 2', 1, { optional: true })]),
        cmd('fill', T('закрашенный прямоугольник'), [arg('x', 'int', 'x', 0), arg('y', 'int', 'y', 0), arg('w', 'int', T('ширина'), 20), arg('h', 'int', T('высота'), 10), arg('c', 'int', '0 / 1 / 2', 1, { optional: true })]),
        cmd('bar', T('полоса'), [arg('percent', 'int', '0…100', 50, { min: 0, max: 100 })]), cmd('contrast', T('контраст'), [arg('n', 'int', '0…255', 207, { min: 0, max: 255 })]),
        cmd('invert', T('инверсия'), [arg('on', 'bool', T('включена'), true)])] },
    buzzer: { title: T('Зуммер'), values: [v('freq', 'int', T('частота'), T('Гц')), v('playing', 'bool', T('играет'))], events: [],
      commands: [cmd('tone', T('тон'), [arg('hz', 'int', T('частота, Гц'), 440, { min: 20, max: 20000 }), arg('ms', 'int', T('длительность, мс'), 0, { optional: true })]),
        cmd('beep', T('писк'), [arg('ms', 'int', T('мс'), 100, { optional: true })]), cmd('off', T('выключить')), cmd('volume', T('громкость'), [arg('level', 'int', '%', 100, { min: 0, max: 100 })]),
        cmd('play', T('мелодия'), [arg('notes', 'text', T('ноты'), 'C4:200 E4 G4')])] },
    servo: { title: T('Сервопривод'), values: [v('angle', 'int', T('угол'), '°', 'position')], events: [],
      commands: [cmd('angle', T('повернуть'), [arg('deg', 'int', T('градусов'), 90, { min: 0, max: 180 })]), cmd('us', T('импульс'), [arg('us', 'int', T('мкс'), 1500, { min: 500, max: 2500 })]), cmd('off', T('отпустить'))] },
    motor: { title: T('Мотор'), values: [v('speed', 'int', T('скорость'), '%', 'power'), v('fault', 'bool', T('ошибка'))], events: [ev('fault', T('ошибка мотора'), 'fault', { arg: 'text' })],
      commands: [cmd('speed', T('скорость'), [arg('percent', 'int', '−100…100', 50, { min: -100, max: 100 })]), cmd('forward', T('вперёд'), [arg('percent', 'int', '%', 100, { optional: true })]),
        cmd('backward', T('назад'), [arg('percent', 'int', '%', 100, { optional: true })]), cmd('stop', T('остановить')), cmd('brake', T('тормоз'))] },
    relay: { title: T('Реле'), values: [v('on', 'bool', T('включено'), '', 'is_on')], events: [],
      commands: [cmd('on', T('включить')), cmd('off', T('выключить')), cmd('toggle', T('переключить')), cmd('pulse', T('импульс'), [arg('ms', 'int', T('мс'), 500, { optional: true })])] },
    irtx: { title: T('ИК-передатчик'), values: [v('sent', 'int', T('отправлено')), v('code', 'int', T('последний код'))], events: [],
      commands: [cmd('nec', T('передать код NEC'), [arg('address', 'int', T('адрес'), 0), arg('command', 'int', T('команда'), 69), arg('repeats', 'int', T('повторов'), 0, { optional: true })])] },
    proto2: { title: T('Макетная плата'), values: [v('sig', 'int', T('уровень SIG'))], events: [], commands: [] }
  };

  /* the main board itself: PAIR key, battery and power, the status LED */
  var BOARD = {
    values: [v('battery', 'int', T('заряд батареи'), '%'), v('charging', 'bool', T('идёт зарядка')), v('usb', 'bool', T('питание от USB')), v('volts', 'float', T('напряжение 5 В'), T('В')), v('amps', 'float', T('ток платы'), T('А'))],
    events: [ev('click', T('клик по кнопке PAIR'), 'key', { value: 1 }), ev('double_click', T('двойной клик по PAIR'), 'key', { value: 2 }), ev('long', T('долгое нажатие PAIR'), 'key', { value: 3 })],
    commands: [cmd('led', T('индикатор платы'), [arg('color', 'any', T('цвет'), 'green')]), cmd('led_off', T('погасить индикатор'))]
  };

  Q.SPEC = { modules: MODULES, board: BOARD, version: '0.1' };
  /** how a Python value becomes one command word: True -> "on", 3.0 -> "3" */
  Q.SPEC.keys = Object.keys(MODULES);
})(typeof globalThis !== 'undefined' ? globalThis : this);
