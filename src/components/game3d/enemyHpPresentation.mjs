// UI-only values for overhead enemy HP tanks. Never mutate the world's
// authoritative HP or mistake a missing maximum for a full-health enemy.
export function enemyHpPresentation(hp, maxHp) {
  const maximum = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1;
  const current = Number.isFinite(hp) ? Math.max(0, Math.min(hp, maximum)) : 0;
  const percent = Math.max(0, Math.min(100, (current / maximum) * 100));
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  return {
    current, maximum, percent,
    readout: `${compact.format(Math.ceil(current))} / ${compact.format(Math.ceil(maximum))}`,
  };
}
