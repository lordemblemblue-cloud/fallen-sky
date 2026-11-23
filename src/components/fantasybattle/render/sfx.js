/**
 * Fantasy Battle sound effects, synthesised with Web Audio (no audio files): bow nock, draw creak, release twang,
 * the charge hum, hits, guard shimmer, misses, victory and defeat stingers. Skills ask for them by sfxId through
 * the stage's onAudioEvent hook; this is the default handler.
 */

function env(gain, t, attack, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export class SfxSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.55;
    this.noise = null;
  }

  ensure() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 1.2);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  play(id) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const fn = this[`sfx_${id}`];
    if (typeof fn === 'function') fn.call(this, ctx, ctx.currentTime + 0.005);
  }

  tone(ctx, t, { type = 'sine', from, to = from, dur, peak = 0.2, attack = 0.005, filter = null }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const gain = ctx.createGain();
    env(gain, t, attack, peak, dur);
    let node = osc;
    if (filter) { const f = ctx.createBiquadFilter(); Object.assign(f, { type: filter.type }); f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; osc.connect(f); node = f; }
    node.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + attack + dur + 0.05);
  }

  hiss(ctx, t, { dur, peak = 0.2, attack = 0.005, type = 'bandpass', from = 1200, to = from, q = 1 }) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    env(gain, t, attack, peak, dur);
    src.connect(f).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + attack + dur + 0.05);
  }

  sfx_nock(ctx, t) { this.hiss(ctx, t, { dur: 0.04, peak: 0.25, from: 2600, q: 3 }); this.tone(ctx, t, { type: 'triangle', from: 900, to: 600, dur: 0.05, peak: 0.08 }); }
  sfx_draw(ctx, t) { this.hiss(ctx, t, { dur: 0.32, peak: 0.07, attack: 0.12, from: 700, to: 1300, q: 9 }); this.tone(ctx, t, { type: 'sawtooth', from: 55, to: 80, dur: 0.3, peak: 0.025, attack: 0.1, filter: { type: 'lowpass', freq: 400 } }); }
  sfx_release(ctx, t) { this.tone(ctx, t, { type: 'triangle', from: 260, to: 120, dur: 0.2, peak: 0.32 }); this.hiss(ctx, t, { dur: 0.05, peak: 0.2, from: 3000, q: 2 }); this.hiss(ctx, t + 0.02, { dur: 0.22, peak: 0.07, from: 2400, to: 700, q: 2 }); }
  sfx_heavyRelease(ctx, t) {
    this.tone(ctx, t, { type: 'triangle', from: 170, to: 60, dur: 0.35, peak: 0.42 });
    this.tone(ctx, t, { type: 'sine', from: 90, to: 38, dur: 0.5, peak: 0.45, attack: 0.01 });
    this.hiss(ctx, t, { dur: 0.4, peak: 0.16, from: 3200, to: 500, q: 1.5 });
  }
  sfx_charge(ctx, t) { this.tone(ctx, t, { type: 'sine', from: 220, to: 700, dur: 0.75, peak: 0.07, attack: 0.25 }); this.hiss(ctx, t, { dur: 0.75, peak: 0.05, attack: 0.3, from: 500, to: 3000, q: 6 }); }
  sfx_hit(ctx, t) { this.tone(ctx, t, { type: 'sine', from: 140, to: 48, dur: 0.18, peak: 0.55 }); this.hiss(ctx, t, { dur: 0.09, peak: 0.3, type: 'lowpass', from: 1400 }); }
  sfx_crit(ctx, t) { this.sfx_hit(ctx, t); this.tone(ctx, t + 0.02, { type: 'sine', from: 1320, to: 1250, dur: 0.25, peak: 0.12 }); this.tone(ctx, t + 0.02, { type: 'sine', from: 1980, dur: 0.2, peak: 0.06 }); }
  sfx_guard(ctx, t) { for (const f of [880, 1320, 1760]) this.tone(ctx, t, { type: 'sine', from: f, to: f * 1.01, dur: 0.6, peak: 0.045, attack: 0.06 }); }
  sfx_guardHit(ctx, t) { this.tone(ctx, t, { type: 'square', from: 640, to: 520, dur: 0.18, peak: 0.12, filter: { type: 'highpass', freq: 500 } }); this.tone(ctx, t, { type: 'sine', from: 1280, dur: 0.3, peak: 0.08 }); }
  sfx_miss(ctx, t) { this.hiss(ctx, t, { dur: 0.25, peak: 0.12, from: 2200, to: 500, q: 2 }); }
  sfx_victory(ctx, t) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(ctx, t + i * 0.11, { type: 'triangle', from: f, dur: 0.32, peak: 0.16 })); }
  sfx_defeat(ctx, t) { [392, 329.63, 261.63].forEach((f, i) => this.tone(ctx, t + i * 0.22, { type: 'sine', from: f, to: f * 0.97, dur: 0.45, peak: 0.13 })); }

  dispose() {
    try { this.ctx?.close(); } catch { /* already closed */ }
    this.ctx = null;
  }
}
