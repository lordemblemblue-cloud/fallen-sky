import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateBackendIdentity293} from '../privateBackendIdentity293.mjs';
import {createPrivateVerifiedLoopbackGateway298}
 from '../privateVerifiedLoopbackGateway298.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const frame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});
const wait=async fn=>{
 for(let i=0;i<100&&!fn();i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(fn(),'awaited backend callback was not entered');
};
function fixture({ownerId='ownerA'}={}){
 let time=T,online=true,sourceOk=true,wrong=false,rotate=false,expiry=T+30000,
  calls=0,delayed=false,release=null,backendThrows=false;
 const scope={ownerId,characterId:ownerId+'Hero',instanceId:'world-302',
  instanceEpoch:'epoch-302',mapFingerprint:'c'.repeat(64)};
 const original={kind:'server-original'},request={kind:'genuine-upgrade'},clone={kind:'genuine-upgrade'};
 const base={serverTransportContext:{role:'transport'},serverReconnectContext:{role:'reconnect'},
  serverReadContext:{role:'read'}};
 const alt={serverTransportContext:{role:'new-transport'},serverReconnectContext:{role:'new-reconnect'},
  serverReadContext:{role:'new-read'}};
 const trusted=new Set([...Object.values(base),...Object.values(alt)]);
 const pairing180={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(ctx){return online&&trusted.has(ctx)?{
   authenticated:true,identitySource:'trusted-server-session',accountId:scope.ownerId,
   characterId:scope.characterId,serverSessionId:'session-302',expiresAtMs:T+60000}:null},
  async resolveVerifiedBase44ActionSession(ctx){return online&&trusted.has(ctx)?{
   authenticated:true,identitySource:'base44-verified-action-session-179',
   accountId:scope.ownerId,characterId:scope.characterId,
   worldSessionId:'session-302',actionSessionId:'qb174-'+'a'.repeat(64),
   expiresAtMs:T+60000}:null},
  async verifySessionActive(){return online},
 };
 const worldStage180={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return online&&serverRequestContext===original?{
    ownerId:scope.ownerId,characterId:scope.characterId,
    worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
    serverSessionId:'session-302',actionSessionId:'qb174-'+'a'.repeat(64),
    leaseNonce:'11111111-1111-4111-8111-111111111111',expiresAtMs:T+60000}:null},
 };
 let attached=0;
 const questTransport199={version:'19.9',privateServerOnly:true,publicRouteInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  async attach({serverReconnectContext}){
   attached++;
   if(serverReconnectContext!==base.serverReconnectContext||!online)return {ok:false};
   let closed=false;
   return {ok:true,version:'19.9',transportBindingCreated:false,
    resumeCombatAuthorized:false,privateHandle:{
     get active(){return online&&!closed},close(){closed=true},
     async read({serverReadContext,frame}){
      if(!online||closed||serverReadContext!==base.serverReadContext)return {ok:false};
      return {ok:true,operation:'questbook.snapshot',seq:frame.seq,
       staticReconnectSnapshot:true,transportBindingCreated:false,
       worldLeaseRestored:false,resumeCombatAuthorized:false,rewardsIssued:false,
       objectives:[{questId:'quest_'+ownerId,objectiveId:'wolf',type:'kill',
        status:'accepted',current:1,required:2,secret:'backend-only'}]};
     },
    }};
  },
 };
 const verifyServerSession293=async req=>{
  calls++;
  if(delayed)await new Promise(done=>release=done);
  if(backendThrows)throw Error('backend failed');
  if(req!==request||!online||!sourceOk)return null;
  return {authenticated:true,identitySource:'original-base44-world-session-293',
   ownerId:wrong?'other-account':scope.ownerId,characterId:scope.characterId,
   expiresAtMs:expiry,...(rotate?alt:base)};
 };
 const options=()=>({enabled:true,scope,serverRequestContext:original,pairing180,
  worldStage180,questTransport199,verifyServerSession293,now:()=>time,
  timeoutMs:100,attestationTimeoutMs:100});
 const identity=()=>createPrivateBackendIdentity293(options());
 const gateway=()=>createPrivateVerifiedLoopbackGateway298(options());
 return {scope,request,clone,original,base,options,identity,gateway,
  get calls(){return calls},get attached(){return attached},
  logout(){online=false},login(){online=true},sourceFail(){sourceOk=false},sourceRestore(){sourceOk=true},
  throwBackend(){backendThrows=true},changeOwner(){wrong=true},
  rotateContexts(){rotate=true},shorten(){expiry=T+29000},extend(){expiry=T+31000},
  expire(){time=T+30001},rewind(){time=T-1},
  pause(){delayed=true},resume(){delayed=false;release?.()},
 };
}
async function admitted(f){const g=await f.gateway();const a=await g.resolveBackendAdmission(f.request);
 assert.ok(a,'expected original 29.0 private admission');
 const proof=await a.authenticateUpgrade(f.request);assert.ok(proof);
 return {g,a,proof};}

