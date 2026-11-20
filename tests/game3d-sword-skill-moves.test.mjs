// What Heavy Strike and Triple Slash look like at each of their four mastery
// tiers (weapons/swordSkillMoves.mjs): every tier a different set of cuts,
// named for the tier clips weaponComboClips.js defines, timed for the skills'
// own hit spacing, baked for every sword by the binder and played by the real
// player controller. The controller part needs Three.js and esbuild and is
// skipped where they are not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SWORD_SINGLE_HITS, SWORD_THREE_HITS, SWORD_SKILL_CHAINS, SWORD_SKILL_TIER_STATE_NAMES, SWORD_THREE_HIT_SPACING,
  swordSkillTierMoves, swordSkillTierMovesForWeapon } from '../src/components/game3d/weapons/swordSkillMoves.mjs';
import { duelSkillProfile } from '../base44/shared/duelComboPolicy.mjs';

/* global URL */
const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('four tiers of the single hit and four of the three-hit, every one a different set of cuts', () => {
  assert.deepEqual(SWORD_SINGLE_HITS.map((s) => s.tier), [1, 2, 3, 4]);
  assert.deepEqual(SWORD_THREE_HITS.map((m) => m.tier), [1, 2, 3, 4]);
  const singles = SWORD_SINGLE_HITS.map((s) => String(s.cut));
  assert.equal(new Set(singles).size, 4, 'no two single hits are the same cut');
  for (const m of SWORD_THREE_HITS) {
    assert.equal(m.cuts.length, 3, m.name);
    assert.ok(m.cuts.every((cut) => !singles.includes(String(cut))), m.name + ' does not reuse a single hit\'s cut');
  }
  // no cut opens two different three-hits, and no three-hit is another one reordered
  assert.equal(new Set(SWORD_THREE_HITS.map((m) => String(m.cuts[0]))).size, 4);
  assert.equal(new Set(SWORD_THREE_HITS.map((m) => [...m.cuts].map(String).sort().join(','))).size, 4);
  for (const look of [...SWORD_SINGLE_HITS, ...SWORD_THREE_HITS]) assert.ok(look.name && look.looks.length > 25, look.id);
  assert.equal(new Set([...SWORD_SINGLE_HITS, ...SWORD_THREE_HITS].map((l) => l.id)).size, 8);
});

test('the clips carry the tier names the game already uses, and the tier comes from mastery', () => {
  const baker = source('src/components/game3d/weapons/weaponComboClips.js');
  // the state names declared for the tiers in weaponComboClips.js
  const declared = [...baker.matchAll(/sword(?:Single|Triple)Tier\d: Object\.freeze\(\[([^\]]+)\]\)/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((n) => n[1]));
  assert.deepEqual([...SWORD_SKILL_TIER_STATE_NAMES], declared);
  assert.equal(declared.length, 16);
  assert.match(baker, /skillId==='sword_triple_slash'\?'swordTripleTier'\s*:skillId==='sword_heavy_strike'\?'swordSingleTier':null/);
  assert.match(baker, /const tier=Math\.min\(4,1\+Math\.floor\(\(value-1\)\*3\/Math\.max\(1,max-1\)\)\);/);
  // that rule, for a skill whose mastery goes to 10: levels 1-3, 4-6, 7-9, 10
  const tierOf = (level, max = 10) => Math.min(4, 1 + Math.floor((Math.min(max, Math.max(1, level)) - 1) * 3 / Math.max(1, max - 1)));
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => tierOf(l)), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
  const registry = source('src/components/game3d/skills/skillRegistry.jsx');
  for (const id of ['sword_heavy_strike', 'sword_triple_slash']) assert.match(registry, new RegExp("skill_id: '" + id + "'[\\s\\S]{0,400}max_level: 10"));
  assert.match(registry, /skill_id: 'sword_triple_slash'[\s\S]{0,300}hit_delay: 0\.5/);
  assert.deepEqual(duelSkillProfile('sword_triple_slash').offsets, [0, 500, 1000]);
  assert.equal(SWORD_THREE_HIT_SPACING, 0.5);
});

