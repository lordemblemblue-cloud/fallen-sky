import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateTrustedGatewayFactory280} from '../privateTrustedGatewayFactory280.mjs';
import {checkTrustedRequest271} from '../privateRequestContract271.mjs';
import {resolvePrivateLoopbackAdmission226} from '../privateLoopbackAdmission226.mjs';
import {createPrivateRegisteredLoopbackAdmission290} from '../privateRegisteredLoopbackAdmission290.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
function fixture(){
 let time=T,live=true,nonce='11111111-1111-4111-8111-111111111111';
 let rotated=false,stalled=false,attaches=0,readerWait=null,paused=false,reads=0,
  pauseVerifier=false,resolveVerifier=null,verificationCalls=0;
 const scope={ownerId:'owner282',characterId:'hero282',instanceId:'world-282',
  instanceEpoch:'epoch-282',mapFingerprint:'e'.repeat(64)};
 const original={original:true},request={url:'/private'},impostor={url:'/private'};
 const contexts={serverTransportContext:{server:'transport'},
  serverReconnectContext:{server:'reconnect'},serverReadContext:{server:'read'}};
 const alt={serverTransportContext:{server:'transport2'},
  serverReconnectContext:{server:'reconnect2'},serverReadContext:{server:'read2'}};
 const trusted=new Set([...Object.values(contexts),...Object.values(alt)]);
 const pairing180={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(ctx){return live&&trusted.has(ctx)?{
   authenticated:true,identitySource:'trusted-server-session',accountId:scope.ownerId,
   characterId:scope.characterId,serverSessionId:'server-session-282',expiresAtMs:T+50000}:null},
  async resolveVerifiedBase44ActionSession(ctx){return live&&trusted.has(ctx)?{
   authenticated:true,identitySource:'base44-verified-action-session-179',
   accountId:scope.ownerId,characterId:scope.characterId,
   worldSessionId:'server-session-282',actionSessionId:'qb174-'+'a'.repeat(64),
   expiresAtMs:T+50000}:null},
  async verifySessionActive(){return live}};
 const worldStage180={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return live&&serverRequestContext===original?{
    ownerId:scope.ownerId,characterId:scope.characterId,
    worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
    serverSessionId:'server-session-282',actionSessionId:'qb174-'+'a'.repeat(64),
    leaseNonce:nonce,expiresAtMs:T+60000}:null}};
 const questTransport199={version:'19.9',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,resumeCombatAuthorized:false,
  async attach({serverReconnectContext}){
   attaches++;
   if(!live||serverReconnectContext!==contexts.serverReconnectContext)return {ok:false};
   let closed=false;
   return {ok:true,version:'19.9',transportBindingCreated:false,
    resumeCombatAuthorized:false,privateHandle:{
     get active(){return live&&!closed},close(){closed=true},
     async read({serverReadContext,frame}){
      reads++;if(paused)await new Promise(done=>readerWait=done);
      if(!live||closed||serverReadContext!==contexts.serverReadContext)return {ok:false};
      return {ok:true,operation:'questbook.snapshot',seq:frame.seq,
       staticReconnectSnapshot:true,transportBindingCreated:false,
       worldLeaseRestored:false,resumeCombatAuthorized:false,rewardsIssued:false,
       objectives:[{questId:'quest282',objectiveId:'wolf',type:'kill',
        status:'accepted',current:1,required:2,secret:'never-leak'}]};
     }}};
  }};
 const verifyAuthenticatedUpgrade271=async req=>{
  verificationCalls++;
  if(pauseVerifier)await new Promise(done=>resolveVerifier=done);
  if(stalled)return new Promise(()=>{});
  if(req!==request)return null;
  return {authenticated:true,identitySource:'trusted-private-upgrade-271',
   ownerId:scope.ownerId,characterId:scope.characterId,expiresAtMs:T+30000,
   ...(rotated?alt:contexts)};
 };
 const options=()=>({enabled:true,
  pairing180,worldStage180,scope,serverRequestContext:original,
  questTransport199,verifyAuthenticatedUpgrade271,now:()=>time,
  timeoutMs:100,attestationTimeoutMs:100});
 const make=()=>createPrivateTrustedGatewayFactory280(options());
 const auto=()=>createPrivateRegisteredLoopbackAdmission290(options());
 return {make,auto,scope,request,impostor,original,contexts,
  get attaches(){return attaches},get reads(){return reads},
  get verifications(){return verificationCalls},
  logout(){live=false},rotate(){rotated=true},
  changeWorld(){nonce='22222222-2222-4222-8222-222222222222'},
  expire(){time=T+30001},rewind(){time=T-1},stall(){stalled=true},
  pause(){paused=true},resume(){paused=false;readerWait?.()},
  pauseAuthentication(){pauseVerifier=true},releaseAuthentication(){pauseVerifier=false;resolveVerifier?.()}};
}
async function bind(f){
 const x=await f.make();assert.equal(await x.registerAuthenticatedUpgrade(f.request),true);
 const accepted=await x.resolveBackendAdmission(f.request);assert.ok(accepted);
 const proof=await accepted.authenticateUpgrade(f.request);assert.ok(proof);
 return {x,accepted,proof};
}
const readFrame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});

