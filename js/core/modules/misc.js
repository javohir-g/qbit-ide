/* proto2 (the 65 mm prototyping board) and three debug modules that exist only in the simulator:
   a blank EEPROM, a corrupted passport and a short circuit on 5 V - to see how the board reacts. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var U = Q.util;

  /* proto2: LDO + passport EEPROM + free holes. Nothing to simulate, the user wires it up himself. */
  Q.defineModule('proto2', {
    currentMa: function () { return 1; },
    readouts: function () { return [{ label: T('Макетная плата'), value: T('контакты 5V, 3V3, GND, SIG, SDA, SCL выведены на площадки') }]; },
    hint: T('Пустая макетная плата: на ней нет датчиков, только паспорт и стабилизатор.'),
    api: function () { return {}; }
  });

  Q.defineModule('dbg_blank', {
    debug: true, id: 0xF001, name: T('Чистая EEPROM'), fmt: 30, io: '-', part: T('модуль без паспорта'), kit: 0,
    note: T('отладка: EEPROM стёрта (все байты 0xFF)'),
    passportImage: function () { return new Uint8Array(256).fill(0xFF); },
    currentMa: function () { return 8; },
    hint: T('Плата не узнаёт такой модуль: SIG остаётся входом, 5 В в бюджет не берётся.')
  });

  Q.defineModule('dbg_badcrc', {
    debug: true, id: 0xF002, name: T('Битый паспорт'), fmt: 30, io: '-', part: T('паспорт с ошибкой CRC'), kit: 0,
    note: T('отладка: в паспорте кнопки испорчен один бит'),
    passportImage: function () {
      var img = U.fromHex(Q.DATA.passports.button);
      img[0x30] ^= 0x04;                                  // one flipped bit in the label
      return img;
    },
    currentMa: function () { return 8; },
    hint: T('CRC не сходится — плата считает модуль неизвестным.')
  });

  Q.defineModule('dbg_short', {
    debug: true, id: 0xF003, name: T('Замыкание 5 В'), fmt: 30, io: '-', part: T('нагрузка 3 А на линии 5 В'), kit: 0,
    note: T('отладка: имитирует короткое замыкание между 5 В и GND'),
    passportImage: function () {
      return Q.Passport.build({ typeId: 0xF003, iface: 0, formatMm: 30, flags: 0, currentMa: 3, label: 'SHORT' });
    },
    currentMa: function () { return 3000; },
    hint: T('eFuse порта (1,8 А) отключает порт за 8 мс. После трёх попыток порт блокируется.')
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
