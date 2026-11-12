// 39.2 real localhost TLS/ws exercise with MOCK original world identities only.
// This cannot establish real Base44, PostgreSQL or production multiplayer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK='I_ACCEPT_LOOPBACK_ONLY';
const required=process.env.GAME3D_REQUIRE_WS_TESTS==='true';
let Ws=null;try{({default:Ws}=await import('ws'))}catch{}
const opts={skip:!Ws&&!required,timeout:25000};
const origin='https://qa.atomxe.example';
const cert=()=>{
 const dir=mkdtempSync(join(tmpdir(),'axe-recover-392-'));
 const key=join(dir,'key.pem'),crt=join(dir,'cert.pem');
 const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048',
  '-nodes','-keyout',key,'-out',crt,'-days','1','-subj','/CN=127.0.0.1'],
  {stdio:'ignore',timeout:20000});
 if(result.status!==0){rmSync(dir,{recursive:true,force:true});throw Error('openssl fixture unavailable')}
 return {dir,tlsKey:readFileSync(key),tlsCert:readFileSync(crt)};
};
const wait=async check=>{
 for(let i=0;i<120&&!check();i++)await new Promise(r=>setTimeout(r,10));
 assert.ok(check(),'server did not reach expected state');
};
const connection=(gateway,protocol,path)=>new Promise((resolve,reject)=>{
 const ws=new Ws('wss://127.0.0.1:'+gateway.port+path,protocol,
  {rejectUnauthorized:false,origin,perMessageDeflate:false});
 let settled=false;
 const timer=setTimeout(()=>{if(!settled){settled=true;ws.terminate();reject(Error('connect deadline'))}},3000);
 ws.once('open',()=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ws)});
 ws.once('error',error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error)});
});
const read=(ws,seq)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{cleanup();reject(Error('snapshot deadline'))},1800);
 const data=value=>{cleanup();try{resolve(JSON.parse(String(value)))}catch(error){reject(error)}};
 const close=()=>{cleanup();reject(Error('socket closed before read'))};
 const cleanup=()=>{clearTimeout(timer);ws.off('message',data);ws.off('close',close)};
 ws.once('message',data);ws.once('close',close);
 ws.send(JSON.stringify({v:1,seq,op:'questbook.read'}));
});
async function worker(tls,assignments,{stale=false,warmup=false,rotateAtRecheck=false,
 delayedRead=false,readTimeoutMs=3000}={}){
 const {createPrivateReplacementLoopbackGateway390}=await import('../privateReplacementLoopbackGateway390.mjs');
 const {createFakeTwoPlayerBackend241}=await import('./helpers/privateTwoPlayerBackend241.mjs');
 const context={kind:'worker-392'};
 const backend=createFakeTwoPlayerBackend241(warmup?['warmup',...assignments]:assignments);
 if(warmup)await backend.resolveBackendAdmission({ignore:true});
 const ownerForRequest=new WeakMap(),checks=new WeakMap();
 let index=0,worldRotated=false,latestOriginalCandidate=null;
 let readStarted=false,releasePendingRead=null;
 const scope={instanceId:'original-world-392',instanceEpoch:'original-epoch-392'};
 const gateway=await createPrivateReplacementLoopbackGateway390({enabled:true,port:0,
  tlsKey:tls.tlsKey,tlsCert:tls.tlsCert,allowedOrigins:[origin],
  serverWorkerContext:context,timeoutMs:1200,readTimeoutMs,
  verifyOriginalReplacement383:async req=>{
   if(!ownerForRequest.has(req))ownerForRequest.set(req,assignments[index++]);
   const ownerId=ownerForRequest.get(req);
   const checksForRequest=(checks.get(req)||0)+1;checks.set(req,checksForRequest);
   return {authenticated:true,identitySource:'trusted-original-worker-recovery-383',
    ownerId,characterId:ownerId+'Hero',...scope,
    instanceEpoch:worldRotated||rotateAtRecheck&&checksForRequest>=2?
     'rotated-epoch-412':scope.instanceEpoch,
    expiresAtMs:Date.now()+25000,
    serverWorkerContext:stale?{old:true}:context};
  },
  resolveOriginalBackendAdmission:async req=>{
   const original=await backend.resolveBackendAdmission(req);
   if(!original)return null;
   const ingress=delayedRead?{...original.ingress211,
    receive:async(...args)=>{
     readStarted=true;
     await new Promise(resolve=>{releasePendingRead=resolve});
     return original.ingress211.receive(...args);
    }}:original.ingress211;
   latestOriginalCandidate={
    ...original,ingress211:ingress,scope:{...original.scope,...scope},
   };
   return latestOriginalCandidate;
  },
 });
 return {gateway,backend,rotateWorld(){worldRotated=true},
  get readStarted(){return readStarted},
  releaseRead(){releasePendingRead?.()},
  mutateOriginalCallback(){
   if(!latestOriginalCandidate)throw Error('original candidate not ready');
   latestOriginalCandidate.authenticateUpgrade=async()=>null;
  }};
}
test('39.2 real TLS: a FAILED worker requires a new independently verified request on replacement',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const tls=cert();let first=null,second=null;const clients=[];
 try{
  first=await worker(tls,['ownerA']);
  const a=await connection(first.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212);
  clients.push(a);await wait(()=>first.gateway.inspect().counters.ready>=1);
  assert.equal((await read(a,1)).objectives[0].questId,'quest_ownerA');
  await first.gateway.failClosed();
  await wait(()=>a.readyState===Ws.CLOSED);
  second=await worker(tls,['ownerA'],{warmup:true});
  const b=await connection(second.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212);
  clients.push(b);await wait(()=>second.gateway.inspect().counters.ready>=1);
  assert.equal((await read(b,1)).objectives[0].questId,'quest_ownerA');
  assert.notEqual(first.backend.issued()[0].transportId,second.backend.issued().at(-1).transportId);
 }finally{
  for(const client of clients)try{client.terminate()}catch{}
  await first?.gateway.close();await second?.gateway.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
});
test('39.2 real TLS: stale original-worker receipt refuses replacement admission',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const tls=cert();let replacement;
 try{
  replacement=await worker(tls,['ownerA'],{stale:true});
  await assert.rejects(connection(replacement.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212));
  assert.equal(replacement.gateway.inspect().recoveryActive,0);
 }finally{await replacement?.gateway.close();rmSync(tls.dir,{recursive:true,force:true})}
});

