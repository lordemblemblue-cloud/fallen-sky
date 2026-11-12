// Combat Foundation 3.7: source-only contracts for beta. Not executed now.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDedicatedCheckpoint,validateDedicatedReport}
  from '../../../base44/shared/duelDedicatedHandoff.mjs';
import {createWolfveilMapCollision} from '../mapCollision.mjs';
import {wolfveilForestTrunkColliders}
  from '../../../src/components/game3d/wolfveil/WolfveilForestLayout.js';

const c=()=>initialDedicatedCheckpoint({
  id:'cf37',challenger_id:'p1',opponent_id:'p2',
  challenger_hp:98,opponent_hp:92,
  challenger_max_hp:100,opponent_max_hp:100,
},1000,'wolfveil-v1',{
  instanceId:'cf37-dedicated-instance-0001',
  spawnPresetId:'wolfveil-south-approach-v1',
  mapFingerprint:createWolfveilMapCollision().fingerprint,
});

test('new checkpoint report envelope must not rewind simulation sequence',()=>{
  const previous=c();
  previous.state.sequence=10;
  previous.snapshot.seq=10;
  const duel={id:'cf37',status:'active',dedicated_mode:'dedicated',
    dedicated_epoch:'cf37-epoch',dedicated_sequence:3,
    challenger_id:'p1',opponent_id:'p2',
    dedicated_checkpoint:previous};
  const next={...previous,state:{...previous.state,sequence:9},
    snapshot:{...previous.snapshot,seq:9}};
  const base={duel,epoch:'cf37-epoch',sequence:4,
    checkpoint:next,snapshot:next.snapshot};
  assert.equal(validateDedicatedReport(base).reason,
    'simulation_sequence_regressed');
  const unchanged={...previous,state:{...previous.state,sequence:10},
    snapshot:{...previous.snapshot,seq:10}};
  assert.equal(validateDedicatedReport({...base,
    checkpoint:unchanged,snapshot:unchanged.snapshot}).ok,true);
});

test('3.7 forest collision and server map revision share the same static positions',()=>{
  const world=createWolfveilMapCollision(),trunks=wolfveilForestTrunkColliders();
  assert.ok(trunks.length>=24);
  const a=trunks[0],p={x:a.x,z:a.z+70};
  assert.equal(world.valid(p,{x:0,z:0}),false);
  assert.match(world.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(world.id,'wolfveil-v1');
});
