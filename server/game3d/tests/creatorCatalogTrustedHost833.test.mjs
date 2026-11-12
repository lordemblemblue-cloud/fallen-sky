import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCreatorCatalogPgAudit833} from '../creatorCatalogPgAudit833.mjs';
import {createGame3DCreatorTrustedHost833} from '../creatorCatalogTrustedHost833.mjs';

const oldStage=process.env.GAME3D_PRIVATE_STAGING_ENV;
before(()=>{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'});
after(()=>{
 if(oldStage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=oldStage;
});
const ID='11111111-1111-4111-8111-111111111111';
const SCHEMA='axe_creator_test_staff';
const CREATOR=Object.freeze({session:'staff_creator'});
const REVIEWER=Object.freeze({session:'staff_reviewer'});
const proposal=()=>({schema:'axe-game3d-creator-proposal-829-v1',
 source:{boxId:'staff-box',slotIndex:12},
 blueprint:{id:'staff-gear',kind:'equipment',name:'Draft Staff Gear',
   rarity:'Epic',slot:'weapon',levelMin:1,levelMax:40,
   stats:{strength:25},description:'Unpublished test draft',
   dropSource:'test-only',dropChance:0}});
const request=(operation,data)=>JSON.stringify({
 schema:'axe-game3d-creator-intake-832-v1',
 ...(operation==='submit'?{proposal:data||proposal()}:
   operation==='status'?{proposalId:data||ID}:
   {proposalId:data||ID,disposition:'accept-for-curation',
     note:'Manual review for later curation only'}),
});
const auditRecord=(overrides={})=>({
 schema:'axe-game3d-creator-intake-832-v1',requestId:ID,
 event:'intake-attempt',operation:'submit',principalId:'creator_staff',
 occurredAtMs:100000, ...overrides,
});
const result=rows=>({rowCount:rows.length,rows});
function fakePool(role,audit=false){
 const db={role,audit,attempted:[],releases:0,rollbacks:0,
  auditRows:[],proposals:new Map(),reviews:new Map(),failAudit:false,
  failSchema:false,failPostAudit:false};
 const pool={db,async connect(){
   // Simulate BEGIN/COMMIT/ROLLBACK snapshots to catch accidental writes
   // after a failed pre-mutation audit.
   let state;
   return {async query(sql,values=[]){
     db.attempted.push({sql,values});
     if(sql.startsWith('SELECT current_user AS role_name'))
       return result([{role_name:role,superuser:false}]);
     if(sql.startsWith('BEGIN')){
       state={auditRows:[...db.auditRows],
         proposals:new Map(db.proposals),reviews:new Map(db.reviews)};
       return result([]);
     }
     if(sql==='COMMIT'){
       if(state){
         db.auditRows=state.auditRows;
         db.proposals=state.proposals;
         db.reviews=state.reviews;
       }
       state=null;return result([]);
     }
     if(sql==='ROLLBACK'){db.rollbacks++;state=null;return result([])}
     if(sql.startsWith("SELECT set_config('search_path'")){
       if(values[0]!==SCHEMA)throw Error('Wrong staging schema');
       return result([]);
     }
     if(sql.includes('LIMIT 0')){
       if(db.failSchema)throw Error('Audit schema missing');
       return result([]);
     }
     if(audit){
       if(sql.startsWith('INSERT INTO game3d_creator_catalog_intake_audit_833')){
         if(db.failAudit||(db.failPostAudit&&db.auditRows.length>=1))
           throw Error('Disconnected audit database');
         const [auditId,requestId,event,operation,principalId,when,id,code]=values;
         if(state.auditRows.some(r=>r.requestId===requestId&&r.event===event))
           return result([]);
         const entry={auditId,requestId,event,operation,principalId,when,
           proposalId:id,code};
         state.auditRows.push(entry);
         return result([entry]);
       }
       throw Error('Unexpected audit SQL');
     }
     if(sql.startsWith('INSERT INTO game3d_creator_catalog_proposal_830')){
       const [id,creatorId,digest,payload]=values;
       const existing=[...state.proposals.values()].find(r=>
         r.creator_id===creatorId&&r.proposal_digest===digest);
       if(existing)return result([]);
       const row={proposal_id:id,creator_id:creatorId,
         proposal_digest:digest,payload:JSON.parse(payload),
         status:'pending',revision:0};
       state.proposals.set(id,row);
       return result([row]);
     }
     if(sql.startsWith('SELECT proposal_id,creator_id,proposal_digest,payload,status')){
       let row;
       if(sql.includes('WHERE creator_id=$1 AND proposal_digest=$2'))
         row=[...state.proposals.values()].find(r=>
           r.creator_id===values[0]&&r.proposal_digest===values[1]);
       else{
         row=state.proposals.get(values[0]);
         if(sql.includes('AND creator_id=$2')&&row?.creator_id!==values[1])
           row=undefined;
       }
       return result(row?[{...row}]:[]);
     }
     if(sql.startsWith('UPDATE game3d_creator_catalog_proposal_830')){
       const [id,status]=values,old=state.proposals.get(id);
       if(!old||old.status!=='pending')return result([]);
       const changed={...old,status,revision:1};
       state.proposals.set(id,changed);
       return result([changed]);
     }
     if(sql.startsWith('INSERT INTO game3d_creator_catalog_review_830')){
       const [reviewId,proposalId,digest,reviewerId,disposition,note]=values;
       if(state.reviews.has(proposalId))throw Error('Duplicate review');
       state.reviews.set(proposalId,{reviewId,proposalId,digest,reviewerId,
         disposition,note});
       return result([]);
     }
     throw Error('Unexpected staging SQL: '+sql.slice(0,100));
   },release(){db.releases++}};
 }};
 return pool;
}
function make(overrides={}){
 const stagingPool=fakePool('restricted_catalog_writer');
 const auditPool=fakePool('restricted_audit_writer',true);
 let time=100000,revoked=false,permissionRevoked=false;
 const resolveAuthenticatedSubject=async context=>{
   if(context!==CREATOR&&context!==REVIEWER)return null;
   return {authenticated:true,identitySource:'trusted-server-session',
    accountId:context===CREATOR?'creator_staff':'reviewer_staff',
    serverSessionId:context===CREATOR?'real_session_creator':'real_session_review',
    expiresAtMs:time+60000};
 };
 const verifySessionActive=async()=>!revoked;
 const resolveStaffPermission=async({accountId,operation})=>{
   const authorized=!permissionRevoked&&
     (accountId==='creator_staff'&&['submit','status'].includes(operation)||
      accountId==='reviewer_staff'&&operation==='review');
   return {allowed:authorized,accountId,identitySource:
     'server-owned-creator-catalog-policy',
     capability:'creator-catalog:'+operation};
 };
 const options={
   stagingPool,auditPool,schema:SCHEMA,
   resolveAuthenticatedSubject,verifySessionActive,
   resolveStaffPermission,now:()=>time,
   enabled:true,scope:'private-staging',...overrides,
 };
 const host=createGame3DCreatorTrustedHost833(options);
 const send=(operation,serverContext=CREATOR,data)=>
   host.execute({operation,rawBody:request(operation,data),serverContext});
 return {host,send,stagingPool,auditPool,
   expire:()=>{time+=120000},
   revoke:()=>{revoked=true},
   removeGrant:()=>{permissionRevoked=true}};
}
test('83.3 audit writer and host refuse public/production defaults',()=>{
 assert.throws(()=>createCreatorCatalogPgAudit833(),/restricted disposable/);
 assert.throws(()=>make({enabled:false}),/dedicated staging/);
 assert.throws(()=>make({scope:'public'}),/dedicated staging/);
 assert.throws(()=>make({schema:'public'}),/dedicated staging/);
 assert.throws(()=>make({schema:'a;drop table'}),/dedicated staging/);
});
test('83.3 writer rejects fields not in an exact metadata whitelist',async()=>{
 const audit=createCreatorCatalogPgAudit833({
   pool:fakePool('restricted_audit_writer',true),
   schema:SCHEMA,enabled:true,scope:'private-staging'});
 for(const item of [
   {...auditRecord(),rawBody:'private item'},
   {...auditRecord(),role:'admin'},
   {...auditRecord(),notes:'secret'},
   {...auditRecord(),requestId:'not-a-uuid'},
   {...auditRecord(),principalId:'__anon__'},
   {...auditRecord(),operation:'publish'},
   {...auditRecord(),event:'mint-item'},
   {...auditRecord(),occurredAtMs:-1},
   {...auditRecord(),code:'INVALID SQL'},
 ]){
   assert.equal(await audit.auditEvent(item),false);
 }
});
test('83.3 audit writer saves only immutable metadata without payload',async()=>{
 const pool=fakePool('restricted_audit_writer',true);
 const audit=createCreatorCatalogPgAudit833({
   pool,schema:SCHEMA,enabled:true,scope:'private-staging'});
 assert.equal(await audit.assertSchema(),true);
 assert.equal(await audit.auditEvent(auditRecord()),true);
 assert.equal(pool.db.auditRows.length,1);
 const serialized=JSON.stringify(pool.db.auditRows[0]);
 assert.doesNotMatch(serialized,/Draft Staff Gear|strength|session|note/);
 assert.equal(pool.db.auditRows[0].principalId,'creator_staff');
 assert.equal(pool.db.auditRows[0].operation,'submit');
});
test('83.3 duplicated audit event never counts as fresh authorization',async()=>{
 const pool=fakePool('restricted_audit_writer',true);
 const audit=createCreatorCatalogPgAudit833({
   pool,schema:SCHEMA,enabled:true,scope:'private-staging'});
 assert.equal(await audit.auditEvent(auditRecord()),true);
 assert.equal(await audit.auditEvent(auditRecord()),false);
 assert.equal(pool.db.auditRows.length,1);
});
test('83.3 audit database failure causes rollback and false acknowledgment',async()=>{
 const pool=fakePool('restricted_audit_writer',true);pool.db.failAudit=true;
 const audit=createCreatorCatalogPgAudit833({
   pool,schema:SCHEMA,enabled:true,scope:'private-staging'});
 assert.equal(await audit.auditEvent(auditRecord()),false);
 assert.equal(pool.db.auditRows.length,0);
 assert.ok(pool.db.rollbacks>=1);
 assert.ok(pool.db.releases>=1);
});
test('83.3 private host is not usable until explicit schema readiness',async()=>{
 const {host,send}=make();
 assert.equal((await send('submit')).code,'private-staging-not-initialized');
 assert.equal((await host.initialize()).ok,true);
 assert.equal(host.privateServerOnly,true);
 assert.equal(host.publicRouteInstalled,false);
 assert.equal(host.productionReady,false);
 assert.equal(host.catalogPublished,false);
});
test('83.3 separate staging and audit connection pools are mandatory',()=>{
 const pool=fakePool('same');
 assert.throws(()=>make({stagingPool:pool,auditPool:pool}),/dedicated staging/);
});
test('83.3 initialization rejects identical DB roles and superusers',async()=>{
 const {host}=make({
   auditPool:fakePool('restricted_catalog_writer',true),
 });
 assert.equal((await host.initialize()).code,'staging-role-isolation-unverified');
 const pool=fakePool('privileged',true);
 const original=pool.connect.bind(pool);
 pool.connect=async()=>{
   const c=await original(),query=c.query.bind(c);
   c.query=async(sql,values)=>{
     if(sql.startsWith('SELECT current_user AS role_name'))
       return result([{role_name:'privileged',superuser:true}]);
     return query(sql,values);
   };return c;
 };
 const privileged=make({auditPool:pool});
 assert.equal((await privileged.host.initialize()).ok,false);
});
test('83.3 trusted creator can submit once after audit and DB readiness',async()=>{
 const {host,send,stagingPool,auditPool}=make();
 assert.equal((await host.initialize()).ok,true);
 const answer=await send('submit');
 assert.equal(answer.ok,true);
 assert.equal(answer.status,'pending');
 assert.equal(answer.created,true);
 assert.equal(answer.eligibleForIssuance,false);
 assert.equal(answer.catalogPublished,false);
 assert.equal(answer.rewardsIssued,false);
 assert.equal(answer.auditRecorded,true);
 assert.equal(stagingPool.db.proposals.size,1);
 assert.equal(auditPool.db.auditRows.length,2);
 assert.equal(auditPool.db.auditRows[0].event,'intake-attempt');
});
test('83.3 identical creator submission returns prior staging proposal',async()=>{
 const {host,send,stagingPool}=make();await host.initialize();
 const a=await send('submit'),b=await send('submit');
 assert.equal(a.ok,true);assert.equal(b.ok,true);
 assert.equal(b.created,false);assert.equal(a.proposalId,b.proposalId);
 assert.equal(stagingPool.db.proposals.size,1);
});
test('83.3 status reads need their own staff capability',async()=>{
 const {host,send}=make();await host.initialize();
 const saved=await send('submit');
 const status=await send('status',CREATOR,saved.proposalId);
 assert.equal(status.ok,true);
 assert.equal(status.status,'pending');
 assert.equal((await send('status',REVIEWER,saved.proposalId)).code,
   'session-not-authorized');
});
test('83.3 trusted reviewer decision is a non-issuing audit record',async()=>{
 const {host,send,stagingPool,auditPool}=make();await host.initialize();
 const saved=await send('submit');
 const decided=await send('review',REVIEWER,saved.proposalId);
 assert.equal(decided.ok,true);
 assert.equal(decided.status,'curation-only');
 assert.equal(decided.disposition,'accept-for-curation');
 assert.equal(decided.catalogPublished,false);
 assert.equal(decided.rewardsIssued,false);
 assert.equal(decided.eligibleForIssuance,false);
 assert.equal(stagingPool.db.reviews.size,1);
 assert.equal(auditPool.db.auditRows.length,4);
});
test('83.3 creator cannot self-review or gain reviewer permission from role flag',async()=>{
 const {host,send,stagingPool}=make();await host.initialize();
 const saved=await send('submit');
 const denied=await send('review',CREATOR,saved.proposalId);
 assert.equal(denied.ok,false);
 const spoof=await host.execute({
   operation:'review',rawBody:request('review',saved.proposalId),
   serverContext:{role:'admin',isDeveloper:true},
 });
 assert.equal(spoof.ok,false);
 assert.equal(stagingPool.db.reviews.size,0);
});
test('83.3 revoked session denies further operations before stage mutation',async()=>{
 const {host,send,revoke,stagingPool}=make();await host.initialize();
 revoke();
 assert.equal((await send('submit')).code,'session-not-authorized');
 assert.equal(stagingPool.db.proposals.size,0);
});
test('83.3 revoked staff grant denies staging operations',async()=>{
 const {host,send,removeGrant}=make();await host.initialize();
 removeGrant();
 assert.equal((await send('submit')).code,'session-not-authorized');
});
test('83.3 audit write failure blocks the staging transaction entirely',async()=>{
 const {host,send,stagingPool,auditPool}=make();await host.initialize();
 auditPool.db.failAudit=true;
 const res=await send('submit');
 assert.equal(res.code,'audit-unavailable');
 assert.equal(stagingPool.db.proposals.size,0);
});
test('83.3 missing manually applied audit migration blocks initialization',async()=>{
 const {host,auditPool,send,stagingPool}=make();
 auditPool.db.failSchema=true;
 const result=await host.initialize();
 assert.equal(result.ok,false);
 assert.equal(result.code,'staging-schema-unavailable');
 assert.equal((await send('submit')).code,'private-staging-not-initialized');
 assert.equal(stagingPool.db.proposals.size,0);
});

test('83.3 post-commit audit failure marks reconciliation, never false rollback',async()=>{
 const {host,send,stagingPool,auditPool}=make();await host.initialize();
 auditPool.db.failPostAudit=true;
 const result=await send('submit');
 assert.equal(result.ok,true);
 assert.equal(result.auditRecorded,false);
 assert.equal(result.requiresAuditReconciliation,true);
 assert.equal(stagingPool.db.proposals.size,1);
 assert.equal(auditPool.db.auditRows.length,1);
});

test('83.3 active host fails closed if environment switches from staging',async()=>{
 const {host,send}=make();await host.initialize();
 const prior=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='production';
  assert.equal((await send('submit')).code,'staging-disabled');
 }finally{process.env.GAME3D_PRIVATE_STAGING_ENV=prior}
});
test('83.3 shutdown permanently disables host operations',async()=>{
 const {host,send}=make();await host.initialize();
 host.shutdown();
 assert.equal((await send('submit')).code,'staging-disabled');
 assert.equal((await host.initialize()).code,'staging-disabled');
});
test('83.3 audit SQL is non-public and append-only, with no issuance rights',()=>{
 const sql=readFileSync(
   'server/game3d/sql/054_creator_catalog_intake_audit_833.sql','utf8');
 assert.match(sql,/game3d_creator_catalog_intake_audit_833/);
 assert.match(sql,/UNIQUE \(request_id,event\)/);
 assert.match(sql,/RETURNS trigger LANGUAGE plpgsql AS \$audit_immutable\$/);
 assert.match(sql,/creator_catalog_intake_audit_833_no_update_delete/);
 assert.match(sql,/REVOKE ALL ON game3d_creator_catalog_intake_audit_833 FROM PUBLIC/);
 assert.doesNotMatch(sql,/game3d_item_issuance|game3d_wallet|game3d_inventory_slot/);
});
test('83.3 audit migration has balanced named PL/pgSQL delimiters',()=>{
 const sql=readFileSync(
  'server/game3d/sql/054_creator_catalog_intake_audit_833.sql','utf8');
 assert.equal((sql.match(/\$audit_guard\$/g)||[]).length,2);
 assert.equal((sql.match(/\$audit_immutable\$/g)||[]).length,2);
 assert.match(sql,/DO \$audit_guard\$[\s\S]*?END;\s*\$audit_guard\$;/);
 assert.match(sql,/RETURNS trigger LANGUAGE plpgsql AS \$audit_immutable\$[\s\S]*?END;\s*\$audit_immutable\$;/);
});

test('83.3 audit schema cannot retain player secrets or creator draft payloads',()=>{
 const sql=readFileSync(
  'server/game3d/sql/054_creator_catalog_intake_audit_833.sql','utf8');
 const begin=sql.indexOf('CREATE TABLE game3d_creator_catalog_intake_audit_833 (');
 const end=sql.indexOf('\nCREATE INDEX creator_catalog_intake_audit_principal_833');
 assert.ok(begin>=0&&end>begin);
 const columns=sql.slice(begin,end);
 assert.doesNotMatch(columns,/\b(raw_body|auth_token|session_token|password|review_note|item_instance_id|player_data|blueprint|payload)\b/i);
 assert.match(columns,/UNIQUE \(request_id,event\)/);
});

test('83.3 source has no public transport, route, loot issuer or migration DDL',()=>{
 const source=readFileSync(
  'server/game3d/creatorCatalogTrustedHost833.mjs','utf8');
 assert.doesNotMatch(source,/\bapp\.post\(|\bfetch\(|\bnew WebSocket\(/);
 assert.doesNotMatch(source,/game3d_item_issuance|game3d_wallet|awardIndex/);
 assert.doesNotMatch(source,/\bCREATE TABLE\b|\bALTER TABLE\b/);
 assert.match(source,/publicRouteInstalled:false/);
 assert.match(source,/resolveStaffPermission/);
 assert.match(source,/poolRole/);
});
