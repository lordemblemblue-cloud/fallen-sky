// Duelist Adventure's sound. Recordings made for the game with ElevenLabs (tools/duelist/record-ability-sounds.mjs:
// public/audio/duelist/sfx, listed in sfx.json) play where they exist; every other sound, and any recording not yet
// loaded, is synthesized here with WebAudio (noise, oscillators, filters and envelopes). Sounds sit in the world
// (panned by where they happen relative to the camera) and duck nothing; one master volume, muted or not, remembered
// per browser. Recorded loops (Rage's breathing and fire) run while asked for, frame by frame (loop / stopLoop).
//
//   swing (crystal blade through air), hitVeil (the Veil drinks a blow: a glassy knock), hitShield (a bright
//   hex chime), hitBody (a dull thud), block, parry, push, pull, gripStart + a held hum (gripHum loop),
//   throw, breach (space cracking), resist (a burst), roll, dash, knockdown (body on the floor), collapse
//   (the Veil shattering), defeat, victory / defeat stingers.
/* global window, fetch */

import { createConduitAudioBank } from './maps/conduitAudioBank.mjs';

const STORAGE = 'duelist.audio';
const SAMPLES = '/audio/duelist/sfx/';

function readSettings() {
  try { return { volume: 0.8, muted: false, ...JSON.parse(window.localStorage.getItem(STORAGE) || '{}') }; } catch { return { volume: 0.8, muted: false }; }
}
function writeSettings(s) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* private window: settings last this visit */ }
}

