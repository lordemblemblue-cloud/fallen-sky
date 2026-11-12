import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestTrustedAdmission249}
 from '../privateQuestTrustedAdmission249.mjs';
import {resolvePrivateLoopbackAdmission226}
 from '../privateLoopbackAdmission226.mjs';

const BASE=1793720000000;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const legalFrame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});
function fixture({ownerId='accountA',badStage=false}={}){
 let t=BASE,active=true,world=true,leaseNonce='11111111-1111-4111-8111-111111111111';
 let resolvers=0,attaches=0,readCount=0,closed=false,failRead=false,rollExpiry=false,collide=false,hang=false,holdReads=false,releaseRead=null,rotateWhich=null,mutateDuringAuth=false,clockThrows=false;
 const contexts=[];
 const scope={ownerId,characterId:ownerId+'Hero',
  instanceId:'world-session-'+ownerId,instanceEpoch:'epoch-0001',
  mapFingerprint:'a'.repeat(64)};
 const originalRequest={original:true};
 const trustedRequest={privateSocket:true};
 const serverTransportContext={role:'transport'},serverReconnectContext={role:'reconnect'},
  serverReadContext={role:'read'};
 const rotatedTransportContext={role:'transport-rotated'};
 const rotatedReconnectContext={role:'reconnect-rotated'};
 const rotatedReadContext={role:'read-rotated'};
 const trusted=new Set([serverTransportContext,serverReconnectContext,serverReadContext,
  rotatedTransportContext,rotatedReconnectContext,rotatedReadContext]);
 const originalLease=()=>({ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  serverSessionId:'server-session-0001',actionSessionId:'qb174-'+'f'.repeat(64),
  leaseNonce,expiresAtMs:BASE+60000});
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return world&&serverRequestContext===originalRequest?originalLease():null;
  }};
 const pairing180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(context){
   if(mutateDuringAuth&&contexts.length)
    contexts.at(-1).serverTransportContext=rotatedTransportContext;
   return trusted.has(context)&&active?{authenticated:true,
    identitySource:'trusted-server-session',accountId:ownerId,
    characterId:scope.characterId,serverSessionId:'server-session-0001',
    expiresAtMs:BASE+50000}:null;
  },
  async resolveVerifiedBase44ActionSession(context){
   return trusted.has(context)&&active?{authenticated:true,
    identitySource:'base44-verified-action-session-179',accountId:ownerId,
    characterId:scope.characterId,worldSessionId:'server-session-0001',
    actionSessionId:'qb174-'+'f'.repeat(64),expiresAtMs:BASE+50000}:null;
  },
  async verifySessionActive(){return active&&world},
 };
 const questTransport199={version:badStage?'19.8':'19.9',
  privateServerOnly:true,publicRouteInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  async attach({serverReconnectContext:context}){
   attaches++;
   if(context!==serverReconnectContext||!active||!world)return {ok:false};
   return {ok:true,version:'19.9',transportBindingCreated:false,
    resumeCombatAuthorized:false,privateHandle:{get active(){return !closed},
     close(){closed=true},async read({serverReadContext:context,frame}){
      readCount++;
      if(holdReads)await new Promise(resolve=>releaseRead=resolve);
      if(failRead||context!==serverReadContext||!active||!world||
         frame?.op!=='questbook.read')return {ok:false};
      return {ok:true,operation:'questbook.snapshot',seq:frame.seq,
       staticReconnectSnapshot:true,transportBindingCreated:false,
       worldLeaseRestored:false,resumeCombatAuthorized:false,rewardsIssued:false,
       objectives:[{questId:'quest_'+ownerId,objectiveId:'first_kill',
        type:'kill',status:'accepted',current:1,required:2,hiddenNonce:'secret'}]};
     }} };
  },
 };
 const resolvePrivateBackendContext249=async request=>{
  resolvers++;
  if(hang)return new Promise(()=>{});
  if(request!==trustedRequest||!active)return null;
  const result={authenticated:true,
   identitySource:'trusted-private-backend-context-249',ownerId,
   characterId:scope.characterId,expiresAtMs:BASE+(rollExpiry?32000:30000),
   serverTransportContext:rotateWhich==='transport'?rotatedTransportContext:serverTransportContext,
   serverReconnectContext:rotateWhich==='reconnect'?rotatedReconnectContext:serverReconnectContext,
   serverReadContext:collide?serverTransportContext:
    rotateWhich==='read'?rotatedReadContext:serverReadContext};
  contexts.push(result);
  return result;
 };
 const create=()=>createGame3DPrivateQuestTrustedAdmission249({enabled:true,
  pairing180,worldStage180,serverRequestContext:originalRequest,scope,
  questTransport199,resolvePrivateBackendContext249,now:()=>{if(clockThrows)throw Error('clock unavailable');return t},
  attestationTimeoutMs:100});
 return {create,trustedRequest,originalRequest,scope,questTransport199,
  get attaches(){return attaches},get reads(){return readCount},
  get resolvers(){return resolvers},
  logout(){active=false},rotateWorld(){leaseNonce='22222222-2222-4222-8222-222222222222'},
  replaceWorld(){world=false},expire(){t=BASE+30001},rollExpiry(){rollExpiry=true},
  failRead(){failRead=true},rewind(){t=BASE-1},restore(){t=BASE},
  collide(){collide=true},hang(){hang=true},rotateContext(kind){rotateWhich=kind},
  breakClock(){clockThrows=true},
  mutateDuringAuth(){mutateDuringAuth=true},stopMutating(){mutateDuringAuth=false},
  mutateFirstResult(){if(contexts[0])contexts[0].serverTransportContext=rotatedTransportContext},
  pauseReads(){holdReads=true},releaseRead(){holdReads=false;releaseRead?.()},
 };
}
async function admitted(f){const provider=await f.create();
 const candidate=await provider.resolveBackendAdmission(f.trustedRequest);
 return {provider,candidate};}

 test('24.9 default deny requires staging and original pairing',async()=>{
  await assert.rejects(createGame3DPrivateQuestTrustedAdmission249(),/24.9/);
  const f=fixture({badStage:true});
  await assert.rejects(f.create(),/24.9/);
 });
 test('25.0 server-minted transport ID is private and not client-selected',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  assert.ok(candidate);
  assert.equal(candidate.scope.ownerId,'accountA');
  assert.equal(Object.hasOwn(candidate,'transportId'),false);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.match(proof.transportId,/^tx-[0-9a-f]{32}$/);
  assert.equal(JSON.stringify(candidate).includes('11111111-1111'),false);
  assert.equal(proof.expiresAtMs,BASE+30000);
  provider.shutdown();
 });
 test('25.1 original 18.0 verified identity and session lease required',async()=>{
  const f=fixture(),provider=await f.create();
  assert.equal(await provider.resolveBackendAdmission({browser:true}),null);
  const valid=await provider.resolveBackendAdmission(f.trustedRequest);
  assert.ok(valid);
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
  provider.shutdown();
 });
 test('25.2 trusted backend re-attests and can read original 21.1 sanitized Questbook',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  const bound=await candidate.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext});
  assert.equal(bound.ok,true);assert.equal(f.attaches,1);
  const snapshot=await candidate.ingress211.receive({serverTransportContext:proof.serverTransportContext,
   rawFrame:legalFrame(1)});
  assert.equal(snapshot.ok,true);
  assert.equal(JSON.parse(snapshot.payload).objectives[0].questId,'quest_accountA');
  assert.equal(snapshot.payload.includes('hiddenNonce'),false);
  assert.equal(snapshot.rewardsIssued,false);assert.equal(snapshot.resumeCombatAuthorized,false);
  provider.shutdown();
 });
 test('25.3 one trusted original reconnect, never a second ticket consumption',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.equal((await candidate.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext})).ok,true);
  assert.equal((await candidate.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext})).ok,false);
  assert.equal(f.attaches,1);
  provider.shutdown();
 });
 test('25.4 logout revokes private attest and Questbook read independently',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const p=await candidate.authenticateUpgrade(f.trustedRequest);
  await candidate.ingress211.bind({serverTransportContext:p.serverTransportContext,
   serverReconnectContext:p.serverReconnectContext});
  f.logout();
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  assert.equal((await candidate.ingress211.receive({serverTransportContext:p.serverTransportContext,
   rawFrame:legalFrame(1)})).ok,false);
  provider.shutdown();
 });
 test('25.5 original world lease rotation refuses already-attested principal',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  f.rotateWorld();
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  provider.shutdown();
 });
 test('25.5 expired private transport cannot extend its initial lifetime',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  f.rollExpiry();
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  provider.shutdown();
 });
 test('25.6 strict signed-in account/character pairing on separate sessions',async()=>{
  const a=fixture({ownerId:'accountA'}),b=fixture({ownerId:'accountB'});
  const A=await admitted(a),B=await admitted(b);
  const pa=await A.candidate.authenticateUpgrade(a.trustedRequest),
   pb=await B.candidate.authenticateUpgrade(b.trustedRequest);
  assert.notEqual(pa.transportId,pb.transportId);
  assert.equal(pa.ownerId,'accountA');assert.equal(pb.ownerId,'accountB');
  assert.equal(await A.candidate.authenticateUpgrade(b.trustedRequest),null);
  assert.equal(await B.candidate.authenticateUpgrade(a.trustedRequest),null);
  A.provider.shutdown();B.provider.shutdown();
 });
 test('25.7 actual original 22.6 admission interface composes the trusted provider',async()=>{
  const f=fixture(),provider=await f.create();
  const result=await resolvePrivateLoopbackAdmission226({request:f.trustedRequest,
   resolveBackendAdmission:provider.resolveBackendAdmission,now:()=>BASE});
  assert.equal(result.scope.ownerId,'accountA');
  assert.match(result.transportId,/^tx-[a-f0-9]{32}$/);
  assert.equal(result.ingress211.version,'21.1');
  assert.equal(result.ingress211.publicRouteInstalled,false);
  provider.shutdown();
 });
 test('25.8 unknown original world and expired original pairing fail closed',async()=>{
  const f=fixture();f.replaceWorld();
  await assert.rejects(f.create(),/19.1/);
 });
 test('25.9 provider shutdown is idempotent and rejects late contexts',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  assert.equal(provider.shutdown(),true);assert.equal(provider.shutdown(),false);
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
 });
 test('26.0 no attack, movement, reward or public route in original reader',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const p=await candidate.authenticateUpgrade(f.trustedRequest);
  await candidate.ingress211.bind({serverTransportContext:p.serverTransportContext,
   serverReconnectContext:p.serverReconnectContext});
  assert.equal((await candidate.ingress211.receive({serverTransportContext:p.serverTransportContext,
   rawFrame:JSON.stringify({v:1,seq:1,op:'combat.attack'})})).ok,false);
  assert.equal(candidate.ingress211.publicRouteInstalled,false);
  assert.equal(candidate.ingress211.resumeCombatAuthorized,false);
  provider.shutdown();
 });

 test('25.1 clock rollback permanently invalidates any trusted transport',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  f.rewind();
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  f.restore();
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  provider.shutdown();
 });
 test('25.2 repeated or aliased trusted backend contexts cannot prove identity',async()=>{
  const f=fixture(),provider=await f.create();f.collide();
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
  provider.shutdown();
 });
 test('25.2 independent backend resolver must finish within bounded deadline',async()=>{
  const f=fixture(),provider=await f.create();f.hang();
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
  provider.shutdown();
 });

 test('25.4 concurrent trusted admission calls cannot fork an 18.9 ticket',async()=>{
  const f=fixture(),provider=await f.create();
  const attempts=await Promise.all([provider.resolveBackendAdmission(f.trustedRequest),
   provider.resolveBackendAdmission(f.trustedRequest)]);
  assert.equal(attempts.filter(Boolean).length,1);
  const candidate=attempts.find(Boolean);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.ok(proof);
  assert.equal((await candidate.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext})).ok,true);
  assert.equal(f.attaches,1);
  provider.shutdown();
 });

 test('25.5 logout while Questbook read is in flight never releases a snapshot',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  await candidate.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext});
  f.pauseReads();
  const pending=candidate.ingress211.receive({serverTransportContext:proof.serverTransportContext,
   rawFrame:legalFrame(1)});
  for(let n=0;n<50&&f.reads===0;n++)await new Promise(done=>setImmediate(done));
  assert.equal(f.reads,1);
  f.logout();f.releaseRead();
  const result=await pending;
  assert.equal(result.ok,false);assert.equal(Object.hasOwn(result,'payload'),false);
  provider.shutdown();
 });

 test('25.6 independently paired users read different private Questbook progress',async()=>{
  const a=fixture({ownerId:'accountA'}),b=fixture({ownerId:'accountB'});
  const A=await admitted(a),B=await admitted(b);
  const pa=await A.candidate.authenticateUpgrade(a.trustedRequest);
  const pb=await B.candidate.authenticateUpgrade(b.trustedRequest);
  assert.equal((await A.candidate.ingress211.bind({serverTransportContext:pa.serverTransportContext,
   serverReconnectContext:pa.serverReconnectContext})).ok,true);
  assert.equal((await B.candidate.ingress211.bind({serverTransportContext:pb.serverTransportContext,
   serverReconnectContext:pb.serverReconnectContext})).ok,true);
  const ra=await A.candidate.ingress211.receive({serverTransportContext:pa.serverTransportContext,
   rawFrame:legalFrame(1)});
  const rb=await B.candidate.ingress211.receive({serverTransportContext:pb.serverTransportContext,
   rawFrame:legalFrame(1)});
  assert.equal(JSON.parse(ra.payload).objectives[0].questId,'quest_accountA');
  assert.equal(JSON.parse(rb.payload).objectives[0].questId,'quest_accountB');
  assert.equal((await B.candidate.ingress211.receive({serverTransportContext:pa.serverTransportContext,
   rawFrame:legalFrame(2)})).ok,false);
  A.provider.shutdown();B.provider.shutdown();
 });

 test('25.7 malformed browser contexts cannot create authenticated backend identity',async()=>{
  const f=fixture(),provider=await f.create();
  for(const input of [{ownerId:'accountA',characterId:'accountAHero'},
   {headers:{origin:'https://qa.atomxe.example'}},{token:'test'},[],null,undefined,
   {__proto__:{authenticated:true}},{role:'read'},'string']){
   assert.equal(await provider.resolveBackendAdmission(input),null);
  }
  const candidate=await provider.resolveBackendAdmission(f.trustedRequest);
  assert.ok(candidate);
  provider.shutdown();
 });
 test('25.8 64 concurrent original admission attempts cannot fork a reconnect',async()=>{
  const f=fixture(),provider=await f.create();
  const attempts=await Promise.all(Array.from({length:64},()=>
   provider.resolveBackendAdmission(f.trustedRequest)));
  assert.equal(attempts.filter(Boolean).length,1);
  const candidate=attempts.find(Boolean);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  const bound=await candidate.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext});
  assert.equal(bound.ok,true);assert.equal(f.attaches,1);
  provider.shutdown();
 });

 test('26.1 trusted backend context object replacement invalidates original socket',async()=>{
  for(const kind of ['transport','reconnect','read']){
   const f=fixture(),{provider,candidate}=await admitted(f);
   f.rotateContext(kind);
   assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null,kind);
   provider.shutdown();
  }
 });
 test('26.2 a rotated context cannot read an already bound Questbook session',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const proof=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.equal((await candidate.ingress211.bind({
   serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext})).ok,true);
  f.rotateContext('read');
  const answer=await candidate.ingress211.receive({
   serverTransportContext:proof.serverTransportContext,rawFrame:legalFrame(1)});
  assert.equal(answer.ok,false);
  assert.equal(Object.hasOwn(answer,'payload'),false);
  provider.shutdown();
 });

 test('26.3 mutation of the initial resolver result cannot rewrite pinned trust',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const before=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.ok(before);
  f.mutateFirstResult();
  const after=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.ok(after);
  assert.equal(after.serverTransportContext,before.serverTransportContext);
  provider.shutdown();
 });
 test('26.4 mutation during asynchronous original pairing verification fails closed',async()=>{
  const f=fixture(),provider=await f.create();
  f.mutateDuringAuth();
  assert.equal(await provider.resolveBackendAdmission(f.trustedRequest),null);
  f.stopMutating();
  const candidate=await provider.resolveBackendAdmission(f.trustedRequest);
  assert.ok(candidate);
  provider.shutdown();
 });

 test('26.5 staging fence loss denies all future backend claims permanently',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  const before=await candidate.authenticateUpgrade(f.trustedRequest);
  assert.ok(before);
  process.env.GAME3D_PRIVATE_STAGING_ENV='production';
  try{assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null)}
  finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  provider.shutdown();
 });
 test('26.6 an unavailable backend clock denies transport authentication',async()=>{
  const f=fixture(),{provider,candidate}=await admitted(f);
  f.breakClock();
  assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
  provider.shutdown();
 });

