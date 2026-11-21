// Keeps the player controller's weapon clips baked for the weapon in hand: each family's combo swings and
// its looping idle (sword: one-handed and two-handed swings and stances; daggers: the light chain, the stab
// and their stance, all in a reverse grip; bow: the shots, its stance, the held draw and the running carry).
// At start every family is baked with the rig's own grip solve, so the very first swing (which may be the
// one that summons the weapon) already has its clips; whenever a different weapon is held, its family is
// rebaked with that weapon's exact combat grip. Presentation only: no damage, cooldown or network state.
import * as THREE from 'three';
import { solveFallbackGrip } from './playerWeaponRuntime.js';
import {
  bakeWeaponComboClips, captureRestPose, comboKindForWeapon, SWORD_COMBO, SWORD_TWO_HAND_COMBO, BOW_COMBO,
  BOW_SHOTS, DAGGER_COMBO, IDLE_SWORD, IDLE_SWORD_TWO_HAND, IDLE_DAGGERS, IDLE_BOW,
  SWORD_CHARGE, SWORD_TWO_HAND_CHARGE, DAGGER_CHARGE,
} from './weaponComboClips.js';
import { swordMovesForWeapon } from './katanaTechniques.mjs';
import { swordSkillTierMoves, swordSkillTierMovesForWeapon } from './swordSkillMoves.mjs';

const DEFAULT_HOLDS = Object.freeze({
  swordCombo: Object.freeze([{ hand: 'right', class: 'sword', handleRadius: 0.015 }]),
  bowCombo: Object.freeze([{ hand: 'left', class: 'bow', handleRadius: 0.02 }]),
  daggerCombo: Object.freeze([{ hand: 'right', class: 'dagger', handleRadius: 0.0155 }, { hand: 'left', class: 'dagger', handleRadius: 0.0155 }]),
});

// Every sword bakes its three hits (the katana combo on a long two-handed blade, katanaTechniques.mjs), the
// two-handed swings and both stances, and the four mastery tiers of its single-hit and three-hit skills
// (swordSkillMoves.mjs). A long blade is always held in both hands, so its normal stance is the two-hand one,
// and so is its charged strike. Held basic swings turn into the charge moves (combat/HoldChargeRules.mjs).
export function swordMovesFor(held) {
  const katana = held ? swordMovesForWeapon(held) : null;
  const stance = katana ? { ...IDLE_SWORD_TWO_HAND, name: 'idleSword' } : IDLE_SWORD;
  const charge = katana ? { ...SWORD_TWO_HAND_CHARGE, name: 'swordCharge', combo: 'swordCharge' } : SWORD_CHARGE;
  const moves = [...(katana || SWORD_COMBO), ...SWORD_TWO_HAND_COMBO, stance, IDLE_SWORD_TWO_HAND,
    ...(held ? swordSkillTierMovesForWeapon(held) : swordSkillTierMoves({ twoHanded: false }))];
  return [...moves, charge, SWORD_TWO_HAND_CHARGE];
}
export function movesForFamily(comboKind, held = null) {
  if (comboKind === 'bowCombo') return [...BOW_COMBO, IDLE_BOW, ...BOW_SHOTS];
  if (comboKind === 'daggerCombo') return [...DAGGER_COMBO, IDLE_DAGGERS, DAGGER_CHARGE];
  return swordMovesFor(held);
}

// Which of its family's move sets a weapon swings: a long blade swings the katana moves (katanaTechniques.mjs) under
// the sword's own state names, so a clip edited in Blender for the one-handed sword never plays on it.
export function weaponMoveVariant(comboKind, held = null) {
  return comboKind === 'swordCombo' && held && swordMovesForWeapon(held) ? 'longBlade' : 'standard';
}

const AUTHORED_TIMING = new Set(['hit', 'cancel', 'sweep', 'windUp', 'chargeFrom', 'charge', 'nock', 'full']);
// A clip edited in Blender (weaponClipPack.mjs) keeps the timing its markers gave it; what it does not say (which
// combo and hit it is, idle, pose, a timing marker it lacks) comes from the baked clip it replaces.
function authoredOver(authored, baked) {
  const own = authored.userData || (authored.userData = {});
  for (const [key, value] of Object.entries(baked.userData || {})) {
    if (own[key] !== undefined) continue;
    if (!AUTHORED_TIMING.has(key)) own[key] = value;
    else if (Number.isFinite(value)) own[key] = Math.min(value, authored.duration);
    else if (Array.isArray(value)) own[key] = value.map((t) => Math.min(t, authored.duration));
  }
  return authored;
}

