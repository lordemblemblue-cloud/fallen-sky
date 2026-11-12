// Combat Foundation 5.5 source-only contracts. Defer all execution to beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewCharacterEquipmentSnapshot,createGame3DEquipmentSnapshotReader
} from '../characterEquipmentSnapshot.mjs';

const base={ownerId:'owner1',characterId:'hero1',expectedRevision:2};
test('read-only empty equipment snapshot is deterministic and blocks rewards',()=>{
  const result=reviewCharacterEquipmentSnapshot({
    ...base,rows:[{revision:2,equipment_slot:null,equipped_item_id:null}],
  });
  assert.equal(result.ok,true);
  assert.equal(result.equipped.length,0);
  assert.match(result.digest,/^[0-9a-f]{64}$/);
  assert.equal(result.loadoutEligible,false);
  assert.equal(result.rewardsIssued,false);
  assert.equal(result.competitiveBonusesEnabled,false);
});
test('stale revision and corrupt slots fail closed',()=>{
  assert.equal(reviewCharacterEquipmentSnapshot({...base,
    rows:[{revision:1,equipment_slot:null}]}).ok,false);
  assert.equal(reviewCharacterEquipmentSnapshot({...base,
    rows:[{revision:2,equipment_slot:'weapon',equipped_item_id:'madeup',
      issued:{owner_id:'owner1',character_id:'hero1',
      item_instance_id:'madeup'}}]}).ok,false);
  assert.equal(reviewCharacterEquipmentSnapshot({...base,
    rows:[{revision:2,equipment_slot:null},
      {revision:2,equipment_slot:null}]}).ok,false);
  assert.equal(reviewCharacterEquipmentSnapshot({...base,rows:[]}).ok,false);
});
test('backend reader rejects mismatched account identity before touching PG',async()=>{
  const pool={connect:async()=>{throw Error('no database access allowed')}};
  const reader=createGame3DEquipmentSnapshotReader({pool});
  await assert.rejects(()=>reader.inspect({
    ownerId:'__anon__',characterId:'hero',expectedRevision:2,
  }),/Invalid equipment snapshot request/);
  await assert.rejects(()=>reader.inspect({
    ownerId:'owner',characterId:'hero',expectedRevision:-1,
  }),/Invalid equipment snapshot request/);
});
