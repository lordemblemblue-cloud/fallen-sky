import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLEDGE_STEP_KINDS, definePledge, pledgeObjectiveMatchesEvent } from '../src/components/game3d/pledges/pledgeModel.mjs';
import {
  CHOICE_RANGE, DEFEND_AWAY_SECONDS, DEFEND_WAVE_GOAL_RADIUS, ESCORT_FOLLOWER_SLACK, TALK_RANGE,
  createStepWatcher, groupDetail, stepEvent, stepFailEvent,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeWatchers.mjs';
import { createSpeechQueue, lineSeconds } from '../src/components/game3d/threeroads/pledgeworld/pledgeSpeech.mjs';
import { threeRoadsPledges } from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';

const POINTS = { a: { x: 0, z: 0 }, b: { x: 20, z: 0 }, c: { x: 40, z: 0 }, far: { x: 200, z: 0 } };
const pledge = definePledge({
  id: 'test_watch', npcId: 'giver', title: 'Watch', description: 'A pledge for the watchers.',
  pledge: {
    line: 'test', swornTo: 'someone', cause: 'a cause', cost: 'a cost',
    steps: [
      { id: 'talk', kind: 'talk', text: 'Talk.', target: 'people', count: 2 },
      { id: 'go', kind: 'go_to', text: 'Go.', target: 'spot' },
      { id: 'trail', kind: 'go_to', text: 'Trail.', target: 'trail', count: 3, failsOn: 'trail_lost' },
      { id: 'use', kind: 'use', text: 'Use.', target: 'thing', count: 2, seconds: 2 },
      { id: 'take', kind: 'pick_up', text: 'Take.', target: 'item', count: 2 },
      { id: 'escort', kind: 'escort', text: 'Escort.', target: 'friends', failsOn: 'escort_failed' },
      { id: 'defend', kind: 'defend', text: 'Defend.', target: 'ground', seconds: 20, failsOn: 'defend_failed' },
      { id: 'carry', kind: 'carry', text: 'Carry.', target: 'jar', count: 2, failsOn: 'carry_dropped' },
      { id: 'choose', kind: 'choose', text: 'Choose.' },
    ],
    choices: { choose: { prompt: 'Which?', options: [{ id: 'one', text: 'One.' }, { id: 'two', text: 'Two.' }] } },
  },
});
const indexOf = stepId => pledge.pledge.steps.findIndex(step => step.id === stepId);

function make(stepId, watch, { progress = 0, along = null, people = {} } = {}) {
  const log = [];
  const index = indexOf(stepId);
  const frame = { now: 0, player: { x: 100, z: 100 }, eDown: false, blocked: false, locate: id => people[id] || null };
  const watcher = createStepWatcher({
    pledge, index, step: pledge.pledge.steps[index], watch, along, progress,
    memory: { done: new Set(), alongSpoken: 0 },
    world: {
      report: detail => log.push(detail.type),
      say: lineId => log.push('say:' + lineId),
      bus: (type, detail) => log.push(type + ':' + (detail.groupId || detail.id)),
      notice: kind => log.push('notice:' + kind),
    },
    point: name => POINTS[name] || null,
    personName: id => 'Name of ' + id,
    whereIs: id => people[id] || null,
    groupPoint: () => POINTS.b,
  });
  const at = (x, z = 0) => { frame.player.x = x; frame.player.z = z; };
  const run = (seconds, tick = 0.1) => {
    for (let i = 0; i < Math.round(seconds / tick); i++) { frame.now += tick; watcher.update(frame); }
  };
  const view = () => { const out = { prompt: null, choice: null }; watcher.view(frame, out); return out; };
  return { watcher, frame, log, at, run, view };
}

test('every step kind reports the one event the engine waits for', () => {
  for (const real of threeRoadsPledges()) {
    real.pledge.steps.forEach((step, index) => {
      const detail = stepEvent(real, index, step.kind === 'choose' ? { choiceId: real.pledge.choices[step.id].options[0].id } : null);
      assert.equal(detail.type, PLEDGE_STEP_KINDS[step.kind].eventType);
      assert.equal(detail.pledgeId, real.id);
      assert.equal(pledgeObjectiveMatchesEvent(real.objectives[index], detail), true, real.id + ':' + step.id);
    });
  }
  assert.deepEqual(stepFailEvent(pledge, indexOf('trail'), 'trail_lost'), { type: 'trail_lost', pledgeId: 'test_watch', targetId: 'trail' });
  assert.equal(stepFailEvent(pledge, indexOf('go'), 'trail_lost'), null, 'a step that does not listen is sent nothing');
  assert.deepEqual(groupDetail({ groupId: 'g', kind: 'ink_shade', count: 3, at: 'b', radius: 5, tier: 'normal', placeId: 'P10' }, n => POINTS[n]),
    { groupId: 'g', kind: 'ink_shade', count: 3, x: 20, z: 0, radius: 5, level: 'player', tier: 'normal', placeId: 'P10' });
});

test('talk: only within reach, each person once when distinct, their lines spoken', () => {
  const people = { ann: { x: 0, z: 0 }, bo: { x: 20, z: 0, own: true } };
  const t = make('talk', { anyOf: ['ann', 'bo', 'cy'], distinct: true, sayAt: { ann: ['l1', 'l2'], bo: 'l3' } }, { people });
  t.at(TALK_RANGE + 0.1);
  assert.equal(t.watcher.interact(t.frame), null, 'a step too far');
  assert.equal(t.view().prompt, null);
  t.at(TALK_RANGE - 0.1);
  assert.deepEqual(t.view().prompt, { key: 'E', hold: false, label: 'Speak with Name of ann', progress: -1 });
  assert.deepEqual(t.watcher.interact(t.frame), { person: 'ann' });
  assert.equal(t.watcher.interact(t.frame), null, 'not the same person twice');
  assert.equal(t.view().prompt, null);
  t.at(20);
  assert.equal(t.view().prompt, null, 'the game shows its own prompt for a giver in its list');
  assert.deepEqual(t.watcher.interact(t.frame), { person: 'bo' });
  assert.deepEqual(t.log, ['say:l1', 'say:l2', 'npc_talked', 'say:l3', 'npc_talked']);
  assert.equal(t.watcher.interact(t.frame), null, 'the count is full');
  // The trail on the ground leads to the nearest person still to be spoken to.
  const again = make('talk', { anyOf: ['ann', 'bo'], distinct: true }, { people });
  assert.deepEqual(again.watcher.target({ x: 18, z: 0 }), { x: 20, z: 0, label: 'Name of bo' });
});

test('go_to: inside the radius, once', () => {
  const g = make('go', { point: 'b', radius: 5 });
  g.at(20 + 5.1); g.run(0.3);
  assert.deepEqual(g.log, []);
  g.at(20 + 4.9); g.run(0.5);
  assert.deepEqual(g.log, ['location_discovered']);
  assert.deepEqual(g.watcher.target(), { x: 20, z: 0, label: 'Go.' });
});

test('trail: waypoints in order, a leg that runs out loses it, the way back is not timed', () => {
  const t = make('trail', { trail: ['a', 'b', 'c'], radius: 3, legSeconds: 10 }, { along: { every: 15, lines: ['on'] } });
  t.at(20); t.run(1);
  assert.deepEqual(t.log, [], 'the second waypoint first counts for nothing');
  t.at(8); t.run(0.1);
  assert.deepEqual(t.log, [], 'twelve metres covered: no line yet');
  t.at(0); t.run(0.2);
  assert.deepEqual(t.log, ['say:on', 'location_discovered'], 'a line after fifteen metres, then the first waypoint');
  assert.equal(t.watcher.legIndex(), 1);
  t.at(10); t.run(9.5);
  assert.deepEqual(t.log, ['say:on', 'location_discovered']);
  t.run(0.6);
  assert.ok(t.log.includes('notice:trail_lost'));
  assert.equal(t.log.at(-1), 'trail_lost');
  assert.equal(t.watcher.legIndex(), 0);
  const lost = t.log.filter(entry => entry === 'trail_lost').length;
  t.run(60);
  assert.equal(t.log.filter(entry => entry === 'trail_lost').length, lost, 'not lost again while walking back');
  t.at(0); t.run(0.2); t.at(20); t.run(0.2); t.at(40); t.run(0.2);
  assert.equal(t.log.filter(entry => entry === 'location_discovered').length, 4);
  assert.equal(t.watcher.legIndex(), 3);
  // Reached in time, a leg starts the clock again.
  const quick = make('trail', { trail: ['a', 'b', 'c'], radius: 3, legSeconds: 10 });
  quick.at(0); quick.run(9); quick.at(20); quick.run(9); quick.at(40); quick.run(9);
  assert.deepEqual(quick.log, ['location_discovered', 'location_discovered', 'location_discovered']);
  // A scene rebuilt in the middle starts at the waypoint the engine has counted to.
  assert.equal(make('trail', { trail: ['a', 'b', 'c'], radius: 3 }, { progress: 2 }).watcher.legIndex(), 2);
});

test('use: a hold of the step\'s seconds, cancelled by letting go or walking off', () => {
  const u = make('use', { points: ['a', 'b'], distinct: true, radius: 3, prompt: 'Lift', sayAt: { a: 'la', b: 'lb' } });
  u.at(3.2);
  assert.equal(u.watcher.interact(u.frame), null, 'outside the radius');
  u.at(2.9);
  assert.deepEqual(u.view().prompt, { key: 'E', hold: true, label: 'Lift', progress: 0 });
  u.frame.eDown = true;
  assert.deepEqual(u.watcher.interact(u.frame), { point: 'a' });
  u.run(1);
  assert.equal(Math.round(u.view().prompt.progress * 10), 5);
  u.frame.eDown = false; u.run(0.1);
  assert.deepEqual(u.log, [], 'let go at one second of two');
  assert.equal(u.view().prompt.progress, 0);
  u.frame.eDown = true; u.watcher.interact(u.frame); u.run(1);
  u.at(9); u.run(1.5);
  assert.deepEqual(u.log, [], 'walked off in the middle');
  u.at(0); u.watcher.interact(u.frame); u.run(1.9);
  assert.deepEqual(u.log, []);
  u.run(0.2);
  assert.deepEqual(u.log, ['say:la', 'world_interact']);
  u.run(5);
  assert.deepEqual(u.log, ['say:la', 'world_interact'], 'the key still down does nothing more');
  assert.equal(u.view().prompt, null, 'that point is done');
  assert.equal(u.watcher.interact(u.frame), null);
  u.at(20); u.watcher.interact(u.frame);
  u.frame.blocked = true; u.run(0.1); u.frame.blocked = false;
  u.run(3);
  assert.deepEqual(u.log, ['say:la', 'world_interact'], 'a menu opening cancels the hold');
  u.watcher.interact(u.frame); u.run(2.1);
  assert.deepEqual(u.log, ['say:la', 'world_interact', 'say:lb', 'world_interact']);
  // One point used several times speaks the next line at each count.
  const each = make('use', { point: 'a', radius: 3, sayEach: ['one', 'two'] });
  each.at(0); each.frame.eDown = true;
  each.watcher.interact(each.frame); each.run(2.1);
  each.watcher.interact(each.frame); each.run(2.1);
  assert.deepEqual(each.log, ['say:one', 'world_interact', 'say:two', 'world_interact']);
});

test('pick_up: one press each, up to the count', () => {
  const p = make('take', { point: 'a', radius: 3, prompt: 'Take it' });
  p.at(2);
  assert.deepEqual(p.view().prompt, { key: 'E', hold: false, label: 'Take it', progress: -1 });
  assert.ok(p.watcher.interact(p.frame));
  assert.ok(p.watcher.interact(p.frame));
  assert.equal(p.watcher.interact(p.frame), null);
  assert.deepEqual(p.log, ['item_collected', 'item_collected']);
});

test('escort: everyone at the place, lines on the way, lost after ten seconds far behind', () => {
  const people = { f1: { x: 100, z: 0 }, f2: { x: 100, z: 0 } };
  const e = make('escort', { people: ['f1', 'f2', 'nobody_knows'], to: 'a', radius: 8 }, { people, along: { every: 10, lines: ['w1', 'w2'] } });
  e.at(60); e.run(0.1);
  e.at(48); e.run(0.1); e.at(36); e.run(0.1);
  assert.deepEqual(e.log, ['say:w1', 'say:w2']);
  e.at(0); e.run(0.5);
  assert.deepEqual(e.log, ['say:w1', 'say:w2'], 'the player alone at the place is not an arrival');
  e.run(9);
  assert.deepEqual(e.log, ['say:w1', 'say:w2'], 'a hundred metres behind, but not yet for ten seconds');
  e.run(1);
  assert.deepEqual(e.log.slice(2), ['notice:escort_failed', 'escort_failed']);
  // The player stands 0 m from the place; a follower walks 3 m behind (no
  // follow distance given), so it has caught up at 3 + slack.
  people.f1.x = 3 + ESCORT_FOLLOWER_SLACK - 0.5; people.f2.x = 8 + 3 + ESCORT_FOLLOWER_SLACK + 0.5;
  e.run(0.3);
  assert.equal(e.log.includes('escort_completed'), false, 'one follower still walking in');
  assert.equal(e.view().prompt.label, 'Wait for them to catch up');
  people.f2.x = 7.9;
  e.run(0.2);
  assert.equal(e.log.at(-1), 'escort_completed');
  e.run(1);
  assert.equal(e.log.filter(entry => entry === 'escort_completed').length, 1);
});

test('defend: the clock starts on the ground, waves at their times, away too long loses it', () => {
  const waves = [{ at: 2, group: { groupId: 'w1', kind: 'k', count: 3, at: 'b' } }, { at: 9, group: { groupId: 'w2', kind: 'k', count: 3, at: 'c' } }];
  const d = make('defend', { point: 'a', radius: 10, waves });
  d.run(30);
  assert.deepEqual(d.log, [], 'nothing until the player stands on the ground');
  assert.equal(d.view().prompt, null);
  d.at(5); d.run(2.1);
  assert.deepEqual(d.log, ['enemies:spawnGroup:w1']);
  assert.equal(d.view().prompt.key, null);
  d.at(30); d.run(DEFEND_AWAY_SECONDS - 0.5); d.at(5); d.run(0.2);
  assert.deepEqual(d.log, ['enemies:spawnGroup:w1', 'enemies:spawnGroup:w2'], 'a short step outside is allowed');
  d.at(30); d.run(DEFEND_AWAY_SECONDS + 0.3);
  assert.deepEqual(d.log.slice(2), ['enemies:despawnGroup:w1', 'enemies:despawnGroup:w2', 'notice:defend_failed', 'defend_failed']);
  d.at(5); d.run(19.8);
  assert.equal(d.log.includes('defend_completed'), false);
  d.run(0.4);
  assert.equal(d.log.at(-1), 'defend_completed');
  // Leaving the scene in the middle takes the waves along.
  const half = make('defend', { point: 'a', radius: 10, waves });
  half.at(0); half.run(3);
  half.watcher.dispose();
  assert.deepEqual(half.log, ['enemies:spawnGroup:w1', 'enemies:despawnGroup:w1']);
});

test('defend: every wave is sent walking to the guarded spot, wherever it appears', () => {
  const sent = [];
  const index = indexOf('defend');
  const frame = { now: 0, player: { x: 2, z: 0 }, eDown: false, blocked: false, locate: () => null };
  const watcher = createStepWatcher({
    pledge, index, step: pledge.pledge.steps[index], progress: 0, along: null,
    watch: { point: 'a', radius: 10, waves: [{ at: 1, group: { groupId: 'w1', kind: 'k', count: 3, at: 'c', radius: 5, placeId: 'P10' } }] },
    memory: { done: new Set(), alongSpoken: 0 },
    world: { report: () => {}, say: () => {}, notice: () => {}, bus: (type, detail) => sent.push([type, detail]) },
    point: name => POINTS[name] || null,
    personName: id => id, whereIs: () => null, groupPoint: () => POINTS.c,
  });
  for (let i = 0; i < 15; i++) { frame.now += 0.1; watcher.update(frame); }
  assert.deepEqual(sent, [['enemies:spawnGroup', {
    groupId: 'w1', kind: 'k', count: 3, x: 40, z: 0, radius: 5, level: 'player', tier: 'normal', placeId: 'P10',
    goal: { x: 0, z: 0, radius: DEFEND_WAVE_GOAL_RADIUS },
  }]]);
  // A group asked for by a cue (a fight the player walks to) is given no goal.
  assert.equal('goal' in groupDetail({ groupId: 'g', kind: 'k', count: 1, at: 'b' }, n => POINTS[n]), false);
});

test('carry: E at the start takes it up, the place it goes is one report, falling or riding drops it', () => {
  const c = make('carry', { from: 'a', to: 'b', radius: 3, prompt: 'Lift a jar', sayEach: ['one', 'two'] }, { along: { every: 5, lines: ['way'] } });
  c.at(10);
  assert.equal(c.watcher.interact(c.frame), null, 'nothing to take up away from it');
  assert.equal(c.view().prompt, null);
  c.at(2.5);
  assert.deepEqual(c.view().prompt, { key: 'E', hold: false, label: 'Lift a jar', progress: -1 });
  c.frame.down = true;
  assert.equal(c.watcher.interact(c.frame), null, 'not while riding');
  c.frame.down = false;
  assert.deepEqual(c.watcher.interact(c.frame), { point: 'a' });
  assert.deepEqual(c.view().prompt, { key: null, hold: false, label: 'Carry.', progress: -1 });
  assert.deepEqual(c.watcher.target({ x: 0, z: 0 }), { x: 20, z: 0, label: 'Carry.' });
  c.at(9); c.run(0.1); c.at(16.9); c.run(0.1);
  assert.deepEqual(c.log, ['say:way'], 'a line on the way while it is carried');
  c.at(17.1); c.run(0.1);
  assert.deepEqual(c.log, ['say:way', 'say:one', 'carry_completed']);
  c.run(1);
  assert.equal(c.log.length, 3, 'one report per arrival');
  // The second: dropped on the way.
  c.at(0); c.watcher.interact(c.frame); c.at(10); c.run(0.1);
  c.frame.down = true; c.run(0.1); c.frame.down = false;
  assert.deepEqual(c.log.slice(3), ['notice:carry_dropped', 'carry_dropped']);
  c.at(20); c.run(0.5);
  assert.equal(c.log.filter(entry => entry === 'carry_completed').length, 1, 'nothing reaches the stack after a fall');
  c.watcher.setProgress(0);
  c.at(0); c.watcher.interact(c.frame); c.at(20); c.run(0.1);
  assert.equal(c.log.at(-2), 'say:one', 'the count starts again from the first line');
});

test('choose: shown beside the giver, only an option on offer is taken', () => {
  const people = { giver: { x: 0, z: 0 } };
  const c = make('choose', {}, { people });
  c.at(CHOICE_RANGE + 1);
  assert.equal(c.view().choice, null);
  c.at(CHOICE_RANGE - 1);
  assert.deepEqual(c.view().choice.options, [{ id: 'one', text: 'One.' }, { id: 'two', text: 'Two.' }]);
  assert.equal(c.watcher.choose('three'), false);
  assert.equal(c.watcher.choose('two'), true);
  assert.equal(c.watcher.choose('one'), false, 'only once');
  assert.deepEqual(c.log, ['choice_made']);
  assert.equal(c.view().choice, null);
  // With nobody to stand beside, it is shown wherever the player is, and comes back by itself.
  const alone = make('choose', {});
  assert.ok(alone.view().choice);
  alone.watcher.dismiss(alone.frame.now);
  assert.equal(alone.view().choice, null);
  alone.run(10.1);
  assert.ok(alone.view().choice);
});

test('speech: one line at a time, in order, over the head when the speaker is near', () => {
  assert.equal(lineSeconds(''), 2.8);
  assert.ok(Math.abs(lineSeconds('x'.repeat(67)) - 3.515) < 0.01);
  assert.equal(lineSeconds('x'.repeat(500)), 12);
  const shown = [];
  const near = new Set(['here']);
  const queue = createSpeechQueue({
    present: (line, seconds, mode) => shown.push(line ? [line.lineId, mode] : null),
    isNear: id => near.has(id),
  });
  queue.say({ lineId: 'a', speaker: 'here', text: 'short' });
  queue.say({ lineId: 'b', speaker: 'gone', text: 'short' });
  queue.say({ lineId: 'c', speaker: null, text: '[sound: bell]', seconds: 1 });
  assert.equal(queue.busy(), true);
  queue.update(0);
  queue.update(1);
  assert.deepEqual(shown, [['a', 'cast']]);
  queue.update(2.9);
  assert.deepEqual(shown, [['a', 'cast'], ['b', 'caption']]);
  queue.update(5.8);
  queue.update(6.0);
  assert.equal(queue.busy(), true);
  queue.update(6.9);
  assert.deepEqual(shown, [['a', 'cast'], ['b', 'caption'], ['c', 'caption'], null]);
  assert.equal(queue.busy(), false);
});
