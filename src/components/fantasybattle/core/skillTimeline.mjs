/**
 * Fantasy Battle skills as data. Pure: no DOM, no three.js, no imports (the standalone HTML player inlines it).
 *
 * A skill is JSON:
 *   { id, name, totalDuration, blendOutTime, cancelWindowStart, [blendInTime], [hotkey],
 *     keyframes: [{ time, phase, easing, bones: { boneId: { rotation, offset:[x,y], scale:[x,y], smearStretch, zIndex } },
 *                   params: { name: number }, expression }],
 *     events: [{ time, type, ... }] }
 *
 * - `phase` (anticipation | active | hitStop | recovery) holds from its keyframe until the next keyframe with a phase.
 * - `easing` is the curve used to arrive at that keyframe from the bone's previous key. zIndex never interpolates.
 * - Bone values are absolute (relative to the rig's rest pose) and blend over the stance by the skill's weight, which
 *   ramps in over `blendInTime` and out over the last `blendOutTime` seconds.
 * - Events fire once, on the first update whose time span contains their time (t0 < time <= t1; time 0 at start).
 *   Types: onHitFrame (the arrow's hitbox goes live, for `activeFor` seconds), playSFX (sfxId), screenShake
 *   (intensity, duration), spawnArrow (arrow + trail), spawnEffect (effect), hitStop (duration), expression (name).
 * - `hold: true` keeps the last pose once the skill ends (victory, defeat) until the player is stopped.
 * - From `cancelWindowStart` the skill may be cancelled into another; a request made earlier waits in a short input
 *   buffer and starts when the window opens (or is dropped when it goes stale).
 */

export const SKILL_PHASES = Object.freeze(['anticipation', 'active', 'hitStop', 'recovery']);
export const SKILL_EVENT_TYPES = Object.freeze(['onHitFrame', 'playSFX', 'screenShake', 'spawnArrow', 'spawnEffect', 'hitStop', 'expression']);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (x) => x * x * (3 - 2 * x);

export const EASINGS = Object.freeze({
  linear: (u) => u,
  step: (u) => (u < 1 ? 0 : 1),
  easeInQuad: (u) => u * u,
  easeOutQuad: (u) => 1 - (1 - u) * (1 - u),
  easeInOutQuad: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  easeInCubic: (u) => u * u * u,
  easeOutCubic: (u) => 1 - (1 - u) ** 3,
  easeInOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - 4 * (1 - u) ** 3),
  easeOutBack: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
  easeInBack: (u) => 2.70158 * u * u * u - 1.70158 * u * u,
  easeOutExpo: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
});

