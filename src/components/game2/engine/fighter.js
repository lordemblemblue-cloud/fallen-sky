/* eslint-disable */
// Fighter: a character with Jedi-Outcast-style locomotion, jump/roll/crouch, saber state machine and reaction states.
// Used for the player (input driven), the sparring droids / duelist / ally (AI driven).
import { Actor } from './actor.js';
import { SaberLogic, KIT_STANCES, ACADEMY_JUMP_ATTACK } from './saber.js';
import { ACADEMY_KATAS, ACADEMY_KATA_MOVES, ACADEMY_KATA_SPEED, requiredAcademyKit, validAnimationClip, academyKataMotion } from './academyAnimations.js';
import { ACADEMY_ROLL, academyRollSpeed } from './academyRoll.js';
import { findWallForTraversal, chooseWallAnimation, wallAnimationDuration, wallKickVelocity, WALL_TRAVERSAL } from './wallTraversal.js';
import { Blade } from './fx.js';
import { flowAttackBlend } from './experimentalFlow.js';
import { smoothDuelMotion, duelLegBlend, interruptDuelMotion } from './experimentalMotionPolish.js';
import { injuryMovementScale } from './experimentalSaberInjury.js';
import { CTF_CARRIER_SPEED_SCALE } from './teamMatch.js';
import { m4, v3, q as Q, clamp, wrapPi, DEG, lerp } from './math.js';

const G = 20;                                   // gravity m/s^2 (JO 800 u/s^2)
// Saber throw (Atom X Eve): spins at 72 rad/s (three times the original), homes in on the nearest foe within
// THROW_SEEK m of the blade, and on contact lodges in them and keeps spinning there (THROW_LODGE_DPS) while the throw is
// held, for up to THROW_LODGE_S; releasing the throw, the victim's Force Push or their death sends it home.
export const THROW_SPIN = 72, THROW_SEEK = 7, THROW_TURN = 4.5, THROW_LODGE_S = 2.6, THROW_LODGE_DPS = 25;
// every saber throw hit (the first contact, THROW_HIT, and the lodged spin) deals THROW_DAMAGE_MUL of it: 15% less
export const THROW_HIT = 14, THROW_DAMAGE_MUL = 0.85;
// thrown into a wall faster than this (m/s, into the wall) slams into it (Game.onWallSlam); slower just bumps
export const WALL_SLAM_SPEED = 6;
// Force Levitate: the victim floats LEVITATE_HEIGHT m up, helpless, for the caster's duration; any hit drops them
export const LEVITATE_HEIGHT = 2.1;
// Taunts (T): the original Jedi Outcast gesture animations, a set for each side; moving, attacking or jumping cuts one short
export const TAUNTS = Object.freeze({ light: ['BOTH_ENGAGETAUNT', 'BOTH_SILENCEGESTURE1', 'BOTH_TALKGESTURE2'], dark: ['BOTH_THREATEN1', 'BOTH_ENGAGETAUNT', 'BOTH_TALKGESTURE10'] });
export const TAUNT_COOLDOWN = 1;
// Lightsaber kits: one blade, a blade in each hand ('dual'), or a saberstaff with a blade at each end ('staff')
export const SABER_KITS = Object.freeze(['single', 'dual', 'staff']);
// Both attack buttons select the source Academy whole-body action for the
// current stance/kit. No unrelated slash chain stands in for missing frames.
// Damage remains the browser combat system's existing tuning.
export const KATA_COST = 50, KATA_DAMAGE = 1.5;
export const KATA_STEPS = Object.freeze(Object.fromEntries(
  Object.entries(ACADEMY_KATA_MOVES).map(([key, move]) => [key, Object.freeze([move])])));
export const KATA_ANIMS = ACADEMY_KATAS;
// The Counter (Atom X Eve): a block may parry the attacking blade away (COUNTER_CHANCE for the player, by skill for the AI),
// leaving the attacker open for COUNTER_OPEN s; the defender strikes on its own COUNTER_AUTO s later (or at once with a
// click): a critical vertical strike (CRIT_MUL damage)
export const COUNTER_OPEN = 0.9, COUNTER_CHANCE = 0.25, CRIT_MUL = 2, COUNTER_AUTO = 0.12;
// DODGE_AROUND: the held-Q flash step that circles the attacker to their back takes this long (s)
export const DODGE_DASH = 0.13, GHOST_LIFE = 0.4, DODGE_AROUND = 0.22;
// the rolling thrust (attack with W held during a roll): the roll is cut short this far through into the lunge stab,
// which turns onto a foe in front within ROLL_THRUST_REACH m. For ROLL_THRUST_STAB_S the blade points straight out ahead
// (Fighter.stabPose), reaching a foe about ROLL_THRUST_STAB m away: one further off is closed on in ROLL_THRUST_DRIVE s
export const ROLL_THRUST_AT = 0.6, ROLL_THRUST_REACH = 3.2, ROLL_THRUST_STAB = 1.5, ROLL_THRUST_DRIVE = 0.18, ROLL_THRUST_STAB_S = 0.36;
export const STAFF_TWIRL = 15; // rad/s: the saberstaff without Jedi Academy's set spins about a turn through each attack // Force Dodge: the flash step's length (s) and how long its afterimages last
// Force Pull from above lifts the victim to the caster; they hang there this long (helpless: a Push now blows them away)
export const PULL_HANG = 0.45;
const FLIP_X = Q.axisAngle([1, 0, 0], Math.PI);
const FORCE_JUMP_HEIGHT = [0.8, 3.3, 5.7, 10.4]; // JO forceJumpHeight[] in metres
export const emptyCmd = () => ({ fwd: 0, right: 0, up: 0, walk: false, crouch: false, attack: false, alt: false, jump: false, jumpPressed: false, jumpReleased: false, crouchPressed: false });
const DEATHS = ['BOTH_DEATH1', 'BOTH_DEATH2', 'BOTH_DEATH3', 'BOTH_DEATH4', 'BOTH_DEATH5', 'BOTH_DEATH6', 'BOTH_DEATH7', 'BOTH_DEATH8', 'BOTH_DEATH9'];
const PAINS = ['BOTH_PAIN2', 'BOTH_PAIN3', 'BOTH_PAIN1', 'BOTH_PAIN4', 'BOTH_PAIN5', 'BOTH_PAIN6'];
const animLen = (a) => a.n / Math.abs(a.fps);
// leg / torso aim constants from cg_players.c (CG_G2PlayerAngles, CG_SwingAngles)
const LEG_TURN_MAX = 60 * DEG, LEG_SWING_TOL = 40 * DEG, LEG_CLAMP = 89 * DEG, LEG_SWING_SPEED = 300 * DEG; // legs: 0.3 deg/ms
const TORSO_PITCH_TOL = 15 * DEG, TORSO_PITCH_CLAMP = 30 * DEG, TORSO_PITCH_SPEED = 100 * DEG;              // torso pitch: 0.1 deg/ms
// CG_SwingAngles: move toward dest at speed (x0.5 within tol/2, x1 within tol, x2 beyond), never more than clampTol behind
function swingTo(cur, dest, tol, clampTol, speed, dt) { let sw = dest - cur; const a = Math.abs(sw), k = a < tol * 0.5 ? 0.5 : a < tol ? 1 : 2, st = speed * k * dt; cur = a <= st ? dest : cur + Math.sign(sw) * st; sw = dest - cur; if (Math.abs(sw) > clampTol) cur = dest - Math.sign(sw) * clampTol; return cur; }