test('27.1 contract rejects client-selected, aliased and overlong identities',()=>{
 const f=fixture();const claim={authenticated:true,identitySource:'trusted-private-upgrade-271',
  ownerId:f.scope.ownerId,characterId:f.scope.characterId,
  expiresAtMs:T+30000,...f.contexts};
 assert.ok(checkTrustedRequest271(claim,f.scope,f.original,T));
 assert.equal(checkTrustedRequest271({...claim,ownerId:'forged'},f.scope,f.original,T),null);
 assert.equal(checkTrustedRequest271({...claim,serverReadContext:claim.serverTransportContext},f.scope,f.original,T),null);
 assert.equal(checkTrustedRequest271({...claim,expiresAtMs:T+30001},f.scope,f.original,T),null);
});
test('27.2-27.4 unregistered and cloned request cannot create original reconnect',async()=>{
 const f=fixture(),x=await f.make();
 assert.equal(await x.resolveBackendAdmission(f.request),null);
 assert.equal(await x.registerAuthenticatedUpgrade(f.impostor),false);
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),true);
 assert.equal(await x.resolveBackendAdmission(f.impostor),null);
 assert.ok(await x.resolveBackendAdmission(f.request));
 assert.equal(await x.resolveBackendAdmission(f.request),null);
 x.shutdown();
});
test('27.5 original read-only ingress only returns sanitized Questbook data',async()=>{
 const f=fixture(),{x,accepted,proof}=await bind(f);
 assert.equal((await accepted.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext})).ok,true);
 const out=await accepted.ingress211.receive({serverTransportContext:proof.serverTransportContext,rawFrame:readFrame(1)});
 assert.equal(out.ok,true);assert.equal(out.payload.includes('never-leak'),false);
 assert.equal(out.rewardsIssued,false);assert.equal(f.attaches,1);
 x.shutdown();
});
test('27.6 original logout closes verified private request',async()=>{
 const f=fixture(),{x,accepted,proof}=await bind(f);f.logout();
 assert.equal(await accepted.authenticateUpgrade(f.request),null);
 assert.equal((await accepted.ingress211.receive({serverTransportContext:proof.serverTransportContext,rawFrame:readFrame(1)})).ok,false);
 x.shutdown();
});
test('27.7 original world nonce rotation blocks reconnect',async()=>{
 const f=fixture(),{x,accepted}=await bind(f);f.changeWorld();
 assert.equal(await accepted.authenticateUpgrade(f.request),null);x.shutdown();
});
test('27.8 a replacement trusted context is not accepted',async()=>{
 const f=fixture(),{x,accepted}=await bind(f);f.rotate();
 assert.equal(await accepted.authenticateUpgrade(f.request),null);x.shutdown();
});
test('27.9 anonymous callback hang cannot consume future original claim',async()=>{
 const f=fixture(),x=await f.make();f.stall();
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),false);
 assert.equal(await x.resolveBackendAdmission(f.request),null);x.shutdown();
});
test('28.0 original loopback admission can compose server-registered request',async()=>{
 const f=fixture(),x=await f.make();
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),true);
 const result=await resolvePrivateLoopbackAdmission226({request:f.request,
  resolveBackendAdmission:x.resolveBackendAdmission,now:()=>T});
 assert.equal(result.scope.ownerId,'owner282');
 assert.match(result.transportId,/^tx-[a-f0-9]{32}$/);x.shutdown();
});
test('28.1 concurrent request registration is one-use',async()=>{
 const f=fixture(),x=await f.make();
 const r=await Promise.all(Array.from({length:20},()=>x.registerAuthenticatedUpgrade(f.request)));
 assert.equal(r.filter(Boolean).length,1);x.shutdown();
});
test('28.2 explicit revocation and shutdown cannot revive old request',async()=>{
 const f=fixture(),x=await f.make();
 await x.registerAuthenticatedUpgrade(f.request);
 assert.equal(x.revoke(f.request),true);
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),false);
 assert.equal(await x.resolveBackendAdmission(f.request),null);
 assert.equal(x.shutdown(),true);assert.equal(x.shutdown(),false);
});
test('28.2 staging loss remains denied even if operator restores variable',async()=>{
 const f=fixture(),x=await f.make();await x.registerAuthenticatedUpgrade(f.request);
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(await x.resolveBackendAdmission(f.request),null)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(await x.resolveBackendAdmission(f.request),null);x.shutdown();
});
test('28.2 session clock rollback and expiry deny admission',async()=>{
 const f=fixture(),x=await f.make();await x.registerAuthenticatedUpgrade(f.request);
 f.rewind();assert.equal(await x.resolveBackendAdmission(f.request),null);x.shutdown();
 const g=fixture(),y=await g.make();await y.registerAuthenticatedUpgrade(g.request);
 g.expire();assert.equal(await y.resolveBackendAdmission(g.request),null);y.shutdown();
});
test('28.2 revoke while read is pending never leaks static Questbook snapshot',async()=>{
 const f=fixture(),{x,accepted,proof}=await bind(f);
 await accepted.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext});
 f.pause();const task=accepted.ingress211.receive({serverTransportContext:proof.serverTransportContext,rawFrame:readFrame(1)});
 for(let i=0;i<50&&f.reads===0;i++)await new Promise(done=>setImmediate(done));
 assert.equal(f.reads,1);x.revoke(f.request);f.resume();
 assert.equal((await task).ok,false);x.shutdown();
});

