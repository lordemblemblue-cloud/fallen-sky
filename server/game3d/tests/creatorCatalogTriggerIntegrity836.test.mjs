import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CREATOR_TRIGGER_CONTRACT_836,CREATOR_TRIGGER_NAMES_836,
  CREATOR_TRIGGER_SOURCES_836,collectCreatorTriggerContracts836,
  canonicalCreatorTriggerContracts836,verifyCreatorTriggerBodies836,
} from '../creatorCatalogTriggerIntegrity836.mjs';

const SCHEMA='axe_creator_test_integrity';
const sources=CREATOR_TRIGGER_SOURCES_836.map(path=>readFileSync(path,'utf8'));
const approved=canonicalCreatorTriggerContracts836();
function fakeClient(overrides={}){
  const db={
    schema:SCHEMA,rows:CREATOR_TRIGGER_NAMES_836.map(name=>({
      name,body:approved?.[name],language:'plpgsql',
      security_definer:false,argument_count:0,function_schema:SCHEMA,
    })),
    observed:[],throws:false,...overrides,
  };
  return {db,async query(sql,params){
    db.observed.push({sql,params});
    if(db.throws)throw Error('private database credential should never be shown');
    assert.match(sql,/SELECT p\.proname AS name,p\.prosrc AS body/);
    assert.deepEqual(params,[SCHEMA,CREATOR_TRIGGER_NAMES_836]);
    return {rowCount:db.rows.length,rows:db.rows};
  }};
}
const check=client=>verifyCreatorTriggerBodies836(client,SCHEMA);
const changed=(rowIndex,key,value)=>{
  const client=fakeClient();
  client.db.rows[rowIndex]={...client.db.rows[rowIndex],[key]:value};
  return client;
};

test('83.6 reviewed migrations have exactly four unique trigger bodies',()=>{
  assert.equal(CREATOR_TRIGGER_CONTRACT_836,'axe-game3d-trigger-integrity-836-v1');
  assert.equal(CREATOR_TRIGGER_NAMES_836.length,4);
  assert.equal(new Set(CREATOR_TRIGGER_NAMES_836).size,4);
  assert.ok(approved);
  assert.equal(Object.keys(approved).length,4);
  assert.equal(Object.getPrototypeOf(approved),null);
  for(const name of CREATOR_TRIGGER_NAMES_836){
    assert.match(approved[name],/\bBEGIN\b/);
    assert.match(approved[name],/\bEND;/);
  }
});

test('83.6 verified read-only function bodies pass with exact approved sources',async()=>{
  const client=fakeClient();
  const result=await check(client);
  assert.equal(result.ok,true);
  assert.equal(result.verifiedFunctions,4);
  assert.equal(result.readOnly,true);
  assert.equal(client.db.observed.length,1);
  assert.doesNotMatch(client.db.observed[0].sql,
    /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b/);
});

test('83.6 PostgreSQL whitespace normalization allows equivalent formatting',async()=>{
  const client=changed(0,'body','\n'+approved[CREATOR_TRIGGER_NAMES_836[0]]
    .replaceAll(' ','\n  ')+'\n');
  assert.equal((await check(client)).ok,true);
});

test('83.6 no-op mutation of any guard function fails closed',async()=>{
  for(let i=0;i<4;i++){
    const client=changed(i,'body','BEGIN RETURN NEW; END;');
    assert.equal((await check(client)).code,'trigger-function-body-mismatch');
  }
});

test('83.6 owner-supplied replacement that still raises exception but changes semantics fails',async()=>{
  const client=changed(3,'body',
    approved[CREATOR_TRIGGER_NAMES_836[3]]
      .replace('IF TG_OP', 'IF FALSE AND TG_OP'));
  assert.equal((await check(client)).code,'trigger-function-body-mismatch');
});

test('83.6 trigger functions may not be SECURITY DEFINER',async()=>{
  for(let i=0;i<4;i++){
    assert.equal((await check(changed(i,'security_definer',true))).ok,false);
  }
});

test('83.6 wrong PL/pgSQL language or altered function arguments fail',async()=>{
  for(const [key,value] of [['language','sql'],['argument_count',1]]){
    assert.equal((await check(changed(1,key,value))).code,
      'trigger-function-body-mismatch');
  }
});

