import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DWorldSeedProvisioner148}
 from '../trustedWorldSeedProvisioner148.mjs';
import {WOLFVEIL_MAP_FINGERPRINT}
 from '../mapCollision.mjs';
const ownerId='owner148',characterId='hero148';
function fixture({authorized=true,revision='4',xp='100',saveRow=null}={}){
 const calls=[];let released=0;
 const database={
  connect:async()=>({
   query:async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.startsWith('SELECT owner_id,character_id,revision::text'))
     return {rowCount:revision===null?0:1,
      rows:revision===null?[]:[{
       owner_id:ownerId,character_id:characterId,
       revision,xp_total:xp,
      }]};
    if(sql.startsWith('INSERT INTO game3d_private_world_seed_142')){
     if(saveRow===false)return {rowCount:0,rows:[]};
     return {rowCount:1,rows:[{
      instance_id:args[0],owner_id:args[1],
      character_id:args[2],character_revision:String(args[8]),
     }]};
    }
    return {rowCount:0,rows:[]};
   },
   release:()=>{released++},
  }),
 };
 let counter=0;
 const auth=[];
 const writer=createGame3DWorldSeedProvisioner148({
  pool:database,
  authorizeTrustedProvision:async action=>{
   auth.push(action);return authorized;
  },
  makeInstanceId:()=> 'world-148-test-'+(++counter),
 });
 return {writer,calls,auth,get releases(){return released}};
}
test('14.8 private server creates immutable seed from committed XP only',async()=>{
 const f=fixture();
 const outcome=await f.writer.provision({ownerId,characterId});
 assert.equal(outcome.ok,true);
 assert.equal(outcome.level,2);
 assert.equal(outcome.characterRevision,4);
 assert.equal(outcome.rewardsIssued,false);
 assert.equal(outcome.mapFingerprint,WOLFVEIL_MAP_FINGERPRINT);
 assert.equal(outcome.provenance,'trusted_server_world_provisioner');
 assert.deepEqual(f.auth,[{
  operation:'create_private_world_seed',ownerId,characterId,
  blueprintId:'wolfveil-patrol-v1',
 }]);
 assert.equal(f.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.match(f.calls[1].sql,/FROM game3d_trusted_character.*FOR SHARE/);
 assert.equal(f.calls[2].args[0],outcome.instanceId);
 assert.equal(f.calls[2].args[8],4);
 assert.match(f.calls[2].sql,/ON CONFLICT \(instance_id\) DO NOTHING/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
 assert.equal(f.releases,1);
 const actors=JSON.parse(f.calls[2].args[7]);
 assert.equal(actors.enemies.length,1);
 assert.equal(actors.enemies[0].isBoss,false);
 assert.equal(actors.enemies[0].isQuestSpawn,false);
 assert.equal(actors.player.hp,actors.player.stats.maxHP);
 assert.equal(actors.enemies[0].hp,actors.enemies[0].stats.maxHP);
 assert.equal(typeof actors.player.position.x,'number');
 assert.equal(f.writer.publicHTTPInstalled,false);
});
test('14.8 never queries database without a trusted authorizer',async()=>{
 const f=fixture({authorized:false});
 await assert.rejects(f.writer.provision({ownerId,characterId}),
  /provision_not_authorized/);
 assert.equal(f.calls.length,0);
 assert.equal(f.releases,0);
});
test('14.8 rejects unsupported blueprint, invalid characters, bad XP',async()=>{
 const f=fixture();
 for(const req of [
  {ownerId:'__anon__',characterId},
  {ownerId,characterId:'bad character'},
  {ownerId,characterId,blueprintId:'arbitrary-boss'},
 ]){
  await assert.rejects(f.writer.provision(req),/untrusted_provision_request/);
 }
 assert.equal(f.calls.length,0);
 const n=fixture({xp:'not-a-real-total'});
 await assert.rejects(n.writer.provision({ownerId,characterId}),
  /Invalid committed XP total/);
 assert.equal(n.calls.at(-1).sql,'ROLLBACK');
 assert.equal(n.releases,1);
});
test('14.8 immutable instance key collision and absent character roll back',async()=>{
 const collision=fixture({saveRow:false});
 await assert.rejects(collision.writer.provision({ownerId,characterId}),
  /instance_conflict_or_provision_failed/);
 assert.equal(collision.calls.at(-1).sql,'ROLLBACK');
 const absent=fixture({revision:null});
 await assert.rejects(absent.writer.provision({ownerId,characterId}),
  /trusted_character_missing/);
 assert.equal(absent.calls.at(-1).sql,'ROLLBACK');
});
test('14.8 accepts only bounded server-provisioned instance identifiers',async()=>{
 const f=fixture(),p=createGame3DWorldSeedProvisioner148({
  pool:{connect:async()=>{throw Error('should_not_query')}},
  authorizeTrustedProvision:async()=>true,
  makeInstanceId:()=> 'not valid!',
 });
 await assert.rejects(p.provision({ownerId,characterId}),
  /invalid_server_instance_id/);
 assert.throws(()=>createGame3DWorldSeedProvisioner148({
  pool:null,authorizeTrustedProvision:async()=>true,
 }),/private_provisioner_requires_server_authority/);
 assert.equal(f.calls.length,0);
});
