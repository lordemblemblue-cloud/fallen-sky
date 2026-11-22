// The kinds of monster The War of Three Roads can put on the ground.
//
// One row per kind. Adding a kind (a wolf, a bear, a scorpion) is one new row
// plus its asset list: `loadAssets()` resolves to
//   { model: url, clips: { idle, walk?, run, attack, death, dying? } }
// where every value is an FBX url. `walk` may be left out: the run clip is
// then slowed into a walk, as the game already does for C1 and the zombies.
//
// The asset lists are imported lazily so this table stays pure and node can
// read it in tests (creatureAssets.jsx is JSX; the other two are plain .mjs).
//
// Fields:
//   id, name        stable id; the name shown over the monster's health bar
//   height          standing height in metres (the model is scaled to it)
//   look            'ink' = every material replaced by one wet-ink standard
//                   material (near-black, a little sheen, no texture);
//                   'native' = the model's own materials, cloned per monster
//   aiProfile       a profile of ai/EnemyCombatIntelligence.mjs
//   defaultTier     tier of gameWorldConfig / getAXEEnemyStats when a group
//                   does not say
//   clipSpeed       time scale per clip role (walk, run)
//   deathChain      true when the model has two death clips: `dying` plays
//                   first and `death` follows (the owner's zombie set)
//   rigPrefix       documentation only: the skeleton's bone prefix
export const ENEMY_KIND_FIELDS = Object.freeze([
  'id', 'name', 'height', 'look', 'aiProfile', 'defaultTier', 'clipSpeed', 'deathChain', 'loadAssets',
]);

export const ENEMY_TIERS = Object.freeze(['normal', 'champion', 'elite']);
// Tier scale, copied from ENEMY_TIERS in gameWorldConfig.jsx (a .jsx node cannot read).
export const ENEMY_TIER_SCALE = Object.freeze({ normal: 1, champion: 1.12, elite: 1.22 });
export const ENEMY_AI_PROFILES = Object.freeze(['standard', 'aggressive', 'bruiser']);

// Wet ink: near-black, a little sheen, no texture. Standard material only.
export const INK_LOOK = Object.freeze({ color: 0x06070a, roughness: 0.24, metalness: 0.2,
  emissive: 0x000000 });

const kind = row => Object.freeze({ ...row, clipSpeed: Object.freeze({ walk: 0.55, run: 0.8, ...row.clipSpeed }) });

export const ENEMY_KINDS = Object.freeze({
  // The legacy creature rig ("Survivor A Lusth") and its mutant clip set,
  // drawn as a figure of wet ink.
  ink_shade: kind({
    id: 'ink_shade',
    name: 'Ink Shade',
    height: 1.95,
    look: 'ink',
    aiProfile: 'standard',
    defaultTier: 'normal',
    deathChain: false,
    rigPrefix: 'mixamorig',
    async loadAssets() {
      const { CREATURE_MODEL_URL: model, CREATURE_ANIMATION_URLS: urls } = await import('../../creatureAssets.jsx');
      return { model, clips: { idle: urls.idle, walk: urls.walk, run: urls.run, attack: urls.attack, death: urls.death } };
    },
  }),
  // The owner's zombie ("Vampire A Lusth"): mesh, skeleton and six clips.
  old_dead: kind({
    id: 'old_dead',
    name: 'Old Dead',
    height: 1.75,
    look: 'native',
    aiProfile: 'aggressive',
    defaultTier: 'normal',
    deathChain: true,
    rigPrefix: 'mixamorig:',
    clipSpeed: { walk: 0.42, run: 0.92 },
    async loadAssets() {
      const { WOLFVEIL_ZOMBIE_OWNER_ASSETS: a } = await import('../../wolfveil/WolfveilZombieOwnerAssets.mjs');
      return { model: a.model, clips: { idle: a.idle, run: a.run, attack: a.attack, dying: a.dying, death: a.death } };
    },
  }),
  // The owner's Admin Model3D "C1" and its assigned clips. No walk is
  // assigned: the run clip is slowed into one (WOLFVEIL_ADMIN_C1_WALK_POLICY).
  echo: kind({
    id: 'echo',
    name: 'Echo',
    height: 1.7,
    look: 'native',
    aiProfile: 'standard',
    defaultTier: 'normal',
    deathChain: false,
    rigPrefix: 'mixamorig',
    async loadAssets() {
      const { WOLFVEIL_ADMIN_C1_MODEL: m, WOLFVEIL_ADMIN_C1_ANIMATIONS: c } = await import('../../wolfveil/WolfveilEnemyAssets.mjs');
      return { model: m.modelUrl, clips: { idle: c.idle.url, run: c.run.url, attack: c.attack.url, death: c.death.url } };
    },
  }),
});

export const getEnemyKind = id => (Object.prototype.hasOwnProperty.call(ENEMY_KINDS, id) ? ENEMY_KINDS[id] : null);

// Clip roles every kind must supply, and the ones that may be missing.
export const REQUIRED_CLIP_ROLES = Object.freeze(['idle', 'run', 'attack', 'death']);
export const OPTIONAL_CLIP_ROLES = Object.freeze(['walk', 'dying']);