export function createDuelAudio() {
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  const settings = readSettings();
  let ctx = null;
  let master = null;
  let conduitBank = null; // lazy; only the Conduit host opts in
  let noise = null; // two seconds of white noise, shared
  const loops = new Map(); // key -> { stop, set }
  let samples = null; // name -> { gain, loop, buffers } once loaded
  let loading = null;
  // the recordings: listed in sfx.json, fetched and decoded once the context exists
  function loadSamples() {
    if (loading || !ctx || typeof fetch !== 'function') return loading;
    loading = fetch(SAMPLES + 'sfx.json').then((r) => (r.ok ? r.json() : { sounds: {} })).then(async ({ sounds = {} }) => {
      const loaded = {};
      await Promise.all(Object.entries(sounds).map(async ([name, s]) => {
        const buffers = await Promise.all((s.files || []).map((f) => fetch(SAMPLES + f).then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b)).catch(() => null)));
        if (buffers.some(Boolean)) loaded[name] = { gain: s.gain ?? 1, loop: !!s.loop, buffers: buffers.filter(Boolean) };
      }));
      samples = loaded;
    }).catch(() => { samples = {}; });
    return loading;
  }

  function ensure() {
    if (ctx || !Ctx) return ctx;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume;
    // a soft limiter so stacked hits do not clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    loadSamples();
    return ctx;
  }
  // a recording at a world point, a little faster or slower each time so repeats do not sound the same
  function playSample(s, position, options) {
    const src = ctx.createBufferSource();
    src.buffer = s.buffers[(Math.random() * s.buffers.length) | 0];
    src.playbackRate.value = options.rate ?? 1 + (Math.random() * 2 - 1) * 0.04;
    const strength = options.strength ? Math.min(1.3, Math.max(0.5, options.strength)) : 1;
    src.connect(out(position, (options.gain ?? 1) * s.gain * strength));
    src.start(ctx.currentTime + 0.005);
  }

  // ---- building blocks
  // where a sound sits: a panner at the world point (listener = camera), or straight to the master
  function out(position, gain = 1) {
    const g = ctx.createGain();
    g.gain.value = gain;
    if (position) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.rolloffFactor = 0.9;
      p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z;
      g.connect(p).connect(master);
      g.panner = p; // a held sound moves it
    } else g.connect(master);
    return g;
  }
  function env(param, t, peak, attack, decay, from = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function noiseBurst(dest, t, { type = 'bandpass', f0 = 1200, f1 = 400, q = 1.2, peak = 0.6, attack = 0.005, decay = 0.2, rate = 1 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = ctx.createGain();
    env(g.gain, t, peak, attack, decay);
    src.connect(filter).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }
  function tone(dest, t, { type = 'sine', f0 = 440, f1 = null, peak = 0.3, attack = 0.004, decay = 0.3, detune = 0 }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f0, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + attack + decay);
    const g = ctx.createGain();
    env(g.gain, t, peak, attack, decay);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }
  // a struck crystal: inharmonic partials ringing down
  function chime(dest, t, base, { peak = 0.12, decay = 0.6, partials = [1, 2.32, 3.86, 5.41] } = {}) {
    partials.forEach((ratio, i) => tone(dest, t, { f0: base * ratio, peak: peak / (1 + i * 0.7), attack: 0.002, decay: decay / (1 + i * 0.4) }));
  }
  const jitter = (x, amount = 0.08) => x * (1 + (Math.random() * 2 - 1) * amount);

  const SOUNDS = {
    swing(t, d, { heavy = false } = {}) {
      noiseBurst(d, t, { f0: jitter(heavy ? 1800 : 2600), f1: jitter(heavy ? 300 : 500), q: 1.6, peak: heavy ? 0.5 : 0.35, attack: 0.03, decay: heavy ? 0.26 : 0.17 });
      tone(d, t + 0.01, { f0: jitter(heavy ? 1700 : 2400), f1: jitter(1300), peak: 0.03, attack: 0.02, decay: 0.2 });
    },
    hitVeil(t, d, { strength = 1 } = {}) {
      tone(d, t, { f0: jitter(190), f1: 70, peak: 0.45 * strength, attack: 0.003, decay: 0.16 });
      noiseBurst(d, t, { type: 'highpass', f0: 2500, f1: 1800, q: 0.7, peak: 0.25 * strength, decay: 0.05 });
      chime(d, t + 0.005, jitter(880, 0.12), { peak: 0.1 * strength, decay: 0.45 });
    },
    hitShield(t, d) {
      chime(d, t, jitter(1250, 0.05), { peak: 0.14, decay: 0.35, partials: [1, 1.5, 2.76, 4.1] });
      noiseBurst(d, t, { f0: 4000, f1: 2500, q: 2, peak: 0.18, decay: 0.06 });
    },
    hitBody(t, d, { strength = 1 } = {}) {
      tone(d, t, { f0: jitter(110), f1: 45, peak: 0.6 * strength, attack: 0.002, decay: 0.18 });
      noiseBurst(d, t, { type: 'lowpass', f0: 900, f1: 200, q: 0.8, peak: 0.45 * strength, decay: 0.12 });
    },
    block(t, d) {
      chime(d, t, jitter(620, 0.06), { peak: 0.16, decay: 0.3, partials: [1, 1.83, 2.95, 4.4] });
      noiseBurst(d, t, { f0: 3500, f1: 1200, q: 1.4, peak: 0.35, decay: 0.08 });
    },
    parry(t, d) {
      chime(d, t, jitter(980, 0.04), { peak: 0.22, decay: 0.9, partials: [1, 2.01, 2.99, 4.2, 5.6] });
      noiseBurst(d, t, { type: 'highpass', f0: 5000, f1: 3000, q: 0.7, peak: 0.4, decay: 0.12 });
      tone(d, t, { f0: 160, f1: 60, peak: 0.35, decay: 0.2 });
    },
    push(t, d) {
      // the air folds, then goes
      noiseBurst(d, t, { type: 'bandpass', f0: 300, f1: 2400, q: 0.8, peak: 0.25, attack: 0.08, decay: 0.04 });
      tone(d, t + 0.1, { f0: 150, f1: 34, peak: 0.85, attack: 0.006, decay: 0.42 });
      noiseBurst(d, t + 0.1, { type: 'lowpass', f0: 2600, f1: 160, q: 0.9, peak: 0.7, attack: 0.004, decay: 0.45 });
      tone(d, t + 0.1, { type: 'triangle', f0: 620, f1: 180, peak: 0.08, decay: 0.35 });
    },
    pull(t, d) {
      noiseBurst(d, t, { type: 'bandpass', f0: 180, f1: 2600, q: 1.1, peak: 0.55, attack: 0.22, decay: 0.05 });
      tone(d, t, { f0: 60, f1: 190, peak: 0.4, attack: 0.2, decay: 0.08 });
      noiseBurst(d, t + 0.26, { type: 'highpass', f0: 3000, f1: 2000, q: 0.7, peak: 0.3, decay: 0.05 });
    },
    gripStart(t, d) {
      tone(d, t, { f0: 80, f1: 140, peak: 0.4, attack: 0.05, decay: 0.3 });
      chime(d, t + 0.02, 520, { peak: 0.06, decay: 0.5 });
    },
    throw(t, d) {
      noiseBurst(d, t, { type: 'bandpass', f0: 500, f1: 3200, q: 1, peak: 0.45, attack: 0.05, decay: 0.12 });
      tone(d, t + 0.05, { f0: 130, f1: 38, peak: 0.8, attack: 0.005, decay: 0.38 });
      noiseBurst(d, t + 0.05, { type: 'lowpass', f0: 2200, f1: 150, q: 0.9, peak: 0.55, decay: 0.38 });
    },
    breach(t, d) {
      // space cracking open: a glassy split and a falling ring
      noiseBurst(d, t, { type: 'highpass', f0: 6000, f1: 3500, q: 0.6, peak: 0.45, attack: 0.002, decay: 0.08 });
      for (let i = 0; i < 6; i++) tone(d, t + i * 0.012, { f0: jitter(3200 - i * 300, 0.1), f1: jitter(900), peak: 0.05, decay: 0.25 });
      tone(d, t, { type: 'triangle', f0: 740, f1: 200, peak: 0.14, decay: 0.6 });
      tone(d, t, { f0: 70, f1: 40, peak: 0.4, decay: 0.3 });
    },
    resist(t, d) {
      noiseBurst(d, t, { type: 'lowpass', f0: 3200, f1: 300, q: 0.7, peak: 0.5, decay: 0.35 });
      [392, 494, 587].forEach((f, i) => tone(d, t + i * 0.015, { type: 'triangle', f0: f, f1: f * 1.5, peak: 0.07, attack: 0.01, decay: 0.4 }));
    },
    roll(t, d) {
      noiseBurst(d, t, { type: 'bandpass', f0: 900, f1: 500, q: 0.9, peak: 0.22, attack: 0.04, decay: 0.3 });
      noiseBurst(d, t + 0.3, { type: 'lowpass', f0: 500, f1: 120, q: 0.7, peak: 0.3, decay: 0.08 });
    },
    dash(t, d) {
      noiseBurst(d, t, { type: 'bandpass', f0: 600, f1: 4200, q: 1.3, peak: 0.45, attack: 0.02, decay: 0.16 });
      chime(d, t, 1450, { peak: 0.05, decay: 0.3 });
    },
    knockdown(t, d) {
      tone(d, t, { f0: 95, f1: 38, peak: 0.75, attack: 0.002, decay: 0.25 });
      noiseBurst(d, t, { type: 'lowpass', f0: 700, f1: 120, q: 0.8, peak: 0.55, decay: 0.3 });
    },
    pushSlide(t, d) {
      // a pushed body skidding back along the floor (a recording named pushSlide plays instead where there is one)
      noiseBurst(d, t, { type: 'bandpass', f0: 1500, f1: 320, q: 0.7, peak: 0.32, attack: 0.03, decay: 0.68, rate: 0.6 });
      noiseBurst(d, t, { type: 'lowpass', f0: 420, f1: 90, q: 0.7, peak: 0.28, attack: 0.02, decay: 0.6 });
    },
    collapse(t, d) {
      // the Veil shatters: many small bright pieces, a hollow drop
      noiseBurst(d, t, { type: 'highpass', f0: 4500, f1: 2500, q: 0.6, peak: 0.5, decay: 0.35 });
      for (let i = 0; i < 18; i++) tone(d, t + Math.random() * 0.35, { f0: 1800 + Math.random() * 5200, peak: 0.035, attack: 0.001, decay: 0.08 + Math.random() * 0.2 });
      tone(d, t, { f0: 240, f1: 55, peak: 0.45, decay: 0.7 });
    },
    defeat(t, d) {
      tone(d, t, { f0: 70, f1: 30, peak: 0.6, decay: 1.2 });
      noiseBurst(d, t, { type: 'lowpass', f0: 600, f1: 80, q: 0.7, peak: 0.4, decay: 0.9 });
    },
    victory(t, d) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => chime(d, t + i * 0.11, f, { peak: 0.09, decay: 1.2, partials: [1, 2, 3.01] }));
    },
    loss(t, d) {
      [392, 349.23, 293.66].forEach((f, i) => tone(d, t + i * 0.22, { type: 'triangle', f0: f, f1: f * 0.98, peak: 0.12, attack: 0.02, decay: 0.9 }));
    },
    // ---- story missions
    shot(t, d) {
      // a crystal round leaving a sidearm: a hard crack, a glassy ring, a short thump
      noiseBurst(d, t, { type: 'highpass', f0: jitter(5200), f1: 1800, q: 0.7, peak: 0.55, attack: 0.001, decay: 0.07 });
      tone(d, t, { type: 'square', f0: jitter(1400), f1: 220, peak: 0.14, attack: 0.001, decay: 0.09 });
      tone(d, t, { f0: 150, f1: 50, peak: 0.5, attack: 0.002, decay: 0.12 });
      chime(d, t + 0.01, jitter(2100, 0.1), { peak: 0.05, decay: 0.25 });
    },
    objective(t, d) {
      [659.25, 987.77].forEach((f, i) => chime(d, t + i * 0.13, f, { peak: 0.08, decay: 0.9, partials: [1, 2, 3.01] }));
    },
    comms(t, d) {
      tone(d, t, { type: 'triangle', f0: 1320, peak: 0.05, attack: 0.004, decay: 0.06 });
      tone(d, t + 0.09, { type: 'triangle', f0: 1760, peak: 0.05, attack: 0.004, decay: 0.08 });
      noiseBurst(d, t, { type: 'bandpass', f0: 2400, f1: 2400, q: 3, peak: 0.03, decay: 0.2 });
    },
    interact(t, d) {
      chime(d, t, 880, { peak: 0.07, decay: 0.4 });
      tone(d, t + 0.08, { type: 'triangle', f0: 1174.66, peak: 0.07, decay: 0.3 });
    },
    door(t, d) {
      noiseBurst(d, t, { type: 'lowpass', f0: 500, f1: 180, q: 0.8, peak: 0.5, attack: 0.05, decay: 0.7 });
      tone(d, t, { type: 'sawtooth', f0: 70, f1: 46, peak: 0.12, attack: 0.05, decay: 0.7 });
      tone(d, t + 0.7, { f0: 90, f1: 40, peak: 0.5, attack: 0.002, decay: 0.2 });
    },
    bell(t, d) {
      // a bronze warning bell: one low strike and its long partials
      chime(d, t, jitter(392, 0.03), { peak: 0.22, decay: 2.4, partials: [1, 2.0, 2.4, 3.0, 4.2] });
      tone(d, t, { f0: 196, f1: 190, peak: 0.12, attack: 0.004, decay: 1.6 });
    },
    alarm(t, d) {
      for (let i = 0; i < 3; i++) tone(d, t + i * 0.7, { type: 'sawtooth', f0: 440, f1: 660, peak: 0.06, attack: 0.3, decay: 0.3 });
    },
  };

  return {
    // call from a click or key press: browsers only start sound after the player has done something
    resume() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    get muted() { return settings.muted; },
    get state() { return ctx ? ctx.state : 'off'; }, // off | suspended | running
    get volume() { return settings.volume; },
    setMuted(m) { settings.muted = !!m; writeSettings(settings); if (master) master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume, ctx.currentTime, 0.02); },
    setVolume(v) { settings.volume = Math.max(0, Math.min(1, v)); writeSettings(settings); if (master && !settings.muted) master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.02); },
    /** Play a sound now at a world position ({x,y,z}) or flat (null). */
    play(name, position = null, options = {}) {
      if (!ensure() || ctx.state !== 'running') return;
      const key = name === 'swing' && options.heavy && samples?.swingHeavy ? 'swingHeavy' : name;
      if (samples?.[key]) { playSample(samples[key], position, options); return; }
      if (SOUNDS[name]) SOUNDS[name](ctx.currentTime + 0.005, out(position, options.gain ?? 1), options);
    },
    // Opt-in Conduit cues share the existing context, listener, limiter and mute.
    // Never create or resume a context from a simulation update.
    playConduitCue(name, position, options) {
      if (!ctx || ctx.state !== 'running' || settings.muted) return false;
      conduitBank ??= createConduitAudioBank(ctx, master);
      return conduitBank.play(name, position, options);
    },
    setConduitAmbience(sources) {
      if (!ctx || ctx.state !== 'running' || settings.muted || !Array.isArray(sources)) {
        conduitBank?.setAmbience([]); return;
      }
      if (!sources.length && !conduitBank) return;
      conduitBank ??= createConduitAudioBank(ctx, master);
      conduitBank.setAmbience(sources);
    },
    /** Is there a recording of this name (loaded)? */
    has(name) { return !!samples?.[name]; },
    /**
     * A recorded loop while `key` asks for it (call every frame with where it is; stopLoop when it should end):
     * Rage's breathing and fire.
     */
    loop(key, name, position) {
      if (!ensure() || ctx.state !== 'running' || !samples?.[name]) return;
      const id = 'rec:' + key;
      let loop = loops.get(id);
      if (!loop) {
        const s = samples[name];
        const t = ctx.currentTime;
        const g = out(position, 1);
        const level = ctx.createGain();
        level.gain.setValueAtTime(0.0001, t);
        level.gain.exponentialRampToValueAtTime(Math.max(0.0002, s.gain), t + 0.35);
        const src = ctx.createBufferSource();
        src.buffer = s.buffers[0];
        src.loop = true;
        src.connect(level).connect(g);
        src.start(t, Math.random() * Math.max(0, src.buffer.duration - 0.1));
        loop = {
          set(p) {
            if (!p || !g.panner) return;
            const now = ctx.currentTime;
            g.panner.positionX.setTargetAtTime(p.x, now, 0.03);
            g.panner.positionY.setTargetAtTime(p.y, now, 0.03);
            g.panner.positionZ.setTargetAtTime(p.z, now, 0.03);
          },
          stop() {
            const now = ctx.currentTime;
            level.gain.cancelScheduledValues(now);
            level.gain.setTargetAtTime(0.0001, now, 0.12);
            src.stop(now + 0.6);
          },
        };
        loops.set(id, loop);
      }
      loop.set(position);
    },
    stopLoop(key) { const loop = loops.get('rec:' + key); if (loop) { loop.stop(); loops.delete('rec:' + key); } },
    /** The camera, each frame: where the listener stands and looks. */
    listen(position, forward) {
      if (!ctx || ctx.state !== 'running') return;
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.value = position.x; l.positionY.value = position.y; l.positionZ.value = position.z;
        l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
        l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
      } else {
        l.setPosition(position.x, position.y, position.z);
        l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
      }
    },
    /**
     * A held Telekinesis hum while `key` is held: start it, move it each frame (set), stop it when the grip
     * ends. Its pitch climbs the longer it holds.
     */
    hum(key, position) {
      if (!ensure() || ctx.state !== 'running') return;
      let loop = loops.get(key);
      if (!loop) {
        const t = ctx.currentTime;
        const g = out(position, 1);
        const level = ctx.createGain();
        level.gain.setValueAtTime(0.0001, t);
        level.gain.exponentialRampToValueAtTime(0.22, t + 0.15);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        filter.Q.value = 4;
        const a = ctx.createOscillator();
        const b = ctx.createOscillator();
        const shimmer = ctx.createOscillator();
        a.type = 'sawtooth'; b.type = 'sawtooth'; shimmer.type = 'sine';
        a.frequency.value = 55; b.frequency.value = 55.8; shimmer.frequency.value = 880;
        const shimmerGain = ctx.createGain();
        shimmerGain.gain.value = 0.04;
        const wobble = ctx.createOscillator();
        const wobbleDepth = ctx.createGain();
        wobble.frequency.value = 6;
        wobbleDepth.gain.value = 120;
        wobble.connect(wobbleDepth).connect(filter.frequency);
        a.connect(filter); b.connect(filter); filter.connect(level);
        shimmer.connect(shimmerGain).connect(level);
        level.connect(g);
        [a, b, shimmer, wobble].forEach((o) => o.start(t));
        loop = {
          started: t,
          set(p) {
            const now = ctx.currentTime;
            const k = Math.min(1, (now - t) / 1.4);
            a.frequency.setTargetAtTime(55 + 30 * k, now, 0.05);
            b.frequency.setTargetAtTime(55.8 + 31 * k, now, 0.05);
            filter.Q.value = 4 + 6 * k;
            if (p && g.panner) {
              g.panner.positionX.setTargetAtTime(p.x, now, 0.03);
              g.panner.positionY.setTargetAtTime(p.y, now, 0.03);
              g.panner.positionZ.setTargetAtTime(p.z, now, 0.03);
            }
          },
          stop() {
            const now = ctx.currentTime;
            level.gain.cancelScheduledValues(now);
            level.gain.setTargetAtTime(0.0001, now, 0.05);
            [a, b, shimmer, wobble].forEach((o) => o.stop(now + 0.3));
          },
        };
        loops.set(key, loop);
      }
      loop.set(position);
    },
    stopHum(key) { const loop = loops.get(key); if (loop) { loop.stop(); loops.delete(key); } },
    dispose() {
      conduitBank?.dispose(); conduitBank = null;
      for (const loop of loops.values()) loop.stop();
      loops.clear();
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