const waitVerify=async(f,target)=>{
 for(let i=0;i<100&&f.verifications<target;i++)
  await new Promise(resolve=>setImmediate(resolve));
 assert.ok(f.verifications>=target);
};

test('28.3 explicit revocation DURING registration blocks late authentication',async()=>{
 const f=fixture(),x=await f.make();f.pauseAuthentication();
 const task=x.registerAuthenticatedUpgrade(f.request);
 await waitVerify(f,1);
 assert.equal(x.revoke(f.request),true);
 f.releaseAuthentication();
 assert.equal(await task,false);
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),false);
 assert.equal(await x.resolveBackendAdmission(f.request),null);
 x.shutdown();
});
test('28.4 shutdown during registration cannot resurrect the old request',async()=>{
 const f=fixture(),x=await f.make();f.pauseAuthentication();
 const task=x.registerAuthenticatedUpgrade(f.request);
 await waitVerify(f,1);assert.equal(x.shutdown(),true);
 f.releaseAuthentication();assert.equal(await task,false);
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),false);
});
test('28.5 revoke during asynchronous reattestation never leaks original admission',async()=>{
 const f=fixture(),x=await f.make();
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),true);
 f.pauseAuthentication();const task=x.resolveBackendAdmission(f.request);
 await waitVerify(f,2);
 assert.equal(x.revoke(f.request),true);
 f.releaseAuthentication();assert.equal(await task,null);
 assert.equal(await x.resolveBackendAdmission(f.request),null);
});
test('28.6 unauthenticated first attempt does not burn registered world session',async()=>{
 const f=fixture(),x=await f.make();
 assert.equal(await x.registerAuthenticatedUpgrade(f.impostor),false);
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),true);
 assert.ok(await x.resolveBackendAdmission(f.request));
 assert.equal(f.attaches,0);x.shutdown();
});
test('28.7 unrelated request revocation cannot erase legitimate registration',async()=>{
 const f=fixture(),x=await f.make();
 assert.equal(await x.registerAuthenticatedUpgrade(f.request),true);
 assert.equal(x.revoke(f.impostor),false);
 assert.ok(await x.resolveBackendAdmission(f.request));x.shutdown();
});
test('28.8 concurrent authenticating request and a clone cannot share a session',async()=>{
 const f=fixture(),x=await f.make();f.pauseAuthentication();
 const pending=x.registerAuthenticatedUpgrade(f.request);
 await waitVerify(f,1);
 assert.equal(await x.registerAuthenticatedUpgrade(f.impostor),false);
 f.releaseAuthentication();assert.equal(await pending,true);
 assert.equal(await x.resolveBackendAdmission(f.impostor),null);
 assert.ok(await x.resolveBackendAdmission(f.request));x.shutdown();
});
test('29.0 composed private loopback admission independently registers on demand',async()=>{
 const f=fixture(),auto=await f.auto();
 const admission=await resolvePrivateLoopbackAdmission226({request:f.request,
  resolveBackendAdmission:auto.resolveBackendAdmission,now:()=>T});
 assert.ok(admission);assert.equal(admission.scope.ownerId,'owner282');
 assert.match(admission.transportId,/^tx-[a-f0-9]{32}$/);
 assert.equal(admission.ingress211.version,'21.1');
 assert.equal(auto.publicRouteInstalled,false);
 assert.equal(auto.listenerInstalled,false);
 assert.equal(auto.resumeCombatAuthorized,false);
 auto.shutdown();
});
test('29.1 forged first upgrade cannot prevent valid one-use admission',async()=>{
 const f=fixture(),auto=await f.auto();
 assert.equal(await auto.resolveBackendAdmission(f.impostor),null);
 assert.ok(await auto.resolveBackendAdmission(f.request));
 assert.equal(await auto.resolveBackendAdmission(f.request),null);
 auto.shutdown();
});
test('29.1 simultaneous upgrade attempts produce at most one candidate',async()=>{
 const f=fixture(),auto=await f.auto();
 const values=await Promise.all(Array.from({length:40},()=>
  auto.resolveBackendAdmission(f.request)));
 assert.equal(values.filter(Boolean).length,1);
 assert.equal(f.attaches,0);auto.shutdown();
});
test('29.2 explicit factory shutdown during pending registration denies admission',async()=>{
 const f=fixture(),auto=await f.auto();f.pauseAuthentication();
 const pending=auto.resolveBackendAdmission(f.request);
 await waitVerify(f,1);
 assert.equal(auto.shutdown(),true);
 f.releaseAuthentication();assert.equal(await pending,null);
 assert.equal(await auto.resolveBackendAdmission(f.request),null);
});
