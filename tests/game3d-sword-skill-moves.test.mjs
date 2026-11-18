// The sword skills' own looks (weapons/swordSkillMoves.mjs): four single hits
// and four three-hit multis, each different, bound to the game's real sword
// skills, timed for those skills' own hit spacing, and played by the real
// player controller in place of the combo clip. The controller part needs
// Three.js and esbuild and is skipped where they are not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SWORD_SINGLE_HITS, SWORD_THREE_HITS, SWORD_SKILL_LOOKS, SWORD_SKILL_CHAINS, SWORD_SKILL_STATE_NAMES,
  swordSkillState, swordSkillMoves, swordSkillMovesForWeapon } from '../src/components/game3d/weapons/swordSkillMoves.mjs';
import { duelSkillProfile } from '../base44/shared/duelComboPolicy.mjs';

/* global URL */
const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('four single hits and four three-hit multis, every one a different set of cuts', () => {
  assert.deepEqual(SWORD_SINGLE_HITS.map((s) => s.level), [1, 2, 3, 4]);
  assert.deepEqual(SWORD_THREE_HITS.map((m) => m.level), [1, 2, 3, 4]);
  const singles = SWORD_SINGLE_HITS.map((s) => String(s.cut));
  assert.equal(new Set(singles).size, 4, 'no two single hits are the same cut');
  const multis = SWORD_THREE_HITS.map((m) => m.cuts.join(','));
  assert.equal(new Set(multis).size, 4);
  for (const m of SWORD_THREE_HITS) {
    assert.equal(m.cuts.length, 3, m.name);
    for (const s of singles) assert.ok(!m.cuts.map(String).includes(s) || m.cuts.filter((c) => String(c) === s).length === 0, m.name + ' does not reuse a single hit\'s cut');
  }
  // no cut opens two different multis, and no multi is another one reordered
  assert.equal(new Set(SWORD_THREE_HITS.map((m) => String(m.cuts[0]))).size, 4);
  assert.equal(new Set(SWORD_THREE_HITS.map((m) => [...m.cuts].map(String).sort().join(','))).size, 4);
  for (const look of [...SWORD_SINGLE_HITS, ...SWORD_THREE_HITS]) assert.ok(look.name && look.looks.length > 25, look.id);
  assert.equal(new Set([...SWORD_SINGLE_HITS, ...SWORD_THREE_HITS].map((l) => l.id)).size, 8);
});

test('the looks are bound to the game\'s real sword skills, by family', () => {
  const registry = source('src/components/game3d/skills/skillRegistry.jsx');
  const ladder = source('src/components/game3d/axe/skills/AXECoreSkillLadder.js');
  const patterns = Object.fromEntries([...ladder.matchAll(/number: (\d+), pattern: '(\w+)', hitCount: (\d+)/g)].map((m) => [m[1], { pattern: m[2], hits: Number(m[3]) }]));
  for (const [skillId, look] of Object.entries(SWORD_SKILL_LOOKS)) {
    const art = /^axe_offensive_skill_(\d+)$/.exec(skillId);
    const hits = art ? patterns[art[1]].hits : Number(new RegExp("skill_id: '" + skillId + "'[\\s\\S]*?hit_count: (\\d+)").exec(registry)[1]);
    assert.equal(hits, look.family === 'single' ? 1 : 3, skillId + ' is a ' + look.family + ' skill');
    assert.ok(duelSkillProfile(skillId), skillId + ' is a skill the server knows');
    assert.equal(duelSkillProfile(skillId).weaponPath, 'damage');
    assert.equal(duelSkillProfile(skillId).offsets.length, hits);
  }
  // every single-hit and three-hit skill of the sword has a look
  for (const [number, p] of Object.entries(patterns)) {
    const id = 'axe_offensive_skill_' + number;
    if (p.pattern === 'single' || p.pattern === 'divine_single' || p.hits === 3) assert.ok(SWORD_SKILL_LOOKS[id], id + ' (' + p.pattern + ')');
    else assert.equal(swordSkillState(id, 0), null, id + ' (' + p.pattern + ') keeps the combo clips');
  }
  // stronger skills get higher levels; the Damage tree's lanes go 1, 2, 3
  const tree = source('src/components/game3d/axe/skills/AXECloneSkillTreeModel.mjs');
  assert.match(tree, /role==='offensive'\?'sword_heavy_strike'[\s\S]{0,120}art\(role,4\), art\(role,6\)/);
  assert.match(tree, /role==='offensive'\?'sword_triple_slash'[\s\S]{0,120}art\(role,5\), art\(role,10\)/);
  assert.deepEqual(['sword_heavy_strike', 'axe_offensive_skill_4', 'axe_offensive_skill_6', 'axe_offensive_skill_9'].map((id) => SWORD_SKILL_LOOKS[id].level), [1, 2, 3, 4]);
  assert.deepEqual(['sword_triple_slash', 'axe_offensive_skill_5', 'axe_offensive_skill_10'].map((id) => SWORD_SKILL_LOOKS[id].level), [1, 2, 3]);
  assert.equal(swordSkillState('sword_heavy_strike'), 'swordSkillSingle1');
  assert.equal(swordSkillState('sword_triple_slash', 2), 'swordSkillMulti1Hit3');
  assert.equal(swordSkillState('axe_offensive_skill_10', 1), 'swordSkillMulti3Hit2');
  for (const id of ['guardian_crushing_blow', 'ranged_double_shot', 'toString', '', null, undefined, 7]) assert.equal(swordSkillState(id, 0), null);
});

