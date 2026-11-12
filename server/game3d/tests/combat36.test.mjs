// Combat Foundation 3.6 — source-only tests; owner has deferred execution to beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duelWorldSpawnPreset,validateDuelWorldSpawnPreset,
} from '../../../base44/shared/duelWorldSpawnPreset.mjs';
import {
  initialDedicatedCheckpoint,validateDedicatedReport,
} from '../../../base44/shared/duelDedicatedHandoff.mjs';
import {createWolfveilMapCollision} from '../mapCollision.mjs';
import {createDuelReportSender} from '../reporting.mjs';

const presetId='wolfveil-south-approach-v1';
const binding={instanceId:'stage-3-6-instance-01',
  spawnPresetId:presetId,mapFingerprint:createWolfveilMapCollision().fingerprint};
const makeDuel=()=>({
  id:'d-36',challenger_id:'c',opponent_id:'o',
  challenger_hp:85,opponent_hp:94,challenger_max_hp:100,opponent_max_hp:100,
  // The previous duel positions must not select the new trusted spawn.
  challenger_position:{x:90,z:90,at:1000},
  opponent_position:{x:92,z:90,at:1000},
});

test('server preset chooses known walkable spawns, not client-position samples',()=>{
  const c=initialDedicatedCheckpoint(makeDuel(),1000,'wolfveil-v1',binding);
  assert.deepEqual(c.worldOrigin,{x:0,z:-80});
  assert.deepEqual(c.state.actors.map(a=>[a.x,a.z]),[[-3,0],[3,0]]);
  assert.equal(c.state.actors[0].hp,85);
  assert.equal(c.state.actors[1].hp,94);
  assert.equal(c.spawnPresetId,presetId);
  assert.equal(c.snapshot.spawnPresetId,presetId);
  assert.equal(validateDuelWorldSpawnPreset(c,presetId,['c','o']).ok,true);
  const world=createWolfveilMapCollision();
  for(const actor of c.state.actors)
    assert.equal(world.valid(actor,c.worldOrigin),true);
  assert.equal(duelWorldSpawnPreset('unknown'),null);
  assert.throws(()=>initialDedicatedCheckpoint(makeDuel(),1000,'wolfveil-v1',
    {...binding,spawnPresetId:'unknown'}));
});

test('worker admission contract rejects forged origins and forged initial spawn',()=>{
  const c=initialDedicatedCheckpoint(makeDuel(),1000,'wolfveil-v1',binding);
  assert.equal(validateDuelWorldSpawnPreset(c,'unknown',['c','o']).ok,false);
  assert.equal(validateDuelWorldSpawnPreset({...c,worldOrigin:{x:4,z:-80}},
    presetId,['c','o']).reason,'spawn_origin_mismatch');
  assert.equal(validateDuelWorldSpawnPreset({...c,
    state:{...c.state,actors:[{...c.state.actors[0],x:-2},c.state.actors[1]]}},
    presetId,['c','o']).reason,'spawn_position_mismatch');
  // On reconnection, position changes are allowed, but the origin is not.
  const restored={...c,reportSequence:1,state:{...c.state,sequence:5,
    actors:[{...c.state.actors[0],x:-5},c.state.actors[1]]}};
  assert.equal(validateDuelWorldSpawnPreset(restored,presetId,['c','o']).ok,true);
});

test('signed backend report rejects changed spawn-preset binding',()=>{
  const c=initialDedicatedCheckpoint(makeDuel(),1000,'wolfveil-v1',binding);
  const duel={...makeDuel(),status:'active',dedicated_mode:'dedicated',
    dedicated_epoch:'epoch',dedicated_sequence:0,dedicated_checkpoint:c};
  const args={duel,epoch:'epoch',sequence:1,snapshot:c.snapshot,checkpoint:c};
  assert.equal(validateDedicatedReport(args).ok,true);
  assert.equal(validateDedicatedReport({...args,
    snapshot:{...c.snapshot,spawnPresetId:'fake'}}).reason,'map_binding_changed');
  assert.equal(validateDedicatedReport({...args,
    checkpoint:{...c,spawnPresetId:null}}).reason,'map_binding_changed');
});

test('finished duel only acknowledges an identical persisted terminal replay',()=>{
  const initial=initialDedicatedCheckpoint(makeDuel(),1000,'wolfveil-v1',binding);
  const finalSnapshot={...initial.snapshot,status:'finished',winnerId:'c'};
  const finalCheckpoint={...initial,reportSequence:1,snapshot:finalSnapshot,
    state:{...initial.state,status:'finished'}};
  const duel={...makeDuel(),status:'finished',dedicated_mode:'dedicated',
    dedicated_epoch:'epoch',dedicated_sequence:1,
    dedicated_result_id:'d-36:epoch:terminal',dedicated_checkpoint:finalCheckpoint};
  const args={duel,epoch:'epoch',sequence:1,resultId:'d-36:epoch:terminal',
    checkpoint:finalCheckpoint,snapshot:finalSnapshot};
  assert.equal(validateDedicatedReport(args).replay,true);
  assert.equal(validateDedicatedReport({...args,sequence:2}).reason,'duel_finished');
  assert.equal(validateDedicatedReport({...args,
    snapshot:{...finalSnapshot,serverTime:123}}).reason,'duel_finished');
});

test('report sender requires exact sequence and terminal identity acknowledgment',async()=>{
  const payload={kind:'settle',duelId:'d-36',epoch:'epoch',
    sequence:3,resultId:'d-36:epoch:9'};
  const sender=body=>createDuelReportSender({
    url:'https://staging.example.invalid/report',
    secret:'only-for-source-test-32-character-long-secret',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>body}),
    now:()=>1000,
  });
  await assert.rejects(sender({success:true,settled:true,
    sequence:2,resultId:payload.resultId})(payload),/acknowledgment/);
  await assert.rejects(sender({success:true,settled:true,
    sequence:3,resultId:'different'})(payload),/acknowledgment/);
  assert.equal((await sender({success:true,settled:true,
    sequence:3,resultId:payload.resultId})(payload)).settled,true);
  const checkpoint={...payload,kind:'checkpoint'};
  assert.equal((await sender({success:true,settled:false,
    sequence:3,resultId:null})(checkpoint)).sequence,3);
});
