// Reversible switch between the v5 character bodies (Getsuga / Artemis) and the fused Mixamo bodies
// (tools/avatar-fuse + tools/avatar-motion/retarget-fused.mjs).
//
// Off by default. Turn it on for a build with VITE_FUSED_CHARACTERS=1, or for one browser with
// `?fusedCharacters=1` (remembered; `?fusedCharacters=0` clears it). It is read once per page load: every
// loader, rig id and clip choice in the session sees the same body.
//
// No three.js import here: avatarCustomization.js (shared with plain data code) reads it too.

const STORAGE_KEY = 'atomxe.fusedCharacters';

function readFlag() {
  let value = null;
  try {
    const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('fusedCharacters') : null;
    if (query === '1' || query === '0') {
      value = query === '1';
      try { if (value) window.localStorage.setItem(STORAGE_KEY, '1'); else window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    } else if (typeof window !== 'undefined') {
      try { if (window.localStorage.getItem(STORAGE_KEY) === '1') value = true; } catch { /* storage blocked */ }
    }
  } catch { /* no window (node tests) */ }
  if (value !== null) return value;
  let env;
  try { env = import.meta.env?.VITE_FUSED_CHARACTERS; } catch { env = undefined; }
  return env === '1' || env === 'true';
}

export const FUSED_CHARACTERS_ENABLED = readFlag();

export const FUSED_RIG_IDS = Object.freeze({ male: 'fused-male-v1', female: 'fused-female-v1' });
export const V5_RIG_IDS = Object.freeze({ male: 'getsuga-v1', female: 'artemis-v1' });
