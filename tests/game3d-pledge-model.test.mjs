// Pledge definitions: shape, validation and the step-kind table.
// Run: node --test tests/game3d-pledge-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLEDGE_NEW_EVENT_TYPES, PLEDGE_NEW_OBJECTIVE_TYPES, PLEDGE_STEP_KIND_IDS, PLEDGE_STEP_KINDS,
  PledgeDefinitionError, definePledge, isPledge, pledgeChoiceKey, pledgeObjectiveMatchesEvent,
  pledgeOutcomeFlag, pledgePrerequisitesMet, validatePledge,
} from '../src/components/game3d/pledges/pledgeModel.mjs';
import { FERRY_CRATE, ORCHARD_WATCH, STRAY_CALF } from './game3d-pledge-fixtures.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const problemsOf = (data) => {
  try { definePledge(data); } catch (error) {
    assert.ok(error instanceof PledgeDefinitionError);
    return error;
  }
  return assert.fail('expected the definition to be rejected');
};

test('the thirteen step kinds, each tied to one objective type and one event', () => {
  assert.deepEqual(PLEDGE_STEP_KIND_IDS, [
    'talk', 'go_to', 'defeat', 'defeat_boss', 'pick_up', 'carry', 'deliver', 'use', 'escort',
    'defend', 'hold_zone', 'choose', 'spare',
  ]);
  const table = Object.fromEntries(PLEDGE_STEP_KIND_IDS.map((kind) => {
    const row = PLEDGE_STEP_KINDS[kind];
    return [kind, `${row.objectiveType} <- ${row.eventType} (${row.idField})`];
  }));
  assert.deepEqual(table, {
    talk: 'talk <- npc_talked (targetId)',
    go_to: 'discover_location <- location_discovered (targetId)',
    defeat: 'kill <- enemy_killed (targetId)',
    defeat_boss: 'defeat_boss <- boss_killed (targetId)',
    pick_up: 'collect_item <- item_collected (itemId)',
    carry: 'carry <- carry_completed (targetId)',
    deliver: 'deliver <- item_delivered (targetId)',
    use: 'interact <- world_interact (targetId)',
    escort: 'escort <- escort_completed (targetId)',
    defend: 'defend <- defend_completed (targetId)',
    hold_zone: 'capture <- capture_completed (targetId)',
    choose: 'choose <- choice_made (targetId)',
    spare: 'spare <- enemy_spared (targetId)',
  });
  assert.deepEqual(PLEDGE_NEW_OBJECTIVE_TYPES, ['carry', 'deliver', 'choose', 'spare']);
  assert.deepEqual(PLEDGE_NEW_EVENT_TYPES, ['carry_completed', 'item_delivered', 'choice_made', 'enemy_spared']);
  // One event per kind: no two kinds wait for the same event.
  const events = PLEDGE_STEP_KIND_IDS.map((kind) => PLEDGE_STEP_KINDS[kind].eventType);
  assert.equal(new Set(events).size, events.length);
});

test('the fixtures between them use every step kind', () => {
  const used = new Set([FERRY_CRATE, ORCHARD_WATCH, STRAY_CALF]
    .flatMap((data) => data.pledge.steps.map((step) => step.kind)));
  assert.deepEqual([...used].sort(), [...PLEDGE_STEP_KIND_IDS].sort());
});

