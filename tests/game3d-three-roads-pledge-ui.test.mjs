// What the player sees for a pledge, as view models: the dialogue box and the
// tracker. And that a quest which is not a pledge is shown as it always was.
import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getJadeQuestTrackerEntries } from '../src/components/game3d/hud/questTrackerViewModel.js';
import { threeRoadsPerson } from '../src/components/game3d/threeroads/script/cast.mjs';
import { threeRoadsPledge, threeRoadsPledges } from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import { buildPledgeDialogueView } from '../src/components/game3d/threeroads/pledgeworld/pledgeDialogueView.mjs';

const read = path => readFileSync(new globalThis.URL(path, import.meta.url), 'utf8');
const M01 = threeRoadsPledge('tr_m01_sworn_at_the_gate');
const M02 = threeRoadsPledge('tr_m02_three_arrows');
const V16 = threeRoadsPledge('tr_v16_three_fields');
const npcName = id => threeRoadsPerson(id)?.name || null;

// Quests as the game has them today, in each of its shapes.
const OLD_QUESTS = [
  { id: 'q1_first_blood', npcId: 'archer_lyra', unlockLevel: 1, title: 'First Blood', description: 'Slay three.', objective: { type: 'kill', count: 3 }, reward: { xp: 50, points: 1 }, spawnCount: 3 },
  { id: 'axe_q_two_parts', npcId: 'archer_vex', title: 'Two Parts', description: 'Two things.', objectives: [
    { id: 'find', type: 'discover_location', targetId: 'somewhere', count: 1 },
    { id: 'slay', type: 'kill', count: 4 },
    { id: 'extra', type: 'collect_item', itemId: 'herb', count: 2, optional: true },
  ], reward: { xp: 100 } },
  // Not a pledge either: a stray field called `pledge` does not make one.
  { id: 'q_odd', npcId: 'archer_kira', title: 'Odd', description: 'Odd.', pledge: 'no', objective: { type: 'talk', count: 1 }, reward: {} },
];

test('a quest that is not a pledge is drawn by the old dialogue, untouched', () => {
  for (const quest of OLD_QUESTS) {
    for (const mode of ['offer', 'in_progress', 'turn_in'])
      assert.equal(buildPledgeDialogueView(quest, { mode }), null, quest.id + ' ' + mode);
  }
  assert.equal(buildPledgeDialogueView(null), null);
  const source = read('../src/components/game3d/QuestDialogueBox.jsx');
  // One branch, on isPledge, and the old component is still all there.
  assert.equal((source.match(/PledgeDialogueBox/g) || []).length, 4, 'the import (twice in one line), the comment, one use');
  assert.match(source, /return isPledge\(props\.quest\) \? <PledgeDialogueBox \{\.\.\.props\} \/> : <QuestDialogue \{\.\.\.props\} \/>;/);
  for (const piece of ['Accept Quest', 'Claim Reward', 'Keep Going', 'getQuestDialogue(quest.id, quest.description)',
    "A ← Decline · D → Accept · F confirm · R decline · mouse", "+{Number(quest.reward?.xp || 0)} XP"])
    assert.ok(source.includes(piece), piece);
});

test('the offer: each line with its speaker, then what is sworn', () => {
  const view = buildPledgeDialogueView(M01, { mode: 'offer' });
  assert.equal(view.title, 'Sworn at the Gate');
  assert.deepEqual(view.pages.map(page => page.kind), ['line', 'line', 'line', 'oath']);
  assert.deepEqual(view.pages.slice(0, 3).map(page => [page.line.speakerName, page.line.lineId]), [
    ['Lyra the Seeker', 'lyra_m01_01'], ['Lyra the Seeker', 'lyra_m01_02'], ['Lyra the Seeker', 'lyra_m01_03'],
  ]);
  assert.match(view.pages[0].line.text, /^Stop there\. Nobody walks under the Veil unsworn\./);
  assert.equal(view.swornTo, 'Lyra of the Fountain Watch, at the Oath Tree');
  assert.match(view.cause, /^Nobody walks under the Veil unsworn/);
  assert.match(view.cost, /^A sworn hand may never draw blood/);
  assert.equal(view.holdSeconds, 1);
  for (const pledge of threeRoadsPledges()) {
    const offer = buildPledgeDialogueView(pledge, { mode: 'offer' });
    assert.equal(offer.pages.at(-1).kind, 'oath', pledge.id);
    assert.ok(offer.pages.length >= 2, pledge.id + ' has lines before the oath');
  }
});

