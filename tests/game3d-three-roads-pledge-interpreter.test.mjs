import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPledgeCompletionClaim } from '../src/components/game3d/pledges/pledgeClaim.mjs';
import { BAND1_LINES, BAND1_STAGING } from '../src/components/game3d/threeroads/script/band1.mjs';
import {
  pledgeDialogueLines, threeRoadsPledge,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import {
  resetPledgeStepMemory, standingCues,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeInterpreter.mjs';
import { createHarness } from './game3d-three-roads-pledge-harness.mjs';

const M01 = 'tr_m01_sworn_at_the_gate';
const M02 = 'tr_m02_three_arrows';
const V01 = 'tr_v01_lantern_count';
const V16 = 'tr_v16_three_fields';

const fresh = options => { resetPledgeStepMemory(); return createHarness(options); };
const count = (list, predicate) => list.filter(predicate).length;

// ── Sworn at the Gate, in pieces so a test can stop anywhere ──────────────
function m01Oath(h) {
  assert.equal(h.accept(M01).ok, true);
  h.wait(0.2);
  h.place('oath_tree');
  h.hold(2.2);
}
function m01Gate(h) {
  h.wait(2.5); // Lyra's line, the pause, the bell
  h.place('gate_arch');
}
function m01Shades(h) { h.kill('tr_m01_gate_shades', 6); }
function m01Free(h, wagons = ['yard_wagon_akitsu', 'yard_wagon_tameri', 'yard_wagon_remoria']) {
  for (const wagon of wagons) { h.place(wagon); h.hold(2.2); }
}
function m01Walk(h) { h.wait(0.3); h.walk('oath_tree'); }
function m01Lyra(h) { h.place('archer_lyra'); return h.press(); }
function playM01(h) {
  m01Oath(h); m01Gate(h); m01Shades(h); m01Free(h); m01Walk(h);
  const pressed = m01Lyra(h);
  h.wait(0.3);
  assert.equal(h.complete(M01), true);
  return pressed;
}

test('Sworn at the Gate: every cue once and in order, every line spoken', () => {
  const h = fresh({ empire: 'akitsu' });
  // Sworn: the first step is announced and watched, nothing else happens yet.
  assert.equal(h.accept(M01).ok, true);
  h.wait(0.2);
  assert.deepEqual(h.log, [{ bus: 'pledge:stepStarted', pledgeId: M01, stepId: 'oath' }]);
  assert.equal(h.view().prompt, null, 'no prompt away from the tree');

  // The oath: a held E at the tree. Letting go early does nothing.
  h.place('oath_tree');
  assert.deepEqual(h.view().prompt, { key: 'E', hold: true, label: 'Tie your ribbon', progress: 0 });
  assert.equal(h.hold(1), 'consume');
  assert.equal(h.reports('world_interact').length, 0, 'let go after one second of two');
  assert.equal(h.hold(2.2), 'consume');
  assert.deepEqual(h.reports('world_interact').map(e => e.detail), [
    { type: 'world_interact', pledgeId: M01, count: 1, targetId: 'tr_oath_tree', placeId: 'P01' },
  ]);

  // Lyra speaks, two seconds pass, the bell rings, she speaks again. Only then
  // do the travellers and the shades appear and the gate step is watched.
  h.wait(0.3);
  assert.deepEqual(h.says(), ['lyra_m01_04']);
  assert.equal(h.bus('cast:spawn').length, 0);
  h.place('gate_arch');
  assert.equal(h.reports('location_discovered').length, 0, 'the gate is not watched while the scene plays');
  h.place('oath_tree');
  h.wait(2);
  assert.deepEqual(h.log.slice(-7).map(e => e.say || e.sound || e.bus), [
    'gate_bell', 'lyra_m01_05', 'pledge:stepStarted',
    'cast:spawn', 'cast:spawn', 'cast:spawn', 'enemies:spawnGroup',
  ]);
  assert.deepEqual(h.bus('cast:spawn').map(e => [e.id, e.x, e.z]), [
    ['traveller_tome', 61, -142], ['traveller_henut', 70, -135], ['traveller_livilla', 79, -142],
  ]);
  assert.deepEqual(h.bus('enemies:spawnGroup'), [{
    bus: 'enemies:spawnGroup', groupId: 'tr_m01_gate_shades', kind: 'ink_shade', count: 6,
    x: 70, z: -140, radius: 12, level: 'player', tier: 'normal', placeId: 'P04',
  }]);

  // The run to the gate.
  h.place({ x: 0, z: -155 - 15 });
  assert.equal(h.reports('location_discovered').length, 0, 'fifteen metres short of the arch');
  h.place('gate_arch');
  assert.deepEqual(h.reports('location_discovered')[0].detail,
    { type: 'location_discovered', pledgeId: M01, count: 1, targetId: 'P04', placeId: 'P04' });
  h.wait(0.2);
  assert.equal(h.says().at(-1), 'warden_m01_01');

  // Six deaths, reported by the enemies subsystem.
  h.kill('tr_m01_gate_shades', 5);
  assert.equal(h.stepOf(M01), 'shades');
  h.kill('tr_m01_gate_shades', 1);
  assert.equal(h.stepOf(M01), 'free');
  assert.equal(h.says().at(-1), 'warden_m01_02');

  // Three wagons, each once.
  h.place('yard_wagon_tameri');
  assert.equal(h.view().prompt.label, 'Lift the wagon');
  h.hold(2.2);
  assert.equal(h.says().at(-1), 'henut_m01_01');
  assert.equal(h.view().prompt, null, 'a wagon already lifted asks for nothing');
  assert.equal(h.hold(2.2), null);
  assert.equal(h.progress(M01, 'free'), 1);
  m01Free(h, ['yard_wagon_akitsu', 'yard_wagon_remoria']);
  h.wait(0.2);
  assert.deepEqual(h.bus('cast:follow').map(e => [e.id, e.target, e.distance]), [
    ['traveller_tome', 'player', 3], ['traveller_henut', 'player', 4.5], ['traveller_livilla', 'player', 6],
  ]);

  // The walk back: a line every 28 metres, and the step ends at the tree.
  const before = h.says().length;
  h.walk('oath_tree');
  assert.deepEqual(h.says().slice(before),
    ['tome_m01_02', 'henut_m01_02', 'livilla_m01_02', 'tome_m01_03', 'henut_m01_03']);
  assert.equal(h.reports('escort_completed').length, 1);
  h.wait(0.2);
  assert.deepEqual(h.bus('cast:follow').slice(3).map(e => [e.id, e.target]), [
    ['traveller_tome', null], ['traveller_henut', null], ['traveller_livilla', null],
  ]);

  // Speaking with Lyra finishes the last step; the key is left to the game so
  // its own dialogue opens for the ending.
  assert.equal(h.press(), null, 'E away from Lyra is nobody\'s business');
  assert.equal(m01Lyra(h), 'pass');
  h.wait(0.2);
  assert.equal(h.stepOf(M01), null);
  assert.equal(h.says().at(-1), 'henut_m01_04', 'a player of Akitsu is given the bead from Tameri');
  assert.deepEqual(h.log.filter(e => e.flag), [{ flag: 'tr_keepsake_tameri' }]);

  // The claim a server would be sent.
  const claim = buildPledgeCompletionClaim(threeRoadsPledge(M01), h.state);
  assert.equal(claim.ready, true);
  assert.equal(claim.outcome, 'kept');
  assert.equal(h.complete(M01), true);
  assert.equal(h.state.storyFlags.tr_truce_sworn, true);
  assert.deepEqual(h.interpreter.status(), []);

  // Every line of the pledge's steps was spoken exactly once, in script order.
  assert.deepEqual(h.says(), [
    'lyra_m01_04', 'lyra_m01_05', 'warden_m01_01', 'warden_m01_02',
    'henut_m01_01', 'tome_m01_01', 'livilla_m01_01',
    'tome_m01_02', 'henut_m01_02', 'livilla_m01_02', 'tome_m01_03', 'henut_m01_03',
    'henut_m01_04',
  ]);
  // Every cue was sent once.
  assert.equal(h.bus('cast:spawn').length, 3);
  assert.equal(h.bus('enemies:spawnGroup').length, 1);
  assert.equal(h.bus('cast:follow').length, 6);
  assert.deepEqual(h.log.filter(e => e.sound), [{ sound: 'gate_bell' }]);
  const steps = ['oath', 'gate', 'shades', 'free', 'walk', 'lyra'];
  assert.deepEqual(h.bus('pledge:stepStarted').map(e => e.stepId), steps);
  assert.deepEqual(h.bus('pledge:stepDone').map(e => e.stepId), steps);
  // The offer and the ending are the dialogue box's.
  const dialogue = pledgeDialogueLines(threeRoadsPledge(M01), h.state);
  assert.deepEqual(dialogue.offer.map(l => l.lineId), ['lyra_m01_01', 'lyra_m01_02', 'lyra_m01_03']);
  assert.deepEqual(dialogue.complete.map(l => l.lineId), ['lyra_m01_06', 'lyra_m01_07', 'lyra_m01_08']);
});

test('the keepsake line and flag follow the player\'s empire', () => {
  const expected = {
    akitsu: ['henut_m01_04', 'tr_keepsake_tameri'],
    tameri: ['livilla_m01_03', 'tr_keepsake_remoria'],
    remoria: ['tome_m01_04', 'tr_keepsake_akitsu'],
    none: ['henut_m01_04', 'tr_keepsake_tameri'],
  };
  for (const [empire, [lineId, flag]] of Object.entries(expected)) {
    const h = fresh({ empire });
    assert.equal(playM01(h), 'pass');
    assert.equal(h.says().at(-1), lineId, empire);
    assert.deepEqual(h.log.filter(e => e.flag), [{ flag }], empire);
    assert.equal(h.state.storyFlags[flag], true);
  }
});

test('a reload in the middle of a pledge puts the scene back and repeats nothing', () => {
  // During the fight: four of six shades already beaten.
  let h = fresh({ empire: 'tameri' });
  m01Oath(h); m01Gate(h);
  h.kill('tr_m01_gate_shades', 4);
  let again = h.reload();
  again.wait(0.3);
  assert.deepEqual(again.says(), [], 'no line of an earlier step is spoken again');
  assert.deepEqual(again.log.filter(e => e.sound), []);
  assert.deepEqual(again.bus('cast:spawn').map(e => e.id), ['traveller_tome', 'traveller_henut', 'traveller_livilla']);
  assert.deepEqual(again.bus('enemies:spawnGroup').map(e => [e.groupId, e.count, e.placeId]), [['tr_m01_gate_shades', 2, 'P04']]);
  assert.deepEqual(again.bus('pledge:stepStarted').map(e => e.stepId), ['shades']);
  again.kill('tr_m01_gate_shades', 2);
  assert.equal(again.stepOf(M01), 'free');

  // While freeing the travellers, one wagon done. The step's start cues run
  // again (it has none); the beaten shades stay beaten.
  h = fresh();
  m01Oath(h); m01Gate(h); m01Shades(h); m01Free(h, ['yard_wagon_akitsu']);
  again = h.reload();
  again.wait(0.3);
  assert.equal(again.bus('enemies:spawnGroup').length, 0);
  assert.equal(again.bus('cast:spawn').length, 3);
  assert.deepEqual(again.says(), []);
  again.place('yard_wagon_akitsu');
  assert.equal(again.view().prompt, null, 'the wagon lifted before the scene changed stays lifted');
  m01Free(again, ['yard_wagon_tameri', 'yard_wagon_remoria']);
  assert.equal(again.stepOf(M01), 'walk');

  // The same after a full page reload, where the page no longer knows which
  // wagon it was: any two more will do.
  resetPledgeStepMemory();
  again = h.reload();
  m01Free(again, ['yard_wagon_akitsu', 'yard_wagon_tameri']);
  assert.equal(again.stepOf(M01), 'walk');

  // On the walk: the travellers are brought in and follow again.
  again = again.reload();
  again.wait(0.3);
  assert.deepEqual(again.bus('cast:follow').map(e => [e.id, e.target]), [
    ['traveller_tome', 'player'], ['traveller_henut', 'player'], ['traveller_livilla', 'player'],
  ]);
  again.place('yard_centre');
  m01Walk(again);
  assert.equal(again.stepOf(M01), 'lyra');

  // After the walk they stand at the tree, not back under the wagons.
  again = again.reload();
  again.wait(0.3);
  assert.deepEqual(again.bus('cast:spawn').map(e => [e.id, Math.round(e.x * 10), Math.round(e.z * 10)]), [
    ['traveller_tome', -66, -2], ['traveller_henut', -66, -2], ['traveller_livilla', -66, -2],
  ]);
  assert.equal(again.bus('cast:follow').length, 0);

  // A step with start cues runs them again: the gate step brings the wagons' scene back.
  h = fresh();
  m01Oath(h);
  h.wait(2.5);
  again = h.reload();
  again.wait(0.3);
  assert.equal(again.bus('cast:spawn').length, 3);
  assert.equal(again.bus('enemies:spawnGroup').length, 1);
  assert.deepEqual(again.says(), [], 'the oath step\'s done cues are not run again');
});

test('abandoning a pledge takes its people and monsters out of the world', () => {
  const h = fresh();
  m01Oath(h); m01Gate(h);
  h.kill('tr_m01_gate_shades', 2);
  h.abandon(M01);
  assert.deepEqual(h.bus('cast:despawn').map(e => e.id), ['traveller_tome', 'traveller_henut', 'traveller_livilla']);
  assert.deepEqual(h.bus('enemies:despawnGroup').map(e => e.groupId), ['tr_m01_gate_shades']);
  assert.deepEqual(h.interpreter.status(), []);
});

test('an escort fails when a follower is left sixty metres behind for ten seconds', () => {
  const h = fresh();
  m01Oath(h); m01Gate(h); m01Shades(h); m01Free(h);
  h.wait(0.3);
  h.log.length = 0;
  // The travellers are stuck at the wagons while the player runs on, eighty metres up the road.
  const stay = { x: 70, z: -140 };
  h.frame.locate = id => (id.startsWith('traveller_') ? stay : h.people.get(id) || null);
  h.player.x = 70; h.player.z = -60;
  h.wait(9.5);
  assert.deepEqual(h.notices(), []);
  h.wait(1);
  assert.deepEqual(h.notices(), ['escort_failed']);
  assert.deepEqual(h.reports('escort_failed').map(e => e.detail),
    [{ type: 'escort_failed', pledgeId: M01, targetId: 'tr_m01_travellers' }]);
  assert.equal(h.stepOf(M01), 'walk', 'the step is still open');
});

// ── Three Arrows ──────────────────────────────────────────────────────────
function m02ToChoice(h) {
  assert.equal(h.accept(M02).ok, true);
  h.wait(0.2);
  for (const envoy of ['mizuhara_jun', 'paneb_scribe', 'aelia_sabina']) { h.place(envoy); h.press(); }
  h.wait(0.3);
  h.place('ring_place');
  h.wait(17);
  for (const waypoint of ['ink_trail_1', 'ink_trail_2', 'ink_trail_3']) h.walk(waypoint, 7);
  h.wait(0.3);
  h.press();
  h.wait(0.3);
  h.place('sable_vey');
  h.press();
  h.wait(18);
}

test('Three Arrows: the parley plays out before the chase, a lost trail starts again, both answers', () => {
  const h = fresh({ empire: 'remoria' });
  assert.equal(h.accept(M02).ok, false, 'not before Sworn at the Gate');
  playM01(h);
  h.log.length = 0;
  assert.equal(h.accept(M02).ok, true);
  h.wait(0.2);

  // The three envoys, each once, in any order.
  h.place('paneb_scribe');
  assert.equal(h.press(), 'consume', 'the game\'s own dialogue must not open for an envoy');
  assert.equal(h.press(), null, 'the same envoy does not count twice');
  assert.equal(h.progress(M02, 'hear'), 1);
  h.place('aelia_sabina'); h.press();
  h.place('mizuhara_jun'); h.press();
  assert.deepEqual(h.says(), ['paneb_m02_01', 'paneb_m02_02', 'aelia_m02_01', 'aelia_m02_02', 'mizuhara_m02_01', 'mizuhara_m02_02']);
  assert.deepEqual(h.reports('npc_talked')[0].detail, { type: 'npc_talked', pledgeId: M02, count: 1, targetId: 'tr_m02_envoys' });
  h.wait(0.2);
  assert.deepEqual(h.bus('cast:moveTo').map(e => [e.id, e.x, Math.round(e.z * 10) / 10, e.speed]), [
    ['mizuhara_jun', -4.5, -11, 1.6], ['paneb_scribe', 4.5, -11, 1.6], ['aelia_sabina', 0, -14.5, 1.6], ['sable_vey', 2.4, -7.6, 1.6],
  ]);
  assert.deepEqual(h.bus('cast:spawn').map(e => [e.id, e.facing]), [['elder_maren', Math.PI]]);

  // The ring: the scene takes sixteen seconds and the chase is not watched until it is over.
  h.place('ring_place');
  h.wait(0.2);
  assert.equal(h.says().at(-1), 'sable_m02_03');
  h.wait(3);
  assert.equal(h.says().at(-1), 'maren_m02_01');
  h.wait(7);
  assert.equal(h.says().at(-1), 'maren_m02_02');
  assert.equal(h.bus('cast:despawn').length, 0);
  h.place('ink_trail_1');
  h.place('ring_place');
  assert.equal(h.progress(M02, 'chase'), 0, 'nothing counts while the scene plays');
  h.wait(6.2);
  assert.deepEqual(h.log.slice(-5).map(e => e.sound || e.say || e.bus),
    ['three_arrows', 'cast:despawn', 'sable_m02_04', 'enemies:spawnGroup', 'pledge:stepStarted']);
  assert.deepEqual(h.bus('enemies:spawnGroup').at(-1), {
    bus: 'enemies:spawnGroup', groupId: 'tr_m02_ink_archer', kind: 'ink_shade', count: 1,
    x: -20, z: -6, radius: 1, level: 'player', tier: 'normal', passive: true,
  });

  // The trail: waypoints in order only; a leg that takes too long loses it.
  h.wait(0.2);
  h.place('ink_trail_2');
  assert.equal(h.progress(M02, 'chase'), 0, 'the second waypoint first counts for nothing');
  h.walk('ink_trail_1', 7);
  assert.equal(h.progress(M02, 'chase'), 1);
  assert.equal(h.says().at(-1), 'lyra_m02_01', 'Lyra calls after thirty metres');
  h.place({ x: -50, z: -30 }); // off the trail, dawdling
  h.wait(22.5);
  assert.deepEqual(h.notices(), ['trail_lost']);
  assert.deepEqual(h.reports('trail_lost').map(e => e.detail), [{ type: 'trail_lost', pledgeId: M02, targetId: 'tr_m02_ink_trail' }]);
  assert.equal(h.progress(M02, 'chase'), 0, 'back to the first waypoint');
  h.wait(40);
  assert.deepEqual(h.notices(), ['trail_lost'], 'the way back to the start is not timed');
  for (const waypoint of ['ink_trail_1', 'ink_trail_2', 'ink_trail_3']) h.walk(waypoint, 7);
  assert.equal(h.stepOf(M02), 'arrows');
  h.wait(0.2);
  assert.deepEqual(h.log.slice(-3).map(e => e.bus || e.sound), ['enemies:despawnGroup', 'ink_burst', 'pledge:stepStarted']);
  assert.equal(count(h.says(), id => id === 'lyra_m02_01'), 1);

  // The arrows, then Sable Vey.
  assert.deepEqual(h.view().prompt, { key: 'E', hold: false, label: 'Pick up the arrows', progress: -1 });
  assert.equal(h.press(), 'consume');
  assert.deepEqual(h.reports('item_collected')[0].detail, { type: 'item_collected', pledgeId: M02, count: 1, itemId: 'tr_three_arrows' });
  h.wait(0.2);
  assert.equal(h.says().at(-1), 'lyra_m02_02');
  h.place('sable_vey');
  assert.equal(h.press(), 'consume', 'Sable is the giver, but the pledge is not over');
  assert.deepEqual(h.reports('item_delivered')[0].detail, { type: 'item_delivered', pledgeId: M02, count: 1, targetId: 'sable_vey' });
  h.wait(1);
  assert.equal(h.view().choice, null, 'the choice waits for the scene');
  h.wait(17);
  assert.deepEqual(h.says().slice(-5), ['sable_m02_05', 'aelia_m02_03', 'paneb_m02_03', 'mizuhara_m02_03', 'sable_m02_06']);
  assert.deepEqual(h.bus('cast:moveTo').slice(4).map(e => e.id), ['aelia_sabina', 'paneb_scribe', 'mizuhara_jun']);

  // The choice.
  const shown = h.view().choice;
  assert.equal(shown.prompt, 'Sable Vey holds out the Truce Stone.');
  assert.deepEqual(shown.options.map(o => o.id), ['swear', 'silent']);
  assert.equal(h.choose(M02, 'nonsense'), false);
  assert.equal(h.choose(M02, 'swear'), true);
  assert.deepEqual(h.reports('choice_made')[0].detail,
    { type: 'choice_made', pledgeId: M02, count: 1, targetId: 'again', choiceId: 'swear' });
  assert.equal(h.state.storyFlags.tr_truce_twice_sworn, true);
  assert.equal(h.stepOf(M02), null);
  assert.deepEqual(pledgeDialogueLines(threeRoadsPledge(M02), h.state).complete.map(l => l.lineId), ['sable_m02_07', 'sable_m02_09']);
  assert.equal(h.complete(M02), true);
  assert.equal(h.state.storyFlags.tr_war_open, true);

  // Every line of the steps, once each, in order (the trail line is spoken on the first try).
  assert.deepEqual(h.says(), [
    'paneb_m02_01', 'paneb_m02_02', 'aelia_m02_01', 'aelia_m02_02', 'mizuhara_m02_01', 'mizuhara_m02_02',
    'sable_m02_03', 'maren_m02_01', 'maren_m02_02', 'sable_m02_04', 'lyra_m02_01', 'lyra_m02_02',
    'sable_m02_05', 'aelia_m02_03', 'paneb_m02_03', 'mizuhara_m02_03', 'sable_m02_06',
  ]);
  assert.deepEqual(h.log.filter(e => e.sound).map(e => e.sound), ['three_arrows', 'ink_burst']);

  // The other answer.
  const other = fresh();
  playM01(other);
  m02ToChoice(other);
  assert.equal(other.choose(M02, 'silent'), true);
  assert.equal(other.state.storyFlags.tr_truce_once_sworn, true);
  assert.equal(other.state.storyFlags.tr_truce_twice_sworn, false);
  assert.deepEqual(pledgeDialogueLines(threeRoadsPledge(M02), other.state).complete.map(l => l.lineId), ['sable_m02_08', 'sable_m02_09']);
  assert.equal(buildPledgeCompletionClaim(threeRoadsPledge(M02), other.state).choices.again, 'silent');
});

test('a choice waits for the line that asks for it, and can be put aside and brought back', () => {
  let speaking = true;
  resetPledgeStepMemory();
  const h = createHarness({ speechBusy: () => speaking });
  playM01(h);
  m02ToChoice(h);
  assert.equal(h.view().choice, null, 'Sable is still speaking');
  speaking = false;
  h.wait(0.2);
  assert.ok(h.view().choice);
  // Put aside: it stays away until the player walks off and comes back, or presses E beside her.
  h.interpreter.dismissChoice(M02, h.now);
  assert.equal(h.view().choice, null);
  h.wait(12);
  assert.equal(h.view().choice, null);
  assert.equal(h.press(), 'consume');
  assert.ok(h.view().choice);
  h.interpreter.dismissChoice(M02, h.now);
  h.place({ x: 60, z: 60 });
  assert.equal(h.view().choice, null, 'no choice far from the one who asks');
  h.place('sable_vey');
  h.wait(0.2);
  assert.ok(h.view().choice);
  // A reload at the choice shows it again and sends the envoys on their way again.
  const again = h.reload({ speechBusy: () => false });
  again.wait(0.3);
  assert.deepEqual(again.bus('cast:moveTo').map(e => e.id).sort(), ['aelia_sabina', 'mizuhara_jun', 'paneb_scribe', 'sable_vey']);
  assert.equal(again.bus('cast:spawn').length, 0, 'Elder Maren is not brought back');
  assert.equal(again.bus('enemies:spawnGroup').length, 0, 'nor the ink archer');
  again.place('sable_vey');
  assert.ok(again.view().choice);
});

// ── The Lantern Count ─────────────────────────────────────────────────────
test('The Lantern Count: three wagon masters, the oil, five lanterns', () => {
  const h = fresh();
  playM01(h);
  m02ToChoice(h);
  h.choose(M02, 'swear');
  h.complete(M02);
  h.log.length = 0;
  assert.equal(h.accept(V01).ok, true);
  h.wait(0.2);
  // Paneb has moved to the Threshing Floor now that the war is open.
  assert.equal(Math.round(h.people.get('paneb_scribe').z), -298);
  for (const person of ['goro_sergeant', 'paneb_scribe', 'titus_oldvine']) { h.place(person); assert.equal(h.press(), 'consume'); }
  assert.deepEqual(h.says(), ['goro_v01_01', 'paneb_v01_01', 'oldvine_v01_01']);
  assert.equal(h.stepOf(V01), 'back');
  h.place('bram_lamplighter');
  assert.equal(h.press(), 'consume');
  h.wait(0.2);
  assert.equal(h.says().at(-1), 'bram_v01_03');
  // Five lanterns: one hold each, and the key has to be pressed again for the next.
  h.place('lantern_wall');
  assert.deepEqual(h.view().prompt, { key: 'E', hold: true, label: 'Light a lantern', progress: 0 });
  h.hold(8);
  assert.equal(h.progress(V01, 'light'), 1, 'one long hold lights one lantern');
  for (let i = 0; i < 4; i++) h.hold(1.7);
  assert.deepEqual(h.says().slice(-5), ['bram_v01_04', 'bram_v01_05', 'bram_v01_06', 'bram_v01_07', 'bram_v01_08']);
  assert.equal(h.reports('world_interact').length, 5);
  assert.equal(h.stepOf(V01), null);
  assert.deepEqual(pledgeDialogueLines(threeRoadsPledge(V01), h.state).complete.map(l => l.lineId), ['bram_v01_09']);
  assert.equal(h.complete(V01), true);
});

// ── The Gravedigger's Three Fields ────────────────────────────────────────
function v16ToGuard(h) {
  assert.equal(h.accept(V16).ok, true);
  h.wait(0.2);
  h.place('woodpile'); h.press(); h.press();
  h.place('salt_store'); h.press();
  h.place('titus_oldvine'); h.press();
  h.place('dalla_gravedigger'); h.press();
  h.wait(0.3);
}
function afterTheWar(h) {
  playM01(h);
  m02ToChoice(h);
  h.choose(M02, 'silent');
  h.complete(M02);
  h.log.length = 0;
}

test('The Gravedigger\'s Three Fields: fetching, a failed defence, the defence held, three answers', () => {
  const h = fresh();
  afterTheWar(h);
  assert.equal(h.accept(V16).ok, true);
  h.wait(0.2);
  h.place('woodpile');
  assert.deepEqual(h.view().prompt, { key: 'E', hold: false, label: 'Take a bundle of cedar', progress: -1 });
  h.press();
  assert.equal(h.stepOf(V16), 'cedar', 'two bundles are asked for');
  h.press();
  assert.equal(h.stepOf(V16), 'salt');
  assert.equal(h.press(), null, 'no third bundle');
  h.place('salt_store'); h.press();
  h.place('titus_oldvine'); assert.equal(h.press(), 'consume');
  assert.deepEqual(h.says(), ['oldvine_v16_01']);
  h.place('dalla_gravedigger'); assert.equal(h.press(), 'consume');
  h.wait(0.3);
  assert.equal(h.says().at(-1), 'dalla_v16_03');
  assert.deepEqual(h.reports('item_collected').map(e => e.detail.itemId), ['tr_cedar_bundle', 'tr_cedar_bundle', 'tr_salt_sack']);

  // The defence: Dalla stands inside the ground to hold, so it starts at once.
  h.wait(2);
  assert.deepEqual(h.bus('enemies:spawnGroup').map(e => [e.groupId, e.count, e.placeId, e.x, e.z]),
    [['tr_v16_ink_1', 3, 'P10', -148, -382]]);
  assert.ok(h.view().prompt.progress > 0 && h.view().prompt.key === null);
  h.wait(29);
  assert.deepEqual(h.bus('enemies:spawnGroup').map(e => e.groupId), ['tr_v16_ink_1', 'tr_v16_ink_2']);
  // Walking off for more than eight seconds loses it; a short step outside does not.
  h.place({ x: -130, z: -340 });
  h.wait(5);
  h.place('graves_centre');
  h.wait(1);
  assert.deepEqual(h.notices(), []);
  h.place({ x: -130, z: -340 });
  h.wait(8.5);
  assert.deepEqual(h.notices(), ['defend_failed']);
  assert.deepEqual(h.reports('defend_failed').map(e => e.detail), [{ type: 'defend_failed', pledgeId: V16, targetId: 'tr_v16_guard' }]);
  assert.deepEqual(h.bus('enemies:despawnGroup').map(e => e.groupId), ['tr_v16_ink_1', 'tr_v16_ink_2']);
  assert.equal(h.reports('defend_completed').length, 0);
  h.wait(70);
  assert.equal(h.reports('defend_completed').length, 0, 'the clock does not run while the player is away');
  // Back on the ground: it starts again from nothing, waves and all.
  h.place('graves_centre');
  h.wait(59);
  assert.equal(h.reports('defend_completed').length, 0);
  assert.deepEqual(h.bus('enemies:spawnGroup').map(e => e.groupId), ['tr_v16_ink_1', 'tr_v16_ink_2', 'tr_v16_ink_1', 'tr_v16_ink_2']);
  h.wait(1.5);
  assert.deepEqual(h.reports('defend_completed').map(e => e.detail),
    [{ type: 'defend_completed', pledgeId: V16, count: 1, targetId: 'tr_v16_guard', placeId: 'P10' }]);
  h.wait(0.3);
  assert.deepEqual(h.log.slice(-4).map(e => e.bus || e.say), ['enemies:despawnGroup', 'enemies:despawnGroup', 'dalla_v16_04', 'pledge:stepStarted']);

  assert.equal(h.view().choice, null, 'nine metres from Dalla: the choice is hers to offer, up close');
  h.place('dalla_gravedigger');
  const shown = h.view().choice;
  assert.equal(shown.prompt, 'Dalla holds out the spade.');
  assert.deepEqual(shown.options.map(o => o.id), ['own', 'all', 'hers']);
  assert.equal(h.choose(V16, 'all'), true);
  assert.equal(h.state.storyFlags.tr_v16_all_three, true);
  assert.deepEqual(pledgeDialogueLines(threeRoadsPledge(V16), h.state).complete.map(l => l.lineId), ['dalla_v16_06']);
  assert.equal(h.complete(V16), true);
  assert.deepEqual(h.says(), ['oldvine_v16_01', 'dalla_v16_03', 'dalla_v16_04']);

  for (const [answer, lineId, flag] of [['own', 'dalla_v16_05', 'tr_v16_own_rite'], ['hers', 'dalla_v16_07', 'tr_v16_valley_rite']]) {
    const other = fresh();
    afterTheWar(other);
    v16ToGuard(other);
    other.wait(61);
    other.wait(0.3);
    assert.equal(other.choose(V16, answer), true, answer);
    assert.equal(other.state.storyFlags[flag], true);
    assert.deepEqual(pledgeDialogueLines(threeRoadsPledge(V16), other.state).complete.map(l => l.lineId), [lineId]);
  }
});

test('two pledges that want the same person both hear one press', () => {
  const h = fresh();
  afterTheWar(h);
  h.accept(V01);
  h.accept(V16);
  h.wait(0.2);
  h.place('woodpile'); h.press(); h.press();
  h.place('salt_store'); h.press();
  h.place('titus_oldvine');
  assert.equal(h.press(), 'consume');
  assert.equal(h.progress(V01, 'oil'), 1);
  assert.equal(h.stepOf(V16), 'bring');
  assert.deepEqual(h.says().sort(), ['oldvine_v01_01', 'oldvine_v16_01']);
});

test('the script holds together: every staged line and step exists, and the standing state is cues', () => {
  for (const [pledgeId, staging] of Object.entries(BAND1_STAGING)) {
    const pledge = threeRoadsPledge(pledgeId);
    assert.ok(pledge, pledgeId);
    for (const stepId of Object.keys(staging.steps)) assert.ok(pledge.pledge.steps.some(step => step.id === stepId), stepId);
    for (let index = 0; index <= pledge.pledge.steps.length; index++) {
      for (const cue of standingCues(pledge, staging, index, {})) {
        assert.ok(cue.castSpawn || cue.castMove || cue.castFollow || cue.spawnGroup, JSON.stringify(cue));
      }
    }
  }
  assert.ok(Object.keys(BAND1_LINES).length >= 63);
});
