// Only the authoritative world may emit a special-spend event. Even trusted
// simulation effects must never poison a player's 0–100 resource with NaN.
import { SPECIAL_MAX } from '../core/classes.mjs';

/** Return null for malformed state/effects; never mint or corrupt meter. */
export function settleSpecialSpend(meter, cost) {
  if (!Number.isFinite(meter) || meter < 0 || meter > SPECIAL_MAX ||
      !Number.isFinite(cost) || cost <= 0 || cost > SPECIAL_MAX ||
      cost > meter + 1e-8) return null;
  return Math.max(0, Math.min(SPECIAL_MAX, meter - cost));
}
