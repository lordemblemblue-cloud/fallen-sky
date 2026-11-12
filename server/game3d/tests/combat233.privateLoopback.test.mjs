import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validatePrivateLoopbackConfig224} from '../privateLoopbackConfig224.mjs';
import {validatePrivateLoopbackUpgrade225} from '../privateLoopbackUpgrade225.mjs';
import {resolvePrivateLoopbackAdmission226} from '../privateLoopbackAdmission226.mjs';
import {createPrivateLoopbackCapacity227} from '../privateLoopbackCapacity227.mjs';
import {withPrivateLoopbackDeadline228} from '../privateLoopbackDeadline228.mjs';
import {createPrivateLoopbackLifecycle229} from '../privateLoopbackLifecycle229.mjs';
import {createPrivateLoopbackMetrics230} from '../privateLoopbackMetrics230.mjs';
import {reviewPrivateLoopback231} from '../privateLoopbackReview231.mjs';
import {createGame3DPrivateQuestLoopbackGateway232} from '../privateQuestLoopbackGateway232.mjs';
import {PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212} from '../privateSocketPreflight212.mjs';

const savedStage=process.env.GAME3D_PRIVATE_STAGING_ENV;
const savedAck=process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK='I_ACCEPT_LOOPBACK_ONLY';
const origin='https://qa.atomxe.example';
const key='-----BEGIN PRIVATE KEY-----\n'+'k'.repeat(120);
const cert='-----BEGIN CERTIFICATE-----\n'+'c'.repeat(120);
const config=()=>({enabled:true,tlsKey:key,tlsCert:cert,allowedOrigins:[origin]});
const socketRequest=(port=12345)=>({method:'GET',url:PRIVATE_QUEST_PATH_212,
 socket:{encrypted:true,remoteAddress:'127.0.0.1',localAddress:'127.0.0.1'},
 headers:{host:`127.0.0.1:${port}`,origin,upgrade:'websocket',connection:'Upgrade',
 'sec-websocket-protocol':PRIVATE_QUEST_PROTOCOL_212,
 'sec-websocket-version':'13','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='}});
const scope={ownerId:'owner233',characterId:'hero233'};
const ingress=()=>({version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
 transportBindingCreated:false,resumeCombatAuthorized:false,
 async bind(){return {ok:true,version:'21.1',transportBindingCreated:false,resumeCombatAuthorized:false}},
 async receive({rawFrame}){const f=JSON.parse(rawFrame);return {ok:true,version:'21.1',
 privateServerOnly:true,publicRouteInstalled:false,transportBindingCreated:false,
 resumeCombatAuthorized:false,rewardsIssued:false,
 payload:JSON.stringify({v:1,type:'questbook.snapshot',seq:f.seq,
 objectives:[{questId:'q_patrol',objectiveId:'wolf_kills',type:'kill',status:'accepted',current:2,required:3}]})}},
 close(){},
 });
const makeProvider=({allow=true,revoke=()=>false}={})=>{
 const expiresAtMs=Date.now()+30000;
 return async request=>({
 scope,ingress211:ingress(),authenticateUpgrade:async original=>{
  if(!allow||original!==request||revoke())return null;
  return {authenticated:true,identitySource:'trusted-private-socket-upgrade-213',
   ownerId:scope.ownerId,characterId:scope.characterId,
   transportId:'tx-'+'a'.repeat(32),expiresAtMs,
   serverTransportContext:{serverSide:true},
   serverReconnectContext:{serverSideReconnect:true}};
 },
});
};

