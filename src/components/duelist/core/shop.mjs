// Duelist Adventure in-match shop. Neither gold nor equipment persists to another match.
// Five items per primary stat, ten dual-stat hybrids; every item has a functional passive.
// Costs and bonuses are balance starting points, not a claim about another game's exact numbers.
export const SHOP_STATS = Object.freeze(['power', 'defense', 'ability', 'health', 'tenacity']);
export const SHOP_RULES = Object.freeze({
  slots: 6, startingGold: 300, passiveGoldPerSecond: 5, eliminationGold: 100,
  assistGold: 50, objectiveGold: 120, goldCap: 9999,
  statCaps: Object.freeze({ power: 0.45, defense: 0.32, ability: 0.42, health: 160, tenacity: 0.45 }),
});
const item = (id, name, category, cost, stats, passive) =>
  Object.freeze({ id, name, category, cost, stats: Object.freeze(stats), passive: Object.freeze(passive) });
const passive = (type, amount, text) => ({ type, amount, text });

export const SHOP_ITEMS = Object.freeze([
  // Power: offensive stat, including deliberately defensive passives.
  item('ironfang', 'Ironfang Blade', 'power', 300, { power: 0.06 }, passive('lifesteal', 0.06, 'Restore HP equal to 6% of HP damage dealt')),
  item('warbanner', 'War Banner', 'power', 360, { power: 0.07 }, passive('onKillShield', 12, 'Recover 12 shield after an elimination')),
  item('eclipseedge', 'Eclipse Edge', 'power', 420, { power: 0.09 }, passive('haste', 0.04, 'Class ability cooldowns 4% shorter')),
  item('bloodrite', 'Blood Rite', 'power', 500, { power: 0.10 }, passive('lifesteal', 0.08, 'Restore HP equal to 8% of HP damage dealt')),
  item('starbreaker', 'Starbreaker', 'power', 620, { power: 0.12 }, passive('onKillShield', 18, 'Recover 18 shield after an elimination')),
  // Defense: damage reduction, with offensive and support passives available.
  item('stoneguard', 'Stoneguard Plate', 'defense', 300, { defense: 0.06 }, passive('regen', 0.8, 'Restore 0.8 HP/s after 5 seconds unharmed')),
  item('mirrorward', 'Mirror Ward', 'defense', 360, { defense: 0.07 }, passive('onKillShield', 10, 'Recover 10 shield after an elimination')),
  item('duskplate', 'Dusk Plate', 'defense', 420, { defense: 0.08 }, passive('haste', 0.04, 'Class ability cooldowns 4% shorter')),
  item('oathwall', 'Oathwall', 'defense', 500, { defense: 0.09 }, passive('knockbackResist', 0.08, 'Take 8% less knockback')),
  item('eternalbulwark', 'Eternal Bulwark', 'defense', 620, { defense: 0.11 }, passive('lifesteal', 0.05, 'Restore HP equal to 5% of HP damage dealt')),
  // Ability: enhances class ability effects; passive haste is separate.
  item('runeweaver', 'Runeweaver', 'ability', 300, { ability: 0.06 }, passive('haste', 0.05, 'Class ability cooldowns 5% shorter')),
  item('arcsigil', 'Arc Sigil', 'ability', 360, { ability: 0.07 }, passive('regen', 0.8, 'Restore 0.8 HP/s after 5 seconds unharmed')),
  item('echocharm', 'Echo Charm', 'ability', 420, { ability: 0.08 }, passive('onKillShield', 12, 'Recover 12 shield after an elimination')),
  item('astralcore', 'Astral Core', 'ability', 500, { ability: 0.10 }, passive('lifesteal', 0.07, 'Restore HP equal to 7% of HP damage dealt')),
  item('celestialorb', 'Celestial Orb', 'ability', 620, { ability: 0.12 }, passive('haste', 0.07, 'Class ability cooldowns 7% shorter')),
  // Health: flat maximum HP, independent of Defense.
  item('heartseed', 'Heartseed', 'health', 300, { health: 18 }, passive('regen', 0.8, 'Restore 0.8 HP/s after 5 seconds unharmed')),
  item('lifebloom', 'Lifebloom', 'health', 360, { health: 22 }, passive('regen', 1, 'Restore 1 HP/s after 5 seconds unharmed')),
  item('vitalcrest', 'Vital Crest', 'health', 420, { health: 26 }, passive('onKillShield', 12, 'Recover 12 shield after an elimination')),
  item('amberheart', 'Amberheart', 'health', 500, { health: 30 }, passive('haste', 0.05, 'Class ability cooldowns 5% shorter')),
  item('worldroot', 'Worldroot', 'health', 620, { health: 38 }, passive('lifesteal', 0.06, 'Restore HP equal to 6% of HP damage dealt')),
  // Tenacity: percentage reduction of stagger and knockdown time, separate from defense.
  item('resolvecord', 'Resolve Cord', 'tenacity', 300, { tenacity: 0.06 }, passive('knockbackResist', 0.06, 'Take 6% less knockback')),
  item('fortitudebeads', 'Fortitude Beads', 'tenacity', 360, { tenacity: 0.07 }, passive('regen', 0.8, 'Restore 0.8 HP/s after 5 seconds unharmed')),
  item('unyieldingsigil', 'Unyielding Sigil', 'tenacity', 420, { tenacity: 0.08 }, passive('onKillShield', 10, 'Recover 10 shield after an elimination')),
  item('stubbornmantle', 'Stubborn Mantle', 'tenacity', 500, { tenacity: 0.10 }, passive('lifesteal', 0.07, 'Restore HP equal to 7% of HP damage dealt')),
  item('adamantcore', 'Adamant Core', 'tenacity', 620, { tenacity: 0.12 }, passive('haste', 0.06, 'Class ability cooldowns 6% shorter')),
  // All ten unique pairings of the five stats: two-stat hybrid items.
  item('vanguardfang', 'Vanguard Fang', 'hybrid', 600, { power: 0.05, defense: 0.05 }, passive('onKillShield', 18, 'Attack power that also restores 18 shield on eliminations')),
  item('stormcarver', 'Stormcarver', 'hybrid', 600, { power: 0.05, ability: 0.06 }, passive('haste', 0.06, 'Class ability cooldowns 6% shorter')),
  item('huntersheart', "Hunter's Heart", 'hybrid', 600, { power: 0.05, health: 20 }, passive('lifesteal', 0.07, 'Restore HP equal to 7% of HP damage dealt')),
  item('riftslayer', 'Riftslayer', 'hybrid', 600, { power: 0.05, tenacity: 0.06 }, passive('regen', 1, 'Restore 1 HP/s after 5 seconds unharmed')),
  item('spellguard', 'Spellguard', 'hybrid', 600, { defense: 0.05, ability: 0.05 }, passive('knockbackResist', 0.08, 'Take 8% less knockback')),
  item('bastionseed', 'Bastion Seed', 'hybrid', 600, { defense: 0.05, health: 24 }, passive('regen', 1.1, 'Restore 1.1 HP/s after 5 seconds unharmed')),
  item('steadfastplate', 'Steadfast Plate', 'hybrid', 600, { defense: 0.05, tenacity: 0.06 }, passive('onKillShield', 14, 'Recover 14 shield after an elimination')),
  item('sanctuaryglyph', 'Sanctuary Glyph', 'hybrid', 600, { ability: 0.05, health: 22 }, passive('haste', 0.06, 'Class ability cooldowns 6% shorter')),
  item('runebinder', 'Runebinder', 'hybrid', 600, { ability: 0.05, tenacity: 0.06 }, passive('regen', 1, 'Restore 1 HP/s after 5 seconds unharmed')),
  item('laststand', 'Last Stand', 'hybrid', 600, { health: 26, tenacity: 0.06 }, passive('lifesteal', 0.08, 'Restore HP equal to 8% of HP damage dealt')),
]);

