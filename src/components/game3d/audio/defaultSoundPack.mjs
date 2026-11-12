// Built-in Game 3D sound pack: the owner's recordings, processed by
// tools/game3d/sound-pack into public/game3d/audio (manifest.json there lists
// the source, cut points and use of every file). The combat audio store plays
// these whenever the admin has not uploaded an override for a key, so a fresh
// browser hears the game without any localStorage setup. An upload always wins.

function packDirectory() {
  let base = '/';
  try {
    base = import.meta.env.BASE_URL || '/';
  } catch {
    // Plain Node (tests) has no Vite env; the app is served from the site root.
  }
  return `${base.endsWith('/') ? base : `${base}/`}game3d/audio/`;
}

export const DEFAULT_SOUND_PACK_DIR = packDirectory();

// Key -> files. Keys with several files pick a random variant per play.
export const DEFAULT_SOUND_PACK_FILES = Object.freeze({
  player_melee_swing: Object.freeze([
    'swing-sword-01.mp3', 'swing-sword-02.mp3',
    'swing-whoosh-01.mp3', 'swing-whoosh-02.mp3', 'swing-whoosh-03.mp3',
    'swing-whoosh-04.mp3', 'swing-whoosh-05.mp3',
  ]),
  enemy_hit: Object.freeze([
    'impact-blade-01.mp3', 'impact-blade-02.mp3', 'impact-slash-01.mp3', 'impact-slash-02.mp3',
  ]),
  enemy_critical_hit: Object.freeze(['impact-heavy-01.mp3']),
  combo_finisher: Object.freeze(['combo-finisher-01.mp3']),
  enemy_death: Object.freeze(['monster-death-01.mp3', 'monster-death-02.mp3']),
  armor_break: Object.freeze(['armor-break-01.mp3']),
  chest_open: Object.freeze(['chest-open-01.mp3']),
  level_up: Object.freeze(['level-up-01.mp3']),
  victory: Object.freeze(['victory-01.mp3']),
  ambience_water_flow: Object.freeze(['ambience-water-loop.mp3']),
  ambience_nature: Object.freeze(['ambience-nature-loop.mp3']),
});

export const DEFAULT_ACTION_SOUNDS = Object.freeze(Object.fromEntries(
  Object.entries(DEFAULT_SOUND_PACK_FILES).map(([key, files]) =>
    [key, Object.freeze(files.map(file => DEFAULT_SOUND_PACK_DIR + file))]),
));

const NONE = Object.freeze([]);

export function getDefaultSoundVariants(key) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_ACTION_SOUNDS, key) ? DEFAULT_ACTION_SOUNDS[key] : NONE;
}

// An admin upload replaces every built-in variant of that key.
export function resolveSoundVariants(key, overrides = {}) {
  const uploaded = overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : null;
  return typeof uploaded === 'string' && uploaded ? [uploaded] : getDefaultSoundVariants(key);
}

// Random variant per play that never repeats the previous file of the same
// key, so consecutive swings, hits and deaths do not sound identical.
export function createVariantPicker(random = Math.random) {
  const last = new Map();
  return function pickVariant(key, variants) {
    if (!Array.isArray(variants) || !variants.length) return null;
    const previous = last.get(key);
    const fresh = variants.filter(url => url !== previous);
    const pool = fresh.length ? fresh : variants;
    const r = Number(random());
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * pool.length)));
    const choice = pool[index];
    last.set(key, choice);
    return choice;
  };
}