test('22.4 disabled by default and refuses public addresses and unapproved origins',()=>{
 assert.throws(()=>validatePrivateLoopbackConfig224({}),/22.4/);
 const a=validatePrivateLoopbackConfig224(config());
 assert.equal(a.host,'127.0.0.1');assert.equal(a.publicRouteInstalled,false);
 assert.throws(()=>validatePrivateLoopbackConfig224({...config(),port:-1}),/22.4/);
 assert.throws(()=>validatePrivateLoopbackConfig224({...config(),allowedOrigins:['http://example.test']}),/22.4/);
 assert.throws(()=>validatePrivateLoopbackConfig224({...config(),allowedOrigins:[origin,origin]}),/22.4/);
 assert.throws(()=>validatePrivateLoopbackConfig224({...config(),tlsKey:'short'}),/22.4/);
 process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK='';
 try{assert.throws(()=>validatePrivateLoopbackConfig224(config()),/22.4/)}
 finally{process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK='I_ACCEPT_LOOPBACK_ONLY'}
});
test('22.5 only direct loopback TLS with exact original private protocol',()=>{
 const request=socketRequest();
 const args={allowedOrigins:[origin],port:12345};
 assert.equal(validatePrivateLoopbackUpgrade225(request,args),true);
 for(const mutation of [r=>r.socket.remoteAddress='192.168.0.2',
  r=>r.socket.localAddress='0.0.0.0',r=>r.socket.encrypted=false,
  r=>r.headers.cookie='login=1',r=>r.headers.origin='https://evil.example',
  r=>r.headers.host='other.example',r=>r.url+='?token=1']){
  const changed=socketRequest();mutation(changed);
  assert.equal(validatePrivateLoopbackUpgrade225(changed,args),false);
 }
});
test('22.6 verifies separate original backend authority and rejects forged owner',async()=>{
 const request=socketRequest(),now=Date.now();
 const input={request,resolveBackendAdmission:makeProvider(),now:()=>now};
 const result=await resolvePrivateLoopbackAdmission226(input);
 assert.equal(result.scope.ownerId,scope.ownerId);
 assert.equal(result.transportId,'tx-'+'a'.repeat(32));
 assert.equal(Object.hasOwn(result,'ticketId'),false);
 assert.equal(await resolvePrivateLoopbackAdmission226({...input,
  resolveBackendAdmission:async()=>({...await makeProvider()(request),
   scope:{ownerId:'different',characterId:scope.characterId}})}),null);
 assert.equal(await resolvePrivateLoopbackAdmission226({...input,
  resolveBackendAdmission:async()=>({...await makeProvider()(request),
   authenticateUpgrade:async()=>null})}),null);
});
test('22.7 caps concurrent sockets and handshakes with idempotent release',()=>{
 const c=createPrivateLoopbackCapacity227();
 const a=c.reserve('handshake'),b=c.reserve('handshake');
 assert.equal(c.reserve('handshake'),null);
 const s=c.reserve('socket'),t=c.reserve('socket');
 assert.equal(c.reserve('socket'),null);
 assert.equal(a(),true);assert.equal(a(),false);
 assert.equal(c.snapshot().sockets,2);
 assert.equal(t(),true);assert.equal(s(),true);assert.equal(b(),true);
 assert.equal(c.snapshot().sockets,0);c.shutdown();
 assert.equal(c.reserve('socket'),null);
});
test('22.8 rejects slow admission, propagates safe results',async()=>{
 assert.equal(await withPrivateLoopbackDeadline228(async()=>42),42);
 await assert.rejects(withPrivateLoopbackDeadline228(()=>new Promise(()=>{}),{timeoutMs:100}),/private_auth_timeout/);
 await assert.rejects(withPrivateLoopbackDeadline228(()=>null,{timeoutMs:20}),/22.8/);
});
test('22.9 shutdown terminates only its own adopted sockets',()=>{
 const l=createPrivateLoopbackLifecycle229();let terminated=0,shut=0;
 const socket={terminate(){terminated++}},bridge={shutdown(){shut++}};
 assert.equal(l.add(socket,bridge),true);assert.equal(l.add(socket,bridge),false);
 assert.equal(l.shutdown(),true);assert.equal(l.shutdown(),false);
 assert.equal(terminated,1);assert.equal(shut,1);
 assert.equal(l.snapshot().active,0);
});
test('23.0 metrics never include player names, login or credentials',()=>{
 const m=createPrivateLoopbackMetrics230();
 m.mark('attempted');m.mark('denied');m.mark('ready');
 assert.equal(m.mark('player-name'),false);
 assert.equal(m.snapshot().attempted,1);
 assert.equal(JSON.stringify(m.snapshot()).includes('owner233'),false);
 assert.equal(Object.isFrozen(m.snapshot()),true);
});
test('23.1 review output redacts TLS private key and authentication callback',()=>{
 const c=validatePrivateLoopbackConfig224(config());
 const capacity=createPrivateLoopbackCapacity227(),life=createPrivateLoopbackLifecycle229(),metrics=createPrivateLoopbackMetrics230();
 const report=reviewPrivateLoopback231({config:c,capacity,lifecycle:life,metrics,port:8089});
 assert.equal(report.host,'127.0.0.1');
 assert.equal(report.productionReady,false);
 assert.equal(JSON.stringify(report).includes('PRIVATE KEY'),false);
 assert.equal(report.maxConcurrentSockets,2);
 life.shutdown();capacity.shutdown();
});

