// The hero's XP curve and level cap: the world's level-up loops (through gameWorldConfig),
// the progression store (playerHUDStore) and the tests read them here.
// docs/game3d/LEVEL_CAP_155_20261119.md
import { AXE_LEVEL_CAP } from '../../../../base44/shared/axePowerBudget.ts';

export { AXE_LEVEL_CAP };

// XP curve: XP_TABLE[n] = XP to reach level n+2 from n+1; from level 10 every level costs the last entry.
export const XP_TABLE = [5, 7, 14, 22, 35, 50, 70, 95, 125, 160];
// At the level cap no amount of XP is enough, so every level-up loop stops there.
export const xpForLevel = (level) => (level >= AXE_LEVEL_CAP
  ? Infinity
  : XP_TABLE[Math.min(level - 1, XP_TABLE.length - 1)] || 200);

// XP from level 1 to the start of `level`.
export function totalXPToReach(level) {
  let total = 0;
  for (let lv = 1; lv < Math.min(AXE_LEVEL_CAP, Math.max(1, Math.floor(Number(level) || 1))); lv++) total += xpForLevel(lv);
  return total;
}

// XP keeps piling up at the cap (no level costs less than Infinity there); the save keeps it,
// with xpForNext saved as null. When the cap rises, that pile would buy dozens of levels on the
// next kill. Instead the hero keeps their level, the bar keeps what fits below the next level
// (one XP short of it) and the rest is kept in the save as xpBankedAtOldCap, for the owner to
// pay out or not. A save below its cap (xpForNext a number) comes back unchanged.
export function bankXPAboveCapRaise(save = {}) {
  const xp = save?.xp || 0;
  const banked = Number(save?.xpBankedAtOldCap) > 0 ? Number(save.xpBankedAtOldCap) : 0;
  const savedNext = Number(save?.xpForNext);
  const savedAtCap = !(Number.isFinite(savedNext) && savedNext > 0);
  const need = xpForLevel(save?.level || 1);
  if (!savedAtCap || !Number.isFinite(need) || !(Number(xp) >= need)) return { xp, xpBankedAtOldCap: banked };
  const kept = need - 1;
  return { xp: kept, xpBankedAtOldCap: banked + (Number(xp) - kept) };
}
