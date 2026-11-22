// Ordered progress, failure resets, choices, outcomes, standings and the
// completion claim, as pure logic (no store, no browser).
// Run: node --test tests/game3d-pledge-progress.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import {
  applyPledgeEventProgress, getPledgeActiveGroup, getPledgeStepProgress, isPledgeReadyToComplete,
} from '../src/components/game3d/pledges/pledgeProgress.mjs';
import {
  pledgeStateOnAbandon, pledgeStateOnAccept, pledgeStateOnComplete, pledgeStateOnEvent,
} from '../src/components/game3d/pledges/pledgeState.mjs';
import {
  getPledgeChoices, getPledgeOutcome, getPledgeRecord, resolvePledgeOutcome,
} from '../src/components/game3d/pledges/pledgeOutcome.mjs';
import { getPledgeStandingRequest } from '../src/components/game3d/pledges/pledgeStandings.mjs';
import { buildPledgeCompletionClaim } from '../src/components/game3d/pledges/pledgeClaim.mjs';
import {
  FERRY_CRATE, ORCHARD_WATCH, STRAY_CALF, ferryCrateEvents, orchardWatchEvents,
} from './game3d-pledge-fixtures.mjs';

const ferry = definePledge(FERRY_CRATE);
const orchard = definePledge(ORCHARD_WATCH);
const calf = definePledge(STRAY_CALF);

// A stand-in for the quest store's state, moved only by the pure functions
// the store itself calls for a pledge.
const emptyState = () => ({
  acceptedIds: [], completedIds: [], progress: {}, objectiveProgress: {},
  storyFlags: {}, choices: {}, abandonedIds: [],
});
const accept = (state, pledge) => ({
  ...state, acceptedIds: [...state.acceptedIds, pledge.id],
  ...pledgeStateOnAccept(state, pledge),
});
const send = (state, pledge, event) => {
  const staged = pledgeStateOnEvent(state, pledge, event);
  return staged.changed ? { ...state, ...staged.patch } : state;
};
const sendAll = (state, pledge, events) => events.reduce((s, e) => send(s, pledge, e), state);
const complete = (state, pledge) => {
  const next = {
    ...state,
    acceptedIds: state.acceptedIds.filter((id) => id !== pledge.id),
    completedIds: [...new Set([...state.completedIds, pledge.id])],
  };
  return { ...next, ...pledgeStateOnComplete(next, pledge) };
};
const abandon = (state, pledge) => {
  const next = {
    ...state,
    acceptedIds: state.acceptedIds.filter((id) => id !== pledge.id),
    objectiveProgress: { ...state.objectiveProgress, [pledge.id]: {} },
    progress: { ...state.progress, [pledge.id]: 0 },
    abandonedIds: [...new Set([...state.abandonedIds, pledge.id])],
  };
  return { ...next, ...pledgeStateOnAbandon(next, pledge) };
};
const counts = (state, pledge) => state.objectiveProgress[pledge.id];

test('steps advance in order: an event for a later step is ignored', () => {
  let state = accept(emptyState(), ferry);
  assert.deepEqual(counts(state, ferry), { ask: 0, dock: 0, planks: 0, haul: 0, lantern: 0, whose: 0, hand_over: 0 });
  assert.equal(getPledgeActiveGroup(ferry, counts(state, ferry)).stepId, 'ask');

  // Events for steps 2 to 7 arrive first: nothing moves.
  const later = ferryCrateEvents().slice(1);
  for (const event of later) {
    const before = state;
    state = send(state, ferry, event);
    assert.equal(state, before, `${event.type} must be ignored while "ask" is open`);
  }

  state = send(state, ferry, { type: 'npc_talked', targetId: 'fx_ferryman' });
  assert.equal(counts(state, ferry).ask, 1);
  assert.equal(state.progress[ferry.id], 1); // the first step is mirrored in progress[id]
  assert.equal(getPledgeActiveGroup(ferry, counts(state, ferry)).stepId, 'dock');

  // A finished step does not move again.
  const again = send(state, ferry, { type: 'npc_talked', targetId: 'fx_ferryman' });
  assert.equal(again, state);

  // The wrong target, the wrong place, the wrong item: ignored.
  assert.equal(send(state, ferry, { type: 'location_discovered', targetId: 'FX_YARD' }), state);
  state = send(state, ferry, { type: 'location_discovered', targetId: 'FX_DOCK' });
  assert.equal(send(state, ferry, { type: 'item_collected', itemId: 'fx_stone' }), state);

  // Counts add up and stop at the step's count.
  state = send(state, ferry, { type: 'item_collected', itemId: 'fx_plank' });
  assert.equal(counts(state, ferry).planks, 1);
  state = send(state, ferry, { type: 'item_collected', itemId: 'fx_plank', count: 50 });
  assert.equal(counts(state, ferry).planks, 3);
  assert.equal(getPledgeActiveGroup(ferry, counts(state, ferry)).stepId, 'haul');
});

