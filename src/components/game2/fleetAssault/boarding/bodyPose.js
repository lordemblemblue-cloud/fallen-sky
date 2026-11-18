// Fleet Assault body state: how a fighter looks, packed into the integer pose that rules.mjs POSE_FIELDS checks (the
// match server relays it to the other bodies in the same ship), and how another page's puppet takes it on. The fields
// and their use are the online arena's (engine/netgame.js snap() / updatePuppet()): yaw, the legs and torso animation
// layers with their phase, saber move / stance / hilt, status, the Force power held and on whom, timed powers. No
// position: the relay carries the one the server's speed check accepted. No health: the server's snapshot has it.
import { POSE_FIELDS, POSE_FLAGS, POSE_HILTS, POSE_THROWN } from '../../../../../server/game2/fleet/rules.mjs';
import { wrapPi } from '../../engine/math.js';

// the same lists, in the same order, as engine/netgame.js
export const STATUS = ['normal', 'dead', 'flung', 'down', 'getup', 'gripped', 'shocked', 'roll', 'whole', 'levitated', 'executed', 'executing', 'clash', 'open'];
export const HILT = POSE_HILTS;
export const TIMED = ['speed', 'rage', 'protect', 'absorb', 'see'];
export const HOLD = ['', 'grip', 'lightning', 'heal', 'drain'];
export const KITS = ['single', 'dual', 'staff'];
const SPEC = [...POSE_FIELDS, ...POSE_THROWN];
export const PF = Object.freeze(Object.fromEntries(SPEC.map(([k], i) => [k, i]))); // field name -> index
export const FLAG = POSE_FLAGS;
const k3 = v => v * 1000;
const fit = (v, i) => { const [, lo, hi] = SPEC[i]; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : Math.max(lo, Math.min(hi, 0)); };

// f's pose. animIdx: animation name -> index in the rig (the same build on every page); eidOf: fighter -> body eid (0
// for a fighter that has no body on the server)
export function encodePose(g, f, animIdx, eidOf) {
  const a = f.actor, S = f.saber, F = g.forceOf(f), T = f.thrown;
  const layer = L => {
    if (!L.cur) return [-1, 0, 1000, 0];
    const t = Math.max(0, (a.now - L.cur.t0) * L.cur.speed);
    return [animIdx[L.name] ?? -1, k3(L.cur.loop ? t % 600 : t), k3(L.cur.speed), L.cur.loop ? 1 : 0];
  };
  let timed = 0;
  if (F) TIMED.forEach((id, i) => { if (F.active[id]) timed |= 1 << i; });
  const flags = (S.holstered ? FLAG.holstered : 0) | (f.blade.lit ? FLAG.lit : 0) | (f.ducked ? FLAG.ducked : 0) | (f.onGround ? FLAG.onGround : 0) | (a.matchPelvis ? FLAG.matchPelvis : 0);
  const s = [
    k3(wrapPi(f.yaw)), k3(wrapPi(a.yaw)), k3(a.spineYaw || 0), k3(a.spinePitch || 0), k3(f.isPlayer ? f.cmd.aimPitch || 0 : f.aimPitch || 0), k3(a.legYaw || 0),
    Math.max(0, STATUS.indexOf(f.status)), flags,
    ...layer(a.legs), ...(a.torsoFollow || !a.torso.cur ? [-1, 0, 1000, 0] : layer(a.torso)),
    S.move, S.level, Math.max(0, HILT.indexOf(f.hilt)), Math.max(0, KITS.indexOf(f.saberKit || 'single')),
    F ? Math.max(0, HOLD.indexOf(F.holding || '')) : 0, F && F.holding && F.target?.ref ? eidOf(F.target.ref) || 0 : 0, timed, F ? F.gripBase || 0 : 0,
  ];
  if (T && f.hilt === 'thrown') s.push(T.pos[0] * 100, T.pos[1] * 100, T.pos[2] * 100, k3(wrapPi(T.ang)));
  return s.map(fit);
}

// as NetGame.applyLayer: start the layer's animation at the owner's phase, or re-sync a one-shot that drifted
function applyLayer(a, L, name, phase, speed, loop, isTorso) {
  if (!name) return;
  if (L.name !== name || !L.cur) { L.play(a.skel, name, a.now, { blend: 0.1, restart: true, startAt: phase / (speed || 1), speed, loop: !!loop }); if (isTorso) a.torsoFollow = false; return; }
  const cur = (a.now - L.cur.t0) * L.cur.speed; L.cur.speed = speed;
  if (!loop && Math.abs(cur - phase) > 0.12) L.cur.t0 = a.now - phase / (speed || 1);
}

