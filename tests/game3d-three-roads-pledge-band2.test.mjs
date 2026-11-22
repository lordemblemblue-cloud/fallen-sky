// Band 2 (each empire's camp, written but not built) played through the
// interpreter with a recorded world: carry steps, a line at each death,
// optional steps beside the main one, both answers of each choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAND2_LINES } from '../src/components/game3d/threeroads/script/band2.mjs';
import {
  pledgeDialogueLines, threeRoadsBandPledges, threeRoadsPledges,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import { pledgePointWorld, resetPledgeStepMemory } from '../src/components/game3d/threeroads/pledgeworld/pledgeInterpreter.mjs';
import { createHarness, emptyQuestState } from './game3d-three-roads-pledge-harness.mjs';

const BAND2 = threeRoadsBandPledges('band2');
const ALL = [...threeRoadsPledges(), ...BAND2];
const byId = id => ALL.find(pledge => pledge.id === id);

// After the opening: both main chapters done and the war open.
function afterTheOpening(extraDone = []) {
  const state = emptyQuestState();
  state.completedIds = ['tr_m01_sworn_at_the_gate', 'tr_m02_three_arrows', ...extraDone];
  state.storyFlags = { tr_truce_sworn: true, tr_war_open: true };
  return state;
}
function harness(area, empire, extraDone = []) {
  resetPledgeStepMemory();
  return createHarness({ pledges: ALL, area, empire, state: afterTheOpening(extraDone) });
}
const lineIds = h => h.says().filter(id => id in BAND2_LINES);

test('band 2 is written but not offered: only built bands are registered', () => {
  assert.equal(BAND2.length, 6);
  for (const pledge of BAND2) assert.equal(threeRoadsPledges().includes(pledge), false, pledge.id);
  assert.deepEqual(threeRoadsPledges().map(p => p.id),
    ['tr_m01_sworn_at_the_gate', 'tr_m02_three_arrows', 'tr_v01_lantern_count', 'tr_v16_three_fields']);
});

test("A Farmer's Son: the drill, the picket, the raid with the empty peg, Goro's choice", () => {
  for (const answer of ['powder', 'rice']) {
    const h = harness('west', 'akitsu');
    assert.equal(h.accept('tr_a01_farmers_son').ok, true);
    h.wait(0.2);
    for (const post of ['camp_post_1', 'camp_post_2', 'camp_post_3']) { h.place(post); h.hold(2.2); }
    h.wait(4);
    h.place('camp_picket');
    h.wait(0.3);
    assert.deepEqual(h.bus('enemies:spawnGroup').map(e => [e.groupId, e.count, e.placeId]), [['tr_a01_raid', 5, 'P13']]);
    // The empty peg is open beside the fight, and only then.
    assert.deepEqual(h.bus('pledge:stepStarted').map(e => e.stepId), ['drill', 'picket', 'raid', 'peg']);
    if (answer === 'powder') {
      h.place('camp_armoury');
      assert.equal(h.view().prompt.label, 'Look at the empty peg');
      assert.equal(h.press(), 'consume');
      assert.equal(h.progress('tr_a01_farmers_son', 'peg'), 1);
      h.wait(0.2);
    }
    h.kill('tr_a01_raid', 5);
    h.wait(4);
    if (answer === 'rice') {
      h.place('camp_armoury');
      assert.equal(h.view().prompt, null, 'the peg is gone once the fight is over');
    }
    h.place('goro_sergeant');
    assert.equal(h.press(), 'consume');
    h.wait(0.5);
    assert.ok(h.view().choice, 'Goro holds out the choice');
    assert.equal(h.press(), 'consume', 'E beside him while he asks opens nothing');
    assert.equal(h.choose('tr_a01_farmers_son', answer), true);
    assert.equal(h.stepOf('tr_a01_farmers_son'), null);
    const said = lineIds(h);
    const expected = ['goro_a01_03', 'goro_a01_04', 'goro_a01_05', 'goro_a01_06',
      ...(answer === 'powder' ? ['goro_a01_08'] : []), 'goro_a01_07'];
    assert.deepEqual(said, expected, answer);
    assert.equal(h.state.storyFlags['tr_a01_' + answer], true);
    assert.deepEqual(pledgeDialogueLines(byId('tr_a01_farmers_son'), h.state).complete.map(l => l.lineId),
      [answer === 'powder' ? 'goro_a01_09' : 'goro_a01_10', 'goro_a01_11']);
    assert.equal(h.bus('pledge:stepDone').filter(e => e.stepId === 'peg').length, answer === 'powder' ? 1 : 0);
    assert.equal(h.complete('tr_a01_farmers_son'), true);
  }
});

test("The Sword Mistress's Price: the echo, the banner carried home on foot, a drop, the grave", () => {
  const h = harness('west', 'akitsu', ['tr_a01_farmers_son']);
  assert.equal(h.accept('tr_a02_sword_mistress_price').ok, true);
  h.wait(0.2);
  assert.deepEqual(h.bus('cast:spawn').map(e => e.id), ['ren_swordswoman']);
  h.place('stones_approach');
  h.wait(4);
  assert.deepEqual(h.bus('enemies:spawnGroup').map(e => [e.groupId, e.kind, e.tier]), [['tr_a02_banner_echo', 'echo', 'champion']]);
  h.kill('tr_a02_banner_echo', 1);
  h.wait(4);
  assert.deepEqual(h.bus('cast:follow').map(e => [e.id, e.target]), [['ren_swordswoman', 'player']]);

  // The banner: E at the stones takes it up; the way home speaks while it is carried.
  h.place('stones_banner');
  assert.deepEqual(h.view().prompt, { key: 'E', hold: false, label: 'Take up the banner and the swords', progress: -1 });
  assert.equal(h.press(), 'consume');
  assert.deepEqual(h.view().prompt, { key: null, hold: false, label: 'Carry the banner and the two swords to the hall, on foot.', progress: -1 });
  h.walk({ x: -300, z: 200 }, 6);
  // Mounting (or dying) drops it.
  h.frame.down = true; h.wait(0.2); h.frame.down = false;
  assert.deepEqual(h.notices(), ['carry_dropped']);
  assert.deepEqual(h.reports('carry_dropped').map(e => e.detail),
    [{ type: 'carry_dropped', pledgeId: 'tr_a02_sword_mistress_price', targetId: 'tr_asagiri_banner' }]);
  h.walk('hall_grave', 6);
  assert.equal(h.reports('carry_completed').length, 0, 'nothing is carried any more');
  h.place('stones_banner');
  h.press();
  h.walk('hall_grave', 6);
  assert.deepEqual(h.reports('carry_completed').map(e => e.detail),
    [{ type: 'carry_completed', pledgeId: 'tr_a02_sword_mistress_price', count: 1, targetId: 'tr_asagiri_banner', placeId: 'P14' }]);
  h.wait(0.3);
  assert.deepEqual(h.bus('cast:follow').map(e => [e.id, e.target]), [['ren_swordswoman', 'player'], ['ren_swordswoman', null]]);
  h.place('hall_grave');
  h.hold(3.2);
  h.place('asagiri_tomoe');
  assert.equal(h.press(), 'pass', 'the last step is speaking with the giver: the game opens the ending');
  h.wait(8);
  assert.equal(h.stepOf('tr_a02_sword_mistress_price'), null);
  const said = lineIds(h);
  assert.deepEqual(said.slice(0, 2), ['ren_a02_01', 'ren_a02_02']);
  assert.deepEqual(said.slice(-3), ['asagiri_a02_04', 'asagiri_a02_05', 'asagiri_a02_06']);
  // The lines on the way home: in order, each once, as the banner was carried.
  const along = said.filter(id => /^ren_a02_0[345]$/.test(id));
  assert.deepEqual(along, ['ren_a02_03', 'ren_a02_04', 'ren_a02_05'].slice(0, along.length));
  assert.ok(along.length >= 2, 'about 290 m home: at least two of the three lines');
});

test('The Count: two jars, the reeds, a dropped jar sends the count back, the bow case', () => {
  const h = harness('east', 'tameri');
  assert.equal(h.accept('tr_t01_the_count').ok, true);
  h.wait(0.2);
  const jar = () => { h.place('landing_jetty'); h.press(); h.walk('landing_stack', 6); };
  jar();
  assert.equal(h.progress('tr_t01_the_count', 'jars_a'), 1);
  // The second jar falls when the player dies on the way: the step starts again.
  h.place('landing_jetty'); h.press();
  h.frame.down = true; h.wait(0.2); h.frame.down = false;
  assert.equal(h.progress('tr_t01_the_count', 'jars_a'), 0);
  jar(); jar();
  h.wait(4);
  assert.deepEqual(h.bus('enemies:spawnGroup').map(e => [e.groupId, e.count, e.placeId]), [['tr_t01_reed_shades', 4, 'P24']]);
  h.kill('tr_t01_reed_shades', 4);
  h.wait(4);
  // The bow case is open beside the last two jars.
  h.place('landing_bowcase');
  assert.equal(h.press(), 'consume');
  jar(); jar();
  h.place('paneb_scribe');
  assert.equal(h.press(), 'pass');
  h.wait(4);
  assert.equal(h.stepOf('tr_t01_the_count'), null);
  assert.deepEqual(lineIds(h), [
    'paneb_t01_02', 'paneb_t01_02', 'paneb_t01_03', 'sabu_t01_01', 'sabu_t01_02',
    'sabu_t01_03', 'paneb_t01_04', 'paneb_t01_05', 'paneb_t01_06',
  ]);
  assert.equal(h.progress('tr_t01_the_count', 'case'), 1);
  assert.equal(h.complete('tr_t01_the_count'), true);
});

test('Opening of the Mouth: the thief, a line at each freed name, the rite, the guard, the sixth body', () => {
  for (const answer of ['free', 'leave']) {
    const h = harness('east', 'tameri', ['tr_t01_the_count']);
    assert.equal(h.accept('tr_t02_opening_of_the_mouth').ok, true);
    h.wait(0.2);
    assert.deepEqual(h.bus('enemies:spawnGroup').map(e => [e.groupId, e.tier]), [['tr_t02_blade_thief', 'champion']]);
    h.kill('tr_t02_blade_thief', 1);
    h.wait(0.3);
    h.place('scarred_blade'); h.press();
    h.wait(0.3);
    assert.deepEqual(h.bus('cast:despawn').map(e => e.id), ['meresankh_priestess']);
    assert.deepEqual(h.bus('cast:spawn').map(e => e.id), ['meresankh_priestess']);
    h.place('ravine_gate');
    h.wait(4);
    // One line for each name freed, as each one falls.
    h.kill('tr_t02_unopened', 2);
    assert.deepEqual(lineIds(h).slice(-2), ['meresankh_t02_05', 'meresankh_t02_06']);
    h.kill('tr_t02_unopened', 3);
    assert.deepEqual(lineIds(h).slice(-3), ['meresankh_t02_07', 'meresankh_t02_08', 'meresankh_t02_09']);
    h.wait(0.3);
    h.place('ravine_chant');
    h.hold(6.3);
    h.wait(4);
    h.wait(41);
    assert.deepEqual(h.bus('enemies:spawnGroup').map(e => e.groupId).slice(-2), ['tr_t02_ink_1', 'tr_t02_ink_2']);
    h.wait(6);
    const choice = h.view().choice;
    assert.equal(choice.prompt, "Under the overhang lies a sixth body. Its coat is not Tameri's.");
    assert.equal(h.choose('tr_t02_opening_of_the_mouth', answer), true);
    assert.deepEqual(lineIds(h), [
      'meresankh_t02_04', 'meresankh_t02_05', 'meresankh_t02_06', 'meresankh_t02_07', 'meresankh_t02_08',
      'meresankh_t02_09', 'meresankh_t02_10', 'meresankh_t02_11', 'meresankh_t02_12',
    ]);
    assert.deepEqual(pledgeDialogueLines(byId('tr_t02_opening_of_the_mouth'), h.state).complete.map(l => l.lineId),
      [answer === 'free' ? 'meresankh_t02_13' : 'meresankh_t02_14', 'meresankh_t02_15']);
    // A reload in the middle of the freeing does not say a name twice.
    if (answer === 'free') {
      const r = harness('east', 'tameri', ['tr_t01_the_count']);
      r.accept('tr_t02_opening_of_the_mouth');
      r.wait(0.2);
      r.kill('tr_t02_blade_thief', 1); r.wait(0.3);
      r.place('scarred_blade'); r.press(); r.wait(0.3);
      r.place('ravine_gate'); r.wait(4);
      r.kill('tr_t02_unopened', 2);
      const again = r.reload();
      again.wait(0.3);
      assert.deepEqual(again.bus('enemies:spawnGroup').map(e => [e.groupId, e.count]), [['tr_t02_unopened', 3]]);
      again.kill('tr_t02_unopened', 3);
      assert.deepEqual(lineIds(again), ['meresankh_t02_07', 'meresankh_t02_08', 'meresankh_t02_09']);
    }
  }
});

test("Old Vine's Furrow: he walks the furrow with you, two mists, the stone, the archer's case", () => {
  const h = harness('north', 'remoria');
  assert.equal(h.accept('tr_r01_old_vines_furrow').ok, true);
  h.wait(0.2);
  assert.deepEqual(h.bus('cast:follow').map(e => [e.id, e.target]), [['titus_oldvine', 'player']]);
  for (const point of ['furrow_1', 'furrow_2', 'furrow_3']) h.walk(point, 3);
  h.wait(4);
  assert.deepEqual(h.bus('enemies:spawnGroup').map(e => e.groupId), ['tr_r01_mist_1']);
  h.kill('tr_r01_mist_1', 4);
  h.wait(4);
  h.walk('furrow_end', 3);
  h.wait(4);
  h.kill('tr_r01_mist_2', 4);
  h.wait(4);
  // The archer's case is listed after the stone, so it is open while the stone is.
  h.place('furrow_cart');
  assert.equal(h.press(), 'consume');
  h.place('furrow_stone');
  h.hold(3.2);
  h.wait(3);
  assert.deepEqual(h.bus('cast:follow').map(e => [e.id, e.target]), [['titus_oldvine', 'player'], ['titus_oldvine', null]]);
  h.place('furrow_cart');
  assert.equal(h.press(), null, 'once the stone is set the case is no longer open');
  h.place('titus_oldvine');
  assert.equal(h.press(), 'pass');
  h.wait(4);
  assert.equal(h.stepOf('tr_r01_old_vines_furrow'), null);
  const said = lineIds(h);
  assert.deepEqual(said.filter(id => id === 'oldvine_r01_03' || id === 'oldvine_r01_04'), ['oldvine_r01_03', 'oldvine_r01_04']);
  assert.deepEqual(said.filter(id => !['oldvine_r01_03', 'oldvine_r01_04'].includes(id)), [
    'veranius_r01_01', 'oldvine_r01_05', 'oldvine_r01_06', 'veranius_r01_02', 'oldvine_r01_07',
    'oldvine_r01_09', 'oldvine_r01_08', 'veranius_r01_03', 'oldvine_r01_10',
  ]);
});

test('The Crack: the courier, the ambush, the escort down, the tent, and the Tribune asks', () => {
  for (const answer of ['truth', 'nothing']) {
    const h = harness('north', 'remoria', ['tr_r01_old_vines_furrow']);
    assert.equal(h.accept('tr_r02_the_crack').ok, true);
    h.wait(0.2);
    assert.deepEqual(h.bus('cast:spawn').map(e => e.id), ['courier_dexter']);
    h.place('road_top');
    h.wait(4);
    assert.deepEqual(h.bus('enemies:spawnGroup').map(e => [e.groupId, 'placeId' in e]), [['tr_r02_ambush', false]]);
    h.kill('tr_r02_ambush', 5);
    h.wait(4);
    h.walk('fort_gate', 6);
    h.wait(0.3);
    assert.equal(h.reports('escort_completed').length, 1);
    assert.deepEqual(h.bus('cast:moveTo').map(e => e.id), ['courier_dexter']);
    h.place('fort_overhear');
    h.wait(18);
    // The choice is the Tribune's, so it is held out beside her, not beside the Legate.
    h.place('corvinus_legate');
    assert.equal(h.view().choice, null);
    h.place('aelia_sabina');
    assert.equal(h.press(), 'consume');
    h.wait(0.3);
    assert.equal(h.view().choice.prompt, '"What did you hear?"');
    assert.equal(h.choose('tr_r02_the_crack', answer), true);
    const said = lineIds(h);
    assert.deepEqual(said.filter(id => !/^courier_r02_0[34]$/.test(id)), [
      'courier_r02_01', 'courier_r02_02', 'corvinus_r02_03', 'courier_r02_05', 'corvinus_r02_04', 'aelia_r02_01',
    ]);
    assert.deepEqual(said.filter(id => /^courier_r02_0[34]$/.test(id)), ['courier_r02_03', 'courier_r02_04']);
    assert.deepEqual(pledgeDialogueLines(byId('tr_r02_the_crack'), h.state).complete.map(l => l.lineId),
      [answer === 'truth' ? 'aelia_r02_02' : 'aelia_r02_03', 'corvinus_r02_05']);
  }
});

test('every point band 2 stages is known in world metres', () => {
  for (const name of ['camp_post_1', 'stones_banner', 'hall_grave', 'landing_jetty', 'ravine_chant', 'furrow_3', 'fort_overhear']) {
    const at = pledgePointWorld(name);
    assert.ok(at && Number.isFinite(at.x) && Number.isFinite(at.z), name);
  }
});
