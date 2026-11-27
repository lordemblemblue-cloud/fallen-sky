/**
 * Fantasy Battle puppet core: a layered 2D rig in the Live2D manner. Pure: no DOM, no three.js and no imports, so the
 * game (three.js), the tests and the standalone HTML player (Canvas 2D) run the same code.
 *
 * Spaces
 *   sheet px     the owner's parts sheet; rig pivots are authored there (x right, y down).
 *   image px     one cut layer (parts.json gives each layer's sheet origin).
 *   character    x right, y UP, origin on the ground under the character, 1 unit = 1 sheet px at body scale.
 * Rig data: bones { id, parent, pos (rest joint position in character space), inheritRotation } listed parents first;
 * layers { id, part, bone, pivot (sheet px pinned to `pos`), pos, rot, scale, flipX, z, grid [cols, rows],
 * depth (look parallax), spring { axis: [[sheet px], [sheet px]], stiffness, damping, inertia, gravity, limit } }.
 * Rest rotations are the drawn orientations; poses add rotations (degrees, counter-clockwise), offsets and scales.
 *
 * Per frame: stepLife (breathing, blinking, look, expression) -> composePose (stance blend, skill, breathing, look)
 * -> solveBones -> stepSprings (hair and cloth lag and overshoot) -> deformLayers (spring bend, 2.5D look warp with
 * parallax by depth, smear along velocity) -> layer order by z (skills may move a bone's layers with zIndex).
 */

const DEG = Math.PI / 180;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a, b, t) => a + (b - a) * t;

// ---- 2D affine matrices [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty --------------------------
export function matMul(m, n, out = new Array(6)) {
  const a = m[0] * n[0] + m[2] * n[1];
  const b = m[1] * n[0] + m[3] * n[1];
  const c = m[0] * n[2] + m[2] * n[3];
  const d = m[1] * n[2] + m[3] * n[3];
  const tx = m[0] * n[4] + m[2] * n[5] + m[4];
  const ty = m[1] * n[4] + m[3] * n[5] + m[5];
  out[0] = a; out[1] = b; out[2] = c; out[3] = d; out[4] = tx; out[5] = ty;
  return out;
}
export function matTRS(tx, ty, rotDeg = 0, sx = 1, sy = 1) {
  const c = Math.cos(rotDeg * DEG);
  const s = Math.sin(rotDeg * DEG);
  return [c * sx, s * sx, -s * sy, c * sy, tx, ty];
}
export function matApply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function matAngle(m) {
  return Math.atan2(m[1], m[0]) / DEG;
}

/** Seeded random numbers in [0, 1) (mulberry32). */
export function createRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangle grid over a w x h image: vertices in image px, uvs (0,0 = top left), indices. */
export function makeGrid(w, h, [cols, rows] = [1, 1]) {
  const verts = new Float32Array((cols + 1) * (rows + 1) * 2);
  const uvs = new Float32Array(verts.length);
  const indices = new Uint16Array(cols * rows * 6);
  let i = 0;
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      verts[i] = (c / cols) * w; verts[i + 1] = (r / rows) * h;
      uvs[i] = c / cols; uvs[i + 1] = r / rows;
      i += 2;
    }
  }
  let k = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const p = r * (cols + 1) + c;
      indices[k++] = p; indices[k++] = p + cols + 1; indices[k++] = p + 1;
      indices[k++] = p + 1; indices[k++] = p + cols + 1; indices[k++] = p + cols + 2;
    }
  }
  return { cols, rows, verts, uvs, indices, count: (cols + 1) * (rows + 1) };
}