export class Fighter {
  constructor(game, o = {}) {
    this.g = game; this.name = o.name || 'fighter'; this.actor = new Actor(game.skel);
    this.actor.tint = o.tint || [1, 1, 1]; this.actor.tintAmt = o.tintAmt || 0;
    this.pos = (o.pos || [0, 0, 0]).slice(); this.spawn = this.pos.slice(); this.vel = [0, 0, 0]; this.yaw = o.yaw || 0; this.targetYaw = this.yaw; this.legYaw = 0;
    this.maxHp = o.hp || 100; this.hp = this.maxHp; this.isPlayer = !!o.isPlayer; this.team = o.team || 'neutral'; this.kind = o.kind || 'fighter';
    this.cmd = emptyCmd(); this.onGround = true; this.ducked = false; this.status = 'normal'; this.statusT = 0; this.statusAnim = null;
    this.saber = new SaberLogic(game.saberData, this._host()); this.saber.holstered = true;
    this.hasSaber = o.hasSaber !== false; this.blade = new Blade(o.bladeColor || [0.25, 0.55, 1]); this.hilt = this.hasSaber ? 'thigh' : 'none';
    this.hiltMat = new Float32Array(16); this.timers = []; this.forceUntil = 0; this.legsLockUntil = 0; this.landUntil = 0;
    this.speedMul = 1; this.damageMul = 1; this.takeMul = 1; this.radius = 0.38; this.thrown = null; this.airAnim = null; this.fjUsed = false; this.jumpAt = -9; this.rollDir = [0, 0, 1];
    this.hitSet = new Set(); this.hitMove = -1; this.idleSince = 0; this.alpha = 1; this.flash = 0; this.deadAt = 0; this.glow = 0; this.glowCol = [1, 0.2, 0.1]; this.dmgFlash = 0; this.lastHurt = -9; this.distracted = 0;
    this.jumpLevel = 3; this.jumpCharge = 0; this.jumpCharging = false; this.facingLock = false;
    this.wallTraversal = null; this.wallCooldown = 0; this.wallPoseUntil = 0; this.wallKickUntil = 0; this.wallSlowFall = false;
    this.nativeRoll = false; this.rollAnim = null; this.rollCrossQueued = false;
    this.force = null; this.reaction = o.reaction ?? 0.8;               // Force instance (dark Jedi) + chance to react to a push/pull in time
    this.shoveV = [0, 0, 0]; this.elecUntil = 0; this.elecTick = 0;      // decaying slide from a weak push, lightning 'electrified' state
    this.gripCarry = null; this.gripCripple = -9; this.counterUntil = 0;  // level-3 grip carries the victim, brief immunity after a grip, counter-throw lockout
  }
  get now() { return this.g.t; }
  _host() {
    const me = this;
    return {
      hasAnim: n => !!me.actor.skel.anims[n], animInfo: n => me.actor.skel.anims[n], torsoIdleAnim: st => me.torsoIdle(st),
      playTorso: (a, o) => me.playTorso(a, o), event: (t, d) => me.onSaberEvent(t, d), requestDraw: () => me.quickDraw(),
      chargeKitSpin: () => { // Academy SABER_ALT_ATTACK_POWER_FB; ordinary JO attacks retain their existing cost
        const name = 'BOTH_SPINATTACK' + me.saber.animLevel;
        if (!me.actor.skel.anims[name]?.ja || !me.force || me.force.fp < 25) return false;
        me.force.fp -= 25; return true;
      },
      standingStill: () => me.status === 'normal' && me.onGround && !me.ducked && !me.cmd.fwd && !me.cmd.right && Math.hypot(me.vel[0], me.vel[2]) < 1.5,
    };
  }
  // ---------- anim helpers
  torsoIdle(stance) {
    const L = this.actor.legs.name || 'BOTH_STAND1';
    if (this.ducked || /^BOTH_(STAND|SABERFAST|SABERSLOW|SABERDUAL|SABERSTAFF|CROUCH|GUARD)/.test(L) || /WALKBACK/.test(L)) return stance;
    return L;
  }
  playTorso(anim, o) {
    const a = this.actor, now = this.now;
    if (o.parts === 'both') { a.setBoth(anim, { blend: (o.blendMs || 100) / 1000, restart: true, loop: false, speed: o.rage || 1 }); this.legsLockUntil = now + o.durMs / 1000; return; }
    if (o.parts === 'whole') { a.setBoth(anim, { blend: flowAttackBlend(this, now, (o.blendMs || 100) / 1000, o.idle), restart: true, loop: false, speed: o.speed ?? (o.rage || 1), startAt: o.startAt || 0 }); this.swingLegsUntil = now + o.durMs / 1000; return; } // standing swing: legs follow it, torso aim stays on
    if (o.idle) {
      if (anim === a.legs.name) { a.followLegs(); a.torso.cur = null; } else a.setTorso(anim, { blend: (o.blendMs || 100) / 1000, loop: true, speed: 1 });
      return;
    }
    a.setTorso(anim, { blend: flowAttackBlend(this, now, (o.blendMs || 100) / 1000, o.idle), restart: true, loop: false, speed: o.speed ?? (o.rage || 1), startAt: o.startAt || 0 });
  }
  playForce(anim, o = {}) { // force-power torso animation (JO: forceHandExtend)
    if (this.fidgetUntil > this.now) this.cancelFidget();
    const a = this.actor, info = a.skel.anims[anim]; const dur = (o.durMs ?? animLen(info) * 1000);
    // After a valid Experimental Force step, a second Force cast blends from
    // the actual previous pose; clip speed, channel duration and hit logic stay
    // exactly as authored. Classic / scripted / multiplayer remain unchanged.
    const blend = flowAttackBlend(this, this.now, o.blend ?? (o.whole ? 0.08 : 0.07), !!o.loop);
    if (o.whole) { a.setBoth(anim, { blend, restart: true, loop: o.loop ?? false, speed: o.speed || 1 }); this.legsLockUntil = this.now + dur / 1000; }
    else a.setTorso(anim, { blend, restart: true, loop: o.loop ?? false, speed: o.speed || 1 });
    this.forceUntil = this.now + dur / 1000; this.forceHold = !!o.hold;
  }
  endForce() { this.forceUntil = 0; this.forceHold = false; if (!this.saber.holstered) this.saber.setMove(this.saber.I.LS_READY, this.now); else { this.actor.followLegs(); this.actor.torso.cur = null; } }
  cancelFidget() { this.fidgetUntil = 0; this.legsLockUntil = 0; this.actor.followLegs(); this.actor.torso.cur = null; }
  playWhole(anim, o = {}) { const info = this.actor.skel.anims[anim]; this.actor.setBoth(anim, { blend: o.blend ?? 0.1, restart: true, loop: o.loop ?? false, speed: o.speed || 1 }); return animLen(info) / (o.speed || 1); }
  after(sec, fn) { this.timers.push({ t: this.now + sec, fn }); }
  // ---------- saber handling
  onSaberEvent(type, d) { if (type === 'swing') { this.g.onSwing && this.g.onSwing(this, d.move); } }
  quickDraw() { if (this.saber.holstered && this.hasSaber && this.status === 'normal' && !this.thrown) { if (this.isPlayer) this.toggleSaber(); else this.igniteNow(); } }
  igniteNow() { const s = this.saber; s.holstered = false; this.hilt = 'hand'; this.blade.set(true); s.move = s.I.LS_READY; s.weaponTime = 0; this.g.sfxAt && this.g.sfxAt('saberon', this.pos, 0.8); this.g.humStart && this.g.humStart(this); }
  extinguish() { const s = this.saber; this.blade.set(false); this.g.sfxAt && this.g.sfxAt('saberoff', this.pos, 0.8); this.g.humStop && this.g.humStop(this); this.after(0.3, () => { if (!this.saber.holstered) return; this.hilt = this.thrown ? 'thrown' : 'thigh'; }); s.holstered = true; s.torsoTimer = 0; s.weaponTime = 0; s.move = s.I.LS_READY; this.hilt = 'thigh'; if (!this.forceUntil) { this.actor.followLegs(); this.actor.torso.cur = null; } }
  toggleSaber() {
    if (!this.hasSaber || this.status !== 'normal' || this.thrown) return; if (this.fidgetUntil > this.now) this.cancelFidget(); const s = this.saber, I = s.I;
    if (s.holstered) { s.holstered = false; s.setMove(I.LS_DRAW, this.now); s.weaponTime = s.torsoTimer; this.after(0.32, () => { this.hilt = 'hand'; this.blade.set(true); this.g.sfxAt('saberon', this.pos, 0.8); this.g.humStart(this); }); }
    else { s.setMove(I.LS_PUTAWAY, this.now); s.weaponTime = s.torsoTimer; this.after(0.42, () => { this.blade.set(false); this.g.sfxAt('saberoff', this.pos, 0.8); this.g.humStop(this); this.hilt = 'hand'; }); this.after(0.62, () => { this.hilt = 'thigh'; s.holstered = true; s.move = I.LS_READY; s.weaponTime = 0; if (!this.forceUntil) { this.actor.followLegs(); this.actor.torso.cur = null; } }); }
  }
  // a saber kit fights in its own style: Jedi Academy's dual / staff sets at medium weight; without them both use Jedi
  // Outcast's one-handed Fast style - dual sabers with the derived left arm (actor.js G2D_), the staff held at the middle
  // and spun through each attack (twirlStaff)
  kitStyle() { return this.saberKit === 'single' ? 0 : this.saber.animLevel ? 2 : 1; }
  setStyle(lv) { if (this.saberKit === 'single') this.singleSaberStyle = lv; this.saber.level = this.kitStyle() || lv; if (!this.saber.holstered && this.saber.weaponTime <= 0 && this.saber.move === this.saber.I.LS_READY) this.saber.setMove(this.saber.I.LS_READY, this.now); }
  bladeSeg() { return this.blade.len > 0.3 ? [this.blade.base, this.blade.tip] : null; }
  // every ignited blade: the second one comes with dual sabers or a saberstaff
  bladeSegs() { const out = []; if (this.blade.len > 0.3) out.push([this.blade.base, this.blade.tip]); if (this.blade2 && this.blade2.len > 0.3) out.push([this.blade2.base, this.blade2.tip]); return out; }
  setSaberKit(kit) {
    const next = SABER_KITS.includes(kit) ? kit : 'single';
    // A committed whole-body action keeps the equipment its grip was authored
    // for. Otherwise changing kits can replace the second blade mid-kata.
    if (next !== this.saberKit && (this.kata || (this.saber.move === this.saber.I.LS_ROLL_STAB && this.saber.weaponTime > 0))) return false;
    if (this.saberKit === 'single') this.singleSaberStyle = this.saber.level;
    this.saberKit = next;
    // A partial bank must not mix one Academy swing with JO transitions/guards. Keep the complete existing fallback
    // until every required clip is present; expose missing names for diagnostics/import QA.
    const S = this.saber, al = { dual: 6, staff: 7 }[this.saberKit] || 0, sk = this.actor.skel;
    S.missingKitAnimations = requiredAcademyKit(S.M, al).filter(n => !sk.anims[n]?.ja || !validAnimationClip(sk.anims[n], sk.rigJson.rig.nFrames));
    S.animLevel = al && !S.missingKitAnimations.length ? al : 0;
    S.derivedKit = S.animLevel ? null : this.saberKit === 'dual' && this.actor.skel.anims.G2D_BOTH_A1_T__B_ ? 'dual' : this.saberKit === 'staff' ? 'staff' : null; // without Jedi Academy's sets
    if (this.saberKit === 'single') { this.blade2 = null; this.hilt2Mat = null; this.twirl = 0; this.setStyle(this.singleSaberStyle || 2); return true; }
    if (!this.blade2) { this.blade2 = new Blade(this.blade.color); this.hilt2Mat = new Float32Array(16); }
    this.blade2.color = this.blade.color;
    this.setStyle(this.kitStyle());
    this.twirl = 0;
    return true;
  }
  // the Counter (combat.js counterParry): parried away, the saber thrown up over the head (the strong style's broken top
  // parry, held), unable to guard or act for `sec` s
  knockOpen(sec = COUNTER_OPEN) {
    if (this.status !== 'normal') return false; interruptDuelMotion(this); this.endForce(); this.cancelAttackState(); if (this.kata) this.endKata(true); this.kicking = null;
    this.status = 'open'; this.statusT = 0; this.openUntil = this.now + sec; this.vel[0] *= 0.2; this.vel[2] *= 0.2;
    const an = this.actor.skel.anims.BOTH_B3_T____ ? 'BOTH_B3_T____' : 'BOTH_PAIN1'; this.actor.setBoth(an, { blend: 0.1, restart: true, loop: false, speed: 0.02, startAt: 0.12 / 0.02 });
    return true;
  }
  // the Counter's critical strike: a vertical overhead cut (the strong top-to-bottom) at the parried foe, lunging in;
  // twice the damage, and a killing blow splits them down the middle (combat.js)
  startCritStrike() {
    const T = this.critTarget; if (!(this.critUntil > this.now) || !T || T.status === 'dead' || this.status !== 'normal' || this.saber.holstered || this.thrown || this.kata) return false;
    // Experimental counter-dodges must finish before the existing authored
    // critical strike starts; do not cancel or snap through a dash.
    if (this.g.experimentalCombatActive?.() && (this.dodge || this.forceUntil > this.now)) return false;
    this.experimentalCounterUntil = 0;
    this.critUntil = 0; this.critAt = 0; const dx = T.pos[0] - this.pos[0], dz = T.pos[2] - this.pos[2], L = Math.hypot(dx, dz) || 1; this.yaw = this.targetYaw = Math.atan2(dx, dz);
    if (L > 1.3) { const v = Math.min(7, (L - 1.1) * 5); this.vel[0] = dx / L * v; this.vel[2] = dz / L * v; } // step in
    const S = this.saber, an = this.actor.skel.anims.BOTH_A3_T__B_ ? 'BOTH_A3_T__B_' : null;
    S.setMove(S.I.LS_A_T2B, this.now, { restart: true, anim: an, parts: 'both' }); S.weaponTime = S.torsoTimer; S.state = 'firing'; S.attackStartedAt = this.now;
    this.critStrike = { target: T, until: this.now + S.moveLen / 1000 + 0.05 }; this.g.sfxAt?.('swing1', this.pos, 1);
    return true;
  }
  // saberstaff kicks (Jedi Academy: alt attack + a direction; F / B / L / R, the _AIR version off the ground). Whole-body,
  // the legs planted; 40% in, whoever is in front of the kicking foot is knocked down (Game.kickHit)
  startKick(dir) {
    const an = 'BOTH_A7_KICK_' + dir + (this.onGround ? '' : '_AIR');
    if (this.saberKit !== 'staff' || !this.saber.animLevel || !this.actor.skel.anims[an] || this.status !== 'normal' || this.kata || this.kicking || this.saber.holstered || this.forceUntil > this.now) return false;
    const len = this.playWhole(an, { blend: 0.08 }); this.legsLockUntil = this.forceUntil = this.now + len; this.forceHold = false;
    this.kicking = { until: this.now + len, hitAt: this.now + len * 0.4, dir, done: false }; this.g.sfxAt?.('swing2', this.pos, 0.6);
    return true;
  }
  tickKick() {
    const K = this.kicking; if (!K) return;
    if (this.status !== 'normal' || this.now >= K.until) { this.kicking = null; return; }
    if (!K.done && this.now >= K.hitAt) { K.done = true; this.g.kickHit?.(this, K.dir); }
  }
  // Force Dodge (Combat.tryDodge): a flash step to the side - DODGE_DASH seconds from here to `to`, untouchable, leaving
  // afterimages of the body behind; Jedi Outcast's sidestep (BOTH_DODGE_L / _R) carries on from its lean as they land.
  // o (the held-Q evade): anim, one of the other BOTH_DODGE_* leans; via, a point the step curves past (around the
  // attacker); dur, its length; faceYaw, the facing it turns to on the way (the player's camera turns with it)
  startDodge(side, to, o = {}) {
    const an = o.anim && this.actor.skel.anims[o.anim] ? o.anim : side < 0 ? 'BOTH_DODGE_L' : 'BOTH_DODGE_R';
    const len = this.playWhole(an, { blend: 0.04, speed: 1.3 }); this.legsLockUntil = this.forceUntil = this.now + Math.min(len, 0.42); this.forceHold = false;
    this.dodge = { from: this.pos.slice(), to, via: o.via || null, dur: o.dur || DODGE_DASH, yaw0: this.yaw, faceYaw: o.faceYaw ?? null, t0: this.now, ghostAt: 0 }; this.ghost();
  }
  tickDodge() {
    const D = this.dodge, t = this.now - D.t0; if (this.status !== 'normal' || t > D.dur + 0.1) { this.dodge = null; return; } // knocked out of it: no late teleport
    const k = clamp(t / D.dur, 0, 1), e = 1 - (1 - k) * (1 - k) * (1 - k); // all speed at once, settling at the end
    if (D.via) { // a quadratic curve through the side of the attacker
      const u = 1 - e, a = u * u, b = 2 * u * e, c = e * e;
      this.pos[0] = D.from[0] * a + D.via[0] * b + D.to[0] * c; this.pos[2] = D.from[2] * a + D.via[2] * b + D.to[2] * c; this.pos[1] = D.from[1] + (D.to[1] - D.from[1]) * e;
    } else { this.pos[0] = D.from[0] + (D.to[0] - D.from[0]) * e; this.pos[1] = D.from[1] + (D.to[1] - D.from[1]) * e; this.pos[2] = D.from[2] + (D.to[2] - D.from[2]) * e; }
    this.vel[0] = this.vel[2] = 0;
    if (D.faceYaw != null) { const y = D.yaw0 + wrapPi(D.faceYaw - D.yaw0) * e; this.yaw = this.targetYaw = y; if (this.isPlayer && this.g.cam) this.g.cam.yaw = y; }
    if (this.now >= D.ghostAt) { D.ghostAt = this.now + 0.035; this.ghost(); }
    if (k >= 1) { this.dodge = null; this.g.onExperimentalDodgeLanded?.(this); }
  }
  ghost() { // the pose of this moment, left behind (drawn by Game.drawGhosts)
    const a = this.actor; (this.ghosts ??= []).push({ model: Float32Array.from(a.model), skin: a.skin.slice(0, a.nBones * 16), nBones: a.nBones, tint: a.tint, tintAmt: 0, t: this.g.t });
  }
  // with the saber out, a Jedi Academy kit stands, runs and walks with its own cycles
  kitAnim(an) {
    const al = this.saber.animLevel; if (!al || this.saber.holstered) return an;
    const k = al === 6 ? 'DUAL' : 'STAFF', m = { BOTH_STAND2: KIT_STANCES[al], BOTH_RUN2: 'BOTH_RUN_' + k, BOTH_WALK1: 'BOTH_WALK_' + k, BOTH_RUNBACK1: 'BOTH_RUNBACK_' + k, BOTH_WALKBACK1: 'BOTH_WALKBACK_' + k }[an];
    return m && this.actor.skel.anims[m] ? m : an;
  }
  swingPhase() { const s = this.saber; if (!s.isActiveSwing() || s.moveLen <= 0) return -1; return (this.now - s.moveStart) * 1000 / s.moveLen; }
  swingActive() { return !this.saber.holstered && this.saber.isActiveSwing(); } // start / attack / transition: the blade is moving with intent
  attacking() { const s = this.saber; return !s.holstered && s.inAttack(s.move); } // BG_SaberInAttack: full attack damage (w_saber.c)
  // A committed strike (the attack itself, after the wind-up) finishes on the line it started: the mouse no longer turns
  // or pitches the body until it ends. The wind-up can still be re-aimed with a mouse flick (SaberLogic.redirectStart).
  swingLocked() { const s = this.saber; return !s.holstered && s.inAttack(s.move) && s.weaponTime > 0; }
  specialLocked() { const s = this.saber, I = s.I, m = s.move; return !!this.kata || (!s.holstered && s.weaponTime > 0 && (/^BOTH_SPINATTACK[67]$/.test(s.moveAnim) || s.M?.[m]?.dualAttack || m === I.LS_ROLL_STAB || m === I.LS_A_JUMP_T__B_ || m === I.LS_A_BACK || m === I.LS_A_BACK_CR || m === I.LS_A_BACKSTAB || m === I.LS_A_FLIP_STAB || m === I.LS_A_FLIP_SLASH)); } // bg_pmove.c: no move / strafe / jump input during these
  // A full 100-point Force bar sustains a thrown saber for seven seconds.
  // Releasing the throw returns the blade without extra drain.
  throwSaber(dir) {
    if (this.thrown || this.saber.holstered || !this.hasSaber || (this.force && this.force.fp <= 0)) return false;
    // thrown out of a roll: the tumbling hand is no launch point, so it leaves from chest height in front, straight out
    // the way you look: level, or a little up if you look up (from the camera's own pitch: aimed from the tumbling chest it
    // would climb, and the camera looking down on you would dive it into the floor)
    const roll = this.status === 'roll', flat = v3.norm([dir[0], 0, dir[2]]);
    if (roll) dir = v3.norm([flat[0], clamp(this.isPlayer && this.g.cam ? -Math.sin(this.g.cam.pitch) : dir[1], 0, 0.15), flat[2]]);
    const hp = roll ? v3.addS([this.pos[0], this.pos[1] + 1.1, this.pos[2]], flat, 0.5) : this.actor.bonePos('rhand'); this.thrown = { pos: hp.slice(), prevPos: hp.slice(), dir: v3.norm(dir), t: 0, phase: 'out', ang: 0, hit: new Map(), fromRoll: roll, dy0: roll ? dir[1] : 0 };
    this.saber.inFlight = true; this.hilt = 'thrown'; this.g.sfxAt('spin', this.pos, 0.8); this.thrownLoop = this.g.sfx.loop && this.g.sfx.loop('spin', { vol: 0.35 }); return true;
  }
  // the foe a thrown saber homes in on: the closest one within THROW_SEEK m of the blade
  throwPrey(T) {
    const foes = this.g.foesOf ? this.g.foesOf(this) : []; let best = null, bd = THROW_SEEK;
    for (const f of foes) { if (f.spawnShield > this.now) continue; const d = v3.dist(f.chest(), T.pos); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  lodgeSaber(target) { const T = this.thrown; if (!T || T.phase === 'back') return; T.phase = 'lodged'; T.lodged = target; T.lodgeUntil = this.now + THROW_LODGE_S; T.lodgeTick = this.now; }
  unlodgeSaber() { const T = this.thrown; if (T && T.phase === 'lodged') { T.lodged = null; T.phase = 'back'; } }
  updateThrown(dt) {
    const T = this.thrown; if (!T) return;
    T.prevPos = T.pos.slice(); T.t += dt; T.ang += THROW_SPIN * dt;
    const hand = this.actor.bonePos('rhand'); hand[1] += 0.05;
    const held = !!this.cmd.alt;
    // A held throw flies out, homes in on the nearest foe (else tracks the camera direction while spinning at range) and
    // lodges in whoever it hits. Release sends it home. This also works when either fighter is airborne.
    if (!held) { T.phase = 'back'; T.lodged = null; }
    // Only the sustained outbound/hover/lodged throw costs Force; the return
    // flight is free. Zero Force forces recall instead of leaving an infinite blade.
    if (held && T.phase !== 'back' && this.force) {
      this.force.fp = Math.max(0, this.force.fp - this.force.max * dt / 7);
      if (this.force.fp <= 0) { T.phase = 'back'; T.lodged = null; }
    }
    if (T.phase === 'lodged') {
      const L = T.lodged;
      if (!L || L.status === 'dead' || this.now > T.lodgeUntil || L.spawnShield > this.now) { T.lodged = null; T.phase = 'back'; }
      else { const c = L.chest(); T.pos = [c[0], c[1] - 0.05, c[2]]; return; } // spins inside them (Combat.step deals the damage)
    }
    const prey = (T.phase === 'out' || T.phase === 'hover') && v3.dist(T.pos, hand) < 16 ? this.throwPrey(T) : null;
    if (prey) { // home in gradually: the blade turns toward them at THROW_TURN rad/s-ish and keeps flying
      const want = v3.norm(v3.sub(prey.chest(), T.pos)); T.dir = v3.norm(v3.lerp(T.dir, want, Math.min(1, dt * THROW_TURN)));
      T.pos = v3.addS(T.pos, T.dir, 17 * dt); T.phase = 'out'; T.prey = prey;
    } else if (T.phase === 'out') {
      T.prey = null;
      let aim = this.isPlayer ? this.g.aimDir() : T.dir;
      if (T.fromRoll && this.status === 'roll') aim = v3.norm([aim[0], T.dy0, aim[2]]); // aimed from the tumbling chest it would climb: level until you are up
      T.dir = v3.norm(v3.lerp(T.dir, aim, Math.min(1, dt * 6)));
      T.pos = v3.addS(T.pos, T.dir, 19 * dt);
      if (v3.dist(T.pos, hand) >= 10.5 || (T.pos[1] <= 0.35 && !(T.fromRoll && T.t < 0.25))) T.phase = 'hover'; // out of a roll: clear of the floor first
    } else if (T.phase === 'hover') {
      const aim = this.isPlayer ? this.g.aimDir() : T.dir;
      T.dir = v3.norm(v3.lerp(T.dir, aim, Math.min(1, dt * 8)));
      const goal = v3.addS(hand, T.dir, 9.5);
      goal[1] = Math.max(0.35, goal[1]);
      T.pos = v3.lerp(T.pos, goal, Math.min(1, dt * 8));
    } else {
      const d = v3.sub(hand, T.pos), L = v3.len(d);
      T.pos = v3.addS(T.pos, v3.scale(d, 1 / (L || 1)), Math.min(L, 26 * dt));
      if (L < 0.6) { this.catchSaber(); return; }
    }
    const fl = this.g.world && this.g.world.floorAt ? this.g.world.floorAt(T.pos[0], T.pos[2], T.pos[1] + 0.5) : 0;
    T.pos[1] = Math.max((fl ?? -Infinity) + 0.35, T.pos[1]);
    // Reset per-target hit cooldowns only after they expire, not every return frame.
    for (const [target, next] of T.hit) if (next < this.now - 1) T.hit.delete(target);
  }
  catchSaber() { this.thrown = null; this.saber.inFlight = false; this.hilt = 'hand'; this.g.sfxAt('catch', this.pos, 0.8); if (this.thrownLoop) { this.thrownLoop.stop(0.05); this.thrownLoop = null; } this.saber.setMove(this.saber.I.LS_READY, this.now); this.saber.weaponTime = 150;
    if (this.playTorso) { this.playTorso('BOTH_SABERTHROW1STOP', { parts: 'torso', blendMs: 80, speed: 2 }); this.saber.torsoTimer = 650; } // catch: arm comes back to the stance (SP throw anims)
  }
  // ---------- state transitions (reactions)
  push(dirXZ, speed, up = 4.5, opts = {}) { // knocked away (JO: HANDEXTEND_KNOCKDOWN)
    if (this.spawnShield > this.now) return;
    if (this.status === 'dead') { this.vel[0] = dirXZ[0] * speed * 0.6; this.vel[2] = dirXZ[2] * speed * 0.6; return; }
    interruptDuelMotion(this); this.endForce(); this.cancelAttackState();
    this.status = 'flung'; this.statusT = 0; this.vel = [dirXZ[0] * speed, up, dirXZ[2] * speed]; this.onGround = false; this.ducked = false; this.knockAt = this.now; this.quickerGetup = !!opts.quicker;
    this.pullLand = false; this.pullHang = null; // knocked away out of a pull: they fly the whole way
    this.bounced = false; this.hitWall = false;
    const anim = opts.anim || ['BOTH_KNOCKDOWN1', 'BOTH_KNOCKDOWN2', 'BOTH_KNOCKDOWN4', 'BOTH_KNOCKDOWN5'][Math.floor(Math.random() * 4)];
    this.faceYaw = Math.atan2(-dirXZ[0], -dirXZ[2]) + Math.PI; // face the pusher (so they fall backward)
    if (!opts.keepYaw) this.yaw = Math.atan2(-dirXZ[0], -dirXZ[2]);
    this.statusAnim = anim; this.playWhole(anim, { blend: 0.06 });
  }
  // w_force.c getup animations after HANDEXTEND_KNOCKDOWN: holding jump (Force Jump above level 1) springs up with a Force
  // getup (800 ms); a Force-pushed fighter gets the quicker getup (600 ms); otherwise the normal getup (1000 ms).
  // The player's timing is Atom X Eve's responsive tuning: Space rises at once (else after 0.5 s), getup capped at 250 ms.
  startGetup() {
    const jump = this.isPlayer ? !!this.cmd.jump : (!!this.force && Math.random() < 0.5);
    const [anim, len] = jump && (this.isPlayer ? this.jumpLevel > 1 : true) ? ['BOTH_FORCE_GETUP_B1', 0.8] : this.quickerGetup ? ['BOTH_FORCE_GETUP_B3', 0.6] : ['BOTH_GETUP1', 1.0];
    this.status = 'getup'; this.statusT = 0; this.quickerGetup = false; this.playWhole(anim, { blend: 0.06 }); this.getupLen = this.isPlayer ? Math.min(len, 0.25) : len; // the player: Space rises at once (or after 0.5 s) with a quick 250 ms getup
    if (jump && anim === 'BOTH_FORCE_GETUP_B1') this.g.sfxAt && this.g.sfxAt('jump', this.pos, 0.6);
  }
  // dragged toward the caster. o.to: fly (ballistic, gravity G) to that point; o.power < 1 falls short (a partly answered pull)
  pullTo(dirXZ, speed, o = {}) {
    if (this.spawnShield > this.now) return; if (this.status === 'levitated') this.levitate(false, { quiet: true });
    interruptDuelMotion(this); this.endForce(); this.cancelAttackState(); this.status = 'flung'; this.statusT = 0; this.onGround = false; this.ducked = false; this.knockAt = this.now; this.quickerGetup = false;
    if (o.to) {
      const d = [o.to[0] - this.pos[0], o.to[1] - this.pos[1], o.to[2] - this.pos[2]], L = Math.hypot(d[0], d[2]) || 0.01, tau = clamp(Math.hypot(...d) / 15, 0.28, 0.65), k = clamp(o.power ?? 1, 0.2, 1);
      this.vel = [d[0] / tau * k, d[1] / tau + 0.5 * G * tau, d[2] / tau * k]; dirXZ = [d[0] / L, 0, d[2] / L]; this.pullLand = true; // stop where they land
      this.pullHang = d[1] > 0.6 && k > 0.95 ? { at: this.now + tau, until: this.now + tau + PULL_HANG } : null; // pulled up into the air: they stop in front of the caster
    } else { this.vel = [dirXZ[0] * speed, 3.2, dirXZ[2] * speed]; this.pullHang = null; }
    this.yaw = Math.atan2(-dirXZ[0], -dirXZ[2]); this.statusAnim = 'BOTH_KNOCKDOWN3'; this.playWhole('BOTH_KNOCKDOWN3', { blend: 0.06 });
  }
  // Force Levitate (the victim's side): float up and turn slowly, unable to act, until `until` or any hit (hurt) drops them
  levitate(on, o = {}) {
    if (on) {
      if (this.status === 'dead' || this.spawnShield > this.now || this.status === 'levitated') return false;
      // Successful control starts a seven-second diminishing-return window.
      // Fresh targets: 50% hit. Recently levitated: 80% resistance (20% hit).
      // The target rolls once, including on the receiving client in multiplayer.
      const chance = (this.levitateResistUntil || 0) > this.now ? 0.20 : 0.50;
      if (Math.random() >= chance) return false;
      this.levitateResistUntil = this.now + 7;
      this.endForce(); this.cancelAttackState(); if (this.force && this.force.interrupt) this.force.interrupt();
      this.status = 'levitated'; this.statusT = 0; this.onGround = false; this.ducked = false; this.shoveV = [0, 0, 0]; this.vel = [0, 0, 0];
      this.levFrom = o.from || null; this.levUntil = this.now + (o.duration ?? 3.5); this.levBase = this.g.world.floorAt(this.pos[0], this.pos[2], this.pos[1] + 0.6) ?? this.pos[1];
      if (o.from) this.markAttacker(o.from);
      this.playWhole('BOTH_FORCEINAIR1', { loop: true, blend: 0.15 });
      return true;
    }
    if (this.status !== 'levitated') return;
    this.status = 'flung'; this.statusT = 0; this.vel = [0, -0.5, 0]; this.knockAt = this.now; this.quickerGetup = true; this.levFrom = null; // drop: fall, land, get up
    this.statusAnim = 'BOTH_KNOCKDOWN1'; this.playWhole('BOTH_KNOCKDOWN1', { blend: 0.1 });
    if (!o.quiet && this.g.onLevitateEnd) this.g.onLevitateEnd(this, o);
  }
  shove(dirXZ, speed) { // weak push: slide along the ground, keep control (separate from the knock-down fling)
    if (this.status === 'dead') return; const k = Math.min(9, speed); this.shoveV[0] += dirXZ[0] * k; this.shoveV[2] += dirXZ[2] * k;
    const l = Math.hypot(this.shoveV[0], this.shoveV[2]); if (l > 10) { this.shoveV[0] *= 10 / l; this.shoveV[2] *= 10 / l; }
  }
  stagger(dirXZ, speed) { // a push that was not stopped but did not knock the target over: breaks the swing, short flinch, slides back
    if (this.status !== 'normal') { this.shove(dirXZ, speed * 0.5); return; }
    interruptDuelMotion(this); this.endForce(); this.cancelAttackState(); this.shove(dirXZ, speed); this.ducked = false;
    const a = 'BOTH_PAIN' + (1 + Math.floor(Math.random() * 4)); const info = this.actor.skel.anims[a]; if (info) { this.actor.setBoth(a, { blend: 0.05, restart: true, loop: false }); const L = Math.min(0.55, animLen(info)); this.legsLockUntil = this.now + L; this.forceUntil = this.now + L; this.forceHold = false; }
  }
  electrify(sec) { this.elecUntil = Math.max(this.elecUntil, this.now + sec); }
  pinToWall(pos, attacker, seconds = 1.4) {
    if (this.remote || this.isRancorBoss || this.status === 'dead' ||
        this.status === 'executed' || !Array.isArray(pos) ||
        !pos.every(Number.isFinite)) return false;
    this.markAttacker?.(attacker);
    this.endForce(); this.cancelAttackState();
    this.status = 'pinned'; this.statusT = 0;
    this.wallPin = { pos: pos.slice(), until: this.now + seconds };
    this.pos = pos.slice();
    this.onGround = true;
    this.vel = [0, 0, 0]; this.shoveV = [0, 0, 0];
    this.playWhole('BOTH_CHOKE1', { blend: 0.12, loop: true });
    this.hurt(6, attacker, { noFlinch: true });
    return true;
  }
  grip(on, liftTo = 1.35, o = {}) {
    if (on) { if (this.status === 'dead' || this.spawnShield > this.now) return; this.endForce(); this.cancelAttackState(); this.status = 'gripped'; this.gripLift = liftTo; this.gripCarry = o.carry || null; this.statusT = 0; this.onGround = false; this.shoveV = [0, 0, 0]; this.playWhole('BOTH_CHOKE1', { loop: true, blend: 0.12 }); }
    else if (this.status === 'gripped') {
      this.gripCarry = null; this.gripCripple = this.now + 1.2;
      if (o.free) { this.status = 'normal'; this.vel = [0, 0, 0]; this.onGround = this.pos[1] < 0.05; this.actor.followLegs(); this.actor.torso.cur = null; this.airAnim = null; return; } // broke free: drop to the feet
      if (o.soft || this.pos[1] < 0.3) { this.status = 'normal'; this.pos[1] = 0; this.onGround = true; this.vel = [0, 0, 0]; const a = 'BOTH_PAIN2', info = this.actor.skel.anims[a]; this.actor.setBoth(a, { blend: 0.08, restart: true, loop: false }); const L = info ? animLen(info) : 0.5; this.legsLockUntil = this.forceUntil = this.now + L; this.forceHold = false; return; }
      this.status = 'flung'; this.statusT = 0; this.vel = [0, -1, 0]; this.statusAnim = 'BOTH_KNOCKDOWN1'; this.playWhole('BOTH_KNOCKDOWN1', { blend: 0.06 });
    }
  }
  shock(on) {
    if (on) { if (this.status === 'dead' || this.status === 'flung') return; if (this.status !== 'shocked') { this.endForce(); this.cancelAttackState(); this.status = 'shocked'; this.statusT = 0; this.nextPain = 0; this.onGround = true; } this.shockKeep = this.now + 0.15; }
  }
  cancelAttackState() { if (this.kata) this.endKata(true); this.saber.weaponTime = 0; this.saber.torsoTimer = 0; this.saber.blocked = null; if (this.thrown) this.catchSaber(); }
  // ---------- original Academy saber kata (both attack buttons)
  startKata(intent = this.cmd, { quiet = false } = {}) {
    const S = this.saber, F = this.force;
    if (this.kata || this.status !== 'normal' || !this.onGround || !this.hasSaber || S.holstered || this.thrown || this.tauntUntil > this.now || this.executing) return false;
    // OpenJK PM_CanDoKata / PM_SaberMoveOkayForKata: grounded, stationary, Ready or wind-up. A held chord waits for
    // committed strikes and other abilities; it must not cancel their animation/collision state to buy a kata.
    if (this.kicking || this.dodge || this.forceUntil > this.now || S.inFlight || (this.critStrike?.until > this.now)) return false;
    if (intent.fwd || intent.right || intent.jump || intent.up > 0 || (S.move !== S.I.LS_READY && !S.inStart(S.move))) return false;
    if (!F || F.fp < KATA_COST) { if (this.isPlayer && !quiet) F?.say?.('A saber kata needs ' + KATA_COST + ' Force'); return false; }
    const key = this.saberKit === 'dual' || this.saberKit === 'staff' ? this.saberKit : S.level, ka = KATA_ANIMS[key];
    const info = this.actor.skel.anims[ka], mv = S.I[ACADEMY_KATA_MOVES[key]];
    if (!info?.ja || !validAnimationClip(info, this.actor.skel.rigJson.rig.nFrames) ||
        (typeof key === 'string' && !S.animLevel) || mv == null) {
      if (this.isPlayer && !quiet) F.say?.('Original Academy kata animation unavailable');
      return false;
    }
    F.fp -= KATA_COST; this.endForce();
    this.kata = { rage: S.rageMul, hits: 1, anim: true, clip: ka, move: mv,
      kit: this.saberKit, key, jumped: false, started: this.now };
    this.actor.animSpeed = 1; this.jumpCharging = false;
    S.weaponTime = 0; S.torsoTimer = 0; S.blocked = null; this.vel[0] = this.vel[2] = 0;
    // Start on this input tick, as PM_CanDoKata/PM_SetSaberMove do. Deferring
    // until the next saber update left a blank ordinary-move frame first.
    S.setMove(mv, this.now, { restart: true, parts: 'both' });
    S.weaponTime = S.torsoTimer; S.state = 'firing'; S.attackStartedAt = this.now; S.active = true;
    this.prevMove = mv;
    this.g.sfxAt?.('rage', this.pos, 0.45);
    return true;
  }
  // The original clip owns the entire action, including its authored recovery.
  tickKata(dtMs) {
    const S = this.saber, K = this.kata;
    if (this.status !== 'normal' || S.holstered || S.move !== K.move || this.saberKit !== K.kit) return this.endKata(true);
    S.weaponTime = Math.max(0, S.weaponTime - dtMs); S.torsoTimer = Math.max(0, S.torsoTimer - dtMs);
    if (S.weaponTime > 0) return;
    this.endKata();
  }
  endKata(cut = false) {
    const S = this.saber, K = this.kata; if (!K) return; this.kata = null; S.rageMul = K.rage;
    if (this.actor.legs.name === K.clip) this.legsLockUntil = 0;
    if (this.airAnim === K.clip) this.airAnim = null;
    if (!cut) { S.setMove(S.I.LS_READY, this.now); S.weaponTime = 0; S.torsoTimer = 0; }
  }
  // who gets the credit if this fighter falls to their death: whoever last hurt, pushed, pulled or lifted them (10 s)
  markAttacker(from) { if (from && from !== this) { this.lastAttacker = from; this.lastAttackerAt = this.now; } }
  // below the map's kill height (a chasm, off a bridge, out of bounds): dead, credited to the last attacker
  fallDeath() {
    if (this.status === 'dead') return;
    if (this.g?.isInfinitePracticeFighter?.(this)) {
      this.revive(this.isPlayer ? this.g.playerSpawn : this.g.enemySpawn);
      this.g.hud?.msg?.('Returned to the practice arena');
      return;
    }
    const by = this.lastAttacker && this.now - (this.lastAttackerAt ?? -99) < 10 ? this.lastAttacker : null;
    this.spawnShield = 0; this.fellOut = true; this.hp = 0; this.die(by, { deathAnim: 'BOTH_FALLDEATH1INAIR' }); this.vel = [0, 0, 0];
  }
  // no damage while dead, shielded after a respawn, or being executed (the execution itself finishes the victim)
  hurt(dmg, from, opts = {}) {
    if (this.status === 'dead' || this.hp <= 0 || this.spawnShield > this.now || this.status === 'executed') return false; this.markAttacker(from); if (this.status === 'levitated' && dmg > 0) this.levitate(false, { hit: true }); dmg *= this.takeMul * ((this.ctfShieldUntil || 0) > this.now ? (this.ctfShieldDamageMul ?? 1) : 1); if (from && from !== this && this.g.creditDamage) this.g.creditDamage(from, Math.min(dmg, this.hp)); this.hp = this.g?.isInfinitePracticeFighter?.(this) ? this.maxHp : this.hp - dmg; this.lastHurt = this.now; this.dmgFlash = 1; this.flash = 0.25; if (this.force && this.force.onHurt) this.force.onHurt(dmg); // spawnShield: respawn protection
    if (this.hp <= 0) { this.die(from, opts); return true; }
    if (!opts.noFlinch && this.status === 'normal' && this.now - (this.lastFlinch || -9) > 0.5 && !this.forceUntil && !(this.saber.isActiveSwing() && !this.isPlayer)) {
      interruptDuelMotion(this);
      this.lastFlinch = this.now;
      // Real local saber contact can choose a distinct existing pain clip.
      // No invented limb-bone animation or procedural deformation.
      const preferred = opts.experimentalImpactZone === 'leg' ? 'BOTH_PAIN5' :
        opts.experimentalImpactZone === 'torso' ? 'BOTH_PAIN2' : null;
      const a = preferred && this.actor?.skel?.anims?.[preferred] ?
        preferred : PAINS[Math.floor(Math.random() * PAINS.length)];
      const info = this.actor.skel.anims[a]; if (this.isPlayer) this.actor.setTorso(a, { blend: 0.05, restart: true, loop: false }), this.forceUntil = this.now + animLen(info), this.forceHold = false; else { this.actor.setBoth(a, { blend: 0.05, restart: true, loop: false }); this.legsLockUntil = this.now + animLen(info); this.forceUntil = this.now + animLen(info); this.forceHold = false; }
    }
    return false;
  }
  die(from, opts = {}) {
    if (this.g?.isInfinitePracticeFighter?.(this)) {
      // Includes scripted instant-kill paths, not just ordinary saber damage.
      // Preserve ordinary hit reactions but never enter the defeated state.
      this.hp = this.maxHp;
      if (this.status === 'executed' || this.status === 'executing') this.revive();
      return;
    }
    if (this.force && this.force.releaseAll) this.force.releaseAll(true);
    this.wallTraversal = null; this.wallPoseUntil = 0; this.wallKickUntil = 0; this.wallSlowFall = false; this.jumpCharging = false;
    this.hp = 0; this.killedBy = from || null; this.hiltPose = null; this.dodge = null; this.g.foesGen = (this.g.foesGen | 0) + 1; this.endForce(); this.cancelAttackState(); const wasFlung = this.status === 'flung'; this.status = 'dead'; this.statusT = 0; this.deadAt = this.now; if (!this.saber.holstered) { this.saber.holstered = true; this.blade.set(false); this.g.humStop && this.g.humStop(this); }
    if (!wasFlung) this.playWhole(opts.deathAnim || DEATHS[Math.floor(Math.random() * DEATHS.length)], { blend: 0.08 }); else this.playWhole('BOTH_KNOCKDOWN1', { blend: 0.05 });
    this.g.onDeath && this.g.onDeath(this);
  }
  tauntSide() { return this.side === 'dark' || this.team === 'enemy' || this.team === 'red' ? 'dark' : 'light'; }
  taunt() {
    if (this.status !== 'normal' || !this.onGround || this.thrown || this.saber.isActiveSwing() || this.forceUntil > this.now || this.now < (this.tauntUntil ?? -9) + TAUNT_COOLDOWN) return false;
    const side = this.tauntSide(), list = TAUNTS[side], n = this.tauntN = ((this.tauntN ?? -1) + 1) % list.length;
    const len = Math.min(2.4, this.playWhole(list[n], { blend: 0.12 })); this.legsLockUntil = this.tauntUntil = this.now + len; this.vel[0] = this.vel[2] = 0;
    if (this.g.onTaunt) this.g.onTaunt(this, side, n);
    return true;
  }
  endTaunt() { this.tauntUntil = 0; this.legsLockUntil = 0; this.actor.followLegs(); this.actor.torso.cur = null; }
  // Force Pulse: burned away (a defeat credited to the caster; the body fades out in Game.drawFighter)
  vaporize(from) {
    if (this.g?.isInfinitePracticeFighter?.(this)) {
      this.hp = this.maxHp; this.flash = Math.max(this.flash, 0.25);
      return;
    }
    if (this.status === 'dead' || this.spawnShield > this.now) return;
    this.markAttacker(from); this.vaporized = this.now; this.hp = 0; if (this.status !== 'normal') this.status = 'normal';
    this.die(from, { deathAnim: 'BOTH_DEATH1' }); if (this.g.onVaporize) this.g.onVaporize(this);
  }
  // another player's game executes this fighter (RPC on their puppet of us): run our side of the same execution
  executedBy(att, kind, o = {}) { if (this.g.startExecution) this.g.startExecution(att, this, kind, { ...o, fromNet: true }); }
  revive(at) {
    this.wallTraversal = null; this.wallCooldown = 0; this.wallPoseUntil = 0; this.wallKickUntil = 0; this.wallSlowFall = false;
    this.jumpCharging = false; this.fjUsed = false; this.airAnim = null; this.jumpAt = -1; this.fjStart = -1; this.nativeRoll = false; this.rollAnim = null; this.rollCrossQueued = false;
    this.g.foesGen = (this.g.foesGen | 0) + 1; this.hiltPose = null; this.dodge = null; this.wallPin = null; this.ghosts = []; this.kicking = null; this.critUntil = 0; this.critAt = 0; this.experimentalCounterUntil = 0; this.experimentalBindReadyAt = 0; this.experimentalCombo = null; this.experimentalComboResponse = null; this.experimentalAdaptiveResponse = null; this.experimentalAdaptiveReadyAt = 0; this.experimentalExchangeChain = null; this.experimentalExchangeRecoveryUntil = 0; this.experimentalExchangeRecoveryTarget = null; this.experimentalExchangeRecoveryKind = null; this.experimentalExchangeRiposte = null; this.experimentalDuelSight = null; this.experimentalDuelSearch = null; this.experimentalDuelLostAt = null; this.experimentalHadDuelSight = false; this.experimentalTacticalCue = null; this.experimentalTacticalReadyAt = 0; this.experimentalSwingReceipt = null; this.experimentalRecovery = null; this.experimentalRecoveryReadyAt = 0; this.experimentalInjury = null; this.experimentalInjuryReadyAt = 0; this.experimentalWeaponSetback = null; this.experimentalDuelSupportUntil = 0; this.experimentalMotionState = null; this.experimentalSurgeResponse = null; this.experimentalFlowUntil = 0; this.experimentalFlankRead = null; this.critStrike = null; this.counterCutUntil = 0; this.counterCutTarget = null; this.thrustDrive = null; this.thrustStab = null; this.openUntil = 0; this.vaporized = 0; this.tauntUntil = 0; this.fellOut = false; this.lastAttacker = null; this.pullLand = false; this.pullHang = null; this.kata = null; this.landAnim = null; this.cut = null; this.actor.frozen = false; this.executor = null; this.executing = null; this.hp = this.maxHp; this.status = 'normal'; this.vel = [0, 0, 0]; this.shoveV = [0, 0, 0]; this.elecUntil = 0; this.gripCarry = null; this.gripCripple = -9; this.counterUntil = 0; this.forceUntil = 0; this.legsLockUntil = 0; this.thrown = null; this.saber.inFlight = false; this._prev = null; this._prevCap = null; this.hitSet.clear(); this.hitMove = -1; this.speedMul = this.damageMul = this.takeMul = 1; this.ctfShieldUntil = 0; this.ctfShieldDamageMul = 1; this.ctfShieldCooldownUntil = 0; this.glow = 0; this.pos = (at || this.spawn).slice(); this.alpha = 1; this.cmd = emptyCmd(); this.actor.setBoth('BOTH_STAND1', { blend: 0 }); this.actor.followLegs(); this.onGround = true; this.ducked = false; }
  chest() { const y = this.status === 'down' || this.status === 'dead' ? 0.3 : this.ducked ? 0.75 : 1.15; return [this.pos[0], this.pos[1] + y, this.pos[2]]; }
  headPos() { return this.actor.bonePos('cranium', [0, 0, 0]); }
  // ---------- per-frame update
  update(dt) {
    const now = this.now; const a = this.actor;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= now) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    this.statusT += dt; this.flash = Math.max(0, this.flash - dt); this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2.5); this.distracted = Math.max(0, this.distracted - dt);
    if (!this.remote && this.status !== 'dead' && this.pos[1] < (this.g.world?.killY ?? -Infinity)) this.fallDeath();
    // Reactions and death bypass normalUpdate; release traversal here too.
    if (this.status !== 'normal') {
      this.wallTraversal = null; this.wallPoseUntil = 0; this.wallKickUntil = 0; this.wallSlowFall = false;
      this.jumpCharging = false;
    }
    switch (this.status) {
      case 'dead': { // a body killed in the air falls to the floor
        const fl = this.g.world.floorAt(this.pos[0], this.pos[2], this.pos[1] + 0.3);
        if (fl !== null && this.pos[1] > fl + 0.01) { this.vel[1] -= G * dt; this.pos[1] = Math.max(fl, this.pos[1] + this.vel[1] * dt); } else if (fl !== null) { this.pos[1] = fl; this.vel[1] = 0; }
        else if (this.pos[1] > (this.g.world.killY ?? -20) - 40) { this.vel[1] -= G * dt; this.pos[1] += this.vel[1] * dt; } // nothing below (a chasm): keep falling out of sight
        if (this.landAnim && fl !== null && this.pos[1] <= fl + 0.01) { this.playWhole(this.landAnim, { blend: 0.08 }); this.landAnim = null; } // e.g. a body dropped from a grip lands
        this.frictionMove(dt, 6); this.updateAnimOnly(dt); return this.finish(dt);
      }
      case 'executing': case 'executed': return this.finish(dt); // an execution moves and animates both (executions.js)
      case 'clash': this.vel[0] = this.vel[2] = 0; return this.finish(dt); // locked in a Force clash (clash.js)
      case 'pinned': {
        // Keep the target at the collision-confirmed surface; release into
        // a regular knockdown, never a permanent stun or through-wall pose.
        if (this.wallPin && now < this.wallPin.until) {
          this.pos = this.wallPin.pos.slice();
          this.vel = [0, 0, 0];
          return this.finish(dt);
        }
        this.wallPin = null; this.status = 'down'; this.statusT = 0;
        this.downTime = 0.9; this.playWhole('BOTH_KNOCKDOWN1', { blend: 0.12 });
        return this.finish(dt);
      }
      case 'open': this.frictionMove(dt, 8); if (this.now >= this.openUntil) { this.status = 'normal'; this.statusT = 0; this.actor.followLegs(); this.actor.torso.cur = null; } return this.finish(dt); // parried open (the Counter)
      case 'flung': this.physicsFlung(dt); return this.finish(dt);
      case 'down': this.frictionMove(dt, 8); if ((this.isPlayer && this.cmd.jumpPressed) || this.statusT >= (this.isPlayer ? 0.5 : (this.downTime || 1.1))) this.startGetup(); return this.finish(dt);
      case 'getup': this.frictionMove(dt, 8); if ((this.isPlayer && this.cmd.jumpPressed) || this.statusT >= this.getupLen - 0.05) { this.status = 'normal'; this.actor.followLegs(); this.actor.torso.cur = null; this.actor.setLegs(this.saber.holstered ? 'BOTH_STAND1' : 'BOTH_STAND2', { blend: 0.15 }); } return this.finish(dt);
      case 'levitated': { // float LEVITATE_HEIGHT above the floor, turning slowly; drop when the time is up
        const ty = this.levBase + LEVITATE_HEIGHT + Math.sin(now * 2.3) * 0.08; this.pos[1] += (ty - this.pos[1]) * Math.min(1, dt * 2.6); this.vel[0] = this.vel[2] = 0;
        this.yaw += dt * 0.55; if (now >= this.levUntil) this.levitate(false, { expired: true }); return this.finish(dt);
      }
      case 'gripped': { const ty = this.gripLift ?? 1.3; this.pos[1] += (ty - this.pos[1]) * Math.min(1, dt * 4); this.vel[0] = this.vel[2] = 0; if (this.gripCarry) { const c = this.gripCarry(); const k = Math.min(1, dt * 3); this.pos[0] += (c[0] - this.pos[0]) * k; this.pos[2] += (c[2] - this.pos[2]) * k; this.g.world.collide(this.pos, this.radius); } this.pos[1] += Math.sin(now * 3.1) * 0.0025; this.yaw += Math.sin(now * 2.2) * 0.004; return this.finish(dt); }
      case 'shocked': {
        this.frictionMove(dt, 10); this.nextPain -= dt; if (this.nextPain <= 0) { this.nextPain = 0.28 + Math.random() * 0.2; const p = PAINS[Math.floor(Math.random() * PAINS.length)]; this.playWhole(p, { blend: 0.04 }); }
        this.pos[0] += (Math.random() - 0.5) * 0.02; this.pos[2] += (Math.random() - 0.5) * 0.02; if (now > this.shockKeep) { this.status = 'normal'; this.actor.followLegs(); this.actor.torso.cur = null; } return this.finish(dt);
      }
      case 'roll': {
        if (this.nativeRoll) {
          if (this.thrown) this.updateThrown(dt);
          const remaining = Math.max(0, this.rollLen-this.statusT);
          // PM_WeaponLightsaber: only the final 250 ms of a FORWARD roll,
          // while attack is held. A released early click never queues a stab.
          if (this.rollAnim === 'BOTH_ROLL_F' && remaining <= ACADEMY_ROLL.stabWindow &&
              this.cmd.attack && !this.thrown && this.rollThrust()) return this.finish(dt);
          const speed = academyRollSpeed(this.rollAnim, remaining);
          this.vel[0] = this.rollDir[0]*speed; this.vel[2] = this.rollDir[2]*speed;
          this.integrate(dt, true);
          const floor = this.g.world.floorAt(this.pos[0], this.pos[2], this.pos[1]+0.55);
          if (floor !== null && this.pos[1] <= floor && this.vel[1] <= 0) {
            this.pos[1] = floor; this.vel[1] = 0; this.onGround = true;
          } else if (floor === null || this.pos[1]-floor > 0.56) this.onGround = false;
          if (remaining <= 0) { this.status = 'normal'; this.nativeRoll = false; }
          return this.finish(dt);
        }
        // An attack with W held during a roll queues the rolling thrust: the roll is cut short (ROLL_THRUST_AT of the way
        // through) by Jedi Outcast's lunge stab (LS_A_LUNGE) driving forward at whoever is in front. A throw (right mouse)
        // stays available without cancelling the roll, and the thrown saber keeps flying while you tumble.
        if (this.isPlayer && this.cmd.attack && this.cmd.fwd > 0.3 && !this.thrown && !this.saber.holstered) this.rollCrossQueued = true;
        if (this.thrown) this.updateThrown(dt);
        const k = clamp(this.statusT / this.rollLen, 0, 1); const sp = lerp(6.8, 2.5, k); this.vel[0] = this.rollDir[0] * sp; this.vel[2] = this.rollDir[2] * sp; this.integrate(dt, false);
        const thrust = this.rollCrossQueued && !this.thrown && !this.saber.holstered;
        if (this.statusT >= this.rollLen - 0.02 || (thrust && k >= ROLL_THRUST_AT)) {
          this.status = 'normal'; this.vel[0] *= 0.3; this.vel[2] *= 0.3;
          if (thrust) this.rollThrust();
          this.rollCrossQueued = false;
        } return this.finish(dt); }
      default: break;
    }
    this.normalUpdate(dt); this.finish(dt);
  }
  updateAnimOnly(dt) { }
  frictionMove(dt, f) { const k = Math.max(0, 1 - f * dt); this.vel[0] *= k; this.vel[2] *= k; this.pos[0] += this.vel[0] * dt; this.pos[2] += this.vel[2] * dt; this.g.world.collide(this.pos, this.radius); }
  physicsFlung(dt) {
    if ((this.slamUntil ?? 0) > this.now) return this.finishFlung(dt); // pinned against the wall for a moment after a wall slam
    const H = this.pullHang; // pulled up: hangs in front of the caster for PULL_HANG s, then drops
    if (H && this.now >= H.at) { if (this.now < H.until) { this.vel = [0, 0, 0]; return this.finishFlung(dt); } this.pullHang = null; }
    this.vel[1] -= G * dt; this.pos[0] += this.vel[0] * dt; this.pos[1] += this.vel[1] * dt; this.pos[2] += this.vel[2] * dt;
    const before = [this.pos[0], this.pos[2]]; this.g.world.collide(this.pos, this.radius);
    if (before[0] !== this.pos[0] || before[1] !== this.pos[2]) {
      if (!this.hitWall) {
        this.hitWall = true;
        const n = v3.norm([this.pos[0] - before[0], 0, this.pos[2] - before[1]]), into = -(this.vel[0] * n[0] + this.vel[2] * n[2]); // speed into the wall
        if (into > WALL_SLAM_SPEED && this.g.onWallSlam) { this.g.onWallSlam(this, into, n); return this.finishFlung(dt); }
        this.hurt(8, null, { noFlinch: true }); this.g.fx.sparks([this.pos[0], this.pos[1] + 1, this.pos[2]], [0, 1, 0], 6, [0.8, 0.8, 1, 1]);
      }
      this.vel[0] *= -0.2; this.vel[2] *= -0.2;
    }
    this.finishFlung(dt);
  }
  finishFlung(dt) {
    const floor = this.g.world.floorAt(this.pos[0], this.pos[2], this.pos[1] + 0.3);
    if (floor !== null && this.pos[1] <= floor) { this.pos[1] = floor; if (this.pullLand && this.vel[1] <= 0) { this.pullLand = false; this.vel[0] *= 0.15; this.vel[2] *= 0.15; } if (this.vel[1] < -1.5 && !this.bounced) { this.bounced = true; this.vel[1] = 0; this.g.onThud && this.g.onThud(this); } this.vel[1] = 0; this.onGround = true; const k = Math.max(0, 1 - 4 * dt); this.vel[0] *= k; this.vel[2] *= k;
      if (this.statusT > 0.25 && Math.hypot(this.vel[0], this.vel[2]) < 1.2) { this.status = this.hp <= 0 ? 'dead' : 'down'; this.statusT = 0; this.bounced = false; this.hitWall = false; this.downTime = Math.max(0.3, 1.1 - (this.now - (this.knockAt ?? this.now))); } } // down until 1.1 s after the knockdown
  }
  integrate(dt, gravity = true) {
    if (gravity && !this.onGround) this.vel[1] -= G * dt * (this.wallSlowFall && this.status === 'normal' ? 0.5 : 1);
    this.pos[0] += this.vel[0] * dt; this.pos[2] += this.vel[2] * dt; this.pos[1] += this.vel[1] * dt;
    this.g.world.collide(this.pos, this.radius); this.g.separate && this.g.separate(this);
  }
  // ---------- normal locomotion
  normalUpdate(dt) {
    const c = this.cmd, a = this.actor, now = this.now, S = this.saber;
    if (this.kicking) this.tickKick();
    if (this.dodge) this.tickDodge();
    // facing
    const diff = wrapPi(this.targetYaw - this.yaw); const rate = this.isPlayer ? 60 : (this.forceUntil > now || S.weaponTime > 0 || !S.holstered || Math.hypot(this.vel[0], this.vel[2]) > 0.5) ? 14 : 5; this.yaw += clamp(diff, -rate * dt, rate * dt);
    const frozen = this.status === 'whole';
    const busyForce = this.forceUntil > now && this.forceHold === 'freeze';
    // crouch / roll
    const wantDuck = !this.kata && c.crouch && this.onGround;
    if (c.crouchPressed && this.onGround && (c.fwd || c.right) && !c.walk && !this.ducked && !(S.isActiveSwing() && S.weaponTime > 0 && !this.isPlayer) && this.canRoll()) { if (this.startRoll()) return; }
    if (wantDuck !== this.ducked && this.onGround) { this.ducked = wantDuck; }
    // jumping
    if (this.tauntUntil > now && (c.fwd || c.right || c.attack || c.jumpPressed || c.crouchPressed)) this.endTaunt(); // any action cuts a taunt short
    const special = this.specialLocked();
    if (this.trySpecialJumpAttack()) { c.jumpPressed = false; }
    // Original Outcast jump launch/animation speed, now with hold-to-continue:
    // release Space to cut the ascent immediately and transition to falling.
    // No artificial 2-second climb and no slow-motion animation playback.
    if (this.isPlayer) {
      if (c.jumpPressed && this.onGround && !this.ducked && !frozen && !special) {
        // Native wall jumps take precedence over an ordinary grounded jump.
        if (!this.updateWallTraversal(0, busyForce)) {
          this.startJump();
          this.jumpCharging = true;
        }
      }
      if (this.jumpCharging && !this.onGround) {
        if (!c.jump || frozen || special || this.status !== 'normal') {
          this.jumpCharging = false;
          if (this.vel[1] > 0) this.vel[1] = 0;
          this.airAnim = this.fjUsed ? 'BOTH_FORCEINAIR1' : 'BOTH_INAIR1';
          this.actor.setLegs(this.airAnim, { blend: 0.08, loop: true });
        } else if (!this.fjUsed && this.canForceJump() && this.now - this.jumpAt >= 0.05 && this.vel[1] > 0.5) {
          this.startForceJump(); // original Force Jump velocity and playback rate
        } else if (this.vel[1] <= 0) {
          this.jumpCharging = false; // natural apex, don't float
        }
      }
    } else if (c.jumpPressed && this.onGround && !this.ducked && !frozen && !special) {
      this.startJump();
    }
    // wish velocity
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw); const fwd = [sinY, 0, cosY], right = [-cosY, 0, sinY];
    let f = special ? 0 : c.fwd, r = special ? 0 : c.right; const l = Math.hypot(f, r); if (l > 1) { f /= l; r /= l; }
    if (!this.isPlayer && !this.remote && this.g.experimentalCombatActive?.()) {
      const eased = smoothDuelMotion(this, f, r, dt);
      if (!special) { f = eased.fwd; r = eased.right; }
    }
    const crouched = this.ducked; const base = crouched ? 2.1 : c.walk ? 2.4 : 5.6; let sp = base * this.speedMul * (f < 0 ? 0.82 : 1);
    if (frozen || (this.forceUntil > now && this.forceHold === 'freeze') || (this.status === 'normal' && S.move === S.I.LS_PUTAWAY) || this.tauntUntil > now) sp *= 0.0;
    if (this.kata) {
      const K = this.kata; r = 0;
      const motion = academyKataMotion(K.clip, Math.max(0, (this.legsLockUntil - now) * 1000));
      f = motion.forward; sp = ACADEMY_KATA_SPEED * this.speedMul;
      if (motion.jump && !K.jumped && this.onGround) {
        K.jumped = true; this.vel[1] = motion.jump; this.onGround = false; this.airAnim = K.clip;
        this.g.sfxAt?.('jump', this.pos, 0.5);
      }
    }
    if (this.thrustDrive) { if (now < this.thrustDrive.until && S.move === S.I.LS_A_LUNGE) { f = 1; r = 0; sp = this.thrustDrive.v; } else this.thrustDrive = null; } // the rolling thrust closes in
    if (this.kicking || this.dodge) sp = 0;
    // The stolen flag has a fixed 10% controllable movement penalty, including
    // during Force Speed, kata movement and lunges. It never changes Force.fp,
    // cooldowns or any other mode's speed multipliers.
    if (this.ctfCarrierFlag) sp *= CTF_CARRIER_SPEED_SCALE;
    if (this.elecUntil > now) sp *= 0.72;                              // lightning slows the victim (they keep control)
    // Grounded, non-attacking wounded Jedi lose pursuit speed, but authored
    // lunge, jump, Force, saber collision and critical animations are intact.
    if (!this.kata && !this.thrustDrive && !this.dodge &&
        !S.isActiveSwing() && S.weaponTime <= 0)
      sp *= injuryMovementScale(this, now);
    const wish = [(fwd[0] * f + right[0] * r) * sp, (fwd[2] * f + right[2] * r) * sp];
    // Real geometry must remain in range at two body heights. Only local,
    // controllable players traverse; AI combat and all legacy saber motions
    // retain their ordinary grounded/airborne state machines.
    const wallMotion = this.updateWallTraversal(dt, special || frozen || busyForce);
    if (this.onGround) {
      const tv = wish, acc = (f || r) ? 48 : 36; const dx = tv[0] - this.vel[0], dz = tv[1] - this.vel[2], dl = Math.hypot(dx, dz), st = acc * dt;
      if (dl <= st) { this.vel[0] = tv[0]; this.vel[2] = tv[1]; } else { this.vel[0] += dx / dl * st; this.vel[2] += dz / dl * st; }
      this.vel[1] = 0;
    } else if (!special && !wallMotion && now >= (this.wallKickUntil || 0)) { const air = 7 * dt; this.vel[0] += (wish[0] - this.vel[0]) * Math.min(1, air * 0.35); this.vel[2] += (wish[1] - this.vel[1 + 1]) * Math.min(1, air * 0.35); } // authored launches retain their exit velocity before steering resumes
    const wasGround = this.onGround; const preVy = this.vel[1];
    this.integrate(dt, true);
    if (this.shoveV[0] || this.shoveV[2]) { // slide from a weak / partly blocked push
      this.pos[0] += this.shoveV[0] * dt; this.pos[2] += this.shoveV[2] * dt; const k = Math.max(0, 1 - 5.5 * dt); this.shoveV[0] *= k; this.shoveV[2] *= k;
      if (Math.hypot(this.shoveV[0], this.shoveV[2]) < 0.15) this.shoveV[0] = this.shoveV[2] = 0; this.g.world.collide(this.pos, this.radius); this.g.separate && this.g.separate(this);
    }
    if (this.elecUntil > now) { this.elecTick -= dt; if (this.elecTick <= 0) { this.elecTick = 0.16 + Math.random() * 0.2; this.g.onElecTick && this.g.onElecTick(this); } }
    const floor = this.g.world.floorAt(this.pos[0], this.pos[2], this.pos[1] + 0.55);
    if (wasGround && this.onGround && floor !== null && floor >= this.pos[1] - 0.55 && floor <= this.pos[1] + 0.55) {
      this.pos[1] = floor; // walk up shallow imported BSP steps and ramps
    } else if (!this.onGround && floor !== null && this.pos[1] <= floor && this.vel[1] <= 0) {
      this.pos[1] = floor; this.land(-this.vel[1]); this.vel[1] = 0; this.onGround = true;
    } else if (this.onGround && (floor === null || Math.abs(this.pos[1] - floor) > 0.56)) this.onGround = false;
    this.selectLegs(dt, f, r);
    this.updateSaber(dt);
  }
  updateWallTraversal(dt, blocked) {
    const now = this.now, c = this.cmd;
    if (!this.isPlayer || this.remote || this.g.input?.enabled === false || this.status !== 'normal' ||
        this.dodge || this.kata || this.kicking || this.thrown || blocked) {
      if (this.wallTraversal) this.wallPoseUntil = 0;
      this.wallTraversal = null; this.wallSlowFall = false;
      return false;
    }
    let run = this.wallTraversal;
    // Ordinary locomotion does not need any wall rays. Only a deliberate
    // press can enter, and only an active run needs continuous contact.
    if (!run && (now < this.wallCooldown || !c.jumpPressed || this.jumpLevel < 2 || !this.canForceJump())) return false;
    const contact = findWallForTraversal(this.g.world?.space, this.pos, this.yaw, c, run);
    const elapsed = run ? now-run.started : 0;
    if (run && (!contact || this.onGround ||
        elapsed >= run.duration - (run.mode === 'side' ? WALL_TRAVERSAL.releaseTail : 0))) {
      if (run.mode === 'up') this.kickOffWall(run);
      else {
        this.wallTraversal = null; this.wallCooldown = now + WALL_TRAVERSAL.cooldown;
        const an = chooseWallAnimation(this.actor.skel.anims, run.mode, run.side, 'stop');
        const duration = wallAnimationDuration(this.actor.skel.anims, an);
        // The stop clip overlaps the end of WALL_RUN. On natural expiration,
        // continue its final 500 ms; losing the wall plays the full stop.
        const startAt = contact ? Math.max(0, duration-WALL_TRAVERSAL.releaseTail) : 0;
        this.playWallAnimation(an, { startAt });
        this.wallPoseUntil = now + duration - startAt;
      }
      return run.mode === 'up';
    }
    if (run && c.jumpPressed && elapsed > (run.mode === 'up' ? 0.25 : WALL_TRAVERSAL.kickStart) &&
        elapsed < run.duration-WALL_TRAVERSAL.kickEnd) {
      this.kickOffWall(run);
      return true;
    }
    if (!run) {
      if (now < this.wallCooldown || !c.jumpPressed || !contact || this.jumpLevel < 2 || !this.canForceJump()) return false;
      if (contact.mode === 'up' && (this.jumpLevel < 3 || Math.hypot(this.vel[0],this.vel[2]) <= 5)) return false;
      const an = chooseWallAnimation(this.actor.skel.anims, contact.mode, contact.side);
      const duration = wallAnimationDuration(this.actor.skel.anims, an,
        contact.mode === 'up' ? WALL_TRAVERSAL.durationUp : WALL_TRAVERSAL.durationSide);
      run = this.wallTraversal = { ...contact, started: now, duration };
      // Air approaches use a fresh Space press too. Continuing a side run
      // from an air approach is an explicit browser control extension; the
      // native airborne directional action is a wall rebound.
      if (this.onGround) this.vel[1] = WALL_TRAVERSAL.launchVertical;
      this.force?.use(WALL_TRAVERSAL.forceCost); // SP WP_ForcePowerDrain(FP_LEVITATION, 0)
      this.onGround = false; this.jumpCharging = false; this.wallSlowFall = true;
      this.playWallAnimation(an);
      this.wallPoseUntil = now + duration;
      this.g.sfxAt?.('jump', this.pos, 0.25);
    }
    Object.assign(run, contact);
    if (run.mode === 'up') {
      // Don't climb through a ceiling. LevelSpace's head-height ray is the
      // equivalent of the native upward bounding-box clearance trace.
      const from = [this.pos[0],this.pos[1]+1.8,this.pos[2]];
      const to = [from[0],from[1]+0.8,from[2]];
      if (this.g.world.space.raycast(from,to) !== null || c.fwd <= 0) { this.kickOffWall(run); return true; }
      this.yaw = this.targetYaw = Math.atan2(-run.normal[0], -run.normal[1]);
      this.vel[0] = -run.normal[0]*WALL_TRAVERSAL.adhesion;
      this.vel[2] = -run.normal[1]*WALL_TRAVERSAL.adhesion;
      this.vel[1] = WALL_TRAVERSAL.upSpeed;
    } else {
      this.yaw = this.targetYaw = Math.atan2(run.tangent[0], run.tangent[1]);
      const speed = c.fwd > 0 ? WALL_TRAVERSAL.sideSpeed : c.fwd < 0 ? WALL_TRAVERSAL.backSpeed : WALL_TRAVERSAL.neutralSpeed;
      this.vel[0] = run.tangent[0]*speed-run.normal[0]*WALL_TRAVERSAL.adhesion;
      this.vel[2] = run.tangent[1]*speed-run.normal[1]*WALL_TRAVERSAL.adhesion;
      this.vel[1] = Math.min(WALL_TRAVERSAL.launchVertical, this.vel[1]);
    }
    return true;
  }
  playWallAnimation(an, options = {}) {
    this.airAnim = an;
    this.actor.setLegs(an, { restart: true, blend: 0.06, loop: false, ...options });
    if (this.saber.weaponTime <= 0 && this.forceUntil <= this.now) this.actor.followLegs();
  }
  kickOffWall(run) {
    const exit = wallKickVelocity(run, this.vel);
    this.vel[0] = exit[0]; this.vel[2] = exit[1];
    this.wallKickUntil = this.now + WALL_TRAVERSAL.kickSteerDelay;
    if (run.mode === 'up') this.vel[1] += WALL_TRAVERSAL.upKickVertical;
    const an = chooseWallAnimation(this.actor.skel.anims, run.mode, run.side, 'kick');
    this.playWallAnimation(an);
    this.wallPoseUntil = this.now + wallAnimationDuration(this.actor.skel.anims, an);
    this.wallTraversal = null; this.wallCooldown = this.now + WALL_TRAVERSAL.cooldown;
    this.jumpCharging = false;
    this.g.sfxAt?.('jump', this.pos, 0.25);
  }
  canRoll() {
    const S = this.saber;
    const remaining = this.legsLockUntil-this.now;
    // PM_CanRollFromSoulCal is the one authored attack cancel: 700–250 ms
    // before the staff kata ends, while grounded.
    if (this.kata?.clip === ACADEMY_KATAS.staff && remaining < 0.7 && remaining > 0.25) return true;
    return !this.kata && !S.inAttack(S.move) && !S.inStart(S.move) &&
      !S.inSpecial(S.move) && !this.kicking && !this.dodge && this.forceUntil <= this.now;
  }
  canForceJump() { return this.isPlayer ? this.g.force && this.g.force.canJump() : false; }
  startJump() {
    this.wallTraversal = null; this.wallPoseUntil = 0; this.wallKickUntil = 0; this.wallSlowFall = false;
    const c = this.cmd; this.vel[1] = 5.65; this.onGround = false; this.jumpAt = this.now; this.fjUsed = false;
    let an = 'BOTH_JUMP1'; if (c.fwd < 0) an = 'BOTH_JUMPBACK1'; else if (c.fwd === 0 && c.right > 0) an = 'BOTH_JUMPRIGHT1'; else if (c.fwd === 0 && c.right < 0) an = 'BOTH_JUMPLEFT1';
    this.airAnim = an; this.actor.setLegs(an, { restart: true, blend: 0.06, loop: false }); this.actor.followLegs(); if (!this.saber.holstered && !this.saber.isActiveSwing()) { }
    this.g.sfxAt && this.g.sfxAt('jump', this.pos, 0.0);
  }
  startForceJump(chargeLevel = this.jumpLevel) {
    const c = this.cmd; this.fjUsed = true; this.onGround = false; this.jumpAt = this.now; const h = FORCE_JUMP_HEIGHT[Math.min(this.jumpLevel, Math.max(1, chargeLevel))]; const v = Math.sqrt(2 * G * h); this.vel[1] = Math.max(this.vel[1], v);
    // JO: FORCEJUMP1/BACK/LEFT/RIGHT anim chosen by movement direction
    let an = 'BOTH_FORCEJUMP1'; if (c.fwd < 0) an = 'BOTH_FORCEJUMPBACK1'; else if (c.fwd === 0 && c.right > 0) an = 'BOTH_FORCEJUMPRIGHT1'; else if (c.fwd === 0 && c.right < 0) an = 'BOTH_FORCEJUMPLEFT1';
    this.airAnim = an; this.actor.setLegs(an, { restart: true, blend: 0.05, loop: false }); this.fjStart = this.now; this.g.onForceJump && this.g.onForceJump(this);
  }
  land(impact) { // bg_pmove.c PM_CrashLand: a short LAND1 (LANDBACK1 after a backwards jump), legs held for TIMER_LAND (130 ms)
    // No landing animation during a special saber move (BG_SaberInSpecial: the leap slash plays on to the ground) or while a
    // strike is in progress: swapping the legs mid-swing turns the pelvis and bends the blade off its line.
    const S = this.saber, keep = this.now < this.legsLockUntil || this.specialLocked() || this.swingLocked();
    if (!keep) { const air = this.airAnim || 'BOTH_JUMP1', an = /BACK/.test(air) ? 'BOTH_LANDBACK1' : 'BOTH_LAND1'; this.landUntil = this.now + 0.13; this.actor.setLegs(an, { restart: true, blend: 0.06, loop: false }); }
    else if (!S.holstered && S.inAttack(S.move)) this.landUntil = this.now + S.weaponTime / 1000; // legs hold their pose until the strike ends
    this.airAnim = null; this.fjUsed = false; this.wallTraversal = null; this.wallPoseUntil = 0; this.wallKickUntil = 0; this.wallSlowFall = false;
    this.g.onLand && this.g.onLand(this, impact);
  }
  startRoll() {
    if (!this.onGround || this.status !== 'normal' || !this.canRoll()) return false;
    const c = this.cmd, sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw); let an, d;
    if (c.fwd) { if (c.fwd < 0) { an = 'BOTH_ROLL_B'; d = [-sinY, 0, -cosY]; } else { an = 'BOTH_ROLL_F'; d = [sinY, 0, cosY]; } }
    else if (c.right > 0) { an = 'BOTH_ROLL_R'; d = [-cosY, 0, sinY]; } else { an = 'BOTH_ROLL_L'; d = [cosY, 0, -sinY]; }
    const native = this.hasNativeRollStab();
    const space = this.g.world.space;
    if (native && space) {
      // PM_TryRoll tests a crouched body 64 units ahead. Probe both sides
      // and the centre so a narrow door cannot admit only the centre ray.
      for (const side of [-this.radius,0,this.radius]) for (const height of [0.45,0.95]) {
        const from = [this.pos[0]+d[2]*side,this.pos[1]+height,this.pos[2]-d[0]*side];
        const to = [from[0]+d[0]*ACADEMY_ROLL.clearance,from[1],from[2]+d[2]*ACADEMY_ROLL.clearance];
        if (space.raycast(from,to) !== null) return false;
      }
    }
    if (this.kata) this.endKata(true);
    this.rollDir = d; this.rollAnim = an; this.nativeRoll = native;
    this.rollCrossQueued = false; this.status = 'roll'; this.statusT = 0; this.ducked = false; this.endForceKeepAnim(); this.cancelSwingForRoll();
    this.legsLockUntil = this.swingLegsUntil = this.landUntil = 0;
    this.jumpCharging = false; this.airAnim = null; this.wallTraversal = null; this.wallPoseUntil = this.wallKickUntil = 0; this.wallSlowFall = false;
    this.rollLen = animLen(this.actor.skel.anims[an]); this.actor.setBoth(an, { restart: true, blend: 0.08, loop: false }); this.g.sfxAt && this.g.sfxAt('jumpbuild', this.pos, 0.0);
    return true;
  }
  hasNativeRollStab() {
    const clip = this.actor.skel.anims.BOTH_ROLL_STAB;
    return !!clip?.ja && validAnimationClip(clip, this.actor.skel.rigJson.rig.nFrames);
  }
  // the rolling thrust: up out of the roll into the lunge stab, turned onto a foe in front (within ROLL_THRUST_REACH m and
  // about 40 degrees of the facing) and driving forward at them
  rollThrust() {
    if (this.hasNativeRollStab()) {
      const S = this.saber;
      if (this.status !== 'roll' || this.rollLen-this.statusT > ACADEMY_ROLL.stabWindow ||
          this.rollAnim !== 'BOTH_ROLL_F' || this.thrown || !this.hasSaber ||
          !this.force || this.force.fp < ACADEMY_ROLL.forceCost) return false;
      this.force.use(ACADEMY_ROLL.forceCost);
      if (S.holstered) this.igniteNow();
      this.status = 'normal'; this.nativeRoll = false; this.rollCrossQueued = false;
      this.targetYaw = this.yaw; // fixed facing, never auto-aim toward a target
      this.thrustStab = this.thrustDrive = null;
      S.weaponTime = 0; S.torsoTimer = 0;
      S.setMove(S.I.LS_ROLL_STAB, this.now, { restart: true, parts: 'both' });
      S.weaponTime = S.torsoTimer; S.state = 'firing'; S.attackStartedAt = this.now;
      this.prevMove = S.I.LS_ROLL_STAB;
      this.g.sfxAt?.('swing2', this.pos, 0.9);
      return true;
    }
    const S = this.saber, I = S.I, fwd = [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
    let foe = null, best = ROLL_THRUST_REACH;
    for (const f of this.g.foesOf ? this.g.foesOf(this) : []) {
      if (f.status === 'dead' || f.spawnShield > this.now) continue;
      const dx = f.pos[0] - this.pos[0], dz = f.pos[2] - this.pos[2], d = Math.hypot(dx, dz);
      if (d < best && d > 0.05 && (dx * fwd[0] + dz * fwd[2]) / d > 0.77 && Math.abs(f.pos[1] - this.pos[1]) < 1.5) { best = d; foe = f; }
    }
    if (foe) this.yaw = this.targetYaw = Math.atan2(foe.pos[0] - this.pos[0], foe.pos[2] - this.pos[2]);
    const stab = this.actor.skel.anims.BOTH_ROLL_STAB?.ja ? 'BOTH_ROLL_STAB' : S.M[I.LS_A_LUNGE].anim;
    S.weaponTime = 0; S.torsoTimer = 0; S.setMove(I.LS_A_LUNGE, this.now, { restart: true, parts: 'both', anim: stab }); S.weaponTime = S.torsoTimer; S.state = 'firing'; S.attackStartedAt = this.now;
    this.prevMove = I.LS_A_LUNGE; // its drive is set here (onMoveChanged would slow it to the standing lunge's)
    this.thrustStab = { t0: this.now }; // the blade straight out ahead (stabPose)
    // until the stab the thrust moves itself, whatever the keys say: just far enough to bring a foe in front onto its point
    // (already there: it holds its ground rather than running onto their guard; nobody in front: a full lunge)
    const v = foe ? clamp((best - ROLL_THRUST_STAB) / ROLL_THRUST_DRIVE, 0, 9) : 6; this.vel[0] = Math.sin(this.yaw) * v; this.vel[2] = Math.cos(this.yaw) * v;
    this.thrustDrive = { until: this.now + ROLL_THRUST_DRIVE, v };
    this.g.sfxAt?.('swing2', this.pos, 0.9); this.g.hud?.msg?.('Rolling thrust');
    return true;
  }
  endForceKeepAnim() { this.forceUntil = 0; }
  cancelSwingForRoll() { const S = this.saber; S.weaponTime = 0; S.torsoTimer = 0; S.move = S.I.LS_READY; }
  selectLegs(dt, f, r) {
    const a = this.actor, now = this.now, S = this.saber, out = !S.holstered; const speed = Math.hypot(this.vel[0], this.vel[2]);
    let twist = 0;
    if (this.kata?.anim && now < this.legsLockUntil) return; // the staff's authored hop must not become FORCEINAIR
    if (!this.onGround) {
      if (this.wallPoseUntil > 0 && now >= this.wallPoseUntil && !this.wallTraversal) {
        this.wallPoseUntil = 0; this.airAnim = 'BOTH_INAIR1';
        a.setLegs(this.airAnim, { blend: 0.1, loop: true });
      }
      if (this.airAnim && /^BOTH_FORCEJUMP/.test(this.airAnim)) { const info = a.skel.anims[this.airAnim]; if (now - this.fjStart > animLen(info) && this.vel[1] < 1) { this.airAnim = this.airAnim.replace('FORCEJUMP', 'FORCEINAIR'); a.setLegs(this.airAnim, { blend: 0.1, loop: true }); } }
      else if (!this.airAnim) { this.airAnim = 'BOTH_FORCEINAIR1'; a.setLegs(this.airAnim, { blend: 0.15, loop: true }); }
      return;
    }
    const moving = speed > 0.6 && (f || r);
    if (this.fidgetUntil > now && (moving || out || this.ducked || this.cmd.attack || this.cmd.jumpPressed || this.forceUntil > now)) this.cancelFidget();
    if (now < this.legsLockUntil || now < this.landUntil) return;
    if (now < (this.swingLegsUntil || 0) && !moving && !this.ducked) return; // a standing swing is playing on the legs too
    let an;
    const back = f < -0.25; // PMF_BACKWARDS_RUN (bg_pmove.c PM_Footsteps): backpedal cycles while moving backwards
    if (this.ducked) an = !moving ? 'BOTH_CROUCH1IDLE' : (back ? 'BOTH_CROUCH1WALKBACK' : 'BOTH_CROUCH1WALK');
    else if (!moving) { an = out ? 'BOTH_STAND2' : 'BOTH_STAND1'; }
    else { const run = !this.cmd.walk; an = back ? (run ? 'BOTH_RUNBACK1' : 'BOTH_WALKBACK1') : run ? (out ? 'BOTH_RUN2' : 'BOTH_RUN1') : 'BOTH_WALK1'; }
    if (out && !this.ducked) an = this.kitAnim(an); // dual sabers / saberstaff (Jedi Academy cycles)
    // Jedi Outcast has no strafe cycles: sideways and diagonal movement play run / walk with the legs turned toward the
    // direction of travel while the torso keeps facing the view (cg_players.c CG_G2PlayerAngles).
    const turning = this.swingLegs(dt, moving, an);
    if (!moving && !this.ducked && turning) an = out ? 'BOTH_TURNSTAND2' : 'BOTH_TURNSTAND1'; // step while the legs catch up with the view
    if (this.speedMul > 1.05 && /RUN|WALK|STRAFE/.test(an)) a.animSpeed = 1 + (this.speedMul - 1) * 0.55; else a.animSpeed = 1;
    if (this.status === 'normal' && this.airAnim) this.airAnim = null;
    a.setLegs(an, { blend: duelLegBlend(this, 0.14), loop: true });
    this.legYaw = 0; a.legYaw = 0; // the leg/torso split is done by the spine aim (Actor.spineYaw)
    if (!moving && !this.ducked && !out) { // holstered idle fidget
      this.idleSince += dt; if (this.idleSince > 9 && !this.forceUntil) { this.idleSince = 0; const len = this.playWhole('BOTH_STAND1IDLE1', {}); this.legsLockUntil = this.fidgetUntil = now + len; }
    } else this.idleSince = 0;
  }
  // legs yaw: toward the travel direction (at most 60 deg off the view; running backwards faces away from the motion).
  // Settled in a ready stance the legs only start turning once the view is 40 deg away; they swing at 300 deg/s
  // (x0.5 near, x2 far) and never trail the view by more than 90 deg. Returns true while they are still turning.
  swingLegs(dt, moving, an) {
    const view = this.yaw; let dest = view;
    if (moving && this.onGround) { let d = wrapPi(Math.atan2(this.vel[0], this.vel[2]) - view); if (Math.abs(d) > Math.PI / 2) d = wrapPi(d + Math.PI); dest = view + clamp(d, -LEG_TURN_MAX, LEG_TURN_MAX); }
    if (this.legsYaw == null) this.legsYaw = view;
    const S = this.saber, settled = !moving && an === (S.holstered ? 'BOTH_STAND1' : this.kitAnim('BOTH_STAND2')) && S.move === S.I.LS_READY && S.weaponTime <= 0 && this.forceUntil <= this.now;
    const sw = wrapPi(dest - this.legsYaw);
    if (!this.legsSwinging && (!settled || Math.abs(sw) > LEG_SWING_TOL)) this.legsSwinging = true;
    if (this.legsSwinging) { const nl = swingTo(0, sw, LEG_SWING_TOL, LEG_CLAMP, LEG_SWING_SPEED, dt); this.legsYaw = wrapPi(this.legsYaw + nl); if (Math.abs(nl - sw) < 1e-4) this.legsSwinging = false; }
    else if (Math.abs(sw) > LEG_CLAMP) this.legsYaw = wrapPi(dest - Math.sign(sw) * LEG_CLAMP);
    return this.legsSwinging && Math.abs(wrapPi(dest - this.legsYaw)) > 0.05;
  }
  updateSaber(dt) {
    const S = this.saber, now = this.now, a = this.actor;
    if (this.thrown) { this.updateThrown(dt); }
    const c = this.cmd;
    if (this.forceUntil > 0 && now >= this.forceUntil && !this.forceHold) { this.endForce(); }
    const busy = (this.forceUntil > now) || this.status === 'roll' || this.status === 'whole';
    const wallPose = !!this.wallTraversal || now < this.wallPoseUntil;
    // torso override / idle upkeep
    if (!S.holstered) {
      const cmdAttack = c.attack, move = S.move;
      const pos = this.ctxInfo();
      const floor = this.g.world?.floorAt?.(this.pos[0], this.pos[2], this.pos[1] + 0.3);
      const groundDist = floor == null ? Infinity : Math.max(0, this.pos[1] - floor);
      const canJumpAttack = !this.wallTraversal && !this.kata && !this.dodge && !this.kicking &&
        (this.force?.fp ?? 0) >= ACADEMY_JUMP_ATTACK.forceCost;
      // mouse travel since the wind-up began (the player's flick re-aims the swing until the strike starts)
      const gs = this.gesture ??= { dx: 0, dy: 0 }; if (S.inStart(S.move)) { gs.dx += c.mouseDX || 0; gs.dy += c.mouseDY || 0; } else gs.dx = gs.dy = 0;
      if (this.kata) this.tickKata(dt * 1000); else S.update(dt * 1000, { attack: cmdAttack && !this.thrown, alt: c.alt, aimPitch: c.aimPitch || 0, fwd: Math.sign(Math.round(c.fwd * 2) / 2), right: Math.sign(Math.round(c.right * 2) / 2), up: c.up, ducked: this.ducked, velZ: this.vel[1], groundDist, canJumpAttack, enemyFront: pos.front, enemyBehind: pos.behind, dualTargets: pos.dualTargets, busy, gesture: this.isPlayer ? gs : null, experimentalSector: this.isPlayer ? c.experimentalSector : null, airborne: !this.onGround }, now);
      if (S.move !== this.prevMove) { this.onMoveChanged(S.move); this.prevMove = S.move; }
      // idle torso: re-evaluate stance vs follow-legs each frame when nothing is playing
      if (S.move === S.I.LS_READY && S.torsoTimer <= 0 && !busy && !this.thrown && !wallPose) {
        const want = this.torsoIdle(S.stanceAnim()); if (want === a.legs.name) { if (!a.torsoFollow) { a.followLegs(); a.torso.cur = null; } } else if (!a.torso.cur || a.torsoFollow || a.torso.name !== want) a.setTorso(want, { blend: 0.12, loop: true });
      }
      if (S.moveLen > 0 && S.move !== S.I.LS_READY && S.torsoTimer <= 0 && S.weaponTime <= 0 && false) { }
    } else {
      S.update(dt * 1000, { attack: false, busy: true }, now);
      if (!busy && !this.thrown && S.move === S.I.LS_READY && !wallPose) {
        if (this.weaponPose) { if (a.torsoFollow || a.torso.name !== this.weaponPose) a.setTorso(this.weaponPose, { blend: 0.15, loop: true }); } // e.g. TORSO_WEAPONREADY2 holding the Bryar
        else if (!a.torsoFollow) { a.followLegs(); a.torso.cur = null; }
      }
    }
    // An idle stance must not replace the upper half of a wall run or flip.
    // Real saber attacks still own their torso layer, as in SETANIM_LEGS.
    if (wallPose && !busy && !this.thrown &&
        S.move === S.I.LS_READY && S.torsoTimer <= 0) a.followLegs();
    // special: moves that need whole-body physics
    const m = S.move; if (S.isActiveSwing() || S.inAttack(m)) { if (m === S.I.LS_A_LUNGE && this.statusT0 !== now) { } }
  }
  onMoveChanged(m) {
    const S = this.saber, I = S.I, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    if (m === I.LS_A_LUNGE && !/^BOTH_SPINATTACK[67]$/.test(S.moveAnim)) { this.vel[0] = sy * 3.75; this.vel[2] = cy * 3.75; }
    else if (m === I.LS_A_FLIP_STAB || m === I.LS_A_FLIP_SLASH || m === I.LS_A_JUMP_T__B_) {
      const strong = m === I.LS_A_JUMP_T__B_, motion = ACADEMY_JUMP_ATTACK;
      this.force?.use(motion.forceCost); // selection checked availability; charge once on the committed move
      const speed = strong ? motion.strongForwardSpeed : motion.mediumForwardSpeed;
      this.vel[0] = sy * speed; this.vel[2] = cy * speed;
      this.vel[1] = strong ? motion.strongUpSpeed : motion.mediumUpSpeed;
      this.onGround = false; this.airAnim = S.moveAnim;
      this.jumpCharging = false; this.wallTraversal = null;
      this.g.sfxAt('jump', this.pos, 0.5);
    }
  }
  trySpecialJumpAttack() {
    // Compatibility hook: the early-attack -> special conversion in Academy
    // PM_CheckJump is commented out in both SP and MP. Select at attack start
    // in SaberLogic instead, so a jump cannot erase an already committed hit.
    return false;
  }
  ctxInfo() { return this.g.combatContext ? this.g.combatContext(this) : { front: false, behind: false }; }
  finish(dt) {
    const a = this.actor; a.pos[0] = this.pos[0]; a.pos[1] = this.pos[1]; a.pos[2] = this.pos[2];
    const S = this.saber; a.matchPelvis = !S.holstered && S.move !== S.I.LS_READY && !a.torsoFollow; // a saber move on the torso over running / jumping legs keeps its authored hip turn
    this.aimTorso(dt);
    if (this.g.animLod?.(this) && (this.lodTick = !this.lodTick)) a.place(this.now); else a.update(this.now); // far away in a big match: the pose every other step
    this.updateHilt(dt);
  }
  // model faces the legs; the spine turns the torso to the view and pitches it by 75% of the view pitch (cg_players.c).
  // Switched off for knockdowns, rolls, whole-body moves and death, as in CG_G2ClientSpineAngles.
  aimTorso(dt) {
    const a = this.actor, free = this.status === 'normal' && this.now >= this.legsLockUntil &&
      !this.wallTraversal && this.now >= this.wallPoseUntil && this.legsYaw != null;
    if (!free) { this.legsYaw = this.yaw; this.legsSwinging = false; }
    a.yaw = free ? this.legsYaw : this.yaw; a.spineYaw = free ? wrapPi(this.yaw - this.legsYaw) : 0;
    const locked = this.swingLocked(); if (!locked) this.lockPitch = null; else if (this.lockPitch == null) this.lockPitch = this.torsoPitch || 0; // a committed strike keeps the pitch it started with
    const pitch = this.isPlayer ? (this.cmd.aimPitch || 0) : (this.aimPitch || 0), dest = !free ? 0 : locked ? this.lockPitch : clamp(pitch, -0.6, 1.3) * 0.75;
    this.torsoPitch = swingTo(this.torsoPitch || 0, dest, TORSO_PITCH_TOL, TORSO_PITCH_CLAMP, TORSO_PITCH_SPEED, dt); a.spinePitch = this.torsoPitch + this.groundStrikeBend(dt);
  }
  // The leap slash (BOTH_FORCELEAP2_T__B_) is a whole-body move, so the view pitch does not bend it; on its own the blade
  // stops ~0.6 m above the floor. Lean the spine into the downward strike (45-85% of the move) so it cuts into the ground.
  // An air slash (a downward attack begun off the ground), or a downward slash aimed at the floor, does the same: from
  // mid-strike (and while an air slash is held for the landing) the spine leans in until the blade tip sits just under the
  // feet, so it cuts into the floor. A slash that already reaches the floor gets no extra lean.
  groundStrikeBend(dt = 1 / 60) {
    const S = this.saber; if (S.holstered || this.kata?.anim || this.actor.skel.anims[S.moveAnim]?.ja) { this.airBend = 0; return 0; }
    if (S.move === S.I.LS_A_JUMP_T__B_ && S.moveLen > 0) {
      const p = (this.now - S.moveStart) * 1000 / S.moveLen, up = clamp((p - 0.45) / 0.23, 0, 1), down = clamp((p - 0.85) / 0.15, 0, 1);
      return 0.5 * up * up * (3 - 2 * up) * (1 - down);
    }
    const p = S.moveLen > 0 ? (this.now - S.moveStart) * 1000 / S.moveLen : 1, aimDown = (this.isPlayer ? this.cmd.aimPitch || 0 : this.aimPitch || 0) > 0.45; // aiming down: the slash is meant for the floor
    if ((S.airStrike || aimDown) && S.isDownSlash(S.move) && (p > 0.5 || S.airHold)) this.airBend = clamp((this.airBend || 0) + clamp(this.blade.tip[1] - this.pos[1] + 0.12, -0.3, 0.6) * 5 * dt, 0, 0.7);
    else this.airBend = (this.airBend || 0) * Math.exp(-8 * dt);
    return this.airBend;
  }
  // the second hilt and blade: a saberstaff continues the hilt end to end with the blade the other way (it spins along when
  // thrown); dual sabers hold the second one in the left hand (mirrored grip), on the left thigh when holstered
  updateHilt2(dt, M) {
    const A = this.g.attach, a = this.actor, L = A.hiltLen * (this.hiltScaleY || 1), M2 = this.hilt2Mat, B2 = this.blade2; let len = L;
    if (this.hiltPose && this.saberKit !== 'staff') { M2.set(M); M2[12] += M[0] * 0.05; M2[13] += M[1] * 0.05; M2[14] += M[2] * 0.05; } // both hilts together
    else if (this.saberKit === 'staff') m4.mul(M, m4.trs([0, 0, 0], FLIP_X, [1, 1, 1]), M2); // the second half of the staff runs from the hand the other way: held in the middle (Jedi Academy twoHanded staff)
    else if (this.hilt === 'thigh' || this.hilt === 'none') { m4.mul(a.boneMatrix('lfemurYZ'), m4.trs([-A.holster.t[0], A.holster.t[1], A.holster.t[2]], [A.holster.q[0], -A.holster.q[1], -A.holster.q[2], A.holster.q[3]], [1, 1, 1]), M2); len = A.hiltLen; }
    else { const g = A.grip; m4.mul(a.boneMatrix('lhand'), m4.trs([-g.t[0], g.t[1], g.t[2]], [g.q[0], -g.q[1], -g.q[2], g.q[3]], g.s), M2); len = A.hiltLen * (g.s?.[1] || 1); }
    const lit2 = this.blade.lit && !this.hiltPose; if (B2.lit !== lit2) B2.set(lit2); B2.color = this.blade.color; // turned on its owner: only the one blade
    B2.update(dt, M2, len, 1, this.now); B2.trailOn = this.blade.trailOn;
  }
  // the saberstaff without Jedi Academy's set, held one-handed at the middle (Darth Maul's way): it spins in the hand through
  // every attack and, between them, finishes on the next half turn (half a turn round, a staff looks the same)
  twirlStaff(dt, M) {
    let a = this.twirl || 0;
    if (this.swingActive()) a += STAFF_TWIRL * dt;
    else if (a) { const stop = Math.ceil(a / Math.PI - 1e-6) * Math.PI; a += STAFF_TWIRL * dt; if (a >= stop) a = 0; }
    this.twirl = a % (2 * Math.PI); if (this.twirl) m4.mul(M, m4.trs([0, 0, 0], Q.axisAngle([0, 0, 1], this.twirl), [1, 1, 1]), M);
  }
  // the rolling thrust's blade: Jedi Outcast's lunge sweeps it across low, so through the thrust it is turned to point
  // straight out ahead of the hand along the facing, a little upward (eased in and out of the grip's own angle)
  stabPose(M) {
    const T = this.thrustStab, t = this.now - T.t0, S = this.saber;
    if (t > ROLL_THRUST_STAB_S || S.move !== S.I.LS_A_LUNGE || this.status !== 'normal') { this.thrustStab = null; return; }
    const k = Math.min(1, t / 0.06, (ROLL_THRUST_STAB_S - t) / 0.08), d0 = [-M[4], -M[5], -M[6]]; // local -Y is the blade
    const want = v3.norm([Math.sin(this.yaw), 0.25, Math.cos(this.yaw)]), d = v3.norm(v3.lerp(d0, want, k));
    const Y = v3.scale(d, -1); let X = v3.cross([0, 1, 0], Y); X = v3.len(X) < 1e-3 ? [1, 0, 0] : v3.norm(X); const Z = v3.cross(X, Y);
    const sx = Math.hypot(M[0], M[1], M[2]), sy = Math.hypot(M[4], M[5], M[6]), sz = Math.hypot(M[8], M[9], M[10]); // the grip's own scale, kept
    M[0] = X[0] * sx; M[1] = X[1] * sx; M[2] = X[2] * sx; M[4] = Y[0] * sy; M[5] = Y[1] * sy; M[6] = Y[2] * sy; M[8] = Z[0] * sz; M[9] = Z[1] * sz; M[10] = Z[2] * sz;
  }
  updateHilt(dt) {
    const A = this.g.attach, a = this.actor; let M = this.hiltMat;
    if (this.hiltPose) { M.set(this.hiltPose); this.hiltScaleY = 1; } // posed by someone else (Mind Dominance turns it on its owner)
    else if (this.hilt === 'hand') { const bm = a.boneMatrix(A.grip.bone); const loc = m4.trs(A.grip.t, A.grip.q, A.grip.s); m4.mul(bm, loc, M); this.hiltScaleY = A.grip.s[1]; if (this.thrustStab) this.stabPose(M); }
    else if (this.hilt === 'thigh') { const bm = a.boneMatrix(A.holster.bone); const loc = m4.trs(A.holster.t, A.holster.q, [1, 1, 1]); m4.mul(bm, loc, M); this.hiltScaleY = 1; }
    else if (this.hilt === 'thrown' && this.thrown) {
      const T = this.thrown, d = [Math.cos(T.ang), 0, Math.sin(T.ang)]; const Y = v3.scale(d, -1), X = v3.norm(v3.cross([0, 1, 0], Y)), Z = v3.cross(X, Y);
      M.fill(0); M[0] = X[0]; M[1] = X[1]; M[2] = X[2]; M[4] = Y[0]; M[5] = Y[1]; M[6] = Y[2]; M[8] = Z[0]; M[9] = Z[1]; M[10] = Z[2]; M[12] = T.pos[0]; M[13] = T.pos[1]; M[14] = T.pos[2]; M[15] = 1; this.hiltScaleY = 1;
    }
    if (this.hilt === 'hand' && !this.hiltPose && this.saber.derivedKit === 'staff') this.twirlStaff(dt, M);
    // the torso aim (Actor spineYaw / spinePitch) already turns the arm, so blade and hit test follow the mouse
    this.blade.update(dt, M, this.g.attach.hiltLen * (this.hiltScaleY || 1), 1, this.now);
    if (this.blade2) this.updateHilt2(dt, M);
    this.blade.trailOn = (this.swingActive() || (this.thrown ? 0 : 0)) ? 1 : Math.max(0, this.blade.trailOn - dt * 6);
    if (this.swingActive()) this.blade.trailOn = 1;
  }
}
