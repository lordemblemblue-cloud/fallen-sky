// Server-rolled item upgrades (docs/game3d/SERVER_UPGRADES.md), shared by the itemUpgrade
// function, the Character Vault and the game.
//
// Reinforcement (Enchant %), over-enchant, refine, ultimate, Combine and Ascension (service
// 'stage') can fail, downgrade, fracture, seal, destroy an item or consume a donor. The server
// rolls them, keeps each item's result (Game3DItemUpgrade), and the Character Vault puts that
// result back into any save that says otherwise, so a reloaded browser save can't undo a bad
// roll, an edited one can't add levels, and a donor used up by Combine or Ascension stays gone
// (docs/game3d/BLACKSMITH_V2_20261118.md). The gear-tier tier-up (service 'tier_up';
// docs/game3d/GEAR_TIERS_20261119.md) moves an item to its next step: its record is the item's
// own level, stats and look in the inventory, and a save that undoes it gets it back.
import { resolveReinforcement, resolveOverEnchant } from './axeItemEnhancement.ts';
import { resolveAscensionRecord, resolveCombineRecord, resolveRefine, resolveUltimate } from './axeItemAdvancement.ts';
import { getAXEAscensionCost, getAXECombineCost, getAXEOverEnchantCost, getAXEReinforcementCost, getAXEServiceInventoryCost } from './axeServiceEconomy.ts';
import { applyAXEGearTierRecord, getAXEGearTierUpCost, previewAXEGearTierUp, readAXEGearTierRecord } from './axeGearTiers.ts';

type Rec = Record<string, any>;
type Save = Record<string, string>;

export const SERVER_ROLLED_UPGRADES = Object.freeze(['reinforcement', 'over_enchant', 'refine', 'ultimate', 'combine', 'stage', 'tier_up']);
// an upgrade whose record is the inventory item itself (level, stats, look), not a separate entry
export const ITEM_RECORD_UPGRADES = Object.freeze(['tier_up']);
// upgrades that take a second item (the donor), consumed on success
export const DONOR_UPGRADES = Object.freeze(['combine', 'stage']);

// an item's whole advancement entry, as the game's advancement store starts it
export const DEFAULT_ADVANCEMENT = Object.freeze({
  combine: { count: 0 },
  stage: { rank: 0, id: 'stage_0', label: 'Base' },
  refine: { level: 0 },
  ultimate: { level: 0, sealed: false },
});

// where each upgrade lives in a character save: the key, the field inside the item's entry
// (none: the entry itself), and the record an item has before its first upgrade
const PLACES: Record<string, { key: string; field: string | null; base: Rec }> = {
  reinforcement: { key: 'axe_reinforcement_v1', field: null, base: { percent: 0 } },
  over_enchant: { key: 'axe_over_enchant_v1', field: null, base: { level: 0, fractured: false } },
  refine: { key: 'axe_item_advancement_v2', field: 'refine', base: { level: 0 } },
  ultimate: { key: 'axe_item_advancement_v2', field: 'ultimate', base: { level: 0, sealed: false } },
  combine: { key: 'axe_item_advancement_v2', field: 'combine', base: { count: 0 } },
  stage: { key: 'axe_item_advancement_v2', field: 'stage', base: { rank: 0, id: 'stage_0', label: 'Base' } },
  // the inventory item's own tier fields (readAXEGearTierRecord)
  tier_up: { key: 'axe_equipment_inventory_v2', field: null, base: {} },
};
const INVENTORY_KEY = 'axe_equipment_inventory_v2';
const LOOT_KEY = 'game_loot_inventory_v2';
const PROGRESSION_KEY = 'wwm_player_progression_v1';

// the hero's level in a save (the server checks a tier-up against it)
export function heroLevelOf(save: Save | null | undefined): number | null {
  const level = Number(parse(save?.[PROGRESSION_KEY])?.level);
  return Number.isFinite(level) && level >= 1 ? Math.floor(level) : null;
}

export const upgradeBase = (service: string): Rec => ({ ...(PLACES[service]?.base || {}) });

const parse = (raw: unknown): any => { try { return typeof raw === 'string' ? JSON.parse(raw) : null; } catch { return null; } };
const sorted = (rec: Rec): string => JSON.stringify(Object.keys(rec).sort().map((k) => [k, rec[k]]));
const same = (service: string, a: Rec | null | undefined, b: Rec | null | undefined) =>
  sorted({ ...PLACES[service].base, ...(a || {}) }) === sorted({ ...PLACES[service].base, ...(b || {}) });