test('one event moves one step, even when it could match the next one too', () => {
  const twice = definePledge({
    id: 'fx_twice', title: 'Fixture', description: 'Fixture.',
    pledge: {
      line: 'fixture', swornTo: 'x', cause: 'x', cost: 'x',
      steps: [
        { id: 'first', kind: 'use', text: 'Pull the lever.', target: 'fx_lever' },
        { id: 'second', kind: 'use', text: 'Pull it again.', target: 'fx_lever' },
      ],
    },
  });
  let state = accept(emptyState(), twice);
  state = send(state, twice, { type: 'world_interact', targetId: 'fx_lever' });
  assert.deepEqual(counts(state, twice), { first: 1, second: 0 });
  state = send(state, twice, { type: 'world_interact', targetId: 'fx_lever' });
  assert.deepEqual(counts(state, twice), { first: 1, second: 1 });
});

test('bad event counts are refused, as for the existing quests', () => {
  let state = accept(emptyState(), ferry);
  state = sendAll(state, ferry, ferryCrateEvents().slice(0, 2));
  for (const count of [0, -1, 2.5, '3', true, Infinity, 101]) {
    assert.equal(send(state, ferry, { type: 'item_collected', itemId: 'fx_plank', count }), state, `count ${String(count)}`);
  }
  assert.equal(send(state, ferry, {}), state);
  assert.equal(send(state, ferry, { type: '' }), state);
  assert.equal(send(state, ferry, null), state);
});

test('an optional step is open only while the required step before it is open', () => {
  let state = accept(emptyState(), ferry);
  const lantern = { type: 'world_interact', targetId: 'fx_lantern' };
  state = sendAll(state, ferry, ferryCrateEvents().slice(0, 2));
  // "planks" is open; "lantern" belongs to "haul": not yet.
  assert.equal(send(state, ferry, lantern), state);
  state = send(state, ferry, { type: 'item_collected', itemId: 'fx_plank', count: 3 });
  const group = getPledgeActiveGroup(ferry, counts(state, ferry));
  assert.equal(group.stepId, 'haul');
  assert.deepEqual(group.optionalStepIds, ['lantern']);
  state = send(state, ferry, lantern);
  assert.equal(counts(state, ferry).lantern, 1);

  // Without it the pledge can still be finished, and once "haul" is done the
  // optional step is closed for good.
  let other = accept(emptyState(), ferry);
  other = sendAll(other, ferry, ferryCrateEvents().slice(0, 5));
  assert.equal(getPledgeActiveGroup(ferry, counts(other, ferry)).stepId, 'whose');
  assert.equal(send(other, ferry, lantern), other);
  other = sendAll(other, ferry, ferryCrateEvents().slice(5));
  assert.equal(isPledgeReadyToComplete(ferry, counts(other, ferry)), true);
  assert.equal(counts(other, ferry).lantern, 0);
  assert.equal(getPledgeActiveGroup(ferry, counts(other, ferry)), null);
});

