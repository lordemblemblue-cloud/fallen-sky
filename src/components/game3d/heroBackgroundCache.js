// ─── HeroBackground shared cache ──────────────────────────────────────
// Game audio entries (world theme, combat theme, login theme) all live in
// the HeroBackground table. Combat can start/stop many times per minute and
// the game world can remount, so querying this table per event blew past the
// platform read rate limit (70 list calls / 60s per caller).
//
// One lookup is now shared by every caller: memory cache + localStorage so a
// reload does not re-query, a single in-flight request, and a cooldown after a
// failure so an error can never turn into a retry storm.

import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'atomx_hero_backgrounds_v1';
const TTL_MS = 24 * 60 * 60 * 1000; // refresh the list at most once a day
const FAILURE_COOLDOWN_MS = 30 * 1000;

let memory = null;      // { at, items }
let inFlight = null;
let retryAfter = 0;

function readStored() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    if (!(Date.now() - Number(parsed.at || 0) < TTL_MS)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(snapshot) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* storage optional */ }
}

/**
 * Returns the cached HeroBackground entries, loading them at most once.
 * Never throws: on failure it resolves to the last known list (or []) so
 * gameplay audio simply stays quiet instead of erroring.
 */
export async function loadHeroBackgrounds() {
  if (memory && Date.now() - memory.at < TTL_MS) return memory.items;

  const stored = readStored();
  if (stored) {
    memory = stored;
    return stored.items;
  }

  if (Date.now() < retryAfter) return memory?.items || [];

  if (!inFlight) {
    inFlight = base44.entities.HeroBackground.list()
      .then((result) => {
        const items = Array.isArray(result) ? result : (result?.items || []);
        if (items.length) {
          memory = { at: Date.now(), items };
          writeStored(memory);
        }
        return items;
      })
      .catch((err) => {
        retryAfter = Date.now() + FAILURE_COOLDOWN_MS;
        console.warn('[heroBackgroundCache] lookup failed, using cached audio:', err?.message || err);
        return memory?.items || [];
      })
      .finally(() => { inFlight = null; });
  }

  return inFlight;
}

/** First entry whose title matches (case-insensitive), else null. */
export async function findHeroBackground(title) {
  const wanted = String(title || '').trim().toLowerCase();
  const items = await loadHeroBackgrounds();
  return items.find((b) => (b.title || '').trim().toLowerCase() === wanted) || null;
}