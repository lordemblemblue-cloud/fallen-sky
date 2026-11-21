// Saltmarch, the second story mission (src/components/duelist/sim/missions/saltmarch.mjs), and what it brought
// to the mission engine: people who stand down when beaten instead of falling, an ally on the crew's side who
// never falls, and the missions in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMission, stepMission, missionView, nextMission, MISSIONS, MISSION_ORDER } from '../src/components/duelist/sim/mission.mjs';
import { createAutopilot, thinkAutopilot } from '../src/components/duelist/sim/autopilot.mjs';
import { step, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { createBot, think } from '../src/components/duelist/sim/bots.mjs';
import { strike } from '../src/components/duelist/core/index.mjs';

const DT = 1 / 60;

test('Saltmarch, start to finish, by a piloted crew of two: the refuge stands down, Arden holds the door with them, the Warden-Captain yields', () => {
  const m = createMission({ id: 'saltmarch', players: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }], seed: 3 });
  const pilots = [createAutopilot('a', { seed: 33 }), createAutopilot('b', { seed: 34 })];
  const stages = [];
  const titles = [];
  const speakers = new Set();
  const fallen = [];
  const yielded = new Set();
  let ally = null;
  let drivenBack = false;
  for (let i = 0; i < 60 * 60 * 12 && m.phase !== 'complete'; i++) {
    const { events } = stepMission(m, DT, Object.fromEntries(pilots.map((p) => [p.id, thinkAutopilot(m, p)])));
    for (const e of events) {
      if (e.type === 'stage') { stages.push(e.index); titles.push(e.title); }
      if (e.type === 'comms') speakers.add(e.speaker);
      if (e.type === 'enemyDown') fallen.push(m.enemies.get(e.id)?.typeId);
      if (e.type === 'yielded') yielded.add(e.id);
      if (e.type === 'ally') ally = e.id;
    }
    // once, with the teacher deep in the fight: struck to the edge of falling
    if (ally && !drivenBack && m.flags.hold > 10) {
      const f = m.world.fighters.get(ally);
      f.vitals.hp = 3;
      stepMission(m, DT, {});
      assert.equal(f.vitals.dead, false, 'an ally never falls');
      assert.ok(f.vitals.hp >= f.vitals.max.hp * 0.5, 'driven back, they catch their breath');
      drivenBack = true;
    }
  }
  assert.equal(m.phase, 'complete', `finished (reached stage ${m.stageIndex} in ${m.world.time.toFixed(0)} s)`);
  assert.deepEqual(stages, [1, 2, 3, 4], 'every objective in order');
  assert.deepEqual(titles, ['Find who leads them', 'Warn the refuge', 'Hold the chapel', 'The warrant']);
  for (const s of ['Ione', 'Defender', 'Hask', 'Arden', 'Crane']) assert.ok(speakers.has(s), `${s} speaks`);
  assert.ok(!fallen.some((t) => t === 'refugee' || t === 'keeper'), 'nobody in the refuge falls: beaten, they stand down');
  assert.ok(yielded.size >= 4, `${yielded.size} stood down`);
  assert.ok(drivenBack, 'the teacher was put to the test');
  assert.equal(m.allies.size, 1, 'Arden fought beside the crew');
  assert.equal(m.counters.bells, 3);
  assert.ok(![...m.enemies.values()].some((e) => e.typeId === 'refugee' || e.typeId === 'keeper'), 'the refuge emptied into the tunnel');
  const crane = [...m.enemies.values()].find((e) => e.tag === 'crane');
  assert.equal(crane.yielded, true, 'the Warden-Captain yields');
  assert.equal(m.world.fighters.get(crane.id).vitals.dead, false);
  const view = missionView(m, 'a');
  assert.match(view.ending, /new warrant with your names/);
  assert.equal(view.next, null, 'the last mission so far');
});

test('beaten, a defender stands down: kneeling, out of the fight; nothing reaches them and no bot goes after them', () => {
  const m = createMission({ id: 'saltmarch', players: [{ id: 'a', name: 'Ada' }], seed: 5 });
  const defender = [...m.enemies.values()].find((e) => e.typeId === 'refugee');
  const f = m.world.fighters.get(defender.id);
  f.vitals.hp = f.vitals.max.hp * 0.2;
  const { events } = stepMission(m, DT, {});
  assert.ok(events.some((e) => e.type === 'yielded' && e.id === defender.id));
  assert.equal(defender.yielded, true);
  assert.deepEqual(missionView(m, 'a').yielded, [defender.id], 'the view says who kneels');
  // a blow that would have finished them does nothing
  const me = m.world.fighters.get('a');
  const hp = f.vitals.hp;
  const { result } = strike(me, f, 'swordHeavy', { now: m.world.time });
  assert.equal(result.outcome, 'evaded');
  assert.equal(f.vitals.hp, hp);
  // a bot standing next to them looks for someone else
  Object.assign(bodyOf(m.world, 'a'), { x: bodyOf(m.world, defender.id).x + 1.2, z: bodyOf(m.world, defender.id).z });
  for (const other of m.enemies.values()) if (other !== defender) m.world.fighters.get(other.id).vitals.dead = true;
  const bot = createBot('a', { level: 'master', seed: 2 });
  think(m.world, bot);
  assert.equal(bot.targetId, null, 'nobody left to fight');
  // they stay down, and do not move again
  const at = { ...bodyOf(m.world, defender.id) };
  for (let i = 0; i < 120; i++) stepMission(m, DT, {});
  assert.ok(Math.hypot(bodyOf(m.world, defender.id).x - at.x, bodyOf(m.world, defender.id).z - at.z) < 0.01);
  assert.equal(f.action, null);
});

test('the story in order: a crew that finishes Contraband goes on to Saltmarch', () => {
  assert.deepEqual(MISSION_ORDER, ['contraband', 'saltmarch']);
  assert.equal(nextMission('contraband'), 'saltmarch');
  assert.equal(nextMission('saltmarch'), 'saltmarch', 'the last one plays again');
  for (const id of MISSION_ORDER) assert.equal(MISSIONS[id].id, id);
  const m = createMission({ id: 'contraband', players: [{ id: 'a', name: 'Ada' }], seed: 1 });
  m.phase = 'complete';
  assert.deepEqual(missionView(m, 'a').next, { id: 'saltmarch', title: 'Saltmarch' });
  // an unknown mission is Contraband
  assert.equal(createMission({ id: 'nowhere', players: [{ id: 'a' }] }).id, 'contraband');
  // the yard's quiet until someone is seen: the defenders do not fire at the gate's far side
  const s = createMission({ id: 'saltmarch', players: [{ id: 'a', name: 'Ada' }], seed: 1 });
  for (let i = 0; i < 60 * 3; i++) stepMission(s, DT, {});
  assert.ok(![...s.enemies.values()].some((e) => e.alerted), 'nobody is alerted while the crew waits at the gate');
  step(s.world, DT, {});
});