test('each clip is timed for its skill: the cut lands soon after the cast and before the next hit arrives', () => {
  const moves = swordSkillMoves();
  assert.deepEqual(moves.map((m) => m.name), [...SWORD_SKILL_STATE_NAMES]);
  assert.equal(moves.length, 16);
  const byName = Object.fromEntries(moves.map((m) => [m.name, m]));
  for (const m of moves) {
    const end = m.keys.at(-1).t;
    assert.equal(m.keys[0].t, 0, m.name + ' starts at zero');
    assert.ok(m.hit >= 0.1 && m.hit <= 0.5 + 1e-6, m.name + ': the cut lands ' + m.hit + ' s after the cast');
    assert.ok(m.cancel > m.hit && m.cancel <= end && end <= 0.9, m.name + ' timing ' + [m.hit, m.cancel, end]);
    assert.ok(m.sweep[0] <= m.hit && m.sweep[1] >= m.hit && m.sweep[1] <= end + 1e-6, m.name + ' sweep ' + m.sweep);
    if (m.keys[0].hips.length > 2) assert.ok(Math.hypot(m.keys[0].hips[2], m.keys[0].hips[3]) < 0.45, m.name + ' starts near the spot');
    for (const k of m.keys) if (k.hips.length > 2) assert.ok(Math.hypot(k.hips[2], k.hips[3]) < 0.9, m.name + ' stays within a step of its spot');
  }
  for (const s of SWORD_SINGLE_HITS) assert.deepEqual(byName['swordSkillSingle' + s.level].keys[0].hips.slice(2), s.cut === 1 ? [] : [0, 0], s.name + ' starts on the spot');
  // the real spacing between a bound skill's hits (the server's own table)
  for (const [skillId, look] of Object.entries(SWORD_SKILL_LOOKS)) {
    if (look.family !== 'multi') continue;
    const offsets = duelSkillProfile(skillId).offsets;
    const multi = SWORD_THREE_HITS.find((m) => m.level === look.level);
    assert.ok(Math.abs((offsets[1] - offsets[0]) / 1000 - multi.spacing) < 0.011, skillId + ' hits are ' + (offsets[1] - offsets[0]) + ' ms apart');
    for (const hit of [0, 1]) {
      const m = byName[swordSkillState(skillId, hit)];
      assert.ok(m.hit < multi.spacing, skillId + ' hit ' + (hit + 1) + ' lands before the next one starts');
      assert.ok(m.cancel <= multi.spacing, skillId + ' hit ' + (hit + 1) + ' is free when the next one arrives');
    }
    assert.equal(byName[swordSkillState(skillId, 0)].keys[0].hips.slice(2).join() || '0,0', '0,0');
  }
  assert.deepEqual(moves.map((m) => m.index), [0, 0, 0, 0, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
});

test('long blades hold the hilt with both hands; short swords swing the same cuts with one', () => {
  const long = swordSkillMovesForWeapon({ id: 'odachi', cls: 'greatsword' });
  const short = swordSkillMovesForWeapon({ id: 'fantasy_sword', cls: 'sword' });
  assert.equal(long.length, 16); assert.equal(short.length, 16);
  for (const m of long) assert.ok(m.keys.some((k) => k.l.hilt), m.name + ' two-handed');
  for (const m of short) for (const k of m.keys) assert.ok(!k.l.hilt && k.l.arm.length === 3 && k.r.blade, m.name + ' one-handed');
  assert.deepEqual(short.map((m) => [m.name, m.hit]), long.map((m) => [m.name, m.hit]));
});

test('chains: a multi that flows into a single hit', () => {
  assert.ok(SWORD_SKILL_CHAINS.length >= 3);
  for (const chain of SWORD_SKILL_CHAINS) {
    assert.ok(SWORD_THREE_HITS.some((m) => m.level === chain.multi) && SWORD_SINGLE_HITS.some((s) => s.level === chain.single) && chain.why.length > 20);
  }
  assert.equal(new Set(SWORD_SKILL_CHAINS.map((c) => c.multi + '>' + c.single)).size, SWORD_SKILL_CHAINS.length);
});

test('wired in: baker, binder, controller and world', () => {
  const baker = source('src/components/game3d/weapons/weaponComboClips.js');
  assert.match(baker, /index: Number\.isInteger\(combo\.index\) \? combo\.index : index/);
  assert.match(baker, /export const WEAPON_COMBO_STATE_NAMES = Object\.freeze\(\[\.\.\.WEAPON_COMBO_STATES\.swordCombo, \.\.\.WEAPON_COMBO_STATES\.bowCombo\]\);/, 'the combo state list itself is unchanged');
  const binder = source('src/components/game3d/weapons/weaponComboBinder.js');
  assert.match(binder, /const skills = controller\?\.playsSwordSkillClips === true;/);
  assert.match(binder, /\|\| SWORD_COMBO\), \.\.\.\(held \? swordSkillMovesForWeapon\(held\) : swordSkillMoves\(\{ twoHanded: false \}\)\)\]/);
  const controller = source('src/components/game3d/player/LunaDashboardPlayerController.jsx');
  assert.match(controller, /swordSkillState\(config\.skillId, explicit \? hitIndex : 0\)/);
  assert.match(controller, /getCurrent: \(\) => isMounted \? 'mounted' : shownStateOf\.get\(currentState\) \|\| currentState \|\| STATES\.IDLE,/);
  assert.match(controller, /playsSwordSkillClips: true,/);
  const world = source('src/components/game3d/GameWorld3D.jsx');
  assert.equal(world.split('skillId: pendingSkillStrike?.skillId || null, // a sword skill plays its own cut').length - 1, 2);
});

