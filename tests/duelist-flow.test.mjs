// Duelist Adventure: Flow, the strikes by direction. A light strike takes the way the stick is held as it is
// pressed (forward an advance, sideways a sweep, back a turn); any strike of a form may follow any other inside its
// chain window, never the same one twice running, and a chain is as long as the form's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, FLOW, STRIKE_DIRECTIONS, MOVE_MOTION, MOTION_CLIPS, createFighter, press, update, takeEvents } from '../src/components/duelist/core/index.mjs';
import { createWorld, addFighter, step, bodyOf, strikeDirection } from '../src/components/duelist/sim/world.mjs';
import { createBot, think, BOT_LEVELS } from '../src/components/duelist/sim/bots.mjs';
import { encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';

const STEP = 1 / 120;
// the forms that read the stick as forward, side or back (the sword cuts eight ways: duelist-cuts.test.mjs)
const PLAIN = Object.entries(FLOW).filter(([, flow]) => !flow.modes);
// run a fighter on until its strike's chain window has just opened
function toWindow(f, t) {
  const until = f.action.move.chain.from + 0.01;
  while (f.action.t < until) { t += STEP; update(f, STEP, t); takeEvents(f); }
  return t;
}
// a chain: each entry is the direction held at that press (null: none). Returns the strikes made, in order.
function chain(weapon, directions) {
  const f = createFighter({ id: 'a', weapon });
  let t = 0;
  const made = [];
  for (const direction of directions) {
    if (f.action) {
      if (!f.action.move.chain) break;
      t = toWindow(f, t);
    }
    const res = press(f, 'light', t, { direction });
    if (!res.accepted) { made.push(res.reason); break; }
    made.push(res.id);
  }
  return { made, f };
}

test('every form has a strike for each direction, with frame data and a clip of its own', () => {
  for (const [weapon, flow] of PLAIN) {
    for (const id of [...flow.chain, ...STRIKE_DIRECTIONS.map((d) => flow[d])]) {
      assert.equal(MOVES[id]?.weapon, weapon, `${id} is a ${weapon} strike`);
      assert.ok(MOVE_MOTION[id], `${id} has a clip`);
    }
    for (const d of STRIKE_DIRECTIONS) {
      const move = MOVES[flow[d]];
      assert.ok(move.chain && move.chain.to <= move.duration + 0.02 && move.chain.from > move.startup, `${flow[d]}: a chain window after its wind-up`);
      assert.equal(MOTION_CLIPS[MOVE_MOTION[flow[d]].segments[0].clip].source, 'blender', `${flow[d]}: a clip made for it`);
    }
    assert.ok(MOVES[flow.forward].range >= MOVES[flow.chain[0]].range, `${weapon}: the advance reaches at least as far`);
    assert.equal(MOVES[flow.back].arc, 360, `${weapon}: the turn cuts all round`);
    assert.ok(MOVES[flow.side].arc >= 220, `${weapon}: the sweep is wide`);
  }
});

test('a light strike takes the direction held; with none it opens the chain', () => {
  for (const [weapon, flow] of PLAIN) {
    assert.deepEqual(chain(weapon, [null]).made, [flow.chain[0]]);
    for (const d of STRIKE_DIRECTIONS) assert.deepEqual(chain(weapon, [d]).made, [flow[d]], `${weapon} ${d}`);
  }
  assert.deepEqual(chain('sword', [null]).made, ['swordCutStandBalanced'], 'the sword standing still: its flat cut');
  assert.deepEqual(chain('bow', ['forward']).made, ['bowShot'], 'a form without Flow is as it was');
});

test('strikes chain freely by direction, never the same one twice running, and no longer than the chain', () => {
  // with no direction: the chain as it always was
  assert.deepEqual(chain('sword', [null, null, null]).made, ['swordCutStandBalanced', 'swordCutRightBalanced', 'swordCutDownBalanced']);
  assert.deepEqual(chain('dualBlades', [null, null, null, null]).made, ['bladesCutStand', 'bladesCutRight', 'bladesCutDown', 'bladesCutUp']);
  // a direction takes the link's place; the count goes on
  assert.deepEqual(chain('sword', [null, 'forward', null]).made, ['swordCutStandBalanced', 'swordCutDownBalanced', 'swordCutStandBalanced']);
  assert.deepEqual(chain('sword', ['forward', 'left', 'back']).made, ['swordCutDownBalanced', 'swordCutLeftBalanced', 'swordCutUpBalanced']);
  assert.deepEqual(chain('dualBlades', ['back', 'forward', null, 'left']).made, ['bladesCutUp', 'bladesCutDown', 'bladesCutUp', 'bladesCutLeft']);
  // the same direction held: the sword comes back along the line it just cut; the other forms take the chain's link
  assert.deepEqual(chain('sword', ['forward', 'forward', 'forward']).made, ['swordCutDownBalanced', 'swordCutUpBalanced', 'swordCutDownBalanced']);
  assert.deepEqual(chain('dualBlades', ['forward', 'forward']).made, ['bladesCutDown', 'bladesCutUp']);
  // the staff cuts the same lines, three to a chain
  assert.deepEqual(chain('staff', ['back', null, null]).made, ['staffCutUp', 'staffCutRight', 'staffCutDown']);
  assert.deepEqual(chain('staff', [null, 'back', 'forward']).made, ['staffCutStand', 'staffCutUp', 'staffCutDown']);
  // a chain is three strikes for the sword: a fourth press waits for the recovery and opens a new chain
  const { made, f } = chain('sword', ['forward', 'left', 'back', 'forward']);
  assert.deepEqual(made, ['swordCutDownBalanced', 'swordCutLeftBalanced', 'swordCutUpBalanced', 'buffered']);
  assert.equal(f.action.link, 3);
  assert.equal(f.buffer.direction, 'forward');
});

test('each link knows its place in the chain, and a press that waits keeps its direction', () => {
  const f = createFighter({ id: 'a', weapon: 'sword' });
  press(f, 'light', 0, { direction: null });
  assert.equal(f.action.link, 1);
  assert.equal(f.action.chainedFrom, null);
  // pressed in the wind-up, before the chain window: it waits, and starts the cut back when the window opens
  let t = 0;
  while (t < 0.2) { t += STEP; update(f, STEP, t); } // past the moment a second press would turn the cut into another move
  assert.equal(press(f, 'light', t, { direction: 'right' }).reason, 'buffered');
  while (f.action.id === 'swordCutStandBalanced' && t < 1) { t += STEP; update(f, STEP, t); }
  assert.equal(f.action.id, 'swordCutRightBalanced');
  assert.equal(f.action.chainedFrom, 'swordCutStandBalanced');
  assert.equal(f.action.link, 2);
  assert.ok(Math.abs(t - MOVES.swordCutStandBalanced.chain.from) < 0.03, `at the window's opening (${t.toFixed(3)} s)`);
});

test('the direction is where the stick points relative to the facing; a light touch is none', () => {
  assert.equal(strikeDirection({ yaw: 0, intent: { x: 0, z: 1 } }), 'forward');
  assert.equal(strikeDirection({ yaw: 0, intent: { x: 0, z: -1 } }), 'back');
  assert.equal(strikeDirection({ yaw: 0, intent: { x: 1, z: 0 } }), 'left', 'facing +z, +x is the left hand side');
  assert.equal(strikeDirection({ yaw: 0, intent: { x: -1, z: 0 } }), 'right');
  assert.equal(strikeDirection({ yaw: 0, intent: { x: -0.7, z: 0.7 } }), 'forwardRight');
  assert.equal(strikeDirection({ yaw: 0, intent: { x: 0.7, z: -0.7 } }), 'backLeft');
  assert.equal(strikeDirection({ yaw: Math.PI / 2, intent: { x: 1, z: 0 } }), 'forward', 'forward is where the fighter faces');
  assert.equal(strikeDirection({ yaw: Math.PI / 2, intent: { x: -1, z: 0 } }), 'back');
  assert.equal(strikeDirection({ yaw: 0, intent: { x: 0.3, z: 0.3 } }), null);
  assert.equal(strikeDirection({ yaw: 0, intent: { x: 0, z: 0 } }), null);
  // in the world: moving in as the strike is pressed is the advance, and it carries the body forward
  const w = createWorld();
  const a = addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  step(w, 1 / 60, { a: { move: { x: 0, z: 1 }, face: 0, presses: ['light'] } });
  assert.equal(a.action.id, 'swordCutDownBalanced');
  // a cut does not root the fighter: with the stick held it walks on under the cut; let go, it stands
  for (let i = 0; i < 20; i++) step(w, 1 / 60, { a: { move: { x: 0, z: 1 }, face: 0, presses: [] } });
  const walked = bodyOf(w, 'a').z;
  assert.ok(walked > 0.5, `it walked on under the cut: ${walked.toFixed(2)} m`);
  for (let i = 0; i < 20; i++) step(w, 1 / 60, { a: { move: { x: 0, z: 0 }, face: 0, presses: [] } });
  assert.ok(Math.abs(bodyOf(w, 'a').z - walked) < 0.05, 'and stands when the stick is let go');
  const b = addFighter(w, { id: 'b', x: 6, z: 0, yaw: 0 });
  step(w, 1 / 60, { b: { move: { x: 0.4, z: 0 }, face: 0, presses: ['light'] } });
  assert.equal(b.action.id, 'swordCutStandBalanced', 'circling slowly is no direction');
});

test('the link and the direction of a waiting press travel with the fighter over the wire', () => {
  const w = createWorld();
  const a = addFighter(w, { id: 'a' });
  press(a, 'light', 0, { direction: 'forward' });
  let t = 0;
  while (a.action.t < a.action.move.chain.from + 0.01) { t += STEP; update(a, STEP, t); }
  press(a, 'light', t, { direction: 'left' });
  for (let i = 0; i < 24; i++) { t += STEP; update(a, STEP, t); } // past the moment a second press would change the cut
  press(a, 'light', t, { direction: 'back' }); // too early for that cut's own window: it waits
  const other = createWorld();
  const copy = addFighter(other, { id: 'a' });
  applyOwn(copy, bodyOf(other, 'a'), JSON.parse(JSON.stringify(encodeOwn(a, bodyOf(w, 'a'), t))));
  assert.equal(copy.action.id, 'swordCutLeftBalanced');
  assert.ok(Math.abs(copy.action.t - a.action.t) < 1e-9, 'with the time the cut had already skipped');
  assert.equal(copy.action.link, 2);
  assert.deepEqual({ command: copy.buffer.command, direction: copy.buffer.direction }, { command: 'light', direction: 'back' });
});

test('bots that know Flow use it, and still fight to a finish', () => {
  assert.equal(BOT_LEVELS.trainee.flow, 0, 'a trainee keeps to the plain chain');
  assert.ok(BOT_LEVELS.master.flow > BOT_LEVELS.duelist.flow);
  const w = createWorld();
  const a = addFighter(w, { id: 'a', x: 0, z: -4 });
  const b = addFighter(w, { id: 'b', x: 0, z: 4, weapon: 'staff' });
  const bots = { a: createBot('a', { level: 'master', seed: 5 }), b: createBot('b', { level: 'master', seed: 9 }) };
  const used = new Set();
  for (let i = 0; i < 60 * 180 && !a.vitals.dead && !b.vitals.dead; i++) {
    step(w, 1 / 60, { a: think(w, bots.a), b: think(w, bots.b) });
    for (const f of [a, b]) if (f.action && f.action.t < 0.02) used.add(f.action.id);
  }
  assert.ok(a.vitals.dead || b.vitals.dead, 'someone falls within three minutes');
  const turned = [...used].filter((id) => (MOVES[id]?.cut && MOVES[id].cut.direction !== 'stand') || ['staffLeap', 'staffSweep'].includes(id));
  assert.ok(turned.length >= 2, `strikes by direction were used: ${turned.join(', ') || 'none'}`);
});
