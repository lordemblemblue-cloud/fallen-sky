import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateSessionAuthority149,
 createGame3DTrustedSessionAdapter149}
 from '../trustedWorldSessions149.mjs';
import {digestPrivateWorldBearer141} from '../trustedWorldSession141.mjs';
import {readFileSync} from 'node:fs';

const ownerId='owner149',characterId='hero149',instanceId='world-149-a';
const scope={ownerId,characterId,instanceId};
function fakeDB({authorized=true,hasSeed=true,inserted=true,
 authenticated=true}={}){
 const calls=[],queries=[];let releases=0;
 const pool={connect:async()=>({
  async query(sql,args=[]){
   calls.push(sql);queries.push(args);
   if(sql.includes('SELECT s.instance_id FROM game3d_private_world_seed_142'))
    return {rowCount:hasSeed?1:0,rows:hasSeed?[{instance_id:instanceId}]:[]};
   if(sql.includes('SELECT owner_id FROM game3d_trusted_character'))
    return {rowCount:1,rows:[{owner_id:ownerId}]};
   if(sql.includes('ON CONFLICT (token_sha256) DO NOTHING'))
    return {rowCount:inserted?1:0,rows:inserted?[{token_sha256:args[0]}]:[]};
   if(sql.includes('SELECT sess.token_sha256 FROM game3d_private_world_session_141'))
    return {rowCount:authenticated?1:0,
     rows:authenticated?[{token_sha256:args[0]}]:[]};
   if(sql.includes('UPDATE game3d_private_world_session_141'))
    return {rowCount:1,rows:[]};
   return {rowCount:0,rows:[]};
  },release:()=>{releases++},
 })};
 const audit=[];
 const auth=async o=>{audit.push(o);return authorized};
 return {pool,auth,calls,queries,audit,get releases(){return releases}};
}
test('14.9 requires privileged issuer with private PG and strict scopes',async()=>{
 assert.throws(()=>createGame3DPrivateSessionAuthority149(),
  /requires_server_issuer_and_postgresql/);
 const f=fakeDB();
 const a=createGame3DPrivateSessionAuthority149({
  pool:f.pool,authorizeTrustedSession:f.auth});
 for(const request of [
  {...scope,ttlSeconds:5},{...scope,ttlSeconds:901},
  {...scope,ttlSeconds:'300'},{...scope,ownerId:'__anon__'},
  {...scope,instanceId:'broken'},{...scope,characterId:'with spaces'},
 ]){
  await assert.rejects(a.issue(request),/invalid_issue_scope/);
 }
 assert.equal(f.calls.length,0);
});
test('14.9 privileged issue rotates in one SERIALIZABLE transaction',async()=>{
 const f=fakeDB(),a=createGame3DPrivateSessionAuthority149({
  pool:f.pool,authorizeTrustedSession:f.auth});
 const out=await a.issue({...scope,ttlSeconds:120});
 assert.equal(out.ok,true);
 assert.equal(out.token.length,43);
 assert.equal(out.tokenSha256,digestPrivateWorldBearer141(out.token));
 assert.equal(out.instanceId,instanceId);
 assert.equal(out.rewardsIssued,false);
 assert.equal(f.calls[0],'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.match(f.calls[1],/FOR UPDATE OF c/);
 assert.match(f.calls[2],/world_instance_id=\$3/);
 assert.match(f.calls[3],/ON CONFLICT \(token_sha256\) DO NOTHING/);
 assert.deepEqual(f.queries[3].slice(1),[
  ownerId,characterId,120,instanceId]);
 assert.equal(f.calls[4],'COMMIT');
 assert.equal(f.releases,1);
 assert.equal(f.audit[0].operation,'issue_private_world_session');
 assert.equal(f.audit[0].instanceId,instanceId);
 const second=await a.issue(scope);
 assert.notEqual(second.token,out.token);
 assert.notEqual(second.tokenSha256,out.tokenSha256);
 assert.equal(f.releases,2);
});
test('14.9 denies issuance before SQL, rejects absent seed and digest collision',async()=>{
 const no=fakeDB({authorized:false});
 const a=createGame3DPrivateSessionAuthority149({
  pool:no.pool,authorizeTrustedSession:no.auth});
 await assert.rejects(a.issue(scope),/issue_not_authorized/);
 assert.equal(no.calls.length,0);
 for(const opts of [{hasSeed:false},{inserted:false}]){
  const f=fakeDB(opts),authority=createGame3DPrivateSessionAuthority149({
   pool:f.pool,authorizeTrustedSession:f.auth});
  await assert.rejects(authority.issue(scope),
   /sealed_world_or_character_unavailable|token_digest_collision/);
  assert.equal(f.calls.at(-1),'ROLLBACK');
  assert.equal(f.releases,1);
 }
});
test('14.9 revocation is serialized with issuance and cannot cross world',async()=>{
 const f=fakeDB(),a=createGame3DPrivateSessionAuthority149({
  pool:f.pool,authorizeTrustedSession:f.auth});
 const digest='c'.repeat(64);
 const r=await a.revoke({...scope,tokenSha256:digest});
 assert.equal(r.ok,true);
 assert.equal(r.revokedCount,1);
 assert.equal(r.rewardsIssued,false);
 assert.equal(f.calls[0],'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.match(f.calls[1],/FOR UPDATE/);
 assert.match(f.calls[2],/world_instance_id=\$3/);
 assert.deepEqual(f.queries[2],[ownerId,characterId,instanceId,digest]);
 assert.equal(f.calls[3],'COMMIT');
 assert.equal(f.releases,1);
 assert.equal(f.audit[0].operation,'revoke_private_world_session');
 await assert.rejects(a.revoke({...scope,tokenSha256:'x'}),
  /invalid_revoke_scope/);
 const denied=fakeDB({authorized:false});
 await assert.rejects(createGame3DPrivateSessionAuthority149({
  pool:denied.pool,authorizeTrustedSession:denied.auth}).revoke(scope),
  /revoke_not_authorized/);
 assert.equal(denied.calls.length,0);
});
test('14.9 verifier accepts digest only for same pinned character and world',async()=>{
 const f=fakeDB(),v=createGame3DTrustedSessionAdapter149({
  pool:f.pool,scope});
 const token='X'.repeat(43);
 const subject=await v.authenticateRequest({
  headers:{authorization:'Bearer '+token}});
 assert.equal(subject?.authenticated,true);
 assert.equal(subject?.identitySource,'trusted-server-session');
 assert.equal(subject?.accountId,ownerId);
 assert.equal(subject?.characterId,characterId);
 assert.deepEqual(f.queries[0],[digestPrivateWorldBearer141(token),
  ownerId,characterId,instanceId]);
 assert.match(f.calls[0],/sess.world_instance_id=\$4/);
 assert.match(f.calls[0],/seed.character_revision=ch.revision/);
 assert.match(f.calls[0],/sess.revoked_at IS NULL/);
 assert.match(f.calls[0],/clock_timestamp\(\)/);
 assert.equal(f.releases,1);
 assert.equal(await v.authenticateRequest({headers:{
  authorization:'Bearer bad'}}),null);
 assert.equal(f.calls.length,1);
 const denied=fakeDB({authenticated:false});
 const bad=createGame3DTrustedSessionAdapter149({pool:denied.pool,scope});
 assert.equal(await bad.authenticateRequest({
  headers:{authorization:'Bearer '+token}}),null);
});
test('14.9 migration is private, nullable for 14.1 and scoped to seed',()=>{
 const sql=readFileSync(new URL(
  '../sql/034_combat149_instance_bound_sessions.sql',import.meta.url),'utf8');
 assert.match(sql,/ADD COLUMN world_instance_id text/);
 assert.match(sql,/REFERENCES game3d_private_world_seed_142/);
 assert.match(sql,/world_instance_id IS NOT NULL/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
});
