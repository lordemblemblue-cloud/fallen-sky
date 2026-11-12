import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCreatorCatalogStaffPolicy834} from '../creatorCatalogStaffPolicy834.mjs';
import {createGame3DCreatorTrustedHost833} from '../creatorCatalogTrustedHost833.mjs';

const earlier=process.env.GAME3D_PRIVATE_STAGING_ENV;
before(()=>{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'});
after(()=>{
 if(earlier===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=earlier;
});
const SCHEMA='axe_creator_test_staff';
const CREATOR='staff_creator';
const ROLE='readonly_staff_policy';
function fakePool(){
 const db={
  role:ROLE,owner:'private_policy_dba',superuser:false,
  grants:{
   schema_usage:true,staff_select:true,staff_insert:false,
   staff_update:false,staff_delete:false,proposal_select:false,
   review_select:false,audit_select:false,
   proposal_insert:false,proposal_update:false,proposal_delete:false,
   review_insert:false,review_update:false,review_delete:false,
   audit_insert:false,audit_update:false,audit_delete:false,
   staff_truncate:false,staff_trigger:false,
  },
  entries:[
   {account_id:CREATOR,capability:'creator-catalog:submit',
     expires_at:new Date(160000)},
   {account_id:CREATOR,capability:'creator-catalog:status',
     expires_at:new Date(160000)},
   {account_id:'staff_reviewer',capability:'creator-catalog:review',
     expires_at:new Date(160000)},
  ],
  observed:[],rollbacks:0,releases:0,fail:false,
 };
 return {db,async connect(){
  return {
   async query(sql,params=[]){
    db.observed.push({sql,params});
    if(db.fail&&!sql.startsWith('BEGIN')&&sql!=='ROLLBACK')
      throw Error('private postgres credentials must not escape');
    if(sql.startsWith('BEGIN')||sql==='COMMIT')return {rowCount:0,rows:[]};
    if(sql==='ROLLBACK'){db.rollbacks++;return {rowCount:0,rows:[]}}
    if(sql.startsWith("SELECT set_config('search_path'")){
      if(params[0]!==SCHEMA)throw Error('wrong schema');
      return {rowCount:1,rows:[{}]};
    }
    if(sql.startsWith('SELECT current_user AS role_name,'))
      return {rowCount:1,rows:[{role_name:db.role,superuser:db.superuser}]};
    if(sql.startsWith('SELECT pg_get_userbyid(c.relowner)'))
      return {rowCount:1,rows:[{owner:db.owner}]};
    if(sql.startsWith('SELECT has_schema_privilege('))
      return {rowCount:1,rows:[{...db.grants}]};
    if(sql==='SELECT current_user AS role_name')
      return {rowCount:1,rows:[{role_name:db.role}]};
    if(sql.startsWith('SELECT account_id,capability,expires_at ')){
      const matching=db.entries.filter(entry=>
        entry.account_id===params[0]&&entry.capability===params[1]&&
        entry.revoked_at!==true);
      return {rowCount:matching.length,rows:matching};
    }
    throw Error('unexpected staff SQL in test: '+sql);
   },
   release(){db.releases++},
  };
 }};
}
const create=(pool=fakePool(),overrides={})=>createCreatorCatalogStaffPolicy834({
 pool,schema:SCHEMA,enabled:true,scope:'private-staging',now:()=>100000,
 ...overrides,
});
const request=(policy,operation='submit',accountId=CREATOR,
 serverSessionId='trusted_session_0001')=>
 policy.resolveStaffPermission({accountId,operation,serverSessionId});

test('83.4 policy factory rejects production and unbounded schemas',()=>{
 assert.throws(()=>create(undefined,{enabled:false}),/private disposable/);
 assert.throws(()=>create(undefined,{scope:'public'}),/private disposable/);
 assert.throws(()=>create(undefined,{schema:'public'}),/private disposable/);
 assert.throws(()=>create(undefined,{schema:'test;DROP TABLE'}),/private disposable/);
 assert.throws(()=>create(undefined,{pool:null}),/private disposable/);
});

test('83.4 permission reads are blocked until explicit role readiness',async()=>{
 const pool=fakePool(),policy=create(pool);
 assert.equal((await request(policy)).allowed,false);
 assert.equal(pool.db.observed.length,0);
});

test('83.4 reader proves separate non-superuser, non-owner SELECT-only role',async()=>{
 const pool=fakePool(),policy=create(pool);
 const ready=await policy.assertReady();
 assert.equal(ready.ok,true);
 assert.equal(ready.roleName,ROLE);
 assert.equal(policy.version,'axe-game3d-staff-policy-834-v1');
 assert.equal(policy.privateServerOnly,true);
 assert.equal(policy.publicRouteInstalled,false);
 assert.equal(policy.grantsWritable,false);
 assert.equal(policy.rewardsIssued,false);
 assert.equal(pool.db.observed.some(x=>
  x.sql.includes("set_config('search_path', $1, true)")&&
  x.params[0]===SCHEMA),true);
});

test('83.4 server-owned separate submit and status grants are explicit',async()=>{
 const policy=create();await policy.assertReady();
 const submit=await request(policy);
 const status=await request(policy,'status');
 assert.equal(submit.allowed,true);
 assert.equal(status.allowed,true);
 assert.equal(submit.identitySource,'server-owned-creator-catalog-policy');
 assert.equal(submit.accountId,CREATOR);
 assert.equal(submit.capability,'creator-catalog:submit');
 assert.equal((await request(policy,'review')).allowed,false);
});

test('83.4 reviewer grant cannot be turned into creator submission',async()=>{
 const policy=create();await policy.assertReady();
 assert.equal((await request(policy,'review','staff_reviewer')).allowed,true);
 assert.equal((await request(policy,'submit','staff_reviewer')).allowed,false);
 assert.equal((await request(policy,'status','staff_reviewer')).allowed,false);
});

test('83.4 expired or revoked grants cannot authorize staff actions',async()=>{
 const pool=fakePool(),policy=create(pool);await policy.assertReady();
 pool.db.entries[0].revoked_at=true;
 assert.equal((await request(policy)).allowed,false);
 pool.db.entries[0].revoked_at=false;
 pool.db.entries[0].expires_at=new Date(99999);
 assert.equal((await request(policy)).allowed,false);
});

test('83.4 revocation is checked on every request, not cached',async()=>{
 const pool=fakePool(),policy=create(pool);await policy.assertReady();
 assert.equal((await request(policy)).allowed,true);
 pool.db.entries[0].revoked_at=true;
 assert.equal((await request(policy)).allowed,false);
});

test('83.4 changing database reader role after readiness denies all requests',async()=>{
 const pool=fakePool(),policy=create(pool);await policy.assertReady();
 pool.db.role='privileged_role';
 assert.equal((await request(policy)).allowed,false);
});

test('83.4 superuser and grant-table owner roles cannot initialize',async()=>{
 for(const key of ['superuser','owner']){
  const pool=fakePool();
  if(key==='superuser')pool.db.superuser=true;
  else pool.db.owner=ROLE;
  const policy=create(pool);
  assert.equal((await policy.assertReady()).ok,false);
  assert.equal((await request(policy)).allowed,false);
 }
});

test('83.4 staff INSERT, UPDATE, DELETE and access to other catalog tables block readiness',async()=>{
 for(const flag of ['staff_insert','staff_update','staff_delete',
  'staff_truncate','staff_trigger','proposal_select','review_select',
  'audit_select','proposal_insert','proposal_update','proposal_delete',
  'review_insert','review_update','review_delete',
  'audit_insert','audit_update','audit_delete']){
  const pool=fakePool();pool.db.grants[flag]=true;
  assert.equal((await create(pool).assertReady()).ok,false,flag);
 }
});

test('83.4 insufficient schema or staff table SELECT rights block readiness',async()=>{
 for(const key of ['schema_usage','staff_select']){
  const pool=fakePool();pool.db.grants[key]=false;
  assert.equal((await create(pool).assertReady()).ok,false,key);
 }
});

test('83.4 unauthorized session and unknown capability fail closed before SQL',async()=>{
 const pool=fakePool(),policy=create(pool);await policy.assertReady();
 const initial=pool.db.observed.length;
 for(const args of [
   {accountId:'__anon__',operation:'submit',serverSessionId:'trusted_session'},
   {accountId:'staff_creator',operation:'publish',serverSessionId:'trusted_session'},
   {accountId:'staff_creator',operation:'review',serverSessionId:'bad'},
 ]){
  assert.equal((await policy.resolveStaffPermission(args)).allowed,false);
 }
 assert.equal(pool.db.observed.length,initial);
});

test('83.4 SQL query parameters never interpolate account or capability',async()=>{
 const pool=fakePool(),policy=create(pool);await policy.assertReady();
 await request(policy);
 const sql=pool.db.observed.filter(x=>
  x.sql.includes('FROM game3d_creator_catalog_staff_grant_834'));
 assert.equal(sql.length,1);
 assert.match(sql[0].sql,/account_id=\$1 AND capability=\$2/);
 assert.deepEqual(sql[0].params,[CREATOR,'creator-catalog:submit']);
 assert.doesNotMatch(sql[0].sql,/staff_creator/);
});

test('83.4 database error rolls back and never leaks connection details',async()=>{
 const pool=fakePool(),policy=create(pool);await policy.assertReady();
 pool.db.fail=true;
 const result=await request(policy);
 assert.equal(result.allowed,false);
 assert.doesNotMatch(JSON.stringify(result),/private postgres credentials/);
 assert.ok(pool.db.rollbacks>=1);
});

test('83.4 removed staging environment disables staff authorization',async()=>{
 const policy=create();await policy.assertReady();
 const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='production';
  assert.equal((await request(policy)).allowed,false);
 }finally{process.env.GAME3D_PRIVATE_STAGING_ENV=previous}
});

test('83.4 manual policy migration restricts grants and disallows browser writes',()=>{
 const sql=readFileSync('server/game3d/sql/055_creator_catalog_staff_grants_834.sql','utf8');
 assert.match(sql,/CREATE TABLE game3d_creator_catalog_staff_grant_834/);
 assert.match(sql,/UNIQUE\(account_id,capability\)/);
 assert.match(sql,/creator_catalog_staff_grant_834_immutable/);
 assert.match(sql,/REVOKE ALL ON game3d_creator_catalog_staff_grant_834 FROM PUBLIC/);
 assert.match(sql,/expires_at<=created_at\+INTERVAL '30 days'/);
 assert.match(sql,/RETURNS trigger LANGUAGE plpgsql AS \$grant_guard\$/);
 assert.match(sql,/granted_by <> account_id/);
 assert.match(sql,/END;\s*\$grant_guard\$;/);
 assert.doesNotMatch(sql,/\bGRANT\s+\w+\s+ON\s+.*\s+TO\s+(PUBLIC|authenticated)/i);
});

test('83.4 staff read module never writes grants or touches gameplay',()=>{
 const src=readFileSync('server/game3d/creatorCatalogStaffPolicy834.mjs','utf8');
 assert.doesNotMatch(src,/\bINSERT INTO\b|\bUPDATE\s+game3d_creator_catalog_staff_grant_834\b|\bDELETE FROM\b/);
 assert.doesNotMatch(src,/app\.post\(|\bfetch\(|new WebSocket\(/);
 assert.doesNotMatch(src,/game3d_item_issuance|game3d_wallet|awardIndex/);
 assert.match(src,/READ COMMITTED READ ONLY/);
 assert.match(src,/creator-catalog:/);
});

function privateFakeHostPool(role){
 return {async connect(){return{
  async query(sql,values=[]){
   if(sql.startsWith('SELECT current_user AS role_name'))
    return {rowCount:1,rows:[{role_name:role,superuser:false}]};
   if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')
    return {rowCount:0,rows:[]};
   if(sql.startsWith("SELECT set_config('search_path'")){
    if(values[0]!==SCHEMA)throw Error('Wrong schema');
    return {rowCount:1,rows:[{}]};
   }
   if(sql.includes('LIMIT 0'))return {rowCount:0,rows:[]};
   throw Error('Unexpected host schema check SQL: '+sql);
  },
  release(){},
 }}};
}
function mockPolicy(roleName='readonly_staff_policy',ok=true){
 return Object.freeze({
  version:'axe-game3d-staff-policy-834-v1',privateServerOnly:true,
  publicRouteInstalled:false,productionReady:false,grantsWritable:false,
  async assertReady(){return {ok,roleName}},
  async resolveStaffPermission(){return {
   allowed:false,identitySource:'no-staff-policy-grant',
  }},
 });
}
function privateHost(staffPolicy){
 return createGame3DCreatorTrustedHost833({
  enabled:true,scope:'private-staging',schema:SCHEMA,
  stagingPool:privateFakeHostPool('catalog_writer'),
  auditPool:privateFakeHostPool('audit_writer'),
  staffPolicy,
  resolveAuthenticatedSubject:async()=>null,
  verifySessionActive:async()=>false,
 });
}

test('83.4 host can initialize against independently checked third staff reader role',async()=>{
 const host=privateHost(mockPolicy());
 const result=await host.initialize();
 assert.equal(result.ok,true);
 assert.equal(result.privateReady,true);
 assert.equal(host.publicRouteInstalled,false);
 assert.equal(host.catalogPublished,false);
 assert.equal(host.eligibleForIssuance,false);
 const denied=await host.execute({
  operation:'submit',rawBody:'{}',serverContext:{role:'admin'},
 });
 assert.equal(denied.ok,false);
 assert.equal(denied.code,'session-not-authorized');
});

test('83.4 host refuses when staff role collides with staging or audit role',async()=>{
 for(const roleName of ['catalog_writer','audit_writer']){
  const host=privateHost(mockPolicy(roleName,true));
  const result=await host.initialize();
  assert.equal(result.ok,false);
  assert.equal(result.code,'staff-policy-role-isolation-unverified');
  assert.equal((await host.execute({})).code,'private-staging-not-initialized');
 }
});

test('83.4 host refuses missing policy database readiness',async()=>{
 const host=privateHost(mockPolicy('readonly_staff_policy',false));
 const result=await host.initialize();
 assert.equal(result.ok,false);
 assert.equal(result.code,'staff-policy-role-isolation-unverified');
});

test('83.4 host rejects policy and separate legacy grant resolver simultaneously',()=>{
 assert.throws(()=>createGame3DCreatorTrustedHost833({
  enabled:true,scope:'private-staging',schema:SCHEMA,
  stagingPool:privateFakeHostPool('catalog_writer'),
  auditPool:privateFakeHostPool('audit_writer'),
  staffPolicy:mockPolicy(),
  resolveStaffPermission:async()=>({allowed:true}),
  resolveAuthenticatedSubject:async()=>null,
  verifySessionActive:async()=>false,
 }),/independent staff permission authority/);
});

test('83.4 host rejects forged policy facade lacking correct private contract',()=>{
 assert.throws(()=>privateHost({...mockPolicy(),publicRouteInstalled:true}),
  /independent staff permission authority/);
 assert.throws(()=>privateHost({...mockPolicy(),grantsWritable:true}),
  /independent staff permission authority/);
});

test('83.4 verified policy can be wired to the existing trusted host as separate authority',()=>{
 const code=readFileSync('server/game3d/creatorCatalogTrustedHost833.mjs','utf8');
 assert.match(code,/staffPolicy\.assertReady\(\)/);
 assert.match(code,/staffPolicy\?staffPolicy\.resolveStaffPermission/);
 assert.match(code,/staff-policy-role-isolation-unverified/);
 assert.match(code,/permission\.identitySource!=='server-owned-creator-catalog-policy'/);
});
