// The builders' preview switch (threeroads/threeRoadsFlag.mjs): with it on, the
// bands still being built are offered as pledges; without it, players see
// finished bands only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { threeRoadsPledges, threeRoadsPledge } from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import { THREE_ROADS_BANDS } from '../src/components/game3d/threeroads/script/index.mjs';

test('without the preview only finished bands are offered; with it, every band the engine can run', () => {
  const built = THREE_ROADS_BANDS.filter(band => band.built).flatMap(band => band.pledges.map(pledge => pledge.id));
  // A band marked `staged: false` is written but asks the engine for something it cannot do yet.
  const staged = THREE_ROADS_BANDS.filter(band => band.staged !== false).flatMap(band => band.pledges.map(pledge => pledge.id));
  assert.deepEqual(threeRoadsPledges(false).map(pledge => pledge.id), built);
  assert.deepEqual(threeRoadsPledges(true).map(pledge => pledge.id), staged);
  assert.ok(staged.length > built.length, 'band 2 is written and not yet finished');
  // In node there is no window, so the default is "no preview".
  assert.equal(threeRoadsPledges().length, built.length);
  assert.equal(threeRoadsPledge('tr_a01_farmers_son'), null);
  assert.ok(threeRoadsPledges(true).some(pledge => pledge.id === 'tr_a01_farmers_son'));
  // Band 3 goes under the valley, which the engine cannot follow yet: nobody is offered it, preview or not.
  assert.equal(threeRoadsPledges(true).some(pledge => pledge.id === 'tr_m03_the_first_stroke'), false);
  assert.ok(THREE_ROADS_BANDS.some(band => band.pledges.some(pledge => pledge.id === 'tr_m03_the_first_stroke')));
});
