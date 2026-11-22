// Which model each person of the cast wears. Until each has a model of their own
// they wear a clone of a rig the game already ships for its quest givers, scaled
// to their height and tinted with the two colours of their `look`. When real
// models arrive, only CAST_MODELS (and, for a new file, CAST_MODEL_SOURCES) change.
//
// A source is downloaded and parsed once per scene; every person wearing it gets a
// cloned skeleton. `url: 'config:ARCHER_URL'` and `clip: 'config:idle'` name the
// constants in gameWorldConfig.jsx (resolved at load time, so this file stays pure).

export const CAST_MODEL_SOURCES = Object.freeze({
  // The archer FBX that GameWorld3D gives Kira and Noor (and every quest giver
  // whose own GLB fails). It has no clips of its own: idle and run come from the
  // game's standard Mixamo clips, the run made in place and slowed into a walk.
  // Its four meshes: Body (most of the figure, outfit included) takes the first
  // colour, Clothes (wraps and trim) the second, eyes and eyelashes keep their own.
  // The texture is a near-black outfit, so the colour is also added as a glow
  // (castSubsystem tint) or it would not show.
  archer: Object.freeze({
    kind: 'fbx', url: 'config:ARCHER_URL',
    idle: 'config:idle', walk: 'config:run', walkClipSpeed: 3.6, tint: 'multiply',
    tintMeshes: Object.freeze([[/body/i, 0], [/clothes/i, 1]]),
  }),
});

export const CAST_DEFAULT_SOURCE = 'archer';

// Person id -> model. `source` is a key of CAST_MODEL_SOURCES; `height` (m)
// overrides the body's height when a person needs it.
export const CAST_MODELS = Object.freeze({
  sable_vey: Object.freeze({ source: 'archer' }),
  elder_maren: Object.freeze({ source: 'archer' }),
  master_hesper: Object.freeze({ source: 'archer' }),
  bram_lamplighter: Object.freeze({ source: 'archer' }),
  watch_warden_south: Object.freeze({ source: 'archer' }),
  mizuhara_jun: Object.freeze({ source: 'archer' }),
  paneb_scribe: Object.freeze({ source: 'archer' }),
  aelia_sabina: Object.freeze({ source: 'archer' }),
  traveller_tome: Object.freeze({ source: 'archer' }),
  traveller_henut: Object.freeze({ source: 'archer' }),
  traveller_livilla: Object.freeze({ source: 'archer' }),
  goro_sergeant: Object.freeze({ source: 'archer' }),
  titus_oldvine: Object.freeze({ source: 'archer' }),
  edda_miller: Object.freeze({ source: 'archer' }),
  dalla_gravedigger: Object.freeze({ source: 'archer' }),
  tolliver_beekeeper: Object.freeze({ source: 'archer' }),
  hayasaka_colonel: Object.freeze({ source: 'archer' }),
  asagiri_tomoe: Object.freeze({ source: 'archer' }),
  ren_swordswoman: Object.freeze({ source: 'archer' }),
  nakhtamun_general: Object.freeze({ source: 'archer' }),
  meresankh_priestess: Object.freeze({ source: 'archer' }),
  sabu_tracker: Object.freeze({ source: 'archer' }),
  corvinus_legate: Object.freeze({ source: 'archer' }),
  veranius_augur: Object.freeze({ source: 'archer' }),
  courier_dexter: Object.freeze({ source: 'archer' }),
});

/** Standing height in metres for a body from the cast table's `look.body`. */
export function castBodyHeight(body) {
  if (body === 'child') return 1.2;
  if (typeof body === 'string' && body.startsWith('elder_')) return 1.6;
  return 1.7;
}

// A little width from `look.build`, so the same rig does not read as one person.
const BUILD_WIDTH = Object.freeze({
  broad: 1.1, strong: 1.07, round: 1.12, tall: 0.97, thin: 0.93, slight: 0.94, wiry: 0.95,
  small: 0.97, stooped: 1.0,
});
export const castBuildWidth = build => BUILD_WIDTH[build] ?? 1;

const FALLBACK_COLOURS = Object.freeze([0x7a7a7a, 0xd0d0d0]);

/** The model a person wears: source key, height, width, and their two colours. */
export function castModelFor(person) {
  const chosen = CAST_MODELS[person?.id] || null;
  const source = chosen?.source && CAST_MODEL_SOURCES[chosen.source] ? chosen.source : CAST_DEFAULT_SOURCE;
  const colours = Array.isArray(person?.look?.colours) && person.look.colours.length >= 2
    ? [person.look.colours[0], person.look.colours[1]] : [...FALLBACK_COLOURS];
  return {
    source,
    height: Number.isFinite(chosen?.height) ? chosen.height : castBodyHeight(person?.look?.body),
    width: castBuildWidth(person?.look?.build),
    colours,
  };
}

const channel = (hex, shift) => (hex >> shift) & 0xff;
const pack = (r, g, b) => (r << 16) | (g << 8) | b;
/** Moves a colour toward white (amount > 0) or black (amount < 0). */
export function shadeColour(hex, amount) {
  const f = c => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return pack(f(channel(hex, 16)), f(channel(hex, 8)), f(channel(hex, 0)));
}

/**
 * Two people standing together must not look the same. Given the colour pairs
 * already in the scene, returns this person's pair, shaded until it differs from
 * every one of them (the cast table gives Paneb and Henut the same pair).
 */
export function distinctColours(colours, taken = []) {
  const key = pair => pair[0] + ':' + pair[1];
  const used = new Set(taken.map(key));
  let pair = [colours[0], colours[1]];
  for (let i = 1; used.has(key(pair)) && i <= 6; i++) {
    const amount = (i % 2 ? 1 : -1) * 0.18 * Math.ceil(i / 2);
    pair = [shadeColour(colours[0], amount), shadeColour(colours[1], -amount)];
  }
  return pair;
}
