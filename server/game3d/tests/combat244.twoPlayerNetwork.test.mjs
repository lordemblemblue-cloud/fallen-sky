// 24.2–24.4: REAL TLS + ws network tests, but FAKE authenticated backend/19.9.
// Not evidence of live Base44, PostgreSQL, rewards, movement, or production readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createGame3DPrivateQuestLoopbackGateway232}
 from '../privateQuestLoopbackGateway232.mjs';
import {PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212}
 from '../privateSocketPreflight212.mjs';
import {createFakeTwoPlayerBackend241}
 from './helpers/privateTwoPlayerBackend241.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK='I_ACCEPT_LOOPBACK_ONLY';
const origin='https://qa.atomxe.example';
const required=process.env.GAME3D_REQUIRE_WS_TESTS==='true';
let WsClient=null;
try{({default:WsClient}=await import('ws'))}catch{}
const opts={skip:!WsClient&&!required};
const waitFor=async predicate=>{
 for(let i=0;i<120;i++){
  if(predicate())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('network operation did not complete within test budget');
};
const cert=()=>{
 const dir=mkdtempSync(join(tmpdir(),'axe-two-player-'));
 const key=join(dir,'key.pem'),certificate=join(dir,'cert.pem');
 const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048',
  '-nodes','-keyout',key,'-out',certificate,'-days','1',
  '-subj','/CN=127.0.0.1'],{stdio:'ignore',timeout:20000});
 if(result.status!==0){rmSync(dir,{recursive:true,force:true});
  throw Error('openssl fixture required');}
 return {dir,tlsKey:readFileSync(key),tlsCert:readFileSync(certificate)};
};
async function withGateway(assignments,fn){
 if(!WsClient)throw Error('24.2–24.4 requires ws dependency');
 const tls=cert(),backend=createFakeTwoPlayerBackend241(assignments);
 let gateway;const clients=[];
 try{
  gateway=await createGame3DPrivateQuestLoopbackGateway232({
   enabled:true,port:0,tlsKey:tls.tlsKey,tlsCert:tls.tlsCert,
   allowedOrigins:[origin],resolveBackendAdmission:backend.resolveBackendAdmission,
  });
  const connect=(requestedOrigin=origin)=>new Promise((resolve,reject)=>{
   const client=new WsClient('wss://127.0.0.1:'+gateway.port+
    PRIVATE_QUEST_PATH_212,PRIVATE_QUEST_PROTOCOL_212,
    {rejectUnauthorized:false,origin:requestedOrigin,perMessageDeflate:false});
   let settled=false;
   const timeout=setTimeout(()=>{
    if(settled)return;settled=true;
    try{client.terminate()}catch{}
    reject(Error('private websocket upgrade timed out'));
   },3000);
   client.once('open',()=>{
    if(settled)return;settled=true;clearTimeout(timeout);
    clients.push(client);resolve(client);
   });
   client.once('error',error=>{
    if(settled)return;settled=true;clearTimeout(timeout);reject(error);
   });
  });
  const ready=count=>waitFor(()=>gateway.inspect().counters.ready>=count);
  const read=(client,seq)=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{cleanup();reject(Error('snapshot timeout'))},1500);
   const message=data=>{cleanup();try{resolve(JSON.parse(String(data)))}catch(e){reject(e)}};
   const closed=()=>{cleanup();reject(Error('socket closed before reply'))};
   const cleanup=()=>{clearTimeout(timeout);client.off('message',message);client.off('close',closed)};
   client.once('message',message);client.once('close',closed);
   client.send(JSON.stringify({v:1,seq,op:'questbook.read'}));
  });
  await fn({gateway,backend,connect,ready,read});
 }finally{
  for(const client of clients)try{client.terminate()}catch{}
  await gateway?.close();
  rmSync(tls.dir,{recursive:true,force:true});
 }
}
test('24.2 two separately authenticated test accounts retain distinct Questbook snapshots',opts,async()=>{
 await withGateway(['ownerA','ownerB'],async({gateway,connect,ready,read})=>{
  const a=await connect();await ready(1);
  const b=await connect();await ready(2);
  assert.equal(gateway.inspect().verifiedAccounts,2);
  const [ra,rb]=await Promise.all([read(a,1),read(b,1)]);
  assert.equal(ra.objectives[0].questId,'quest_ownerA');
  assert.equal(rb.objectives[0].questId,'quest_ownerB');
  assert.equal(ra.objectives[0].current,1);
  assert.equal(rb.objectives[0].current,2);
  assert.equal(ra.type,'questbook.snapshot');
  assert.equal(rb.type,'questbook.snapshot');
 });
});
test('24.2 duplicate account cannot occupy two concurrent sockets',opts,async()=>{
 await withGateway(['ownerA','ownerA'],async({gateway,connect,ready,read})=>{
  const first=await connect();await ready(1);
  await assert.rejects(connect());
  await waitFor(()=>gateway.inspect().counters.denied>=1);
  assert.equal(gateway.inspect().verifiedAccounts,1);
  const allowed=await read(first,1);
  assert.equal(allowed.objectives[0].questId,'quest_ownerA');
 });
});
test('24.3 disconnect releases account slot for a new isolated session',opts,async()=>{
 await withGateway(['ownerA','ownerA'],async({gateway,connect,ready,read})=>{
  const first=await connect();await ready(1);
  first.terminate();
  await waitFor(()=>gateway.inspect().verifiedAccounts===0);
  const replacement=await connect();await ready(2);
  assert.equal(gateway.inspect().verifiedAccounts,1);
  assert.equal((await read(replacement,1)).objectives[0].questId,'quest_ownerA');
 });
});
test('24.3 backend logout revokes one account without affecting the other',opts,async()=>{
 await withGateway(['ownerA','ownerB'],async({gateway,backend,connect,ready,read})=>{
  const a=await connect();await ready(1);
  const b=await connect();await ready(2);
  await read(a,1);await read(b,1);
  backend.revoke('ownerA');
  const closed=new Promise(resolve=>a.once('close',resolve));
  a.send(JSON.stringify({v:1,seq:2,op:'questbook.read'}));
  await Promise.race([closed,new Promise((_,reject)=>
   setTimeout(()=>reject(Error('logout not enforced')),1500))]);
  assert.equal((await read(b,2)).objectives[0].questId,'quest_ownerB');
 });
});
test('24.4 combat injection and replay close the offending socket only',opts,async()=>{
 await withGateway(['ownerA','ownerB'],async({gateway,connect,ready,read})=>{
  const a=await connect();await ready(1);
  const b=await connect();await ready(2);
  const closed=new Promise(resolve=>a.once('close',resolve));
  a.send(JSON.stringify({v:1,seq:1,op:'combat.attack'}));
  await Promise.race([closed,new Promise((_,reject)=>
   setTimeout(()=>reject(Error('combat frame not rejected')),1500))]);
  assert.equal((await read(b,1)).objectives[0].questId,'quest_ownerB');
  const again=new Promise(resolve=>b.once('close',resolve));
  b.send(JSON.stringify({v:1,seq:1,op:'questbook.read'}));
  await Promise.race([again,new Promise((_,reject)=>
   setTimeout(()=>reject(Error('replayed sequence not rejected')),1500))]);
 });
});