export function ease(name, u) {
  return (EASINGS[name] || EASINGS.linear)(clamp01(u));
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPair = (v) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** @returns {{ok:boolean, errors:string[]}} */
export function validateSkill(skill) {
  const errors = [];
  if (!skill || typeof skill !== 'object') return { ok: false, errors: ['not an object'] };
  if (typeof skill.id !== 'string' || !skill.id) errors.push('id must be a non-empty string');
  if (typeof skill.name !== 'string') errors.push('name must be a string');
  for (const key of ['totalDuration', 'blendOutTime', 'cancelWindowStart']) {
    if (!isNum(skill[key]) || skill[key] < 0) errors.push(`${key} must be a number >= 0`);
  }
  if (isNum(skill.totalDuration) && skill.totalDuration <= 0) errors.push('totalDuration must be > 0');
  if (isNum(skill.blendOutTime) && isNum(skill.totalDuration) && skill.blendOutTime > skill.totalDuration) errors.push('blendOutTime exceeds totalDuration');
  if (isNum(skill.cancelWindowStart) && isNum(skill.totalDuration) && skill.cancelWindowStart > skill.totalDuration) errors.push('cancelWindowStart exceeds totalDuration');
  if (!Array.isArray(skill.keyframes) || skill.keyframes.length === 0) errors.push('keyframes must be a non-empty array');
  (skill.keyframes || []).forEach((k, i) => {
    const at = `keyframes[${i}]`;
    if (!isNum(k?.time) || k.time < 0 || (isNum(skill.totalDuration) && k.time > skill.totalDuration)) errors.push(`${at}.time out of range`);
    if (k?.phase != null && !SKILL_PHASES.includes(k.phase)) errors.push(`${at}.phase "${k.phase}" is not one of ${SKILL_PHASES.join(', ')}`);
    if (k?.easing != null && !EASINGS[k.easing]) errors.push(`${at}.easing "${k.easing}" is unknown`);
    for (const [bone, ch] of Object.entries(k?.bones || {})) {
      if (ch.rotation != null && !isNum(ch.rotation)) errors.push(`${at}.bones.${bone}.rotation must be a number`);
      if (ch.offset != null && !isPair(ch.offset)) errors.push(`${at}.bones.${bone}.offset must be [x, y]`);
      if (ch.scale != null && !isPair(ch.scale)) errors.push(`${at}.bones.${bone}.scale must be [x, y]`);
      if (ch.smearStretch != null && (!isNum(ch.smearStretch) || ch.smearStretch < 0)) errors.push(`${at}.bones.${bone}.smearStretch must be >= 0`);
      if (ch.zIndex != null && !Number.isInteger(ch.zIndex)) errors.push(`${at}.bones.${bone}.zIndex must be an integer`);
    }
    for (const [name, v] of Object.entries(k?.params || {})) if (!isNum(v)) errors.push(`${at}.params.${name} must be a number`);
  });
  if (skill.keyframes?.length && !skill.keyframes.some((k) => k?.phase)) errors.push('no keyframe sets a phase');
  (skill.events || []).forEach((e, i) => {
    const at = `events[${i}]`;
    if (!isNum(e?.time) || e.time < 0 || (isNum(skill.totalDuration) && e.time > skill.totalDuration)) errors.push(`${at}.time out of range`);
    if (!SKILL_EVENT_TYPES.includes(e?.type)) errors.push(`${at}.type "${e?.type}" is unknown`);
    if (e?.type === 'playSFX' && typeof e.sfxId !== 'string') errors.push(`${at}.sfxId must be a string`);
    if (e?.type === 'spawnArrow' && (typeof e.arrow !== 'object' || !e.arrow)) errors.push(`${at}.arrow must be an object`);
  });
  return { ok: errors.length === 0, errors };
}

/** Validate and index a skill for fast sampling. Throws on an invalid skill. */
export function compileSkill(skill) {
  const { ok, errors } = validateSkill(skill);
  if (!ok) throw new Error(`skill ${skill?.id ?? '?'}: ${errors.join('; ')}`);
  const keys = skill.keyframes.map((k, i) => ({ ...k, order: i })).sort((a, b) => a.time - b.time || a.order - b.order);
  const bones = {};
  const params = {};
  const phases = [];
  const expressions = [];
  const push = (list, t, v, e) => list.push({ t, v, e });
  for (const k of keys) {
    const e = k.easing || 'linear';
    if (k.phase) phases.push({ t: k.time, phase: k.phase });
    if (k.expression) expressions.push({ t: k.time, name: k.expression });
    for (const [boneId, ch] of Object.entries(k.bones || {})) {
      const tr = bones[boneId] || (bones[boneId] = { rotation: [], offsetX: [], offsetY: [], scaleX: [], scaleY: [], smearStretch: [], zIndex: [] });
      if (ch.rotation != null) push(tr.rotation, k.time, ch.rotation, e);
      if (ch.offset) { push(tr.offsetX, k.time, ch.offset[0], e); push(tr.offsetY, k.time, ch.offset[1], e); }
      if (ch.scale) { push(tr.scaleX, k.time, ch.scale[0], e); push(tr.scaleY, k.time, ch.scale[1], e); }
      if (ch.smearStretch != null) push(tr.smearStretch, k.time, ch.smearStretch, e);
      if (ch.zIndex != null) push(tr.zIndex, k.time, ch.zIndex, 'step');
    }
    for (const [name, v] of Object.entries(k.params || {})) push(params[name] || (params[name] = []), k.time, v, e);
  }
  const events = (skill.events || []).map((ev, i) => ({ ...ev, order: i })).sort((a, b) => a.time - b.time || a.order - b.order);
  return {
    id: skill.id,
    name: skill.name,
    hotkey: skill.hotkey ?? null,
    hold: skill.hold === true,
    source: skill,
    totalDuration: skill.totalDuration,
    blendInTime: isNum(skill.blendInTime) ? skill.blendInTime : 0.06,
    blendOutTime: skill.blendOutTime,
    cancelWindowStart: skill.cancelWindowStart,
    bones,
    params,
    phases,
    expressions,
    events,
  };
}

/** Value of a keyed channel at time t (holds the first/last key outside the keyed span). */
export function sampleTrack(keys, t) {
  if (!keys || keys.length === 0) return undefined;
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i];
    if (t < b.t) {
      const a = keys[i - 1];
      if (b.e === 'step' || b.t === a.t) return a.v;
      return a.v + (b.v - a.v) * ease(b.e, (t - a.t) / (b.t - a.t));
    }
  }
  return keys[keys.length - 1].v;
}

export function phaseAt(compiled, t) {
  const list = compiled.phases;
  if (!list.length) return null;
  let phase = list[0].phase;
  for (const p of list) { if (p.t <= t) phase = p.phase; else break; }
  return phase;
}