/** Index a rig's JSON against the cut layers' manifest (parts.json). */
export function buildRig(data, manifest) {
  const bones = [];
  const boneIndex = new Map();
  for (const b of data.bones) {
    const parent = b.parent == null ? -1 : boneIndex.get(b.parent);
    if (parent === undefined) throw new Error(`bone ${b.id}: parent ${b.parent} must be listed first`);
    if (boneIndex.has(b.id)) throw new Error(`bone ${b.id} is listed twice`);
    const pos = b.pos || [0, 0];
    const ppos = parent >= 0 ? bones[parent].pos : [0, 0];
    bones.push({ id: b.id, index: bones.length, parent, pos, local: [pos[0] - ppos[0], pos[1] - ppos[1]], inheritRotation: b.inheritRotation !== false });
    boneIndex.set(b.id, bones.length - 1);
  }
  const layerIndex = new Map();
  const layers = data.layers.map((l, i) => {
    const part = manifest.parts[l.part];
    if (!part) throw new Error(`layer ${l.id}: no part ${l.part} in the manifest`);
    const bi = boneIndex.get(l.bone);
    if (bi === undefined) throw new Error(`layer ${l.id}: no bone ${l.bone}`);
    const bone = bones[bi];
    const sc = Array.isArray(l.scale) ? l.scale : [l.scale ?? 1, l.scale ?? 1];
    const flip = l.flipX ? -1 : 1;
    const pivotPx = [l.pivot[0] - part.origin[0], l.pivot[1] - part.origin[1]];
    const pos = l.pos || bone.pos;
    const m = matMul(matTRS(pos[0] - bone.pos[0], pos[1] - bone.pos[1], l.rot || 0, flip * sc[0], -sc[1]), [1, 0, 0, 1, -pivotPx[0], -pivotPx[1]]);
    const grid = makeGrid(part.size[0], part.size[1], l.grid || [1, 1]);
    const toLocal = (sheet) => matApply(m, sheet[0] - part.origin[0], sheet[1] - part.origin[1]);
    let spring = null;
    if (l.spring) {
      const axis = l.spring.axis || [[part.origin[0] + part.size[0] / 2, part.origin[1]], [part.origin[0] + part.size[0] / 2, part.origin[1] + part.size[1]]];
      const root = toLocal(axis[0]);
      const tip = toLocal(axis[1]);
      const u0 = [axis[0][0] - part.origin[0], axis[0][1] - part.origin[1]];
      const u1 = [axis[1][0] - part.origin[0], axis[1][1] - part.origin[1]];
      const len2 = (u1[0] - u0[0]) ** 2 + (u1[1] - u0[1]) ** 2 || 1;
      spring = {
        root, tip, u0, du: [(u1[0] - u0[0]) / len2, (u1[1] - u0[1]) / len2],
        length: Math.hypot(tip[0] - root[0], tip[1] - root[1]) || 1,
        stiffness: l.spring.stiffness ?? 60, damping: l.spring.damping ?? 7, inertia: l.spring.inertia ?? 1,
        gravity: l.spring.gravity ?? 0, limit: (l.spring.limit ?? 20) * DEG, power: l.spring.power ?? 1.4,
      };
    }
    layerIndex.set(l.id, i);
    return {
      id: l.id, index: i, part: l.part, boneIndex: bi, m, size: part.size, grid, z: l.z ?? i, subZ: l.subZ ?? 0,
      depth: l.depth ?? 0, smear: l.smear ?? 1, opacity: l.opacity ?? 1, role: l.role || null, spring,
      extent: Math.max(part.size[0] * sc[0], part.size[1] * sc[1]),
    };
  });
  const rig = { data, manifest, bones, boneIndex, layers, layerIndex };
  rig.boneOf = (id) => boneIndex.get(id);
  rig.layerOf = (id) => layerIndex.get(id);
  return rig;
}

// ---- pose buffers ----------------------------------------------------------------------------------------------
export function createPose(rig) {
  const n = rig.bones.length;
  return { rot: new Float64Array(n), ox: new Float64Array(n), oy: new Float64Array(n), sx: new Float64Array(n).fill(1), sy: new Float64Array(n).fill(1), z: new Float64Array(n).fill(NaN), smear: new Float64Array(n), params: {} };
}

function resetPose(pose) {
  pose.rot.fill(0); pose.ox.fill(0); pose.oy.fill(0); pose.sx.fill(1); pose.sy.fill(1); pose.z.fill(NaN); pose.smear.fill(0);
  pose.params = {};
}