// another player's puppet takes on their pose (as NetGame.updatePuppet, the position aside). age: seconds since the
// owner sent it (the animation phases run on by that much); byEid: body eid -> fighter on this page; jedi: the body's
// level has the lightsaber and the Force (a trooper's puppet keeps its blaster: saber and Force fields are ignored)
export function applyPose(g, f, s, { age = 0, dt, animNames, byEid, jedi = true }) {
  const status = STATUS[s[PF.status]] || 'normal';
  if (status !== 'dead') f.status = status; // a defeat is the server's 'down' event (the death animation still plays from the layers)
  const fl = s[PF.flags];
  f.ducked = !!(fl & FLAG.ducked); f.onGround = !!(fl & FLAG.onGround); f.netPitch = s[PF.pitch] / 1000;
  f.yaw = f.yaw + wrapPi(s[PF.yaw] / 1000 - f.yaw) * Math.min(1, dt * 25); f.targetYaw = f.yaw;
  const S = f.saber, prevMove = S.move;
  if (jedi) {
    S.move = s[PF.move]; S.level = s[PF.level]; S.holstered = !!(fl & FLAG.holstered); S.weaponTime = S.isActiveSwing() ? 1 : 0; S.moveStart = prevMove === S.move ? S.moveStart : g.t;
    if (S.move !== prevMove && S.inAttack(S.move)) g.onSwing(f, S.move);
    const lit = !!(fl & FLAG.lit) && f.status !== 'dead';
    if (lit !== f.blade.lit) { f.blade.set(lit); g.sfxAt(lit ? 'saberon' : 'saberoff', f.pos, 0.6); if (lit) g.humStart(f); else g.humStop(f); }
    const kit = KITS[s[PF.kit]] || 'single'; if ((f.saberKit || 'single') !== kit) f.setSaberKit(kit);
    f.hilt = HILT[s[PF.hilt]] || 'hand';
    if (s.length > PF.tx && f.hilt === 'thrown') {
      const p = [s[PF.tx] / 100, s[PF.ty] / 100, s[PF.tz] / 100], ang = s[PF.tang] / 1000;
      if (!f.thrown) f.thrown = { pos: p, prevPos: p, ang, hit: new Map() };
      f.thrown.prevPos = f.thrown.pos; f.thrown.pos = p; f.thrown.ang = ang;
    } else f.thrown = null;
  }
  const F = f.force;
  if (F.setActive) { F.setActive(jedi ? s[PF.timed] : 0); F.setHolding(jedi ? HOLD[s[PF.hold]] || '' : ''); F.gripBase = jedi ? s[PF.gripBase] : 0; }
  const tf = jedi && s[PF.target] ? byEid(s[PF.target]) : null;
  F.target = tf ? { type: 'npc', ref: tf, center: () => tf.chest() } : null;
  F.update(dt);
  const a = f.actor, ph = (p, sp) => p + age * sp;
  applyLayer(a, a.legs, animNames[s[PF.legs]], ph(s[PF.legsT] / 1000, s[PF.legsSpeed] / 1000), s[PF.legsSpeed] / 1000, s[PF.legsLoop], false);
  if (s[PF.torso] < 0) { if (!a.torsoFollow) { a.followLegs(); a.torso.cur = null; } }
  else applyLayer(a, a.torso, animNames[s[PF.torso]], ph(s[PF.torsoT] / 1000, s[PF.torsoSpeed] / 1000), s[PF.torsoSpeed] / 1000, s[PF.torsoLoop], true);
  a.yaw = a.yaw + wrapPi(s[PF.ayaw] / 1000 - a.yaw) * Math.min(1, dt * 25); a.spineYaw = s[PF.syaw] / 1000; a.spinePitch = s[PF.spitch] / 1000; a.legYaw = s[PF.legYaw] / 1000; a.matchPelvis = !!(fl & FLAG.matchPelvis);
  a.pos[0] = f.pos[0]; a.pos[1] = f.pos[1]; a.pos[2] = f.pos[2]; a.update(g.t); f.updateHilt(dt);
  f.dmgFlash = Math.max(0, (f.dmgFlash || 0) - dt * 2.5);
}
