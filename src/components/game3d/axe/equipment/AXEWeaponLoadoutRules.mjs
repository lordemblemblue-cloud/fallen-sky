// Pure equipment rules shared by inventory, weapon switching, and gear presets.
// Saving a preset does not equip anything; applying it atomically replaces worn items.
export const MAX_AXE_GEAR_PRESETS = 3;
export const MAX_AXE_EQUIPPED_WEAPONS = 3;
const isWeapon = item => item?.category === 'weapon' && item?.slot === 'weapon';

// A saved loadout contains up to three REAL weapons. The drawn weapon is one
// instanceId inside that loadout, not the only equipped item.
export function normalizeAXEEquippedWeapons(items = [], preferredInstanceId = null) {
  const equipped = items.filter(item => isWeapon(item) && item.equipped);
  const active = equipped.find(item => item.instanceId === preferredInstanceId) || equipped[0] || null;
  const keep = new Set([
    ...(active ? [active.instanceId] : []),
    ...equipped.filter(item => item.instanceId !== active?.instanceId)
      .slice(0, MAX_AXE_EQUIPPED_WEAPONS - (active ? 1 : 0)).map(item => item.instanceId),
  ]);
  return {
    items: items.map(item => isWeapon(item) && item.equipped && !keep.has(item.instanceId)
      ? { ...item, equipped: false } : item),
    activeWeaponInstanceId: active?.instanceId || null,
  };
}

// Equip a weapon INTO one of the three slots, optionally replacing the weapon
// in the explicitly selected slot. Do not swap the whole loadout on a draw.
export function equipOnlyAXEWeapon(items = [], instanceId, {
  replaceInstanceId = null, activeInstanceId = null, activate = true,
} = {}) {
  const target = items.find(item => isWeapon(item) && item.instanceId === instanceId);
  if (!target) return { ok: false, reason: 'WEAPON_NOT_OWNED' };
  const already = items.filter(item => isWeapon(item) && item.equipped);
  const replaced = replaceInstanceId && replaceInstanceId !== instanceId
    ? already.find(item => item.instanceId === replaceInstanceId) : null;
  if (!target.equipped && already.length >= MAX_AXE_EQUIPPED_WEAPONS && !replaced)
    return { ok: false, reason: 'WEAPON_SLOTS_FULL' };
  const autoUnequippedIds = replaced ? [replaced.instanceId] : [];
  const next = items.map(item => !isWeapon(item) ? item
    : item.instanceId === instanceId ? { ...item, equipped: true }
    : autoUnequippedIds.includes(item.instanceId) ? { ...item, equipped: false } : item);
  const stillActive = next.some(item => isWeapon(item) && item.equipped && item.instanceId === activeInstanceId);
  const activeWeaponInstanceId = activate || !stillActive ? instanceId : activeInstanceId;
  return { ok: true, items: next, activeWeaponInstanceId, autoUnequippedIds };
}

export function applyAXEEquipmentPresetRules(items = [], savedIds = [], slotDefs = {}) {
  if (!Array.isArray(savedIds) || savedIds.some(id => typeof id !== 'string') ||
      new Set(savedIds).size !== savedIds.length) {
    return { ok: false, reason: 'INVALID_PRESET' };
  }
  const byId = new Map(items.map(item => [item.instanceId, item]));
  const slotCounts = {};
  for (const id of savedIds) {
    const item = byId.get(id);
    if (!item) return { ok: false, reason: 'PRESET_ITEM_MISSING', itemId: id };
    const limit = slotDefs[item.slot]?.maxEquipped;
    if (!Number.isInteger(limit) || limit < 1) return { ok: false, reason: 'INVALID_SLOT', itemId: id };
    slotCounts[item.slot] = (slotCounts[item.slot] || 0) + 1;
    if (slotCounts[item.slot] > limit) return { ok: false, reason: 'PRESET_SLOT_CONFLICT', slot: item.slot };
  }
  const selected = new Set(savedIds);
  const next = items.map(item => item.equipped === selected.has(item.instanceId)
    ? item : { ...item, equipped: selected.has(item.instanceId) });
  const normalized = normalizeAXEEquippedWeapons(next, savedIds.find(id => isWeapon(byId.get(id))));
  return { ok: true, items: normalized.items, activeWeaponInstanceId: normalized.activeWeaponInstanceId };
}
