// Procedural WebAudio: ambient underwater soundscape + UI blips.
// No audio files needed — everything is synthesized.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this._ambientOn = false;
    this._bubbleTimer = null;
    this._musicTimer = null;
    this._echo = null;
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
    g.gain.value = 0.035;

    // Slow swell.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);

    noise.connect(lp).connect(g).connect(this.master);
    noise.start();
    lfo.start();

    // Dreamy generative music: soft bell notes from a pentatonic scale,
    // drifting through a feedback echo. Never repeats, never drones.
    this._echo = this._makeEcho();
    this._startMusic();

    // Occasional bubble blips.
    const scheduleBubble = () => {
      this._bubbleTimer = setTimeout(() => {
        if (!this.muted) this._blip(280 + Math.random() * 500, 0.12, 0.02);
        scheduleBubble();
      }, 900 + Math.random() * 2600);
    };
    scheduleBubble();
  }

  // ------------------------------------------------ generative music
  _makeEcho() {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2200;

    input.connect(this.master);
    input.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    feedback.connect(this.master);
    return input;
  }

  _startMusic() {
    const ctx = this.ctx;
    // C major pentatonic across two octaves — every combination sounds calm.
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    let lastIdx = 4;

    const bell = (freq, when, vol) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      // A quiet octave shimmer on top makes it bell-like.
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 2;

      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
      g2.gain.setValueAtTime(0, when);
      g2.gain.linearRampToValueAtTime(vol * 0.25, when + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);

      o.connect(g).connect(this._echo);
      o2.connect(g2).connect(this._echo);
      o.start(when); o.stop(when + 2.6);
      o2.start(when); o2.stop(when + 1.4);
    };

    const phrase = () => {
      if (!this.muted) {
        const now = ctx.currentTime;
        // Melodies wander: step to a nearby scale note most of the time.
        const step = [-2, -1, -1, 1, 1, 2][(Math.random() * 6) | 0];
        lastIdx = Math.max(0, Math.min(scale.length - 1, lastIdx + step));
        bell(scale[lastIdx], now, 0.045);
        // Sometimes add a soft harmony a scale-third below, slightly behind.
        if (Math.random() < 0.35 && lastIdx >= 2) {
          bell(scale[lastIdx - 2], now + 0.22, 0.028);
        }
        // Rarely, a deep gentle root note grounds the phrase.
        if (Math.random() < 0.18) bell(scale[0] / 2, now + 0.1, 0.035);
      }
      this._musicTimer = setTimeout(phrase, 1600 + Math.random() * 2400);
    };
    this._musicTimer = setTimeout(phrase, 600);
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
