import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditCreatorCatalogPgReadiness835,
  CREATOR_PG_READINESS_TABLES_835} from '../creatorCatalogPgReadiness835.mjs';
import {canonicalCreatorTriggerContracts836}
  from '../creatorCatalogTriggerIntegrity836.mjs';

const oldStage=process.env.GAME3D_PRIVATE_STAGING_ENV;
const SCHEMA='axe_creator_test_readiness';
const NAMES=[
 'game3d_creator_catalog_proposal_830',
 'game3d_creator_catalog_review_830',
 'game3d_creator_catalog_intake_audit_833',
 'game3d_creator_catalog_staff_grant_834',
];
const TRIGGERS=[
 'game3d_creator_catalog_proposal_830_immutable',
 'game3d_creator_catalog_review_830_immutable',
 'creator_catalog_intake_audit_833_no_update_delete',
 'creator_catalog_staff_grant_834_immutable',
];
const FUNCTIONS=[
 'game3d_creator_catalog_proposal_830_guard',
 'game3d_creator_catalog_review_830_guard',
 'creator_catalog_intake_audit_833_immutable',
 'creator_catalog_staff_grant_834_guard',
];
const EXPECTED_BODIES=canonicalCreatorTriggerContracts836();
const OPS=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE',
 'REFERENCES','TRIGGER'];
const RIGHTS={
 staging:[['SELECT','INSERT','UPDATE'],['SELECT','INSERT'],[],[]],
 audit:[[],[],['SELECT','INSERT'],[]],
 policy:[[],[],[],['SELECT']],
};
const rows=items=>({rowCount:items.length,rows:items});
function fakePool(role){
 const db={role,identity:role+'_readonly',version:160000,
  superuser:false,bypass_rls:false,create_db:false,create_role:false,
  schemaUsage:true,schemaCreate:false,
  owners:NAMES.map(()=>'staging_dba'),
  missingTable:-1,tableKind:'r',publicGrant:-1,
  missingTrigger:-1,disabledTrigger:-1,wrongTriggerTable:-1,
  wrongTriggerType:-1,publicFunctionGrant:-1,wrongTriggerFunction:-1,
  tamperedFunction:-1,functionSecurityDefiner:-1,
  rights:RIGHTS[role].map(x=>[...x]),
  queries:[],rollbacks:0,releases:0,
  failSql:false,
 };
 const pool={db,async connect(){
  return {async query(sql,params=[]){
    db.queries.push({sql,params});
    if(sql.startsWith('BEGIN')){
      if(!sql.includes('READ ONLY'))throw Error('Read-only transaction required');
      return rows([]);
    }
    if(sql==='COMMIT')return rows([]);
    if(sql==='ROLLBACK'){db.rollbacks++;return rows([])}
    if(db.failSql)throw Error('private password must never leave database');
    if(sql.startsWith("SELECT set_config('search_path'")){
      if(params[0]!==SCHEMA)throw Error('wrong schema');
      return rows([{}]);
    }
    if(sql.includes("current_setting('server_version_num')"))
      return rows([{version:db.version,role_name:db.identity,
        superuser:db.superuser,bypass_rls:db.bypass_rls,
        create_db:db.create_db,create_role:db.create_role}]);
    if(sql.startsWith('SELECT has_schema_privilege'))
      return rows([{can_use:db.schemaUsage,can_create:db.schemaCreate}]);
    if(sql.startsWith('SELECT c.relname AS name,c.relkind AS kind,'))
      return rows(NAMES.flatMap((name,i)=>db.missingTable===i?[]:
        [{name,kind:db.tableKind,owner:db.owners[i]}]));
    if(sql.startsWith('SELECT p.proname AS name,p.prosrc AS body,'))
      return rows(FUNCTIONS.map((name,i)=>({
        name,body:db.tamperedFunction===i?'BEGIN RETURN NEW; END;':
          EXPECTED_BODIES[name],
        security_definer:db.functionSecurityDefiner===i,
        argument_count:0,language:'plpgsql',function_schema:SCHEMA,
      })));
    if(sql.includes('FROM pg_proc'))
      return rows(FUNCTIONS.map((name,i)=>({
        name,public_grants:db.publicFunctionGrant===i?1:0,
      })));
    if(sql.includes('aclexplode('))
      return rows(NAMES.map((name,i)=>({name,
        public_grants:db.publicGrant===i?1:0})));
    if(sql.startsWith('SELECT has_table_privilege(')){
      const index=NAMES.indexOf(params[1]);
      if(index<0)throw Error('not recognized table');
      const wanted=new Set(db.rights[index]);
      return rows([Object.fromEntries(OPS.map((op,i)=>[
        'p'+i,wanted.has(op),
      ]))]);
    }
    if(sql.includes('FROM pg_trigger'))
      return rows(TRIGGERS.flatMap((name,i)=>
        db.missingTrigger===i?[]:[{
          name,table_name:NAMES[db.wrongTriggerTable===i?(i+1)%4:i],
          function_name:FUNCTIONS[db.wrongTriggerFunction===i?(i+1)%4:i],
          function_schema:SCHEMA,
          enabled:db.disabledTrigger===i?'D':'O',
          trigger_type:db.wrongTriggerType===i?7:27,
        }]));
    throw Error('Unexpected SQL: '+sql.slice(0,100));
  },release(){db.releases++}};
 }};
 return pool;
}
function bundle(){
 const stagingPool=fakePool('staging');
 const auditPool=fakePool('audit');
 const policyPool=fakePool('policy');
 return {stagingPool,auditPool,policyPool,
  schema:SCHEMA,enabled:true,scope:'private-staging'};
}
const inspect=value=>auditCreatorCatalogPgReadiness835(value);

