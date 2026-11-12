// Real loopback TLS/WebSocket exercised ONLY with ws and openssl present.
// Original Base44/world identity and Questbook source are still mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK='I_ACCEPT_LOOPBACK_ONLY';
const origin='https://qa.atomxe.example';
const required=process.env.GAME3D_REQUIRE_WS_TESTS==='true';
let Ws=null;try{({default:Ws}=await import('ws'))}catch{}
const opts={skip:!Ws&&!required,timeout:25000};
const wait=async predicate=>{
 for(let i=0;i<150;i++){
  if(predicate())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('private WS lifecycle not reached');
};
const cert=()=>{
 const dir=mkdtempSync(join(tmpdir(),'axe-ws-362-'));
 const key=join(dir,'key.pem'),crt=join(dir,'cert.pem');
 const job=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',key,'-out',crt,'-days','1','-subj','/CN=127.0.0.1'],
  {stdio:'ignore',timeout:20000});
 if(job.status!==0){rmSync(dir,{recursive:true,force:true});throw Error('openssl required')}
 return {dir,tlsKey:readFileSync(key),tlsCert:readFileSync(crt)};
};
async function withGateway(fn,{firstExpiresMs=null}={}){
 if(!Ws)throw Error('ws required for genuine 36.2 private TLS tests');
 const {createGame3DPrivateQuestLoopbackGateway232}=await import('../privateQuestLoopbackGateway232.mjs');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const {createFakeTwoPlayerBackend241}=await import('./helpers/privateTwoPlayerBackend241.mjs');
 const tls=cert(),backend=createFakeTwoPlayerBackend241(['ownerA','ownerB']);
 const events=[];let gateway;const clients=[];
 let issued=0;
 const provider=async request=>{
  const admission=await backend.resolveBackendAdmission(request);
  if(!admission||firstExpiresMs===null||issued++>0)return admission;
  // Test-only: retain the original signed-in fake backend and original server
  // contexts, but shorten the FIRST account's verified socket expiry.
  const expiry=Date.now()+firstExpiresMs;
  return {...admission,authenticateUpgrade:async req=>{
   const proof=await admission.authenticateUpgrade(req);
   return proof?{...proof,expiresAtMs:expiry}:null;
  }};
 };
 try{
  gateway=await createGame3DPrivateQuestLoopbackGateway232({enabled:true,port:0,
   tlsKey:tls.tlsKey,tlsCert:tls.tlsCert,allowedOrigins:[origin],
   resolveBackendAdmission:provider,
   onPrivateAdmissionClosed353:(request,reason)=>events.push({request,reason}),
  });
  const connect=(site=origin)=>new Promise((resolve,reject)=>{
   const ws=new Ws('wss://127.0.0.1:'+gateway.port+PRIVATE_QUEST_PATH_212,
    PRIVATE_QUEST_PROTOCOL_212,{rejectUnauthorized:false,origin:site,
     perMessageDeflate:false});
   let done=false;
   const timer=setTimeout(()=>{if(done)return;done=true;ws.terminate();
    reject(Error('WebSocket connection timeout'))},3000);
   ws.once('open',()=>{if(done)return;done=true;clearTimeout(timer);
    clients.push(ws);resolve(ws)});
   ws.once('error',error=>{if(done)return;done=true;clearTimeout(timer);reject(error)});
  });
  const read=(client,seq)=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(Error('Questbook response timeout'))},1500);
   const message=data=>{cleanup();try{resolve(JSON.parse(String(data)))}catch(error){reject(error)}};
   const closed=()=>{cleanup();reject(Error('socket closed prematurely'))};
   const cleanup=()=>{clearTimeout(timer);client.off('message',message);client.off('close',closed)};
   client.once('message',message);client.once('close',closed);
   client.send(JSON.stringify({v:1,seq,op:'questbook.read'}));
  });
  await fn({gateway,events,connect,read});
 }finally{
  for(const client of clients)try{client.terminate()}catch{}
  await gateway?.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
}
test('36.0 real two-client TLS isolation and once-only socket disposal',opts,async()=>{
 await withGateway(async({gateway,events,connect,read})=>{
  const a=await connect();await wait(()=>gateway.inspect().counters.ready>=1);
  const b=await connect();await wait(()=>gateway.inspect().counters.ready>=2);
  const ra=await read(a,1),rb=await read(b,1);
  assert.equal(ra.objectives[0].questId,'quest_ownerA');
  assert.equal(rb.objectives[0].questId,'quest_ownerB');
  a.terminate();await wait(()=>events.length===1);
  assert.equal(events[0].reason,'socket-closed');
  assert.equal((await read(b,2)).objectives[0].questId,'quest_ownerB');
  b.terminate();await wait(()=>events.length===2);
  assert.notEqual(events[0].request,events[1].request);
  assert.equal(gateway.inspect().verifiedAccounts,0);
 });
});
test('36.1 real gateway shutdown disposes both independently admitted players',opts,async()=>{
 await withGateway(async({gateway,events,connect})=>{
  await connect();await wait(()=>gateway.inspect().counters.ready>=1);
  await connect();await wait(()=>gateway.inspect().counters.ready>=2);
  await gateway.close();await wait(()=>events.length===2);
  assert.ok(events.every(x=>x.reason==='shutdown'));
  assert.equal(events[0].request===events[1].request,false);
 });
});
test('36.2 forged Origin never triggers an authenticated-socket cleanup',opts,async()=>{
 await withGateway(async({gateway,events,connect})=>{
  await assert.rejects(connect('https://attacker.invalid'));
  await wait(()=>gateway.inspect().counters.denied>=1);
  assert.equal(events.length,0);
  const valid=await connect();await wait(()=>gateway.inspect().counters.ready>=1);
  valid.terminate();await wait(()=>events.length===1);
 });
});

test('37.2 real TLS expired mock account closes while second account remains readable',
 opts,async()=>{
 await withGateway(async({gateway,events,connect,read})=>{
  const first=await connect();await wait(()=>gateway.inspect().counters.ready>=1);
  const second=await connect();await wait(()=>gateway.inspect().counters.ready>=2);
  assert.equal((await read(first,1)).objectives[0].questId,'quest_ownerA');
  assert.equal((await read(second,1)).objectives[0].questId,'quest_ownerB');
  const closed=new Promise(resolve=>first.once('close',resolve));
  await Promise.race([closed,new Promise((_,reject)=>setTimeout(
   ()=>reject(Error('expiring original socket not closed')),2400))]);
  await wait(()=>events.some(e=>e.reason==='expired'));
  assert.equal(gateway.inspect().socketLeaseActive,1);
  assert.equal((await read(second,2)).objectives[0].questId,'quest_ownerB');
 },{firstExpiresMs:900});
});

test('38.2 real TLS: simulated fatal worker drains both mock-authenticated sockets',
 opts,async()=>{
 await withGateway(async({gateway,events,connect,read})=>{
  const first=await connect();await wait(()=>gateway.inspect().counters.ready>=1);
  const second=await connect();await wait(()=>gateway.inspect().counters.ready>=2);
  assert.equal((await read(first,1)).objectives[0].questId,'quest_ownerA');
  assert.equal((await read(second,1)).objectives[0].questId,'quest_ownerB');
  const draining=gateway.failClosed();
  assert.equal(gateway.inspect().workerDraining,true);
  assert.equal(await draining,true);
  await wait(()=>events.length===2);
  assert.equal(gateway.inspect().socketLeaseActive,0);
  assert.ok(events.every(x=>x.reason==='server-error'));
  assert.notEqual(events[0].request,events[1].request);
  await assert.rejects(connect());
 });
});