test('definePledge returns a frozen object the quest code can treat as a quest', () => {
  const pledge = definePledge(FERRY_CRATE);
  assert.ok(isPledge(pledge));
  assert.equal(pledge.sequential, true);
  assert.equal(pledge.id, 'fx_ferry_crate');
  assert.equal(pledge.npcId, 'fx_ferryman');
  assert.equal(pledge.unlockLevel, 2);
  assert.equal(pledge.repeatable, false);
  assert.equal(pledge.priority, 0);
  assert.equal(pledge.factionId, null);
  assert.equal(pledge.requires, null);
  assert.deepEqual(pledge.requiresAll, []);
  assert.deepEqual(pledge.storyFlagsRequired, []);
  assert.deepEqual(pledge.storyFlagsOnComplete, ['fx_ferry_done']);
  assert.equal(pledge.category, 'chapter');
  // The browser grants whatever `reward` says, so a pledge's is always empty.
  assert.deepEqual(pledge.reward, {});
  assert.deepEqual(pledge.optionalObjectives, []);

  // One objective per step, in order, and the legacy single `objective`.
  assert.equal(pledge.objectives.length, FERRY_CRATE.pledge.steps.length);
  assert.equal(pledge.objective, pledge.objectives[0]);
  assert.deepEqual(pledge.objectives.map((o) => [o.id, o.type, o.count, o.optional]), [
    ['ask', 'talk', 1, false],
    ['dock', 'discover_location', 1, false],
    ['planks', 'collect_item', 3, false],
    ['haul', 'carry', 2, false],
    ['lantern', 'interact', 1, true],
    ['whose', 'choose', 1, false],
    ['hand_over', 'deliver', 1, false],
  ]);
  const byId = Object.fromEntries(pledge.objectives.map((o) => [o.id, o]));
  assert.equal(byId.ask.targetId, 'fx_ferryman');
  assert.equal(byId.dock.targetId, 'FX_DOCK'); // go_to with only a place: the place is the target
  assert.equal(byId.dock.placeId, 'FX_DOCK');
  assert.equal(byId.planks.itemId, 'fx_plank');
  assert.equal(byId.planks.targetId, undefined);
  assert.equal(byId.haul.targetId, 'fx_crate');
  assert.deepEqual(byId.haul.failsOn, ['carry_dropped']);
  assert.equal(byId.lantern.seconds, 4);
  assert.equal(byId.whose.targetId, 'whose'); // a choose step is its own target
  assert.equal(byId.ask.label, 'Ask the ferryman what was lost.');
  assert.equal(byId.ask.description, byId.ask.label);

  assert.equal(pledge.pledge.line, 'fixture');
  assert.equal(pledge.pledge.chapter, 1);
  assert.equal(pledge.pledge.swornTo, 'the ferryman');
  assert.equal(pledge.pledge.steps.length, 7);
  assert.equal(pledge.pledge.choices.whose.options[0].outcome, 'kept'); // default
  assert.equal(pledge.pledge.choices.whose.options[1].outcome, 'bent');
  assert.deepEqual(pledge.pledge.standings.kept, { renown: 1, trust: 3, regard: 0 });
  assert.deepEqual(pledge.pledge.standings.broken, { renown: 0, trust: -2, regard: 0 });
  assert.deepEqual(pledge.pledge.rewardPreview, { kinds: ['experience', 'trust'] });

  for (const part of [pledge, pledge.objectives, pledge.objectives[3], pledge.objectives[3].failsOn,
    pledge.reward, pledge.pledge, pledge.pledge.steps, pledge.pledge.steps[0], pledge.pledge.choices,
    pledge.pledge.choices.whose.options[0].flags, pledge.pledge.standings.kept]) {
    assert.ok(Object.isFrozen(part));
  }
  // The data the pledge was made from is not frozen or changed.
  assert.ok(!Object.isFrozen(FERRY_CRATE.pledge.steps));
});

test('the other two fixtures define cleanly', () => {
  assert.deepEqual(validatePledge(ORCHARD_WATCH), []);
  assert.deepEqual(validatePledge(STRAY_CALF), []);
  const orchard = definePledge(ORCHARD_WATCH);
  assert.equal(orchard.requires, 'fx_ferry_crate');
  assert.deepEqual(orchard.requiresAll, ['fx_ferry_crate', 'fx_stray_calf']);
  assert.equal(orchard.objectives[1].targetId, 'FX_ORCHARD'); // defend with only a place
  assert.equal(orchard.objectives[0].placeId, 'FX_ORCHARD');
  const calf = definePledge(STRAY_CALF);
  assert.equal(calf.npcId, null);
  assert.equal(calf.repeatable, true);
  assert.equal(calf.category, 'side'); // no chapter number
});

test('errors name the pledge id and the step id', () => {
  const data = clone(FERRY_CRATE);
  data.pledge.steps[3].count = 0;
  data.pledge.steps[0].kind = 'dance';
  delete data.pledge.steps[1].placeId;
  const error = problemsOf(data);
  assert.equal(error.pledgeId, 'fx_ferry_crate');
  assert.match(error.message, /^Pledge "fx_ferry_crate" is not valid:/);
  assert.ok(error.problems.some((line) => /step "haul" count must be a whole number/.test(line)));
  assert.ok(error.problems.some((line) => /step "ask" has unknown kind "dance"/.test(line)));
  assert.ok(error.problems.some((line) => /step "dock" of kind "go_to" needs target or placeId/.test(line)));
});