test('each clip is timed for its skill: the cut lands soon after the cast and before the next hit arrives', () => {
  const moves = swordSkillTierMoves();
  assert.deepEqual(moves.map((m) => m.name), [...SWORD_SKILL_TIER_STATE_NAMES]);
  const byName = Object.fromEntries(moves.map((m) => [m.name, m]));
  for (const m of moves) {
    const end = m.keys.at(-1).t;
    assert.equal(m.keys[0].t, 0, m.name + ' starts at zero');
    assert.ok(m.hit >= 0.1 && m.hit <= 0.5 + 1e-6, m.name + ': the cut lands ' + m.hit + ' s after the cast');
    assert.ok(m.cancel > m.hit && m.cancel <= end && end <= 0.9, m.name + ' timing ' + [m.hit, m.cancel, end]);
    assert.ok(m.sweep[0] <= m.hit && m.sweep[1] >= m.hit && m.sweep[1] <= end + 1e-6, m.name + ' sweep ' + m.sweep);
    for (const k of m.keys) if (k.hips.length > 2) assert.ok(Math.hypot(k.hips[2], k.hips[3]) < 0.9, m.name + ' stays within a step of its spot');
  }
  for (const s of SWORD_SINGLE_HITS) {
    const first = byName['swordSingleTier' + s.tier].keys[0].hips;
    if (first.length > 2) assert.deepEqual(first.slice(2), [0, 0], s.name + ' starts on the spot');
  }
  for (const t of SWORD_THREE_HITS) {
    for (const hit of [0, 1]) {
      const m = byName['swordTripleTier' + t.tier + 'Hit' + (hit + 1)];
      assert.ok(m.hit < SWORD_THREE_HIT_SPACING, t.name + ' hit ' + (hit + 1) + ' lands before the next one starts');
      assert.ok(m.cancel <= SWORD_THREE_HIT_SPACING, t.name + ' hit ' + (hit + 1) + ' is free when the next one arrives');
    }
    const first = byName['swordTripleTier' + t.tier + 'Hit1'].keys[0].hips;
    if (first.length > 2) assert.deepEqual(first.slice(2), [0, 0], t.name + ' opens on the spot');
  }
  assert.deepEqual(moves.map((m) => m.index), [0, 0, 0, 0, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
});

test('long blades hold the hilt with both hands; short swords swing the same cuts with one', () => {
  const long = swordSkillTierMovesForWeapon({ id: 'odachi', cls: 'greatsword' });
  const short = swordSkillTierMovesForWeapon({ id: 'fantasy_sword', cls: 'sword' });
  assert.equal(long.length, 16); assert.equal(short.length, 16);
  for (const m of long) assert.ok(m.keys.some((k) => k.l.hilt), m.name + ' two-handed');
  for (const m of short) for (const k of m.keys) assert.ok(!k.l.hilt && k.l.arm.length === 3 && k.r.blade, m.name + ' one-handed');
  assert.deepEqual(short.map((m) => [m.name, m.hit]), long.map((m) => [m.name, m.hit]));
});

test('chains and wiring: Triple Slash into Heavy Strike; the binder bakes the tiers for every sword', () => {
  assert.ok(SWORD_SKILL_CHAINS.length >= 3);
  for (const chain of SWORD_SKILL_CHAINS) assert.ok([1, 2, 3, 4].includes(chain.triple) && [1, 2, 3, 4].includes(chain.single) && chain.why.length > 20);
  // a new player has both skills at tier 1, and that first chain is the seamless one
  assert.ok(SWORD_SKILL_CHAINS.some((c) => c.triple === 1 && c.single === 1));
  const binder = source('src/components/game3d/weapons/weaponComboBinder.js');
  assert.match(binder, /\.\.\.\(held \? swordSkillTierMovesForWeapon\(held\) : swordSkillTierMoves\(\{ twoHanded: false \}\)\)\];/);
  assert.match(binder, /movesForFamily\(comboKind\)\);/);
  const baker = source('src/components/game3d/weapons/weaponComboClips.js');
  assert.match(baker, /index: Number\.isInteger\(combo\.index\) \? combo\.index : index/);
  // main's own way of choosing the tier and playing it is untouched
  const world = source('src/components/game3d/GameWorld3D.jsx');
  assert.equal(world.split('swordSkillComboKind(pendingSkillStrike.skillId,').length - 1, 2);
  assert.ok(!world.includes('swordSkillMoves'));
});

