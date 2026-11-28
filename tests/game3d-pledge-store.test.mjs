// The real quest store (useQuestStore.jsx), bundled for Node with esbuild:
// the existing quests behave as before, and pledges run through it.
// Run: node --test tests/game3d-pledge-store.test.mjs
/* global EventTarget, URL, Buffer, CustomEvent */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { applyAXEQuestEventProgress } from '../src/components/game3d/axe/quests/AXEQuestEventProgress.js';
import {
  FERRY_CRATE, ORCHARD_WATCH, STRAY_CALF, ferryCrateEvents, orchardWatchEvents,
} from './game3d-pledge-fixtures.mjs';
import { EXAMPLE_CLAIM, EXAMPLE_EVENTS, EXAMPLE_PLEDGE } from './game3d-pledge-worked-example.mjs';

// A browser-like place for the store to live in: storage, and a window that
// carries the events world hooks dispatch.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};
globalThis.window = new EventTarget();

const game3d = fileURLToPath(new URL('../src/components/game3d/', import.meta.url));
const bundle = buildSync({
  stdin: {
    resolveDir: game3d,
    loader: 'js',
    contents: `
      export * as store from './useQuestStore.jsx';
      export { QUESTS, getAvailableQuestForNPC } from './questData.jsx';
      export { AXE_QUESTS, objectiveMatchesAXEQuestEvent } from './axe/quests/AXEQuestFramework.js';
      export * as registry from './pledges/pledgeRegistry.mjs';
      export * as model from './pledges/pledgeModel.mjs';
      export * as outcome from './pledges/pledgeOutcome.mjs';
      export * as claim from './pledges/pledgeClaim.mjs';
      export * as progress from './pledges/pledgeProgress.mjs';
      export * as standings from './pledges/pledgeStandings.mjs';
      export { setStorageUser } from './characterStorage.jsx';
    `,
  },
  bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
});
const game = await import('data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const { store, registry, model, QUESTS, AXE_QUESTS } = game;

let user = 0;
// A fresh character: empty quest state, or the given saved state.
function freshCharacter(saved = null) {
  user += 1;
  const name = `pledge-test-${user}`;
  if (saved) memory.set(`axe_quest_state_v2::${name}::__default__`, JSON.stringify(saved));
  game.setStorageUser(name);
  registry.clearRegisteredPledges();
  return name;
}
const savedState = (name) => JSON.parse(memory.get(`axe_quest_state_v2::${name}::__default__`));
const dispatch = (type, detail) => globalThis.window.dispatchEvent(new CustomEvent(type, { detail }));
const quest = (id) => QUESTS.find((entry) => entry.id === id);

test('the bundle holds the game\'s 32 quests and none of them is a pledge', () => {
  assert.equal(QUESTS.length, 32);
  assert.equal(QUESTS.filter((entry) => entry.sequential !== undefined).length, 0);
  assert.equal(QUESTS.filter((entry) => model.isPledge(entry)).length, 0);
  assert.equal(QUESTS.filter((entry) => entry.requiresAll !== undefined).length, 0);
  assert.equal(registry.listRegisteredPledges().length, 0); // no pledge content in the game
});

test('a kill quest from QUESTS: accept, events, complete, as before', () => {
  const name = freshCharacter();
  const q1 = quest('q1_first_blood');
  assert.deepEqual(store.completeQuest(q1.id, q1), { ok: false, reason: 'NOT_ACCEPTED' });
  assert.deepEqual(store.acceptQuest(q1.id, q1), { ok: true });
  assert.deepEqual(store.acceptQuest(q1.id, q1), { ok: false, reason: 'ALREADY_ACCEPTED' });
  assert.deepEqual(store.getQuestState().objectiveProgress[q1.id], { objective_0: 0 });
  assert.deepEqual(store.completeQuest(q1.id, q1), { ok: false, reason: 'OBJECTIVES_INCOMPLETE' });

  assert.equal(store.reportEnemyKill(QUESTS, 'normal'), true);
  assert.equal(store.reportQuestEvent(QUESTS, { type: 'location_discovered', targetId: 'x' }), false);
  // The new pledge events mean nothing to it.
  for (const type of ['carry_completed', 'item_delivered', 'choice_made', 'enemy_spared', 'carry_dropped']) {
    assert.equal(store.reportQuestEvent(QUESTS, { type, targetId: 'objective_0', choiceId: 'a' }), false);
  }
  assert.equal(store.reportEnemyKill(QUESTS, 'elite'), true);
  assert.equal(store.getQuestState().progress[q1.id], 2);
  assert.equal(store.isQuestComplete(q1), false);
  assert.equal(store.reportEnemyKill(QUESTS, 'normal'), true);
  assert.equal(store.reportEnemyKill(QUESTS, 'normal'), false); // already at 3 of 3
  assert.equal(store.isQuestComplete(q1), true);
  assert.deepEqual(store.completeQuest(q1.id, q1), { ok: true });

  const state = store.getQuestState();
  assert.deepEqual(state.acceptedIds, []);
  assert.deepEqual(state.completedIds, [q1.id]);
  assert.deepEqual(state.completionCounts, { [q1.id]: 1 });
  assert.deepEqual(store.acceptQuest(q1.id, q1), { ok: false, reason: 'ALREADY_COMPLETED' });
  // Nothing about pledges is written for a player who has none.
  assert.equal('pledgeOutcomes' in state, false);
  assert.deepEqual(Object.keys(savedState(name)).sort(), [
    'abandonedIds', 'acceptedIds', 'choices', 'completedIds', 'completionCounts',
    'lastAcceptedId', 'objectiveProgress', 'progress', 'storyFlags',
  ]);
  assert.deepEqual(state.storyFlags, {});
  assert.deepEqual(state.choices, {});
});

test('a discover quest from AXE_QUESTS: prerequisite, bridge event, complete, as before', () => {
  freshCharacter();
  const patrol = AXE_QUESTS.find((entry) => entry.id === 'axe_q_first_patrol');
  const scout = AXE_QUESTS.find((entry) => entry.id === 'axe_q_cave_scout');
  const q1 = quest('q1_first_blood');
  assert.deepEqual(store.acceptQuest(scout.id), { ok: false, reason: 'PREREQUISITE_REQUIRED' });
  store.acceptQuest(patrol.id);
  store.acceptQuest(q1.id, q1);
  for (let i = 0; i < 3; i++) store.reportEnemyKill(QUESTS, 'normal');
  assert.deepEqual(store.completeQuest(patrol.id), { ok: true });
  assert.equal(store.getQuestState().storyFlags.axe_first_patrol_complete, true);

  assert.deepEqual(store.acceptQuest(scout.id), { ok: true });
  assert.deepEqual(store.getQuestState().objectiveProgress[scout.id], { find_cave: 0 });
  dispatch('axePOIDiscovered', { id: 'AXE_POI_SomewhereElse' });
  assert.equal(store.isQuestComplete(scout), false);
  dispatch('axeQuestEvent', { type: 'enemy_killed', tier: 'normal', count: 1 });
  assert.equal(store.isQuestComplete(scout), false);
  dispatch('axePOIDiscovered', { id: 'AXE_POI_CaveEntrance' });
  assert.equal(store.isQuestComplete(scout), true);
  assert.deepEqual(store.completeQuest(scout.id), { ok: true });
  assert.equal(store.getQuestState().storyFlags.axe_cave_entrance_scouted, true);

  // Abandon still works as before for a quest that is not a pledge.
  const q2 = quest('q2_clearing_path');
  store.acceptQuest(q2.id, q2);
  store.reportEnemyKill(QUESTS, 'normal');
  assert.deepEqual(store.abandonQuest(q2.id), { ok: true });
  const state = store.getQuestState();
  assert.deepEqual(state.abandonedIds, [q2.id]);
  assert.deepEqual(state.objectiveProgress[q2.id], {});
  assert.equal('pledgeOutcomes' in state, false);
});

test('the bridge still reaches AXE_QUESTS only among the existing quests', () => {
  freshCharacter();
  const patrol = AXE_QUESTS.find((entry) => entry.id === 'axe_q_first_patrol');
  const q1 = quest('q1_first_blood');
  store.acceptQuest(patrol.id);
  store.acceptQuest(q1.id, q1);
  dispatch('axeQuestEvent', { type: 'enemy_killed', tier: 'normal', count: 1 });
  const state = store.getQuestState();
  assert.equal(state.objectiveProgress[patrol.id].patrol_kills, 1); // an AXE quest: reached, as today
  assert.equal(state.objectiveProgress[q1.id].objective_0, 0); // q1 to q20: not reached, as today
  // The pledge-only channel reaches no existing quest at all.
  dispatch('axePledgeEvent', { type: 'enemy_killed', tier: 'normal', count: 1 });
  assert.equal(store.getQuestState().objectiveProgress[patrol.id].patrol_kills, 1);
  assert.equal(store.reportPledgeEvent({ type: 'enemy_killed', tier: 'normal', count: 1 }), false);
});

// Every event type the game or the pledge engine knows, with ids that hit and
// ids that miss, and counts that are valid and counts that are not.
function eventStream(length, seed = 11) {
  let s = seed;
  const next = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pick = (list) => list[Math.floor(next() * list.length)];
  const types = ['enemy_killed', 'enemy_killed', 'enemy_killed', 'enemy_killed', 'boss_killed', 'item_collected', 'location_discovered',
    'world_interact', 'npc_talked', 'escort_completed', 'defend_completed', 'capture_completed',
    'craft_completed', 'cave_entered', 'faction_war_participated', 'exploration_completed',
    'carry_completed', 'item_delivered', 'choice_made', 'enemy_spared', 'carry_dropped',
    'defend_failed', 'escort_failed', 'zone_lost'];
  const targets = [undefined, 'AXE_POI_CaveEntrance', 'ft_spirit_vein', 'ft_weathered_tablet',
    'no_player_death', 'kali_bleeding_moon_demon', 'fx_ferryman', 'FX_DOCK', 'fx_crate', 'whose',
    'fx_clerk', 'fx_wasp', 'FX_ORCHARD', 'fx_queen_wasp', 'fx_calf_spot', 'fate'];
  return Array.from({ length }, () => ({
    type: pick(types), tier: pick(['normal', 'elite', 'champion', undefined]),
    targetId: pick(targets), itemId: pick([undefined, 'fx_plank']),
    placeId: pick([undefined, 'FX_ORCHARD']), choiceId: pick(['owner', 'keep', 'farm', undefined]),
    count: pick([undefined, 1, 1, 1, 1, 2, 0, -1, 2.5, "3", 101]),
  }));
}

test('all 32 existing quests follow the old reducer, event for event, with or without pledges', () => {
  const legacyIds = QUESTS.map((entry) => entry.id);
  // Two events only a pledge answers, then 600 of every kind.
  const events = [
    { type: 'npc_talked', targetId: 'fx_ferryman' },
    { type: 'location_discovered', targetId: 'FX_DOCK' },
    ...eventStream(600),
  ];
  const run = (withPledges) => {
    freshCharacter({ acceptedIds: legacyIds });
    assert.equal(store.getQuestState().acceptedIds.length, 32);
    if (withPledges) {
      const pledges = [FERRY_CRATE, STRAY_CALF].map((data) => model.definePledge(data));
      registry.registerPledges('test', pledges);
      for (const pledge of pledges) assert.deepEqual(store.acceptQuest(pledge.id), { ok: true });
    }
    const list = withPledges ? [...QUESTS, ...registry.listRegisteredPledges()] : QUESTS;
    // The reference: the reducer and the matcher the store has always used.
    const reference = {};
    const referencePrimary = {};
    let moved = 0;
    for (const event of events) {
      let expectChange = false;
      for (const entry of QUESTS) {
        const objectives = Array.isArray(entry.objectives) && entry.objectives.length
          ? entry.objectives : [entry.objective];
        const previous = reference[entry.id] ||
          Object.fromEntries(objectives.map((o, i) => [o.id || `objective_${i}`, 0]));
        const updated = applyAXEQuestEventProgress(entry, previous, event, game.objectiveMatchesAXEQuestEvent);
        if (!updated.changed) continue;
        expectChange = true;
        reference[entry.id] = updated.progress;
        referencePrimary[entry.id] = updated.primaryProgress;
      }
      const before = store.getQuestState();
      const changed = store.reportQuestEvent(list, event);
      const after = store.getQuestState();
      if (expectChange) { assert.equal(changed, true); moved += 1; }
      for (const id of legacyIds) {
        if (reference[id]) {
          assert.deepEqual(after.objectiveProgress[id], reference[id], `${id} after ${JSON.stringify(event)}`);
          assert.equal(after.progress[id], referencePrimary[id]);
        } else {
          assert.deepEqual(after.objectiveProgress[id], before.objectiveProgress[id]);
        }
      }
    }
    assert.ok(moved >= 25, 'the stream has to move the existing quests for this to mean anything');
    const final = store.getQuestState();
    return {
      objectiveProgress: Object.fromEntries(legacyIds.map((id) => [id, final.objectiveProgress[id]])),
      progress: Object.fromEntries(legacyIds.map((id) => [id, final.progress[id]])),
      pledgeProgress: withPledges ? final.objectiveProgress.fx_ferry_crate : null,
    };
  };
  const alone = run(false);
  const beside = run(true);
  assert.deepEqual(beside.objectiveProgress, alone.objectiveProgress);
  assert.deepEqual(beside.progress, alone.progress);
  // The same stream did move the pledge, in step order, so both paths ran.
  assert.equal(beside.pledgeProgress.ask, 1);
  assert.equal(beside.pledgeProgress.dock, 1);
});

test('a pledge runs through the store: accept, ordered events, choice, complete', () => {
  const name = freshCharacter();
  const ferry = model.definePledge(FERRY_CRATE);
  registry.registerPledges('test', [ferry]);

  // Found by id through the registry, like an AXE quest.
  assert.deepEqual(store.acceptQuest(ferry.id), { ok: true });
  assert.deepEqual(store.getQuestState().objectiveProgress[ferry.id],
    { ask: 0, dock: 0, planks: 0, haul: 0, lantern: 0, whose: 0, hand_over: 0 });
  assert.equal(store.isQuestComplete(ferry), false);
  assert.deepEqual(store.completeQuest(ferry.id), { ok: false, reason: 'OBJECTIVES_INCOMPLETE' });

  // Out of order: ignored. In order, through the window event: counted.
  const events = ferryCrateEvents('keep');
  dispatch('axeQuestEvent', events[2]);
  assert.equal(store.getQuestState().objectiveProgress[ferry.id].planks, 0);
  let notified = 0;
  const unsubscribe = store.subscribeQuests(() => { notified += 1; });
  notified = 0;
  for (const event of events.slice(0, 5)) dispatch('axeQuestEvent', event);
  dispatch('axePledgeEvent', events[5]); // the choice, on the pledge-only channel
  assert.equal(notified, 6); // one update per event, the choice included
  unsubscribe();

  let state = store.getQuestState();
  assert.equal(state.choices['fx_ferry_crate:whose'], 'keep');
  assert.equal(state.storyFlags.fx_crate_kept, true);
  assert.equal(store.isQuestComplete(ferry), false);
  assert.equal(game.claim.buildPledgeCompletionClaim(ferry, state).ready, false);
  assert.equal(store.reportPledgeEvent(events[6]), true);
  state = store.getQuestState();
  assert.equal(store.isQuestComplete(ferry), true);
  const claim = game.claim.buildPledgeCompletionClaim(ferry, state);
  assert.equal(claim.ready, true);
  assert.equal(claim.outcome, 'bent');
  assert.deepEqual(claim.choices, { whose: 'keep' });

  assert.deepEqual(store.completeQuest(ferry.id), { ok: true });
  state = store.getQuestState();
  assert.deepEqual(state.completedIds, [ferry.id]);
  assert.equal(state.storyFlags.fx_ferry_done, true); // storyFlagsOnComplete, as for any quest
  assert.equal(game.outcome.getPledgeOutcome(ferry.id, state), 'bent');
  assert.equal(state.storyFlags['pledge:fx_ferry_crate:bent'], true);
  assert.deepEqual(savedState(name).pledgeOutcomes, { fx_ferry_crate: { outcome: 'bent', kept: 0, bent: 1, broken: 0 } });
  assert.deepEqual(store.acceptQuest(ferry.id), { ok: false, reason: 'ALREADY_COMPLETED' });
});

test('abandoning a sworn pledge records it as broken and undoes its choice', () => {
  freshCharacter();
  const calf = model.definePledge(STRAY_CALF);
  registry.registerPledges('test', [calf]);
  assert.deepEqual(store.abandonQuest(calf.id), { ok: false, reason: 'NOT_ACCEPTED' });
  store.acceptQuest(calf.id);
  dispatch('axeQuestEvent', { type: 'location_discovered', targetId: 'fx_calf_spot' });
  dispatch('axeQuestEvent', { type: 'choice_made', targetId: 'fate', choiceId: 'camp' });
  assert.equal(store.getQuestState().storyFlags.fx_calf_camp, true);
  assert.deepEqual(store.abandonQuest(calf.id), { ok: true });

  let state = store.getQuestState();
  assert.equal(game.outcome.getPledgeOutcome(calf.id, state), 'broken');
  assert.deepEqual(state.abandonedIds, [calf.id]);
  assert.deepEqual(state.acceptedIds, []);
  assert.equal(state.storyFlags.fx_calf_camp, false);
  assert.equal(state.storyFlags['pledge:fx_stray_calf:broken'], true);
  assert.equal('fx_stray_calf:fate' in state.choices, false);

  // Sworn again, it starts from zero and can be kept.
  assert.deepEqual(store.acceptQuest(calf.id), { ok: true });
  state = store.getQuestState();
  assert.deepEqual(state.objectiveProgress[calf.id], { find: 0, fate: 0 });
  assert.deepEqual(state.abandonedIds, []);
  dispatch('axePOIDiscovered', { id: 'fx_calf_spot' }); // the POI event reaches pledges too
  dispatch('axeQuestEvent', { type: 'choice_made', targetId: 'fate', choiceId: 'farm' });
  assert.deepEqual(store.completeQuest(calf.id), { ok: true });
  state = store.getQuestState();
  assert.deepEqual(game.outcome.getPledgeRecord(calf.id, state), { outcome: 'kept', kept: 1, bent: 0, broken: 1 });
  // Repeatable: it may be sworn a third time, again from zero.
  assert.deepEqual(store.acceptQuest(calf.id), { ok: true });
  assert.deepEqual(store.getQuestState().objectiveProgress[calf.id], { find: 0, fate: 0 });
});

test('the store enforces a pledge\'s prerequisites: one id, a list of ids, story flags', () => {
  freshCharacter();
  const pledges = [FERRY_CRATE, ORCHARD_WATCH, STRAY_CALF].map((data) => model.definePledge(data));
  const [ferry, orchard, calf] = pledges;
  registry.registerPledges('test', pledges);
  assert.deepEqual(store.acceptQuest(orchard.id), { ok: false, reason: 'PREREQUISITE_REQUIRED' });

  store.acceptQuest(ferry.id);
  for (const event of ferryCrateEvents('owner')) store.reportPledgeEvent(event);
  assert.deepEqual(store.completeQuest(ferry.id), { ok: true });
  // `requires` is met, `requiresAll` is not yet.
  assert.deepEqual(store.acceptQuest(orchard.id), { ok: false, reason: 'PREREQUISITE_REQUIRED' });

  store.acceptQuest(calf.id);
  store.reportPledgeEvent({ type: 'location_discovered', targetId: 'fx_calf_spot' });
  store.reportPledgeEvent({ type: 'choice_made', targetId: 'fate', choiceId: 'farm' });
  store.completeQuest(calf.id);
  store.setQuestStoryFlag('fx_ferry_done', false);
  assert.deepEqual(store.acceptQuest(orchard.id), { ok: false, reason: 'STORY_FLAG_REQUIRED' });
  store.setQuestStoryFlag('fx_ferry_done', true);
  assert.deepEqual(store.acceptQuest(orchard.id), { ok: true });

  for (const event of orchardWatchEvents()) dispatch('axePledgeEvent', event);
  assert.deepEqual(store.completeQuest(orchard.id), { ok: true });
  assert.equal(game.outcome.getPledgeOutcome(orchard.id, store.getQuestState()), 'kept');
});

test('two sworn pledges and an AXE quest each take only what is theirs from one event', () => {
  freshCharacter();
  const shared = (id, target) => model.definePledge({
    id, title: 'Fixture', description: 'Fixture.',
    pledge: {
      line: 'fixture', swornTo: 'x', cause: 'x', cost: 'x',
      steps: [
        { id: 'arrive', kind: 'go_to', text: 'Arrive.', target: 'AXE_POI_CaveEntrance' },
        { id: 'decide', kind: 'choose', text: 'Decide.' },
        { id: 'speak', kind: 'talk', text: 'Speak.', target },
      ],
      choices: { decide: { options: [{ id: 'a', text: 'A.' }, { id: 'b', text: 'B.', outcome: 'bent' }] } },
    },
  });
  const one = shared('fx_one', 'fx_npc');
  const two = shared('fx_two', 'fx_npc');
  registry.registerPledges('test', [one, two]);
  assert.throws(() => registry.registerPledges('other-file', [shared('fx_one', 'fx_npc')]), /already registered by "test"/);
  store.acceptQuest(one.id);
  store.acceptQuest(two.id);
  dispatch('axePOIDiscovered', { id: 'AXE_POI_CaveEntrance' }); // both are waiting for it
  // The step ids are the same in both: `pledgeId` says whose choice it is.
  dispatch('axeQuestEvent', { type: 'choice_made', targetId: 'decide', choiceId: 'b', pledgeId: 'fx_two' });
  let state = store.getQuestState();
  assert.deepEqual(state.objectiveProgress.fx_one, { arrive: 1, decide: 0, speak: 0 });
  assert.deepEqual(state.objectiveProgress.fx_two, { arrive: 1, decide: 1, speak: 0 });
  assert.deepEqual(state.choices, { 'fx_two:decide': 'b' });
  dispatch('axeQuestEvent', { type: 'choice_made', targetId: 'decide', choiceId: 'a', pledgeId: 'fx_one' });
  dispatch('axeQuestEvent', { type: 'npc_talked', targetId: 'fx_npc' });
  state = store.getQuestState();
  assert.equal(store.isQuestComplete(one, state), true);
  assert.equal(store.isQuestComplete(two, state), true);
  store.completeQuest(one.id);
  store.completeQuest(two.id);
  state = store.getQuestState();
  assert.equal(game.outcome.getPledgeOutcome('fx_one', state), 'kept');
  assert.equal(game.outcome.getPledgeOutcome('fx_two', state), 'bent');

  // Registering the same source again replaces its set (a hot reload).
  registry.registerPledges('test', [one]);
  assert.equal(registry.listRegisteredPledges().length, 1);
  assert.equal(registry.getRegisteredPledge('fx_two'), null);
  assert.throws(() => registry.registerPledges('test', [{ id: 'not_defined' }]), /must come from definePledge/);
  assert.throws(() => registry.registerPledges('test', [one, one]), /listed twice/);
});

test('the store has no import cycle with the quest data and no pledge content of its own', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (path) => readFileSync(new URL('../src/components/game3d/' + path, import.meta.url), 'utf8');
  for (const file of ['pledgeModel.mjs', 'pledgeProgress.mjs', 'pledgeState.mjs', 'pledgeOutcome.mjs',
    'pledgeStandings.mjs', 'pledgeClaim.mjs', 'pledgeRegistry.mjs']) {
    const source = read('pledges/' + file);
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|base44|localStorage/, file);
    // Explicit extensions only, so Node can load every one of them, and no
    // import of the quest data or the store.
    for (const [, from] of source.matchAll(/from '([^']+)'/g)) {
      assert.match(from, /\.(mjs|js)$/, `${file}: ${from}`);
      assert.doesNotMatch(from, /questData|useQuestStore|AXEQuestFramework/, `${file}: ${from}`);
    }
  }
  assert.doesNotMatch(read('questData.jsx'), /pledge/i);
  assert.doesNotMatch(read('GameWorld3D.jsx'), /pledges\//);
});

