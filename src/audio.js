// Fully synthesized audio (no sound files): diesel engine, horns, air brakes, wind.
export class GameAudio {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.cabinFilter = ctx.createBiquadFilter();
    this.cabinFilter.type = 'lowpass';
    this.cabinFilter.frequency.value = 6000;
    this.cabinFilter.connect(this.master);
    this.master.connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.osc3 = ctx.createOscillator(); this.osc3.type = 'triangle';
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    const g3 = ctx.createGain(); g3.gain.value = 0.35;
    this.osc1.connect(this.engFilter);
    this.osc2.connect(g2).connect(this.engFilter);
    this.osc3.connect(g3).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.cabinFilter);
    // diesel clatter: noise amplitude-modulated at firing rate
    this.clatter = this.noise();
    this.clatFilter = ctx.createBiquadFilter();
    this.clatFilter.type = 'bandpass';
    this.clatFilter.frequency.value = 1800;
    this.clatFilter.Q.value = 0.8;
    this.clatGain = ctx.createGain();
    this.clatGain.gain.value = 0;
    this.clatter.connect(this.clatFilter).connect(this.clatGain).connect(this.cabinFilter);
    // turbo whistle
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine';
    this.turboGain = ctx.createGain(); this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.cabinFilter);
    // wind / road
    this.wind = this.noise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    for (const o of [this.osc1, this.osc2, this.osc3, this.turbo]) o.start();

    // player horn
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2600;
    for (const f of [415, 523, 622]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start();
    }
    hf.connect(this.hornGain).connect(this.master);
    this.lastSpeed = 0;
  }

  noise() {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    n.start();
    return n;
  }

  resume() { this.ctx?.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }

  update({ rpm, throttle, speed, cabin, braking }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = rpm / 20;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.osc3.frequency.setTargetAtTime(f * 1.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(180 + throttle * 700 + rpm * 0.15, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.09 + throttle * 0.11, t, 0.1);
    this.clatGain.gain.setTargetAtTime((0.012 + throttle * 0.02) * (rpm / 1500), t, 0.1);
    this.turbo.frequency.setTargetAtTime(1800 + rpm * 1.4, t, 0.2);
    this.turboGain.gain.setTargetAtTime(throttle * Math.max(0, rpm - 1100) / 1500 * 0.012, t, 0.3);
    this.windGain.gain.setTargetAtTime(Math.min(0.22, (speed / 28) ** 2 * 0.16), t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 25, t, 0.2);
    this.cabinFilter.frequency.setTargetAtTime(cabin ? 2400 : 7000, t, 0.1);
    // air brake release "pssht" when coming to a stop
    if (this.lastSpeed > 1.5 && speed < 0.3 && braking) this.airBrake();
    this.lastSpeed = speed;
  }

  horn(on) {
    if (!this.ctx) return;
    this.hornGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.02);
  }

  honk(kind, dist) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = 0.22 / (1 + dist / 22);
    const spec = {
      bus: { f: [392, 494], dur: 0.7, beeps: 1 },
      truck: { f: [330, 415, 494], dur: 0.9, beeps: 1 },
      cng: { f: [880], dur: 0.12, beeps: 3 },
      car: { f: [440, 554], dur: 0.25, beeps: 2 },
      micro: { f: [466, 587], dur: 0.2, beeps: 2 },
    }[kind] || { f: [440], dur: 0.3, beeps: 1 };
    const g = ctx.createGain();
    g.gain.value = 0;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2200;
    flt.connect(g).connect(this.master);
    const oscs = spec.f.map((f) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.97 + Math.random() * 0.06); o.connect(flt); o.start(t); return o; });
    for (let b = 0; b < spec.beeps; b++) {
      const t0 = t + b * (spec.dur + 0.08);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      g.gain.setValueAtTime(vol, t0 + spec.dur);
      g.gain.linearRampToValueAtTime(0, t0 + spec.dur + 0.04);
    }
    const end = t + spec.beeps * (spec.dur + 0.08) + 0.1;
    oscs.forEach((o) => o.stop(end));
  }

  airBrake() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.9);
  }

  tick(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = on ? 1400 : 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.05);
  }

  crash(intensity) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, 0.15 + intensity * 0.05), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.7);
  }
}
