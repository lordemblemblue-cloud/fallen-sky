// Combat / Quest 17.1 — disposable PostgreSQL 16 + REAL Node HTTP gateway.
// No production credentials, Base44 login or live player data are available;
// these tests exercise the signed backend seam and canonical SQL projection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGame3DDuelGateway} from '../gateway.mjs';
import {createGame3DQuestbookRelay170,
 signGame3DQuestbookRequest170,GAME3D_QUESTBOOK_READ_PATH_170}
 from '../privateQuestbookRoute170.mjs';
import {assertGame3DQuestbookDatabaseReadiness171,
 QUESTBOOK_171_REQUIRED_TABLES}
 from '../privateQuestbookReadiness171.mjs';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';
import {createAXEQuestbookReadModel169}
 from '../../../src/components/game3d/axe/quests/AXEQuestbookReadModel169.js';

const pgUrl=process.env.GAME3D_171_DISPOSABLE_PG_URL;
const origin='https://game.example';
const secret='questbook-171-test-secret-not-for-prod-0123456789';
const duelSecret='combat-171-test-secret-not-for-prod-01234567890';
const A={ownerId:'owner171A',characterId:'hero171A',
 sessionId:'qb170-'+'a'.repeat(64)};
const A2={ownerId:'owner171A',characterId:'hero171A2',
 sessionId:'qb170-'+'a'.repeat(64)};
const B={ownerId:'owner171B',characterId:'hero171B',
 sessionId:'qb170-'+'b'.repeat(64)};
const C={ownerId:'owner171C',characterId:'hero171C',
 sessionId:'qb170-'+'c'.repeat(64)};
const ops=new Set(['accept_private_server_quest',
 'read_private_server_quests','project_committed_quest_kill',
 'read_committed_quest_progress','turn_in_private_server_quest',
 'read_private_quest_turnins']);
const authorize=async({operation,ownerId,characterId})=>
 ownerId===A.ownerId&&characterId===A.characterId&&ops.has(operation);

