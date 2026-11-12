// Combat Foundation 2.1: presentation metadata only. Never changes damage or XP.
export const DAMAGE_MERGE_WINDOW_MS = 140;
export const MAX_DAMAGE_FLOATS = 48;

export function feedbackKindFromStrike(strike) {
  if (!strike || strike.kind !== 'hit') return 'miss';
  if (strike.lethal) return 'lethal';
  return strike.critical ? 'critical' : 'normal';
}

export function addDamageFeedback(entries, { id, enemyId, value, kind = 'normal', born }, mergeWindowMs = DAMAGE_MERGE_WINDOW_MS) {
  const next = [...entries];
  const numeric = typeof value === 'number' && Number.isFinite(value);
  if (numeric) {
    const index = next.findIndex(e =>
      e.enemyId === enemyId && e.kind === kind &&
      typeof e.value === 'number' && Number.isFinite(e.value) &&
      born >= e.born && born - e.born <= mergeWindowMs
    );
    if (index >= 0) {
      next[index] = { ...next[index], value: next[index].value + value,
        hits: (next[index].hits || 1) + 1, born };
      return next;
    }
  }
  next.push({ id, enemyId, value, kind, born, hits: 1 });
  return next.slice(-MAX_DAMAGE_FLOATS);
}

// Small visual flinch: never moves the enemy's combat position or collider.
export function enemyFlinchScale(elapsed, duration = 0.18, critical = false) {
  const t = Math.max(0, Math.min(1, elapsed / Math.max(0.01, duration)));
  const amplitude = critical ? 0.065 : 0.035;
  return 1 - amplitude * Math.sin(Math.PI * t);
}
