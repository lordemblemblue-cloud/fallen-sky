import * as THREE from 'three';
import { blocksBowMovement, shouldBlendBowFootwork } from './BowMovementRules.mjs';
import { PLAYER_AFK_DELAY_SECONDS } from './playerNativeAnimationClips';
import { UPLOADED_PLAYER_ACTIONS, PLAYER_IDLE_VARIANTS, PLAYER_DEATH_ACTIONS, resolvePlayerAnimationKey } from './playerAnimationActions.mjs';
import {GAME3D_MOBILITY_SECONDS,fitGame3DMobilityTiming} from './game3dMobilityTiming.mjs';
import {EIGHT_WAY_DODGE_MOVES,SIDE_ROLL_VARIANTS,getEightWayDodgeMove} from './game3dEightWayDodge.mjs';
import {dodgeTravelStep} from './dodgeMoves.js';
import {DODGE_VARIANT_MOVES,dodgeMoveCandidates,pickDodgeMove} from './game3dDodgeProfiles.mjs';
import { WEAPON_COMBO_STATES, WEAPON_IDLE_STATES, BOW_POSE_STATES, weaponIdleState, findComboBones } from '../weapons/weaponComboClips.js';
import { createLocomotionUnderlay } from './locomotionUnderlay.js';
import {
  createAirWalkState,deployAirWalkGlide,beginAirWalkBoost,
  beginAirWalkFinisher,setAirWalkKickHeld,
  advanceAirWalk,releaseAirWalkGlide,isAirWalkInFlight,
} from './AirWalkTraversal.mjs';
import {HALO_FLIGHT_RULES,paidGlideSeconds} from './haloWingFlightRules.mjs';

// 3-hit weapon combos (weapons/weaponComboClips.js, baked per held weapon). A press inside the chain window
// continues the chain; a press during a swing is buffered and starts the next hit at that swing's cancel point.
const WEAPON_COMBO_STATE_SET = new Set(Object.values(WEAPON_COMBO_STATES).flat());
// Looping stances for the weapon in hand (sword, two-hand sword, daggers, bow), baked with the combos.
const WEAPON_IDLE_STATE_SET = new Set(WEAPON_IDLE_STATES);
export const WEAPON_COMBO_CHAIN_GRACE_SECONDS = 0.55; // after a swing ends, the next press still continues the chain
export const WEAPON_COMBO_BUFFER_SECONDS = 0.6; // how long a buffered press waits for the cancel point
// Animation montages over locomotion (owner 2026-11-19): weapon swings and the bow's draw, hold and shots play
// on the upper body; while the player moves, the legs keep the walk / run / sprint under them
// (player/locomotionUnderlay.js), and moving is allowed. The bow: holding the aim draws (bowDraw) and holds at
// full draw (bowHold); letting go looses (bowRelease from the held draw, bowQuick when there was none); while
// running, the bow arm is carried low and out from the hip (bowRunCarry).
const BOW_DRAW = 'bowDraw';
const BOW_HOLD = 'bowHold';
const BOW_RUN_CARRY = 'bowRunCarry';
const BOW_SHOT_STATES = new Set([...WEAPON_COMBO_STATES.bowRelease, ...WEAPON_COMBO_STATES.bowQuick]);
const BOW_SHOT_KINDS = new Set(['bowRelease', 'bowQuick']);
const UPPER_BODY_STATES = new Set([...WEAPON_COMBO_STATE_SET, BOW_DRAW, BOW_HOLD]);
const FAST_GAITS = new Set(['run', 'sprint', 'runBack', 'runLeft', 'runRight']);
export const MONTAGE_BLEND = Object.freeze({
  inSeconds: 0.1, // locomotion -> a swing or shot (between hits of a chain: 0.06)
  outSeconds: 0.2, // a swing or shot -> locomotion
  legsSeconds: 0.14, // the legs taking over / handing back the stance when moving starts or stops
  bowCarrySeconds: 0.16, // the bow arm settling into / out of the running carry
  bowLowerSeconds: 0.22, // after the aim is let go, how long the draw waits for the shot
  fullDraw: 0.92, // this much of the draw counts as fully drawn (the shot looses from the hold)
});
const approach = (value, target, step) => (value < target ? Math.min(target, value + step) : Math.max(target, value - step));

const STATES = {
  IDLE: 'idle',
  AFK: 'afk',
  COMBAT_IDLE: 'combatIdle',
  RUN: 'run',
  SPRINT: 'sprint',
  WALK: 'walk',
  RUN_STOP: 'runStop',
  RUN_BACK: 'runBack',
  DRAW_ARROW: 'drawArrow',
  MELEE_ATTACK: 'meleeAttack',
  MELEE_COMBO_2: 'meleeCombo2',
  MELEE_COMBO_3: 'meleeCombo3',
  HEAVY_ATTACK: 'heavyAttack',
  HIT_REACT: 'hitReact',
  DODGE_RIGHT: 'dodgeRight',
  DODGE_LEFT: 'dodgeLeft',
  DODGE_FORWARD: 'dodgeForward',
  DODGE_BACKWARD: 'dodgeBackward',
  DIVE_FORWARD: 'diveForward',
  JUMP_START: 'jumpStart',
  JUMP_LOOP: 'jumpLoop',
  JUMP_LAND: 'jumpLand',
  ROLL: 'roll',
  AIM_WALK_RIGHT: 'aimWalkRight',
  AIM_WALK_LEFT: 'aimWalkLeft',
  AIM_WALK_FORWARD: 'aimWalkForward',
  AIM_WALK_BACKWARD: 'aimWalkBackward',
};

const LOOP_STATES = new Set([
  STATES.IDLE, STATES.AFK, STATES.COMBAT_IDLE, STATES.WALK, STATES.RUN, STATES.SPRINT, STATES.RUN_BACK, STATES.JUMP_LOOP,
  STATES.AIM_WALK_RIGHT, STATES.AIM_WALK_LEFT, STATES.AIM_WALK_FORWARD, STATES.AIM_WALK_BACKWARD,
  'fallLoop', // regular falling still uses its existing pose
  'wingGlide','airWalkLoop', // real rig-local flight motions
  ...WEAPON_IDLE_STATES, BOW_HOLD,
  ...UPLOADED_PLAYER_ACTIONS.filter(action => action.loop).map(action => action.key),
]);

const ONE_SHOT_DURATION = {
  [STATES.RUN_STOP]: 0.28,
  [STATES.DRAW_ARROW]: 0.32,
  [STATES.MELEE_ATTACK]: 0.36,
  [STATES.MELEE_COMBO_2]: 0.38,
  [STATES.MELEE_COMBO_3]: 0.40,
  [STATES.HEAVY_ATTACK]: 0.48,
  [STATES.HIT_REACT]: 0.24,
  [STATES.DODGE_RIGHT]: GAME3D_MOBILITY_SECONDS.dodgeRight,
  [STATES.DODGE_LEFT]: GAME3D_MOBILITY_SECONDS.dodgeLeft,
  [STATES.DODGE_FORWARD]: GAME3D_MOBILITY_SECONDS.dodgeForward,
  [STATES.DODGE_BACKWARD]: GAME3D_MOBILITY_SECONDS.dodgeBackward,
  [STATES.DIVE_FORWARD]: 0.68,
  [STATES.JUMP_START]: 0.24,
  [STATES.JUMP_LAND]: 0.22,
  [STATES.ROLL]: GAME3D_MOBILITY_SECONDS.roll,
  ...Object.fromEntries([...EIGHT_WAY_DODGE_MOVES,...SIDE_ROLL_VARIANTS,...Object.values(DODGE_VARIANT_MOVES)]
    .map(move=>[move.key,move.duration])),
};

const LEGACY_DODGE_STATE_BY_DIRECTION = {
  right: STATES.DODGE_RIGHT,
  left: STATES.DODGE_LEFT,
  forward: STATES.DODGE_FORWARD,
  backward: STATES.DODGE_BACKWARD,
};

