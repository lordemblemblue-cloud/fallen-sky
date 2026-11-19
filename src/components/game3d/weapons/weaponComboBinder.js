// Keeps the player controller's weapon clips baked for the weapon in hand: each family's combo swings and
// its looping idle (sword: one-handed and two-handed swings and stances; daggers: the light chain, the stab
// and their stance; bow: the shots and its stance).
// At start every family is baked with the rig's own grip solve, so the very first swing (which may be the
// one that summons the weapon) already has its clips; whenever a different weapon is held, its family is
// rebaked with that weapon's exact combat grip. Presentation only: no damage, cooldown or network state.
import * as THREE from 'three';
import { solveFallbackGrip } from './playerWeaponRuntime.js';
import {
  bakeWeaponComboClips, captureRestPose, comboKindForWeapon, SWORD_COMBO, SWORD_TWO_HAND_COMBO, BOW_COMBO,
  DAGGER_COMBO, IDLE_SWORD, IDLE_SWORD_TWO_HAND, IDLE_DAGGERS, IDLE_BOW,
} from './weaponComboClips.js';
import { swordMovesForWeapon } from './katanaTechniques.mjs';
import { swordSkillTierMoves, swordSkillTierMovesForWeapon } from './swordSkillMoves.mjs';

const DEFAULT_HOLDS = Object.freeze({
  swordCombo: Object.freeze([{ hand: 'right', class: 'sword', handleRadius: 0.015 }]),
  bowCombo: Object.freeze([{ hand: 'left', class: 'bow', handleRadius: 0.02 }]),
  daggerCombo: Object.freeze([{ hand: 'right', class: 'sword', handleRadius: 0.0155 }, { hand: 'left', class: 'sword', handleRadius: 0.0155 }]),
});

// Every sword bakes its three hits (the katana combo on a long two-handed blade, katanaTechniques.mjs), the
// two-handed swings and both stances, and the four mastery tiers of its single-hit and three-hit skills
// (swordSkillMoves.mjs). A long blade is always held in both hands, so its normal stance is the two-hand one.
export function swordMovesFor(held) {
  const katana = held ? swordMovesForWeapon(held) : null;
  const stance = katana ? { ...IDLE_SWORD_TWO_HAND, name: 'idleSword' } : IDLE_SWORD;
  return [...(katana || SWORD_COMBO), ...SWORD_TWO_HAND_COMBO, stance, IDLE_SWORD_TWO_HAND,
    ...(held ? swordSkillTierMovesForWeapon(held) : swordSkillTierMoves({ twoHanded: false }))];
}
export function movesForFamily(comboKind, held = null) {
  if (comboKind === 'bowCombo') return [...BOW_COMBO, IDLE_BOW];
  if (comboKind === 'daggerCombo') return [...DAGGER_COMBO, IDLE_DAGGERS];
  return swordMovesFor(held);
}

// Create it right after the model loads, before the mixer first poses it: that pose is the rig's rest pose.
export function createWeaponComboBinder({ model, controller, runtime = null, bodyHeight = 1.7, rest = null }) {
  const restPose = rest || captureRestPose(model);
  const bakedWith = { swordCombo: null, bowCombo: null, daggerCombo: null }; // what each family was last baked for
  const bake = (comboKind, weaponClass, grips, key, reach = null, moves = null) => {
    const clips = bakeWeaponComboClips(model, weaponClass, grips, { rest: restPose, reach, moves });
    if (!Object.keys(clips).length) return false;
    if (controller?.setWeaponComboClips?.(clips) === false) return false;
    bakedWith[comboKind] = key;
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
      const held = runtime?.getCurrent?.();
      const comboKind = comboKindForWeapon(held?.cls);
      if (!comboKind || bakedWith[comboKind] === held.id || controller?.getComboState?.()) return false;
      const grips = Object.fromEntries((runtime.getHands?.() || []).map((h) => [h.side, h.gripQuaternion]));
      // A long two-handed blade swings the katana combo (katanaTechniques.mjs); other swords keep their three hits.
      return bake(comboKind, held.cls, grips, held.id, held.length, movesForFamily(comboKind, held));
    },
    bakedFor: (comboKind) => bakedWith[comboKind] ?? null,
  };
}