// ---- the real player controller, with stand-in clips that carry each real move's timing ----
let THREE = null, buildSync = null, WEAPON_COMBO_STATES = null;
try {
  THREE = await import('three'); ({ buildSync } = await import('esbuild'));
  ({ WEAPON_COMBO_STATES } = await import('../src/components/game3d/weapons/weaponComboClips.js'));
} catch { /* not installed here */ }
const skip = THREE && buildSync ? false : 'Three.js and esbuild are not installed here';

test('the real controller plays each tier on time, and Triple Slash chains into Heavy Strike', { skip }, () => {
  const built = buildSync({
    entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
    bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
  }).outputFiles;
  const clock = { seconds: 0 };
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 });
  const root = new THREE.Group(); const b = new THREE.Bone(); b.name = 'Root'; root.add(b);
  const mixer = new THREE.AnimationMixer(root);
  const ctl = runtime.exports.createLunaDashboardPlayerController({ mixer });
  const clip = (name, d = 1, userData = null) => {
    const c = new THREE.AnimationClip(name, d, [new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, d], [0, 0, 0, 1, 0, 0, 0, 1])]);
    if (userData) c.userData = userData;
    return c;
  };
  ctl.bindClips(Object.fromEntries(['idle', 'walk', 'run', 'kick', 'attack', 'hitReact'].map((k) => [k, clip(k)])));
  const combo = Object.fromEntries(['swordCombo1', 'swordCombo2', 'swordCombo3'].map((name, index) => [name, clip(name, 0.6, { combo: 'swordCombo', index, hit: 0.3, sweep: [0.15, 0.4], cancel: 0.4 })]));
  const moves = swordSkillTierMoves();
  const tiers = Object.fromEntries(moves.map((m) => [m.name, clip(m.name, m.keys.at(-1).t, { combo: 'swordCombo', index: m.index, hit: m.hit, sweep: m.sweep, cancel: m.cancel })]));
  assert.equal(ctl.setWeaponComboClips({ ...combo, ...tiers }), true);
  const advance = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 120) {
      clock.seconds += 1 / 120;
      ctl.updateActionState({ moving: false }); ctl.updateAnimation(1 / 120); mixer.update(1 / 120); ctl.updateMotion(new THREE.Object3D(), 1 / 120, 0);
    }
  };
  for (const tier of [1, 2, 3, 4]) {
    assert.deepEqual(WEAPON_COMBO_STATES['swordSingleTier' + tier], ['swordSingleTier' + tier]);
    // Heavy Strike at this tier
    assert.equal(ctl.requestAttack('swordSingleTier' + tier, { combo: true, hitIndex: 0, heavy: true }), true);
    assert.equal(ctl.getCurrent(), 'swordSingleTier' + tier);
    advance(1.5);
    // Triple Slash at this tier: three casts half a second apart, each hit starting its own clip on time
    const seen = [];
    for (const hit of [0, 1, 2]) {
      ctl.requestAttack('swordTripleTier' + tier, { combo: true, hitIndex: hit });
      advance(0.05); seen.push(ctl.getCurrent()); advance(0.45);
    }
    assert.deepEqual(seen, [1, 2, 3].map((hit) => 'swordTripleTier' + tier + 'Hit' + hit), 'tier ' + tier + ' ' + seen);
    // Heavy Strike cast as the third hit plays: it starts when that cut lets go, whatever tier it is
    for (const single of [1, 2, 3, 4]) {
      advance(1.5);
      [0, 1, 2].forEach((hit) => { ctl.requestAttack('swordTripleTier' + tier, { combo: true, hitIndex: hit }); advance(0.5); });
      assert.equal(ctl.getCurrent(), 'swordTripleTier' + tier + 'Hit3');
      ctl.requestAttack('swordSingleTier' + single, { combo: true, hitIndex: 0, heavy: true });
      advance(0.25);
      assert.equal(ctl.getCurrent(), 'swordSingleTier' + single, 'triple tier ' + tier + ' into single tier ' + single);
    }
    advance(1.5);
  }
  // the basic attack chain still plays its three hits
  ctl.requestAttack('swordCombo');
  assert.equal(ctl.getCurrent(), 'swordCombo1');
});
