// Preserve only the historical level-100 cap marker (Infinity serialized as null).
// The bank is inert: no payout, rested conversion or level change.
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
export function bankXPAboveCapRaise(save = {}, level, nextXP) {
  const xp = Number.isFinite(nextXP) ? Math.max(0, Number(save?.xp) || 0) : 0;
  const bank = nonnegative(save?.xpBankedAtOldCap);
  if (save?.level !== 100 || level !== 100 || save.xpForNext !== null ||
      !Number.isFinite(nextXP) || nextXP <= 1 || !Number.isFinite(xp) || xp < nextXP) {
    return { xp, xpBankedAtOldCap: bank };
  }
  const kept = nextXP - 1;
  const total = bank + (xp - kept);
  if (!Number.isFinite(total)) return { xp, xpBankedAtOldCap: bank };
  return { xp: kept, xpBankedAtOldCap: total };
}
