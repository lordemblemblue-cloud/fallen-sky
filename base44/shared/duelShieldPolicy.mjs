// Server-owned Duel AEGIS Shield. Damage still uses the common AXE resolver.
export const DUEL_SHIELD_COOLDOWN_MS = 60000;
export const DUEL_SHIELD_DURATION_MS = 180000;
export const DUEL_SHIELD_HP_RATIO = 0.10;
export const DUEL_CHAIN_SHIELD_PIERCE_RATIO = 0.35;

export function createDuelShield(maxHp, now) {
  const cap = Math.max(1, Math.min(100000, Number(maxHp) || 1));
  return {
    current: Math.max(1, Math.round(cap * DUEL_SHIELD_HP_RATIO)),
    expiresAt: now + DUEL_SHIELD_DURATION_MS,
  };
}
export function activeDuelShield(shield, now) {
  if (!shield || !Number.isFinite(now) || now >= Number(shield.expiresAt || 0)) return 0;
  return Math.max(0, Math.min(100000, Number(shield.current) || 0));
}
export function absorbDuelShieldDamage({ shield, damage, now, chainPierce = false } = {}) {
  const incoming = Math.max(0, Math.round(Number(damage) || 0));
  const active = activeDuelShield(shield, now);
  // Verified charged chains partially pierce the shield, while its remaining
  // portion absorbs damage. No entire shield deletion or unblockable attack.
  const direct = chainPierce && active > 0
    ? Math.floor(incoming * DUEL_CHAIN_SHIELD_PIERCE_RATIO) : 0;
  const protectedDamage = incoming - direct;
  const absorbed = Math.min(active, protectedDamage);
  return {
    hpDamage: direct + (protectedDamage - absorbed),
    absorbed,
    remaining: active - absorbed,
    shieldPierced: direct,
  };
}
