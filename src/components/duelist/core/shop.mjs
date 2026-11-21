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

  // Healer-oriented support: all four classes can equip them for build flexibility.
  item('windblossom', 'Windblossom Boots', 'support', 380, { ability: 0.05, health: 10 }, passive('onAllyHealHaste', 0.12, 'Healing a wounded ally grants 12% movement speed for 3 seconds')),
  item('dawnchalice', 'Dawn Chalice', 'support', 450, { ability: 0.07, health: 12 }, passive('healAmp', 0.12, 'Your healing on allies is 12% stronger')),
  item('harborlantern', 'Harbor Lantern', 'support', 480, { defense: 0.04, ability: 0.04 }, passive('onAllyHealShield', 12, 'Healing an ally grants them 12 shield (8-second cooldown)')),
  item('mercythread', 'Mercy Thread', 'support', 360, { ability: 0.05, tenacity: 0.04 }, passive('onAllyHealWill', 8, 'Healing an ally restores 8 of your Will (8-second cooldown)')),
  item('radiantseed', 'Radiant Seed', 'support', 420, { health: 20, defense: 0.03 }, passive('onAllyHealPulse', 8, 'Healing an ally also restores 8 of your HP (8-second cooldown)')),
  // Healing counters: on damage, apply a timed non-stacking healing reduction.
  item('blightglass', 'Blightglass Shard', 'counter', 350, { power: 0.05 }, passive('antiHeal', 0.25, 'Damaging a foe reduces their healing by 25% for 3 seconds')),
  item('gravecinder', 'Gravecinder Mark', 'counter', 440, { ability: 0.07 }, passive('antiHeal', 0.30, 'Damaging a foe reduces their healing by 30% for 3 seconds')),
  item('dreadthorn', 'Dreadthorn Plate', 'counter', 510, { defense: 0.07, tenacity: 0.04 }, passive('antiHeal', 0.28, 'Taking an attack applies 28% reduced healing to the attacker for 3 seconds')),
  item('sentrylens', 'Sentry Lens', 'counter', 540, { ability: 0.04, tenacity: 0.05 }, passive('trueSight', 6.5, 'Spot cloaked foes within 6.5 m (normal reveal is 3 m)')),
  item('mistveil', 'Mistveil Mantle', 'counter', 560, { defense: 0.04, health: 18 }, passive('emergencyCloak', 1.4, 'When a hit leaves you at 35% HP or less, cloak for 1.4 s (40 s cooldown); attacks or damage reveal you')),
  // Reactive and sustain cross-builds. Echo Idol returns up to half the HP damage taken
  // and heals for 25% of the returned damage; hard 2 s proc cooldown and 18-damage cap.
  item('echoidol', 'Echo Idol', 'relic', 680, { defense: 0.05, health: 22 }, Object.freeze({ type: 'retaliation', amount: 0.50, healRatio: 0.25, cooldown: 2, cap: 18, text: 'Summon an echo after a hit: return 50% of HP damage (max 18) and heal 25% of that, once per 2 seconds' })),
  item('thundermirror', 'Thunder Mirror', 'relic', 520, { defense: 0.07 }, Object.freeze({ type: 'retaliation', amount: 0.30, healRatio: 0, cooldown: 1.5, cap: 12, text: 'Return 30% of HP damage (max 12), once per 1.5 seconds' })),
  item('siphonmirror', 'Siphon Mirror', 'relic', 600, { health: 24, tenacity: 0.04 }, Object.freeze({ type: 'retaliation', amount: 0.24, healRatio: 0.5, cooldown: 2, cap: 14, text: 'Return 24% of HP damage and heal 50% of returned damage, once per 2 seconds' })),
  item('wraithfang', 'Wraithfang', 'relic', 560, { power: 0.07, tenacity: 0.03 }, passive('lifesteal', 0.11, 'Restore HP equal to 11% of HP damage dealt')),
  item('graspbreaker', 'Graspbreaker Charm', 'relic', 560, { health: 24, tenacity: 0.06 }, passive('gripEscape', 36, 'Negate one Telekinetic Grip every 36 s; the next grip can still hold you')),
]);

const byId = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
export const shopItem = (id) => typeof id === 'string' ? byId.get(id) || null : null;
const zero = () => ({ power: 0, defense: 0, ability: 0, health: 0, tenacity: 0 });
const passivesZero = () => ({
  lifesteal: 0, onKillShield: 0, haste: 0, regen: 0, knockbackResist: 0,
  onAllyHealHaste: 0, healAmp: 0, onAllyHealShield: 0, onAllyHealWill: 0, onAllyHealPulse: 0,
  antiHeal: 0, onHitAntiHeal: 0, retaliation: null,
  trueSight: 0, emergencyCloak: 0, gripEscape: 0,
});
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
    if (item.passive.type === 'retaliation') {
      // Retaliation relics do not stack: equip the strongest one only.
      if (!passive.retaliation || item.passive.amount > passive.retaliation.amount)
        passive.retaliation = { amount: item.passive.amount, healRatio: item.passive.healRatio,
          cooldown: item.passive.cooldown, cap: item.passive.cap };
    } else if (item.id === 'dreadthorn') {
      passive.onHitAntiHeal = Math.max(passive.onHitAntiHeal, item.passive.amount);
    } else if (item.passive.type === 'antiHeal') {
      passive.antiHeal = Math.max(passive.antiHeal, item.passive.amount); // never stack reductions
    } else passive[item.passive.type] += item.passive.amount;
  }
  for (const stat of SHOP_STATS) stats[stat] = Math.min(SHOP_RULES.statCaps[stat], +(stats[stat].toFixed(5)));
  passive.lifesteal = Math.min(0.22, passive.lifesteal);
  passive.onKillShield = Math.min(60, passive.onKillShield);
  passive.haste = Math.min(0.2, passive.haste);
  passive.regen = Math.min(3.5, passive.regen);
  passive.knockbackResist = Math.min(0.4, passive.knockbackResist);
  passive.onAllyHealHaste = Math.min(0.18, passive.onAllyHealHaste);
  passive.healAmp = Math.min(0.28, passive.healAmp);
  passive.onAllyHealShield = Math.min(24, passive.onAllyHealShield);
  passive.onAllyHealWill = Math.min(12, passive.onAllyHealWill);
  passive.onAllyHealPulse = Math.min(12, passive.onAllyHealPulse);
  passive.antiHeal = Math.min(0.4, passive.antiHeal);
  passive.trueSight = Math.min(7, passive.trueSight);
  passive.emergencyCloak = Math.min(1.6, passive.emergencyCloak);
  passive.gripEscape = Math.max(0, passive.gripEscape);
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