test('83.6 trigger guard cannot be resolved from another PostgreSQL schema',async()=>{
  assert.equal((await check(changed(2,'function_schema','public'))).code,
    'trigger-function-body-mismatch');
});

test('83.6 missing, duplicated and unexpected PG function names are rejected',async()=>{
  for(const change of ['missing','duplicate','unexpected']){
    const client=fakeClient();
    if(change==='missing')client.db.rows.pop();
    else if(change==='duplicate')client.db.rows[3]={...client.db.rows[0]};
    else client.db.rows[3]={...client.db.rows[3],name:'another_function'};
    assert.equal((await check(client)).ok,false);
  }
});

test('83.6 malformed PostgreSQL schema name or client are denied',async()=>{
  const client=fakeClient();
  assert.equal((await verifyCreatorTriggerBodies836(client,'public')).ok,false);
  assert.equal((await verifyCreatorTriggerBodies836(client,'x;drop')).ok,false);
  assert.equal((await verifyCreatorTriggerBodies836(null,SCHEMA)).ok,false);
  assert.equal(client.db.observed.length,0);
});

test('83.6 PG function inspection errors never leak private driver strings',async()=>{
  const client=fakeClient({throws:true});
  const result=await check(client);
  assert.equal(result.ok,false);
  assert.equal(result.code,'trigger-function-inspection-failed');
  assert.doesNotMatch(JSON.stringify(result),/private database credential/);
});

test('83.6 removing any reviewed SQL source file blocks trust',()=>{
  assert.equal(collectCreatorTriggerContracts836([]),null);
  assert.equal(collectCreatorTriggerContracts836(sources.slice(1)),null);
  assert.equal(collectCreatorTriggerContracts836([sources[0],null,sources[2]]),null);
});

test('83.6 corrupting one of four authored functions blocks the entire contract',()=>{
  for(let i=0;i<CREATOR_TRIGGER_NAMES_836.length;i++){
    const name=CREATOR_TRIGGER_NAMES_836[i];
    const file=i<2?0:i===2?1:2;
    const altered=[...sources];
    altered[file]=altered[file].replace('CREATE FUNCTION '+name+'()',
      'CREATE FUNCTION tampered_guard()');
    assert.equal(collectCreatorTriggerContracts836(altered),null);
  }
});

test('83.6 reject duplicate definitions in authored migration input',()=>{
  const duplicate=[...sources];
  const original=sources[2];
  const from=original.indexOf('CREATE FUNCTION creator_catalog_staff_grant_834_guard()');
  const to=original.indexOf('CREATE TRIGGER creator_catalog_staff_grant_834_immutable');
  assert.ok(from>0&&to>from);
  duplicate[2]=original+'\n'+original.slice(from,to);
  assert.equal(collectCreatorTriggerContracts836(duplicate),null);
});

test('83.6 require real reviewed guard logic, not only function names',()=>{
  assert.match(approved.game3d_creator_catalog_proposal_830_guard,
    /OLD.status<>'pending'/);
  assert.match(approved.game3d_creator_catalog_review_830_guard,
    /RAISE EXCEPTION/);
  assert.match(approved.creator_catalog_intake_audit_833_immutable,
    /RAISE EXCEPTION/);
  assert.match(approved.creator_catalog_staff_grant_834_guard,
    /OLD.revoked_at IS NOT NULL/);
});

test('83.6 source audit performs only SELECT and file reads, no reward issuance',()=>{
  const source=readFileSync('server/game3d/creatorCatalogTriggerIntegrity836.mjs','utf8');
  assert.doesNotMatch(source,/\bapp\.post\(|\bfetch\(|\bnew WebSocket\(/);
  assert.doesNotMatch(source,/\bCREATE TABLE\b|\bDROP TABLE\b|\bALTER TABLE\b/);
  assert.doesNotMatch(source,/game3d_item_issuance|game3d_wallet|awardIndex/);
  assert.match(source,/p\.prosrc AS body/);
  assert.match(source,/p\.prosecdef AS security_definer/);
});