test('26.7 loss of staging flag during a queued read never returns progress',async()=>{
 const f=fixture(),{provider,candidate}=await admitted(f);
 const proof=await candidate.authenticateUpgrade(f.trustedRequest);
 assert.equal((await candidate.ingress211.bind({
  serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext})).ok,true);
 f.pauseReads();
 const pending=candidate.ingress211.receive({
  serverTransportContext:proof.serverTransportContext,rawFrame:legalFrame(1)});
 for(let n=0;n<50&&f.reads===0;n++)await new Promise(done=>setImmediate(done));
 assert.equal(f.reads,1);
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 // Keep the unexpected staging loss visible to the authority before restoring.
 try { f.releaseRead();assert.equal((await pending).ok,false) }
 finally {process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(await candidate.authenticateUpgrade(f.trustedRequest),null);
 provider.shutdown();
});
test('26.8 backend resolver stalls after connection: read fails closed',async()=>{
 const f=fixture(),{provider,candidate}=await admitted(f);
 const proof=await candidate.authenticateUpgrade(f.trustedRequest);
 assert.equal((await candidate.ingress211.bind({
  serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext})).ok,true);
 f.hang();
 const denied=await candidate.ingress211.receive({
  serverTransportContext:proof.serverTransportContext,rawFrame:legalFrame(1)});
 assert.equal(denied.ok,false);assert.equal(Object.hasOwn(denied,'payload'),false);
 provider.shutdown();
});
