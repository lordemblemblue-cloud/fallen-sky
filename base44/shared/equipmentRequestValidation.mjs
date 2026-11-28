// Validate caller input before privileged loadout initialization or mutation.
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const actions = new Set(['getState', 'equip', 'unequip', 'clear']);
const validId = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 160 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);

export function validateEquipmentRequest(body, isEquipmentSlot) {
  if (!isRecord(body)) return { error: 'Invalid equipment request' };
  const { action = 'getState', data = {} } = body;
  if (!actions.has(action)) return { error: 'Unknown equipment action' };
  if (!isRecord(data)) return { error: 'Invalid equipment data' };
  if (action === 'equip' || action === 'unequip') {
    if (typeof data.slot !== 'string' || !isEquipmentSlot(data.slot)) return { error: 'Unknown equipment slot' };
  }
  if (action === 'equip' && !validId(data.user_card_id)) return { error: 'Invalid user_card_id' };
  return { action, data };
}
