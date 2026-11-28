/* global URL */
// Fantasy Battle studio test page: the route gate (same rule as /fantasy-battle), the route renders the archer battle
// page with its Studio while /fantasy-battle stays the adventure, and "Record WebM" no longer restarts a battle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fantasyBattleStudioOpen, FANTASY_BATTLE_STUDIO_PATH } from '../src/components/fantasybattle/studioPageGate.mjs';
import { captureBattleState, restoreBattleState, withBattleStatePreserved } from '../src/components/fantasybattle/core/battleSnapshot.mjs';
import { createBattle, resolveRound } from '../src/components/fantasybattle/core/battleRules.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('the studio page opens when the game is released or in development, never otherwise', () => {
  assert.equal(fantasyBattleStudioOpen({ released: true, dev: false }), true);
  assert.equal(fantasyBattleStudioOpen({ released: false, dev: true }), true);
  assert.equal(fantasyBattleStudioOpen({ released: true, dev: true }), true);
  assert.equal(fantasyBattleStudioOpen({ released: false, dev: false }), false);
  assert.equal(fantasyBattleStudioOpen({ released: 'true', dev: 1 }), false, 'only a literal true opens it');
  assert.equal(fantasyBattleStudioOpen(), false);
  assert.equal(FANTASY_BATTLE_STUDIO_PATH, '/fantasy-battle-studio');
});

test('the studio route is a flat route that renders the archer battle page behind the release gate', () => {
  const route = read('../src/routes/fantasy-battle-studio.jsx');
  assert.match(route, /createFileRoute\('\/fantasy-battle-studio'\)/);
  assert.match(route, /import FantasyBattlePage from '@\/components\/fantasybattle\/FantasyBattlePage'/);
  assert.match(route, /fantasyBattleStudioOpen\(\{ released: FANTASY_BATTLE_RELEASED, dev: import\.meta\.env\.DEV \}\) \? FantasyBattlePage : StudioPageClosed/);
  assert.match(route, /ssr: false/);
  // the adventure keeps /fantasy-battle; the page keeps its Studio drawer
  assert.match(read('../src/routes/fantasy-battle.jsx'), /SapphireAdventure/);
  assert.match(read('../src/components/fantasybattle/FantasyBattlePage.jsx'), /<StudioPanel /);
});

function fakeFighter(heldSkill = null) {
  const played = [];
  const f = {
    played,
    stopped: 0,
    view: { opacity: 1 },
    state: { life: { combatTarget: 1 } },
    skills: { current: heldSkill ? { id: heldSkill, compiled: { hold: true } } : null, stop() { f.stopped += 1; f.skills.current = null; } },
    playSkill(id) { played.push(id); f.skills.current = { id, compiled: { hold: true } }; },
  };
  return f;
}

// What FantasyBattleStage.restart() does to the battle fields (the recording restarts in practice mode).
function restartLikeStage(stage) {
  stage.seed += 1;
  stage.mode = 'practice';
  stage.phase = 'practice';
  stage.battle = createBattle({ seed: stage.seed, units: UNITS });
  stage.display = { hero: { hp: 120, focus: 1 }, rival: { hp: 120, focus: 1 } };
  stage.round = null; stage.pendingChoices = {}; stage.activeActor = null; stage.koPending = null;
  stage.roundGuards = new Set(); stage.activeGuards = new Set();
  stage.logLines = ['Practice'];
  for (const f of Object.values(stage.fighters)) { f.skills.stop(); f.view.opacity = 1; f.state.life.combatTarget = 0.6; }
}

const UNITS = [
  { id: 'hero', name: 'Silver Archer', team: 'player', maxHp: 120, atk: 12, def: 10, spd: 11 },
  { id: 'rival', name: 'Shade Archer', team: 'enemy', maxHp: 120, atk: 11, def: 10, spd: 10 },
];

