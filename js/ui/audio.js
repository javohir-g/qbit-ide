/* Sound: the click of a magnet, relay clicks and the buzzer modules (a real tone, from their PWM frequency).
   Browsers only allow audio after a user gesture, so the context is created on the first click. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var U = Q.util;

  function Sound() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.buz = new Map();
    this.noiseBuf = null;
  }

  Sound.prototype.ensure = function () {
    if (!this.enabled) return false;
    if (!this.ctx) {
      var AC = G.AudioContext || G.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      var len = this.ctx.sampleRate * 0.2, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  };

  Sound.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!on) this.stopAll();
  };

  Sound.prototype.stopAll = function () {
    var self = this;
    this.buz.forEach(function (v, k) { self._stopBuz(k); });
  };

  Sound.prototype._tone = function (type, f0, f1, dur, gain, delay) {
    var c = this.ctx, t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  Sound.prototype._noise = function (dur, gain, freq, delay) {
    var c = this.ctx, t = c.currentTime + (delay || 0);
    var s = c.createBufferSource(); s.buffer = this.noiseBuf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 2500; f.Q.value = 0.9;
    var g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  };

  Sound.prototype.play = function (name) {
    if (!this.ensure()) return;
    switch (name) {
      case 'snap':   this._tone('sine', 210, 85, 0.09, 0.32); this._noise(0.025, 0.28, 3200); this._tone('triangle', 1300, 900, 0.035, 0.05, 0.012); break;
      case 'pick':   this._tone('triangle', 620, 820, 0.04, 0.07); break;
      case 'detach': this._tone('sine', 150, 260, 0.07, 0.2); this._noise(0.018, 0.16, 1800); break;
      case 'relay':  this._noise(0.012, 0.5, 1500); this._tone('sine', 95, 55, 0.06, 0.35); this._noise(0.01, 0.3, 4000, 0.045); break;
      case 'error':  this._tone('square', 440, 0, 0.1, 0.05); this._tone('square', 311, 0, 0.16, 0.05, 0.11); break;
      case 'ok':     this._tone('sine', 880, 0, 0.06, 0.06); this._tone('sine', 1320, 0, 0.09, 0.06, 0.06); break;
      case 'ir':     this._tone('square', 3800, 0, 0.03, 0.02); break;
      default: break;
    }
  };

  Sound.prototype._stopBuz = function (uid) {
    var v = this.buz.get(uid);
    if (!v) return;
    var t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0.0001, t, 0.01);
    try { v.o.stop(t + 0.08); } catch (e) { /* already stopped */ }
    this.buz.delete(uid);
  };

  /** every frame: make the audible buzzers match the buzzer modules on the board */
  Sound.prototype.sync = function (board) {
    if (!this.ctx || !this.enabled) return;
    var seen = {}, self = this, c = this.ctx;
    board.ports.forEach(function (p) {
      var m = p.module;
      if (!m || m.key !== 'buzzer' || !m.powered) return;
      var loud = Q.moduleDef('buzzer').loudness(m);
      if (!(loud > 0.01)) return;
      seen[m.uid] = true;
      var v = self.buz.get(m.uid), f = U.clamp(m.out.freq, 40, 12000), gain = 0.015 + 0.09 * loud;
      if (!v) {
        var o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
        o.type = 'square'; o.frequency.value = f;
        lp.type = 'lowpass'; lp.frequency.value = 5200;
        g.gain.value = 0.0001;
        o.connect(lp); lp.connect(g); g.connect(self.master);
        o.start();
        v = { o: o, g: g };
        self.buz.set(m.uid, v);
      }
      v.o.frequency.setTargetAtTime(f, c.currentTime, 0.005);
      v.g.gain.setTargetAtTime(gain, c.currentTime, 0.008);
    });
    this.buz.forEach(function (v, uid) { if (!seen[uid]) self._stopBuz(uid); });
  };

  Q.Sound = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