function addChannels(rig, pose, bonesObj, weight) {
  for (const [id, ch] of Object.entries(bonesObj || {})) {
    const i = rig.boneIndex.get(id);
    if (i === undefined) continue;
    if (ch.rotation != null) pose.rot[i] += ch.rotation * weight;
    if (ch.offset) { pose.ox[i] += ch.offset[0] * weight; pose.oy[i] += ch.offset[1] * weight; }
    if (ch.scale) { pose.sx[i] *= lerp(1, ch.scale[0], weight); pose.sy[i] *= lerp(1, ch.scale[1], weight); }
  }
}

/** Override channels toward a skill's absolute values by its weight. */
function blendChannels(rig, pose, bonesObj, weight) {
  for (const [id, ch] of Object.entries(bonesObj || {})) {
    const i = rig.boneIndex.get(id);
    if (i === undefined) continue;
    if (ch.rotation !== undefined) pose.rot[i] = lerp(pose.rot[i], ch.rotation, weight);
    if (ch.offset !== undefined) { pose.ox[i] = lerp(pose.ox[i], ch.offset[0], weight); pose.oy[i] = lerp(pose.oy[i], ch.offset[1], weight); }
    if (ch.scale !== undefined) { pose.sx[i] = lerp(pose.sx[i], ch.scale[0], weight); pose.sy[i] = lerp(pose.sy[i], ch.scale[1], weight); }
    if (ch.smearStretch !== undefined) pose.smear[i] = Math.max(pose.smear[i], ch.smearStretch * weight);
    if (ch.zIndex !== undefined && weight > 0.02) pose.z[i] = ch.zIndex;
  }
}

// ---- procedural life -------------------------------------------------------------------------------------------
export const EXPRESSIONS = Object.freeze(['neutral', 'focused', 'attackShout', 'hurt']);

export function createLife(rig, seed = 1) {
  const random = createRandom(seed);
  return {
    t: 0, random, breathPhase: random() * Math.PI * 2, breath: 0, combat: 0, combatTarget: 0,
    blink: { next: 1.2 + random() * 2.5, start: -1, value: 0, again: false },
    look: { x: 0, y: 0, tx: 0, ty: 0 },
    expr: { name: 'neutral', prev: null, fade: 1, until: Infinity, base: 'neutral' },
  };
}

const BLINK_CLOSE = 0.055;
const BLINK_HOLD = 0.035;
const BLINK_OPEN = 0.07;
export const BLINK_DURATION = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN;

