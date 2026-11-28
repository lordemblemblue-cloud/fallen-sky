// Optional skill damage curve: a balance setting, OFF by default.
// Rules and before/after numbers: docs/game3d/SKILL_DAMAGE_CURVE_20261118.md
//
// The pure rules are tested straight from skillDamageCurve.mjs. The real skill registry, skill
// executor and weapon inventory use .jsx and extensionless imports that node cannot load, so they
// are bundled with esbuild (as other game3d tests do) and run under tiny window / localStorage shims.

import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SKILL_DAMAGE_CURVE_CONFIG, SKILL_DAMAGE_CURVE_QUERY, SKILL_DAMAGE_CURVE_STORAGE_KEY,
  curvedSkillDamagePct, resolveSkillCurveCap, resolveSkillDamageCurveEnabled,
  skillCurveMultiplier, skillCurveProgress,
} from '../src/components/game3d/skills/skillDamageCurve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ON = { ...SKILL_DAMAGE_CURVE_CONFIG, enabled: true };
const CAPS = { sword: 0.40, ranged: 0.35, guardian: 0.30 };

const near = (actual, expected, message = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message} expected ${expected}, got ${actual}`);

// The spec's formula and today's linear growth, written out here and not taken from the code under test.
const specCurve = (min, cap, level, maxLevel) => {
  const t = Math.min(1, Math.max(0, (level - 1) / Math.max(1, maxLevel - 1)));
  return min * (1 + cap * (0.65 * t + 0.35 * t * t));
};
const linearToday = (skill, level) => {
  const { min, max } = skill.scaling.damage_pct;
  const lvl = Math.max(1, Math.min(skill.max_level, level || 1));
  return min + (max - min) * ((lvl - 1) / Math.max(1, skill.max_level - 1));
};

const fixture = (id, weapon, min, max, maxLevel = 10) =>
  ({ skill_id: id, weapon_type: weapon, max_level: maxLevel, scaling: { damage_pct: { min, max } } });
const heavy = fixture('sword_heavy_strike', 'sword', 1.30, 1.80);
const barrage = fixture('ranged_barrage', 'ranged', 0.80, 1.10);
const crushing = fixture('guardian_crushing_blow', 'guardian', 1.20, 1.70);

// ─── The pure rules ─────────────────────────────────────────────────────

test('the curve ships OFF, with sword +40 %, bow +35 %, daggers +30 % and no per-skill overrides', () => {
  assert.equal(SKILL_DAMAGE_CURVE_CONFIG.enabled, false);
  assert.deepEqual({ ...SKILL_DAMAGE_CURVE_CONFIG.familyCaps }, CAPS);
  assert.deepEqual([...SKILL_DAMAGE_CURVE_CONFIG.guardianWeaponIds], ['dual_blades']);
  assert.deepEqual({ ...SKILL_DAMAGE_CURVE_CONFIG.skillCaps }, {});
  assert.ok(Object.isFrozen(SKILL_DAMAGE_CURVE_CONFIG) && Object.isFrozen(SKILL_DAMAGE_CURVE_CONFIG.familyCaps));
});

test('t and M: level 1 is exactly untouched, max level is 1 + cap, and the curve is slower than linear in between', () => {
  assert.equal(skillCurveProgress(1, 10), 0);
  assert.equal(skillCurveProgress(10, 10), 1);
  assert.equal(skillCurveProgress(5, 10), 4 / 9);
  assert.equal(skillCurveProgress(16, 30), 15 / 29);
  assert.equal(skillCurveProgress(0, 10), 0); // below level 1 behaves like level 1, as scaleStat does
  assert.equal(skillCurveProgress(-3, 10), 0);
  assert.equal(skillCurveProgress(NaN, 10), 0);
  assert.equal(skillCurveProgress(99, 10), 1); // above the max behaves like the max
  assert.equal(skillCurveProgress(1, 1), 0); // a one-level skill never divides by zero
  assert.equal(skillCurveProgress(7, 1), 1);

  assert.equal(skillCurveMultiplier(0.4, 0), 1);
  near(skillCurveMultiplier(0.4, 1), 1.4);
  near(skillCurveMultiplier(0.4, 0.5), 1 + 0.4 * (0.65 * 0.5 + 0.35 * 0.25));
  assert.equal(skillCurveMultiplier(0.4, -1), 1); // t is clamped
  near(skillCurveMultiplier(0.4, 7), 1.4);
  let last = 1;
  for (let i = 1; i <= 100; i += 1) {
    const m = skillCurveMultiplier(0.4, i / 100);
    assert.ok(m > last, 'strictly rising');
    assert.ok(m < 1 + 0.4 * (i / 100) || i === 100, 'below the straight line until the top');
    last = m;
  }
});

test('caps: sword +40 %, bow +35 %, guardian +30 % only while daggers are in hand', () => {
  assert.equal(resolveSkillCurveCap(heavy), 0.40);
  assert.equal(resolveSkillCurveCap(barrage), 0.35);
  assert.equal(resolveSkillCurveCap(crushing, 'dual_blades'), 0.30);
  assert.equal(resolveSkillCurveCap(crushing, 'DUAL_BLADES'), 0.30);
  for (const other of ['sword', 'shield', 'guardian', 'bow', 'sky', 'fists', '', null, undefined, 42]) {
    assert.equal(resolveSkillCurveCap(crushing, other), null, `a guardian skill with ${String(other)} stays linear`);
  }
  // the held weapon is looked up lazily, and only for guardian skills
  let lookups = 0;
  const held = () => { lookups += 1; return 'dual_blades'; };
  assert.equal(resolveSkillCurveCap(heavy, held), 0.40);
  assert.equal(resolveSkillCurveCap(barrage, held), 0.35);
  assert.equal(lookups, 0);
  assert.equal(resolveSkillCurveCap(crushing, held), 0.30);
  assert.equal(lookups, 1);
  // the weapon list is configuration: add an id and that weapon gets the guardian curve too
  const withShield = { ...ON, guardianWeaponIds: ['dual_blades', 'Shield'] };
  assert.equal(resolveSkillCurveCap(crushing, 'shield', withShield), 0.30);
  assert.equal(resolveSkillCurveCap(crushing, 'sword', withShield), null);
  assert.equal(resolveSkillCurveCap(crushing, 'dual_blades', { ...ON, guardianWeaponIds: [] }), null);
  assert.equal(resolveSkillCurveCap(crushing, 'dual_blades', { ...ON, guardianWeaponIds: undefined }), null);
  // universal skills and unknown families never get a cap
  assert.equal(resolveSkillCurveCap(fixture('focus', null, 1, 2)), null);
  assert.equal(resolveSkillCurveCap(fixture('wand_bolt', 'wand', 1, 2)), null);
  assert.equal(resolveSkillCurveCap(null), null);
});

test('a per-skill cap replaces the family cap, null opts one skill out, junk and prototype names are ignored', () => {
  const cfg = { ...ON, skillCaps: { sword_heavy_strike: 0.55, ranged_barrage: null, guardian_crushing_blow: 0.10 } };
  assert.equal(resolveSkillCurveCap(heavy, null, cfg), 0.55);
  assert.equal(resolveSkillCurveCap(barrage, null, cfg), null); // that skill stays linear
  assert.equal(resolveSkillCurveCap(crushing, 'dual_blades', cfg), 0.10);
  assert.equal(resolveSkillCurveCap(crushing, 'shield', cfg), null); // the weapon rule still applies
  assert.equal(resolveSkillCurveCap(fixture('sword_triple_slash', 'sword', 0.9, 1.2), null, cfg), 0.40);
  assert.equal(resolveSkillCurveCap(heavy, null, { ...ON, skillCaps: { sword_heavy_strike: 0 } }), 0); // a real cap
  for (const junk of [-0.1, NaN, Infinity, '0.4', undefined, {}, []]) {
    assert.equal(resolveSkillCurveCap(heavy, null, { ...ON, skillCaps: { sword_heavy_strike: junk } }), null,
      `a junk cap (${String(junk)}) keeps the skill linear`);
  }
  assert.equal(resolveSkillCurveCap(fixture('constructor', 'sword', 1, 2), null, cfg), 0.40);
  assert.equal(resolveSkillCurveCap(fixture('toString', 'sword', 1, 2), null, cfg), 0.40);
  assert.equal(resolveSkillCurveCap(fixture('x', 'constructor', 1, 2), null, cfg), null);
  // a whole family can be switched off too
  assert.equal(resolveSkillCurveCap(heavy, null, { ...ON, familyCaps: { ...CAPS, sword: null } }), null);
  assert.equal(resolveSkillCurveCap(barrage, null, { ...ON, familyCaps: { ...CAPS, sword: null } }), 0.35);
});

test('while the setting is off nothing is curved; on, the value needs only the level-1 damage, so it replaces the linear growth', () => {
  for (const level of [0, 1, 5, 10, 99]) {
    assert.equal(curvedSkillDamagePct(heavy, level, null, SKILL_DAMAGE_CURVE_CONFIG), null);
  }
  assert.equal(curvedSkillDamagePct(heavy, 5, null, { ...ON, enabled: 'true' }), null); // only a real true turns it on
  assert.equal(curvedSkillDamagePct(heavy, 5, null, null), null);
  // same level-1 damage, very different registry maximums: the same curved damage, so nothing stacks
  const gentle = fixture('gentle', 'sword', 1.30, 1.31);
  const steep = fixture('steep', 'sword', 1.30, 9.99);
  for (const level of [1, 3, 7, 10]) {
    assert.equal(curvedSkillDamagePct(gentle, level, null, ON), curvedSkillDamagePct(steep, level, null, ON));
  }
  assert.equal(curvedSkillDamagePct(heavy, 1, null, ON), 1.30); // level 1 is exactly the level-1 value
  near(curvedSkillDamagePct(heavy, 10, null, ON), 1.30 * 1.40);
  // a skill without damage_pct (a buff) has nothing to curve
  const buff = { skill_id: 'x', weapon_type: 'sword', max_level: 10, scaling: { reflect_chance: { min: 0.03, max: 0.07 } } };
  assert.equal(curvedSkillDamagePct(buff, 5, null, ON), null);
  assert.equal(curvedSkillDamagePct(null, 5, null, ON), null);
});

test('the setting: a build flag, and a developer-only ?skillCurve=1 / 0 that is remembered', () => {
  const memory = () => {
    const entries = new Map();
    return { entries, getItem: (k) => (entries.has(k) ? entries.get(k) : null), setItem: (k, v) => { entries.set(k, String(v)); } };
  };
  const flag = (value) => ({ VITE_GAME3D_SKILL_DAMAGE_CURVE: value });
  const asked = (value) => `?${SKILL_DAMAGE_CURVE_QUERY}=${value}`;

  assert.equal(resolveSkillDamageCurveEnabled(), false);
  // a live site ignores the address and the browser storage
  const live = memory();
  live.setItem(SKILL_DAMAGE_CURVE_STORAGE_KEY, '1');
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'play.example.com', search: asked(1), storage: live }), false);
  // the build flag, then the config default
  assert.equal(resolveSkillDamageCurveEnabled({ env: flag('true'), hostname: 'play.example.com' }), true);
  assert.equal(resolveSkillDamageCurveEnabled({ env: flag('false'), base: true }), false);
  assert.equal(resolveSkillDamageCurveEnabled({ env: flag('1') }), false); // only 'true' / 'false' count
  assert.equal(resolveSkillDamageCurveEnabled({ base: true }), true);
  // a developer machine: the address wins over the flag and is remembered
  const storage = memory();
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'localhost', search: asked(1), storage }), true);
  assert.equal(storage.entries.get(SKILL_DAMAGE_CURVE_STORAGE_KEY), '1');
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'localhost', search: '', storage }), true);
  assert.equal(resolveSkillDamageCurveEnabled({ dev: true, search: asked(0), storage }), false);
  assert.equal(storage.entries.get(SKILL_DAMAGE_CURVE_STORAGE_KEY), '0');
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: '127.0.0.1', search: '', storage }), false);
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'localhost', search: asked(0), storage: memory(), env: flag('true') }), false);
  // junk is ignored, and blocked storage never throws
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'localhost', search: asked('yes'), storage: memory() }), false);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'localhost', search: asked(1), storage: blocked }), true);
  assert.equal(resolveSkillDamageCurveEnabled({ hostname: 'localhost', storage: blocked }), false);
});

// ─── The real registry, executor and inventory ──────────────────────────

let temp;
let win;
let api;
const location = { hostname: 'example.test', search: '' };
const shimmed = ['window', 'localStorage', 'location', 'Audio'];

before(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'axe-skill-curve-'));
  const file = path.join(temp, 'skill-curve-bundle.mjs');
  const modules = {
    exec: 'skills/skillExecutor.jsx',
    registry: 'skills/skillRegistry.jsx',
    curve: 'skills/skillDamageCurve.mjs',
    inv: 'axe/equipment/AXEEquipmentInventoryStore.js',
    loadout: 'axe/equipment/AXEWeaponLoadoutRules.mjs',
    storage: 'characterStorage.jsx',
    pipeline: 'progression/weaponMastery/WeaponScalingPipeline.jsx',
  };
  await build({
    stdin: {
      contents: Object.entries(modules).map(([name, f]) => `export * as ${name} from './src/components/game3d/${f}';`).join('\n'),
      resolveDir: root,
    },
    bundle: true, jsx: 'automatic', format: 'esm', platform: 'node', outfile: file,
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'offline-service-boundary',
      setup(b) {
        b.onResolve({ filter: /api\/base44Client/ }, () => ({ path: 'base44-test', namespace: 'offline' }));
        b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({
          contents: 'export const base44 = {auth:{updateMe:async()=>({}), me:async()=>({})}};',
        }));
      },
    }],
    logLevel: 'silent',
  });
  // The executor schedules every hit with setTimeout and some stores start timers when they load:
  // fake timers let a test fire a whole cast at once and leave nothing running afterwards.
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const entries = new Map();
  const localStorage = {
    getItem: (k) => (entries.has(k) ? entries.get(k) : null),
    setItem: (k, v) => { entries.set(k, String(v)); },
    removeItem: (k) => { entries.delete(k); },
    clear: () => entries.clear(),
  };
  win = new globalThis.EventTarget();
  Object.assign(win, { localStorage, location });
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('window', win);
  define('localStorage', localStorage);
  define('location', location);
  // Triple Slash, Double Shot and Barrage start a sound when they are cast.
  define('Audio', class { play() { return Promise.resolve(); } pause() {} });
  api = await import(pathToFileURL(file).href);
  api.storage.setStorageUser('skill-curve-test');
});

after(async () => {
  mock.timers.reset();
  for (const name of shimmed) delete globalThis[name];
  if (temp) await rm(temp, { recursive: true, force: true });
});

const allSkills = () => api.registry.default;
const damageSkills = () => allSkills().filter((skill) => Number.isFinite(skill.scaling?.damage_pct?.min));
const familyOf = (skill) => skill.weapon_type;

test('the registry has damage skills for sword, bow and guardian, and none outside those three', () => {
  const families = new Set(damageSkills().map(familyOf));
  assert.deepEqual([...families].sort(), ['guardian', 'ranged', 'sword']);
  // the six original weapon skills the handoff names
  for (const id of ['sword_heavy_strike', 'sword_triple_slash', 'ranged_double_shot', 'ranged_barrage',
    'guardian_twin_fang', 'guardian_crushing_blow']) {
    assert.ok(api.registry.getSkillById(id)?.scaling?.damage_pct, id);
  }
});

test('OFF: scaleSkillDamage returns exactly scaleStat for every skill and level, with every weapon', () => {
  const off = SKILL_DAMAGE_CURVE_CONFIG;
  for (const skill of damageSkills()) {
    const levels = [-5, 0, 1, 1.5, 2, 3, 5, 7, 9, skill.max_level - 1, skill.max_level, skill.max_level + 1, 99, NaN, undefined];
    for (const level of levels) {
      const today = api.registry.scaleStat(skill, 'damage_pct', level);
      for (const held of [null, 'sword', 'bow', 'dual_blades', 'shield', () => 'dual_blades']) {
        assert.ok(Object.is(api.registry.scaleSkillDamage(skill, level, held, off), today),
          `${skill.skill_id} level ${level} held ${String(held)}`);
      }
    }
  }
});

test('the game as shipped runs with the curve OFF: no address, no build flag, no developer machine', () => {
  location.hostname = 'example.test';
  location.search = '?skillCurve=1'; // a live site must ignore it
  api.curve.resetSkillDamageCurveConfig();
  assert.equal(api.curve.getSkillDamageCurveConfig().enabled, false);
  for (const skill of damageSkills()) {
    for (const level of [1, 4, skill.max_level]) {
      assert.ok(Object.is(api.registry.scaleSkillDamage(skill, level, 'dual_blades'),
        api.registry.scaleStat(skill, 'damage_pct', level)));
    }
  }
  api.curve.resetSkillDamageCurveConfig();
  location.search = '';
});

test('ON: every sword and bow skill keeps its level-1 value and reaches min x (1 + cap) at its max level', () => {
  for (const skill of damageSkills().filter((s) => s.weapon_type !== 'guardian')) {
    const cap = CAPS[skill.weapon_type];
    const { min, max } = skill.scaling.damage_pct;
    assert.equal(api.registry.scaleSkillDamage(skill, 1, null, ON), min, `${skill.skill_id} level 1`);
    assert.equal(api.registry.scaleSkillDamage(skill, 1, null, ON), api.registry.scaleStat(skill, 'damage_pct', 1));
    near(api.registry.scaleSkillDamage(skill, skill.max_level, null, ON), min * (1 + cap), `${skill.skill_id} max`);
    near(api.registry.scaleSkillDamage(skill, skill.max_level + 5, null, ON), min * (1 + cap), `${skill.skill_id} above max`);
    let last = min;
    for (let level = 1; level <= skill.max_level; level += 1) {
      const value = api.registry.scaleSkillDamage(skill, level, null, ON);
      near(value, specCurve(min, cap, level, skill.max_level), `${skill.skill_id} level ${level}`);
      assert.ok(value >= last, `${skill.skill_id} never loses damage by levelling up`);
      assert.ok(value <= min * (1 + cap) + 1e-9, `${skill.skill_id} stays within its cap`);
      last = value;
    }
    // it replaces the linear growth: the registry's own max plays no part
    const reshaped = { ...skill, scaling: { damage_pct: { min, max: max * 7 } } };
    assert.equal(api.registry.scaleSkillDamage(reshaped, Math.max(2, skill.max_level >> 1), null, ON),
      api.registry.scaleSkillDamage(skill, Math.max(2, skill.max_level >> 1), null, ON));
  }
});

test('ON: guardian skills use the curve with daggers and stay exactly linear with any other weapon', () => {
  const guardian = damageSkills().filter((s) => s.weapon_type === 'guardian');
  assert.ok(guardian.length >= 12, 'the two original guardian skills and the guardian ladder');
  for (const skill of guardian) {
    const { min } = skill.scaling.damage_pct;
    for (const level of [1, 2, 5, 10, skill.max_level]) {
      near(api.registry.scaleSkillDamage(skill, level, 'dual_blades', ON), specCurve(min, 0.30, level, skill.max_level),
        `${skill.skill_id} level ${level} with daggers`);
      for (const other of ['sword', 'bow', 'shield', 'guardian', null, undefined, () => null]) {
        assert.ok(Object.is(api.registry.scaleSkillDamage(skill, level, other, ON),
          api.registry.scaleStat(skill, 'damage_pct', level)), `${skill.skill_id} level ${level} with ${String(other)}`);
      }
    }
  }
});

test('ON: a per-skill cap in the config reaches the real skills', () => {
  const cfg = { ...ON, skillCaps: { sword_heavy_strike: 0.55, ranged_barrage: null, guardian_twin_fang: 0.2 } };
  const heavyStrike = api.registry.getSkillById('sword_heavy_strike');
  near(api.registry.scaleSkillDamage(heavyStrike, 10, null, cfg), 1.30 * 1.55);
  near(api.registry.scaleSkillDamage(api.registry.getSkillById('sword_triple_slash'), 10, null, cfg), 0.90 * 1.40);
  const barrageSkill = api.registry.getSkillById('ranged_barrage');
  assert.ok(Object.is(api.registry.scaleSkillDamage(barrageSkill, 6, null, cfg), api.registry.scaleStat(barrageSkill, 'damage_pct', 6)));
  near(api.registry.scaleSkillDamage(api.registry.getSkillById('guardian_twin_fang'), 10, 'dual_blades', cfg), 0.90 * 1.20);
});

// ─── A real cast: registry, executor, weapon inventory and the strike events ──────

let serial = 0;
const weaponItem = (name, masteryWeaponId, axeWeaponRole) => ({
  id: `skill_curve_${name.toLowerCase().replace(/\W+/g, '_')}_${(serial += 1)}`,
  name, slot: 'weapon', category: 'weapon', masteryWeaponId, axeWeaponRole, rarity: 'common', baseStats: { damage: 8 },
});
const owned = {};
// Weapons sit in three persistent slots (AXEWeaponLoadoutRules.mjs), and a switch only draws a weapon
// that is already equipped. So a weapon that is not equipped is equipped into a slot (replacing the one
// in hand when all three are taken), which also draws it; one that is equipped is drawn with a switch.
function hold(kind) {
  if (!owned[kind]) {
    const spec = {
      sword: ['Curve Test Sword', 'sword', 'offensive'],
      bow: ['Curve Test Bow', 'bow', 'ranged'],
      daggers: ['Curve Test Dual Blades', 'dual_blades', 'defensive'],
      shield: ['Curve Test Bastion', 'shield', 'defensive'],
    }[kind];
    const added = api.inv.addAXEEquipmentItem(weaponItem(...spec));
    assert.ok(added.ok, JSON.stringify(added));
    owned[kind] = added.item.instanceId;
  }
  const id = owned[kind];
  const context = { level: 100 };
  const slotsFull = api.inv.getEquippedAXEItemsByCategory('weapon').length >= api.loadout.MAX_AXE_EQUIPPED_WEAPONS;
  const drawn = api.inv.getAXEEquipmentItem(id).equipped
    ? api.inv.switchAXEInventoryWeapon(id, context)
    : api.inv.equipAXEInventoryItem(id, {
      ...context, replaceWeaponInstanceId: slotsFull ? api.inv.getActiveEquippedAXEWeapon()?.instanceId : null,
    });
  assert.ok(drawn.ok, `${kind}: ${JSON.stringify(drawn)}`);
  assert.equal(api.inv.getActiveEquippedAXEWeapon()?.instanceId, id, `${kind} is the weapon in hand`);
}

// Starts a cast and returns a function that lets time pass and gives back every strike it fired.
function startCast(skillId, level) {
  const strikes = [];
  const listener = (event) => strikes.push(event.detail);
  win.addEventListener('playerSkillStrike', listener);
  const result = api.exec.castSkill(skillId, { level });
  assert.equal(result.ok, true, `${skillId}: ${JSON.stringify(result)}`);
  return () => {
    mock.timers.tick(5000);
    win.removeEventListener('playerSkillStrike', listener);
    return strikes;
  };
}
const cast = (skillId, level) => startCast(skillId, level)();

const CORE_CASTS = [
  ['sword_heavy_strike', 'sword'], ['sword_triple_slash', 'sword'],
  ['ranged_double_shot', 'bow'], ['ranged_barrage', 'bow'],
  ['guardian_twin_fang', 'daggers'], ['guardian_crushing_blow', 'daggers'],
  ['guardian_twin_fang', 'shield'], ['guardian_crushing_blow', 'shield'],
];

test('the held weapon is read from the real inventory: daggers are dual_blades, a shield is not', () => {
  hold('daggers');
  assert.equal(api.pipeline.getActiveWeaponId(), 'dual_blades');
  hold('shield');
  assert.equal(api.pipeline.getActiveWeaponId(), 'shield');
  hold('sword');
  assert.equal(api.pipeline.getActiveWeaponId(), 'sword');
  hold('bow');
  assert.equal(api.pipeline.getActiveWeaponId(), 'bow');
});

test('OFF: a real cast hands combat exactly today\'s linear multiplier on every hit', () => {
  location.hostname = 'example.test';
  location.search = '';
  api.curve.resetSkillDamageCurveConfig();
  assert.equal(api.curve.getSkillDamageCurveConfig().enabled, false);
  for (const [skillId, kind] of CORE_CASTS) {
    hold(kind);
    const skill = api.registry.getSkillById(skillId);
    for (const level of [1, 5, 10]) {
      const strikes = cast(skillId, level);
      assert.equal(strikes.length, skill.hit_count, `${skillId} fires each hit once`);
      for (const strike of strikes) {
        assert.equal(strike.multiplier, linearToday(skill, level), `${skillId} level ${level} hit ${strike.hitIndex} with ${kind}`);
      }
    }
  }
});

test('ON: a real cast hands combat min x M once per hit, with the weapon in hand deciding the guardian skills', () => {
  location.hostname = 'localhost';
  location.search = `?${SKILL_DAMAGE_CURVE_QUERY}=1`;
  api.curve.resetSkillDamageCurveConfig();
  const quiet = mock.method(globalThis.console, 'info', () => {});
  try {
    assert.equal(api.curve.getSkillDamageCurveConfig().enabled, true);
    assert.equal(quiet.mock.callCount(), 1, 'it says once that the curve is on');
    for (const [skillId, kind] of CORE_CASTS) {
      hold(kind);
      const skill = api.registry.getSkillById(skillId);
      const { min } = skill.scaling.damage_pct;
      const curved = kind !== 'shield'; // shield: a guardian-type weapon that is not daggers
      for (const level of [1, 5, 10]) {
        const expected = curved ? specCurve(min, CAPS[skill.weapon_type], level, skill.max_level) : linearToday(skill, level);
        const strikes = cast(skillId, level);
        assert.equal(strikes.length, skill.hit_count, `${skillId} fires each hit once`);
        for (const strike of strikes) {
          near(strike.multiplier, expected, `${skillId} level ${level} hit ${strike.hitIndex} with ${kind}`);
          // no second level scaling anywhere after the one point: never above the cap, never curve x linear
          if (curved) assert.ok(strike.multiplier <= min * (1 + CAPS[skill.weapon_type]) + 1e-9);
        }
        if (level === 1) assert.equal(strikes[0].multiplier, min, 'level 1 is untouched');
      }
    }
  } finally {
    quiet.mock.restore();
    location.hostname = 'example.test';
    location.search = '';
    api.curve.resetSkillDamageCurveConfig();
  }
});

test('ON: a guardian cast keeps the weapon it started with, even if the weapon is swapped mid-cast', () => {
  location.hostname = 'localhost';
  location.search = `?${SKILL_DAMAGE_CURVE_QUERY}=1`;
  api.curve.resetSkillDamageCurveConfig();
  const quiet = mock.method(globalThis.console, 'info', () => {});
  try {
    const skill = api.registry.getSkillById('guardian_twin_fang');
    const { min } = skill.scaling.damage_pct;
    hold('daggers');
    let finish = startCast('guardian_twin_fang', 10);
    hold('sword'); // swapped before any hit lands
    let strikes = finish();
    assert.equal(strikes.length, 4);
    for (const strike of strikes) near(strike.multiplier, specCurve(min, 0.30, 10, 10), 'cast with daggers');
    hold('shield');
    finish = startCast('guardian_twin_fang', 10);
    hold('daggers');
    strikes = finish();
    for (const strike of strikes) near(strike.multiplier, linearToday(skill, 10), 'cast with a shield');
  } finally {
    quiet.mock.restore();
    location.hostname = 'example.test';
    location.search = '';
    api.curve.resetSkillDamageCurveConfig();
  }
});

// ─── One application point ──────────────────────────────────────────────

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await sourceFiles(full));
    else if (/\.(m?js|jsx|tsx?)$/.test(entry.name)) found.push(full);
  }
  return found;
}

test('one application point: only dispatchStrike calls scaleSkillDamage, and the executor no longer scales damage_pct itself', async () => {
  const rel = (file) => path.relative(root, file).split(path.sep).join('/');
  const users = [];
  const curveImporters = [];
  for (const file of await sourceFiles(path.join(root, 'src'))) {
    const text = await readFile(file, 'utf8');
    if (/\bscaleSkillDamage\s*\(/.test(text)) users.push(rel(file)); // a definition or a call, not a comment
    if (/from\s+['"][^'"]*skillDamageCurve(\.mjs)?['"]/.test(text)) curveImporters.push(rel(file));
  }
  assert.deepEqual(users.sort(), [
    'src/components/game3d/skills/skillExecutor.jsx',
    'src/components/game3d/skills/skillRegistry.jsx',
  ]);
  assert.deepEqual(curveImporters.sort(), ['src/components/game3d/skills/skillRegistry.jsx']);

  const executor = await readFile(path.join(root, 'src/components/game3d/skills/skillExecutor.jsx'), 'utf8');
  const calls = [...executor.matchAll(/\bscaleSkillDamage\(/g)];
  assert.equal(calls.length, 1, 'the executor applies the skill level to damage exactly once');
  assert.ok(!/\bscaleStat\b/.test(executor), 'the executor no longer calls scaleStat');
  const strikeFunction = executor.slice(executor.indexOf('function dispatchStrike('), executor.indexOf('function scheduleSequential('));
  assert.equal([...strikeFunction.matchAll(/\bscaleSkillDamage\(/g)].length, 1, 'and that call is in dispatchStrike');
  assert.equal([...executor.matchAll(/'damage_pct'/g)].length, 0, 'damage_pct is never read directly by the executor');
});