test('29.3 disabled-by-default backend session validator',()=>{
 assert.throws(()=>createPrivateBackendIdentity293(),/29.3/);
 const f=fixture(),v=f.identity();assert.equal(v.publicRouteInstalled,false);
 assert.equal(v.realBackendSessionConnected,false);v.shutdown();
});
test('29.3 rejects forged browser objects without a signed-in backend receipt',async()=>{
 const f=fixture(),v=f.identity();
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.clone),null);
 assert.equal(await v.verifyAuthenticatedUpgrade271({ownerId:'ownerA',token:'fake'}),null);
 assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));v.shutdown();
});
test('29.4 exact account and character required',async()=>{
 const f=fixture(),v=f.identity();f.changeOwner();
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('29.4 independent signed-in verification is rechecked per request',async()=>{
 const f=fixture(),v=f.identity();assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));
 f.logout();assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);
 f.login();assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('29.5 same request cannot switch original context identities',async()=>{
 const f=fixture(),v=f.identity();assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));
 f.rotateContexts();assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('29.5 shorter expiry is allowed but never extended',async()=>{
 const f=fixture(),v=f.identity();assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));
 f.shorten();assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));
 f.extend();assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('29.6 revoke during pending backend attestation permanently refuses late result',async()=>{
 const f=fixture(),v=f.identity();f.pause();
 const task=v.verifyAuthenticatedUpgrade271(f.request);
 await wait(()=>f.calls===1);
 assert.equal(v.revoke(f.request),false);f.resume();assert.equal(await task,null);
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('29.6 shutdown during pending backend authentication fails closed',async()=>{
 const f=fixture(),v=f.identity();f.pause();
 const task=v.verifyAuthenticatedUpgrade271(f.request);
 await wait(()=>f.calls===1);assert.equal(v.shutdown(),true);
 f.resume();assert.equal(await task,null);assert.equal(v.shutdown(),false);
});
test('29.7 a hanging backend callback has a bounded timeout',async()=>{
 const f=fixture(),v=f.identity();f.pause();
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);
 v.shutdown();f.resume();
});
test('29.7 a failing backend callback returns no trusted identity',async()=>{
 const f=fixture(),v=f.identity();f.throwBackend();
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('29.8 original 18.0 and 29.0 chain yields a sanitized static Questbook',async()=>{
 const f=fixture(),{g,a,proof}=await admitted(f);
 assert.equal(g.listenerInstalled,false);
 assert.equal((await a.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext})).ok,true);
 const result=await a.ingress211.receive({serverTransportContext:proof.serverTransportContext,
  rawFrame:frame(1)});
 assert.equal(result.ok,true);assert.equal(JSON.parse(result.payload).objectives[0].questId,'quest_ownerA');
 assert.equal(result.payload.includes('backend-only'),false);assert.equal(f.attached,1);
 g.shutdown();
});
test('29.8 cloned upgrade cannot consume the genuine original world ticket',async()=>{
 const f=fixture(),g=await f.gateway();
 assert.equal(await g.resolveBackendAdmission(f.clone),null);
 assert.ok(await g.resolveBackendAdmission(f.request));
 assert.equal(await g.resolveBackendAdmission(f.request),null);g.shutdown();
});
test('29.9 50 simultaneous original requests produce at most one admitted session',async()=>{
 const f=fixture(),g=await f.gateway();
 const a=await Promise.all(Array.from({length:50},()=>g.resolveBackendAdmission(f.request)));
 assert.equal(a.filter(Boolean).length,1);g.shutdown();
});
test('30.0 server backend logout blocks original read after binding',async()=>{
 const f=fixture(),{g,a,proof}=await admitted(f);
 await a.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext});
 f.logout();assert.equal(await a.authenticateUpgrade(f.request),null);
 assert.equal((await a.ingress211.receive({serverTransportContext:proof.serverTransportContext,
  rawFrame:frame(1)})).ok,false);g.shutdown();
});
test('30.0 different original worlds remain account-isolated',async()=>{
 const f=fixture({ownerId:'ownerA'}),h=fixture({ownerId:'ownerB'});
 const A=await admitted(f),B=await admitted(h);
 assert.equal(A.a.scope.ownerId,'ownerA');assert.equal(B.a.scope.ownerId,'ownerB');
 assert.notEqual(A.proof.transportId,B.proof.transportId);
 assert.equal(await A.g.resolveBackendAdmission(h.request),null);
 A.g.shutdown();B.g.shutdown();
});
test('30.1 staging-flag removal irrevocably blocks backend verification',async()=>{
 const f=fixture(),v=f.identity();assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('30.1 bad clock denies backend verifier after a successful request',async()=>{
 const f=fixture(),v=f.identity();assert.ok(await v.verifyAuthenticatedUpgrade271(f.request));
 f.rewind();assert.equal(await v.verifyAuthenticatedUpgrade271(f.request),null);v.shutdown();
});
test('30.2 direct combat-command JSON cannot enter a read-only Questbook session',async()=>{
 const f=fixture(),{g,a,proof}=await admitted(f);
 await a.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext});
 assert.equal((await a.ingress211.receive({serverTransportContext:proof.serverTransportContext,
  rawFrame:JSON.stringify({v:1,seq:1,op:'combat.attack'})})).ok,false);g.shutdown();
});