/** Eyelid closure (0 open .. 1 shut) at time `s` into a blink. */
export function blinkCurve(s) {
  if (s < 0 || s >= BLINK_DURATION) return 0;
  if (s < BLINK_CLOSE) return s / BLINK_CLOSE;
  if (s < BLINK_CLOSE + BLINK_HOLD) return 1;
  return 1 - (s - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
}

export function triggerExpression(life, name, hold = 0) {
  if (!name) return;
  const expr = life.expr;
  if (expr.name !== name) { expr.prev = expr.name; expr.fade = 0; expr.name = name; }
  expr.until = hold > 0 ? life.t + hold : Infinity;
}

export function setLookTarget(life, x, y) {
  life.look.tx = clamp(x, -1, 1);
  life.look.ty = clamp(y, -1, 1);
}

export function stepLife(rig, life, dt) {
  life.t += dt;
  const cfg = rig.data.breathing || {};
  life.combat += (life.combatTarget - life.combat) * (1 - Math.exp(-dt * 3.5));
  const period = lerp(cfg.relaxed?.period ?? 4.2, cfg.combat?.period ?? 2.5, life.combat);
  life.breathPhase += (dt / period) * Math.PI * 2;
  life.breath = Math.sin(life.breathPhase) * lerp(cfg.relaxed?.amplitude ?? 1, cfg.combat?.amplitude ?? 0.6, life.combat);
  // blinking, held off while the face already shows shut or wide eyes
  const b = life.blink;
  const eyesBusy = life.expr.name === 'hurt' || life.expr.name === 'attackShout';
  if (b.start < 0 && life.t >= b.next && !eyesBusy) b.start = life.t;
  if (b.start >= 0) {
    const s = life.t - b.start;
    b.value = blinkCurve(s);
    if (s >= BLINK_DURATION) {
      b.start = -1;
      b.value = 0;
      b.again = !b.again && life.random() < 0.18;
      b.next = life.t + (b.again ? 0.1 : 1.8 + life.random() * 3.6);
    }
  } else b.value = 0;
  if (eyesBusy) b.value = 0;
  // look follows its target, critically damped
  const k = 1 - Math.exp(-dt * 7);
  life.look.x += (life.look.tx - life.look.x) * k;
  life.look.y += (life.look.ty - life.look.y) * k;
  // expression crossfade and timed return to the base expression
  const expr = life.expr;
  expr.base = life.combat > 0.5 ? 'focused' : 'neutral';
  if (life.t >= expr.until) { expr.until = Infinity; if (expr.name !== expr.base) { expr.prev = expr.name; expr.fade = 0; expr.name = expr.base; } }
  else if (expr.until === Infinity && expr.name !== expr.base && (expr.name === 'neutral' || expr.name === 'focused')) { expr.prev = expr.name; expr.fade = 0; expr.name = expr.base; }
  expr.fade = Math.min(1, expr.fade + dt / 0.09);
}

/** Which face drawings show: the current expression, the one fading out, and the blink patch's opacity. */
export function faceState(rig, life) {
  const map = rig.data.expressions || {};
  const expr = life.expr;
  return {
    face: map[expr.name] || map.neutral,
    fadeFrom: expr.fade < 1 && expr.prev ? (map[expr.prev] || null) : null,
    fadeOpacity: expr.fade < 1 ? 1 - expr.fade : 0,
    blink: life.blink.value,
  };
}

// ---- pose composition ------------------------------------------------------------------------------------------
/**
 * Stance (relaxed <-> combat-ready by life.combat), then the skill's pose by its weight, then breathing and look.
 * @param skillEval evaluateSkill() output or null
 */
export function composePose(rig, life, skillEval, pose) {
  resetPose(pose);
  const stances = rig.data.stances || {};
  addChannels(rig, pose, stances.relaxed, 1 - life.combat);
  addChannels(rig, pose, stances.combat, life.combat);
  if (skillEval && skillEval.weight > 0) {
    blendChannels(rig, pose, skillEval.bones, skillEval.weight);
    for (const [name, v] of Object.entries(skillEval.params || {})) pose.params[name] = v * skillEval.weight;
  }
  const breath = rig.data.breathing?.bones || {};
  for (const [id, ch] of Object.entries(breath)) {
    const i = rig.boneIndex.get(id);
    if (i === undefined) continue;
    const b = life.breath;
    if (ch.offset) { pose.ox[i] += ch.offset[0] * b; pose.oy[i] += ch.offset[1] * b; }
    if (ch.scale) { pose.sx[i] *= 1 + ch.scale[0] * b; pose.sy[i] *= 1 + ch.scale[1] * b; }
    if (ch.rotation) pose.rot[i] += ch.rotation * b;
  }
  const look = rig.data.look || {};
  for (const [id, ch] of Object.entries(look.bones || {})) {
    const i = rig.boneIndex.get(id);
    if (i === undefined) continue;
    pose.rot[i] += (ch.rotation?.[0] ?? 0) * life.look.x + (ch.rotation?.[1] ?? 0) * life.look.y;
    pose.ox[i] += (ch.offset?.[0] ?? 0) * life.look.x;
    pose.oy[i] += (ch.offset?.[1] ?? 0) * life.look.y;
  }
  return pose;
}

// ---- bones -----------------------------------------------------------------------------------------------------
export function createPuppetState(rig, { seed = 1 } = {}) {
  const n = rig.bones.length;
  return {
    rig,
    life: createLife(rig, seed),
    pose: createPose(rig),
    frame: new Float64Array(n * 6), // bone frames without the bone's own scale (children build on these)
    world: new Float64Array(n * 6), // bone frames with the bone's own scale (layers use these)
    prevPos: null,
    vel: new Float64Array(n * 2),
    smearDir: new Float64Array(n * 2).fill(0),
    springs: rig.layers.map((l) => (l.spring ? { angle: 0, vel: 0, prevAnchor: null, prevVel: [0, 0], prevAngle: null, prevAngVel: 0 } : null)),
    positions: rig.layers.map((l) => new Float32Array(l.grid.count * 2)),
    order: rig.layers.map((_, i) => i),
    layerZ: new Float64Array(rig.layers.length),
    params: {},
    settings: { parallax: 1, stiffness: 1, smear: 1 },
  };
}

export function solveBones(rig, state) {
  const { pose, frame, world } = state;
  const tmp = new Array(6);
  for (const bone of rig.bones) {
    const i = bone.index;
    const o = i * 6;
    let m;
    if (bone.parent < 0) {
      m = matTRS(bone.local[0] + pose.ox[i], bone.local[1] + pose.oy[i], pose.rot[i]);
    } else {
      const p = bone.parent * 6;
      const pf = [frame[p], frame[p + 1], frame[p + 2], frame[p + 3], frame[p + 4], frame[p + 5]];
      const psx = pose.sx[bone.parent]; const psy = pose.sy[bone.parent];
      const tx = (bone.local[0] + pose.ox[i]) * psx;
      const ty = (bone.local[1] + pose.oy[i]) * psy;
      const rot = bone.inheritRotation ? pose.rot[i] : pose.rot[i] - matAngle(pf);
      m = matMul(pf, matTRS(tx, ty, rot), tmp).slice();
    }
    for (let k = 0; k < 6; k += 1) frame[o + k] = m[k];
    const w = matMul(m, [pose.sx[i], 0, 0, pose.sy[i], 0, 0], tmp);
    for (let k = 0; k < 6; k += 1) world[o + k] = w[k];
  }
}

const boneMat = (arr, i) => [arr[i * 6], arr[i * 6 + 1], arr[i * 6 + 2], arr[i * 6 + 3], arr[i * 6 + 4], arr[i * 6 + 5]];

/** Character-space matrix that maps a layer's image px. */
export function layerMatrix(rig, state, li) {
  const l = rig.layers[li];
  return matMul(boneMat(state.world, l.boneIndex), l.m);
}

/** A point given in sheet px on a layer, in character space (before mesh warps). */
export function layerPoint(rig, state, layerId, sheetPx) {
  const li = rig.layerIndex.get(layerId);
  const l = rig.layers[li];
  const part = rig.manifest.parts[l.part];
  return matApply(layerMatrix(rig, state, li), sheetPx[0] - part.origin[0], sheetPx[1] - part.origin[1]);
}

export function bonePosition(state, bi) {
  return [state.frame[bi * 6 + 4], state.frame[bi * 6 + 5]];
}

/** Named socket from rig.data.sockets: { layer, px } (sheet px on a layer) or { bone, pos } (character rest offset). */
export function socketPosition(rig, state, name) {
  const s = rig.data.sockets?.[name];
  if (!s) return null;
  if (s.layer) return layerPoint(rig, state, s.layer, s.px);
  const bi = rig.boneIndex.get(s.bone);
  const bone = rig.bones[bi];
  const rel = s.pos ? [s.pos[0] - bone.pos[0], s.pos[1] - bone.pos[1]] : [0, 0];
  return matApply(boneMat(state.frame, bi), rel[0], rel[1]);
}

// ---- springs ---------------------------------------------------------------------------------------------------
/**
 * Hair and cloth: each spring layer bends around its root by an angle driven by its anchor's acceleration and its
 * bone's angular acceleration (inertia), pulled back by stiffness, slowed by damping, and toward hanging straight down
 * by gravity. Fixed sub-steps keep it stable at any frame rate.
 */
export function stepSprings(rig, state, dt) {
  if (dt <= 0) return;
  const stiffScale = state.settings.stiffness ?? 1;
  const motionAmount = state.settings.secondaryMotion ?? 1;
  for (const l of rig.layers) {
    const sp = l.spring;
    if (!sp) continue;
    const st = state.springs[l.index];
    if(motionAmount<=0){st.angle=0;st.vel=0;st.prevAnchor=null;st.prevVel=[0,0];st.prevAngle=null;st.prevAngVel=0;continue;}
    const w = boneMat(state.world, l.boneIndex);
    const anchor = matApply(w, sp.root[0], sp.root[1]);
    const tipW = matApply(w, sp.tip[0], sp.tip[1]);
    const dir = [(tipW[0] - anchor[0]) / sp.length, (tipW[1] - anchor[1]) / sp.length];
    const boneAngle = matAngle(w) * DEG;
    let acc = [0, 0];
    let angAcc = 0;
    if (st.prevAnchor) {
      const v = [(anchor[0] - st.prevAnchor[0]) / dt, (anchor[1] - st.prevAnchor[1]) / dt];
      acc = [(v[0] - st.prevVel[0]) / dt, (v[1] - st.prevVel[1]) / dt];
      st.prevVel = v;
      let dA = boneAngle - st.prevAngle;
      if (dA > Math.PI) dA -= Math.PI * 2; else if (dA < -Math.PI) dA += Math.PI * 2;
      const angVel = dA / dt;
      angAcc = (angVel - st.prevAngVel) / dt;
      st.prevAngVel = angVel;
    }
    st.prevAnchor = anchor;
    st.prevAngle = boneAngle;
    // keep one-frame spikes (teleports, the first frame of a skill) from flinging the strand
    acc[0]=(acc[0]+(state.externalMotion?.ax||0))*motionAmount;
    acc[1]=(acc[1]+(state.externalMotion?.ay||0))*motionAmount;
    const accLen = Math.hypot(acc[0], acc[1]);
    const maxAcc = 60000;
    if (accLen > maxAcc) { acc[0] *= maxAcc / accLen; acc[1] *= maxAcc / accLen; }
    angAcc = clamp(angAcc*motionAmount, -900, 900);
    const k = sp.stiffness * stiffScale;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      const c = Math.cos(st.angle); const sn = Math.sin(st.angle);
      const d = [dir[0] * c - dir[1] * sn, dir[0] * sn + dir[1] * c];
      // the tip lags behind the anchor's acceleration: torque from a pseudo force -acc on the strand
      const inertial = -1.5 * sp.inertia * (d[0] * acc[1] - d[1] * acc[0]) / sp.length;
      // gravity pulls the strand toward straight down (0, -1)
      const grav = sp.gravity * (3675 / sp.length) * -d[0];
      const a = -k * st.angle - sp.damping * st.vel + inertial * 0.5 - sp.inertia * angAcc * 0.35 + grav;
      st.vel += a * h;
      st.angle += st.vel * h;
      if (st.angle > sp.limit) { st.angle = sp.limit; st.vel *= -0.3; }
      if (st.angle < -sp.limit) { st.angle = -sp.limit; st.vel *= -0.3; }
    }
  }
}

