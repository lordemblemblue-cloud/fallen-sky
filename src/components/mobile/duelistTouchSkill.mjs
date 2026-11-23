// Public, display-only skill labels for Duelist Adventure's mobile HUD.
// Names and descriptions always come from the same four-class rules as the match.
import { classById } from '../duelist/core/classes.mjs';

export const DUELIST_SKILL_TYPES = Object.freeze({
  leapStrike: 'Melee', grip: 'Control', repulse: 'Area control',
  bladeThrow: 'Ranged', pull: 'Control', quickstep: 'Speed buff',
  counter: 'Counter', cloak: 'Stealth', push: 'Knockback',
  empower: 'Damage buff', dominate: 'Control', mend: 'Healing',
  quickstepAura: 'Team buff', levitate: 'Control',
  rage: 'Power buff', execution: 'Finisher',
  shadowExecution: 'Finisher', sanctuary: 'Support',
});

/** Use authoritative class definitions; never infer the action from the visible slot number alone. */
export function describeDuelistTouchSkill(classId, actionId) {
  const cls = classById(classId);
  if (!cls) return null;
  if (actionId === 'special') {
    return {
      id: cls.special.id, name: cls.special.name,
      type: DUELIST_SKILL_TYPES[cls.special.id] || 'Ultimate',
      text: cls.special.text, slot: null, ultimate: true,
    };
  }
  const matched = /^ability([1-4])$/.exec(actionId || '');
  if (!matched) return null;
  const slot = Number(matched[1]);
  const ability = cls.abilities[slot - 1];
  if (!ability) return null;
  return {
    id: ability.id, name: ability.name,
    type: DUELIST_SKILL_TYPES[ability.id] || 'Ability',
    text: ability.text, slot, ultimate: false,
  };
}