const idOf = (item: Rec | null | undefined) => String(item?.instanceId || item?.id || '');

export function inventoryItems(save: Save | null | undefined): Rec[] {
  const items = parse(save?.[INVENTORY_KEY])?.items;
  return Array.isArray(items) ? items : [];
}

export function findItem(save: Save | null | undefined, itemId: string): Rec | null {
  return inventoryItems(save).find((i) => i?.instanceId === itemId || (!i?.instanceId && i?.id === itemId)) || null;
}

// the item's record for one upgrade, or null when it has never had one
export function readUpgrade(save: Save | null | undefined, service: string, itemId: string): Rec | null {
  if (ITEM_RECORD_UPGRADES.includes(service)) return readAXEGearTierRecord(findItem(save, itemId));
  const place = PLACES[service];
  const entry = parse(save?.[place.key])?.[itemId];
  if (!entry) return null;
  return (place.field ? entry[place.field] : entry) || null;
}

function writeUpgrade(save: Save, service: string, itemId: string, record: Rec): Save {
  if (ITEM_RECORD_UPGRADES.includes(service)) {
    const inv = parse(save[INVENTORY_KEY]) || {};
    const items = (inv.items || []).map((i: Rec) => (idOf(i) === itemId ? applyAXEGearTierRecord(i, record) : i));
    return { ...save, [INVENTORY_KEY]: JSON.stringify({ ...inv, items }) };
  }
  const place = PLACES[service];
  const map = parse(save[place.key]) || {};
  const entry = place.field ? { ...DEFAULT_ADVANCEMENT, ...(map[itemId] || {}), [place.field]: record } : record;
  return { ...save, [place.key]: JSON.stringify({ ...map, [itemId]: entry }) };
}

// every item the server used up as a Combine or Ascension donor (rows of any upgrade)
export function consumedItemIds(rows: Array<{ consumed?: string[] }> = []): Set<string> {
  const ids = new Set<string>();
  for (const row of rows || []) for (const id of row?.consumed || []) if (id) ids.add(String(id));
  return ids;
}

// A gear-tier tier-up as a roll: the item with its current tier record, moved one step.
function resolveTierUp(before: Rec, item: Rec | null, heroLevel: number | null, roll: number) {
  if (!item) return { ok: false, reason: 'ITEM_MISSING', record: before };
  const preview = previewAXEGearTierUp(applyAXEGearTierRecord(item, before), { heroLevel });
  if (!preview.ok) return { ok: false, reason: preview.reason, record: before };
  if (roll > preview.chance) return { ok: false, outcome: 'failure', chance: preview.chance, record: before };
  return { ok: true, outcome: 'success', chance: preview.chance, record: { ...before, ...preview.record } };
}

// the game's own rules, with the server's roll; `after` is the record the item keeps.
// Combine and Ascension also take the donor, as the server's copy of the save holds it; a tier-up
// checks the hero's level in that save.
export function rollUpgrade(service: string, before: Rec, { roll, protectedAttempt = false, item = null, donor = null, heroLevel = null }: { roll: number; protectedAttempt?: boolean; item?: Rec | null; donor?: Rec | null; heroLevel?: number | null }) {
  const opts = { roll, protectedAttempt };
  let result: Rec;
  if (service === 'reinforcement') result = resolveReinforcement(before, { ...opts, item });
  else if (service === 'over_enchant') result = resolveOverEnchant(before, opts);
  else if (service === 'refine') result = resolveRefine(before, opts);
  else if (service === 'ultimate') result = resolveUltimate(item, before, opts);
  else if (service === 'combine') result = resolveCombineRecord(before, item, donor, { roll });
  else if (service === 'stage') result = resolveAscensionRecord(before, item, donor, { roll });
  else if (service === 'tier_up') result = resolveTierUp(before, item, heroLevel, roll);
  else return { ok: false, reason: 'not_a_server_rolled_upgrade' };
  // at the cap, an item that can't take it, or a donor that doesn't match: nothing rolled, nothing changes
  if (result.reason) return { ok: false, reason: result.reason, before, after: before };
  const after = result.destroyed ? { ...before, destroyed: true } : result.record;
  const donorConsumed = DONOR_UPGRADES.includes(service) && !!result.donorConsumed;
  return {
    ok: !!result.ok, outcome: result.outcome, chance: result.chance ?? null, destroyed: !!result.destroyed, before, after,
    ...(DONOR_UPGRADES.includes(service) ? { donorId: donor ? idOf(donor) : null, donorConsumed } : {}),
  };
}