// Create it right after the model loads, before the mixer first poses it: that pose is the rig's rest pose.
export function createWeaponComboBinder({ model, controller, runtime = null, bodyHeight = 1.7, rest = null }) {
  const restPose = rest || captureRestPose(model);
  const bakedWith = { swordCombo: null, bowCombo: null, daggerCombo: null }; // what each family was last baked for
  const bakedVariant = { swordCombo: 'standard', bowCombo: 'standard', daggerCombo: 'standard' };
  const lastBaked = {}; // each family's last baked clips, by state
  let authored = {}; // the owner's Blender-edited clips (weaponClipPack.mjs), by state
  let authoredPending = false;
  // a family's clips: the baked ones, with the authored clip of each state its move set has
  const withAuthored = (baked, variant) => {
    const out = { ...baked };
    for (const [state, clip] of Object.entries(baked)) {
      const own = authored[state];
      if (own && (own.userData?.variant || 'standard') === variant) out[state] = authoredOver(own, clip);
    }
    return out;
  };
  const bake = (comboKind, weaponClass, grips, key, reach = null, moves = null, held = null) => {
    const clips = bakeWeaponComboClips(model, weaponClass, grips, { rest: restPose, reach, moves });
    if (!Object.keys(clips).length) return false;
    const variant = weaponMoveVariant(comboKind, held);
    if (controller?.setWeaponComboClips?.(withAuthored(clips, variant)) === false) return false;
    bakedWith[comboKind] = key;
    bakedVariant[comboKind] = variant;
    lastBaked[comboKind] = clips;
    return true;
  };
  // Authored clips that load after the families were baked go in once no swing plays (the controller refuses mid-swing).
  const applyAuthored = () => {
    if (!authoredPending) return false;
    const clips = Object.assign({}, ...Object.entries(lastBaked).map(([kind, baked]) => withAuthored(baked, bakedVariant[kind])));
    if (controller?.setWeaponComboClips?.(clips) === false) return false;
    authoredPending = false;
    return true;
  };
  for (const [comboKind, holds] of Object.entries(DEFAULT_HOLDS)) {
    const grips = {};
    for (const hold of holds) {
      const solved = model ? solveFallbackGrip(model, hold, ['combat'], bodyHeight) : null;
      const q = solved?.grips?.combat?.quaternion;
      if (q) grips[hold.hand] = new THREE.Quaternion().fromArray(q);
    }
    bake(comboKind, comboKind === 'bowCombo' ? 'bow' : comboKind === 'daggerCombo' ? 'dagger' : 'sword', grips, 'default', null,
      movesForFamily(comboKind));
  }

  return {
    // Call once per frame. Rebakes for a newly held weapon, never in the middle of a swing.
    update() {
      applyAuthored();
      const held = runtime?.getCurrent?.();
      const comboKind = comboKindForWeapon(held?.cls);
      if (!comboKind || bakedWith[comboKind] === held.id || controller?.getComboState?.()) return false;
      const grips = Object.fromEntries((runtime.getHands?.() || []).map((h) => [h.side, h.gripQuaternion]));
      // A long two-handed blade swings the katana combo (katanaTechniques.mjs); other swords keep their three hits.
      return bake(comboKind, held.cls, grips, held.id, held.length, movesForFamily(comboKind, held), held);
    },
    bakedFor: (comboKind) => bakedWith[comboKind] ?? null,
    // The owner's Blender-edited clips (loadWeaponClipPack): from now on each replaces its baked clip on every weapon
    // of its family that swings its move set. True once they are in the controller (later, if a swing is playing).
    setAuthoredClips(clips = {}) {
      authored = { ...clips };
      authoredPending = true;
      return applyAuthored();
    },
    authoredStates: () => Object.keys(authored),
  };
}
