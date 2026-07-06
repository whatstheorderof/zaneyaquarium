// Procedural WebAudio: ambient underwater soundscape + UI blips.
// No audio files needed — everything is synthesized.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this._ambientOn = false;
    this._bubbleTimer = null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.linearRampToValueAtTime(m ? 0 : 1, this.ctx.currentTime + 0.2);
    }
  }

  // ------------------------------------------------ ambient bed
  _startAmbient() {
    if (this._ambientOn || !this.ctx) return;
    this._ambientOn = true;
    const ctx = this.ctx;

    // Soft filtered noise = distant water wash.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;

    const g = ctx.createGain();
    g.gain.value = 0.05;

    // Slow swell.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);

    noise.connect(lp).connect(g).connect(this.master);
    noise.start();
    lfo.start();

    // Dreamy pad: two soft detuned sines.
    const padG = ctx.createGain();
    padG.gain.value = 0.018;
    for (const [freq, det] of [[196, 0], [294, 3]]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(padG);
      o.start();
    }
    padG.connect(this.master);

    // Occasional bubble blips.
    const scheduleBubble = () => {
      this._bubbleTimer = setTimeout(() => {
        if (!this.muted) this._blip(280 + Math.random() * 500, 0.12, 0.02);
        scheduleBubble();
      }, 900 + Math.random() * 2600);
    };
    scheduleBubble();
  }

  // ------------------------------------------------ one-shots
  _blip(freq, dur, vol = 0.05, type = "sine", slideTo = null) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case "rotate": this._blip(340, 0.12, 0.06, "triangle", 480); break;
      case "slide": this._blip(220, 0.2, 0.05, "sine", 320); break;
      case "lift": this._blip(180, 0.3, 0.05, "sine", 360); break;
      case "bump": this._blip(120, 0.1, 0.04, "square"); break;
      case "swim": this._blip(500, 0.25, 0.04, "sine", 750); break;
      case "star": {
        this._blip(880, 0.18, 0.07);
        setTimeout(() => this._blip(1320, 0.25, 0.06), 90);
        break;
      }
      case "splash": {
        this._splash();
        break;
      }
      case "win": {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.35, 0.07), i * 130));
        break;
      }
      case "click": this._blip(600, 0.07, 0.04, "triangle"); break;
    }
  }

  _splash() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.35;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.09;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }
}