test('failsOn sends an open step back to zero', () => {
  let state = accept(emptyState(), ferry);
  state = sendAll(state, ferry, ferryCrateEvents().slice(0, 3));
  // Dropping the crate before the step is open changes nothing.
  let early = accept(emptyState(), ferry);
  assert.equal(send(early, ferry, { type: 'carry_dropped', targetId: 'fx_crate' }), early);

  state = send(state, ferry, { type: 'carry_completed', targetId: 'fx_crate' });
  assert.equal(counts(state, ferry).haul, 1);
  // A drop of something else is not this step's failure.
  assert.equal(send(state, ferry, { type: 'carry_dropped', targetId: 'fx_other_thing' }), state);
  const dropped = pledgeStateOnEvent(state, ferry, { type: 'carry_dropped', targetId: 'fx_crate' });
  assert.equal(dropped.changed, true);
  assert.deepEqual(dropped.result.failed, ['haul']);
  assert.deepEqual(dropped.result.advanced, []);
  state = { ...state, ...dropped.patch };
  assert.equal(counts(state, ferry).haul, 0);
  assert.equal(counts(state, ferry).planks, 3); // earlier steps keep what they had
  assert.equal(getPledgeActiveGroup(ferry, counts(state, ferry)).stepId, 'haul');
  // A fail event with no target reaches any open step that listens for it.
  state = send(state, ferry, { type: 'carry_completed', targetId: 'fx_crate' });
  state = send(state, ferry, { type: 'carry_dropped' });
  assert.equal(counts(state, ferry).haul, 0);
  // Once the step is finished, the failure event no longer reaches it.
  state = send(state, ferry, { type: 'carry_completed', targetId: 'fx_crate', count: 2 });
  assert.equal(counts(state, ferry).haul, 2);
  assert.equal(send(state, ferry, { type: 'carry_dropped', targetId: 'fx_crate' }), state);

  // defend with a count: two heaves held, the third lost, all three again.
  let watch = accept(emptyState(), orchard);
  watch = send(watch, orchard, orchardWatchEvents()[0]);
  watch = send(watch, orchard, { type: 'defend_completed', targetId: 'FX_ORCHARD', count: 2 });
  assert.equal(counts(watch, orchard).heaves, 2);
  watch = send(watch, orchard, { type: 'defend_failed', targetId: 'FX_ORCHARD' });
  assert.equal(counts(watch, orchard).heaves, 0);
  assert.equal(counts(watch, orchard).wasps, 4);
});

test('the second fixture runs from first step to last', () => {
  let state = accept(emptyState(), orchard);
  // The game's plain kill event (no kind, no place) does not count.
  assert.equal(send(state, orchard, { type: 'enemy_killed', tier: 'normal', count: 1 }), state);
  state = send(state, orchard, { type: 'enemy_killed', targetId: 'fx_wasp', placeId: 'FX_ORCHARD' });
  assert.equal(counts(state, orchard).wasps, 1);
  state = sendAll(state, orchard, [
    { type: 'enemy_killed', targetId: 'fx_wasp', placeId: 'FX_ORCHARD', count: 3 },
    { type: 'world_interact', targetId: 'fx_bell' }, // optional, belongs to "heaves"
    ...orchardWatchEvents().slice(1),
  ]);
  assert.deepEqual(counts(state, orchard), {
    wasps: 4, heaves: 3, bell: 1, queen: 1, mound: 1, walk_home: 1, drone: 1,
  });
  assert.equal(isPledgeReadyToComplete(orchard, counts(state, orchard)), true);
  assert.deepEqual(getPledgeStepProgress(orchard, counts(state, orchard)).map((row) => row.done),
    [true, true, true, true, true, true, true]);
  // No choices in this pledge: completing it is "kept".
  state = complete(state, orchard);
  assert.equal(getPledgeOutcome(orchard.id, state), 'kept');
  assert.deepEqual(getPledgeStandingRequest(orchard, 'kept', state), { renown: 5, trust: 2, regard: 0 });
  assert.deepEqual(getPledgeStandingRequest(orchard, 'kept'), { renown: 5, trust: 0, regard: 0 });
});

test('an event may name the one pledge it is for', () => {
  let state = accept(accept(emptyState(), ferry), calf);
  const forCalf = { type: 'npc_talked', targetId: 'fx_ferryman', pledgeId: calf.id };
  assert.equal(send(state, ferry, forCalf), state);
  state = send(state, ferry, { type: 'npc_talked', targetId: 'fx_ferryman', pledgeId: ferry.id });
  assert.equal(counts(state, ferry).ask, 1);
});

test('a choice is recorded under pledge id and step id, and sets its story flags', () => {
  let state = accept(emptyState(), ferry);
  state = sendAll(state, ferry, ferryCrateEvents().slice(0, 5));
  // Not one of the options: ignored, the step stays open.
  assert.equal(send(state, ferry, { type: 'choice_made', targetId: 'whose', choiceId: 'burn_it' }), state);
  assert.equal(send(state, ferry, { type: 'choice_made', targetId: 'whose' }), state);
  assert.equal(send(state, ferry, { type: 'choice_made', targetId: 'other_step', choiceId: 'keep' }), state);

  const staged = pledgeStateOnEvent(state, ferry, { type: 'choice_made', targetId: 'whose', choiceId: 'keep' });
  assert.deepEqual(staged.result.choice, {
    stepId: 'whose', choiceId: 'keep', outcome: 'bent', key: 'fx_ferry_crate:whose',
    flagsOn: ['fx_crate_kept'], flagsOff: ['fx_crate_returned'],
  });
  state = { ...state, ...staged.patch };
  assert.equal(state.choices['fx_ferry_crate:whose'], 'keep');
  assert.equal(state.storyFlags.fx_crate_kept, true);
  assert.equal(state.storyFlags.fx_crate_returned, false);
  assert.equal(counts(state, ferry).whose, 1);
  assert.deepEqual(getPledgeChoices(ferry, state), { whose: 'keep' });
  // A made choice cannot be made again.
  assert.equal(send(state, ferry, { type: 'choice_made', targetId: 'whose', choiceId: 'owner' }), state);
});