test('the worked example of PLEDGE_ENGINE.md: from accept to the completion claim', () => {
  freshCharacter();
  const pledge = model.definePledge(EXAMPLE_PLEDGE);
  registry.registerPledges('example', [pledge]);
  const patrol = AXE_QUESTS.find((entry) => entry.id === 'axe_q_first_patrol');
  store.acceptQuest(patrol.id); // an older kill quest, sworn beside it
  assert.deepEqual(store.acceptQuest(pledge.id), { ok: true });

  const stepIds = pledge.pledge.steps.map((step) => step.id);
  const announced = [];
  let previous = store.getQuestState().objectiveProgress[pledge.id];
  for (const { on, detail, after } of EXAMPLE_EVENTS) {
    dispatch(on, detail);
    const now = store.getQuestState().objectiveProgress[pledge.id];
    assert.deepEqual(stepIds.map((id) => now[id]), after, JSON.stringify(detail));
    const changes = game.progress.getPledgeStepChanges(pledge, previous, now);
    announced.push(...changes.done.map((id) => 'done ' + id), ...changes.failed.map((id) => 'failed ' + id),
      ...changes.started.map((id) => 'started ' + id), ...(changes.ready ? ['ready'] : []));
    previous = now;
  }
  // What a watcher would announce on the bus, in order.
  assert.deepEqual(announced, [
    'done ask', 'started reach_mill',
    'done reach_mill', 'started clear_rats',
    'done clear_rats', 'started haul', 'started ring_bell',
    'failed haul',
    'done ring_bell',
    'done haul', 'started whose',
    'done whose', 'started hand_over',
    'done hand_over', 'ready',
  ]);
  // The kills went on the pledge-only channel, so the older kill quest did not count them.
  assert.equal(store.getQuestState().objectiveProgress[patrol.id].patrol_kills, 0);

  let state = store.getQuestState();
  assert.equal(state.choices['example_mill_sacks:whose'], 'camp');
  assert.equal(state.storyFlags.example_sacks_to_camp, true);
  assert.equal(state.storyFlags.example_sacks_to_farm, false);
  assert.deepEqual(game.claim.buildPledgeCompletionClaim(pledge, state), EXAMPLE_CLAIM);
  assert.deepEqual(game.standings.getPledgeStandingRequest(pledge, 'bent', state), { renown: 3, trust: -1, regard: 1 });

  assert.deepEqual(store.completeQuest(pledge.id), { ok: true });
  state = store.getQuestState();
  assert.equal(game.outcome.getPledgeOutcome(pledge.id, state), 'bent');
  assert.equal(state.storyFlags['pledge:example_mill_sacks:bent'], true);
  assert.equal(state.storyFlags.example_mill_done, true);
});

test('the same kill sent on axeQuestEvent would also count for the older AXE kill quests', () => {
  freshCharacter();
  const pledge = model.definePledge(EXAMPLE_PLEDGE);
  registry.registerPledges('example', [pledge]);
  const patrol = AXE_QUESTS.find((entry) => entry.id === 'axe_q_first_patrol');
  store.acceptQuest(patrol.id);
  store.acceptQuest(pledge.id);
  dispatch('axeQuestEvent', { type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P09', kind: 'example_rat', tier: 'normal', count: 1 });
  // This is how the bridge has always treated AXE quests; it is why kills belong on axePledgeEvent.
  assert.equal(store.getQuestState().objectiveProgress[patrol.id].patrol_kills, 1);
});
