// Transport-neutral parser only. This does not activate an ability or authenticate a socket.
// The server must resolve the active seat lease, class, cooldown and target from trusted state.
import { classAbilityMove } from '../core/classes.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Accept only { type: 'class.ability', slot: 0|1|2|3 }.
 * A slot is an intent, NOT a move ID or authority to apply damage, cooldowns or meter.
 */
export function parseClassAbilityIntent(packet) {
  if (!plain(packet) || Object.keys(packet).length !== 2 ||
      !own(packet, 'type') || !own(packet, 'slot')) {
    return { ok: false, reason: 'invalid-ability-request' };
  }
  const type = Object.getOwnPropertyDescriptor(packet, 'type');
  const slot = Object.getOwnPropertyDescriptor(packet, 'slot');
  if (!own(type, 'value') || !own(slot, 'value') ||
      type.value !== 'class.ability' ||
      !Number.isInteger(slot.value) || slot.value < 0 || slot.value > 3) {
    return { ok: false, reason: 'invalid-ability-request' };
  }
  return { ok: true, slot: slot.value };
}

/**
 * Resolve a parsed intent against the SERVER'S active class, never a class ID in a packet.
 * No gameplay mutation occurs. Caller must separately check authenticated lease, alive
 * state, ability cooldown, resource, range, line of sight and fair-play restrictions.
 */
export function resolveClassAbilityIntent(packet, serverClassId) {
  const parsed = parseClassAbilityIntent(packet);
  if (!parsed.ok) return parsed;
  const moveId = classAbilityMove(serverClassId, parsed.slot);
  return moveId ? { ok: true, slot: parsed.slot, moveId } :
    { ok: false, reason: 'unavailable-class-ability' };
}