// ---- costs: the server pays each attempt from its copy of the save ----

// What one attempt costs at the item's record before the roll (the game charges the same).
// Ascension's catalyst depends on the result: `success` left out gives the most it can cost.
export function upgradeCost(service: string, before: Rec, { protectedAttempt = false, item = null, success }: { protectedAttempt?: boolean; item?: Rec | null; success?: boolean } = {}): Record<string, number> {
  if (service === 'reinforcement') return getAXEReinforcementCost(before?.percent, { protectedAttempt });
  if (service === 'over_enchant') return getAXEOverEnchantCost(before?.level, { protectedAttempt });
  if (service === 'refine' || service === 'ultimate') return getAXEServiceInventoryCost(service, { advancement: { [service]: before }, protectedAttempt });
  if (service === 'combine') return getAXECombineCost();
  if (service === 'stage') return getAXEAscensionCost({ success, item, advancement: { stage: before } });
  if (service === 'tier_up') return item ? getAXEGearTierUpCost(applyAXEGearTierRecord(item, before)) : {};
  return {};
}

// every loot unit (one material, gem, ...) in a save; each has its own dropId
export function lootUnits(save: Save | null | undefined): Array<{ id: string; dropId: string }> {
  const inv = parse(save?.[LOOT_KEY]) || {};
  return Object.values(inv).flatMap((list: any) => (Array.isArray(list) ? list : [])
    .filter((u: any) => u && u.dropId).map((u: any) => ({ id: String(u.id), dropId: String(u.dropId) })));
}

// how many times each dropId was spent (a dropId can, rarely, be on two units)
export function spentCounts(rows: Array<{ spent?: string[] }> = []): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) for (const id of row?.spent || []) counts.set(id, (counts.get(id) || 0) + 1);
  return counts;
}

// the units the server takes for a cost, from its copy of the save, never one already spent
export function pickCostUnits(save: Save | null | undefined, cost: Record<string, number>, spent: Map<string, number> = new Map()) {
  const left = new Map(spent);
  const available = lootUnits(save).filter((u) => {
    const n = left.get(u.dropId) || 0;
    if (n > 0) { left.set(u.dropId, n - 1); return false; }
    return true;
  });
  const dropIds: string[] = [];
  const missing: Record<string, number> = {};
  for (const [id, count] of Object.entries(cost)) {
    const units = available.filter((u) => u.id === id).slice(0, count);
    if (units.length < count) missing[id] = count - units.length;
    dropIds.push(...units.map((u) => u.dropId));
  }
  return Object.keys(missing).length ? { ok: false as const, missing } : { ok: true as const, dropIds };
}

// a save that still holds units the server spent (a reloaded save) loses them again
function removeSpentUnits(save: Save, spent: Map<string, number>) {
  const inv = parse(save[LOOT_KEY]);
  if (!inv || !spent.size) return { data: save, removed: 0 };
  const left = new Map(spent);
  let removed = 0;
  const next = Object.fromEntries(Object.entries(inv).map(([category, list]: [string, any]) => [category, Array.isArray(list) ? list.filter((u: any) => {
    const n = u?.dropId ? left.get(String(u.dropId)) || 0 : 0;
    if (n > 0) { left.set(String(u.dropId), n - 1); removed += 1; return false; }
    return true;
  }) : list]));
  return removed ? { data: { ...save, [LOOT_KEY]: JSON.stringify(next) }, removed } : { data: save, removed: 0 };
}

// a save without the given items (destroyed by refine or used up as a donor)
function withoutItems(save: Save, gone: Set<string>): Save {
  const inv = parse(save[INVENTORY_KEY]) || {};
  const items = (inv.items || []).filter((i: Rec) => !gone.has(idOf(i)));
  const active = gone.has(String(inv.activeWeaponInstanceId || '')) ? null : inv.activeWeaponInstanceId ?? null;
  return { ...save, [INVENTORY_KEY]: JSON.stringify({ ...inv, items, activeWeaponInstanceId: active }) };
}

// The server's copy of a save as the server knows it now: donors it used up are gone even
// before the next save from the device arrives (itemUpgrade rolls on this copy).
export function saveAsServerKnows(save: Save, rows: Array<{ consumed?: string[] }> = []): Save {
  const consumed = consumedItemIds(rows);
  if (!consumed.size || !inventoryItems(save).some((i) => consumed.has(idOf(i)))) return save;
  return withoutItems(save, consumed);
}

