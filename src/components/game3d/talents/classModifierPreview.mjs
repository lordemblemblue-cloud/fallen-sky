// Pure display-only adapter for advanced class modifiers. Never changes the
// combat resolver, effective-stat caps, or the player's selected class.
const NEGATIVE_WHEN_HIGH = new Set(['stamina_cost', 'stamina_use']);
const OFFENSE = /crit|damage|weakspot|bleed|life_steal|attack_speed|rage|hit_chance|execute|knockback|combo|charge|counter|stealth|elemental|explosive|trap_damage|reflect_damage/i;
const DEFENSE = /defense|dodge|block|shield|hp_scaling|cc_resistance|stamina_regen/i;
const PASSIVE_NAMES = Object.freeze({
  crit_chance: 'Critical chance', crit_damage: 'Critical damage',
  weakspot_damage: 'Weakpoint damage', attack_speed: 'Attack speed',
  projectile_speed: 'Projectile speed', range_bonus: 'Effective range',
  dodge_chance: 'Dodge chance', block_chance: 'Block chance',
  cooldown_reduction: 'Cooldown reduction', cc_resistance: 'Control resistance',
  hp_scaling: 'Maximum health', stamina_cost: 'Stamina cost',
  stamina_use: 'Stamina consumption', stealth_damage_bonus: 'Stealth damage',
  shield_scaling: 'Shield strength', utility_range: 'Utility range',
});

export const titleCaseModifier = (key) => String(key || '').replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function decimal(value, precision = 1) {
  return Number(value.toFixed(precision)).toLocaleString('en-US', { maximumFractionDigits: precision });
}

export function formatPassiveModifier(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null;
  const isTradeoff = NEGATIVE_WHEN_HIGH.has(key) ? value > 0 : value < 0;
  const group = isTradeoff ? 'Trade-offs' : DEFENSE.test(key) ? 'Defense' : OFFENSE.test(key) ? 'Offense' : 'Utility';
  return {
    key, group, isTradeoff, label: PASSIVE_NAMES[key] || titleCaseModifier(key),
    display: `${value > 0 ? '+' : '−'}${decimal(Math.abs(value) * 100)}%`,
    description: isTradeoff ? 'Cost or penalty' : 'Configured class bonus',
  };
}

const COUNT_MODS = new Set(['fury_stacks', 'chain_attacks', 'momentum_stacks']);
const SECONDS_MODS = new Set(['parry_window']);
const PERCENT_MODS = new Set(['trap_cooldown_reduction', 'evasion_damage_bonus']);
const RATE_MODS = new Set(['fire_rate_penalty']);

export function formatSkillModifier(key, value, meta = {}) {
  if (value === false || value == null || (typeof value === 'number' && !Number.isFinite(value))) return null;
  if (typeof value !== 'boolean' && typeof value !== 'number') return null;
  if (value === 0) return null;
  let display = 'Unlocked';
  let description = meta.desc || '';
  let isTradeoff = false;
  if (typeof value === 'number') {
    if (COUNT_MODS.has(key)) display = `${decimal(value)} ${key === 'chain_attacks' ? 'hits' : 'stacks'}`;
    else if (SECONDS_MODS.has(key)) display = `${decimal(value)} s`;
    else if (PERCENT_MODS.has(key)) display = `+${decimal(value * 100)}%`;
    else if (RATE_MODS.has(key)) {
      display = `×${decimal(value, 2)} fire rate`;
      isTradeoff = value < 1;
      description = isTradeoff ? `${decimal((1 - value) * 100)}% below normal fire rate. ${description}`.trim() : description;
    } else display = `×${decimal(value, 2)}`;
  }
  return {
    key, label: meta.label || titleCaseModifier(key),
    description, display, isTradeoff,
    kind: typeof value === 'boolean' ? 'Ability' : 'Modifier',
  };
}

export function buildClassModifierPreview(classDef, skillDescriptions = {}) {
  if (!classDef) return { passives: [], skills: [], benefits: 0, tradeoffs: 0 };
  const passives = Object.entries(classDef.passive_bonuses || {})
    .map(([key, value]) => formatPassiveModifier(key, value)).filter(Boolean);
  const skills = Object.entries(classDef.skill_modifiers || {})
    .map(([key, value]) => formatSkillModifier(key, value, skillDescriptions[key])).filter(Boolean);
  return {
    passives, skills,
    benefits: [...passives, ...skills].filter((entry) => !entry.isTradeoff).length,
    tradeoffs: [...passives, ...skills].filter((entry) => entry.isTradeoff).length,
  };
}
