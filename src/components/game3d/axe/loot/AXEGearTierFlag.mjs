// The gear-tier switch-over (docs/game3d/GEAR_TIERS_20261119.md): OFF until the owner has seen the
// numbers. While it is off, drops, item levels and the Blacksmith are exactly as before; on, monster
// gear follows the level-1–155 ladders and the Blacksmith offers Tier Up.
//
// Highest first (the same rules as the skill-damage curve setting):
//   1. on a developer machine (a dev build, or localhost): `?gearTiers=1` / `?gearTiers=0` in the
//      address, remembered in this browser until the other value is used;
//   2. the build flag VITE_GAME3D_GEAR_TIERS = 'true' | 'false';
//   3. AXE_GEAR_TIER_CONFIG.enabled (false).
// A live site never reads the address or the browser storage for this.
import { AXE_GEAR_TIER_CONFIG } from '../../../../../base44/shared/axeGearTiers.ts';

export const GEAR_TIERS_QUERY = 'gearTiers';
export const GEAR_TIERS_STORAGE_KEY = 'axe_gear_tiers_v1';

const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1'
  || hostname === '[::1]' || hostname === '::1' || String(hostname).endsWith('.localhost');

export function resolveGearTiersEnabled({
  base = AXE_GEAR_TIER_CONFIG.enabled, env = {}, search = '', storage = null, hostname = '', dev = false,
} = {}) {
  if (dev === true || isLocalHost(hostname)) {
    let param = null;
    try { param = new globalThis.URLSearchParams(search).get(GEAR_TIERS_QUERY); } catch { param = null; }
    if (param === '1' || param === '0') {
      try { storage?.setItem?.(GEAR_TIERS_STORAGE_KEY, param); } catch { /* storage may be blocked */ }
      return param === '1';
    }
    try {
      const saved = storage?.getItem?.(GEAR_TIERS_STORAGE_KEY);
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch { /* storage may be blocked */ }
  }
  const build = env?.VITE_GAME3D_GEAR_TIERS;
  if (build === 'true') return true;
  if (build === 'false') return false;
  return base === true;
}

let live = null;

// For tests: forget the resolved setting (or force one with `value`).
export function resetGearTiersEnabled(value = null) { live = typeof value === 'boolean' ? value : null; }

// Whether the game runs on the gear tiers, resolved once per page load.
export function isGearTiersEnabled() {
  if (live !== null) return live;
  let env = {};
  try { env = import.meta.env || {}; } catch { env = {}; }
  const hostname = globalThis.location?.hostname || '';
  const dev = env.DEV === true;
  let storage = null;
  if (dev || isLocalHost(hostname)) {
    try { storage = globalThis.localStorage || null; } catch { storage = null; }
  }
  live = resolveGearTiersEnabled({ env, storage, hostname, dev, search: globalThis.location?.search || '' });
  if (live) globalThis.console?.info?.('[gear tiers] ON: monster gear follows the level 1–155 ladders; the Blacksmith offers Tier Up.');
  return live;
}
