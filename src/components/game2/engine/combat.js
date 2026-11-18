/* eslint-disable */
// Combat resolution: blade-vs-blade clashes, blade-vs-body hits, thrown saber, blaster bolts (and saber reflection),
// the floating practice remote, and flung props hitting people.
import { v3, clamp, lerp } from './math.js';
import { geo } from './gl.js';
import { guardSectorFromHit, directionalGuardChance } from './directionalGuard.js';
import { staminaBroken, STAMINA_BLOCK_COST } from './experimentalStamina.js';
import { preciseParry, mayCounterStep, counterStepIntent, COUNTER_STEP_WINDOW, COUNTER_STEP_FORCE_PERCENT, COUNTER_STEP_STAMINA_COST } from './experimentalCounter.js';
import { startCounterCombo, recordComboContact, canComboReposition, advanceComboReposition, aiComboResponse, COMBO_LINK_FORCE_PERCENT, COMBO_LINK_STAMINA_COST } from './experimentalCombo.js';
import { recordComboDefense } from './experimentalFlow.js';
import { noteExchangeContact, noteExchangePlayerBlock } from './experimentalExchangeChain.js';
import { markPhysicalContact } from './experimentalCombatRecovery.js';
import { injuryEligible, saberImpactZone, recordSaberWound } from './experimentalSaberInjury.js';
import { canBindRiposte, markBindRiposte, BIND_RIPOSTE_STAMINA_COST } from './experimentalBladeBind.js';
import { noteSurgeContact, canSurgeEvade, consumeSurgeEvade, SURGE_EVADE_FORCE_PERCENT, SURGE_EVADE_STAMINA_COST } from './experimentalSaberSurge.js';
import { THROW_LODGE_DPS, THROW_HIT, THROW_DAMAGE_MUL, KATA_DAMAGE, COUNTER_OPEN, COUNTER_CHANCE, CRIT_MUL, COUNTER_AUTO, DODGE_AROUND } from './fighter.js';
// Force Dodge: a strike that gets past the guard of someone with the Force for it may be sidestepped (a flash step)
// Only a Q-assisted evade spends Force: 15% of that fighter's maximum tank.
// Passive 30% Force Dodge is free, and still works when Q is not held.
export const DODGE_CHANCE = 0.3, DODGE_COST = 15, DODGE_CD = 1.5, DODGE_DIST = 2.6;
// the held-Q evade around the attacker (W): it ends EVADE_BEHIND m behind them, from an attacker no further than
// EVADE_AROUND_REACH m away (further off, the evade is the sidestep)
export const EVADE_BEHIND = 1.5, EVADE_AROUND_REACH = 4;
// after the Counter's strike leaves them standing, the striker can finish them (R) with the Speed cut for COUNTER_CUT_S s
export const COUNTER_CUT_S = 1.6;

const rnd = (a, b) => a + Math.random() * (b - a);
const BLOCKS = ['block1', 'block2', 'block3', 'block4', 'block5', 'block6', 'block7', 'block8', 'block9'];
const BOUNCES = ['bounce1', 'bounce2', 'bounce3'];

export function segSeg(p1, q1, p2, q2) { // closest points between two segments
  const d1 = v3.sub(q1, p1), d2 = v3.sub(q2, p2), r = v3.sub(p1, p2);
  const a = v3.dot(d1, d1), e = v3.dot(d2, d2), f = v3.dot(d2, r); let s, t; const EPS = 1e-9;
  if (a <= EPS && e <= EPS) { s = t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = v3.dot(d1, r);
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = v3.dot(d1, d2), den = a * e - b * b;
      s = den > EPS ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = v3.addS(p1, d1, s), c2 = v3.addS(p2, d2, t); return { d: v3.dist(c1, c2), a: c1, b: c2, s, t };
}
// Continuous contact along the moving blade AND the moving target. Subframe sampling
// stops a fast strafe, crouch or jump from passing between three discrete hit tests.
// Both combat and visual effects use exactly the same weapon base/tip.
export function sweptBladeContact(fromBlade, toBlade, fromBody, toBody, extraRadius = 0.04) {
  if (!toBlade || !toBody) return null;
  const beforeBlade = fromBlade || toBlade;
  const beforeBody = fromBody && v3.dist(fromBody.a, toBody.a) < 3.5 ? fromBody : toBody;
  const movement = Math.max(
    v3.dist(beforeBlade[0], toBlade[0]), v3.dist(beforeBlade[1], toBlade[1]),
    v3.dist(beforeBody.a, toBody.a), v3.dist(beforeBody.b, toBody.b),
  );
  const steps = Math.min(24, Math.max(4, Math.ceil(movement / 0.13)));
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const base = v3.lerp(beforeBlade[0], toBlade[0], t);
    const tip = v3.lerp(beforeBlade[1], toBlade[1], t);
    const ca = v3.lerp(beforeBody.a, toBody.a, t);
    const cb = v3.lerp(beforeBody.b, toBody.b, t);
    const contact = segSeg(base, tip, ca, cb);
    if (contact.d <= toBody.r + extraRadius) return contact;
  }
  return null;
}
// player vs enemy; online free-for-all fighters (team 'ffa') are hostile to every other fighter except training allies
export const hostile = (a, b) => a !== b && ((['blue', 'red'].includes(a.team) && ['blue', 'red'].includes(b.team) && a.team !== b.team) || (a.team === 'player' && b.team === 'enemy') || (a.team === 'enemy' && b.team === 'player') || ((a.team === 'ffa' || b.team === 'ffa') && a.team !== 'ally' && b.team !== 'ally'));