// ---- smear -----------------------------------------------------------------------------------------------------
function updateVelocities(rig, state, dt) {
  const n = rig.bones.length;
  if (!state.prevPos || dt <= 0) {
    state.prevPos = new Float64Array(n * 2);
    for (let i = 0; i < n; i += 1) { state.prevPos[i * 2] = state.frame[i * 6 + 4]; state.prevPos[i * 2 + 1] = state.frame[i * 6 + 5]; }
    return;
  }
  for (let i = 0; i < n; i += 1) {
    const x = state.frame[i * 6 + 4]; const y = state.frame[i * 6 + 5];
    const vx = (x - state.prevPos[i * 2]) / dt; const vy = (y - state.prevPos[i * 2 + 1]) / dt;
    state.vel[i * 2] = lerp(state.vel[i * 2], vx, 0.6);
    state.vel[i * 2 + 1] = lerp(state.vel[i * 2 + 1], vy, 0.6);
    const sp = Math.hypot(state.vel[i * 2], state.vel[i * 2 + 1]);
    if (sp > 40) { state.smearDir[i * 2] = state.vel[i * 2] / sp; state.smearDir[i * 2 + 1] = state.vel[i * 2 + 1] / sp; }
    state.prevPos[i * 2] = x; state.prevPos[i * 2 + 1] = y;
  }
}