test('each rule of the definition is enforced', () => {
  const broken = (change, pattern) => {
    const data = clone(FERRY_CRATE);
    change(data);
    const problems = validatePledge(data);
    assert.ok(problems.some((line) => pattern.test(line)), `${pattern} not in:\n${problems.join('\n')}`);
  };
  broken((d) => { d.reward = { xp: 50 }; }, /must not carry a reward/);
  broken((d) => { d.spawnCount = 3; }, /unknown field "spawnCount"/);
  broken((d) => { d.sequential = false; }, /always sequential/);
  broken((d) => { d.id = 'has space'; }, /needs an id/);
  broken((d) => { delete d.title; }, /needs a title/);
  broken((d) => { d.requires = 'fx_ferry_crate'; }, /cannot require itself/);
  broken((d) => { d.requiresAll = 'fx_other'; }, /requiresAll must be a list/);
  broken((d) => { d.unlockLevel = 0; }, /unlockLevel must be/);
  broken((d) => { delete d.pledge.cause; }, /pledge\.cause must say why/);
  broken((d) => { delete d.pledge.cost; }, /pledge\.cost must say what keeping it costs/);
  broken((d) => { delete d.pledge.swornTo; }, /pledge\.swornTo/);
  broken((d) => { delete d.pledge.line; }, /pledge\.line/);
  broken((d) => { d.pledge.steps = []; }, /at least one step/);
  broken((d) => { d.pledge.steps[0].optional = true; }, /step "ask" is the first step and cannot be optional/);
  broken((d) => { d.pledge.steps[2].id = 'ask'; }, /step "ask" uses an id another step already has/);
  broken((d) => { d.pledge.steps[2].palceId = 'X'; }, /step "planks" has unknown field "palceId"/);
  broken((d) => { delete d.pledge.steps[2].text; }, /step "planks" needs text/);
  broken((d) => { d.pledge.steps[0].seconds = 5; }, /step "ask" of kind "talk" cannot have seconds/);
  broken((d) => { d.pledge.steps[3].failsOn = 'carry_completed'; }, /step "haul" failsOn names the event that completes it/);
  broken((d) => { d.pledge.steps[5].failsOn = 'x'; }, /step "whose" of kind "choose" cannot have failsOn/);
  broken((d) => { d.pledge.steps[5].count = 2; }, /step "whose" of kind "choose" cannot have a count/);
  broken((d) => { delete d.pledge.choices; }, /step "whose" of kind "choose" needs an entry in pledge\.choices/);
  broken((d) => { d.pledge.choices.whose.options.pop(); }, /step "whose" needs at least two options/);
  broken((d) => { d.pledge.choices.whose.options[1].id = 'owner'; }, /step "whose" option "owner" repeats/);
  broken((d) => { d.pledge.choices.whose.options[1].outcome = 'broken'; }, /outcome must be "kept" or "bent"/);
  broken((d) => { d.pledge.choices.dock = d.pledge.choices.whose; }, /entry "dock" that is not a "choose" step/);
  broken((d) => { d.pledge.standings.kept.gold = 5; }, /standings\.kept has unknown standing "gold"/);
  broken((d) => { d.pledge.standings.optional.haul = { trust: 1 }; }, /step "haul" is in standings\.optional but is not optional/);
  broken((d) => { d.pledge.steps.find((s) => s.id === 'ask').target = undefined; delete d.pledge.steps[0].target; },
    /step "ask" of kind "talk" needs target/);

  const defeat = clone(ORCHARD_WATCH);
  delete defeat.pledge.steps[0].target;
  assert.deepEqual(validatePledge(defeat), []); // a place alone is enough for defeat
  delete defeat.pledge.steps[0].placeId;
  assert.ok(validatePledge(defeat).some((line) => /step "wasps" of kind "defeat" needs a target, a placeId, or both/.test(line)));

  assert.deepEqual(validatePledge(null), ['a pledge must be an object']);
  assert.throws(() => definePledge({ id: 'fx_empty' }), /Pledge "fx_empty" is not valid/);
});