const segsOf = f => (f.bladeSegs ? f.bladeSegs() : f.bladeSeg && f.bladeSeg() ? [f.bladeSeg()] : []); // every ignited blade
export class Combat {
  constructor(g) {
    this.g = g; this.bolts = []; this.pair = new Map(); this.remote = null; this.kills = 0; this.reflected = 0;
    const m = geo(); m.sphere(0, 0, 0, 0.27, [0.30, 0.31, 0.36, 1], 18).cyl(0, -0.02, 0, 0.30, 0.04, [0.18, 0.18, 0.22, 1], 18).sphere(0, 0, 0.22, 0.075, [0.9, 0.12, 0.08, 1], 8);
    this.remoteMesh = g.R.uploadStatic(m.build());
    if (g.mode === 'explorer') this.spawnRemote(); // the floating practice remote belongs to the free-roam explorer only
  }
  spawnRemote() { this.remote = { pos: [4, 2.4, 4], vel: [0, 0, 0], hp: 24, cool: 2.2, ang: Math.random() * 6, charge: 0, dead: false, respawn: 0, flash: 0, yaw: 0 }; }
  // ---------- geometry helpers
  capsule(f) {
    const p = f.pos;
    if(f.isRancorBoss) return {
      a:[p[0],p[1]+.65,p[2]],b:[p[0],p[1]+3.3,p[2]],r:2.05,
    }; // real boss melee collision covers the model, not a 1.75 m human capsule
    if (f.status === 'down' || f.status === 'dead' || f.status === 'getup') { const c = [p[0], p[1] + 0.35, p[2]]; return { a: c, b: c, r: 0.65 }; }
    if (f.status === 'flung') { const c = [p[0], p[1] + 0.8, p[2]]; return { a: c, b: c, r: 0.7 }; }
    return { a: [p[0], p[1] + 0.15, p[2]], b: [p[0], p[1] + (f.ducked ? 1.05 : 1.75), p[2]], r: 0.42 };
  }
  sideOf(T, pt, proj) { // parry direction relative to defender (JO blocked codes)
    const sy = Math.sin(T.yaw), cy = Math.cos(T.yaw); const dx = pt[0] - T.pos[0], dz = pt[2] - T.pos[2];
    const lat = dx * (-cy) + dz * sy; // + = defender's right
    const hh = pt[1] - T.pos[1]; const up = hh > (T.ducked ? 0.55 : 1.05);
    let s; if (up && Math.abs(lat) < 0.18) s = 'T'; else if (up) s = lat > 0 ? 'UR' : 'UL'; else s = lat > 0 ? 'LR' : 'LL';
    return proj ? s + '_P' : s;
  }
  canBlock(T, from) {
    if (!T.hasSaber || T.saber.holstered || T.status !== 'normal' || T.thrown || T.blade.len < 0.8) return false;
    const S = T.saber, experimental = !!this.g?.experimentalCombatActive?.();
    if (!experimental) {
      // Academy MP WP_SaberCanBlock: an attack command, an attacking/non-
      // guard saber move, a thrown saber or an extended Force hand cannot
      // also award an automatic body-hit parry. Physical blade clashes are
      // resolved separately and can still meet an attacking blade.
      if (T.cmd?.attack || S.inFlight || T.forceUntil > (this.g?.t ?? 0) || S.isActiveSwing?.()) return false;
      if (S.I && Number.isInteger(S.move) && S.move !== S.I.LS_READY && S.move !== S.I.LS_NONE &&
          !S.inParry?.(S.move) && !S.inReflect?.(S.move)) return false;
    }
    const fwd = [Math.sin(T.yaw), Math.cos(T.yaw)]; const d = v3.norm([from[0] - T.pos[0], 0, from[2] - T.pos[2]]);
    // WP_SaberCanBlock applies InFront to every saber style. The staff's
    // rear blade may physically clash; it does not grant a 360-degree auto-
    // parry. Keep the existing Experimental guard policy in its own mode.
    if ((experimental && T.saberKit === 'staff') || fwd[0] * d[0] + fwd[1] * d[2] > 0.25) return true;
    // An actively aimed, fresh Experimental guard may catch an attack from
    // behind; contact-sector matching and stamina still decide the actual parry.
    // Classic retains its forward-facing parry requirement.
    return !!(T.isPlayer && experimental &&
      T.directionalGuard?.held && T.directionalGuard.sector &&
      this.g.t <= T.directionalGuard.until);
  }
  blockProb(T, pt = null) {
    // Neither a player nor an AI duelist can auto-parry during Experimental exhaustion.
    // Classic and remote multiplayer fighters never use this branch.
    if (!T.remote && this.g?.experimentalCombatActive?.() && T.experimentalStamina &&
        (staminaBroken(T.experimentalStamina, this.g.t) || T.experimentalStamina.current < STAMINA_BLOCK_COST)) return 0;
    if (T.isPlayer && T.directionalGuard?.held) {
      // The actual contact sector is measured in defender-local coordinates.
      // Blocking still requires legal facing, lit saber and a parryable attack.
      // An active slash cannot simultaneously provide a perfect new guard.
      if (T.saber.isActiveSwing()) return 0;
      const contact = pt ? guardSectorFromHit(T, pt) : null;
      let p = directionalGuardChance(T.directionalGuard, contact, this.g.t);
      if (Math.hypot(T.vel?.[0] || 0, T.vel?.[2] || 0) > 2) p *= 0.45;
      return p;
    }
    const S = T.saber; let p;
    if (S.inParry(S.move) || S.inReflect(S.move)) p = 0.96; else if (S.isActiveSwing()) p = 0.3; else p = T.isPlayer ? 0.68 : (T.blockSkill ?? 0.5);
    if (T.isPlayer) p += S.level === 1 ? 0.15 : S.level === 3 ? -0.06 : 0;
    if (T.saberKit === 'dual') p += 0.06; // a second blade to parry with
    // Sprinting or rapidly strafing does not grant a stationary perfect parry.
    if (Math.hypot(T.vel?.[0] || 0, T.vel?.[2] || 0) > 2) p *= 0.45;
    return clamp(p, 0, 0.97);
  }
  bladeDamage(A) { const S = A.saber; let d = [0, 12, 18, 28][S.level]; if (S.inSpecial(S.move) && !S.inKata?.(S.move)) d *= 1.6; if (A.kata) d *= KATA_DAMAGE; if (A.critStrike && A.critStrike.until > this.g.t) d *= CRIT_MUL; return d * A.damageMul * (A.isPlayer ? 1 : (A.dmgScale ?? 0.55)); }
  // ---------- per-step update
  step(dt) {
    const g = this.g; const F = g.fighters ? g.fighters() : [g.player, ...g.npcs];
    const caps = new Map(F.map(f => [f, this.capsule(f)]));
    for (const [k, v] of this.pair) { if (v - dt <= 0) this.pair.delete(k); else this.pair.set(k, v - dt); }
    // Jedi Outcast CheckSaberDamage (w_saber.c): the ignited blade is traced every step and always cuts what it touches.
    // During an attack move a hit deals the stance damage and that blade can hit the same target again 100 ms later
    // (300 ms after a block); outside attacks, contact deals touch damage every 200 ms. wound = attacker>target -> time.
    const wound = this.wound ??= new Map();
    // blade clashes + body hits
    for (const A of F) {
      // every ignited blade (two with dual sabers or a saberstaff), each swept from where it was last step
      const segs = segsOf(A), prevs = A._prevSegs || []; A._prevSegs = segs.map(s => [s[0].slice(), s[1].slice()]); A._prev = A._prevSegs[0] || null;
      const seg = segs[0];
      if (!seg || A.status === 'dead') continue;
      if (A.hitMove !== A.saber.moveStart) { A.hitSet.clear(); A.hitMove = A.saber.moveStart; }
      const swing = A.swingActive() || (A.thrown && false);
      const attacking = A.attacking ? A.attacking() : swing; // BG_SaberInAttack: attack and special moves
      if (attacking) segs.forEach((s, k) => this.groundStrike(A, prevs[k], s));
      const own = !A.remote && !g.noDamage; // another player's blade is resolved in their game; no damage between rounds
      for (const B of F) {
        if (B === A || !hostile(A, B) || B.status === 'dead') continue;
        const ddx = B.pos[0] - A.pos[0], ddz = B.pos[2] - A.pos[2]; if (ddx * ddx + ddz * ddz > 20 || Math.abs(B.pos[1] - A.pos[1]) > 4) continue; // out of any blade's reach (4.5 m)
        const bss = segsOf(B);
        if (bss.length && (swing || B.swingActive()) && A.status === 'normal' && B.status === 'normal' && !A.dodge && !B.dodge) { // a dodging or parried-open fighter cannot clash sabers
          const key = A.name + '|' + B.name; const key2 = B.name + '|' + A.name;
          if (!this.pair.has(key) && !this.pair.has(key2)) {
            let r = null; for (const s of segs) for (const bs of bss) { const q = segSeg(s[0], s[1], bs[0], bs[1]); if (!r || q.d < r.d) r = q; }
            if (r.d < 0.2) { this.pair.set(key, 0.32); this.clash(A, B, v3.lerp(r.a, r.b, 0.5), swing, B.swingActive()); }
          }
        }
        if (!own) continue;
        const wk = A.name + '>' + B.name; if ((wound.get(wk) ?? -1) > g.t) continue;
        let hit = null; for (let k = 0; k < segs.length && !hit; k++) hit = sweptBladeContact(prevs[k], segs[k], B._prevCap, caps.get(B));
        if (!hit) continue;
        if (attacking) { const r = this.bladeHit(A, B, hit.a); wound.set(wk, A.kata ? (A.kata.anim ? g.t + 0.45 : Math.max(g.t + 0.1, A.saber.moveStart + A.saber.moveLen / 1000)) : A.thrustStab ? Math.max(g.t + 0.1, A.saber.moveStart + A.saber.moveLen / 1000) : g.t + (r === 'blocked' || r === 'dodged' || r === 'pending' ? 0.3 : 0.1)); } // a kata swing wounds each target once (a Jedi Academy kata: at most every 0.45 s); so does the rolling thrust
        else if (this.touchHit) { const r = this.touchHit(A, B, hit.a); wound.set(wk, g.t + (r === 'dodged' || r === 'pending' ? 0.3 : 0.2)); }
      }
      // remote droid
      const rm = this.remote;
      if (attacking && rm && !rm.dead && !A.hitSet.has('remote') && A.team === 'player') { const r = segSeg(seg[0], seg[1], rm.pos, rm.pos); if (r.d < 0.42) { A.hitSet.add('remote'); this.hitRemote(40, rm.pos); } }
      // thrown saber: the first contact lodges it in the victim, where it keeps spinning and cutting (THROW_LODGE_DPS)
      if (A.thrown && own) {
        const T = A.thrown;
        if (T.phase === 'lodged' && T.lodged) {
          const B = T.lodged;
          if (B.status !== 'dead' && g.t >= (T.lodgeTick || 0)) { T.lodgeTick = g.t + 0.2; this.damage(A, B, B.chest(), THROW_LODGE_DPS * 0.2 * THROW_DAMAGE_MUL * A.damageMul, { spark: true, noFlinch: true }); }
        } else for (const B of F) {
          if (B === A || !hostile(A, B) || B.status === 'dead' || (T.hit.get(B) || 0) > g.t) continue;
          const contact = sweptBladeContact([T.prevPos || T.pos, T.prevPos || T.pos], [T.pos, T.pos], B._prevCap, caps.get(B), A.saberKit === 'staff' ? 0.9 : 0.45); // a spinning saberstaff reaches twice as far
          if (contact) {
            T.hit.set(B, g.t + 0.4);
            this.damage(A, B, contact.a, THROW_HIT * THROW_DAMAGE_MUL * A.damageMul, { spark: true });
            if (B.status !== 'dead' && T.phase !== 'back' && A.lodgeSaber) A.lodgeSaber(B);
            break;
          }
        }
        if (rm && !rm.dead && A.team === 'player' && segSeg(T.prevPos || T.pos, T.pos, rm.pos, rm.pos).d < 0.7) this.hitRemote(40, rm.pos);
      }
    }
    for (const f of F) { const cap = caps.get(f); f._prevCap = { a: cap.a.slice(), b: cap.b.slice(), r: cap.r }; }
    this.props(dt); this.updateBolts(dt); this.updateRemote(dt);
  }
  // w_saber.c CheckSaberDamage also traces the blade against the world: an attacking blade that reaches the floor
  // throws sparks, plays the wall-hit sound and leaves a scorch (CG_SaberHitWall / saber burn mark).
  groundStrike(A, prev, seg) {
    const g = this.g, [b, t] = seg; if (!g.world || !g.world.floorAt) return;
    const fl = g.world.floorAt(t[0], t[2], Math.max(b[1], t[1]) + 0.3); if (fl == null || t[1] > fl + 0.03 || b[1] <= fl) return;
    const was = prev && prev[1][1] <= fl + 0.03; if (was && (A.groundHitT ?? -1) > g.t) return; A.groundHitT = g.t + 0.15;
    const k = clamp((b[1] - fl) / Math.max(1e-3, b[1] - t[1]), 0, 1), pt = [b[0] + (t[0] - b[0]) * k, fl + 0.02, b[2] + (t[2] - b[2]) * k];
    g.fx.sparks(pt, [0, 1, 0], was ? 6 : 16, [1, 0.85, 0.55, 1]); g.sfxAt(['wall1', 'wall2', 'wall3'][Math.floor(Math.random() * 3)], pt, was ? 0.35 : 0.8);
    if (!was) { g.flashLight && g.flashLight(pt, A.blade.color, 0.18); if (A.isPlayer && g.shake) g.shake(0.08); }
    if (g.scorch) g.scorch(pt, A.blade.color); A.groundHits = (A.groundHits || 0) + 1;
  }
  clash(A, B, pt, aSwing, bSwing) {
    const g = this.g; g.fx.sparks(pt, [0, 1, 0], 18, [1, 0.92, 0.6, 1]); g.sfxAt(BLOCKS[Math.floor(Math.random() * BLOCKS.length)], pt, 1); g.flashLight(pt, A.blade.color, 0.25);
    // Native equal-level/deflection bounces exclude BG_SaberInSpecial on
    // each participant. A normal blade contact must not replace an authored
    // kata, dual opposite-target attack or leap with a generic recoil.
    const protectsSpecial = fighter => !g.experimentalCombatActive?.() && fighter.saber.inSpecial?.(fighter.saber.move);
    if (!A.remote) { if (aSwing) { if (!protectsSpecial(A)) A.saber.blocked = 'BOUNCE'; } else A.saber.blocked = this.sideOf(A, pt); } // each game bounces its own fighters
    if (!B.remote) { if (bSwing) { if (!protectsSpecial(B)) B.saber.blocked = 'BOUNCE'; } else if (B.canParry !== false) B.saber.blocked = this.sideOf(B, pt); }
    if (A.isPlayer || B.isPlayer) g.shake(0.12);
    g.onSaberClash?.(A, B);
    if (aSwing) markPhysicalContact(g, A);
    if (bSwing) markPhysicalContact(g, B);
    // The actual blade segments have already intersected. Consider a
    // directionally precise defender/AI counter only after both duelists
    // have paid their physical clash stamina.
    if (!g.net && !g.director && !g.bossWay) {
      const bind = (aggressor, defender, attacking, guarding) => {
        if (!canBindRiposte(g, aggressor, defender, pt, attacking, guarding) ||
            !this.canBlock(defender, aggressor.pos)) return false;
        const spent = g.spendExperimentalStamina?.(defender, BIND_RIPOSTE_STAMINA_COST, 'blade-bind-riposte');
        if (!spent?.paid || spent.broke) return false;
        if (!aggressor.knockOpen?.(COUNTER_OPEN)) return false;
        markBindRiposte(aggressor, defender, g.t);
        // Reuse the authored counter choreography, but do not knockOpen twice.
        this.armBindRiposte(aggressor, defender, pt);
        return true;
      };
      if (!bind(A, B, aSwing, bSwing)) bind(B, A, bSwing, aSwing);
    }
    if (aSwing && this.wound) { const k = A.name + '>' + B.name; this.wound.set(k, Math.max(this.wound.get(k) ?? 0, g.t + 0.3)); } // a clash spends the swing on the other blade
  }
  bladeHit(A, B, pt) {
    const g = this.g, I = A.saber.I, m = A.saber.move, crit = A.critStrike && A.critStrike.until > g.t;
    if (B.dodge) return 'dodged'; // mid flash step: not there to be hit
    // In online games, the defender's own instance resolves dodge and parry
    // using their real Q state and Force tank, never a stale remote puppet.
    if (g.net?.defenderOwnedSaber && B.remote) {
      g.net.rpc(B, 'saberHit', [A, pt, false]);
      return 'pending';
    }
    // Dodge is movement, not a saber block: resolve it BEFORE automatic parry.
    // A successful dodge never sets saber.blocked or triggers Counter.
    if (!crit && this.tryDodge(A, B)) return 'dodged'; // Counter's critical strike is special
    const unblockable = crit || (!!I && (m === I.LS_A_BACK || m === I.LS_A_BACK_CR || m === I.LS_A_BACKSTAB || m === I.LS_A_JUMP_T__B_)); // w_saber.c; the Counter's strike
    if (!unblockable && this.canBlock(B, A.pos) && Math.random() < this.blockProb(B, pt) - (A.kata ? 0.25 : 0)) { // blocked (a kata is harder to parry)
      g.fx.sparks(pt, [0, 1, 0], 14, [1, 0.9, 0.55, 1]); g.sfxAt(BLOCKS[Math.floor(Math.random() * BLOCKS.length)], pt, 1); g.flashLight(pt, A.blade.color, 0.2);
      const side = B.saber.isActiveSwing() ? 'BOUNCE' : this.sideOf(B, pt); if (B.remote && g.net) g.net.rpc(B, 'blocked', [side]); else B.saber.blocked = side;
      if (g.experimentalCombatActive?.() || !A.saber.inSpecial?.(A.saber.move)) A.saber.blocked = 'BOUNCE';
      if (A.isPlayer || B.isPlayer) g.shake(0.1);
      if (g.net) g.net.onHit(A, B, pt, { blocked: true });
      markPhysicalContact(g, A); // physical saber block, not a miss
      g.onSaberBlock?.(B); // successful parries spend stamina before they can open a follow-up
      // A block that just exhausted the defender's Experimental guard must
      // enter its actual stagger path, not also award a free critical counter.
      if (!g.net && !A.remote && !B.remote && !A.kata && A.status === 'normal' && B.status === 'normal' &&
          !(g.experimentalCombatActive?.() && staminaBroken(B.experimentalStamina, g.t))) {
        const inExperimental = g.experimentalCombatActive?.() && !g.director && !g.bossWay && B.isPlayer;
        const defendedChain = inExperimental && recordComboDefense(B, A, g.t);
        const precise = inExperimental && preciseParry(B, pt, g.t) &&
          !staminaBroken(B.experimentalStamina, g.t);
        if (defendedChain) g.hud?.msg?.('COMBO DEFENSE · counter window extended');
        else if (precise) this.counterParry(A, B, pt, { manual: true });
        else if (Math.random() < this.counterChance(B)) this.counterParry(A, B, pt);
      }
      this.recordExperimentalComboContact(A, B, 'blocked');
      this.recordExperimentalSurgeContact(A, B, 'blocked');
      // Only physical, successfully resolved block events are eligible for
      // local AI tactical decisions, after any authored counter parry.
      g.onExperimentalBlockExchange?.(A, B);
      // Stage 2 must see a genuinely resolved hit/block from the AI's
      // authored attack; no free advance on an attempted or missed swing.
      noteExchangeContact(g, A, B, 'blocked');
      noteExchangePlayerBlock(g, A, B);
      return 'blocked';
    }
    const bonus = A.interceptBonusUntil > g.t && (B.status === 'flung' || B.status === 'down' || B.status === 'getup') ? (A.interceptBonus || 1) : 1; // Push + Speed intercept
    markPhysicalContact(g, A); // physical body contact also closes missed-swing receipt
    this.damage(A, B, pt, this.bladeDamage(A) * (B.hasSaber ? 1 : 1.5) * bonus, { spark: true, saber: true, crit }); // non-Jedi take 1.5x (w_saber.c)
    this.recordExperimentalComboContact(A, B, 'hit');
    this.recordExperimentalSurgeContact(A, B, 'hit');
    noteExchangeContact(g, A, B, 'hit');
    return 'hit';
  }
  // Passive Force Dodge is a free 30% chance for the player; holding Q guarantees
  // an eligible dodge for 15% of max Force. Both retain the 1.5s cooldown.
  // Online arena defenses are resolved on their actual owner, not on puppets.
  dodgeChance(B) { return B.isPlayer ? DODGE_CHANCE : 0.06 + 0.2 * (B.blockSkill ?? 0.5); }
  tryDodge(A, B) {
    const g = this.g, F = g.forceOf && g.forceOf(B);
    // The tutorial's designated training target is stationary by design.
    // Without this, its random passive Force Dodge removes the target mid-
    // lesson and makes saber/kick practice fail unpredictably. The instructor
    // and the player's own defenses still use normal combat rules.
    if (g.tutorialMode && B === g.tutorialTarget) return false;
    // Network defender ownership matters: the locally controlled fighter may
    // dodge a remote attack, but a remote puppet never spends someone else's Force.
    if (B.remote || (g.net && !g.net.defenderOwnedSaber) || !F || F.holding || F.dash || B.status !== 'normal' || !B.onGround || B.kata || B.kicking || B.dodge || B.executing) return false;
    // Intercept owns movement until its dash completes; a passive dodge must
    // not queue a second movement that snaps back to the midpoint afterward.
    // A fighter committed to a Counter's automatic critical strike must not
    // auto-evade an idle blade and cancel their own committed follow-up.
    if ((B.dodgeReadyAt ?? 0) > g.t || B.saber.isActiveSwing() || (B.critAt ?? 0) > g.t || (B.critUntil ?? 0) > g.t || (B.critStrike?.until ?? 0) > g.t) return false;
    // The Q guarantee requires enough Force for the whole dodge. With an empty
    // tank the ordinary free 30% passive chance still applies.
    const qHeld = B.isPlayer && !g.hud?.help && g.input?.held(g.settings?.bindings?.evade || 'KeyQ');
    const qCost = (F.max || 100) * DODGE_COST / 100;
    const heldEvade = qHeld && F.fp >= qCost;
    if (!heldEvade && Math.random() >= this.dodgeChance(B)) return false;
    if (heldEvade && (B.cmd.fwd || B.cmd.right) && this.evadeHeld(A, B, F, qCost)) return true; // Q picks the escape direction
    const away = v3.norm([B.pos[0] - A.pos[0], 0, B.pos[2] - A.pos[2]]), lat = [away[2], 0, -away[0]], right = [-Math.cos(B.yaw), 0, Math.sin(B.yaw)];
    for (const s of Math.random() < 0.5 ? [1, -1] : [-1, 1]) { // whichever side has floor and no wall
      const d = v3.norm([lat[0] * s + away[0] * 0.3, 0, lat[2] * s + away[2] * 0.3]), to = v3.addS(B.pos, d, DODGE_DIST), mid = v3.addS(B.pos, d, DODGE_DIST / 2);
      const fl = g.world.floorAt(to[0], to[2], B.pos[1] + 1), fm = g.world.floorAt(mid[0], mid[2], B.pos[1] + 1);
      if (fl === null || fm === null || Math.abs(fl - B.pos[1]) > 0.5 || Math.abs(fm - B.pos[1]) > 0.5) continue;
      const c = [to[0], fl, to[2]]; g.world.collide(c, B.radius); if (Math.hypot(c[0] - to[0], c[2] - to[2]) > 0.05) continue;
      this.commitDodge(A, B, F, v3.dot(d, right) >= 0 ? 1 : -1, [to[0], fl, to[2]], {}, heldEvade ? 'Force Evade' : 'Force Dodge', heldEvade ? qCost : 0);
      return true;
    }
    return false;
  }
  commitDodge(A, B, F, side, to, o, label, forceCost = 0) {
    const g = this.g;
    if (forceCost) F.fp = Math.max(0, F.fp - forceCost);
    B.dodgeReadyAt = g.t + DODGE_CD;
    B.startDodge(side, to, o);
    g.sfxAt('swing2', B.pos, 0.9); g.sfxAt('swing1', to, 0.5);
    g.fx.ring({ p: [B.pos[0], B.pos[1] + 0.05, B.pos[2]], n: [0, 1, 0], r0: 0.25, r1: 1.1, life: 0.3, w: 0.06, c: [0.7, 0.85, 1, 0.7] });
    if (B.isPlayer) g.hud.msg(label); else if (A.isPlayer) g.hud.msg(B.label + ' dodged');
  }
  // the held-Q evade with a direction held (the player's keys, from where they face): A / D straight to that side, S back
  // (S + A / D back and to that side), W around the attacker to their back (W + A / D picks the way round, else whichever
  // way is open), turning to face them on the way. Every way checks floor and walls like the sidestep; false = blocked
  evadeHeld(A, B, F, forceCost = 0) {
    const g = this.g, c = B.cmd, sd = Math.sign(c.right || 0), fwd = [Math.sin(B.yaw), 0, Math.cos(B.yaw)], right = [-Math.cos(B.yaw), 0, Math.sin(B.yaw)];
    const floorAt = p => { const fl = g.world.floorAt(p[0], p[2], B.pos[1] + 1); return fl !== null && Math.abs(fl - B.pos[1]) <= 0.5 ? fl : null; };
    const open = (p, fl) => { const q = [p[0], fl, p[2]]; g.world.collide(q, B.radius); return Math.hypot(q[0] - p[0], q[2] - p[2]) <= 0.05; };
    if (c.fwd > 0) {
      const dA = Math.hypot(A.pos[0] - B.pos[0], A.pos[2] - B.pos[2]); if (dA > EVADE_AROUND_REACH) return false;
      const af = [Math.sin(A.yaw), 0, Math.cos(A.yaw)], back = v3.addS([A.pos[0], B.pos[1], A.pos[2]], af, -EVADE_BEHIND);
      for (const s of sd ? [sd] : Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        const side = v3.addS([A.pos[0], B.pos[1], A.pos[2]], right, s * Math.max(EVADE_BEHIND, dA * 0.8)); // the point passed at the halfway mark
        const fs = floorAt(side), fb = floorAt(back); if (fs === null || fb === null || !open(side, fs) || !open(back, fb)) continue;
        const via = [2 * side[0] - (B.pos[0] + back[0]) / 2, B.pos[1], 2 * side[2] - (B.pos[2] + back[2]) / 2]; // the curve's control point
        if (g.experimentalCombatActive?.()) {
          // A valid destination does not guarantee a safe path. Sweep the
          // entire curved flank to avoid clipping a BSP wall or chasm.
          let safe = true;
          for (let j = 1; j <= 10; j++) {
            const t = j / 10, u = 1 - t;
            const pt = [u * u * B.pos[0] + 2 * u * t * via[0] + t * t * back[0],
              B.pos[1], u * u * B.pos[2] + 2 * u * t * via[2] + t * t * back[2]];
            const floor = floorAt(pt);
            if (floor === null || !open(pt, floor)) { safe = false; break; }
          }
          if (!safe) continue;
        }
        this.commitDodge(A, B, F, s, [back[0], fb, back[2]], { via, dur: DODGE_AROUND, anim: s > 0 ? 'BOTH_DODGE_FR' : 'BOTH_DODGE_FL', faceYaw: Math.atan2(A.pos[0] - back[0], A.pos[2] - back[2]) }, 'Force Evade · behind them', forceCost);
        return true;
      }
      return false;
    }
    const d = v3.norm([fwd[0] * c.fwd + right[0] * c.right, 0, fwd[2] * c.fwd + right[2] * c.right]), to = v3.addS(B.pos, d, DODGE_DIST), mid = v3.addS(B.pos, d, DODGE_DIST / 2);
    const fl = floorAt(to), fm = floorAt(mid);
    if (fl === null || fm === null || !open(to, fl) ||
        (g.experimentalCombatActive?.() && !open(mid, fm))) return false;
    const anim = c.fwd < 0 ? ((sd || (Math.random() < 0.5 ? 1 : -1)) > 0 ? 'BOTH_DODGE_BR' : 'BOTH_DODGE_BL') : sd > 0 ? 'BOTH_DODGE_R' : 'BOTH_DODGE_L';
    this.commitDodge(A, B, F, sd || 1, [to[0], fl, to[2]], { anim }, 'Force Evade', forceCost);
    return true;
  }
  // the Counter: a block that parries the blade away. The player COUNTER_CHANCE (more mid-parry), the AI by skill
  counterChance(B) { const S = B.saber; return (B.isPlayer ? COUNTER_CHANCE : 0.08 + 0.17 * (B.blockSkill ?? 0.5)) + (S.inParry(S.move) || S.inReflect(S.move) ? 0.1 : 0); }
  counterParry(A, B, pt, { manual = false } = {}) {
    const g = this.g; if (!A.knockOpen?.(COUNTER_OPEN)) return;
    this.armCounterWindow(A, B, pt, manual);
    g.onExperimentalPlayerParry?.(A, B);
  }
  armBindRiposte(A, B, pt) {
    this.armCounterWindow(A, B, pt, !!B.isPlayer);
    this.g.tutorial?.onBladeBind?.(B);
    if (B.isPlayer) this.g.hud?.msg?.('BLADE BIND · Q+WASD OR ATTACK');
  }
  armCounterWindow(A, B, pt, manual = false) {
    const g = this.g;
    // A precise Experimental guard opens a manual choice: click to counterstrike,
    // or press Q + a movement key to flash-step before the follow-up. Classic
    // counters keep their original automatic critical response.
    B.critUntil = g.t + COUNTER_OPEN; B.critTarget = A;
    B.critAt = manual ? 0 : g.t + (B.isPlayer ? COUNTER_AUTO : 0.15 + Math.random() * 0.25);
    B.experimentalCounterUntil = manual ? g.t + COUNTER_STEP_WINDOW : 0;
    g.fx.sparks(pt, [0, 1, 0], 30, [1, 0.95, 0.7, 1]); g.sfxAt('hit3', pt, 0.7); g.flashLight(pt, [1, 1, 1], 0.35);
    if (B.isPlayer) g.banner(manual ? 'PARRY · Q+WASD OR ATTACK' : 'COUNTER!', [1, 0.85, 0.4], 1.0); else if (A.isPlayer) g.banner('PARRIED', [1, 0.5, 0.4], 0.9);
    if ((A.isPlayer || B.isPlayer) && !g.net) g.slowMo = { until: g.t + 0.3, scale: 0.4 }; // a heartbeat of slow motion
  }
  counterEvade(B, F) {
    const g = this.g;
    if (!g.experimentalCombatActive?.() || g.net || g.director || g.bossWay ||
        !counterStepIntent(B?.cmd)) return false;
    const first = mayCounterStep(B, F, g.t);
    const chain = !first && canComboReposition(B, F, g.t);
    if (!first && !chain) return false;
    const opponent = first ? B.critTarget : B.experimentalCombo.target;
    const forceCost = F.max * (first ? COUNTER_STEP_FORCE_PERCENT : COMBO_LINK_FORCE_PERCENT) / 100;
    // Both phases share the established authored Force Evade animations and
    // full terrain checks. A blocked route costs neither Force nor stamina.
    if (!this.evadeHeld(opponent, B, F, forceCost)) return false;
    g.spendExperimentalStamina?.(B, first ? COUNTER_STEP_STAMINA_COST : COMBO_LINK_STAMINA_COST,
      first ? 'counter-step' : 'combo-link');
    if (first) {
      B.experimentalCounterUntil = 0;
      B.critAt = 0;
      B.critUntil = Math.max(B.critUntil, g.t + 1.05);
      opponent.openUntil = Math.max(opponent.openUntil, g.t + 0.75);
      startCounterCombo(B, opponent, g.t);
    } else {
      advanceComboReposition(B, g.t);
      g.hud?.msg?.('CHAIN 2/2 · strike or defend');
      g.tutorial?.onComboLink?.(B);
    }
    return true;
  }
  speedSurgeEvade(B, F) {
    const g = this.g;
    if (!g.experimentalCombatActive?.() || g.net || g.director || g.bossWay ||
        !canSurgeEvade(F, B, g.t)) return false;
    const opponent = F.saberSurge.target;
    const forceCost = F.max * SURGE_EVADE_FORCE_PERCENT / 100;
    // All existing wall, floor, arc, and dodge-cooldown checks still apply.
    if (!this.evadeHeld(opponent, B, F, forceCost)) return false;
    g.spendExperimentalStamina?.(B, SURGE_EVADE_STAMINA_COST, 'saber-surge-dodge');
    consumeSurgeEvade(F);
    g.hud?.msg?.('SPEED COUNTER · follow with saber');
    g.tutorial?.onSpeedSurgeLink?.(B);
    return true;
  }
  recordExperimentalSurgeContact(A, B, result) {
    const g = this.g;
    if (!g.experimentalCombatActive?.() || g.net || g.director || g.bossWay ||
        A.remote || B.remote) return false;
    const success = noteSurgeContact(g.forceOf(A), B, result, g.t);
    if (success && A.isPlayer) g.hud?.msg?.('SPEED LINK · Q + WASD');
    return success;
  }
  recordExperimentalComboContact(A, B, result) {
    const g = this.g;
    if (!g.experimentalCombatActive?.() || g.net || g.director || g.bossWay ||
        !recordComboContact(A, B, result, g.t)) return false;
    if (!g.tutorialMode && B && !B.isPlayer && !B.remote && B.status !== 'dead' &&
        B.hasSaber && !B.experimentalComboResponse) {
      B.experimentalComboResponse = aiComboResponse(A, B, g.t);
    }
    g.tutorial?.onComboContact?.(A);
    return true;
  }
  // the blade resting on / brushing someone outside an attack: small stance-scaled damage, parried like any hit
  touchDamage(A) { return [0, 2, 3, 4.5][A.saber.level || 2] * (A.damageMul ?? 1) * (A.isPlayer ? 1 : (A.dmgScale ?? 0.55)); }
  touchHit(A, B, pt) {
    const g = this.g;
    if (B.dodge) return 'dodged';
    if (g.net?.defenderOwnedSaber && B.remote) {
      g.net.rpc(B, 'saberHit', [A, pt, true]);
      return 'pending';
    }
    // Even contact with an idle blade is an incoming lightsaber hit.
    if (this.tryDodge(A, B)) return 'dodged';
    if (this.canBlock(B, A.pos) && Math.random() < this.blockProb(B, pt)) { g.fx.sparks(pt, [0, 1, 0], 6, [1, 0.9, 0.55, 1]); g.sfxAt(BLOCKS[Math.floor(Math.random() * BLOCKS.length)], pt, 0.45); if (g.net) g.net.onHit(A, B, pt, { blocked: true, touch: true }); g.onSaberBlock?.(B); return 'blocked'; }
    this.damage(A, B, pt, this.touchDamage(A), { touch: true }); return 'hit';
  }
  damage(A, B, pt, dmg, o = {}) {
    const g = this.g; if (B.isPlayer && g.force.active.protect) { g.sfxAt('protecthit', B.pos, 0.8); }
    const beforeHp = B.hp;
    const zone = o.saber && injuryEligible(g, A, B) ? saberImpactZone(B, pt) : null;
    const hurtOptions = o.touch ? { noFlinch: true, touch: true } :
      o.noFlinch ? { noFlinch: true } : {};
    if (zone) hurtOptions.experimentalImpactZone = zone;
    const died = B.hurt(dmg, A, hurtOptions);
    // HP must have actually changed: a shield, dodge, parry, dead body or
    // rejected damage cannot create an injury. Never modify lethal saber DPS.
    if (zone && !died && B.hp > 0) {
      const wound = recordSaberWound(g, A, B, pt, beforeHp - B.hp);
      if (wound && A.isPlayer)
        g.hud?.msg?.(wound === 'leg' ? 'LEG HIT · enemy movement impaired' :
          'TORSO HIT · opponent recovering');
    }
    g.fx.sparks(pt, [0, 1, 0], o.touch ? 4 : 10, [1, 0.5, 0.2, 1]); if (g.net) g.net.onHit(A, B, pt, o); g.sfxAt(['hit1', 'hit2', 'hit3'][Math.floor(Math.random() * 3)], pt, o.touch ? 0.3 : 0.9);
    if (o.saber && !B.isRancorBoss && A.saber.level === 3 && !died && Math.random() < 0.35 && B.status === 'normal') { const d = v3.norm([B.pos[0] - A.pos[0], 0, B.pos[2] - A.pos[2]]); B.push(d, 4.5, 2.5); }
    if (B.isPlayer) { g.hud.hit(dmg); g.shake(o.touch ? 0.05 : 0.2); }
    if (died && !B.isPlayer && !g.net) { this.kills++; g.hud.msg('Defeated ' + B.label); }
    if (o.crit) { // the Counter's critical strike; a killing one splits them down the middle
      g.fx.sparks(pt, [0, 1, 0], 24, [1, 0.6, 0.25, 1]); if (A.isPlayer || B.isPlayer) { g.banner('CRITICAL', [1, 0.75, 0.35], 0.9); g.shake(0.35); } A.critStrike = null;
      if (!died) { A.counterCutUntil = g.t + COUNTER_CUT_S; A.counterCutTarget = B; } // low enough now, R finishes them with the Speed cut (executions.js)
      if (died && g.cutFighter) g.cutFighter(B, { y: B.chest()[1], dir: v3.norm([B.pos[0] - A.pos[0], 0, B.pos[2] - A.pos[2]]), floor: g.world.floorAt(B.pos[0], B.pos[2], B.pos[1] + 0.5) ?? B.pos[1], vertical: true });
    }
  }
  // ---------- flung props hurt people
  props(dt) {
    const g = this.g; for (const b of g.world.bodies) {
      const sp = Math.hypot(b.vel[0], b.vel[2]); if (sp < 6.5 || b.lifted > 0) continue; b.hitCool = (b.hitCool ?? 0) - dt; if (b.hitCool > 0) continue;
      for (const n of g.npcs) { if (n.team === 'ally' || n.status === 'dead') continue; const dx = n.pos[0] - b.pos[0], dz = n.pos[2] - b.pos[2]; if (Math.hypot(dx, dz) < b.r + 0.45 && b.pos[1] < n.pos[1] + 1.8 && b.pos[1] + 1 > n.pos[1]) {
        b.hitCool = 0.5; const d = v3.norm([b.vel[0], 0, b.vel[2]]); n.push(d, 5 + sp * 0.4, 3); n.hurt(8 + sp, null, { noFlinch: true }); g.fx.sparks([b.pos[0], b.pos[1] + 0.6, b.pos[2]], [0, 1, 0], 10, [1, 0.7, 0.4, 1]); g.sfxAt('hit1', b.pos, 0.9); b.vel[0] *= 0.35; b.vel[2] *= 0.35; b.flash = 1; if (n.status === 'dead') this.kills++; break; } }
    }
  }
  // ---------- blaster bolts
  shoot(f, target, o = {}) { // fire from f's right hand at the target point
    const g = this.g; const from = f.actor.bonePos('rhand'); const to = target || g.player.chest(); const err = o.err ?? 0.07;
    const dir = v3.norm([to[0] - from[0] + rnd(-1, 1) * err * v3.dist(to, from), to[1] - from[1] + rnd(-0.6, 0.6) * err * v3.dist(to, from), to[2] - from[2] + rnd(-1, 1) * err * v3.dist(to, from)]);
    const muz = v3.addS(from, dir, 0.25); this.bolts.push({ p: muz, v: v3.scale(dir, o.speed ?? 19), team: f.team, owner: f, dmg: o.dmg ?? 6, col: o.col ?? [1, 0.18, 0.12], life: 3.2, reflected: false });
    g.fx.sparks(muz, dir, 3, [1, 0.4, 0.2, 1]); if (g.sfx && g.sfx.blaster) g.sfx.blaster({ pos: muz, vol: o.vol ?? 0.35, pitch: o.pitch }); else g.sfxAt('hit', muz, 0.25);
  }
  updateBolts(dt) {
    const g = this.g, P = g.player;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.life -= dt; const sp = v3.len(b.v);
      let dead = b.life <= 0; const old = b.p.slice(); b.p = v3.addS(b.p, b.v, dt);
      if (!dead && (b.p[1] < 0.02 || b.p[1] > 14 || g.world.boltBlocked(old, b.p))) { dead = true; g.fx.sparks(b.p, [0, 1, 0], 5, [b.col[0], b.col[1], b.col[2], 1]); }
      if (!dead) for (const pl of g.world.pillars) { if (b.p[1] < 8.5 && Math.hypot(b.p[0] - pl.x, b.p[2] - pl.z) < pl.r) { dead = true; g.fx.sparks(b.p, [0, 1, 0], 6, [b.col[0], b.col[1], b.col[2], 1]); break; } }
      if (!dead && b.team === 'enemy') { // vs player
        const cap = this.capsule(P);
        if (P.status !== 'dead') { const r = segSeg(old, b.p, cap.a, cap.b); const near = segSeg(old, b.p, P.chest(), P.chest()).d;
          if (r.d < cap.r + 0.35 || near < 1.0) { if (r.d < cap.r + 0.35 || near < 0.7) dead = this.boltAtPlayer(b, r.a); } }
      } else if (!dead && b.team === 'player') { // reflected: hits enemies / remote
        for (const n of g.npcs) { if (n.team !== 'enemy' || n.status === 'dead') continue; const cap = this.capsule(n); const r = segSeg(old, b.p, cap.a, cap.b);
          if (r.d < cap.r + 0.2) { if (n.hasSaber && this.canBlock(n, b.owner ? b.owner.pos : n.pos) && Math.random() < 0.6) { this.deflectNPC(n, b); } else { this.damage(P, n, r.a, b.dmg, {}); dead = true; } break; } }
        const rm = this.remote; if (!dead && rm && !rm.dead && segSeg(old, b.p, rm.pos, rm.pos).d < 0.4) { this.hitRemote(40, rm.pos); dead = true; }
      }
      if (dead) this.bolts.splice(i, 1);
    }
  }
  boltAtPlayer(b, pt) { // returns true when the bolt is consumed
    const g = this.g, P = g.player, F = g.force;
    if (F.active.absorb) { g.sfxAt('absorbhit', P.pos, 0.9); F.fp = Math.min(F.max, F.fp + 6); g.fx.sparks(P.chest(), [0, 1, 0], 8, [0.7, 0.4, 1, 1]); g.hud.msg('Absorbed (+FP)'); return true; }
    const S = P.saber;
    if (!S.holstered && P.status === 'normal' && !P.thrown && P.blade.len > 0.8) {
      const p = (S.isActiveSwing() ? 0.95 : S.inReflect(S.move) || S.inParry(S.move) ? 0.98 : 0.8) + (S.level === 1 ? 0.05 : 0);
      if (Math.random() < p) { // reflect (JO: LS_REFLECT_*)
        S.blocked = this.sideOf(P, b.p, true); this.reflect(b, P); return false;
      }
    }
    if (g.force.active.protect) g.sfxAt('protecthit', P.pos, 0.8);
    P.hurt(b.dmg, b.owner); g.hud.hit(b.dmg); g.shake(0.15); g.fx.sparks(pt, [0, 1, 0], 6, [1, 0.4, 0.2, 1]); g.sfxAt('hit1', P.pos, 0.6); return true;
  }
  reflect(b, P) {
    const g = this.g; const tgt = b.owner && b.owner.status !== 'dead' ? b.owner.chest() : [b.p[0] - b.v[0], b.p[1] + 0.5, b.p[2] - b.v[2]];
    const dir = v3.norm([tgt[0] - b.p[0] + rnd(-0.25, 0.25), tgt[1] - b.p[1] + rnd(-0.2, 0.2), tgt[2] - b.p[2] + rnd(-0.25, 0.25)]);
    b.v = v3.scale(dir, v3.len(b.v) * 1.1); b.team = 'player'; b.dmg = 40; b.col = [0.4, 0.7, 1]; b.reflected = true; this.reflected++;
    g.fx.sparks(b.p, [0, 1, 0], 14, [1, 0.95, 0.6, 1]); g.sfxAt(BOUNCES[Math.floor(Math.random() * 3)], b.p, 1); g.flashLight(b.p, [0.5, 0.7, 1], 0.25);
  }
  deflectNPC(n, b) { n.saber.blocked = this.sideOf(n, b.p, true); const dir = v3.norm([rnd(-1, 1), rnd(0.1, 0.8), rnd(-1, 1)]); b.v = v3.scale(dir, v3.len(b.v)); b.team = 'none'; this.g.fx.sparks(b.p, [0, 1, 0], 10, [1, 0.9, 0.6, 1]); this.g.sfxAt('bounce1', b.p, 0.8); }
  // ---------- practice remote
  hitRemote(dmg, pt) {
    const r = this.remote; if (!r || r.dead) return; r.hp -= dmg; r.flash = 1; this.g.fx.sparks(r.pos, [0, 1, 0], 14, [1, 0.8, 0.5, 1]); this.g.sfxAt('hit2', r.pos, 0.9);
    if (r.hp <= 0) { r.dead = true; r.respawn = 6; this.kills++; this.g.hud.msg('Remote destroyed'); this.g.fx.burst(r.pos, 40, { s0: 2, s1: 7, l0: 0.4, l1: 1, z0: 0.03, z1: 0.09, c0: [1, 0.7, 0.3, 1], c1: [1, 0.2, 0.05, 0], grav: -6 }); this.g.fx.ring({ p: r.pos, n: [0, 1, 0], r0: 0.2, r1: 2.2, life: 0.4, w: 0.1, c: [1, 0.6, 0.2, 0.9] }); this.g.sfxAt('hit3', r.pos, 1); }
  }
  updateRemote(dt) {
    const g = this.g, r = this.remote, P = g.player; if (!r) return;
    if (r.dead) { r.respawn -= dt; if (r.respawn <= 0) this.spawnRemote(); return; }
    r.flash = Math.max(0, r.flash - dt * 4); r.ang += dt * 0.55;
    const tx = P.pos[0] + Math.cos(r.ang) * 5.2, tz = P.pos[2] + Math.sin(r.ang) * 5.2, ty = 1.7 + Math.sin(g.t * 1.7) * 0.25;
    r.vel[0] += (tx - r.pos[0]) * 2.4 * dt; r.vel[1] += (ty - r.pos[1]) * 3 * dt; r.vel[2] += (tz - r.pos[2]) * 2.4 * dt; const k = Math.max(0, 1 - 1.8 * dt); r.vel[0] *= k; r.vel[1] *= k; r.vel[2] *= k;
    for (let i = 0; i < 3; i++) r.pos[i] += r.vel[i] * dt; g.world.collide(r.pos, 0.3); r.yaw = Math.atan2(P.pos[0] - r.pos[0], P.pos[2] - r.pos[2]);
    r.cool -= dt;
    if (P.status !== 'dead' && v3.dist(r.pos, P.pos) < 20) {
      if (r.cool <= 0 && r.charge <= 0) { r.charge = 0.45; r.cool = rnd(1.6, 2.8); g.sfxAt('hit', r.pos, 0.2); }
      if (r.charge > 0) { r.charge -= dt; if (r.charge <= 0) { const from = r.pos, to = P.chest(); const dir = v3.norm([to[0] - from[0] + rnd(-0.5, 0.5), to[1] - from[1] + rnd(-0.4, 0.4), to[2] - from[2] + rnd(-0.5, 0.5)]); this.bolts.push({ p: v3.addS(from, dir, 0.3), v: v3.scale(dir, 15), team: 'enemy', owner: { chest: () => r.pos.slice(), status: 'normal', pos: r.pos }, dmg: 4, col: [1, 0.25, 0.1], life: 3, reflected: false }); g.sfxAt('hit', r.pos, 0.35); } }
    }
  }
  drawRemote(R) {
    const r = this.remote; if (!r || r.dead) return; const m = new Float32Array(16); m.fill(0); const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    m[0] = c; m[2] = -s; m[5] = 1; m[8] = s; m[10] = c; m[12] = r.pos[0]; m[13] = r.pos[1]; m[14] = r.pos[2]; m[15] = 1;
    R.drawMesh(this.remoteMesh, m, { spec: 0.5, emis: [r.flash * 0.9 + (r.charge > 0 ? 0.6 : 0.08), r.flash * 0.6 + (r.charge > 0 ? 0.1 : 0.0), r.flash * 0.5] });
    const eye = v3.addS(r.pos, [Math.sin(r.yaw), 0, Math.cos(r.yaw)], 0.24); R.billboard(eye, r.charge > 0 ? 0.3 + (0.45 - r.charge) * 0.4 : 0.1, [1, 0.2, 0.1, r.charge > 0 ? 0.9 : 0.6], 0);
  }
  drawBolts(R) {
    for (const b of this.bolts) { const d = v3.norm(b.v), tail = v3.addS(b.p, d, -0.85); const c = b.col; R.beam(tail, b.p, 0.11, [c[0], c[1], c[2], 0.0], [c[0], c[1], c[2], 0.55]); R.beam(tail, b.p, 0.04, [1, 1, 1, 0.2], [1, 0.95, 0.95, 1]); R.billboard(b.p, 0.22, [c[0], c[1], c[2], 0.7], 0); }
  }
}
