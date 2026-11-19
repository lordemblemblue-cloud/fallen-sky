// Pure equipment rules shared by inventory, weapon switching, and gear presets.
// Saving a preset does not equip anything; applying it atomically replaces worn items.
export const MAX_AXE_GEAR_PRESETS = 3;
const isWeapon = item => item?.category === 'weapon' && item?.slot === 'weapon';

export function normalizeAXEEquippedWeapons(items = [], preferredInstanceId = null) {
  const active = items.find(item => isWeapon(item) && item.equipped && item.instanceId === preferredInstanceId)
    || items.find(item => isWeapon(item) && item.equipped);
  const activeWeaponInstanceId = active?.instanceId || null;
  return {
    items: items.map(item => isWeapon(item) && item.equipped && item.instanceId !== activeWeaponInstanceId
      ? { ...item, equipped: false } : item),
    activeWeaponInstanceId,
  };
}

export function equipOnlyAXEWeapon(items = [], instanceId) {
  const target = items.find(item => isWeapon(item) && item.instanceId === instanceId);
  if (!target) return { ok: false, reason: 'WEAPON_NOT_OWNED' };
  const autoUnequippedIds = items.filter(item => isWeapon(item) && item.equipped && item.instanceId !== instanceId)
    .map(item => item.instanceId);
  return {
    ok: true,
    items: items.map(item => isWeapon(item)
      ? (item.equipped === (item.instanceId === instanceId) ? item : { ...item, equipped: item.instanceId === instanceId })
      : item),
    activeWeaponInstanceId: instanceId,
    autoUnequippedIds,
  };
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
