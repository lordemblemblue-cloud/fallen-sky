// Keeps the player controller's 3-hit combo clips baked for the weapon in hand.
// At start both combos are baked with the rig's own grip solve, so the very first swing (which may be the
// one that summons the weapon) already has its clips; whenever a different weapon is held, its combo is
// rebaked with that weapon's exact combat grip. Presentation only: no damage, cooldown or network state.
import * as THREE from 'three';
import { solveFallbackGrip } from './playerWeaponRuntime.js';
import { bakeWeaponComboClips, captureRestPose, comboKindForWeapon, SWORD_SKILL_SINGLE_COMBOS, SWORD_SKILL_TRIPLE_COMBOS } from './weaponComboClips.js';
import { swordMovesForWeapon } from './katanaTechniques.mjs';

const DEFAULT_HOLDS = Object.freeze({
  swordCombo: Object.freeze({ hand: 'right', class: 'sword', handleRadius: 0.015 }),
  bowCombo: Object.freeze({ hand: 'left', class: 'bow', handleRadius: 0.02 }),
});

// Create it right after the model loads, before the mixer first poses it: that pose is the rig's rest pose.
export function createWeaponComboBinder({ model, controller, runtime = null, bodyHeight = 1.7, rest = null }) {
  const restPose = rest || captureRestPose(model);
  const bakedWith = { swordCombo: null, bowCombo: null }; // what each combo was last baked for
  const bake = (comboKind, weaponClass, grips, key, reach = null, moves = null) => {
    const clips = bakeWeaponComboClips(model, weaponClass, grips, { rest: restPose, reach, moves });
    if (!Object.keys(clips).length) return false;
    if (controller?.setWeaponComboClips?.(clips) === false) return false;
    bakedWith[comboKind] = key;
    return true;
  };
  for (const [comboKind, hold] of Object.entries(DEFAULT_HOLDS)) {
    const solved = model ? solveFallbackGrip(model, hold, ['combat'], bodyHeight) : null;
    const q = solved?.grips?.combat?.quaternion;
    bake(comboKind, hold.class, q ? { [hold.hand]: new THREE.Quaternion().fromArray(q) } : {}, 'default');
  }

  return {
    // Call once per frame. Rebakes for a newly held weapon, never in the middle of a swing.
    update() {
      const held = runtime?.getCurrent?.();
      const comboKind = comboKindForWeapon(held?.cls);
      if (!comboKind || bakedWith[comboKind] === held.id || controller?.getComboState?.()) return false;
      const grips = Object.fromEntries((runtime.getHands?.() || []).map((h) => [h.side, h.gripQuaternion]));
      // A long two-handed blade swings the katana combo (katanaTechniques.mjs); other swords keep their three hits.
      // Passing moves replaces the baker's whole sword list, so the sword skills' tier clips go along with them.
      const katana = comboKind === 'swordCombo' ? swordMovesForWeapon(held) : null;
      const moves = katana ? [...katana, ...SWORD_SKILL_SINGLE_COMBOS, ...SWORD_SKILL_TRIPLE_COMBOS.flat()] : null;
      return bake(comboKind, held.cls, grips, held.id, held.length, moves);
    },
    bakedFor: (comboKind) => bakedWith[comboKind] ?? null,
  };
}