export type LedgerRow = { item_id: string; service: string; record: Rec; spent?: string[]; consumed?: string[] };

// The Vault's rule: for every item the save owns, each server-rolled upgrade is the server's.
// With a ledger row, the record must be that row's. Without one, it may not change from the
// previous server save (the first save is the starting point). An item the server destroyed
// or used up as a donor leaves the inventory. Returns the save to keep and what was put back.
export function enforceUpgradeLedger(save: Save, previous: Save | null, ledger: LedgerRow[] = []) {
  const corrections: string[] = [];
  // materials the server spent on its rolls stay spent
  const paid = removeSpentUnits(save, spentCounts(ledger));
  if (paid.removed) corrections.push(`${paid.removed} spent material(s) removed`);
  save = paid.data;
  const owned = new Set(inventoryItems(save).map((i) => idOf(i)).filter(Boolean));
  if (!owned.size) return { data: save, corrections };
  const byKey = new Map(ledger.filter((r) => r && SERVER_ROLLED_UPGRADES.includes(r.service)).map((r) => [`${r.item_id}::${r.service}`, r.record || {}]));
  let data = save;

  const consumed = consumedItemIds(ledger);
  const destroyed = [...owned].filter((id) => byKey.get(`${id}::refine`)?.destroyed);
  const usedUp = [...owned].filter((id) => consumed.has(id) && !destroyed.includes(id));
  if (destroyed.length || usedUp.length) {
    data = withoutItems(data, new Set([...destroyed, ...usedUp]));
    destroyed.forEach((id) => { owned.delete(id); corrections.push(`${id}: destroyed by refine`); });
    usedUp.forEach((id) => { owned.delete(id); corrections.push(`${id}: used up as a donor`); });
  }

  for (const service of SERVER_ROLLED_UPGRADES) {
    if (ITEM_RECORD_UPGRADES.includes(service)) continue; // below
    // a record deleted from the save counts too (deleting a fracture or a seal is a change)
    const ids = [...owned].filter((id) => byKey.has(`${id}::${service}`) || readUpgrade(data, service, id) || readUpgrade(previous, service, id));
    for (const id of ids) {
      const current = readUpgrade(data, service, id);
      const allowed = byKey.has(`${id}::${service}`) ? byKey.get(`${id}::${service}`)! : previous ? readUpgrade(previous, service, id) : current;
      if (same(service, current, allowed)) continue;
      data = writeUpgrade(data, service, id, { ...PLACES[service].base, ...(allowed || {}) });
      corrections.push(`${id}: ${service} ${JSON.stringify(current)} -> ${JSON.stringify(allowed || PLACES[service].base)}`);
    }
  }

  // Tier-ups live on the item itself, which other systems may also change (Weapon Legacy raises a
  // level): only a server tier-up is enforced, and only when a save went back below it (a reloaded
  // save) or kept its level with other stats (an edited one).
  for (const id of owned) {
    const allowed = byKey.get(`${id}::tier_up`);
    if (!allowed) continue;
    const current = readUpgrade(data, 'tier_up', id);
    if (!current) continue;
    const below = Number(current.level) < Number(allowed.level);
    if (!below && (Number(current.level) !== Number(allowed.level) || same('tier_up', current, allowed))) continue;
    data = writeUpgrade(data, 'tier_up', id, allowed);
    corrections.push(`${id}: tier_up Lv ${current.level} -> Lv ${allowed.level}`);
  }
  return { data, corrections };
}

// a restore brings back its own item records, materials and donors; the ledger follows it, so
// the restored items are not put back to what the ledger held before, the restored materials
// are no longer counted as spent and the restored donors no longer count as used up
export function ledgerRecordsFor(save: Save, rows: LedgerRow[]) {
  const restored = new Map<string, number>();
  for (const u of lootUnits(save)) restored.set(u.dropId, (restored.get(u.dropId) || 0) + 1);
  const held = new Set(inventoryItems(save).map((i) => idOf(i)).filter(Boolean));
  return rows.map((r) => {
    const spent = (r.spent || []).filter((id) => {
      const n = restored.get(id) || 0;
      if (n > 0) { restored.set(id, n - 1); return false; }
      return true;
    });
    const consumed = (r.consumed || []).filter((id) => !held.has(String(id)));
    return { row: r, record: { ...PLACES[r.service]?.base, ...(readUpgrade(save, r.service, r.item_id) || {}) }, spent, consumed };
  });
}