/** Blend weight of the skill over the stance at time t: ramps in, holds 1, ramps out, 0 once finished. */
export function skillWeight(compiled, t) {
  if (t >= compiled.totalDuration) return compiled.hold ? 1 : 0;
  const inW = compiled.blendInTime > 0 ? clamp01(t / compiled.blendInTime) : 1;
  const outStart = compiled.totalDuration - compiled.blendOutTime;
  const outW = compiled.blendOutTime > 0 && t > outStart ? 1 - clamp01((t - outStart) / compiled.blendOutTime) : 1;
  return smoothstep(inW) * smoothstep(outW);
}

/** The pose a skill asks for at time t. Channels a bone never keys are left undefined. */
export function evaluateSkill(compiled, t) {
  const bones = {};
  for (const [boneId, tr] of Object.entries(compiled.bones)) {
    const ox = sampleTrack(tr.offsetX, t);
    const sx = sampleTrack(tr.scaleX, t);
    bones[boneId] = {
      rotation: sampleTrack(tr.rotation, t),
      offset: ox === undefined ? undefined : [ox, sampleTrack(tr.offsetY, t)],
      scale: sx === undefined ? undefined : [sx, sampleTrack(tr.scaleY, t)],
      smearStretch: sampleTrack(tr.smearStretch, t),
      zIndex: sampleTrack(tr.zIndex, t),
    };
  }
  const params = {};
  for (const [name, keys] of Object.entries(compiled.params)) params[name] = sampleTrack(keys, t);
  let expression = null;
  for (const x of compiled.expressions) { if (x.t <= t) expression = x.name; else break; }
  return { id: compiled.id, t, phase: phaseAt(compiled, t), weight: skillWeight(compiled, t), bones, params, expression };
}

/** Events with t0 < time <= t1. Pass t0 < 0 on the first step so events at time 0 fire. */
export function eventsBetween(compiled, t0, t1) {
  const out = [];
  for (const e of compiled.events) {
    if (e.time > t1) break;
    if (e.time > t0) out.push(e);
  }
  return out;
}

export function canCancelAt(compiled, t) {
  return t >= compiled.cancelWindowStart;
}

/**
 * Plays one skill at a time for one character, with cancel windows and a short input buffer.
 * update(dt) returns the events that fired, each with `run` (the play request: id, onHit, options).
 */
export class SkillPlayer {
  constructor(skills = [], { bufferTime = 0.25 } = {}) {
    this.library = new Map();
    this.bufferTime = bufferTime;
    this.current = null;
    this.buffered = null;
    for (const s of skills) this.load(s);
  }

  /** Add or replace a skill from its JSON. Returns the compiled skill. */
  load(skillJson) {
    const compiled = compileSkill(skillJson);
    this.library.set(compiled.id, compiled);
    return compiled;
  }

  has(id) { return this.library.has(id); }

  get busy() { return this.current !== null; }

  canCancel() { return !this.current || canCancelAt(this.current.compiled, this.current.t); }

  /** Start now if idle or inside the cancel window; otherwise buffer. Returns 'started' | 'buffered'. */
  play(id, onHit = null, options = {}) {
    const compiled = this.library.get(id);
    if (!compiled) throw new Error(`unknown skill ${id}`);
    const run = { id, compiled, onHit, options, t: 0, lastT: -1e-9, cancelled: false };
    if (this.canCancel()) {
      if (this.current) this.current.cancelled = true;
      this.current = run;
      this.buffered = null;
      return 'started';
    }
    this.buffered = { run, age: 0 };
    return 'buffered';
  }

  stop() {
    if (this.current) this.current.cancelled = true;
    this.current = null;
    this.buffered = null;
  }

  /** Advance by dt seconds. @returns {{events:object[], finished:object[], started:object[]}} */
  update(dt) {
    const events = [];
    const finished = [];
    const started = [];
    const advance = (run, step) => {
      run.t += step;
      for (const e of eventsBetween(run.compiled, run.lastT, Math.min(run.t, run.compiled.totalDuration))) events.push({ ...e, run });
      run.lastT = run.t;
      if (run.compiled.hold && run.t >= run.compiled.totalDuration) {
        run.t = run.compiled.totalDuration - 1e-6;
        if (!run.held) { run.held = true; finished.push(run); }
      } else if (run.t >= run.compiled.totalDuration) {
        finished.push(run);
        if (this.current === run) this.current = null;
      }
    };
    if (this.current) advance(this.current, dt);
    if (this.buffered) {
      this.buffered.age += dt;
      if (this.buffered.age > this.bufferTime) this.buffered = null;
      else if (this.canCancel()) {
        const { run } = this.buffered;
        if (this.current) this.current.cancelled = true;
        this.current = run;
        this.buffered = null;
        started.push(run);
        advance(run, 0);
      }
    }
    return { events, finished, started };
  }

  /** The current skill's pose, or null when idle. */
  evaluate() {
    return this.current ? evaluateSkill(this.current.compiled, this.current.t) : null;
  }
}