function battleInRoundThree() {
  let battle = createBattle({ seed: 5, units: UNITS });
  battle = resolveRound(battle, { hero: 'quickShot', rival: 'quickShot' }).battle;
  battle = resolveRound(battle, { hero: 'volley', rival: 'guard' }).battle;
  const hero = battle.units.find((u) => u.id === 'hero');
  const rival = battle.units.find((u) => u.id === 'rival');
  let hud = 0;
  return {
    seed: 77, mode: 'battle', phase: 'choose', battle, round: null, activeActor: null, koPending: null,
    display: { hero: { hp: hero.hp, focus: hero.focus }, rival: { hp: rival.hp, focus: rival.focus } },
    pendingChoices: {}, logLines: ['Round 3. Choose an action.'], roundGuards: new Set(), activeGuards: new Set(),
    fighters: { hero: fakeFighter(), rival: fakeFighter() },
    emitHud() { hud += 1; },
    get hudEmits() { return hud; },
  };
}

test('recording keeps a battle in progress: same round, health, Focus, log and mode afterwards', async () => {
  const stage = battleInRoundThree();
  const before = { battle: stage.battle, round: stage.battle.round, display: JSON.stringify(stage.display), log: [...stage.logLines], seed: stage.seed };
  assert.equal(before.round, 3);
  const clip = await withBattleStatePreserved(stage, async () => {
    restartLikeStage(stage);
    assert.equal(stage.battle.round, 1, 'inside, the recording runs on a fresh practice stage');
    return 'webm';
  });
  assert.equal(clip, 'webm');
  assert.equal(stage.battle, before.battle, 'the same battle object is back');
  assert.equal(stage.battle.round, 3);
  assert.equal(JSON.stringify(stage.display), before.display);
  assert.deepEqual(stage.logLines, before.log);
  assert.equal(stage.mode, 'battle');
  assert.equal(stage.phase, 'choose');
  assert.equal(stage.seed, before.seed);
  for (const f of Object.values(stage.fighters)) assert.equal(f.state.life.combatTarget, 1);
  assert.ok(stage.hudEmits >= 1, 'the HUD is told');
});

test('the battle comes back even when recording fails part-way', async () => {
  const stage = battleInRoundThree();
  const battle = stage.battle;
  await assert.rejects(withBattleStatePreserved(stage, async () => { restartLikeStage(stage); throw new Error('captureStream unsupported'); }), /captureStream/);
  assert.equal(stage.battle, battle);
  assert.equal(stage.mode, 'battle');
  assert.equal(stage.phase, 'choose');
});

test('a finished battle gets its victory and defeat poses and the fallen archer fade back', async () => {
  const stage = battleInRoundThree();
  stage.phase = 'over';
  stage.fighters.hero = fakeFighter('victory');
  stage.fighters.rival = fakeFighter('defeat');
  stage.fighters.rival.view.opacity = 0.6;
  stage.fighters.rival.state.life.combatTarget = 0;
  const saved = captureBattleState(stage);
  restartLikeStage(stage);
  restoreBattleState(stage, saved);
  assert.deepEqual(stage.fighters.hero.played, ['victory']);
  assert.deepEqual(stage.fighters.rival.played, ['defeat']);
  assert.equal(stage.fighters.rival.view.opacity, 0.6);
  assert.equal(stage.fighters.rival.state.life.combatTarget, 0);
  assert.equal(stage.phase, 'over');
});

test('the stage records through the state keeper and refuses while a round is playing', () => {
  const stage = read('../src/components/fantasybattle/FantasyBattleStage.js').replace(/\r\n/g, '\n');
  const start = stage.indexOf('async recordClip()');
  const body = stage.slice(start, stage.indexOf('\n  dispose()', start));
  assert.ok(start > 0);
  assert.match(body, /if \(this\.phase === 'playing'\) throw new Error/);
  assert.match(body, /return withBattleStatePreserved\(this, async \(\) => \{/);
  assert.doesNotMatch(body, /previousMode/, 'no restart back to round 1 after recording');
});
