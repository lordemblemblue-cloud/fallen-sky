// Fleet Assault sounds, synthesised with WebAudio (Game 2's sound bank only has saber and Force effects).
export class FleetAudio {
  constructor(volume = 0.7) { this.volume = volume; this.ctx = null; this.boostGain = null; }
  resume() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
      this.boostGain = this.ctx.createGain(); this.boostGain.gain.value = 0;
      src.connect(f); f.connect(this.boostGain); this.boostGain.connect(this.master); src.start();
    } catch { this.ctx = null; }
  }
  tone(type, f0, f1, dur, gain) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, gain, from = 1200, to = 80) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // one call per frame with the events since the last one
  play(events, { boosting = false, near = () => 1 } = {}) {
    if (!this.ctx) return;
    let shots = 0;
    for (const e of events) {
      if (e.e === 'shot') { if (shots++ < 2) this.tone('sawtooth', 1300, 260, 0.09, 0.045); }
      else if (e.e === 'hit') this.tone('square', 1800, 1500, 0.05, 0.03);
      else if (e.e === 'hurt') this.tone('triangle', 160, 90, 0.18, 0.12);
      else if (e.e === 'kill') { const k = near(e); if (k > 0.02) this.burst(0.9, 0.35 * k); }
      else if (e.e === 'cruiser') this.burst(3.5, 0.6, 600, 40);
      else if (e.e === 'missile') this.tone('sawtooth', 400, 900, 0.35, 0.04);
      else if (e.e === 'subsystem' || e.e === 'detonate') this.burst(1.6, 0.35, 900, 60);
    }
    if (this.boostGain) this.boostGain.gain.setTargetAtTime(boosting ? 0.12 : 0, this.ctx.currentTime, 0.12);
  }
  dispose() { try { this.ctx?.close(); } catch { /* closed */ } this.ctx = null; }
}