const byId = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
export const shopItem = (id) => typeof id === 'string' ? byId.get(id) || null : null;
const zero = () => ({ power: 0, defense: 0, ability: 0, health: 0, tenacity: 0 });
const passivesZero = () => ({ lifesteal: 0, onKillShield: 0, haste: 0, regen: 0, knockbackResist: 0 });
/** Ignore invalid ids, so user-supplied item strings never create fake stats. */
export function itemBonuses(itemIds = []) {
  const stats = zero();
  const passive = passivesZero();
  const unique = new Set();
  for (const id of Array.isArray(itemIds) ? itemIds.slice(0, SHOP_RULES.slots) : []) {
    const item = shopItem(id);
    if (!item || unique.has(id)) continue;
    unique.add(id);
    for (const stat of SHOP_STATS) stats[stat] += item.stats[stat] || 0;
    passive[item.passive.type] += item.passive.amount;
  }
  for (const stat of SHOP_STATS) stats[stat] = Math.min(SHOP_RULES.statCaps[stat], +(stats[stat].toFixed(5)));
  passive.lifesteal = Math.min(0.22, passive.lifesteal);
  passive.onKillShield = Math.min(60, passive.onKillShield);
  passive.haste = Math.min(0.2, passive.haste);
  passive.regen = Math.min(3.5, passive.regen);
  passive.knockbackResist = Math.min(0.4, passive.knockbackResist);
  return { ...stats, passive };
}
/** Server-owned equip operation; health stays healthy when the maximum grows. */
export function equipItems(fighter, ids) {
  const nextIds = Array.isArray(ids) ? ids.filter((id, i, a) => shopItem(id) && a.indexOf(id) === i).slice(0, SHOP_RULES.slots) : [];
  const next = itemBonuses(nextIds);
  const previousHealth = fighter.shopStats?.health || 0;
  fighter.items = nextIds;
  fighter.shopStats = next;
  if (fighter.vitals) {
    const increase = next.health - previousHealth;
    fighter.vitals.max.hp += increase;
    fighter.vitals.hp = Math.max(0, Math.min(fighter.vitals.max.hp, fighter.vitals.hp + Math.max(0, increase)));
  }
  return next;
}
export function purchaseRule({ gold, items, id, allowed = true } = {}) {
  const found = shopItem(id);
  if (!found) return { ok: false, reason: 'unknown-item' };
  if (!allowed) return { ok: false, reason: 'shop-at-spawn' };
  if (!Array.isArray(items)) return { ok: false, reason: 'invalid-loadout' };
  if (items.includes(id)) return { ok: false, reason: 'already-owned' };
  if (items.length >= SHOP_RULES.slots) return { ok: false, reason: 'inventory-full' };
  if (!Number.isFinite(gold) || gold < found.cost - 1e-7) return { ok: false, reason: 'not-enough-gold' };
  return { ok: true, item: found };
}