test('outcome: kept when done as sworn, bent when done another way, broken when abandoned', () => {
  const run = (choiceId) => complete(sendAll(accept(emptyState(), ferry), ferry, ferryCrateEvents(choiceId)), ferry);

  const kept = run('owner');
  assert.equal(getPledgeOutcome(ferry.id, kept), 'kept');
  assert.deepEqual(getPledgeRecord(ferry.id, kept), { outcome: 'kept', kept: 1, bent: 0, broken: 0 });
  assert.equal(kept.storyFlags['pledge:fx_ferry_crate:kept'], true);
  assert.equal(kept.storyFlags['pledge:fx_ferry_crate:bent'], false);
  assert.equal(kept.storyFlags.fx_crate_returned, true);

  const bent = run('keep');
  assert.equal(getPledgeOutcome(ferry.id, bent), 'bent');
  assert.equal(bent.storyFlags['pledge:fx_ferry_crate:bent'], true);

  // Never sworn: no outcome. Sworn and under way: none yet.
  assert.equal(getPledgeOutcome(ferry.id, emptyState()), null);
  assert.equal(getPledgeRecord(ferry.id, emptyState()), null);
  let state = accept(emptyState(), ferry);
  assert.equal(getPledgeOutcome(ferry.id, state), null);
  assert.equal(resolvePledgeOutcome(ferry, state), 'kept');

  // Abandon after the choice: broken, and the choice is undone.
  state = sendAll(state, ferry, ferryCrateEvents('keep').slice(0, 6));
  assert.equal(state.storyFlags.fx_crate_kept, true);
  state = abandon(state, ferry);
  assert.equal(getPledgeOutcome(ferry.id, state), 'broken');
  assert.equal(state.storyFlags['pledge:fx_ferry_crate:broken'], true);
  assert.equal(state.storyFlags.fx_crate_kept, false);
  assert.equal('fx_ferry_crate:whose' in state.choices, false);
  assert.deepEqual(getPledgeChoices(ferry, state), {});
  assert.deepEqual(getPledgeStandingRequest(ferry, 'broken', state), { renown: 0, trust: -2, regard: 0 });

  // Sworn again and kept: the record holds both, the flags show the latest.
  state = complete(sendAll(accept(state, ferry), ferry, ferryCrateEvents('owner')), ferry);
  assert.deepEqual(getPledgeRecord(ferry.id, state), { outcome: 'kept', kept: 1, bent: 0, broken: 1 });
  assert.equal(state.storyFlags['pledge:fx_ferry_crate:broken'], false);
  assert.equal(state.storyFlags['pledge:fx_ferry_crate:kept'], true);
});

test('a repeatable pledge starts from zero each time and can end differently', () => {
  const events = (choiceId) => [
    { type: 'location_discovered', targetId: 'fx_calf_spot' },
    { type: 'choice_made', targetId: 'fate', choiceId },
  ];
  let state = complete(sendAll(accept(emptyState(), calf), calf, events('free')), calf);
  assert.equal(getPledgeOutcome(calf.id, state), 'bent');
  assert.equal(state.storyFlags.fx_calf_free, true);
  assert.equal(state.storyFlags.fx_calf_farm, true); // "free" names both flags

  state = accept(state, calf);
  assert.deepEqual(counts(state, calf), { find: 0, fate: 0 });
  assert.equal('fx_stray_calf:fate' in state.choices, false);
  assert.deepEqual(getPledgeChoices(calf, state), {});
  state = complete(sendAll(state, calf, events('farm')), calf);
  assert.equal(getPledgeOutcome(calf.id, state), 'kept');
  assert.equal(state.storyFlags.fx_calf_farm, true);
  assert.equal(state.storyFlags.fx_calf_free, false); // the other options' flags are cleared
  assert.equal(state.storyFlags.fx_calf_camp, false);
  assert.deepEqual(getPledgeRecord(calf.id, state), { outcome: 'kept', kept: 1, bent: 1, broken: 0 });
});