// Native end-to-end TLS + WS tests run in CI after installing the package.json
// dependency. If unavailable in a local bare Node sandbox, they are SKIPPED,
// never misreported as a green network test.
const requireWs=process.env.GAME3D_REQUIRE_WS_TESTS==='true';
let WsClient=null,available=false;
try{const ws=await import('ws');WsClient=ws.default;available=true}catch{}
let tlsFixture=null;
function issueCert(){
 const folder=mkdtempSync(join(tmpdir(),'axe-233-tls-'));
 const keyPath=join(folder,'key.pem'),certPath=join(folder,'cert.pem');
 const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=127.0.0.1'],
  {stdio:'ignore',timeout:20000});
 if(result.status!==0){rmSync(folder,{recursive:true,force:true});throw Error('openssl test fixture failed')}
 return {folder,tlsKey:readFileSync(keyPath),tlsCert:readFileSync(certPath)};
}
const wait=async f=>{
 for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}
 assert.fail('private loopback did not reach the expected state');
};
const connect=(port,options={})=>new Promise((resolve,reject)=>{
 const client=new WsClient(`wss://127.0.0.1:${port}${PRIVATE_QUEST_PATH_212}`,
  PRIVATE_QUEST_PROTOCOL_212,{rejectUnauthorized:false,origin,...options});
 client.once('open',()=>resolve(client));client.once('error',reject);
});
test('23.2 actual TLS loopback WebSocket reads Questbook only', {skip:!available&&!requireWs},async()=>{
 if(!available)throw Error('ws package required for real TLS network verification');
 const keys=issueCert();let gateway,client;
 try{
  gateway=await createGame3DPrivateQuestLoopbackGateway232({enabled:true,port:0,
   tlsKey:keys.tlsKey,tlsCert:keys.tlsCert,allowedOrigins:[origin],
   resolveBackendAdmission:makeProvider()});
  assert.equal(gateway.host,'127.0.0.1');
  assert.equal(gateway.publicRouteInstalled,false);
  client=await connect(gateway.port);
  await wait(()=>gateway.inspect().counters.ready===1);
  const reply=new Promise((resolve,reject)=>{
   client.once('message',data=>{try{resolve(JSON.parse(String(data)))}catch(e){reject(e)}});
   client.once('error',reject);
  });
  client.send(JSON.stringify({v:1,seq:1,op:'questbook.read'}));
  const frame=await Promise.race([reply,new Promise((_,reject)=>setTimeout(()=>reject(Error('snapshot timeout')),1000))]);
  assert.equal(frame.type,'questbook.snapshot');
  assert.equal(frame.objectives[0].current,2);
  assert.equal(Object.hasOwn(frame,'ownerId'),false);
  assert.equal(gateway.inspect().counters.sent,undefined);
 }finally{client?.terminate();await gateway?.close();rmSync(keys.folder,{recursive:true,force:true})}
});
test('23.3 actual TLS loopback rejects forged origin and never upgrades', {skip:!available&&!requireWs},async()=>{
 if(!available)throw Error('ws package required for real TLS network verification');
 const keys=issueCert();let gateway;
 try{
  gateway=await createGame3DPrivateQuestLoopbackGateway232({enabled:true,port:0,
   tlsKey:keys.tlsKey,tlsCert:keys.tlsCert,allowedOrigins:[origin],
   resolveBackendAdmission:makeProvider()});
  await assert.rejects(connect(gateway.port,{origin:'https://attacker.example'}));
  await wait(()=>gateway.inspect().counters.denied>=1);
  assert.equal(gateway.inspect().counters.upgraded,0);
 }finally{await gateway?.close();rmSync(keys.folder,{recursive:true,force:true})}
});
