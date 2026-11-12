// Combat Foundation 5.6 deferred beta-only contract tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOwnerProvenanceAudit,createGame3DProvenanceAudit}
  from '../provenanceAudit.mjs';
test('empty page is read only and never reward eligible',()=>{
 const s=summarizeOwnerProvenanceAudit({
  ownerId:'owner1',characterId:'hero1',limit:10,rows:[]});
 assert.equal(s.ok,true);
 assert.deepEqual(s.entries,[]);
 assert.equal(s.readyForRewards,false);
 assert.equal(s.rewardsIssued,false);
});
test('cross character evidence is rejected',()=>{
 const s=summarizeOwnerProvenanceAudit({
  ownerId:'owner1',characterId:'hero1',limit:10,rows:[{
   issued:{owner_id:'stranger',character_id:'hero1',
    item_instance_id:'ee30df00-68ae-4688-80a9-8d8a6813f6d0'}
  }]});
 assert.equal(s.ok,false);
 assert.equal(s.code,'owner_or_item_mismatch');
});
test('invalid page requests never touch DB',async()=>{
 const p=createGame3DProvenanceAudit({
  pool:{connect:async()=>{throw Error('must not connect')}}});
 await assert.rejects(()=>p.page({
  ownerId:'__anon__',characterId:'hero',limit:10}),/Invalid owner/);
 await assert.rejects(()=>p.page({
  ownerId:'owner',characterId:'hero',limit:26}),/Invalid owner/);
});