// ---- the real player controller, with stand-in clips ----
let THREE = null, buildSync = null;
try { THREE = await import('three'); ({ buildSync } = await import('esbuild')); } catch { /* not installed here */ }
const skip = THREE && buildSync ? false : 'Three.js and esbuild are not installed here';

test('the real controller plays a skill\'s own clip and still reports the combo state', { skip }, () => {
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
  const moves = swordSkillMoves();
  // stand-ins with each real move's own timing; the duration tells them apart
  const durationOf = Object.fromEntries(moves.map((m, i) => [m.name, 0.7 + i * 0.01]));
  const skill = Object.fromEntries(moves.map((m) => [m.name, clip(m.name, durationOf[m.name], { combo: 'swordCombo', index: m.index, hit: m.hit, sweep: m.sweep, cancel: m.cancel })]));
  const advance = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 120) {
      clock.seconds += 1 / 120;
      ctl.updateActionState({ moving: false }); ctl.updateAnimation(1 / 120); mixer.update(1 / 120); ctl.updateMotion(new THREE.Object3D(), 1 / 120, 0);
    }
  };
  const playing = () => { const s = ctl.getComboState(); return s ? Object.keys(durationOf).find((n) => Math.abs(durationOf[n] - s.duration) < 1e-6) || s.state : null; };
  assert.equal(ctl.playsSwordSkillClips, true);

  // without the skill clips a skill hit plays the combo clip, as before
  assert.equal(ctl.setWeaponComboClips(combo), true);
  ctl.requestAttack('swordCombo', { combo: true, hitIndex: 1, skillId: 'sword_triple_slash' });
  assert.deepEqual([ctl.getCurrent(), playing()], ['swordCombo2', 'swordCombo2']);
  advance(1.5);

  assert.equal(ctl.setWeaponComboClips({ ...combo, ...skill }), true);
  // single hits: each skill its own clip; outside, the combo state the hit would have used
  for (const [skillId, level, shown] of [['sword_heavy_strike', 1, 'swordCombo3'], ['axe_offensive_skill_4', 2, 'swordCombo1'], ['axe_offensive_skill_6', 3, 'swordCombo1'], ['axe_offensive_skill_9', 4, 'swordCombo1']]) {
    ctl.requestAttack('swordCombo', { combo: true, hitIndex: 0, heavy: /heavy_strike/.test(skillId), skillId });
    assert.deepEqual([ctl.getCurrent(), playing()], [shown, 'swordSkillSingle' + level], skillId);
    assert.equal(ctl.getComboState().state, shown);
    advance(1.5);
  }
  // three-hit skills at their real spacing: every hit starts its own clip on time
  for (const [skillId, level] of [['sword_triple_slash', 1], ['axe_offensive_skill_5', 2], ['axe_offensive_skill_10', 3]]) {
    const offsets = duelSkillProfile(skillId).offsets;
    const seen = [];
    let at = 0;
    offsets.forEach((offset, hit) => {
      advance((offset - at) / 1000); at = offset;
      ctl.requestAttack('swordCombo', { combo: true, hitIndex: hit, skillId });
      advance(0.05); at += 50;
      seen.push([ctl.getCurrent(), playing()]);
    });
    assert.deepEqual(seen, [0, 1, 2].map((hit) => ['swordCombo' + (hit + 1), 'swordSkillMulti' + level + 'Hit' + (hit + 1)]), skillId + ' ' + JSON.stringify(seen));
    advance(1.5);
  }
  // a skill with no look of its own, and the basic attack, keep the combo clips
  ctl.requestAttack('swordCombo', { combo: true, hitIndex: 0, skillId: 'axe_offensive_skill_3' });
  assert.deepEqual([ctl.getCurrent(), playing()], ['swordCombo1', 'swordCombo1']);
  advance(1.5);
  ctl.requestAttack('swordCombo');
  assert.deepEqual([ctl.getCurrent(), playing()], ['swordCombo1', 'swordCombo1']);
  advance(1.5);
  // a single cast right after a multi starts when the multi's last cut lets go
  [0, 1, 2].forEach((hit) => { ctl.requestAttack('swordCombo', { combo: true, hitIndex: hit, skillId: 'sword_triple_slash' }); advance(0.5); });
  ctl.requestAttack('swordCombo', { combo: true, hitIndex: 0, skillId: 'axe_offensive_skill_4' });
  advance(0.2);
  assert.equal(playing(), 'swordSkillSingle2', 'multi into single');
  // pollComboEvents reports the combo state too
  advance(1.5);
  ctl.requestAttack('swordCombo', { combo: true, hitIndex: 0, heavy: true, skillId: 'sword_heavy_strike' });
  const events = [];
  for (let i = 0; i < 60; i++) { advance(1 / 120); events.push(...ctl.pollComboEvents().map((e) => e.type + ':' + e.state)); }
  assert.deepEqual(events, ['sweep:swordCombo3', 'hit:swordCombo3']);
});
