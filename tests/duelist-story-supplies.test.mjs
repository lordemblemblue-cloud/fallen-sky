import test from 'node:test';
import assert from 'node:assert/strict';
import { createMission, joinMission, leaveMission, missionView, claimStorySupply } from '../src/components/duelist/sim/mission.mjs';
import { STORY_SUPPLIES } from '../src/components/duelist/sim/storySupplies.mjs';

const crew = () => createMission({ id: 'contraband', players: [
  { id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' },
], seed: 1337 });

test('story supplies are a separate, bounded catalog with one free claim per crew member', () => {
  assert.deepEqual(STORY_SUPPLIES.map(x => x.stat), ['hp', 'shield', 'will']);
  assert.equal(new Set(STORY_SUPPLIES.map(x => x.id)).size, STORY_SUPPLIES.length);
  const m = crew(), a = m.world.fighters.get('ada'), b = m.world.fighters.get('ben');
  a.vitals.hp -= 50; b.vitals.hp -= 20;
  assert.deepEqual(claimStorySupply(m, 'ada', 'field-medkit'), {
    ok: true, id: 'field-medkit', stat: 'hp', value: a.vitals.max.hp - 15, remaining: 0,
  });
  assert.equal(b.vitals.hp, b.vitals.max.hp - 20, 'no effect on another crew member');
  assert.equal(claimStorySupply(m, 'ada', 'guardian-cell').reason, 'already-claimed');
  assert.equal(claimStorySupply(m, 'ben', 'field-medkit').ok, true, 'another seat has its own supply');
  assert.equal(m.seats.get('ada').supplyUsed, 'field-medkit');
  assert.equal(m.seats.get('ben').supplyUsed, 'field-medkit');
});

test('a full resource refuses the bonus without consuming it; shield and Will are capped', () => {
  const m = crew(), a = m.world.fighters.get('ada'), b = m.world.fighters.get('ben');
  assert.equal(claimStorySupply(m, 'ada', 'guardian-cell').reason, 'already-full');
  assert.equal(m.seats.get('ada').supplyUsed, null);
  a.vitals.shield = a.vitals.max.shield - 3;
  const result = claimStorySupply(m, 'ada', 'guardian-cell');
  assert.equal(result.value, a.vitals.max.shield);
  assert.equal(a.vitals.shield, a.vitals.max.shield);
  b.vitals.will = Math.max(0, b.vitals.max.will - 10);
  const will = claimStorySupply(m, 'ben', 'focus-draught');
  assert.equal(will.ok, true);
  assert.equal(b.vitals.will, b.vitals.max.will);
});

test('only authoritative, live human story seats may claim; invalid requests never spend', () => {
  const m = crew(), a = m.world.fighters.get('ada');
  a.vitals.hp -= 40;
  assert.equal(claimStorySupply(m, 'intruder', 'field-medkit').reason, 'no-crew-seat');
  assert.equal(claimStorySupply(m, 'depot-enemy', 'field-medkit').reason, 'no-crew-seat');
  assert.equal(claimStorySupply(m, 'ada', '__forged').reason, 'unknown-supply');
  assert.equal(claimStorySupply(m, 'ada', { id: 'field-medkit' }).reason, 'unknown-supply');
  assert.equal(claimStorySupply(m, 'ada', null).reason, 'unknown-supply');
  m.phase = 'failed';
  assert.equal(claimStorySupply(m, 'ada', 'field-medkit').reason, 'story-not-live');
  m.phase = 'complete';
  assert.equal(claimStorySupply(m, 'ada', 'field-medkit').reason, 'story-not-live');
  m.phase = 'live';
  a.vitals.dead = true;
  assert.equal(claimStorySupply(m, 'ada', 'field-medkit').reason, 'fighter-unavailable');
  assert.equal(m.seats.get('ada').supplyUsed, null);
  assert.equal(a.vitals.hp, a.vitals.max.hp - 40);
});

test('story supply choice is visible only to its owner; it survives checkpoint and resets next mission', () => {
  const m = crew(), a = m.world.fighters.get('ada');
  a.vitals.hp -= 40;
  claimStorySupply(m, 'ada', 'field-medkit');
  assert.equal(missionView(m, 'ada').me.supplyUsed, 'field-medkit');
  assert.equal(missionView(m, 'ben').me.supplyUsed, null);
  assert.equal(missionView(m).me, null);
  // Existing mission seats own their supply, not the UI or a client-held inventory.
  assert.equal(m.seats.get('ada').supplyUsed, 'field-medkit');
  leaveMission(m, 'ada');
  joinMission(m, { id: 'ada' });
  assert.equal(missionView(m, 'ada').me.supplyUsed, null);
  assert.equal(crew().seats.get('ada').supplyUsed, null);
});

test('the battle item shop remains a different economy, with story supplies not backed by match gold', () => {
  const m = crew();
  const v = missionView(m, 'ada');
  assert.equal(Object.hasOwn(v.me, 'gold'), false);
  assert.equal(Object.hasOwn(v.me, 'items'), false);
  assert.equal(Object.hasOwn(v.me, 'supplyUsed'), true);
});
