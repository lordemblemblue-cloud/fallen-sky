import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActivatedIds, availableRespawnCheckpoints } from '../src/components/game3d/death/activatedCheckpointRules.mjs';
const spots = [{id:'town',default:true},{id:'forest'},{id:'cliff'}];

test('town is always available, unknown checkpoints cannot unlock', () => {
  assert.deepEqual(normalizeActivatedIds(['nonsense','forest','forest'],spots),['town','forest']);
  assert.deepEqual(availableRespawnCheckpoints(spots,[],null).map(p=>p.id),['town']);
});
test('activated and legacy-saved checkpoints appear, but other points stay locked', () => {
  assert.deepEqual(availableRespawnCheckpoints(spots,['forest'],'cliff').map(p=>p.id),['town','forest','cliff']);
  assert.deepEqual(availableRespawnCheckpoints(spots,[], 'unrecognized').map(p=>p.id),['town']);
});