test('83.5 verifier requires explicit private staging and three distinct pools',async()=>{
 for(const patch of [
  {enabled:false},{scope:'public'},{schema:'public'},
  {schema:'axe_creator_test_x;DROP'},{policyPool:null},
 ]){
  const result=await inspect({...bundle(),...patch});
  assert.equal(result.ok,false);
  assert.equal(result.code,'explicit-disposable-three-role-staging-required');
 }
 const same=bundle();same.auditPool=same.stagingPool;
 assert.equal((await inspect(same)).ok,false);
});
test('83.5 exact three restricted database roles and all migrations pass read-only',async()=>{
 const connections=bundle();
 const result=await inspect(connections);
 assert.equal(result.ok,true);
 assert.equal(result.rolesVerified,true);
 assert.equal(result.tableCount,4);
 assert.equal(result.immutableTriggersVerified,4);
 assert.equal(result.publicTableGrants,0);
 assert.equal(result.catalogPublished,false);
 assert.equal(result.eligibleForIssuance,false);
 assert.equal(result.rewardsIssued,false);
 for(const key of ['stagingPool','auditPool','policyPool']){
  const q=connections[key].db.queries.map(x=>x.sql);
  assert.ok(q.some(x=>x.includes('REPEATABLE READ READ ONLY')));
  assert.ok(q.some(x=>x.includes("set_config('search_path', $1, true)")));
  assert.equal(q.some(x=>/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT)\b/i.test(x)),false);
  assert.ok(connections[key].db.releases>0);
 }
});
test('83.5 staging role must not have staff or audit privileges',async()=>{
 const b=bundle();
 b.stagingPool.db.rights[2].push('SELECT');
 assert.equal((await inspect(b)).code,'role-table-rights-unsafe');
});
test('83.5 audit role may not read private staff grants',async()=>{
 const b=bundle();b.auditPool.db.rights[3].push('SELECT');
 assert.equal((await inspect(b)).code,'role-table-rights-unsafe');
});
test('83.5 policy role may only SELECT staff grants, not mutate them',async()=>{
 for(const op of ['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']){
  const b=bundle();b.policyPool.db.rights[3].push(op);
  assert.equal((await inspect(b)).code,'role-table-rights-unsafe',op);
 }
});
test('83.5 missing necessary staging or audit privileges block readiness',async()=>{
 for(const [role,table,op] of [
  ['stagingPool',0,'INSERT'],['stagingPool',1,'INSERT'],
  ['auditPool',2,'INSERT'],['policyPool',3,'SELECT'],
 ]){
  const b=bundle();
  b[role].db.rights[table]=b[role].db.rights[table].filter(x=>x!==op);
  assert.equal((await inspect(b)).code,'role-table-rights-unsafe',role+op);
 }
});
test('83.5 public table grants block readiness even if role ACL looks correct',async()=>{
 for(let i=0;i<4;i++){
  const b=bundle();b.policyPool.db.publicGrant=i;
  assert.equal((await inspect(b)).code,'public-table-grants-detected');
 }
});
test('83.5 missing one of the three migrations tables is rejected',async()=>{
 for(let i=0;i<4;i++){
  const b=bundle();b.stagingPool.db.missingTable=i;
  assert.equal((await inspect(b)).code,'migration-tables-unverified');
 }
});
test('83.5 missing immutable triggers cannot be called deployment ready',async()=>{
 for(let i=0;i<4;i++){
  const b=bundle();b.auditPool.db.missingTrigger=i;
  assert.equal((await inspect(b)).code,'immutable-triggers-missing');
 }
});
test('83.5 disabled, wrong-table or non-UPDATE/DELETE triggers fail readiness',async()=>{
 for(const key of ['disabledTrigger','wrongTriggerTable','wrongTriggerType']){
  for(let i=0;i<4;i++){
   const b=bundle();b.policyPool.db[key]=i;
   assert.equal((await inspect(b)).code,'immutable-triggers-missing',key+i);
  }
 }
});
test('83.5 trigger functions cannot retain PUBLIC EXECUTE privilege',async()=>{
 for(let i=0;i<4;i++){
  const b=bundle();b.auditPool.db.publicFunctionGrant=i;
  assert.equal((await inspect(b)).code,
    'public-trigger-function-grants-detected');
 }
});
test('83.6 trigger name bound to a different guard function is insufficient',async()=>{
 for(let i=0;i<4;i++){
  const b=bundle();b.stagingPool.db.wrongTriggerFunction=i;
  assert.equal((await inspect(b)).code,'immutable-triggers-missing');
 }
});
test('83.6 substituted PostgreSQL function body fails global tri-role readiness',async()=>{
 for(let i=0;i<4;i++){
  const b=bundle();b.auditPool.db.tamperedFunction=i;
  assert.equal((await inspect(b)).code,'trigger-function-body-mismatch');
 }
});
test('83.6 SECURITY DEFINER guard cannot be called immutable readiness',async()=>{
 const b=bundle();b.policyPool.db.functionSecurityDefiner=0;
 assert.equal((await inspect(b)).code,'trigger-function-body-mismatch');
});
test('83.5 table ownership blocks use by non-independent database roles',async()=>{
 const b=bundle();b.policyPool.db.owners[3]=b.policyPool.db.identity;
 assert.equal((await inspect(b)).code,'migration-tables-unverified');
});
test('83.5 public schema CREATE privilege is rejected for any role',async()=>{
 const b=bundle();b.auditPool.db.schemaCreate=true;
 assert.equal((await inspect(b)).code,'schema-permissions-unsafe');
});
test('83.5 superuser, RLS bypass, CREATEDB, CREATEROLE and old PG fail',async()=>{
 for(const [field,value] of [
  ['superuser',true],['bypass_rls',true],['create_db',true],
  ['create_role',true],['version',150000],
 ]){
  const b=bundle();b.stagingPool.db[field]=value;
  assert.equal((await inspect(b)).code,'privileged-or-unsupported-role',field);
 }
});
test('83.5 independently supplied pools must resolve to distinct SQL role identities',async()=>{
 const b=bundle();b.policyPool.db.identity=b.auditPool.db.identity;
 assert.equal((await inspect(b)).code,'database-role-separation-failed');
});
test('83.5 database exceptions never expose secrets and rollback read-only transaction',async()=>{
 const b=bundle();b.stagingPool.db.failSql=true;
 const result=await inspect(b);
 assert.equal(result.ok,false);
 assert.equal(result.code,'read-only-database-check-failed');
 assert.doesNotMatch(JSON.stringify(result),/private password/);
 assert.ok(b.stagingPool.db.rollbacks>0);
 assert.ok(b.stagingPool.db.releases>0);
});
test('83.5 checker cannot mint items, modify staff grants or apply DDL',()=>{
 const script=readFileSync('server/game3d/creatorCatalogPgReadiness835.mjs','utf8');
 assert.doesNotMatch(script,/\bapp\.post\(|\bfetch\(|\bnew WebSocket\(/);
 assert.doesNotMatch(script,/\bCREATE TABLE\b|\bALTER TABLE\b|\bDROP TABLE\b/);
 assert.doesNotMatch(script,/game3d_item_issuance|game3d_inventory_slot|game3d_wallet/);
 assert.match(script,/REPEATABLE READ READ ONLY/);
 assert.match(script,/public_grants/);
 assert.match(script,/has_table_privilege/);
});
test('83.5 migration names and trigger protections match canonical SQL sources',()=>{
 const paths=[
  'server/game3d/sql/053_creator_catalog_private_staging_830.sql',
  'server/game3d/sql/054_creator_catalog_intake_audit_833.sql',
  'server/game3d/sql/055_creator_catalog_staff_grants_834.sql',
 ];
 const joined=paths.map(x=>readFileSync(x,'utf8')).join('\n');
 assert.deepEqual(CREATOR_PG_READINESS_TABLES_835,NAMES);
 for(const name of TRIGGERS)assert.ok(joined.includes(name),name);
 for(const name of FUNCTIONS)assert.match(joined,new RegExp('REVOKE ALL ON FUNCTION '+name+'\\(\\)\\s+FROM PUBLIC'));
 for(const name of NAMES)assert.ok(joined.includes('REVOKE ALL ON '+name+' FROM PUBLIC'));
});