test('standings are a request read from the definition, per outcome', () => {
  assert.deepEqual(getPledgeStandingRequest(ferry, 'kept'), { renown: 1, trust: 3, regard: 0 });
  assert.deepEqual(getPledgeStandingRequest(ferry, 'bent'), { renown: 4, trust: -1, regard: 0 });
  assert.deepEqual(getPledgeStandingRequest(ferry, 'broken'), { renown: 0, trust: -2, regard: 0 });
  assert.deepEqual(getPledgeStandingRequest(ferry, 'nonsense'), { renown: 0, trust: 0, regard: 0 });
  assert.deepEqual(getPledgeStandingRequest(null, 'kept'), { renown: 0, trust: 0, regard: 0 });

  // The optional step adds what the definition says for it, when it was done.
  let state = accept(emptyState(), ferry);
  state = sendAll(state, ferry, [
    ...ferryCrateEvents('owner').slice(0, 4),
    { type: 'world_interact', targetId: 'fx_lantern' },
    ...ferryCrateEvents('owner').slice(4),
  ]);
  assert.deepEqual(getPledgeStandingRequest(ferry, 'kept', state), { renown: 1, trust: 3, regard: 1 });
  assert.deepEqual(getPledgeStandingRequest(ferry, 'broken', state), { renown: 0, trust: -2, regard: 0 });
});

test('the completion claim lists the pledge, each step with its count, the choices and the outcome', () => {
  let state = accept(emptyState(), ferry);
  state = sendAll(state, ferry, ferryCrateEvents('keep').slice(0, 4));
  const partial = buildPledgeCompletionClaim(ferry, state);
  assert.equal(partial.ready, false);
  assert.equal(partial.outcome, null);
  assert.deepEqual(partial.choices, {});

  state = sendAll(state, ferry, ferryCrateEvents('keep').slice(4));
  const claim = buildPledgeCompletionClaim(ferry, state);
  assert.deepEqual(claim, {
    kind: 'pledge_completion_claim',
    version: 1,
    pledgeId: 'fx_ferry_crate',
    line: 'fixture',
    chapter: 1,
    ready: true,
    steps: [
      { id: 'ask', kind: 'talk', count: 1, required: 1, optional: false, done: true },
      { id: 'dock', kind: 'go_to', count: 1, required: 1, optional: false, done: true },
      { id: 'planks', kind: 'pick_up', count: 3, required: 3, optional: false, done: true },
      { id: 'haul', kind: 'carry', count: 2, required: 2, optional: false, done: true },
      { id: 'lantern', kind: 'use', count: 0, required: 1, optional: true, done: false },
      { id: 'whose', kind: 'choose', count: 1, required: 1, optional: false, done: true },
      { id: 'hand_over', kind: 'deliver', count: 1, required: 1, optional: false, done: true },
    ],
    choices: { whose: 'keep' },
    outcome: 'bent',
  });
  // Plain data: it survives being sent as JSON, and it asks for no reward.
  assert.deepEqual(JSON.parse(JSON.stringify(claim)), claim);
  assert.equal('reward' in claim, false);
  assert.equal('standings' in claim, false);
  // Counts are clamped to what the step asks for, whatever the state says.
  const inflated = { ...state, objectiveProgress: { [ferry.id]: { ...counts(state, ferry), planks: 999 } } };
  assert.equal(buildPledgeCompletionClaim(ferry, inflated).steps[2].count, 3);
  assert.equal(buildPledgeCompletionClaim({ id: 'q1_first_blood' }, state), null);
});

test('a quest that is not a pledge is left alone by every pledge function', () => {
  const legacy = { id: 'legacy', objective: { type: 'kill', count: 3 } };
  assert.equal(applyPledgeEventProgress(legacy, {}, { type: 'enemy_killed' }).changed, false);
  assert.deepEqual(pledgeStateOnAccept(emptyState(), legacy), {});
  assert.deepEqual(pledgeStateOnComplete(emptyState(), legacy), {});
  assert.deepEqual(pledgeStateOnAbandon(emptyState(), legacy), {});
  assert.equal(pledgeStateOnEvent(emptyState(), legacy, { type: 'enemy_killed' }).changed, false);
  assert.deepEqual(getPledgeStepProgress(legacy, {}), []);
  assert.equal(getPledgeActiveGroup(legacy, {}), null);
  assert.equal(isPledgeReadyToComplete(legacy, {}), false);
});