test('in progress: the step the pledge is at; at the end: the lines of the ending', () => {
  const progress = { oath: 1, gate: 1, shades: 6, free: 2, walk: 0, lyra: 0 };
  const going = buildPledgeDialogueView(M01, { mode: 'in_progress', objectiveProgress: progress });
  assert.deepEqual(going.pages, [{ kind: 'step' }]);
  assert.deepEqual(going.step, { id: 'free', text: 'Free the three travellers pinned under the wagons.', optional: false, current: 2, required: 3, done: false });
  assert.equal(going.stepNumber, 4);
  assert.equal(going.stepCount, 6);

  const ended = buildPledgeDialogueView(M01, { mode: 'turn_in', objectiveProgress: { oath: 1, gate: 1, shades: 6, free: 3, walk: 1, lyra: 1 } });
  assert.deepEqual(ended.pages.map(page => page.line.lineId), ['lyra_m01_06', 'lyra_m01_07', 'lyra_m01_08']);
  assert.equal(ended.step, null);

  // The ending opens with the line for the answer that was given.
  const chosen = { choices: { 'tr_m02_three_arrows:again': 'swear', 'tr_v16_three_fields:last': 'hers' } };
  assert.deepEqual(buildPledgeDialogueView(M02, { mode: 'turn_in', questState: chosen }).pages.map(page => page.line.lineId),
    ['sable_m02_07', 'sable_m02_09']);
  assert.deepEqual(buildPledgeDialogueView(V16, { mode: 'turn_in', questState: chosen }).pages.map(page => page.line.lineId),
    ['dalla_v16_07']);
  assert.deepEqual(buildPledgeDialogueView(V16, { mode: 'turn_in', questState: {} }).pages, [{ kind: 'kept' }]);
});

test('the tracker: a pledge as its title, the current step and its count', () => {
  const state = {
    acceptedIds: ['q1_first_blood', 'axe_q_two_parts', M01.id], completedIds: [], lastAcceptedId: M01.id,
    progress: { q1_first_blood: 2, axe_q_two_parts: 1, [M01.id]: 1 },
    objectiveProgress: {
      axe_q_two_parts: { find: 1, slay: 1, extra: 0 },
      [M01.id]: { oath: 1, gate: 1, shades: 6, free: 2, walk: 0, lyra: 0 },
    },
  };
  const entries = getJadeQuestTrackerEntries([...OLD_QUESTS, ...threeRoadsPledges()], state, 3, { npcName });
  assert.deepEqual(entries[0], {
    id: M01.id, title: 'Sworn at the Gate', tracked: true, current: 3, total: 6, percent: 50, readyToTurnIn: false,
    objective: 'Free the three travellers pinned under the wagons.', objectiveCurrent: 2, objectiveTotal: 3,
    pledge: true, objectiveCount: '2 of 3',
  });
  // The old quests beside it are projected exactly as before.
  assert.deepEqual(entries[1], {
    id: 'q1_first_blood', title: 'First Blood', tracked: false, current: 2, total: 3, percent: 67,
    readyToTurnIn: false, objective: 'Defeat hostile enemies', objectiveCurrent: 2, objectiveTotal: 3,
  });
  assert.deepEqual(entries[2], {
    id: 'axe_q_two_parts', title: 'Two Parts', tracked: false, current: 2, total: 5, percent: 40,
    readyToTurnIn: false, objective: 'Defeat hostile enemies', objectiveCurrent: 1, objectiveTotal: 4,
  });
  // Without pledges in the list, and without the new argument, nothing changes.
  assert.deepEqual(getJadeQuestTrackerEntries(OLD_QUESTS, state, 3), [entries[1], entries[2]]);

  // A step that asks for one thing shows no count; a finished pledge sends the player back to its giver.
  const oath = getJadeQuestTrackerEntries(threeRoadsPledges(), { acceptedIds: [M01.id], objectiveProgress: { [M01.id]: { oath: 0 } } }, 3, { npcName })[0];
  assert.equal(oath.objective, 'Tie your ribbon to the Oath Tree.');
  assert.equal(oath.objectiveCount, '');
  assert.equal(oath.current, 0);
  const done = getJadeQuestTrackerEntries(threeRoadsPledges(), {
    acceptedIds: [M01.id], objectiveProgress: { [M01.id]: { oath: 1, gate: 1, shades: 6, free: 3, walk: 1, lyra: 1 } },
  }, 3, { npcName })[0];
  assert.equal(done.readyToTurnIn, true);
  assert.equal(done.objective, 'Return to Lyra the Seeker');
  assert.equal(done.percent, 100);
});

test('the tracker and the trail read pledges through the game\'s own files', () => {
  const tracker = read('../src/components/game3d/hud/JadeQuestTracker.jsx');
  assert.match(tracker, /addEventListener\('threeRoadsPledgesChanged'/);
  assert.match(tracker, /entry\.objectiveCount/);
  assert.ok(tracker.includes("entry.readyToTurnIn ? 'Ready to turn in' : entry.objective"), 'the old line for other quests is kept');
  const map = read('../src/components/game3d/hud/worldMapData.js');
  assert.match(map, /if\(isPledge\(quest\)\)\{\s+const at=region==='wolfveil'\?getPledgeNavigationTarget\(quest,player\):null;/);
});
