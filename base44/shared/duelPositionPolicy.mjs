// Combat 2.9: server-time-stamped *client-reported* duel movement.
// A bounded speed envelope and fresh server timestamps materially improve
// range validation, but do NOT provide a true authoritative physics simulation.
export const DUEL_POSITION_RULES = Object.freeze({
  maxAbsXZ: 15000,
  maxAbsY: 2000,
  maxSpeedMps: 15,
  movementSlackM: 1.5,
  maxElapsedMs: 1200,
  minUpdateMs: 80,
  maxAgeMs: 1600,
  rangeLatencyGraceM: 0.75,
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function parseDuelPosition(value) {
  if (!value || !finite(value.x) || !finite(value.y) || !finite(value.z) ||
      Math.abs(value.x) > DUEL_POSITION_RULES.maxAbsXZ ||
      Math.abs(value.z) > DUEL_POSITION_RULES.maxAbsXZ ||
      Math.abs(value.y) > DUEL_POSITION_RULES.maxAbsY) return null;
  return { x: value.x, y: value.y, z: value.z };
}
export function duelPositionDistance(a,b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x-b.x,a.z-b.z);
}
export function updateDuelPosition(previous, input, now) {
  const position = parseDuelPosition(input);
  if (!position || !finite(now)) return {ok:false,reason:'invalid_position'};
  if (!previous) return {ok:true,position:{...position,at:now},limited:false};
  if (!finite(previous.at) || now < previous.at)
    return {ok:false,reason:'invalid_position_clock'};
  const elapsed = now-previous.at;
  if (elapsed < DUEL_POSITION_RULES.minUpdateMs)
    return {ok:false,reason:'position_too_frequent',retryAfterMs:DUEL_POSITION_RULES.minUpdateMs-elapsed};
  const previousPosition=parseDuelPosition(previous);
  if (!previousPosition) return {ok:false,reason:'corrupt_previous_position'};
  const distance=duelPositionDistance(position,previousPosition);
  const maxStep=DUEL_POSITION_RULES.movementSlackM+
    DUEL_POSITION_RULES.maxSpeedMps *
    Math.min(elapsed,DUEL_POSITION_RULES.maxElapsedMs)/1000;
  if (distance > maxStep) {
    // Reject the teleport rather than shifting the trusted anchor toward it.
    return {ok:false,reason:'position_speed_exceeded',maxStep};
  }
  return {ok:true,position:{...position,at:now},limited:false};
}
export function resolveDuelRange({
  attacker,defender,now,weaponRange,grace=DUEL_POSITION_RULES.rangeLatencyGraceM,
}={}) {
  const a=parseDuelPosition(attacker),b=parseDuelPosition(defender);
  if (!a || !b || !finite(attacker?.at) || !finite(defender?.at) || !finite(now) ||
      attacker.at>now || defender.at>now ||
      now-attacker.at>DUEL_POSITION_RULES.maxAgeMs ||
      now-defender.at>DUEL_POSITION_RULES.maxAgeMs)
    return {ok:false,reason:'position_stale',distance:null};
  const distance=duelPositionDistance(a,b);
  if (!finite(weaponRange) || weaponRange<=0 ||
      distance>weaponRange+Math.max(0,grace))
    return {ok:false,reason:'out_of_range',distance};
  return {ok:true,distance};
}
