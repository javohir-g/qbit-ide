/* Module registry and module instances.

   A module DEFINITION (Q.defineModule) is the behaviour of one module type: how its PCB answers on SIG / I2C,
   how much current it takes, how it moves in time, and the friendly API a program uses (the "driver").
   Catalogue facts (ID, name, 30/65 mm, interface, I2C address, kit) come from Q.DATA, i.e. modules/catalog.py.

   Definition fields (all optional unless marked):
     state()            -> initial user-controlled state (what a person does to the module: press, turn ...)
     out()              -> initial output state (what the module does: LED brightness, servo angle ...)
     create(inst)       -> one-off setup
     sigOut(inst)       -> millivolts the module drives onto SIG, or null (nothing / pulled low by its 100k)
     onSig(inst, d)     -> the main board drives SIG: d = {type:'level',v} | {type:'pwm',freq,duty} | {type:'frame',kind,data}
     i2c(inst)          -> { addr: { write(bytes), read(n) } }  devices other than the passport EEPROM (0x50)
     i2cAddrs           -> addresses that ACK although there is no register model behind them
     currentMa(inst)    -> current from the 5 V pin of the port, mA
     update(inst, dt)   -> time-dependent behaviour
     powerDown(inst)    -> called when the 5 V of the port goes away (default: outputs reset)
     api(inst, port, board) -> the driver object handed to programs
     controls / readouts / tests -> descriptions the inspector turns into widgets */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var U = Q.util;

  var registry = {};
  var order = [];
  var uidCounter = 0;

  function catalogEntry(key) {
    var mods = (Q.DATA && Q.DATA.modules) || [];
    for (var i = 0; i < mods.length; i++) if (mods[i].key === key) return mods[i];
    // taken out of the product but built (the firmware still knows it): it behaves, but no list shows it
    var old = (Q.DATA && Q.DATA.retired) || [];
    for (i = 0; i < old.length; i++) if (old[i].key === key) return Object.assign({ retired: true }, old[i]);
    return null;
  }

  Q.defineModule = function (key, def) {
    var cat = catalogEntry(key);
    def.key = key;
    if (cat) {
      def.id = cat.id; def.name = cat.name; def.fmt = cat.fmt; def.io = cat.io; def.part = cat.part;
      def.addr = cat.addr; def.kit = cat.kit; def.cat = cat.cat; def.note = cat.note;
      def.variants = cat.variants; def.variantIndex = cat.variantIndex; def.retired = !!cat.retired;
      def.defaultVariant = cat.variants.length ? (cat.variants.indexOf('white') >= 0 ? 'white' : cat.variants[0]) : null;
    } else if (!def.debug) {
      throw new Error('module "' + key + '" is not in the catalogue (modules/catalog.py)');
    } else {
      def.variants = def.variants || []; def.variantIndex = def.variantIndex || {};
      def.kit = def.kit || 0; def.cat = def.cat || 0xF0; def.addr = def.addr || 0; def.note = def.note || '';
    }
    if (!registry[key]) order.push(key);
    registry[key] = def;
    return def;
  };

  Q.moduleDef = function (key) { return registry[key] || null; };

  /** What the firmware does with the TYPE_ID read from a passport: find the driver for it. */
  Q.moduleByTypeId = function (id) {
    for (var i = 0; i < order.length; i++) if (registry[order[i]].id === id) return registry[order[i]];
    return null;
  };

  /** Every defined module, product modules first (catalogue order), then the debug ones. */
  Q.moduleList = function (opts) {
    var withDebug = opts && opts.debug;
    var list = [];
    var mods = (Q.DATA && Q.DATA.modules) || [];
    for (var i = 0; i < mods.length; i++) if (registry[mods[i].key]) list.push(registry[mods[i].key]);
    if (withDebug) for (var j = 0; j < order.length; j++) if (registry[order[j]].debug) list.push(registry[order[j]]);
    return list;
  };

  /** The passport image a fresh module of this type carries. */
  function passportImage(def, variant) {
    if (def.passportImage) return def.passportImage();
    var P = Q.DATA.passports;
    var name = def.key;
    if (def.variants && def.variants.length) {
      var v = variant || def.defaultVariant;
      name = def.key + '_' + v;
      if (!P[name]) {      // a colour that is not shipped (blue LED): derive it from the default image
        var idx = def.variantIndex[v];
        var base = U.fromHex(P[def.key + '_' + def.defaultVariant]);
        return idx === undefined ? base : Q.Passport.withVariant(base, idx);
      }
    }
    if (!P[name]) throw new Error('no passport image for ' + name);
    return U.fromHex(P[name]);
  }

  function ModuleInstance(def, opts) {
    U.Emitter.call(this);
    opts = opts || {};
    this.def = def;
    this.key = def.key;
    this.uid = ++uidCounter;
    this.typeId = def.id;
    this.name = def.name;
    this.slots = def.fmt === 65 ? 2 : 1;
    this.variant = def.variants && def.variants.length ? (opts.variant || def.defaultVariant) : null;
    this.board = opts.board || null;
    this.port = null;
    this.powered = false;
    this.sigDrive = { type: 'hiz' };
    this.state = Object.assign({}, def.state ? def.state() : {}, opts.state || {});
    this.out = def.out ? def.out() : {};
    this.eeprom = passportImage(def, this.variant);
    this.api = null;
    this.ev = new U.Emitter();      // driver events ('press', 'tick' ...); replaced whenever the driver is reloaded
    this.cleanups = [];             // things the driver subscribed to (board 'step' ...), undone on unload
    this.dirty = true;
    this._i2c = null;
    if (def.create) def.create(this);
  }
  ModuleInstance.prototype = Object.create(U.Emitter.prototype);
  ModuleInstance.prototype.constructor = ModuleInstance;

  ModuleInstance.prototype.touch = function () { this.dirty = true; };

  /** Drop the driver: its event listeners and board subscriptions go, a new driver starts clean. */
  ModuleInstance.prototype.unload = function () {
    for (var i = 0; i < this.cleanups.length; i++) { try { this.cleanups[i](); } catch (e) { /* ignore */ } }
    this.cleanups = [];
    this.api = null;
    this.ev = new U.Emitter();
  };

  /** Change a piece of user-controlled state (a person pressed / turned / moved something). */
  ModuleInstance.prototype.set = function (k, v) {
    if (this.state[k] === v) return;
    this.state[k] = v;
    this.dirty = true;
    this.emit('state', k, v);
    if (this.def.onState) this.def.onState(this, k, v);
  };

  ModuleInstance.prototype.setVariant = function (name) {
    if (!this.def.variants.length || this.variant === name || this.def.variantIndex[name] === undefined) return;
    this.variant = name;
    this.eeprom = passportImage(this.def, name);
    this._i2c = null;
    this.dirty = true;
    this.emit('variant', name);
  };

  ModuleInstance.prototype.sigOut = function () {
    return this.powered && this.def.sigOut ? this.def.sigOut(this) : null;
  };

  ModuleInstance.prototype.onSig = function (d) {
    this.sigDrive = d;
    if (this.powered && this.def.onSig) this.def.onSig(this, d);
  };

  ModuleInstance.prototype.setPowered = function (on) {
    on = !!on;
    if (on === this.powered) return;
    this.powered = on;
    this.dirty = true;
    if (on) {
      if (this.def.powerUp) this.def.powerUp(this);
      if (this.def.onSig && this.sigDrive && this.sigDrive.type !== 'hiz') this.def.onSig(this, this.sigDrive);
    } else if (this.def.powerDown) {
      this.def.powerDown(this);
    } else {
      this.out = this.def.out ? this.def.out() : {};
    }
    this.emit('power', on);
  };

  ModuleInstance.prototype.currentMa = function () {
    if (!this.powered) return 0;
    return this.def.currentMa ? this.def.currentMa(this) : 3;
  };

  ModuleInstance.prototype.update = function (dt) {
    if (this.powered && this.def.update) this.def.update(this, dt);
  };

  /** I2C devices on the module's port channel: the passport EEPROM (0x50) plus whatever the type defines. */
  ModuleInstance.prototype.i2cDevices = function () {
    if (this._i2c) return this._i2c;
    var self = this, ptr = 0;
    var map = {};
    map[0x50] = {
      write: function (bytes) {
        if (!bytes.length) return true;
        ptr = bytes[0];
        for (var i = 1; i < bytes.length; i++) { self.eeprom[ptr & 0xFF] = bytes[i]; ptr = (ptr + 1) & 0xFF; }
        return true;
      },
      read: function (n) {
        var out = new Uint8Array(n);
        for (var i = 0; i < n; i++) { out[i] = self.eeprom[ptr & 0xFF]; ptr = (ptr + 1) & 0xFF; }
        return out;
      }
    };
    if (this.def.i2c) {
      var extra = this.def.i2c(this);
      for (var a in extra) map[+a] = extra[a];
    }
    if (this.def.i2cAddrs) {
      this.def.i2cAddrs.forEach(function (a) {
        if (!map[a]) map[a] = { write: function () { return true; }, read: function (n) { return new Uint8Array(n).fill(0xFF); }, emulated: false };
      });
    }
    this._i2c = map;
    return map;
  };

  ModuleInstance.prototype.toJSON = function () {
    return { key: this.key, variant: this.variant, state: JSON.parse(JSON.stringify(this.state)) };
  };

  Q.ModuleInstance = ModuleInstance;
  Q.createModule = function (key, opts) {
    var def = registry[key];
    if (!def) throw new Error('unknown module "' + key + '"');
    return new ModuleInstance(def, opts);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
