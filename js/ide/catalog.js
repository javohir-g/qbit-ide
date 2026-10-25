/* The block catalogue: which blocks exist for which modules, in plain data. blocks.js turns every record into a Blockly block and a
   Python generator; toolbox.js decides which of them are shown. Python names come from runtime/spec.js (the qbit contract),
   so a block can only call something the contract defines (tests/ide.test.html checks every record).

   Record fields:
     id        block type, also the name in saved projects (never rename a released id)
     mod       module key from spec.js ('led', 'button' ...) or 'board'
     kind      'action' (statement) | 'value' (round reporter) | 'bool' (hexagonal reporter)
     msg       Russian text; %1 %2 ... are the args in order
     args      [{ port }, { drop: name, opts: [[label, value]...] }, { num: name, def }, { text: name, def }, { colour: name }]
     py        Python template: {NAME} = the value of that arg (an input is turned into code, a dropdown into its raw value)
     tip       tooltip */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;

  var PORT = { port: true };
  function num(name, def, o) { return Object.assign({ num: name, def: def }, o || {}); }
  function text(name, def) { return { text: name, def: def }; }
  function drop(name, opts) { return { drop: name, opts: opts }; }
  function A(mod, id, msg, args, py, tip) { return { id: id, mod: mod, kind: 'action', msg: msg, args: args, py: py, tip: tip || '' }; }
  function Vn(mod, id, msg, args, py, tip) { return { id: id, mod: mod, kind: 'value', msg: msg, args: args, py: py, tip: tip || '' }; }
  function Vb(mod, id, msg, args, py, tip) { return { id: id, mod: mod, kind: 'bool', msg: msg, args: args, py: py, tip: tip || '' }; }

  var ON_OFF_TOGGLE = [[T('включить'), 'on'], [T('выключить'), 'off'], [T('переключить'), 'toggle']];
  var COLOURS = [[T('красный'), 'red'], [T('зелёный'), 'green'], [T('синий'), 'blue'], [T('белый'), 'white'], [T('жёлтый'), 'yellow'], [T('оранжевый'), 'orange'], [T('фиолетовый'), 'purple'], [T('розовый'), 'pink'], [T('голубой'), 'cyan'], [T('малиновый'), 'magenta']];

  var BLOCKS = [
    /* ---------------------------------------------------------------- actions */
    A('led', 'led_turn', T('светодиод %1 %2'), [PORT, drop('STATE', ON_OFF_TOGGLE)], 'qbit.led({PORT}).{STATE}()', T('Включить, выключить или переключить светодиод')),
    A('led', 'led_brightness', T('светодиод %1 яркость %2 %'), [PORT, num('LEVEL', 100, { min: 0, max: 100 })], 'qbit.led({PORT}).brightness({LEVEL})', T('Яркость от 0 до 100 %')),
    A('led', 'led_blink', T('светодиод %1 мигать каждые %2 мс'), [PORT, num('PERIOD', 500, { min: 40 })], 'qbit.led({PORT}).blink({PERIOD})', T('Мигает, пока не дать другую команду')),

    A('rgb', 'rgb_color', T('RGB %1 цвет %2'), [PORT, drop('COLOUR', COLOURS)], "qbit.rgb({PORT}).color('{COLOUR}')", T('Включить RGB-светодиод выбранным цветом')),
    A('rgb', 'rgb_rgb', T('RGB %1 красный %2 зелёный %3 синий %4'), [PORT, num('R', 255, { min: 0, max: 255 }), num('G', 80, { min: 0, max: 255 }), num('B', 0, { min: 0, max: 255 })], 'qbit.rgb({PORT}).color({R}, {G}, {B})', T('Цвет из трёх яркостей от 0 до 255')),
    A('rgb', 'rgb_hsv', T('RGB %1 цвет по тону %2 °'), [PORT, num('H', 120, { min: 0, max: 360 })], 'qbit.rgb({PORT}).hsv({H})', T('Тон: 0 красный, 120 зелёный, 240 синий')),
    A('rgb', 'rgb_brightness', T('RGB %1 яркость %2 %'), [PORT, num('LEVEL', 50, { min: 0, max: 100 })], 'qbit.rgb({PORT}).brightness({LEVEL})', T('Общая яркость')),
    A('rgb', 'rgb_off', T('RGB %1 выключить'), [PORT], 'qbit.rgb({PORT}).off()'),
    A('rgb', 'rgb_rainbow', T('RGB %1 радуга'), [PORT], 'qbit.rgb({PORT}).rainbow()', T('Плавно меняет цвета по кругу')),

    A('buzzer', 'buzzer_tone', T('зуммер %1 звук %2 Гц'), [PORT, num('HZ', 440, { min: 20, max: 20000 })], 'qbit.buzzer({PORT}).tone({HZ})', T('Звучит, пока не выключить')),
    A('buzzer', 'buzzer_tone_wait', T('зуммер %1 звук %2 Гц на %3 мс и ждать'), [PORT, num('HZ', 440, { min: 20, max: 20000 }), num('MS', 300, { min: 1 })],
      'qbit.buzzer({PORT}).tone({HZ}, {MS})\nawait qbit.wait_ms({MS})', T('Играет ноту и ждёт, пока она закончится')),
    A('buzzer', 'buzzer_beep', T('зуммер %1 пискнуть'), [PORT], 'qbit.buzzer({PORT}).beep()'),
    A('buzzer', 'buzzer_play', T('зуммер %1 мелодия %2'), [PORT, text('NOTES', 'C4:200 E4 G4 C5:400')], 'qbit.buzzer({PORT}).play({NOTES})', T('Ноты через пробел: C4:200 — нота до, 200 мс; R — пауза')),
    A('buzzer', 'buzzer_off', T('зуммер %1 выключить звук'), [PORT], 'qbit.buzzer({PORT}).off()'),
    A('buzzer', 'buzzer_volume', T('зуммер %1 громкость %2 %'), [PORT, num('LEVEL', 100, { min: 0, max: 100 })], 'qbit.buzzer({PORT}).volume({LEVEL})'),

    A('servo', 'servo_angle', T('сервопривод %1 повернуть на %2 °'), [PORT, num('DEG', 90, { min: 0, max: 180 })], 'qbit.servo({PORT}).angle({DEG})', T('Угол от 0 до 180 градусов')),
    A('servo', 'servo_off', T('сервопривод %1 отпустить'), [PORT], 'qbit.servo({PORT}).off()', T('Вал можно крутить рукой')),

    A('motor', 'motor_speed', T('мотор %1 скорость %2 %'), [PORT, num('SPEED', 50, { min: -100, max: 100 })], 'qbit.motor({PORT}).speed({SPEED})', T('От −100 (назад) до 100 (вперёд)')),
    A('motor', 'motor_stop', T('мотор %1 остановить'), [PORT], 'qbit.motor({PORT}).stop()'),
    A('motor', 'motor_brake', T('мотор %1 тормоз'), [PORT], 'qbit.motor({PORT}).brake()'),

    A('relay', 'relay_turn', T('реле %1 %2'), [PORT, drop('STATE', ON_OFF_TOGGLE)], 'qbit.relay({PORT}).{STATE}()'),
    A('relay', 'relay_pulse', T('реле %1 включить на %2 мс'), [PORT, num('MS', 500, { min: 20 })], 'qbit.relay({PORT}).pulse({MS})', T('Включится и само выключится')),

    A('oled', 'oled_clear', T('дисплей %1 очистить'), [PORT], 'qbit.oled({PORT}).clear()'),
    A('oled', 'oled_print', T('дисплей %1 вывести строку %2'), [PORT, text('TEXT', T('Привет!'))], 'qbit.oled({PORT}).print({TEXT})', T('Строки идут одна под другой, когда место кончается, экран прокручивается')),
    A('oled', 'oled_text', T('дисплей %1 текст %2 в точке x %3 y %4'), [PORT, text('TEXT', 'q.bit'), num('X', 0, { min: 0, max: 127 }), num('Y', 0, { min: 0, max: 63 })], 'qbit.oled({PORT}).text({X}, {Y}, {TEXT})', T('Экран 128 × 64 точки')),
    A('oled', 'oled_size', T('дисплей %1 размер букв %2'), [PORT, drop('N', [[T('обычный'), '1'], [T('средний'), '2'], [T('крупный'), '3'], [T('огромный'), '4']])], 'qbit.oled({PORT}).size({N})'),
    A('oled', 'oled_pixel', T('дисплей %1 точка x %2 y %3'), [PORT, num('X', 64, { min: 0, max: 127 }), num('Y', 32, { min: 0, max: 63 })], 'qbit.oled({PORT}).pixel({X}, {Y})'),
    A('oled', 'oled_line', T('дисплей %1 линия от x %2 y %3 до x %4 y %5'), [PORT, num('X0', 0), num('Y0', 0), num('X1', 127), num('Y1', 63)], 'qbit.oled({PORT}).line({X0}, {Y0}, {X1}, {Y1})'),
    A('oled', 'oled_rect', T('дисплей %1 рамка x %2 y %3 ширина %4 высота %5'), [PORT, num('X', 10), num('Y', 10), num('W', 40), num('H', 20)], 'qbit.oled({PORT}).rect({X}, {Y}, {W}, {H})'),
    A('oled', 'oled_fill', T('дисплей %1 закрасить x %2 y %3 ширина %4 высота %5'), [PORT, num('X', 10), num('Y', 10), num('W', 40), num('H', 20)], 'qbit.oled({PORT}).fill({X}, {Y}, {W}, {H})'),
    A('oled', 'oled_bar', T('дисплей %1 полоса %2 %'), [PORT, num('PERCENT', 50, { min: 0, max: 100 })], 'qbit.oled({PORT}).bar({PERCENT})', T('Полоса прогресса внизу экрана')),
    A('oled', 'oled_invert', T('дисплей %1 инверсия %2'), [PORT, drop('ON', [[T('включить'), 'True'], [T('выключить'), 'False']])], 'qbit.oled({PORT}).invert({ON})'),

    A('irtx', 'irtx_send', T('ИК-передатчик %1 отправить адрес %2 команда %3'), [PORT, num('ADDR', 0, { min: 0, max: 255 }), num('CMD', 69, { min: 0, max: 255 })], 'qbit.irtx({PORT}).nec({ADDR}, {CMD})'),
    A('color', 'color_light', T('датчик цвета %1 подсветка %2'), [PORT, drop('ON', [[T('включить'), 'True'], [T('выключить'), 'False']])], 'qbit.color({PORT}).light({ON})'),
    A('encoder', 'encoder_zero', T('энкодер %1 обнулить позицию'), [PORT], 'qbit.encoder({PORT}).zero()'),
    A('pressure', 'pressure_zero', T('датчик давления %1 считать здесь высоту нулём'), [PORT], 'qbit.pressure({PORT}).zero()'),
    A('compass', 'compass_calibrate', T('компас %1 калибровка %2 с (вращайте плату)'), [PORT, num('SEC', 10, { min: 1, max: 60 })], 'qbit.compass({PORT}).calibrate({SEC})'),
    A('rtc', 'rtc_set', T('часы %1 установить время %2'), [PORT, text('WHEN', '2026-01-01 12:00:00')], 'qbit.rtc({PORT}).set({WHEN})', T('Формат: ГГГГ-ММ-ДД ЧЧ:ММ:СС')),
    A('button', 'button_reset', T('кнопка %1 обнулить счётчик нажатий'), [PORT], 'qbit.button({PORT}).reset()'),

    A('board', 'board_led', T('индикатор платы цвет %1'), [drop('COLOUR', COLOURS)], "qbit.board.led('{COLOUR}')", T('Светодиод STATUS на плате')),
    A('board', 'board_led_off', T('индикатор платы погасить'), [], 'qbit.board.led_off()'),

    /* ---------------------------------------------------------------- sensors */
    Vb('button', 'button_pressed', T('кнопка %1 нажата?'), [PORT], 'qbit.button({PORT}).pressed'),
    Vn('button', 'button_clicks', T('кнопка %1 число нажатий'), [PORT], 'qbit.button({PORT}).clicks'),
    Vb('touch', 'touch_pressed', T('сенсорная кнопка %1 нажата?'), [PORT], 'qbit.touch({PORT}).pressed'),
    Vb('switch', 'switch_on', T('переключатель %1 включён?'), [PORT], 'qbit.switch({PORT}).on'),
    Vb('tilt', 'tilt_tilted', T('датчик наклона %1 наклонён?'), [PORT], 'qbit.tilt({PORT}).tilted'),
    Vb('pir', 'pir_motion', T('датчик движения %1 видит движение?'), [PORT], 'qbit.pir({PORT}).motion'),
    Vb('hall', 'hall_magnet', T('датчик магнита %1 чувствует магнит?'), [PORT], 'qbit.hall({PORT}).magnet'),
    Vn('pot', 'pot_value', T('потенциометр %1 положение %'), [PORT], 'qbit.pot({PORT}).value', T('От 0 до 100')),
    Vn('slider', 'slider_value', T('ползунок %1 положение %'), [PORT], 'qbit.slider({PORT}).position', T('От 0 до 100')),
    Vn('light', 'light_value', T('освещённость %1 %'), [PORT], 'qbit.light({PORT}).light', T('От 0 (темно) до 100 (ярко)')),
    Vn('joystick', 'joystick_axis', T('джойстик %1 %2'), [PORT, drop('AXIS', [[T('влево−вправо (−1 … 1)'), 'x'], [T('вниз−вверх (−1 … 1)'), 'y']])], 'qbit.joystick({PORT}).{AXIS}'),
    Vb('joystick', 'joystick_dir', T('джойстик %1 отклонён %2?'), [PORT, drop('DIR', [[T('вверх'), '1'], [T('вправо'), '3'], [T('вниз'), '5'], [T('влево'), '7'], [T('вверх-вправо'), '2'], [T('вниз-вправо'), '4'], [T('вниз-влево'), '6'], [T('вверх-влево'), '8'], [T('никуда'), '0']])], '(qbit.joystick({PORT}).dir == {DIR})'),
    Vb('joystick', 'joystick_pressed', T('джойстик %1 стик нажат?'), [PORT], 'qbit.joystick({PORT}).pressed'),
    Vn('keypad', 'keypad_key', T('клавиатура %1 нажатая клавиша (0 — нет)'), [PORT], 'qbit.keypad({PORT}).key'),
    Vb('keypad', 'keypad_is', T('клавиатура %1 клавиша %2 нажата?'), [PORT, drop('KEY', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']])], '(qbit.keypad({PORT}).key == {KEY})'),
    Vn('pulse', 'pulse_bpm', T('пульс %1 ударов в минуту'), [PORT], 'qbit.pulse({PORT}).bpm'),
    Vn('encoder', 'encoder_position', T('энкодер %1 позиция'), [PORT], 'qbit.encoder({PORT}).position'),
    Vb('encoder', 'encoder_pressed', T('энкодер %1 ручка нажата?'), [PORT], 'qbit.encoder({PORT}).pressed'),
    Vn('temphum', 'temphum_temp', T('температура %1 °C'), [PORT], 'qbit.temphum({PORT}).temperature'),
    Vn('temphum', 'temphum_hum', T('влажность %1 %'), [PORT], 'qbit.temphum({PORT}).humidity'),
    Vn('pressure', 'pressure_hpa', T('давление %1 гПа'), [PORT], 'qbit.pressure({PORT}).pressure'),
    Vn('pressure', 'pressure_alt', T('высота %1 м'), [PORT], 'qbit.pressure({PORT}).altitude'),
    Vn('airq', 'airq_voc', T('загрязнение воздуха %1 (0 … 500)'), [PORT], 'qbit.airq({PORT}).voc', T('100 — обычный воздух')),
    Vn('color', 'color_channel', T('датчик цвета %1 %2'), [PORT, drop('CH', [[T('красный'), 'r'], [T('зелёный'), 'g'], [T('синий'), 'b']])], 'qbit.color({PORT}).{CH}', T('От 0 до 255')),
    Vn('color', 'color_lux', T('датчик цвета %1 освещённость, лк'), [PORT], 'qbit.color({PORT}).lux'),
    Vn('ultrasonic', 'ultrasonic_cm', T('расстояние %1 см'), [PORT], 'qbit.ultrasonic({PORT}).distance', T('0 — нет эха')),
    Vn('imu', 'imu_pitch', T('наклон %1 вперёд−назад °'), [PORT], 'qbit.imu({PORT}).pitch'),
    Vn('imu', 'imu_roll', T('наклон %1 влево−вправо °'), [PORT], 'qbit.imu({PORT}).roll'),
    Vn('imu', 'imu_accel', T('ускорение %1 %2, g'), [PORT, drop('AX', [[T('по x'), 'ax'], [T('по y'), 'ay'], [T('по z'), 'az']])], 'qbit.imu({PORT}).{AX}'),
    Vn('compass', 'compass_heading', T('компас %1 курс °'), [PORT], 'qbit.compass({PORT}).heading', T('0 — север, 90 — восток')),
    Vn('gesture', 'gesture_proximity', T('приближение %1 близость'), [PORT], 'qbit.gesture({PORT}).proximity', T('От 0 (далеко) до 100 (касается)')),
    Vb('gesture', 'gesture_near', T('рука рядом %1?'), [PORT], 'qbit.gesture({PORT}).near'),
    Vn('rtc', 'rtc_part', T('часы %1 %2'), [PORT, drop('PART', [[T('часы'), 'hour'], [T('минуты'), 'minute'], [T('секунды'), 'second'], [T('день'), 'day'], [T('месяц'), 'month'], [T('год'), 'year']])], 'qbit.rtc({PORT}).{PART}'),
    Vn('irrx', 'irrx_command', T('ИК-приёмник %1 последняя команда'), [PORT], 'qbit.irrx({PORT}).code'),
    Vb('rfid', 'rfid_present', T('RFID %1 метка рядом?'), [PORT], 'qbit.rfid({PORT}).present'),
    Vn('rfid', 'rfid_uid', T('RFID %1 номер метки'), [PORT], 'qbit.rfid({PORT}).text'),
    Vn('led', 'led_level', T('светодиод %1 яркость, %'), [PORT], 'qbit.led({PORT}).level'),
    Vb('relay', 'relay_is_on', T('реле %1 включено?'), [PORT], 'qbit.relay({PORT}).is_on'),
    Vb('buzzer', 'buzzer_playing', T('зуммер %1 играет?'), [PORT], 'qbit.buzzer({PORT}).playing'),
    Vn('servo', 'servo_position', T('сервопривод %1 угол °'), [PORT], 'qbit.servo({PORT}).position'),
    Vn('motor', 'motor_power', T('мотор %1 скорость, %'), [PORT], 'qbit.motor({PORT}).power'),
    Vn('board', 'board_battery', T('заряд батареи, %'), [], 'qbit.board.battery'),
    Vb('board', 'board_usb', T('USB подключён?'), [], 'qbit.board.usb'),
    Vb('board', 'board_charging', T('идёт зарядка?'), [], 'qbit.board.charging'),
    Vn('board', 'board_volts', T('напряжение платы, В'), [], 'qbit.board.volts'),
    Vn('board', 'board_amps', T('ток платы, А'), [], 'qbit.board.amps')
  ];

  /* the order modules are listed in the toolbox: what children reach for first (the switch left the
     kit on 2026-10-24: its blocks stay defined so old projects still load, but the palette leaves it out) */
  var MODULE_ORDER = ['led', 'rgb', 'buzzer', 'servo', 'motor', 'relay', 'oled', 'button', 'touch', 'pot', 'slider', 'light', 'joystick', 'keypad', 'encoder',
    'temphum', 'pressure', 'airq', 'ultrasonic', 'tilt', 'pir', 'hall', 'imu', 'compass', 'gesture', 'color', 'pulse', 'rtc', 'irrx', 'irtx', 'rfid'];

  Q.Catalog = {
    blocks: BLOCKS, moduleOrder: MODULE_ORDER, colours: COLOURS,
    byId: BLOCKS.reduce(function (m, b) { m[b.id] = b; return m; }, {}),
    forModule: function (key) { return BLOCKS.filter(function (b) { return b.mod === key; }); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
