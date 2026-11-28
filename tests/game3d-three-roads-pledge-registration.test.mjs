import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import {
  clearRegisteredPledges, getRegisteredPledge, listRegisteredPledges,
} from '../src/components/game3d/pledges/pledgeRegistry.mjs';
import { THREE_ROADS_STORAGE_KEY } from '../src/components/game3d/threeroads/threeRoadsFlag.mjs';
import { createThreeRoadsWorld } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { BAND1_PLEDGES } from './fixtures/three-roads-sample/band1.mjs';
import {
  empireOfFaction, pledgeDialogueLines, pledgeLine, threeRoadsPledges,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import {
  installThreeRoadsPledges, removeThreeRoadsPledges,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeRegistration.mjs';
import { createPledgeWorldSubsystem } from '../src/components/game3d/threeroads/pledgeworld/pledgeWorldSubsystem.mjs';

// The shape of the game's own quest list and offer rule (questData.jsx), which
// node cannot import. The rule is copied here so the test shows a giver with an
// old quest and a pledge offers the pledge first.
const oldQuests = () => [
  { id: 'q1_first_blood', npcId: 'archer_lyra', unlockLevel: 1, title: 'First Blood', objective: { type: 'kill', count: 3 }, reward: { xp: 50 } },
  { id: 'q2_clearing_path', npcId: 'archer_vex', unlockLevel: 1, title: 'Clearing the Path', objective: { type: 'kill', count: 5 }, reward: { xp: 80 } },
];
const offerFor = (quests, npcId, completedIds = [], storyFlags = {}) => quests
  .filter(q => q.npcId === npcId && q.unlockLevel <= 1 &&
    (!q.requires || completedIds.includes(q.requires)) && !completedIds.includes(q.id) &&
    (q.storyFlagsRequired || []).every(flag => !!storyFlags[flag]))
  .sort((a, b) => (Number(b.priority || 0) - Number(a.priority || 0)) ||
    (Number(a.unlockLevel || 1) - Number(b.unlockLevel || 1)))[0] || null;

const fakeWindow = (search, stored = null) => {
  const events = [];
  return {
    events,
    location: { search },
    localStorage: { getItem: key => (key === THREE_ROADS_STORAGE_KEY ? stored : null) },
    dispatchEvent: event => { events.push(event.type); return true; },
    addEventListener() {}, removeEventListener() {},
  };
};
const fakeGame = quests => ({
  quests,
  getQuestState: () => ({ acceptedIds: [], completedIds: [], objectiveProgress: {}, storyFlags: {}, choices: {} }),
  subscribeQuests: () => () => {},
  setQuestStoryFlag: () => true,
  getFactionId: () => null,
});

test('the four pledges of the opening are defined once and are real pledges', () => {
  const pledges = threeRoadsPledges();
  assert.equal(pledges.length, BAND1_PLEDGES.length);
  assert.equal(threeRoadsPledges(), pledges, 'the same frozen list every time');
  for (const pledge of pledges) {
    assert.equal(isPledge(pledge), true);
    assert.deepEqual(pledge.reward, {}, 'a pledge never carries a reward');
  }
});

test('with the switch off nothing is registered and the quest list is unchanged', () => {
  clearRegisteredPledges();
  const quests = oldQuests();
  const before = JSON.stringify(quests);
  assert.equal(createPledgeWorldSubsystem({ region: 'wolfveil' }, { win: fakeWindow(''), bindings: fakeGame(quests) }), null);
  assert.equal(createPledgeWorldSubsystem({ region: 'wolfveil' }, { win: fakeWindow('?threeRoads=0', '1'), bindings: fakeGame(quests) }), null);
  assert.equal(createPledgeWorldSubsystem({ region: 'wolfveil' }, { win: undefined, bindings: fakeGame(quests) }), null);
  // The shipped world, created the way the node tests create it, registers nothing either.
  const world = createThreeRoadsWorld({ region: 'wolfveil', worldArea: 'town' });
  world.update(0.016, { x: 0, y: 0, z: 0 });
  world.dispose();
  assert.equal(listRegisteredPledges().length, 0);
  assert.equal(JSON.stringify(quests), before);
  assert.equal(offerFor(quests, 'archer_lyra').id, 'q1_first_blood');
});

test('with the switch on the pledges are registered and listed once, also after a remount', () => {
  clearRegisteredPledges();
  const quests = oldQuests();
  const win = fakeWindow('?threeRoads=1');
  const first = createPledgeWorldSubsystem({ region: 'wolfveil' }, { win, bindings: fakeGame(quests) });
  assert.ok(first);
  assert.equal(listRegisteredPledges().length, 4);
  assert.equal(quests.length, 6);
  assert.ok(win.events.includes('threeRoadsPledgesChanged'));
  first.dispose();
  assert.equal(quests.length, 6, 'a dispose with the switch still on keeps them (every area change remounts)');
  const second = createPledgeWorldSubsystem({ region: 'wolfveil' }, { win, bindings: fakeGame(quests) });
  const third = createPledgeWorldSubsystem({ region: 'lunar-cave' }, { win, bindings: fakeGame(quests) });
  assert.equal(quests.length, 6, 'never added twice');
  assert.equal(new Set(quests.map(q => q.id)).size, 6);
  assert.equal(listRegisteredPledges().length, 4);
  for (const pledge of threeRoadsPledges()) {
    assert.equal(quests.filter(q => q === pledge).length, 1);
    assert.equal(getRegisteredPledge(pledge.id), pledge);
  }
  second.dispose();
  third.dispose();
});

test('a giver with an old quest and a pledge offers the pledge first', () => {
  clearRegisteredPledges();
  const quests = oldQuests();
  installThreeRoadsPledges(quests);
  assert.equal(offerFor(quests, 'archer_lyra').id, 'tr_m01_sworn_at_the_gate');
  assert.equal(offerFor(quests, 'archer_vex').id, 'q2_clearing_path');
  // A giver the cast adds: nothing until the chapter before is done and its flag is set.
  assert.equal(offerFor(quests, 'sable_vey'), null);
  assert.equal(offerFor(quests, 'sable_vey', ['tr_m01_sworn_at_the_gate'], { tr_truce_sworn: true }).id, 'tr_m02_three_arrows');
  // Once the pledge is done, Lyra offers her old quest again.
  assert.equal(offerFor(quests, 'archer_lyra', ['tr_m01_sworn_at_the_gate']).id, 'q1_first_blood');
});

test('turning the switch off takes the pledges out again at the next dispose', () => {
  clearRegisteredPledges();
  const quests = oldQuests();
  const before = JSON.stringify(quests);
  const win = fakeWindow('?threeRoads=1');
  const subsystem = createPledgeWorldSubsystem({ region: 'wolfveil' }, { win, bindings: fakeGame(quests) });
  assert.equal(quests.length, 6);
  win.location.search = '?threeRoads=0';
  subsystem.dispose();
  assert.equal(JSON.stringify(quests), before);
  assert.equal(listRegisteredPledges().length, 0);
  assert.equal(removeThreeRoadsPledges(quests), 0, 'removing again finds nothing');
});

test('lines, speakers and empires are read from the script', () => {
  const line = pledgeLine('lyra_m01_01');
  assert.equal(line.speaker, 'archer_lyra');
  assert.equal(line.speakerName, 'Lyra the Seeker');
  assert.match(line.text, /^Stop there\./);
  assert.equal(pledgeLine('no_such_line').text, '[line: no_such_line]');
  assert.equal(empireOfFaction('AXE_Faction_1'), 'akitsu');
  assert.equal(empireOfFaction('AXE_Faction_2'), 'remoria');
  assert.equal(empireOfFaction('AXE_Faction_3'), 'tameri');
  assert.equal(empireOfFaction('AXE_Faction_Unassigned'), 'none');
  assert.equal(empireOfFaction(null), 'none');
  const m02 = threeRoadsPledges().find(p => p.id === 'tr_m02_three_arrows');
  assert.deepEqual(pledgeDialogueLines(m02, {}).offer.map(l => l.lineId), ['sable_m02_01', 'sable_m02_02']);
  assert.deepEqual(pledgeDialogueLines(m02, { choices: { 'tr_m02_three_arrows:again': 'silent' } }).complete.map(l => l.lineId),
    ['sable_m02_08', 'sable_m02_09']);
});
