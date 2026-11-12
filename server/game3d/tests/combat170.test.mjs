// Game 3D Quest 17.0: signed read relay over REAL 16.7/16.8/16.9
// adapters. Fake PG connection is read-only: no DB service role or gameplay
// mutation is required for these boundary/transport tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createGame3DQuestbookRelay170,
 signGame3DQuestbookRequest170,GAME3D_QUESTBOOK_READ_PATH_170}
 from '../privateQuestbookRoute170.mjs';
import {createAXEQuestbookReadModel169}
 from '../../../src/components/game3d/axe/quests/AXEQuestbookReadModel169.js';

const secret='s'.repeat(48);
const origin='https://game.example';
const a={ownerId:'account170A',characterId:'character170A',
 sessionId:'qb170-'+'a'.repeat(64)};
const b={ownerId:'account170B',characterId:'character170B',
 sessionId:'qb170-'+'b'.repeat(64)};
const clock={ms:1793667600000};
const makePool=()=>{
 const calls=[];
 const pool={
  async connect(){
   return {
    async query(sql,args=[]){
     const s=String(sql).trim();
     calls.push({sql:s,args});
     if(s.startsWith('BEGIN')||s==='COMMIT'||s==='ROLLBACK')
      return {rowCount:0,rows:[]};
     if(s.includes('FROM game3d_trusted_character')){
      const matched=[[a.ownerId,a.characterId],[b.ownerId,b.characterId]]
       .some(x=>x[0]===args[0]&&x[1]===args[1]);
      return matched?{rowCount:1,rows:[{
       owner_id:args[0],character_id:args[1]
      }]}:{rowCount:0,rows:[]};
     }
     if(!s.startsWith('SELECT'))
      throw Error('Forbidden non-read SQL: '+s.slice(0,40));
     return {rowCount:0,rows:[]};
    },release(){}
   };
  }
 };
 return {pool,calls};
};
const proof=(actor=a,opts={})=>({
 v:1,proof:'base44-auth-me-character-vault',
 ownerId:actor.ownerId,characterId:actor.characterId,
 sessionId:actor.sessionId,issuedAtMs:clock.ms,
 expiresAtMs:clock.ms+25000,nonce:randomUUID(),
 knownRevision:null,knownViewId:null,...opts
});
const answer=async(route,p,{unsigned,method='POST',path=GAME3D_QUESTBOOK_READ_PATH_170,
 contentType='application/json',raw:rawOverride,signatureOverride,timeOverride}={})=>{
 const raw=rawOverride??JSON.stringify(p);
 const time=timeOverride??p.issuedAtMs;
 const signed=signGame3DQuestbookRequest170({secret,at:time,rawBody:raw});
 const req={
  url:path,method,headers:{
   'content-type':contentType,
   'content-length':String(Buffer.byteLength(raw)),
   'x-game3d-questbook-time':String(time),
   'x-game3d-questbook-signature':unsigned?'0'.repeat(64):
    signatureOverride??signed
  },
  async *[Symbol.asyncIterator](){yield Buffer.from(raw);}
 };
 const res={
  writableEnded:false,destroyed:false,
  writeHead(status,headers){this.status=status;this.headers=headers;},
  end(message){this.body=JSON.parse(message);this.writableEnded=true;}
 };
 const handled=await route.handle(req,res);
 assert.equal(handled,true);
 assert.equal(res.headers['cache-control'],'private, no-store');
 return {status:res.status,body:res.body};
};
const route=()=>{const fixture=makePool();return {
 ...fixture,relay:createGame3DQuestbookRelay170({
  pool:fixture.pool,secret,appOrigin:origin,now:()=>clock.ms
 })
}};
test('17.0 creates relay only with independent trust dependencies',()=>{
 assert.throws(()=>createGame3DQuestbookRelay170({}));
 assert.throws(()=>createGame3DQuestbookRelay170({
  pool:makePool().pool,secret,appOrigin:'http://game.example'
 }));
 assert.throws(()=>signGame3DQuestbookRequest170({secret:'short',
  at:clock.ms,rawBody:'{}'}));
});
test('17.0 authentic request projects trusted empty questbook without writes',async()=>{
 const f=route();
 try{
  const p=proof(),r=await answer(f.relay,p);
  assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(r.body.ok,true);
  assert.equal(r.body.version,'16.9');
  assert.equal(r.body.snapshot.questbook.readOnly,true);
  assert.deepEqual(r.body.snapshot.questbook.entries,[]);
  assert.deepEqual(r.body.snapshot.npcInteractionLeads,[]);
  assert.deepEqual(r.body.snapshot.rivalInvitations,[]);
  assert.equal(r.body.snapshot.ownerId,undefined);
  assert.equal(r.body.epoch,undefined);
  assert.equal(r.body.handle,undefined);
  assert.equal(r.body.rewardsIssued,false);
  assert(f.calls.some(c=>c.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  assert(f.calls.every(c=>/^(BEGIN|COMMIT|ROLLBACK|SELECT)/.test(c.sql)));
 }finally{await f.relay.shutdown();}
});
test('16.9 client reconciles signed Base44-to-PostgreSQL presentation',async()=>{
 const f=route();
 try{
  const m=createAXEQuestbookReadModel169();
  const first=(await answer(f.relay,proof())).body;
  const applied=m.apply(first,{completedIds:['forged_browser_quest']});
  assert.equal(applied.ok,true,JSON.stringify(applied));
  assert.deepEqual(applied.view.questState.completedIds,[]);
  assert.deepEqual(applied.view.localOnlyIds,['forged_browser_quest']);
  const next=(await answer(f.relay,proof(a,{
   knownRevision:m.getQuery().knownRevision,
   knownViewId:m.getQuery().knownViewId
  }))).body;
  assert.equal(next.unchanged,true);
  assert.equal(Object.hasOwn(next,'snapshot'),false);
  assert.equal(m.apply(next).updated,false);
 }finally{await f.relay.shutdown();}
});
test('backend HMAC binds exact method, timestamp, path and raw body',async()=>{
 const f=route();
 try{
  const p=proof();
  assert.equal((await answer(f.relay,p,{unsigned:true})).status,401);
  assert.equal((await answer(f.relay,p,{method:'GET'})).status,405);
  assert.equal((await answer(f.relay,p,{path:GAME3D_QUESTBOOK_READ_PATH_170+'?x=1'})).status,404);
  assert.equal((await answer(f.relay,p,{contentType:'text/plain'})).status,415);
  assert.equal((await answer(f.relay,p,{raw:JSON.stringify({...p,ownerId:'attacker'}),
   signatureOverride:signGame3DQuestbookRequest170({
    secret,at:clock.ms,rawBody:JSON.stringify(p)
   })})).status,401);
  assert.equal(f.calls.length,0);
 }finally{await f.relay.shutdown();}
});
test('replay, stale timestamps, malformed payload and character isolation fail closed',async()=>{
 const f=route();
 try{
  const p=proof();
  assert.equal((await answer(f.relay,p)).status,200);
  assert.equal((await answer(f.relay,p)).status,409);
  assert.equal((await answer(f.relay,proof(a,{issuedAtMs:clock.ms-16000,
   expiresAtMs:clock.ms+2000}),{timeOverride:clock.ms-16000})).status,401);
  assert.equal((await answer(f.relay,proof(a,{nonce:'not-a-uuid'}))).status,422);
  const noncanonical=proof(a,{characterId:'not-owned'});
  const missing=await answer(f.relay,noncanonical);
  assert.equal(missing.status,503,'missing PostgreSQL character denies verified read');
  assert.equal(missing.body.snapshot,undefined);
  const actorB=await answer(f.relay,proof(b));
  assert.equal(actorB.status,200);
  assert.equal(actorB.body.snapshot.questbook.entries.length,0);
 }finally{await f.relay.shutdown();}
});
test('changing account and login rotates presentation generations',async()=>{
 const f=route();
 try{
  const one=(await answer(f.relay,proof())).body;
  const two=(await answer(f.relay,proof(b))).body;
  assert.notEqual(one.viewId,two.viewId);
  const relog=(await answer(f.relay,proof(a,{
   sessionId:'qb170-'+'c'.repeat(64)
  }))).body;
  assert.notEqual(one.viewId,relog.viewId);
  assert.equal(relog.unchanged,false);
 }finally{await f.relay.shutdown();}
});
test('relay shuts down without leaving a callable read service',async()=>{
 const f=route();
 const r=await answer(f.relay,proof());
 assert.equal(r.status,200);
 await f.relay.shutdown();
 assert.equal((await answer(f.relay,proof())).status,503);
});
test('signing output matches independent HMAC reference',()=>{
 const raw=JSON.stringify(proof()),ts=clock.ms;
 const sha=createHash('sha256').update(raw).digest('hex');
 const expected=createHmac('sha256',secret).update(
  String(ts)+'\nPOST\n'+GAME3D_QUESTBOOK_READ_PATH_170+'\n'+sha).digest('hex');
 assert.equal(signGame3DQuestbookRequest170({secret,at:ts,rawBody:raw}),expected);
});