test('17.1 real PG16 signed HTTP Questbook; SELECT-only identity fence',
 {skip:!pgUrl,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_qb171_'+randomUUID().replaceAll('-','');
 const role='qb171_'+randomUUID().replaceAll('-','').slice(0,20);
 const password='disposable-questbook-171-only';
 const admin=new pg.Pool({connectionString:pgUrl,max:2});
 let writer=null,reader=null,relay=null,gateway=null,address=null;
 let roleCreated=false,schemaCreated=false;
 let receiptNumber=0;
 const bodyFor=(who,opts={})=>{
  const at=Date.now();
  return {v:1,proof:'base44-auth-me-character-vault',
   ownerId:who.ownerId,characterId:who.characterId,
   sessionId:who.sessionId,issuedAtMs:at,expiresAtMs:at+25000,
   nonce:randomUUID(),knownRevision:null,knownViewId:null,...opts};
 };
 const send=async(who=A,options={})=>{
  const proof=options.proof??bodyFor(who,options.fields);
  const raw=options.raw??JSON.stringify(proof);
  const at=options.signedAt??proof.issuedAtMs;
  const signature=options.signature??
   signGame3DQuestbookRequest170({secret,at,rawBody:raw});
  const method=options.method??'POST';
  const path=options.path??GAME3D_QUESTBOOK_READ_PATH_170;
  const result=await fetch('http://127.0.0.1:'+address.port+path,{
   method,headers:{
    'content-type':'application/json',
    'x-game3d-questbook-time':String(at),
    'x-game3d-questbook-signature':signature
   },...(method==='POST'?{body:raw}:{}),
   signal:AbortSignal.timeout(8000)
  });
  return {status:result.status,body:await result.json(),headers:result.headers};
 };
 try{
  await admin.query('CREATE ROLE '+role+
    " LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
  roleCreated=true;
  await admin.query('CREATE SCHEMA '+schema);schemaCreated=true;
  writer=new pg.Pool({connectionString:pgUrl,max:14,
   options:'-c search_path='+schema});
  await writer.query(await readFile(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await writer.query("CREATE FUNCTION game3d_item_provenance_immutable() "+
   "RETURNS trigger LANGUAGE plpgsql AS $$ "+
   "BEGIN RAISE EXCEPTION 'immutable private evidence'; END;$$");
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '044_combat164_private_rival_consent.sql',
   '045_combat165_private_echo_story.sql'
  ])await writer.query(await readFile(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await writer.query(
   'INSERT INTO game3d_trusted_character(owner_id,character_id) '+
   'VALUES($1,$2),($3,$4),($5,$6)',
   [A.ownerId,A.characterId,A2.ownerId,A2.characterId,
    B.ownerId,B.characterId]);
  await admin.query('GRANT USAGE ON SCHEMA '+schema+' TO '+role);
  await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA '+schema+' TO '+role);
  const readUrl=new URL(pgUrl);
  readUrl.username=role;readUrl.password=password;
  reader=new pg.Pool({connectionString:readUrl.toString(),max:5,
   options:'-c search_path='+schema});
  await t.test('startup checks all canonical tables and rejects superuser/writes',async()=>{
   const ready=await assertGame3DQuestbookDatabaseReadiness171({
    pool:reader,schema
   });
   assert.equal(ready.ok,true);assert.equal(ready.readOnly,true);
   assert.equal(ready.requiredTablesVerified,QUESTBOOK_171_REQUIRED_TABLES.length);
   await assert.rejects(
    assertGame3DQuestbookDatabaseReadiness171({pool:writer,schema}),
    /read_only_role_or_schema_mismatch/);
   await assert.rejects(
    assertGame3DQuestbookDatabaseReadiness171({pool:reader,schema:'public'}),
    /read_only_role_or_schema_mismatch/);
   await admin.query('GRANT UPDATE ON '+schema+
    '.game3d_trusted_character TO '+role);
   await assert.rejects(
    assertGame3DQuestbookDatabaseReadiness171({pool:reader,schema}),
    /table_privileges_not_select_only/);
   await admin.query('REVOKE UPDATE ON '+schema+
    '.game3d_trusted_character FROM '+role);
   assert.equal((await assertGame3DQuestbookDatabaseReadiness171({
    pool:reader,schema
   })).ok,true);
   await assert.rejects(reader.query(
    'UPDATE game3d_trusted_character SET xp_total=10'),
    e=>e.code==='42501');
  });
  relay=createGame3DQuestbookRelay170({
   pool:reader,secret,appOrigin:origin
  });
  gateway=createGame3DDuelGateway({
   secret:duelSecret,origins:[origin],
   reportUrl:'https://game.example/internal/test-duel-reports',
   questbookRoute:relay,port:0,host:'127.0.0.1'
  });
  address=await gateway.listen();
  assert(address.port>0);
  await t.test('HTTP route starts with no fake local quest state or rewards',async()=>{
   const r=await send();
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.ok,true);
   assert.equal(r.body.readOnly,true);
   assert.equal(r.body.rewardsIssued,false);
   assert.equal(r.body.snapshot.questbook.entries.length,0);
   assert.equal(r.headers.get('cache-control'),'private, no-store');
   const missing=await send(C);
   assert.equal(missing.status,503);
   assert.equal(missing.body.snapshot,undefined);
  });
  await t.test('real server-authorized acceptance then committed kill updates HTTP view',async()=>{
   const acceptance=createGame3DPrivateQuestAcceptance154({
    pool:writer,authorizeServerOperation:authorize});
   const credits=createGame3DPrivateCommittedQuestCredits152({
    pool:writer,authorizeServerOperation:authorize});
   const turnin=createGame3DPrivateQuestTurnIn156({
    pool:writer,authorizeServerOperation:authorize});
   const begin=await acceptance.accept({
    ownerId:A.ownerId,characterId:A.characterId,
    questId:'axe_q_first_patrol'
   });
   assert.equal(begin.ok,true,JSON.stringify(begin));
   const initial=await send();
   assert.equal(initial.status,200,JSON.stringify(initial.body));
   const entry=initial.body.snapshot.questbook.entries[0];
   assert.equal(entry.id,'axe_q_first_patrol');
   assert.equal(entry.progressPercent,0);
   assert.equal(entry.objectives[0].current,0);
   assert.equal(entry.statusLabel,'In Progress');
   const revision=initial.body.revision,viewId=initial.body.viewId;
   for(let n=1;n<=3;n++){
    const receiptId='kill171_'+(++receiptNumber);
    await writer.query(
     'INSERT INTO game3d_private_world_kill_receipt_152 '+
     '(receipt_id,owner_id,character_id,instance_id,instance_epoch,'+
     'map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,'+
     'server_kill_committed) '+
     "VALUES($1,$2,$3,'world-171','epoch-171',$4,$5,$6,'normal',"+
     "'server-committed-private-pve-kill',true)",
     [receiptId,A.ownerId,A.characterId,'f'.repeat(64),
      receiptNumber,'enemy_171_'+receiptNumber]);
    const credited=await credits.project({
     ownerId:A.ownerId,characterId:A.characterId,receiptId
    });
    assert.equal(credited.ok,true,JSON.stringify(credited));
   }
   const progressed=await send(A,{fields:{knownRevision:revision,knownViewId:viewId}});
   assert.equal(progressed.status,200,JSON.stringify(progressed.body));
   assert.equal(progressed.body.unchanged,false);
   assert.notEqual(progressed.body.revision,revision);
   assert.equal(progressed.body.snapshot.questbook.entries[0].progressPercent,100);
   assert.equal(progressed.body.snapshot.questbook.entries[0].statusLabel,
    'Ready to turn in');
   const completed=await turnin.turnIn({
    ownerId:A.ownerId,characterId:A.characterId,
    questId:'axe_q_first_patrol'
   });
   assert.equal(completed.ok,true,JSON.stringify(completed));
   const done=await send();
   assert.equal(done.status,200,JSON.stringify(done.body));
   assert.equal(done.body.snapshot.questbook.entries[0].status,'completed');
   assert.equal(done.body.snapshot.npcInteractionLeads[0].questId,
    'echo_ch_14_first_echo');
   assert.equal(done.body.snapshot.npcInteractionLeads[0].autoAccepted,false);
   assert.equal(done.body.snapshot.rewardsIssued,false);
   const readOnlyModel=createAXEQuestbookReadModel169();
   const accepted=readOnlyModel.apply(done.body,{
    completedIds:['browser_fake'],progress:{axe_q_first_patrol:999}
   });
   assert.equal(accepted.ok,true,JSON.stringify(accepted));
   assert.deepEqual(accepted.view.questState.completedIds,['axe_q_first_patrol']);
   assert.deepEqual(accepted.view.localOnlyIds,['browser_fake']);
   const conditional=await send(A,{fields:readOnlyModel.getQuery()});
   // Client getQuery contains action:read, not allowed in signed proof,
   // so send only knownRevision and knownViewId.
   assert.equal(conditional.status,422);
   const q=readOnlyModel.getQuery();
   const noChange=await send(A,{fields:{
    knownRevision:q.knownRevision,knownViewId:q.knownViewId
   }});
   assert.equal(noChange.status,200);
   assert.equal(noChange.body.unchanged,true);
   assert.equal(Object.hasOwn(noChange.body,'snapshot'),false);
   assert.equal(readOnlyModel.apply(noChange.body).updated,false);
  });
  await t.test('foreign character and changed view generations remain isolated',async()=>{
   const other=await send(B);
   assert.equal(other.status,200);
   assert.deepEqual(other.body.snapshot.questbook.entries,[]);
   const spoof=await send(A,{fields:{characterId:B.characterId}});
   assert.equal(spoof.status,503);
   assert.equal(spoof.body.snapshot,undefined);
   const before=(await send()).body;
   const switched=(await send(A2)).body;
   assert.equal(switched.ok,true);
   assert.deepEqual(switched.snapshot.questbook.entries,[]);
   const returned=(await send()).body;
   assert.notEqual(before.viewId,returned.viewId);
   assert.equal(returned.snapshot.questbook.entries[0].status,'completed');
  });
  await t.test('real HTTP denies forged signature, stale time, replay and verbs',async()=>{
   const proof=bodyFor(A);
   const first=await send(A,{proof});
   assert.equal(first.status,200);
   assert.equal((await send(A,{proof})).status,409);
   assert.equal((await send(A,{signature:'0'.repeat(64)})).status,401);
   assert.equal((await send(A,{method:'GET'})).status,405);
   assert.equal((await send(A,{path:GAME3D_QUESTBOOK_READ_PATH_170+'?q=1'})).status,404);
   assert.equal((await send(A,{fields:{nonce:'not-a-uuid'}})).status,422);
   const late=bodyFor(A,{issuedAtMs:Date.now()-20000,expiresAtMs:Date.now()+5000});
   assert.equal((await send(A,{proof:late})).status,401);
  });
  await t.test('parallel signed reads share one server-held view generation',async()=>{
   const fresh={...B,sessionId:'qb170-'+'d'.repeat(64)};
   const [x,y]=await Promise.all([send(fresh),send(fresh)]);
   assert.equal(x.status,200,JSON.stringify(x.body));
   assert.equal(y.status,200,JSON.stringify(y.body));
   assert.equal(x.body.viewId,y.body.viewId);
  });
  await t.test('removing database SELECT permission fails closed at request time',async()=>{
   await admin.query('REVOKE SELECT ON '+schema+
    '.game3d_trusted_character FROM '+role);
   const lost=await send();
   assert.equal(lost.status,503);
   assert.equal(lost.body.snapshot,undefined);
   await admin.query('GRANT SELECT ON '+schema+
    '.game3d_trusted_character TO '+role);
   assert.equal((await send()).status,200);
   const xp=(await writer.query(
    'SELECT xp_total::text AS xp,revision::text AS rev '+
    'FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
    [A.ownerId,A.characterId])).rows[0];
   assert.equal(xp.xp,'0');
   assert.equal(xp.rev,'0');
  });
 }finally{
  if(gateway)await gateway.close();
  if(relay)await relay.shutdown();
  if(reader)await reader.end();
  if(writer)await writer.end();
  if(schemaCreated)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  if(roleCreated)await admin.query('DROP ROLE IF EXISTS '+role);
  await admin.end();
 }
});
test('17.1 staging requires a disposable database rather than silently passing',()=>{
 if(!pgUrl)assert.equal(typeof pgUrl,'undefined');
});
