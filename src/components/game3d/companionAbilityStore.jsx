// ─────────────────────────────────────────────
// Companion Ability Store — cooldowns + definitions for the 4
// companion combat skills bound to Z / X / V / B.
// ─────────────────────────────────────────────

export const COMPANION_ABILITIES = [
  {
    id: 'bite',
    key: 'Z',
    name: 'Bite',
    icon: '🦷',
    color: '#fbbf24',
    description: 'Companion lunges and bites the target with snapping fangs.',
    cooldown: 2.5,
    damage: 22,
    requiresTarget: true,
  },
  {
    id: 'life_drain',
    key: 'X',
    name: 'Life Drain',
    icon: '🩸',
    color: '#dc2626',
    description: 'Drains the life force of the target — restores your HP, MP, and the companion\'s HP.',
    cooldown: 7.0,
    damage: 30,
    heal: 18,
    manaHeal: 12,
    requiresTarget: true,
  },
  {
    id: 'teleport_dash',
    key: 'V',
    name: 'Teleport Dash',
    icon: '💨',
    color: '#22d3ee',
    description: 'Companion blinks through the target, dealing damage as it passes through.',
    cooldown: 5.0,
    damage: 35,
    requiresTarget: true,
  },
  {
    id: 'soul_triple',
    key: null, // player equips it in any Z/X/V/B companion loadout slot
    name: 'Soul Triple Strike',
    icon: '🐺',
    color: '#c5e9ff',
    description: 'Three timed soul strikes against the same eligible enemy.',
    cooldown: 7,
    damage: 16,
    hit_count: 3,
    requiresTarget: true,
  },
  {
    id: 'soul_wave',
    key: null,
    name: 'Soul Wave',
    icon: '🌊',
    color: '#94d8ff',
    description: 'An outward soul sweep striking nearby frontal PvE enemies.',
    cooldown: 11,
    damage: 20,
    aoe_radius: 5,
    requiresTarget: false,
  },
  {
    id: 'heal',
    key: 'B',
    name: 'Heal',
    icon: '✨',
    color: '#34d399',
    description: 'Channel restoring light — heals you instantly with no target needed.',
    cooldown: 8.0,
    heal: 40,
    requiresTarget: false,
  },
];

let state = {
  cooldowns: { bite: 0, life_drain: 0, teleport_dash: 0, heal: 0, soul_triple: 0, soul_wave: 0 },
};

const subscribers = new Set();
const notify = () => subscribers.forEach((fn) => fn({ ...state }));

export function getCompanionAbilityState() { return state; }

export function subscribeCompanionAbilities(fn) {
  subscribers.add(fn);
  fn({ ...state });
  return () => subscribers.delete(fn);
}

export function tickCompanionCooldowns(delta) {
  let changed = false;
  const next = { ...state.cooldowns };
  for (const id in next) {
    const v = Math.max(0, next[id] - delta);
    if (v !== next[id]) { next[id] = v; changed = true; }
  }
  if (changed) { state = { ...state, cooldowns: next }; notify(); }
}

export function startCompanionCooldown(abilityId) {
  const ab = COMPANION_ABILITIES.find((a) => a.id === abilityId);
  if (!ab) return;
  state = { ...state, cooldowns: { ...state.cooldowns, [abilityId]: ab.cooldown } };
  notify();
}

export function getCompanionAbilityById(id) {
  return COMPANION_ABILITIES.find((a) => a.id === id) || null;
}