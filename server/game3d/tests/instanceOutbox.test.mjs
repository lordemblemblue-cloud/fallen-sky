// Source-only checks, intentionally not executed until beta per owner request.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTerminalOutbox} from '../terminalOutbox.mjs';
import {createWolfveilMapCollision,WOLFVEIL_MAP_FINGERPRINT} from '../mapCollision.mjs';
import {createGame3DDuelMatch} from '../authority.mjs';
import {initialDedicatedCheckpoint,validateDedicatedReport} from
  '../../../base44/shared/duelDedicatedHandoff.mjs';

function terminal(){
  const state={status:'finished',sequence:1,actors:[]};
  return {duelId:'duel01',epoch:'epoch01',kind:'settle',sequence:1,
    resultId:'duel01:epoch01:1',snapshot:{status:'finished'},
    checkpoint:{state}};
}

test('disk outbox replays one terminal result across worker restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'game3d-outbox-'));
  try{
    let calls=0;
    const report=async p=>{calls++;assert.equal(p.resultId,terminal().resultId);
      return {success:true,settled:true};};
    const first=createTerminalOutbox({directory:dir,report});
    first.initialize();
    first.stage(terminal());
    assert.equal(first.pendingCount(),1);
    const restarted=createTerminalOutbox({directory:dir,report});
    restarted.initialize();
    assert.equal(restarted.hasPending('duel01','epoch01'),true);
    await restarted.replayRestored();
    assert.equal(calls,1);
    assert.equal(restarted.pendingCount(),0);
    await restarted.replayRestored();
    assert.equal(calls,1);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('staged terminal duplicates retain first result identity',()=>{
  const dir=mkdtempSync(join(tmpdir(),'game3d-outbox-'));
  try{
    const store=createTerminalOutbox({directory:dir,report:async()=>({settled:true})});
    store.initialize();
    store.stage(terminal());
    assert.equal(store.stage(terminal()).resultId,terminal().resultId);
    assert.equal(store.hasPendingDuel('duel01'),true);
    assert.throws(()=>store.stage({...terminal(),sequence:2}),
      /Conflicting terminal payload/);
    assert.throws(()=>store.stage({...terminal(),resultId:'other-terminal'}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('map fingerprint reflects authoritative obstacle/terrain source',()=>{
  const map=createWolfveilMapCollision();
  assert.match(map.fingerprint,/^[0-9a-f]{64}$/);
  assert.equal(map.fingerprint,WOLFVEIL_MAP_FINGERPRINT);
});

test('backend contract rejects changed instance or geometry revision',()=>{
  const duel={id:'m',status:'active',dedicated_mode:'dedicated',
    dedicated_epoch:'epoch',dedicated_sequence:0,
    challenger_id:'p1',opponent_id:'p2',
    dedicated_checkpoint:{worldOrigin:{x:0,z:0},mapId:'wolfveil-v1',
      instanceId:'instance-123456789',mapFingerprint:WOLFVEIL_MAP_FINGERPRINT}};
  const actors=[{id:'p1',x:0,z:0,hp:90,will:100,stamina:100},
    {id:'p2',x:3,z:0,hp:100,will:100,stamina:100}];
  const snapshot={matchId:'m',seq:0,status:'active',mapId:'wolfveil-v1',
    instanceId:'instance-123456789',mapFingerprint:WOLFVEIL_MAP_FINGERPRINT,
    players:actors.map(a=>({...a,maxHp:100}))};
  const checkpoint={worldOrigin:{x:0,z:0},mapId:'wolfveil-v1',
    instanceId:'instance-123456789',mapFingerprint:WOLFVEIL_MAP_FINGERPRINT,
    state:{status:'active',sequence:0,actors}};
  const args={duel,epoch:'epoch',sequence:1,snapshot,checkpoint};
  assert.equal(validateDedicatedReport(args).ok,true);
  assert.equal(validateDedicatedReport({...args,
    checkpoint:{...checkpoint,instanceId:'other'}}).reason,'map_binding_changed');
  assert.equal(validateDedicatedReport({...args,
    snapshot:{...snapshot,mapFingerprint:'nope'}}).reason,'map_binding_changed');
  assert.equal(validateDedicatedReport({...args,
    checkpoint:{...checkpoint,state:{...checkpoint.state,
      actors:[{...actors[0],hp:999},actors[1]]}}}).reason,
    'checkpoint_snapshot_mismatch');
});

test('instance is generated as part of the server handoff checkpoint',()=>{
  const c=initialDedicatedCheckpoint({
    id:'duel',challenger_id:'p1',opponent_id:'p2',
    challenger_position:{x:0,z:0},opponent_position:{x:3,z:0},
  },1000,'wolfveil-v1',{
    instanceId:'bound-instance-01',mapFingerprint:WOLFVEIL_MAP_FINGERPRINT,
  });
  assert.equal(c.instanceId,'bound-instance-01');
  assert.equal(c.snapshot.instanceId,'bound-instance-01');
});
