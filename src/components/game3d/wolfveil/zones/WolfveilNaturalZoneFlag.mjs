// Feature flag for the natural-zone streaming prototype. OFF by default: with
// the flag off nothing of src/components/game3d/wolfveil/zones is constructed
// and Wolfveil runs exactly as before (five-area loader, veils, torii gates,
// cave rings). Turn it on for one browser with either
//   /gameview?naturalZones=1                     (this page load only), or
//   localStorage.setItem('game3d.naturalZones', '1')   (until removed).
// `?naturalZones=0` forces it off for a page load.
export const WOLFVEIL_NATURAL_ZONES_STORAGE_KEY = 'game3d.naturalZones';
export const WOLFVEIL_NATURAL_ZONES_PARAM = 'naturalZones';

const ON = new Set(['1', 'true', 'on', 'yes']);
const OFF = new Set(['0', 'false', 'off', 'no']);

export function wolfveilNaturalZonesEnabled({search = null, storage = null} = {}) {
  try {
    const query = search ?? globalThis.location?.search ?? '';
    const value = new globalThis.URLSearchParams(query).get(WOLFVEIL_NATURAL_ZONES_PARAM);
    if (value != null) {
      const v = value.trim().toLowerCase();
      if (ON.has(v)) return true;
      if (OFF.has(v)) return false;
    }
  } catch { /* no URL: fall through to storage */ }
  try {
    const store = storage ?? globalThis.localStorage;
    const saved = store?.getItem?.(WOLFVEIL_NATURAL_ZONES_STORAGE_KEY);
    return ON.has(String(saved ?? '').trim().toLowerCase());
  } catch {
    return false;
  }
}
