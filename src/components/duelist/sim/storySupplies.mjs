/** Story-only mission supplies. One free, immediate refill per player per operation.
 * No competitive match gold, permanent inventory, or client-authored stats.
 * The mission simulation is the authority in both offline and online crews.
 */
export const STORY_SUPPLIES = Object.freeze([
  Object.freeze({ id: 'field-medkit', name: 'Field Medkit', stat: 'hp', amount: 35, description: 'Restore up to 35 HP during an operation.' }),
  Object.freeze({ id: 'guardian-cell', name: 'Guardian Cell', stat: 'shield', amount: 25, description: 'Restore up to 25 shield during an operation.' }),
  Object.freeze({ id: 'focus-draught', name: 'Focus Draught', stat: 'will', amount: 20, description: 'Restore up to 20 Will during an operation.' }),
]);
const supplyMap = new Map(STORY_SUPPLIES.map(entry => [entry.id, entry]));

/** Validates both the human player seat and current simulation state; clients submit only an ID. */
export function claimStorySupply(mission, playerId, supplyId) {
  if (!mission || mission.phase !== 'live') return { ok: false, reason: 'story-not-live' };
  if (typeof playerId !== 'string' || !mission.seats?.has(playerId)) return { ok: false, reason: 'no-crew-seat' };
  const supply = typeof supplyId === 'string' ? supplyMap.get(supplyId) : null;
  if (!supply) return { ok: false, reason: 'unknown-supply' };
  const seat = mission.seats.get(playerId);
  if (seat.supplyUsed) return { ok: false, reason: 'already-claimed' };
  const fighter = mission.world?.fighters?.get(playerId);
  if (!fighter || fighter.vitals?.dead) return { ok: false, reason: 'fighter-unavailable' };
  const vitals = fighter.vitals;
  const current = vitals[supply.stat];
  const maximum = vitals.max?.[supply.stat];
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) {
    return { ok: false, reason: 'invalid-vitals' };
  }
  if (current >= maximum) return { ok: false, reason: 'already-full' };
  vitals[supply.stat] = Math.max(0, Math.min(maximum, current + supply.amount));
  seat.supplyUsed = supply.id;
  mission.events?.push({ type: 'storySupply', by: playerId, id: supply.id, at: mission.world.time });
  return { ok: true, id: supply.id, stat: supply.stat, value: vitals[supply.stat], remaining: 0 };
}