test('41.2 real TLS denies replacement if original world rotates during admission',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const tls=cert();let replacement;
 try{
  replacement=await worker(tls,['ownerA'],{rotateAtRecheck:true});
  await assert.rejects(connection(replacement.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212));
  assert.equal(replacement.gateway.inspect().recoveryActive,0);
  assert.equal(replacement.gateway.inspect().recoveryPending,0);
 }finally{await replacement?.gateway.close();rmSync(tls.dir,{recursive:true,force:true})}
});

test('42.2 real TLS: original world epoch rotation closes an already-ready Questbook read',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const tls=cert();let replacement=null,client=null;
 try{
  replacement=await worker(tls,['ownerA']);
  client=await connection(replacement.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212);
  await wait(()=>replacement.gateway.inspect().counters.ready>=1);
  assert.equal((await read(client,1)).objectives[0].questId,'quest_ownerA');
  replacement.rotateWorld();
  await assert.rejects(read(client,2));
  await wait(()=>client.readyState===Ws.CLOSED);
  assert.equal(replacement.gateway.inspect().recoveryActive,0);
 }finally{
  try{client?.terminate()}catch{}
  await replacement?.gateway.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
});

test('43.4 real TLS: swapping original backend callback closes an active Questbook socket',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const tls=cert();let replacement=null,client=null;
 try{
  replacement=await worker(tls,['ownerA']);
  client=await connection(replacement.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212);
  await wait(()=>replacement.gateway.inspect().counters.ready>=1);
  assert.equal((await read(client,1)).objectives[0].questId,'quest_ownerA');
  replacement.mutateOriginalCallback();
  await assert.rejects(read(client,2));
  await wait(()=>client.readyState===Ws.CLOSED);
  assert.equal(replacement.gateway.inspect().recoveryActive,0);
 }finally{
  try{client?.terminate()}catch{}
  await replacement?.gateway.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
});

test('44.5 real localhost TLS rejects a backend read that exceeds its socket deadline',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}=await import('../privateSocketPreflight212.mjs');
 const tls=cert();let replacement=null,client=null;
 try{
  replacement=await worker(tls,['ownerA'],{delayedRead:true,readTimeoutMs:600});
  client=await connection(replacement.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212);
  await wait(()=>replacement.gateway.inspect().counters.ready>=1);
  const pending=read(client,1);
  await wait(()=>replacement.readStarted);
  await assert.rejects(pending);
  await wait(()=>client.readyState===Ws.CLOSED);
  assert.equal(replacement.gateway.inspect().recoveryActive,0);
  replacement.releaseRead();
 }finally{
  try{client?.terminate()}catch{}
  replacement?.releaseRead();
  await replacement?.gateway.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
});

test('45.6 real TLS: worker drain aborts an in-flight original Questbook read',opts,async()=>{
 if(!Ws)throw Error('ws package required');
 const {PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212}
  =await import('../privateSocketPreflight212.mjs');
 const tls=cert();let replacement=null,client=null;
 try{
  replacement=await worker(tls,['ownerA'],{delayedRead:true,readTimeoutMs:2500});
  client=await connection(replacement.gateway,PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212);
  await wait(()=>replacement.gateway.inspect().counters.ready>=1);
  const pending=read(client,1);
  await wait(()=>replacement.readStarted);
  await replacement.gateway.failClosed();
  await assert.rejects(pending);
  await wait(()=>client.readyState===Ws.CLOSED);
  assert.equal(replacement.gateway.inspect().recoveryActive,0);
  replacement.releaseRead();
 }finally{
  try{client?.terminate()}catch{}
  replacement?.releaseRead();
  await replacement?.gateway.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
});