test('24.3 simultaneous duplicate connections cannot both reserve one owner',opts,async()=>{
 await withGateway(['ownerA','ownerA'],async({gateway,connect,ready})=>{
  const attempts=await Promise.allSettled([connect(),connect()]);
  await ready(1);
  assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);
  assert.equal(attempts.filter(v=>v.status==='rejected').length,1);
  assert.equal(gateway.inspect().verifiedAccounts,1);
 });
});

test('24.4 forged Origin rejected before any account slot is allocated',opts,async()=>{
 await withGateway(['ownerA'],async({gateway,connect,ready,read})=>{
  await assert.rejects(connect('https://attacker.invalid'));
  await waitFor(()=>gateway.inspect().counters.denied>=1);
  assert.equal(gateway.inspect().verifiedAccounts,0);
  const a=await connect();
  await ready(1);
  assert.equal((await read(a,1)).objectives[0].questId,'quest_ownerA');
 });
});
test('24.4 binary player command closes only offending socket',opts,async()=>{
 await withGateway(['ownerA','ownerB'],async({connect,ready,read})=>{
  const a=await connect();await ready(1);
  const b=await connect();await ready(2);
  const closed=new Promise(resolve=>a.once('close',resolve));
  a.send(Buffer.from(JSON.stringify({v:1,seq:1,op:'questbook.read'})),{binary:true});
  await Promise.race([closed,new Promise((_,reject)=>
   setTimeout(()=>reject(Error('binary command not rejected')),1500))]);
  assert.equal((await read(b,1)).objectives[0].questId,'quest_ownerB');
 });
});
