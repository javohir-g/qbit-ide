/* Power sources and the numbers of the real board (design.py / README of qbit_main_revA).
     USB-C -> CH224A (PD, 15 V) -> VBUS
     VBUS < 6 V : bypass eFuse TPS259474A 3 A -> 5V_SRC          (PC / plain 5 V adapter)
     VBUS > 7.5 V: LM5148 buck 5 V / 8 A       -> 5V_SRC          (PD adapter)
     battery 1S -> TPS61088 boost 5.03 V (~2 A) -> 5V_SYS         (only without USB)
     5V_SYS -> 5 mOhm shunt (INA226) -> 5V_MAIN -> 8 x TPS259474A (1.8 A) -> 5V_P1..5V_P8, AMS1117 -> 3V3 */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;

  // The battery is always on the board; a source here is what is plugged into USB-C ('battery' = nothing plugged in).
  var SOURCES = {
    'usb-pd':   { id: 'usb-pd',   label: T('USB-C PD 15 В / 3 А (45 Вт)'),      short: T('PD 15 В'),   usb: true,  maxMa: 8000, volts: 5.0,  vbus: 15.0 },
    'usb-5v3a': { id: 'usb-5v3a', label: T('Зарядка 5 В / 3 А'),                short: T('5 В 3 А'),   usb: true,  maxMa: 3000, volts: 5.0,  vbus: 5.0 },
    'usb-pc3':  { id: 'usb-pc3',  label: T('USB 3.0 порт ПК (0,9 А)'),          short: 'USB 3.0',   usb: true,  maxMa: 900,  volts: 5.0,  vbus: 5.0 },
    'usb-pc':   { id: 'usb-pc',   label: T('USB 2.0 порт ПК (0,5 А)'),          short: T('USB ПК'),    usb: true,  maxMa: 500,  volts: 5.0,  vbus: 5.0 },
    'battery':  { id: 'battery',  label: T('Без USB — только аккумулятор'),     short: T('батарея'),   usb: false, maxMa: 2000, volts: 5.03, vbus: 0 }
  };

  var NUM = {
    baseMa: 150,           // ESP32-S3 + Wi-Fi AP + regulators, without ports
    portIlimMa: 1800,      // TPS259474A, ILIM resistor 1.87 k (connector rating 2 A)
    portTripMs: 8,         // ITIM 10 nF: transient blanking
    portPgV: 4.5,          // PG threshold (divider 100k / 36k)
    portRon: 0.10,         // ohm: eFuse + connector + track
    shuntOhm: 0.005,       // INA226 shunt
    sourceRs: 0.045,       // ohm: source + cable resistance seen at 5V_SYS (used for the voltage sag)
    brownoutV: 4.1,        // below this the 3.3 V LDO drops out and the ESP32 resets
    batteryMah: 5000,
    chargeMa: 1500         // BQ25606 charge current
  };

  Q.SOURCES = SOURCES;
  Q.POWER = NUM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
