import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestLeaseIssuer183,
 QUEST_LEASE_PUBLISH_SQL_183,QUEST_LEASE_REVOKE_SQL_183}
 from '../privateQuestLeaseIssuer183.mjs';

const at=1793668000000;
const lease=Object.freeze({ownerId:'owner183',characterId:'hero183',
 actionSessionId:'qb174-'+'c'.repeat(64),serverSessionId:'world-session-183',
 worldInstanceId:'world-instance-183',worldEpoch:'world-epoch-183',
 leaseNonce:'33333333-3333-4333-8333-333333333333',expiresAtMs:at+10000});
const context=Object.freeze({trustedPrivateWorld:true});
const read=Object.freeze({serverRequestContext:context});
const withStaging=async fn=>{
 const prior=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn();}
 finally{
  if(prior===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=prior;
 }
};
function harness({unavailable=false,rotate=false,revocationMissing=false}={}){
 const commands=[];let reads=0;
 const db={async query(sql,params){
  const statement=sql.trim();
  commands.push({sql:statement,params});
  if(unavailable&&statement.includes('INSERT INTO'))throw Error('PG offline');
  if(statement.startsWith('INSERT INTO')){
   assert.equal(statement,QUEST_LEASE_PUBLISH_SQL_183.trim());
   assert.deepEqual(params,[lease.ownerId,lease.characterId,
    lease.worldInstanceId,lease.worldEpoch,lease.serverSessionId,
    lease.actionSessionId,lease.leaseNonce,lease.expiresAtMs]);
   return {rowCount:1,rows:[{lease_nonce:lease.leaseNonce}]};
  }
  if(statement.startsWith('UPDATE game3d_private_quest_session_fence_183')){
   assert.equal(statement,QUEST_LEASE_REVOKE_SQL_183.trim());
   return revocationMissing?{rowCount:0,rows:[]}:{
    rowCount:1,rows:[{lease_nonce:lease.leaseNonce}]
   };
  }
  return {rowCount:0,rows:[]};
 },release(){commands.push({sql:'RELEASE'})}};
 const issuer=createGame3DPrivateQuestLeaseIssuer183({
  enabled:true,pool:{connect:async()=>db},now:()=>at,
  resolveCurrentWorldLease:async args=>{
   reads++;
   if(args.serverRequestContext!==context)return null;
   return rotate&&reads>1?{...lease,leaseNonce:'44444444-4444-4444-8444-444444444444'}:lease;
  },
 });
 return {issuer,commands,get reads(){return reads}};
}
test('18.3 session issuer refuses nonstaging activation or missing trusted provider',async()=>{
 assert.throws(()=>createGame3DPrivateQuestLeaseIssuer183(),/requires/);
});
test('18.3 private issuer publishes and revokes with separate PG transactions',async()=>{
 await withStaging(async()=>{
  const h=harness();
  assert.equal((await h.issuer.activate(read)).ok,true);
  assert.equal((await h.issuer.revoke(read)).ok,true);
  assert.equal(h.commands.filter(x=>x.sql.includes('INSERT INTO')).length,1);
  assert.equal(h.commands.filter(x=>x.sql.startsWith('UPDATE')).length,1);
  assert.equal(h.commands.filter(x=>x.sql==='COMMIT').length,2);
  assert.equal(h.commands.filter(x=>x.sql==='ROLLBACK').length,0);
  assert.equal(h.commands.some(x=>x.sql.includes('reward')),false);
  await h.issuer.shutdown();
 });
});
test('18.3 private issuer rejects forged backend context, no browser lease row',async()=>{
 await withStaging(async()=>{
  const h=harness();
  assert.equal((await h.issuer.activate({serverRequestContext:{}})).ok,false);
  assert.equal(h.commands.filter(x=>x.sql.startsWith('INSERT')).length,0);
  assert.equal((await h.issuer.activate(read)).ok,true);
  assert.equal((await h.issuer.revoke({serverRequestContext:{}})).ok,false);
  assert.equal((await h.issuer.revoke(read)).ok,true);
  await h.issuer.shutdown();
 });
});
test('18.3 changed world between issuer PG and trust recheck is revoked',async()=>{
 await withStaging(async()=>{
  const h=harness({rotate:true});
  const result=await h.issuer.activate(read);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'world_lease_changed_during_publish');
  assert.equal(h.commands.filter(x=>x.sql.startsWith('UPDATE')).length,1);
  await h.issuer.shutdown();
 });
});
test('18.3 unavailable PG never activates a lease or approves quest authority',async()=>{
 await withStaging(async()=>{
  const h=harness({unavailable:true});
  const result=await h.issuer.activate(read);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'database_lease_publish_failed');
  assert.equal(h.commands.some(x=>x.sql==='ROLLBACK'),true);
  await h.issuer.shutdown();
 });
});

test('18.3 zero-row PG revoke never claims logout or permits a replacement lease',async()=>{
 await withStaging(async()=>{
  const h=harness({revocationMissing:true});
  assert.equal((await h.issuer.activate(read)).ok,true);
  const revoked=await h.issuer.revoke(read);
  assert.equal(revoked.ok,false);
  assert.equal(revoked.reason,'database_revocation_unconfirmed');
  // A second activation is blocked by the still-unconfirmed prior lease.
  const next=await h.issuer.activate(read);
  assert.equal(next.ok,false);
  assert.equal(next.reason,'database_revocation_unconfirmed');
  assert.equal(h.commands.filter(x=>x.sql.includes('INSERT INTO')).length,1);
  const shut=await h.issuer.shutdown();
  assert.equal(shut.ok,false);
  assert.equal(shut.reason,'database_revocation_unconfirmed');
 });
});
