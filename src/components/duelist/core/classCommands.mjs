// Server-owned command allowlist for Duelist Adventure's four combat classes.
// A player with no class selected keeps the legacy moves until their next spawn.
// Only powers that already have actual simulation effects are enabled here:
// unsupported class abilities remain unavailable rather than becoming a fake
// animation or being silently mapped to a different move.
import { classById } from './classes.mjs';

export const CLASS_COMMON_COMMANDS = Object.freeze([
  'light', 'heavy', 'roll', 'blockDown', 'blockUp', 'resist', 'release',
]);
export const LIVE_CLASS_POWER_COMMANDS = Object.freeze(['push', 'pull', 'grip']);
const COMMON = new Set(CLASS_COMMON_COMMANDS);
const LIVE = new Set(LIVE_CLASS_POWER_COMMANDS);

/** Commands authorized for the selected class, derived from its four powers. */
export function allowedClassCommands(classId) {
  const def = classById(classId);
  if (!def) return [...CLASS_COMMON_COMMANDS];
  const powers = def.abilities.map(a => a.id).filter(id => LIVE.has(id));
  return [...CLASS_COMMON_COMMANDS, ...powers];
}

/** Filter at the authoritative match boundary; caller owns classId. */
export function filterClassPresses(classId, presses) {
  if (!Array.isArray(presses)) return [];
  if (classId === null || classId === undefined) return presses; // existing no-class matches
  const allowed = new Set(allowedClassCommands(classId));
  return presses.filter(command => typeof command === 'string' && (COMMON.has(command) || allowed.has(command)));
}