// ---- mesh deformation ------------------------------------------------------------------------------------------
const LOOK_SHIFT = [10, 6];
const SMEAR_GAIN = 0.012;
const SMEAR_FREE = 260; // units/s of motion that never smear

export function deformLayers(rig, state) {
  const { life, pose } = state;
  const parallax = state.settings.parallax ?? 1;
  const smearScale = state.settings.smear ?? 1;
  const lookShift = rig.data.look?.warp || LOOK_SHIFT;
  for (const l of rig.layers) {
    const out = state.positions[l.index];
    const w = boneMat(state.world, l.boneIndex);
    const m = matMul(w, l.m);
    const sp = l.spring;
    const ang = sp ? state.springs[l.index].angle : 0;
    const depth = l.depth * parallax;
    const lx = life.look.x * depth * lookShift[0];
    const ly = life.look.y * depth * lookShift[1];
    // layer centre and half size in character space, for the rounded (bulging) look warp
    const cxy = matApply(m, l.size[0] / 2, l.size[1] / 2);
    const hx = Math.max(1, Math.hypot(m[0], m[1]) * l.size[0] / 2);
    const hy = Math.max(1, Math.hypot(m[2], m[3]) * l.size[1] / 2);
    // smear: the trailing side stretches back along the bone's motion
    const bi = l.boneIndex;
    const speed = Math.hypot(state.vel[bi * 2], state.vel[bi * 2 + 1]);
    let smear = (Math.max(0, speed - SMEAR_FREE) * SMEAR_GAIN + pose.smear[bi] * 0.5 * l.extent) * l.smear * smearScale;
    smear = Math.min(smear, l.extent * 0.6);
    const dx = state.smearDir[bi * 2]; const dy = state.smearDir[bi * 2 + 1];
    const origin = [state.frame[bi * 6 + 4], state.frame[bi * 6 + 5]];
    const verts = l.grid.verts;
    for (let v = 0; v < l.grid.count; v += 1) {
      const u = verts[v * 2]; const vv = verts[v * 2 + 1];
      let x = l.m[0] * u + l.m[2] * vv + l.m[4];
      let y = l.m[1] * u + l.m[3] * vv + l.m[5];
      if (sp && ang !== 0) {
        const t = clamp((u - sp.u0[0]) * sp.du[0] + (vv - sp.u0[1]) * sp.du[1], 0, 1);
        const a = ang * t ** sp.power;
        const c = Math.cos(a); const s = Math.sin(a);
        const rx = x - sp.root[0]; const ry = y - sp.root[1];
        x = sp.root[0] + rx * c - ry * s;
        y = sp.root[1] + rx * s + ry * c;
      }
      let X = w[0] * x + w[2] * y + w[4];
      let Y = w[1] * x + w[3] * y + w[5];
      if (depth !== 0) {
        const nx = (X - cxy[0]) / hx; const ny = (Y - cxy[1]) / hy;
        const bulge = 1 - 0.55 * Math.min(1, nx * nx + ny * ny);
        X += lx * bulge;
        Y += ly * bulge;
      }
      if (smear > 0.01) {
        const along = (X - origin[0]) * dx + (Y - origin[1]) * dy;
        const trail = clamp(-along / Math.max(1, l.extent * 0.5), 0, 1);
        X -= dx * smear * trail;
        Y -= dy * smear * trail;
      }
      out[v * 2] = X;
      out[v * 2 + 1] = Y;
    }
  }
  // draw order: skill zIndex moves a bone's layers; ties keep the authored order
  for (const l of rig.layers) {
    const zo = pose.z[l.boneIndex];
    state.layerZ[l.index] = Number.isNaN(zo) ? l.z : zo + l.subZ;
  }
  state.order.sort((a, b) => state.layerZ[a] - state.layerZ[b] || a - b);
}

/**
 * One frame: life, pose, bones, springs, smear and mesh warps. `skillEval` is SkillPlayer.evaluate() (or null).
 * Afterwards: state.positions[layer] (character space xy per grid vertex), state.order (back to front),
 * state.params (skill params such as draw / nocked) and faceState(rig, state.life).
 */
export function stepPuppet(rig, state, dt, skillEval = null) {
  stepLife(rig, state.life, dt);
  composePose(rig, state.life, skillEval, state.pose);
  if (skillEval?.expression && skillEval.weight > 0.5 && state.life.expr.name !== skillEval.expression) {
    triggerExpression(state.life, skillEval.expression, 0.35);
  }
  state.params = state.pose.params;
  solveBones(rig, state);
  updateVelocities(rig, state, dt);
  stepSprings(rig, state, dt);
  deformLayers(rig, state);
  return state;
}