test('an objective answers only its own event, with its own target', () => {
  const ferry = definePledge(FERRY_CRATE);
  const orchard = definePledge(ORCHARD_WATCH);
  const f = Object.fromEntries(ferry.objectives.map((o) => [o.id, o]));
  const o = Object.fromEntries(orchard.objectives.map((entry) => [entry.id, entry]));
  const yes = (objective, event) => assert.equal(pledgeObjectiveMatchesEvent(objective, event), true);
  const no = (objective, event) => assert.equal(pledgeObjectiveMatchesEvent(objective, event), false);

  yes(f.ask, { type: 'npc_talked', targetId: 'fx_ferryman' });
  no(f.ask, { type: 'npc_talked', targetId: 'someone_else' });
  no(f.ask, { type: 'npc_talked' });
  yes(f.planks, { type: 'item_collected', itemId: 'fx_plank' });
  no(f.planks, { type: 'item_collected', itemId: 'fx_stone' });
  no(f.planks, { type: 'item_collected', targetId: 'fx_plank' });
  yes(f.haul, { type: 'carry_completed', targetId: 'fx_crate' });
  no(f.haul, { type: 'carry_dropped', targetId: 'fx_crate' });
  yes(f.whose, { type: 'choice_made', targetId: 'whose', choiceId: 'anything' }); // the option is checked by the reducer
  yes(f.hand_over, { type: 'item_delivered', targetId: 'fx_clerk' });

  // defeat: the kind and the place both have to match.
  yes(o.wasps, { type: 'enemy_killed', targetId: 'fx_wasp', placeId: 'FX_ORCHARD' });
  no(o.wasps, { type: 'enemy_killed', targetId: 'fx_wasp' });
  no(o.wasps, { type: 'enemy_killed', targetId: 'fx_wasp', placeId: 'FX_ELSEWHERE' });
  no(o.wasps, { type: 'enemy_killed', tier: 'normal', count: 1 }); // the game's plain kill event
  // For every other kind the place is a pointer for the map, not a condition.
  yes(o.walk_home, { type: 'escort_completed', targetId: 'fx_beekeeper' });
  yes(o.mound, { type: 'capture_completed', targetId: 'FX_HIVE_MOUND' });
  yes(o.drone, { type: 'enemy_spared', targetId: 'fx_drone_guard' });
  no(o.drone, { type: 'enemy_killed', targetId: 'fx_drone_guard' });
  no(null, { type: 'npc_talked' });
  no(f.ask, {});
});

test('prerequisites: one id, a list of ids, story flags, level and faction', () => {
  const orchard = definePledge(ORCHARD_WATCH);
  const state = (patch = {}) => ({
    acceptedIds: [], completedIds: ['fx_ferry_crate', 'fx_stray_calf'],
    storyFlags: { fx_ferry_done: true }, ...patch,
  });
  assert.deepEqual(pledgePrerequisitesMet(orchard, state(), { level: 4 }), { ok: true, reason: null });
  assert.equal(pledgePrerequisitesMet(orchard, state(), { level: 3 }).reason, 'LEVEL_REQUIRED');
  assert.equal(pledgePrerequisitesMet(orchard, state({ completedIds: ['fx_stray_calf'] })).reason, 'PREREQUISITE_REQUIRED');
  assert.equal(pledgePrerequisitesMet(orchard, state({ completedIds: ['fx_ferry_crate'] })).reason, 'PREREQUISITE_REQUIRED');
  assert.equal(pledgePrerequisitesMet(orchard, state({ storyFlags: {} })).reason, 'STORY_FLAG_REQUIRED');
  assert.equal(pledgePrerequisitesMet(orchard, state({ acceptedIds: ['fx_orchard_watch'] })).reason, 'ALREADY_ACCEPTED');
  assert.equal(pledgePrerequisitesMet(orchard, state({ completedIds: ['fx_ferry_crate', 'fx_stray_calf', 'fx_orchard_watch'] })).reason, 'ALREADY_COMPLETED');
  assert.equal(pledgePrerequisitesMet(orchard, state(), { factionId: 'fx_faction_b' }).reason, 'FACTION_REQUIRED');
  assert.equal(pledgePrerequisitesMet(orchard, state(), { factionId: 'fx_faction_a' }).ok, true);
  assert.equal(pledgePrerequisitesMet(orchard, state(), { factionId: 'AXE_Faction_Unassigned' }).ok, true);
  // A repeatable pledge may be sworn again after it is done.
  const calf = definePledge(STRAY_CALF);
  assert.equal(pledgePrerequisitesMet(calf, state()).ok, true);
  assert.equal(pledgePrerequisitesMet(null, state()).reason, 'UNKNOWN_PLEDGE');
});

test('keys and flags are built from the pledge id', () => {
  assert.equal(pledgeChoiceKey('fx_ferry_crate', 'whose'), 'fx_ferry_crate:whose');
  assert.equal(pledgeOutcomeFlag('fx_ferry_crate', 'bent'), 'pledge:fx_ferry_crate:bent');
});
