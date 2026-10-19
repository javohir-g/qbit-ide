/* The world around the board: the ambient values the sensor modules measure.
   Board frame: x to the right, y towards the USB-C edge (up on screen), z out of the lid.
   pitch > 0 raises the USB edge, roll > 0 lowers the right edge, yaw = compass heading of the USB edge. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var U = Q.util, RAD = U.RAD;

  function Environment() {
    this.tempC = 24;
    this.humidity = 45;
    this.pressureHpa = 1013;
    this.lux = 400;
    this.voc = 100;                 // Sensirion VOC index: 100 = typical clean room air
    this.pitch = 0; this.roll = 0; this.yaw = 0;
    this.irCoupling = true;         // an IR transmitter module "sees" the IR receiver modules on the same board
    this.hardIron = [1.1, -0.7, 1.4];   // gauss: the port magnets + main-board magnets next to the compass
    this.earth = { north: 0.20, down: 0.42 };   // gauss, mid latitudes
    this.t = 0;
    this._shakeUntil = 0;
    this._shakeLen = 1;
    this._prev = { pitch: 0, roll: 0, yaw: 0 };
    this.angVel = { x: 0, y: 0, z: 0 };         // deg/s, low-passed
  }

  Environment.prototype.step = function (dt, t) {
    this.t = t;
    if (dt > 0) {
      var k = Math.min(1, dt * 20);
      var dp = (this.pitch - this._prev.pitch) / dt;
      var dr = (this.roll - this._prev.roll) / dt;
      var dy = ((U.mod(this.yaw - this._prev.yaw + 180, 360)) - 180) / dt;
      this.angVel.x += (dp - this.angVel.x) * k;
      this.angVel.y += (dr - this.angVel.y) * k;
      this.angVel.z += (dy - this.angVel.z) * k;
    }
    this._prev.pitch = this.pitch; this._prev.roll = this.roll; this._prev.yaw = this.yaw;
  };

  /** Shake the board for `seconds` (default 0.9). */
  Environment.prototype.shakeNow = function (seconds) {
    this._shakeLen = seconds || 0.9;
    this._shakeUntil = this.t + this._shakeLen;
  };

  Environment.prototype.shakeLevel = function () {
    var left = this._shakeUntil - this.t;
    return left > 0 ? Math.min(1, left / this._shakeLen * 1.5) : 0;
  };

  /** Angle between the board normal and "up", degrees (0 = lying flat, face up). */
  Environment.prototype.tiltDeg = function () {
    var c = Math.cos(this.roll * RAD) * Math.cos(this.pitch * RAD);
    return Math.acos(U.clamp(c, -1, 1)) / RAD;
  };

  /** Accelerometer, g, in the board frame (+1 g on z when flat). */
  Environment.prototype.accel = function () {
    var p = this.pitch * RAD, r = this.roll * RAD;
    var a = [-Math.sin(r), Math.cos(r) * Math.sin(p), Math.cos(r) * Math.cos(p)];
    var s = this.shakeLevel();
    if (s > 0) {
      var t = this.t;
      a[0] += s * 2.6 * Math.sin(t * 61.0);
      a[1] += s * 2.2 * Math.sin(t * 47.0 + 1.3);
      a[2] += s * 1.8 * Math.sin(t * 53.0 + 2.1);
    }
    return a;
  };

  /** Gyroscope, deg/s, in the board frame. */
  Environment.prototype.gyro = function () {
    var g = [this.angVel.x, this.angVel.y, this.angVel.z];
    var s = this.shakeLevel();
    if (s > 0) {
      g[0] += s * 180 * Math.sin(this.t * 43.0);
      g[1] += s * 160 * Math.sin(this.t * 37.0 + 0.7);
      g[2] += s * 120 * Math.sin(this.t * 29.0 + 1.9);
    }
    return g;
  };

  /** Magnetic field at the compass chip, gauss, board frame: Earth (rotated by heading and tilt) + hard-iron offset. */
  Environment.prototype.field = function () {
    var psi = this.yaw * RAD, p = this.pitch * RAD, r = this.roll * RAD;
    var bx = -this.earth.north * Math.sin(psi), by = this.earth.north * Math.cos(psi), bz = -this.earth.down;
    var ax = bx * Math.cos(r) - bz * Math.sin(r), ay = by, az = bx * Math.sin(r) + bz * Math.cos(r);
    var f = [ax, ay * Math.cos(p) + az * Math.sin(p), -ay * Math.sin(p) + az * Math.cos(p)];
    return [f[0] + this.hardIron[0], f[1] + this.hardIron[1], f[2] + this.hardIron[2]];
  };

  Environment.prototype.toJSON = function () {
    return { tempC: this.tempC, humidity: this.humidity, pressureHpa: this.pressureHpa, lux: this.lux, voc: this.voc,
             pitch: this.pitch, roll: this.roll, yaw: this.yaw, irCoupling: this.irCoupling };
  };
  Environment.prototype.restore = function (o) {
    var self = this;
    ['tempC', 'humidity', 'pressureHpa', 'lux', 'voc', 'pitch', 'roll', 'yaw', 'irCoupling'].forEach(function (k) {
      if (o && o[k] !== undefined) self[k] = o[k];
    });
  };

  Q.Environment = Environment;
})(typeof globalThis !== 'undefined' ? globalThis : this);
