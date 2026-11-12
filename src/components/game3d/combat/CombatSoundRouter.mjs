// Combat Foundation 2.2. Sound choices are presentation only.
// Custom skill audio already plays in skillSoundEffects at cast/hit times;
// do not layer an unrelated generic swing on top of those authored cues.
export const AUTHORED_SKILL_SOUNDS = new Set([
  'sword_triple_slash', 'ranged_double_shot',
]);

export function selectCombatSwingSound({ weaponPath = 'melee', skillId = null, hasSound = () => false } = {}) {
  if (AUTHORED_SKILL_SOUNDS.has(skillId)) return null;
  const preferred = weaponPath === 'ranged' ? 'player_ranged_release' : 'player_melee_swing';
  if (hasSound(preferred)) return preferred;
  return hasSound('player_attack') ? 'player_attack' : null;
}

// The melee combo animates consecutive skill hits as MELEE_ATTACK,
// MELEE_COMBO_2 and MELEE_COMBO_3 (hitIndex % 3). The third swing of each
// cycle gets the finisher layer on top of its normal swing. Ranged shots,
// mount soul echoes and authored skill tracks are left alone.
export const COMBO_FINISHER_HIT_INDEX = 2;

export function selectComboFinisherSound({
  weaponPath = 'melee', skillId = null, hitIndex = 0, soulEcho = false, hasSound = () => false,
} = {}) {
  if (weaponPath === 'ranged' || soulEcho || AUTHORED_SKILL_SOUNDS.has(skillId)) return null;
  const index = Number(hitIndex);
  if (!Number.isInteger(index) || index < 0 || index % 3 !== COMBO_FINISHER_HIT_INDEX) return null;
  return hasSound('combo_finisher') ? 'combo_finisher' : null;
}

// Called at the actual resolved contact frame. Misses have no contact sound.
export function selectCombatImpactSound({ kind = 'normal', hasSound = () => false } = {}) {
  if (kind === 'miss') return null;
  const preferred = kind === 'lethal' ? 'enemy_lethal_hit'
    : kind === 'critical' ? 'enemy_critical_hit'
    : 'enemy_hit';
  if (hasSound(preferred)) return preferred;
  return hasSound('enemy_hit') ? 'enemy_hit' : null;
}