export function createLunaDashboardPlayerController({
  mixer,oneShotRef,
  // Inject the world's existing character-scoped stamina ledger. The
  // animation controller never mutates stamina or a player save directly.
  getAirWalkStamina=()=>0,
  spendAirWalkBoost=()=>({ok:false,reason:'unavailable'}),
  spendAirWalkGlide=()=>({ok:false,reason:'unavailable'}),
  spendAirWalkRun=()=>({ok:false,reason:'unavailable'}),
  spendAirWalkFinisher=()=>({ok:false,reason:'unavailable'}),
}={}) {
  const actions = {};
  let currentState = null;
  let previousMoving = false;
  let lastMovement = { moving: false, running: false, direction: 'forward', aiming: false };
  let isBusy = false;
  // Only the ranged release/recoil montage may overlap real locomotion.
  let bowAttackAllowsMovement = false;
  let isAiming = false;
  let isBlocking = false;
  // family: the held weapon's mastery family (sword, dual_blades, bow); twoHand: the sword stance is held
  let equipment = { weaponType: 'unarmed', equipped: false, family: null, twoHand: false };
  let pendingEquipmentTransition = null;
  let idleVariantIndex = 0;
  let externallyAirborne = false;
  let blendTransition = null;
  let isDead = false;
  let isMounted = false;
  let idleStartedAt = null;
  let busyResetAt = 0;
  let specialMoveVelocity = null;
  let specialMoveTimer = 0;
  // Authored dodges (dodgeMoves.js) cover the dash distance along their own
  // travel curve: airborne / rolling only, never sliding through a crouch.
  let travelMove = null;
  let lastAttackAt = -Infinity;
  let jumpOffset=0;
  let jumpVelocity=0;
  let jumpPhase=null;
  let jumpPhaseSeconds=0;
  let airWalk=createAirWalkState();
  let airDashDirection=null;
  let lastAirWorldY=null;
  let lastAirGroundY=null;
  const cancelAirWalk=()=>{
    if(isAirWalkInFlight(airWalk)) airWalk=releaseAirWalkGlide(airWalk);
    airDashDirection=null;
    return airWalk.mode;
  };
  const resetAirWalk=()=>{
    airWalk=createAirWalkState();lastAirWorldY=null;lastAirGroundY=null;
    airDashDirection=null;
  };
  const GRAVITY=18;
  const JUMP_SPEED=5.4;
  const extraClips = {}; // weapon combo clips: kept across bindClips
  let comboChain = { kind: null, index: -1, until: -Infinity };
  let activeCombo = null; // { state, kind, index, sweepSent, hitSent, serial }
  let queuedCombo = null; // { kind, config, at, from, serial }
  // Every accepted swing (started now or buffered) gets a number; its cues carry it, so the world can land
  // each click's strike on that swing's own contact frame (and drop it if the swing never happens).
  let swingSerial = 0;
  let lastSwingSerial = 0;
  // Montages over locomotion: the legs follow the gait under a swing or a shot while the player moves.
  const underlay = createLocomotionUnderlay(mixer.getRoot?.(), findComboBones(mixer.getRoot?.()));
  let legsBlend = 0; // 0 standing still .. 1 moving
  let gait = null; // the walk / run / sprint the legs follow while moving
  let lastMontageClip = null; // the latest swing / shot / draw clip played
  let bowCarry = 0; // 0..1: the bow arm carried low and out while running
  let bowDrawn = false; // the draw reached full draw since the aim began (or since the last shot)
  let bowLowerAt = null; // the aim was let go while drawn: the draw waits until then for the shot
  let pendingShots = 0; // further arrows waiting behind the queued shot: each plays its own shot

  const ATTACK_STATES = new Set([
    STATES.DRAW_ARROW, STATES.MELEE_ATTACK, STATES.MELEE_COMBO_2,
    STATES.MELEE_COMBO_3, STATES.HEAVY_ATTACK,
    'kick', 'punch', 'aimRecoil', ...WEAPON_COMBO_STATE_SET,
  ]);
  const now = () => performance.now() / 1000;
  const hasAction = (state) => !!actions[resolvePlayerAnimationKey(state)];
  const isIdleVariant = state => PLAYER_IDLE_VARIANTS.includes(state);
  const isDeathState = state => PLAYER_DEATH_ACTIONS.includes(state);
  const durationFor = (state, speed = 1) => Math.max(0.01, (actions[state]?.getClip().duration || ONE_SHOT_DURATION[state] || 0.3) / speed);
  const advanceBlend = (sampleTime = mixer.time) => {
    if (!blendTransition) return;
    const { target, weights, startedAt, duration } = blendTransition;
    const amount = duration > 0 ? THREE.MathUtils.clamp((sampleTime - startedAt) / duration, 0, 1) : 1;
    for (const [action, weight] of weights) action.setEffectiveWeight(action === target
      ? weight + (1 - weight) * amount : weight * (1 - amount));
    if (amount === 1) {
      for (const action of weights.keys()) if (action !== target) action.stop();
      blendTransition = null;
    }
  };

  // ---- weapon combos ----
  const comboAction = () => (activeCombo && currentState === activeCombo.state ? actions[activeCombo.state] || null : null);
  const comboCancelAt = (state) => {
    const clip = actions[state]?.getClip();
    return clip ? clip.userData?.cancel ?? clip.duration : 0;
  };
  const startWeaponCombo = (kind, config, at, serial = ++swingSerial) => {
    const states = WEAPON_COMBO_STATES[kind];
    const hitIndex = config.hitIndex;
    const explicit = hitIndex !== undefined && hitIndex !== null && Number.isFinite(Number(hitIndex));
    const index = config.heavy ? states.length - 1
      : explicit ? Math.abs(Math.trunc(Number(hitIndex))) % states.length
        : comboChain.kind === kind && at <= comboChain.until ? (comboChain.index + 1) % states.length : 0;
    const state = states[index];
    const speed = Math.max(0.7, Math.min(2.2, Number(config.speed) || 1));
    queuedCombo = null;
    // a montage: a chain's next hit cuts in quickly, the first one blends in from the walk / idle
    const fade = UPPER_BODY_STATES.has(currentState) ? 0.06 : MONTAGE_BLEND.inSeconds;
    if (!playState(state, { force: true, fade, timeScale: speed, startAt: config.startAt })) return false;
    const duration = Math.max(0.01, durationFor(state, speed) - (actions[state]?.time || 0) / speed);
    isBusy = true;
    lastAttackAt = at;
    busyResetAt = at + duration;
    if (oneShotRef) oneShotRef.current = true;
    comboChain = { kind, index, until: at + duration + WEAPON_COMBO_CHAIN_GRACE_SECONDS };
    activeCombo = { state, kind, index, sweepSent: false, hitSent: false, serial };
    lastSwingSerial = serial;
    return true;
  };
  // null: no combo clips for this kind (the caller falls back to the regular attack montage)
  const requestWeaponCombo = (kind, config) => {
    const states = WEAPON_COMBO_STATES[kind];
    if (!states || !states.every(hasAction)) return null;
    if (isDead || isMounted) return false;
    const at = now();
    if (isBusy) {
      const swing = comboAction();
      if (swing && swing.time < comboCancelAt(currentState)) {
        if (BOW_SHOT_KINDS.has(kind) && queuedCombo && BOW_SHOT_KINDS.has(queuedCombo.kind)) {
          // every arrow of a multi-shot plays its own shot: this one follows the shot already waiting
          pendingShots += 1;
          lastSwingSerial = ++swingSerial;
          return true;
        }
        queuedCombo = { kind, config, at, from: currentState, serial: ++swingSerial };
        lastSwingSerial = queuedCombo.serial;
        return true;
      }
      if (!swing && currentState !== STATES.RUN_STOP && !(config.combo && ATTACK_STATES.has(currentState))) return false;
    }
    return startWeaponCombo(kind, config, at);
  };
  // Starts a buffered press once the current swing reaches its cancel point (or ends).
  const pumpWeaponCombo = () => {
    if (!queuedCombo) return false;
    const at = now();
    if (isDead || isMounted || at - queuedCombo.at > WEAPON_COMBO_BUFFER_SECONDS || currentState !== queuedCombo.from) {
      queuedCombo = null; // expired, or a dodge / hit / jump took over
      pendingShots = 0;
      return false;
    }
    if (isBusy && (actions[currentState]?.time ?? 0) < comboCancelAt(currentState)) return false;
    const { kind, config, serial } = queuedCombo;
    const started = startWeaponCombo(kind, config, at, serial);
    if (started && pendingShots > 0 && BOW_SHOT_KINDS.has(kind)) {
      pendingShots -= 1; // the next waiting arrow: a quick shot from the nock once this one has loosed
      queuedCombo = { kind: 'bowQuick', config: { ...config, startAt: undefined }, at, from: currentState, serial: ++swingSerial };
    }
    return started;
  };
  // Combo clips are baked per held weapon (weapons/weaponComboBinder.js) and survive bindClips. Returns false,
  // changing nothing, while a combo swing is still playing or fading out; the caller retries later.
  const setWeaponComboClips = (clipsByKey = {}) => {
    const entries = Object.entries(clipsByKey).filter(([key, clip]) => (WEAPON_COMBO_STATE_SET.has(key) || WEAPON_IDLE_STATE_SET.has(key)
      || BOW_POSE_STATES.includes(key)) && clip);
    if ([...WEAPON_COMBO_STATE_SET].some((key) => actions[key]?.isScheduled() && actions[key].getEffectiveWeight() > 0)) return false;
    let replayIdle = false;
    for (const [key, clip] of entries) {
      const old = actions[key];
      if (old?.getClip() === clip) continue;
      if (old && key === currentState) replayIdle = true; // the stance on screen is being replaced
      if (old) { old.stop(); mixer.uncacheClip(old.getClip()); }
      extraClips[key] = clip;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(1);
      actions[key] = action;
    }
    if (replayIdle) { const state = currentState; currentState = null; blendTransition = null; playState(state, { force: true, fade: 0 }); }
    return true;
  };
  const getComboState = () => {
    const action = comboAction();
    if (!action) return null;
    const { hit = 0, cancel = action.getClip().duration, sweep = null } = action.getClip().userData || {};
    return { state: activeCombo.state, kind: activeCombo.kind, index: activeCombo.index, time: action.time,
      duration: action.getClip().duration, hit, cancel, sweep, queued: !!queuedCombo };
  };
  // Presentation cues of the swing in progress, each once: 'sweep' when the blade starts its cutting arc
  // (seconds = how long it lasts at the current speed) and 'hit' at the strike / arrow release.
  const pollComboEvents = () => {
    const action = comboAction();
    if (!action) return [];
    const events = [];
    const { hit = 0, sweep = null } = action.getClip().userData || {};
    const speed = action.getEffectiveTimeScale() || 1;
    const t = action.time;
    const base = { kind: activeCombo.kind, index: activeCombo.index, state: activeCombo.state, serial: activeCombo.serial };
    if (sweep && !activeCombo.sweepSent && t >= sweep[0]) {
      activeCombo.sweepSent = true;
      events.push({ type: 'sweep', ...base, seconds: Math.max(0.05, (sweep[1] - Math.max(t, sweep[0])) / speed) });
    }
    if (!activeCombo.hitSent && t >= hit) {
      activeCombo.hitSent = true;
      events.push({ type: 'hit', ...base });
    }
    return events;
  };

  const playState = (state, options = {}) => {
    state = resolvePlayerAnimationKey(state);
    if ((isDead && !isDeathState(state)) || isMounted || !hasAction(state)) return false;
    if (!options.force && currentState === state) return true;
    const nextAction = actions[state];
    const previousAction = currentState ? actions[currentState] : null;
    advanceBlend();
    // anything but the draw itself ends a held draw (a shot, a dodge, a hit): the next aim draws again
    if (state !== BOW_DRAW && state !== BOW_HOLD) bowDrawn = false;
    // a draw or quick shot right after a shot starts from the nock: the bow stays up between shots
    let startAt = Number.isFinite(options.startAt) ? options.startAt : null;
    if (startAt === null && (state === BOW_DRAW || state === 'bowQuick') && BOW_SHOT_STATES.has(currentState)) {
      const nock = nextAction.getClip().userData?.nock;
      if (Number.isFinite(nock)) startAt = nock;
    }
    if (UPPER_BODY_STATES.has(state)) lastMontageClip = nextAction.getClip();
    if (![STATES.IDLE, STATES.AFK, 'idleArmed', ...WEAPON_IDLE_STATES, ...PLAYER_IDLE_VARIANTS].includes(state)) idleStartedAt = null;
    // Two semantic states can share a fallback clip. Changing the state must
    // not rewind that action or crossfade it against itself.
    if (previousAction === nextAction && !options.force) {
      currentState = state;
      return true;
    }
    // Keep every contributing pose in the same normalized transition. A→B→C
    // or A→B→A must never leave residual weight to the original bind/T-pose.
    const weights = new Map();
    let totalWeight = 0;
    for (const action of new Set(Object.values(actions))) {
      if (!action.isScheduled()) continue;
      const weight = action.getEffectiveWeight();
      if (weight > 0) { weights.set(action, weight); totalWeight += weight; }
    }
    for (const [action, weight] of weights) {
      action.enabled = true;
      action.stopFading().setEffectiveWeight(weight / totalWeight);
      weights.set(action, weight / totalWeight);
    }
    if (!weights.has(nextAction)) weights.set(nextAction, totalWeight > 0 ? 0 : 1);
    nextAction.enabled = true;
    nextAction.stopFading().setEffectiveWeight(weights.get(nextAction));
    nextAction.setEffectiveTimeScale(options.timeScale || 1);
    if (LOOP_STATES.has(state)) {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.clampWhenFinished = false;
    } else {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = state !== STATES.DRAW_ARROW;
    }
    const phase = previousAction && LOOP_STATES.has(currentState) && LOOP_STATES.has(state)
      && /^(?:run|walk|aimWalk|sprint)/.test(currentState) && /^(?:run|walk|aimWalk|sprint)/.test(state)
      ? previousAction.time / Math.max(0.001, previousAction.getClip().duration) : null;
    nextAction.reset().play();
    if (phase !== null && !options.resetPhase) nextAction.time = phase * nextAction.getClip().duration;
    // the walk / run taking over from a montage continues the stride the legs kept under it
    if (Number.isFinite(options.phase)) nextAction.time = (((options.phase % 1) + 1) % 1) * nextAction.getClip().duration;
    if (startAt !== null) nextAction.time = Math.min(Math.max(0, startAt), nextAction.getClip().duration);
    blendTransition = { target: nextAction, weights, startedAt: mixer.time, duration: options.fade ?? 0.16 };
    advanceBlend();
    currentState = state;
    return true;
  };

  const combatMovementState = (direction) => {
    if (direction === 'backward' && hasAction(STATES.AIM_WALK_BACKWARD)) return STATES.AIM_WALK_BACKWARD;
    if (direction === 'left' && hasAction(STATES.AIM_WALK_LEFT)) return STATES.AIM_WALK_LEFT;
    if (direction === 'right' && hasAction(STATES.AIM_WALK_RIGHT)) return STATES.AIM_WALK_RIGHT;
    if (hasAction(STATES.AIM_WALK_FORWARD)) return STATES.AIM_WALK_FORWARD;
    return direction === 'backward' && hasAction(STATES.RUN_BACK) ? STATES.RUN_BACK : STATES.RUN;
  };

  // Standing still with a weapon drawn: the owner's uploaded bow idle when it is loaded, otherwise the
  // baked stance of the weapon family (and the two-hand sword stance while it is held); empty hands: idle.
  const standingIdle = () => {
    if (!equipment.equipped) return STATES.IDLE;
    if (equipment.weaponType === 'bow' && hasAction('idleArmed')) return 'idleArmed';
    const stance = weaponIdleState(equipment.family, { twoHand: equipment.twoHand });
    return stance && hasAction(stance) ? stance : STATES.IDLE;
  };
  // The walk / run / sprint for this movement (also what the legs keep under a montage).
  const gaitState = ({ running, sprinting, direction }) => {
    if (sprinting && hasAction(STATES.SPRINT)) return STATES.SPRINT;
    const suffix = { backward: 'Back', left: 'Left', right: 'Right' }[direction] || '';
    const directional = `${running ? 'run' : 'walk'}${suffix}`;
    if (hasAction(directional)) return directional;
    if (!running && hasAction(STATES.WALK)) return STATES.WALK;
    if (direction === 'backward' && hasAction(STATES.RUN_BACK)) return STATES.RUN_BACK;
    return STATES.RUN;
  };
  // The bow's own draw: a bow in hand and its draw clips baked.
  const bowStatesReady = () => equipment.family === 'bow' && equipment.equipped && hasAction(BOW_DRAW) && hasAction(BOW_HOLD);
  const bowLowering = () => bowLowerAt !== null && (currentState === BOW_DRAW || currentState === BOW_HOLD);
  const movementStateFor = ({ moving, running, sprinting, direction, aiming, blocking }) => {
    if (blocking && hasAction('block')) return 'block';
    if (blocking && hasAction(STATES.COMBAT_IDLE)) return STATES.COMBAT_IDLE;
    if (externallyAirborne && hasAction('fallLoop')) return 'fallLoop';
    // the aim held with a bow: draw, then hold at full draw (over the walk / run while moving)
    if ((aiming || bowLowering()) && bowStatesReady()) return bowDrawn ? BOW_HOLD : BOW_DRAW;
    if (!moving) {
      if (aiming && hasAction('aimOverdraw')) return 'aimOverdraw';
      if (aiming && hasAction(STATES.COMBAT_IDLE)) return STATES.COMBAT_IDLE;
      // The armed idle and its look/examine variants come from the longbow pack: the hands hold a bow.
      // With a sword or daggers drawn they read as a stuck bow loop, so melee keeps the normal idle.
      const meleeDrawn = equipment.equipped && equipment.weaponType === 'melee';
      if (!aiming && !blocking && !meleeDrawn && idleStartedAt !== null && now() - idleStartedAt >= PLAYER_AFK_DELAY_SECONDS) {
        const variants = PLAYER_IDLE_VARIANTS.filter(hasAction);
        if (variants.length) return variants[idleVariantIndex++ % variants.length];
        // the generic AFK pose has empty hands: a drawn weapon keeps its own stance instead
        if (hasAction(STATES.AFK) && standingIdle() === STATES.IDLE) return STATES.AFK;
      }
      return standingIdle();
    }
    if (aiming) return combatMovementState(direction);
    return gaitState({ running, sprinting, direction });
  };

  const resetBusy = () => {
    isBusy = false;
    bowAttackAllowsMovement = false;
    busyResetAt = 0;
    jumpPhase=null;
    specialMoveTimer=0;
    specialMoveVelocity=null;
    travelMove = null;
    if (oneShotRef) oneShotRef.current = false;
    if (pumpWeaponCombo()) return;
    if (pendingEquipmentTransition) {
      const transition = pendingEquipmentTransition;
      pendingEquipmentTransition = null;
      if (playMontage(transition, { equipmentContext: false })) return;
    }
    handleMovement(lastMovement);
  };

  const handleMovement = ({ moving = lastMovement.moving, running = lastMovement.running, sprinting = false, direction = lastMovement.direction, aiming = isAiming, blocking = isBlocking } = {}) => {
    const wasRunning = lastMovement.running;
    lastMovement = { moving: !!moving, running: !!running || !!sprinting, sprinting: !!sprinting, direction, aiming: !!aiming, blocking: !!blocking };
    if (currentState === STATES.RUN_STOP && moving) { isBusy = false; busyResetAt = 0; if (oneShotRef) oneShotRef.current = false; }
    // Movement may cancel only the recovery, never a live weapon strike or queued follow-up.
    if (moving && isBusy && !queuedCombo && comboAction() && comboAction().time >= comboCancelAt(currentState)) {
      isBusy = false; busyResetAt = 0; if (oneShotRef) oneShotRef.current = false;
    }
    if (isDead || isMounted) return;
    // While actual Halo flight owns the character, the ordinary walk/idle
    // locomotion updater must not overwrite WingGlide / Skywalk animation
    // every frame. We still remember the player's latest movement intent
    // to restore locomotion once they land.
    if(isAirWalkInFlight(airWalk)) return;
    if (isBusy) {
      // A bow release may keep its short recoil pose while the PLAYER ROOT
      // still walks. After 120ms, the normal aim-walk/strafe clip resumes.
      if (shouldBlendBowFootwork({
        bowAttackActive: bowAttackAllowsMovement,
        moving, elapsedSeconds: now() - lastAttackAt,
      })) {
        const footwork = movementStateFor({ ...lastMovement, aiming:true });
        if (currentState !== footwork) playState(footwork, { fade:0.12 });
      }
      return;
    }
    if (isIdleVariant(currentState) && !moving && !aiming && !blocking) return;
    if (moving || aiming || blocking) idleStartedAt = null;
    else if (idleStartedAt === null) idleStartedAt = now();
    if (previousMoving && wasRunning && !moving && hasAction(STATES.RUN_STOP) && !aiming && !blocking) {
      previousMoving = false;
      isBusy = true;
      busyResetAt = now() + durationFor(STATES.RUN_STOP);
      if (oneShotRef) oneShotRef.current = true;
      playState(STATES.RUN_STOP, { force: true, fade: 0.12 });
      return;
    }
    previousMoving = !!moving;
    const next = movementStateFor(lastMovement);
    // a montage hands back to the locomotion with a longer blend, the walk / run carrying on the stride the
    // legs kept under it
    const fromMontage = UPPER_BODY_STATES.has(currentState) && !UPPER_BODY_STATES.has(next);
    playState(next, { fade: fromMontage ? MONTAGE_BLEND.outSeconds : 0.16,
      ...(fromMontage && underlay && next === gait && legsBlend > 0 ? { phase: underlay.getPhase() } : {}) });
  };

  const bindClips = (clipsByKey = {}) => {
    const previousState = currentState;
    const previousAction = actions[previousState];
    const previousDuration = previousAction?.getClip().duration || 0;
    const previousProgress = previousDuration > 0 ? previousAction.time / previousDuration : 0;
    const previousSpeed = previousAction?.getEffectiveTimeScale() || 1;
    // Async uploads replace the initial native/fallback binding. Old actions
    // must release their tracks, including an active generated roll or jump.
    for (const action of new Set(Object.values(actions))) action.stop();
    blendTransition = null;
    for (const key of Object.keys(actions)) delete actions[key];
    currentState = null;
    Object.entries({ ...clipsByKey, ...extraClips }).forEach(([key, clip]) => {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(1);
      actions[resolvePlayerAnimationKey(key)] = action;
    });
    if (isMounted) return;
    if (isDead && (!isDeathState(previousState) || !hasAction(previousState))) {
      const death = PLAYER_DEATH_ACTIONS.find(hasAction);
      if (death) playState(death, { force: true, fade: 0.12 });
      return;
    }
    if (previousState && hasAction(previousState)) {
      const duration = actions[previousState].getClip().duration;
      const timeScale = previousDuration > 0 && duration > 0 ? previousSpeed * duration / previousDuration : previousSpeed;
      playState(previousState, { force: true, timeScale });
      actions[previousState].time = previousProgress * duration;
    } else {
      playState(STATES.IDLE, { force: true });
    }
  };

  // Explicit commands cover every uploaded filename as well as canonical
  // keys. Cosmetic playback never applies root translation, damage or yaw.
  const playMontage = (name, options = {}) => {
    const state = resolvePlayerAnimationKey(name);
    const config = typeof options === 'number' ? { timeScale: options } : options;
    if (isDeathState(state)) return requestDeath(state);
    if (isDead || isMounted || !hasAction(state) || (isBusy && !config.force)) return false;
    bowAttackAllowsMovement = false;
    const speed = Math.max(0.05, Number(config.timeScale) || 1);
    if (!playState(state, { ...config, force: true, timeScale: speed, fade: config.fade ?? 0.16 })) return false;
    if (config.equipmentContext !== false && state === 'equipBow') equipment = { weaponType: 'bow', equipped: true, family: 'bow', twoHand: false };
    if (config.equipmentContext !== false && state === 'disarmBow') equipment = { weaponType: 'unarmed', equipped: false, family: null, twoHand: false };
    if (state === 'block') isBlocking = true;
    if (state === 'aimOverdraw') isAiming = true;
    if (!LOOP_STATES.has(state) && !isIdleVariant(state)) {
      isBusy = true;
      busyResetAt = now() + (Number(config.duration) || durationFor(state, speed));
      if (oneShotRef) oneShotRef.current = true;
    } else if (config.force) {
      isBusy = false;
      busyResetAt = 0;
      if (oneShotRef) oneShotRef.current = false;
    }
    return true;
  };

  const requestDeath = (kind = 'forward') => {
    if (isDead || isMounted) return false;
    const requested = resolvePlayerAnimationKey(kind);
    const state = isDeathState(requested) ? requested : /back/i.test(kind) ? 'deathBackward' : 'deathForward';
    const available = hasAction(state) ? state : PLAYER_DEATH_ACTIONS.find(hasAction);
    queuedCombo = null;
    pendingShots = 0;
    isBusy = false;
    bowAttackAllowsMovement = false;
    busyResetAt = 0;
    specialMoveTimer = 0;
    specialMoveVelocity = null;
    travelMove = null;
    resetAirWalk();
    jumpOffset=0;
    jumpVelocity=0;
    jumpPhase=null;
    const played = available ? playState(available, { force: true, fade: 0.12 }) : false;
    if (!played) {
      // Native boot may precede the death montage. Preserve the last rendered
      // pose while it loads; a dead actor must not keep walking in place.
      blendTransition = null;
      for (const action of new Set(Object.values(actions))) {
        if (action.isScheduled()) action.paused = true;
      }
    }
    isDead = true;
    if (oneShotRef) oneShotRef.current = false;
    return played;
  };

  const revive = () => {
    if (!isDead) return false;
    for (const action of new Set(Object.values(actions))) action.stop();
    blendTransition = null;
    isDead = false;
    isBusy = false;
    bowAttackAllowsMovement = false;
    currentState = null;
    busyResetAt = 0;
    specialMoveTimer = 0;
    specialMoveVelocity = null;
    travelMove = null;
    jumpOffset = 0;
    jumpVelocity = 0;
    jumpPhase = null;
    jumpPhaseSeconds = 0;
    externallyAirborne = false;
    resetAirWalk();
    idleStartedAt = null;
    previousMoving = false;
    pendingEquipmentTransition = null;
    isAiming = false;
    isBlocking = false;
    queuedCombo = null;
    activeCombo = null;
    comboChain = { kind: null, index: -1, until: -Infinity };
    bowDrawn = false; bowLowerAt = null; legsBlend = 0; bowCarry = 0; pendingShots = 0;
    if (oneShotRef) oneShotRef.current = false;
    handleMovement({ moving: false, running: false, aiming: false, blocking: false });
    return true;
  };

  const startSpecialMove = (state, directionVector, speed, duration = ONE_SHOT_DURATION[state]) => {
    if (isDead || isMounted || isBusy || !hasAction(state)) return false;
    const dir = directionVector?.clone?.() || new THREE.Vector3(0, 0, -1);
    if (dir.lengthSq() === 0) dir.set(0, 0, -1);
    dir.y = 0;
    dir.normalize();
    const timing=fitGame3DMobilityTiming(actions[state].getClip()?.duration,duration);
    // Only this clip plays, from its authored initial frame. Its own duration
    // controls recovery, not an arbitrary shorter timer that cuts off Eve.
    if(!playState(state,{force:true,fade:.045,timeScale:timing.timeScale}))return false;
    isBusy = true;
    bowAttackAllowsMovement = false;
    busyResetAt = now() + timing.duration;
    if (oneShotRef) oneShotRef.current = true;
    const travel = actions[state].getClip()?.userData?.dodgeTravel;
    if (travel) {
      // Authored dodge: the same distance as the constant-speed dash below,
      // spread over the clip's own travel curve.
      travelMove = { dir: dir.clone(), travel, duration: timing.duration, elapsed: 0,
        distance: speed * Math.min(.68,timing.duration) };
      specialMoveVelocity = null;
      specialMoveTimer = 0;
      return true;
    }
    travelMove = null;
    specialMoveVelocity = dir.multiplyScalar(speed);
    // Move with the real world's collision sweep, not raw animation root
    // translations or teleportation. Bound the dash for unusually long clips.
    specialMoveTimer = Math.min(.68,timing.duration);
    return true;
  };

  // rollDodges: the player's "Roll dodges" setting. The forward sidestep / back roll variants
  // (game3dDodgeProfiles.mjs) play when this body has their clips; otherwise the eight-way move does.
  const requestDodge = (directionVector, directionName = 'forward', { rollDodges = false } = {}) => {
    const move=pickDodgeMove(dodgeMoveCandidates(directionName,{rollDodges}),hasAction)||getEightWayDodgeMove(directionName);
    // All eight named generated clips exist from first render; if an old rig
    // somehow cannot bind one, preserve its original dodge/dive behavior.
    const state=hasAction(move.key)?move.key:
      (LEGACY_DODGE_STATE_BY_DIRECTION[directionName] || STATES.DIVE_FORWARD);
    if(!hasAction(state))return false;
    return startSpecialMove(state,directionVector,move.speed,move.duration);
  };

  const requestRoll = (directionVector, directionName = 'backward') => {
    const move=pickDodgeMove(dodgeMoveCandidates(directionName,{rollKey:true}),hasAction)||getEightWayDodgeMove(directionName,{roll:true});
    const state=hasAction(move.key)?move.key:
      hasAction(STATES.ROLL)?STATES.ROLL:STATES.DIVE_FORWARD;
    if(!hasAction(state))return false;
    // R + direction rolls on the same collision-safe 360-degree trajectory;
    // R alone performs the distinct backward perfect-dodge-style shoulder roll.
    return startSpecialMove(state,directionVector,move.speed,move.duration);
  }; 

  const requestJump=({haloPercent=0,directionVector=null}={})=>{
    if(isDead || isMounted || isBusy || jumpPhase || jumpOffset>0 || !hasAction(STATES.JUMP_START))return false;
    jumpOffset=0;
    jumpVelocity=JUMP_SPEED;
    jumpPhase='takeoff';
    jumpPhaseSeconds=ONE_SHOT_DURATION[STATES.JUMP_START];
    isBusy=true;
    bowAttackAllowsMovement=false;
    busyResetAt=0;
    if(oneShotRef)oneShotRef.current=true;
    const played=playState(STATES.JUMP_START,{force:true,fade:.05});
    if(played&&haloPercent>=HALO_FLIGHT_RULES.wingUnlockPercent&&directionVector?.lengthSq?.()>0){
      if(hasAction('airJump'))playState('airJump',{force:true,fade:.08});
      // Air Jump launches diagonally upward and forward. Its X/Z impulse
      // uses the same swept world collision as roll/dodge, never rig root motion.
      specialMoveVelocity=directionVector.clone().setY(0).normalize()
        .multiplyScalar(HALO_FLIGHT_RULES.initialAirJumpForwardSpeed);
      specialMoveTimer=HALO_FLIGHT_RULES.initialAirJumpSeconds;
    }
    return played;
  };

  // Space: grounded Air Jump, midair wing glide, repeated upward Air Walk
  // kicks, hold for continuous sky-run, double-tap the kick for the finishing
  // forward dash. All charges use the canonical character stamina ledger.
  const requestAirWalkAction=({haloPercent,directionVector,doubleTap=false}={})=>{
    if(isDead||isMounted)return {ok:false,reason:'unavailable'};
    if((airWalk.mode==='boost'||airWalk.mode==='walk')&&doubleTap){
      const planned=beginAirWalkFinisher(airWalk,{stamina:getAirWalkStamina()});
      if(!planned.ok)return planned;
      const paid=spendAirWalkFinisher();
      if(!paid?.ok)return {ok:false,reason:paid?.reason||'not_enough_stamina'};
      airWalk=planned.state;
      const dir=directionVector?.clone?.();
      airDashDirection=(dir&&dir.lengthSq()>0?dir:
        new THREE.Vector3(0,0,1)).setY(0).normalize();
      const finisher=hasAction('airWalkFinisher')?'airWalkFinisher':STATES.DIVE_FORWARD;
      if(hasAction(finisher))playState(finisher,{force:true,fade:.07});
      isBusy=true;
      busyResetAt=now()+HALO_FLIGHT_RULES.finisherSeconds;
      if(oneShotRef)oneShotRef.current=true;
      return {ok:true,action:'air_walk_finisher'};
    }
    if(airWalk.mode==='glide'){
      const planned=beginAirWalkBoost(airWalk,{stamina:getAirWalkStamina()});
      if(!planned.ok)return planned;
      const paid=spendAirWalkBoost();
      if(!paid?.ok)return {ok:false,reason:paid?.reason||'not_enough_stamina'};
      airWalk=setAirWalkKickHeld(planned.state,true);
      const airKick=hasAction('airWalkKick')?'airWalkKick':STATES.JUMP_LOOP;
      if(hasAction(airKick))playState(airKick,{force:true,fade:.07});
      isBusy=true;busyResetAt=0;
      if(oneShotRef)oneShotRef.current=true;
      return {ok:true,action:'air_walk'};
    }
    if(isAirWalkInFlight(airWalk))return {ok:false,reason:'boost_in_progress'};
    if(jumpPhase==='takeoff'||jumpPhase==='airborne'){
      const planned=deployAirWalkGlide(airWalk,{
        worldY:lastAirWorldY,floorY:lastAirGroundY,stamina:getAirWalkStamina(),
        haloPercent,
      });
      if(!planned.ok)return planned;
      airWalk=planned.state;
      jumpPhase='airborne';
      jumpVelocity=0;
      jumpPhaseSeconds=0;
      isBusy=false;
      busyResetAt=0;
      externallyAirborne=true;
      if(oneShotRef)oneShotRef.current=false;
      const glideLoop=hasAction('wingGlide')?'wingGlide':
        hasAction('fallLoop')?'fallLoop':STATES.JUMP_LOOP;
      if(hasAction(glideLoop))playState(glideLoop,{force:true,fade:.12});
      return {ok:true,action:'glide',freeSeconds:airWalk.freeGlideRemaining};
    }
    if(jumpPhase)return {ok:false,reason:'landing'};
    const jumped=requestJump({haloPercent,directionVector});
    return jumped?{ok:true,action:'jump'}:{ok:false,reason:'jump_unavailable'};
  };
  const setAirWalkHeld=held=>{
    const before=airWalk.mode;
    airWalk=setAirWalkKickHeld(airWalk,held);
    if(before==='walk'&&airWalk.mode==='glide'){
      const loop=hasAction('wingGlide')?'wingGlide':
        hasAction('fallLoop')?'fallLoop':STATES.JUMP_LOOP;
      if(hasAction(loop))playState(loop,{force:true,fade:.10});
    }
    return airWalk.mode;
  };

  // a fallback for existing avatars without a registered melee animation.
  // Timed skill combos may restart a compatible attack montage at most once
  // every 90ms; regular clicks still obey the ordinary busy/cooldown gates.
  // How far the draw on screen has come, in bowDraw's own seconds (Infinity: held at full draw; null: no draw).
  const drawSeconds = () => (currentState === BOW_HOLD ? Infinity
    : currentState === BOW_DRAW ? actions[BOW_DRAW]?.time ?? 0 : null);
  // A ranged attack's shot: loosed from the held draw (bowRelease), or drawn and loosed at once (bowQuick); a
  // draw let go early carries on in the quick shot from the same point of its own, faster draw.
  const bowShotFor = () => {
    bowLowerAt = null;
    const at = drawSeconds();
    const draw = actions[BOW_DRAW]?.getClip()?.userData || {};
    const quick = actions.bowQuick?.getClip()?.userData || {};
    const full = Number.isFinite(draw.full) ? draw.full : Infinity;
    if (at !== null && at >= full * MONTAGE_BLEND.fullDraw) return { kind: 'bowRelease' };
    if (at === null) return { kind: 'bowQuick' };
    const nockD = draw.nock || 0, nockQ = quick.nock || 0, fullQ = quick.full || 0;
    const startAt = at < nockD ? (at / Math.max(1e-3, nockD)) * nockQ
      : nockQ + ((at - nockD) / Math.max(1e-3, full - nockD)) * (fullQ - nockQ);
    return { kind: 'bowQuick', startAt: Math.min(fullQ, startAt) };
  };

  const requestAttack = (kind = 'attack', options = {}) => {
    let config = typeof options === 'number' ? { speed: options } : (options || {});
    // a ranged attack plays the bow's own shots when they are baked: one shot animation per arrow
    if (kind === 'bowCombo' && hasAction('bowRelease') && hasAction('bowQuick')) {
      const shot = bowShotFor();
      kind = shot.kind;
      config = { ...config, startAt: shot.startAt };
    }
    // 'swordCombo' / 'bowCombo': the held weapon's 3-hit combo; without its clips, the regular attack below
    if (WEAPON_COMBO_STATES[kind]) {
      const combo = requestWeaponCombo(kind, config);
      if (combo !== null) return combo;
      kind = kind === 'bowCombo' ? 'attack' : 'kick';
    }
    const melee = ['kick', 'punch', 'melee', 'meleeAttack'].includes(kind);
    const comboIndex = Math.max(0, Number(config.hitIndex) || 0);
    const heavy = melee && (config.heavy === true);
    const preferred = heavy ? STATES.HEAVY_ATTACK
      : comboIndex % 3 === 1 ? STATES.MELEE_COMBO_2
      : comboIndex % 3 === 2 ? STATES.MELEE_COMBO_3
      : STATES.MELEE_ATTACK;
    const state = melee
      ? (hasAction(kind) ? kind : hasAction(preferred) ? preferred : hasAction('punch') ? 'punch' : hasAction(STATES.MELEE_ATTACK) ? STATES.MELEE_ATTACK : STATES.DRAW_ARROW)
      : hasAction('aimRecoil') ? 'aimRecoil' : STATES.DRAW_ARROW;
    if (isDead || isMounted || !hasAction(state)) return false;
    const instant = now();
    if (isBusy && (!config.combo || !ATTACK_STATES.has(currentState) || instant - lastAttackAt < 0.09)) return false;
    const speed = Math.max(0.7, Math.min(2.2, Number(config.speed) || 1));
    const played = playState(state, { force: true, fade: 0.045, timeScale: speed });
    if (!played) return false;
    isBusy = true;
    // A true bow release is not a stun. Melee, hit reactions, dodges and
    // authored special attacks keep their original lock semantics.
    bowAttackAllowsMovement = !melee && equipment.weaponType === 'bow';
    lastAttackAt = instant;
    busyResetAt = instant + durationFor(state, speed);
    if (oneShotRef) oneShotRef.current = true;
    return true;
  };

  const requestHitReact = (kind = 'front') => {
    const state = /head/i.test(kind) && hasAction('headshotReact') ? 'headshotReact' : STATES.HIT_REACT;
    if (isDead || isMounted || !hasAction(state)) return false;
    // Do not cancel a dodge or other mobility move for a cosmetic hit reaction.
    if (isBusy && !ATTACK_STATES.has(currentState)) return false;
    if (!playState(state, { force: true, fade: 0.06, timeScale: 1.05 })) return false;
    isBusy = true;
    bowAttackAllowsMovement = false;
    busyResetAt = now() + durationFor(state, 1.05);
    if (oneShotRef) oneShotRef.current = true;
    return true;
  };

  // Motion requests never move directly through unvalidated terrain. The
  // world owns the swept boundary/building/tree/rail collision checks; this
  // callback hands them the requested planar displacement only.
  const updateMotion = (model, delta, groundY = model.position.y, moveWithCollision, resolveCeilingY) => {
    advanceBlend();
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.08,delta)):0;
    let correctedGroundY=groundY;
    if (travelMove) {
      const [dx, dz] = dodgeTravelStep(travelMove, dt);
      if(typeof moveWithCollision==='function' && (dx || dz)){
        const corrected=moveWithCollision(dx,dz);
        if(Number.isFinite(corrected))correctedGroundY=corrected;
      }
      if(travelMove.elapsed>=travelMove.duration)travelMove=null;
    }
    if (specialMoveTimer > 0 && specialMoveVelocity) {
      const step=Math.min(dt,specialMoveTimer);
      if(typeof moveWithCollision==='function' && step>0){
        const corrected=moveWithCollision(specialMoveVelocity.x*step,specialMoveVelocity.z*step);
        if(Number.isFinite(corrected))correctedGroundY=corrected;
      }
      specialMoveTimer=Math.max(0,specialMoveTimer-step);
      if(specialMoveTimer===0)specialMoveVelocity=null;
    }
    if(isAirWalkInFlight(airWalk)){
      // The single owner of vertical gliding height keeps absolute world Y.
      // Ordinary X/Z still goes through the collision-safe World3D callback.
      // Free Halo wing time is spent first. On a crossing frame bill only
      // the exact fraction after expiry; no upfront stamina cost for gliding.
      const paidSeconds=airWalk.mode==='glide'?paidGlideSeconds(airWalk,dt):0;
      const canGlide=paidSeconds<=0||!!spendAirWalkGlide(paidSeconds)?.ok;
      const entersAirRun=airWalk.mode==='boost'&&airWalk.kickHeld&&
        (airWalk.kickHoldSeconds||0)+dt>=HALO_FLIGHT_RULES.airRunHoldThresholdSeconds;
      const canAirWalk=(airWalk.mode==='walk'||entersAirRun)
        ?!!spendAirWalkRun(dt)?.ok:true;
      const before=airWalk.mode;
      if(typeof moveWithCollision==='function'&&dt>0){
        if(before==='walk'&&canAirWalk){
          // Forward flight is collision swept, so buildings, cave walls
          // and mountains cannot be passed by holding Space.
          const yaw=model.rotation.y;
          const x=Math.sin(yaw)*HALO_FLIGHT_RULES.airRunForwardSpeed*dt;
          const z=Math.cos(yaw)*HALO_FLIGHT_RULES.airRunForwardSpeed*dt;
          const corrected=moveWithCollision(x,z);
          if(Number.isFinite(corrected))correctedGroundY=corrected;
        }else if(before==='dash'){
          const dir=airDashDirection||new THREE.Vector3(Math.sin(model.rotation.y),0,Math.cos(model.rotation.y));
          const step=Math.min(dt,airWalk.dashRemaining||0);
          const corrected=moveWithCollision(dir.x*HALO_FLIGHT_RULES.finisherForwardSpeed*step,
            dir.z*HALO_FLIGHT_RULES.finisherForwardSpeed*step);
          if(Number.isFinite(corrected))correctedGroundY=corrected;
        }
      }
      const next=advanceAirWalk(airWalk,dt,{
        floorY:correctedGroundY,
        ceilingY:typeof resolveCeilingY==='function'
          ?resolveCeilingY(airWalk.y):null,
        canGlide,canAirWalk,
      });
      airWalk=next.state;
      if(before!==airWalk.mode){
        if(airWalk.mode==='walk'){
          isBusy=false;busyResetAt=0;
          if(oneShotRef)oneShotRef.current=false;
          const run=hasAction('airWalkLoop')?'airWalkLoop':STATES.RUN;
          if(hasAction(run))playState(run,{force:true,fade:.12});
        }else if(['glide','fall'].includes(airWalk.mode)){
          airDashDirection=null;
          isBusy=false;busyResetAt=0;
          if(oneShotRef)oneShotRef.current=false;
          const loop=airWalk.mode==='glide'&&hasAction('wingGlide')?'wingGlide':
            hasAction('fallLoop')?'fallLoop':STATES.JUMP_LOOP;
          if(hasAction(loop))playState(loop,{force:true,fade:.12});
        }
      }
      if(next.landed){
        jumpOffset=0;
        jumpVelocity=0;
        jumpPhase='landing';
        jumpPhaseSeconds=ONE_SHOT_DURATION[STATES.JUMP_LAND];
        busyResetAt=now()+jumpPhaseSeconds;
        externallyAirborne=false;
        model.position.y=correctedGroundY;
        lastAirWorldY=correctedGroundY;
        lastAirGroundY=correctedGroundY;
        if(hasAction(STATES.JUMP_LAND))
          playState(STATES.JUMP_LAND,{force:true,fade:.09});
      }else{
        jumpOffset=Math.max(0,airWalk.y-correctedGroundY);
        model.position.y=airWalk.y;
        lastAirWorldY=airWalk.y;
        lastAirGroundY=correctedGroundY;
      }
      return;
    }
    if(jumpPhase==='takeoff' || jumpPhase==='airborne'){
      jumpOffset=Math.max(0,jumpOffset+jumpVelocity*dt-.5*GRAVITY*dt*dt);
      jumpVelocity-=GRAVITY*dt;
      jumpPhaseSeconds=Math.max(0,jumpPhaseSeconds-dt);
      if(jumpPhase==='takeoff' && jumpPhaseSeconds===0){
        jumpPhase='airborne';
        if(hasAction(STATES.JUMP_LOOP))playState(STATES.JUMP_LOOP,{force:true,fade:.06});
      }
      if(jumpVelocity<=0 && jumpOffset===0){
        jumpPhase='landing';
        jumpPhaseSeconds=ONE_SHOT_DURATION[STATES.JUMP_LAND];
        if(hasAction(STATES.JUMP_LAND))playState(STATES.JUMP_LAND,{force:true,fade:.07});
        busyResetAt=now()+jumpPhaseSeconds;
      }
    }else if(jumpPhase==='landing'){
      jumpPhaseSeconds=Math.max(0,jumpPhaseSeconds-dt);
      if(jumpPhaseSeconds===0)resetBusy();
    }
    if(busyResetAt>0 && now()>=busyResetAt)resetBusy();
    // The actual world height is sampled again every frame, so jumping follows
    // the same hill/floor baseline and cannot permanently change the spawn Y.
    model.position.y=correctedGroundY+jumpOffset;
    lastAirWorldY=model.position.y;
    lastAirGroundY=correctedGroundY;
  };

  const setAiming = (enabled) => {
    const was = isAiming;
    isAiming = !!enabled;
    // the aim let go while drawn: the draw stays a moment, for the shot that the release fires
    if (was && !isAiming && (currentState === BOW_DRAW || currentState === BOW_HOLD)) bowLowerAt = now() + MONTAGE_BLEND.bowLowerSeconds;
    if (isAiming) bowLowerAt = null;
    handleMovement({ ...lastMovement, aiming: isAiming });
    return true;
  };

  // Once a frame, before the mixer: the draw reaching full draw holds it; a draw whose aim was let go without
  // a shot lowers the bow.
  const updateBowDraw = () => {
    // the aim still held after a shot: the next arrow is drawn from the shot's cancel point
    const shot = comboAction();
    if (shot && isBusy && isAiming && BOW_SHOT_STATES.has(currentState) && !queuedCombo && bowStatesReady()
      && shot.time >= comboCancelAt(currentState)) resetBusy();
    const draw = actions[BOW_DRAW];
    if (currentState === BOW_DRAW && draw && !bowDrawn && draw.time >= draw.getClip().duration - 1e-3) {
      bowDrawn = true;
      if (!isBusy) handleMovement(lastMovement);
    }
    if (bowLowerAt !== null && now() >= bowLowerAt) {
      bowLowerAt = null;
      if (currentState === BOW_DRAW || currentState === BOW_HOLD) { bowDrawn = false; if (!isBusy) handleMovement(lastMovement); }
    }
  };

  // After the mixer has posed the body: under a swing, a shot or the bow's draw, the legs keep the gait the
  // player moves with (standing still, the montage's own stance stays), and while running with the bow its arm
  // carries the bow low and out from the hip.
  const lateUpdate = (delta = 0) => {
    if (!underlay || isMounted) return;
    const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
    const moving = !!lastMovement.moving && !isDead && !externallyAirborne && !jumpPhase && !isAirWalkInFlight(airWalk);
    if (moving) gait = gaitState(lastMovement);
    legsBlend = approach(legsBlend, moving ? 1 : 0, dt / MONTAGE_BLEND.legsSeconds);
    const gaitAction = gait ? actions[gait] : null;
    const gaitClip = gaitAction?.getClip() || null;
    if (gaitClip && currentState === gait && gaitAction.isRunning()) underlay.sync(gaitClip, gaitAction.time / Math.max(1e-3, gaitClip.duration));
    let upper = 0;
    for (const state of UPPER_BODY_STATES) {
      const action = actions[state];
      if (action?.isScheduled()) upper += action.getEffectiveWeight();
    }
    underlay.update(dt, { locomotion: gaitClip, timeScale: gaitAction?.timeScale || 1,
      weight: Math.min(1, upper) * legsBlend, montage: upper > 1e-3 ? lastMontageClip : null });
    const carry = actions[BOW_RUN_CARRY];
    const carrying = !!carry && equipment.family === 'bow' && equipment.equipped && FAST_GAITS.has(currentState) && !isBusy;
    bowCarry = approach(bowCarry, carrying ? 1 : 0, dt / MONTAGE_BLEND.bowCarrySeconds);
    if (carry && bowCarry > 0) underlay.overlayArm(carry.getClip(), 'left', bowCarry, { animated: actions[currentState]?.getClip() || null });
  };

  const setBlocking = (enabled) => {
    isBlocking = !!enabled;
    handleMovement({ ...lastMovement, blocking: isBlocking });
    return true;
  };

  const setEquipmentContext = (context = {}) => {
    const requested = String(context.weaponType || context.type || 'unarmed').toLowerCase();
    const equipped = context.equipped ?? requested !== 'unarmed';
    const weaponType = !equipped ? 'unarmed' : /bow|ranged|archer/.test(requested) ? 'bow' : 'melee';
    const family = !equipped ? null : weaponType === 'bow' ? 'bow'
      : /dual_blades|dagger/.test(requested) ? 'dual_blades' : /sword|blade/.test(requested) ? 'sword' : null;
    const twoHand = !!context.twoHand && family === 'sword';
    if (equipment.weaponType === weaponType && equipment.equipped === !!equipped
      && equipment.family === family && equipment.twoHand === twoHand) return false;
    const previous = equipment;
    equipment = { weaponType, equipped: !!equipped, family, twoHand };
    if (previous.family !== family) idleStartedAt = null; // another weapon: its stance first, idle variants later
    if (previous.weaponType === weaponType && previous.equipped === !!equipped) {
      // same kind of weapon, another family or stance: only the standing pose changes
      handleMovement(lastMovement);
      return true;
    }
    // Summoned weapons (weapons/playerWeaponSummon.js) form in the hand with their own one-shot gesture,
    // so the longbow pack's draw-from-the-back / put-away clips do not play for them.
    const transition = context.summon ? null
      : weaponType === 'bow' && previous.weaponType !== 'bow' ? 'equipBow'
      : previous.weaponType === 'bow' && weaponType !== 'bow' ? 'disarmBow' : null;
    if (transition && hasAction(transition) && !isMounted && !isDead) {
      if (isBusy) pendingEquipmentTransition = transition;
      else playMontage(transition, { equipmentContext: false });
    } else handleMovement(lastMovement);
    return true;
  };

  const setAirborneState = ({ grounded = true, justLanded = false } = {}) => {
    if (isDead || isMounted || jumpPhase) return false;
    const wasAirborne = externallyAirborne;
    externallyAirborne = !grounded;
    if (externallyAirborne) {
      if (!isBusy && hasAction('fallLoop')) return playState('fallLoop', { fade: 0.14 });
    } else if (wasAirborne || justLanded) {
      const landing = lastMovement.moving && lastMovement.running && hasAction('landRun') ? 'landRun'
        : hasAction('landIdle') ? 'landIdle' : STATES.JUMP_LAND;
      return playMontage(landing, { force: true });
    }
    return false;
  };

  // Riding is posed by the mount's seat/grip runtime. Foot locomotion must
  // release its bone bindings before that runtime seats the rider.
  const setMounted = (enabled) => {
    if (enabled && isDead) return false;
    if (isMounted === !!enabled) return;
    isMounted = !!enabled;
    for (const action of new Set(Object.values(actions))) action.stop();
    blendTransition = null;
    currentState = null;
    isBusy = false;
    bowAttackAllowsMovement = false;
    busyResetAt = 0;
    jumpOffset = 0;
    jumpVelocity = 0;
    jumpPhase = null;
    jumpPhaseSeconds = 0;
    specialMoveTimer = 0;
    specialMoveVelocity = null;
    travelMove = null;
    externallyAirborne = false;
    resetAirWalk();
    pendingEquipmentTransition = null;
    previousMoving = false;
    idleStartedAt = null;
    queuedCombo = null;
    activeCombo = null;
    bowDrawn = false; bowLowerAt = null; legsBlend = 0; bowCarry = 0; pendingShots = 0;
    if (oneShotRef) oneShotRef.current = false;
    if (!isMounted) handleMovement(lastMovement);
  };

  mixer.addEventListener('finished', (event) => {
    if (event.action !== actions[currentState]) return;
    if (isDeathState(currentState)) return;
    if (currentState === BOW_DRAW) { // fully drawn: hold it
      bowDrawn = true;
      if (!isBusy) handleMovement(lastMovement);
      return;
    }
    if (isIdleVariant(currentState)) {
      idleStartedAt = now();
      playState(standingIdle(), { force: true, fade: 0.2 });
      return;
    }
    // A jump's takeoff animation can end while the character is still
    // airborne. Landing, not the first finished clip, releases movement.
    if(jumpPhase)return;
    if (!LOOP_STATES.has(currentState)) resetBusy();
  });

  return {
    actions,
    bindClips,
    ChangeState: playMontage,
    PlayAnimation: playMontage,
    HandleMovement: handleMovement,
    HandleCombat: requestAttack,
    HandleJump: requestJump,
    HandleAirborne: setAirborneState,
    HandleDamage: requestHitReact,
    HandleDeath: requestDeath,
    revive,
    playOneShot: (name, speed = 1) => hasAction(name) ? playMontage(name, { timeScale: speed }) : requestAttack(name, speed),
    requestAttack,
    requestCrouch: () => false,
    requestDodge,
    requestHitReact,
    requestJump,
    requestAirWalkAction,
    setAirWalkHeld,
    cancelAirWalk,
    resetAirWalkMotion:()=>{
      resetAirWalk();jumpOffset=0;jumpVelocity=0;jumpPhase=null;
      jumpPhaseSeconds=0;externallyAirborne=false;
      isBusy=false;busyResetAt=0;
    },
    getAirWalkState:()=>({...airWalk}),
    requestRoll,
    setAiming,
    setBlocking,
    setEquipmentContext,
    setAirborneState,
    setMounted,
    updateActionState: handleMovement,
    updateMotion,
    updateAnimation: (delta = 0) => { pumpWeaponCombo(); updateBowDraw(); advanceBlend(mixer.time + Math.max(0, Number(delta) || 0)); },
    // after mixer.update: the legs under a montage and the bow carried while running
    lateUpdate,
    // true while the bow is drawn (the arrow nocked and the string pulled), false otherwise; null without a bow
    getBowDrawing: () => {
      if (equipment.family !== 'bow') return null;
      const nockedFrom = (action) => 0.6 * (action?.getClip().userData?.nock || 0);
      if (currentState === BOW_HOLD) return true;
      if (currentState === BOW_DRAW) return (actions[BOW_DRAW]?.time ?? 0) >= nockedFrom(actions[BOW_DRAW]);
      const swing = comboAction();
      if (swing && activeCombo.state === 'bowQuick') return swing.time >= nockedFrom(swing) && swing.time < (swing.getClip().userData?.hit ?? 0);
      return false;
    },
    // the state the weapon in hand should be gripped for: the running bow carry holds it like a drawn bow
    getWeaponState: () => (bowCarry > 0.5 ? BOW_RUN_CARRY : currentState || STATES.IDLE),
    // the walk / run / sprint the legs follow while moving (under a montage too); null standing still
    getGait: () => (lastMovement.moving && !isMounted ? gait : null),
    getMontageState: () => ({ legs: legsBlend, gait, phase: underlay?.getPhase() ?? null, weight: underlay?.getWeight() ?? 0,
      bowCarry, bowDrawn, bowLowering: bowLowerAt !== null }),
    setWeaponComboClips,
    getComboState,
    pollComboEvents,
    // the number of the swing the latest accepted combo press will play (started now or buffered)
    getLastSwingSerial: () => lastSwingSerial,
    getCurrent: () => isMounted ? 'mounted' : currentState || STATES.IDLE,
    getIsAiming: () => isAiming,
    getIsBlocking: () => isBlocking,
    getIsCrouching: () => false,
    getJumpOffset:()=>jumpOffset,
    // a swing or a shot is a montage over locomotion: the player keeps moving through it
    isMovementOverridden: () => blocksBowMovement({busy:isBusy,dead:isDead,bowAttackActive:bowAttackAllowsMovement || (isBusy && !!comboAction())}),
    has: hasAction,
    getDebugState: () => ({ currentState, ...lastMovement, isBusy, bowAttackAllowsMovement, isAiming, isBlocking, equipment: { ...equipment }, isMounted, isDead, specialMoveTimer,jumpPhase,jumpOffset,airWalk:{...airWalk} }),
  };
}
