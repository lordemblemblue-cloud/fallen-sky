import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DQuestWorldPairing180,signGame3DWorldPairing180}
 from '../privateQuestWorldPairing180.mjs';

const secret='only-staging-pairing-secret-'+'a'.repeat(40);
const actionSessionId='qb174-'+'a'.repeat(64);
const scope={ownerId:'owner180',characterId:'hero180',instanceId:'world-instance-180'};
const ctx=Object.freeze({privateServer:true});
const initially=1793668000000;
function fixture(){
 let time=initially,worldId='server-world-session-180',owner='owner180';
 let worldActive=true,baseActive=true;
 const api=createGame3DQuestWorldPairing180({scope,secret,enabled:true,now:()=>time,
  resolveTrustedWorldPrincipal:async c=>c===ctx?{authenticated:true,
   identitySource:'trusted-server-session',accountId:owner,
   characterId:'hero180',serverSessionId:worldId,expiresAtMs:time+45000}:null,
  verifyWorldSessionActive:async claim=>worldActive&&claim.serverSessionId===worldId,
  verifyBase44SessionActive:async claim=>baseActive&&claim.actionSessionId===actionSessionId});
 const signed=challenge=>{
  const proof={v:1,purpose:'base44-auth-me-world-pairing-180',
   ownerId:'owner180',characterId:'hero180',challenge,actionSessionId,
   issuedAtMs:time,expiresAtMs:time+12000};
  return {proof,signature:signGame3DWorldPairing180(secret,proof)};
 };
 const pair=async()=>{
  const begin=await api.begin({serverRequestContext:ctx});
  assert.equal(begin.ok,true);
  const signedProof=signed(begin.challenge);
  return {begin,...signedProof,result:await api.complete({serverRequestContext:ctx,...signedProof})};
 };
 return {api,ctx,pair,signed,advance:ms=>{time+=ms},
  setOwner:id=>{owner=id},setWorldId:id=>{worldId=id},
  setBaseActive:value=>{baseActive=value},setWorldActive:value=>{worldActive=value}};
}
test('18.0 fails closed until explicitly enabled with both independent session providers',()=>{
 assert.throws(()=>createGame3DQuestWorldPairing180(),/requires/);
 assert.throws(()=>createGame3DQuestWorldPairing180({scope,secret,enabled:true}),/requires/);
});
test('18.0 signs exact canonical proof; rejects extra attacker fields',()=>{
 const proof={v:1,purpose:'base44-auth-me-world-pairing-180',ownerId:'owner180',
  characterId:'hero180',challenge:'a'.repeat(64),actionSessionId,
  issuedAtMs:initially,expiresAtMs:initially+10000};
 assert.match(signGame3DWorldPairing180(secret,proof),/^[a-f0-9]{64}$/);
 assert.throws(()=>signGame3DWorldPairing180(secret,{...proof,worldSessionId:'from-browser'}),/invalid/);
});
test('18.0 independently binds verified Base44 action principal to trusted world session',async()=>{
 const f=fixture();const {result}=await f.pair();
 assert.equal(result.ok,true);assert.equal(result.rewardsIssued,false);
 const action=await f.api.resolveVerifiedBase44ActionSession(ctx);
 assert.equal(action.actionSessionId,actionSessionId);
 assert.equal(action.worldSessionId,'server-world-session-180');
 assert.equal(action.identitySource,'base44-verified-action-session-179');
 assert.equal(await f.api.verifySessionActive({ownerId:scope.ownerId,
  characterId:scope.characterId,instanceId:scope.instanceId,
  serverSessionId:action.worldSessionId,actionSessionId}),true);
});
test('18.0 rejects browser identity, forged signature and repeated one-use challenge',async()=>{
 const f=fixture();const first=await f.api.begin({serverRequestContext:ctx});
 const legitimate=f.signed(first.challenge);
 assert.equal((await f.api.complete({serverRequestContext:{},...legitimate})).ok,false);
 assert.equal((await f.api.complete({serverRequestContext:ctx,
  ...legitimate,signature:'0'.repeat(64)})).ok,false);
 assert.equal((await f.api.complete({serverRequestContext:ctx,
  ...legitimate,proof:{...legitimate.proof,ownerId:'attacker'}})).ok,false);
 assert.equal((await f.api.complete({serverRequestContext:ctx,...legitimate})).ok,true);
 assert.equal((await f.api.complete({serverRequestContext:ctx,...legitimate})).ok,false);
});
test('18.0 rejects revoked Base44 sessions and world leases without relying on client state',async()=>{
 const f=fixture();await f.pair();
 f.setBaseActive(false);assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
 f.setBaseActive(true);f.setWorldActive(false);
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
});
test('18.0 refuses a world session replacement, account switch and expired action',async()=>{
 const f=fixture();await f.pair();
 f.setWorldId('other-world-session-180');
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
 f.setWorldId('server-world-session-180');f.setOwner('attacker');
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
 f.setOwner('owner180');f.advance(13000);
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
});
test('18.0 one-time challenge expires even if signed for a valid session later',async()=>{
 const f=fixture();const started=await f.api.begin({serverRequestContext:ctx});
 const signed=f.signed(started.challenge);f.advance(15001);
 assert.equal((await f.api.complete({serverRequestContext:ctx,...signed})).ok,false);
});
test('18.0 explicit world revoke or process shutdown clears all bindings',async()=>{
 const f=fixture();await f.pair();
 assert.equal((await f.api.revoke({serverRequestContext:ctx})).ok,true);
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
 await f.pair();f.api.shutdown();
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
 assert.equal((await f.api.begin({serverRequestContext:ctx})).ok,false);
});
test('18.0 concurrent duplicate signed proof is consumed exactly once',async()=>{
 const f=fixture();const ch=await f.api.begin({serverRequestContext:ctx});
 const signed=f.signed(ch.challenge);
 const out=await Promise.all([
  f.api.complete({serverRequestContext:ctx,...signed}),
  f.api.complete({serverRequestContext:ctx,...signed})]);
 assert.equal(out.filter(x=>x.ok).length,1);
});
test('18.0 Node HMAC matches Base44 WebCrypto canonical signing contract',async()=>{
 const f=fixture(),started=await f.api.begin({serverRequestContext:ctx});
 const {proof,signature}=f.signed(started.challenge);
 const order=['v','purpose','ownerId','characterId','challenge','actionSessionId','issuedAtMs','expiresAtMs'];
 const text='game3d-world-pairing-180\n'+JSON.stringify(order.map(k=>proof[k]));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const actual=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))).toString('hex');
 assert.equal(actual,signature);
});

test('18.0 revocation while proof verification is pending cannot resurrect pairing',async()=>{
 let entered;const waiting=new Promise(resolve=>{entered=resolve});
 let release;const blocked=new Promise(resolve=>{release=resolve});
 const api=createGame3DQuestWorldPairing180({scope,secret,enabled:true,now:()=>initially,
  resolveTrustedWorldPrincipal:async c=>c===ctx?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId,characterId:scope.characterId,
   serverSessionId:'server-world-session-180',expiresAtMs:initially+30000}:null,
  verifyWorldSessionActive:async()=>true,
  verifyBase44SessionActive:async()=>{entered();return blocked}});
 const start=await api.begin({serverRequestContext:ctx});
 const proof={v:1,purpose:'base44-auth-me-world-pairing-180',ownerId:scope.ownerId,
  characterId:scope.characterId,challenge:start.challenge,actionSessionId,
  issuedAtMs:initially,expiresAtMs:initially+10000};
 const pending=api.complete({serverRequestContext:ctx,proof,
  signature:signGame3DWorldPairing180(secret,proof)});
 await waiting;
 assert.equal((await api.revoke({serverRequestContext:ctx})).ok,true);
 release(true);
 assert.equal((await pending).ok,false);
 assert.equal(await api.resolveVerifiedBase44ActionSession(ctx),null);
});

test('18.0 a new handshake retires the prior paired action and one-use proof',async()=>{
 const f=fixture();const first=await f.pair();
 assert.equal(first.result.ok,true);
 assert.ok(await f.api.resolveVerifiedBase44ActionSession(ctx));
 const next=await f.api.begin({serverRequestContext:ctx});
 assert.equal(next.ok,true);
 assert.equal(await f.api.resolveVerifiedBase44ActionSession(ctx),null);
 assert.equal((await f.api.complete({serverRequestContext:ctx,
  proof:first.proof,signature:first.signature})).ok,false);
 const latest=f.signed(next.challenge);
 assert.equal((await f.api.complete({serverRequestContext:ctx,...latest})).ok,true);
 assert.ok(await f.api.resolveVerifiedBase44ActionSession(ctx));
});
test('18.0 world revocation during async Base44 lookup cannot disclose an action session',async()=>{
 let worldActive=true,baseCalls=0,release;
 const blocked=new Promise(resolve=>{release=resolve});
 let entered;
 const waiting=new Promise(resolve=>{entered=resolve});
 const api=createGame3DQuestWorldPairing180({scope,secret,enabled:true,
  now:()=>initially,
  resolveTrustedWorldPrincipal:async c=>c===ctx?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId,characterId:scope.characterId,
   serverSessionId:'server-world-session-180',expiresAtMs:initially+30000}:null,
  verifyWorldSessionActive:async()=>worldActive,
  verifyBase44SessionActive:async()=>{
   baseCalls++;
   if(baseCalls===2){entered();return blocked;}
   return true;
  }});
 const begin=await api.begin({serverRequestContext:ctx});
 const proof={v:1,purpose:'base44-auth-me-world-pairing-180',
  ownerId:scope.ownerId,characterId:scope.characterId,
  challenge:begin.challenge,actionSessionId,
  issuedAtMs:initially,expiresAtMs:initially+10000};
 const paired=await api.complete({serverRequestContext:ctx,proof,
  signature:signGame3DWorldPairing180(secret,proof)});
 assert.equal(paired.ok,true);
 const pending=api.resolveVerifiedBase44ActionSession(ctx);
 await waiting;
 worldActive=false;release(true);
 assert.equal(await pending,null);
});
test('18.0 rechecks world liveness after Base44 liveness for bound actions',async()=>{
 let worldActive=true,started,release;
 const waiting=new Promise(resolve=>{started=resolve});
 const blocked=new Promise(resolve=>{release=resolve});
 let baseCalls=0;
 const api=createGame3DQuestWorldPairing180({scope,secret,enabled:true,
  now:()=>initially,
  resolveTrustedWorldPrincipal:async c=>c===ctx?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId,characterId:scope.characterId,
   serverSessionId:'server-world-session-180',expiresAtMs:initially+30000}:null,
  verifyWorldSessionActive:async()=>worldActive,
  verifyBase44SessionActive:async()=>{
   baseCalls++;
   if(baseCalls===2){started();return blocked;}
   return true;
  }});
 const begin=await api.begin({serverRequestContext:ctx});
 const proof={v:1,purpose:'base44-auth-me-world-pairing-180',
  ownerId:scope.ownerId,characterId:scope.characterId,
  challenge:begin.challenge,actionSessionId,
  issuedAtMs:initially,expiresAtMs:initially+10000};
 assert.equal((await api.complete({serverRequestContext:ctx,proof,
  signature:signGame3DWorldPairing180(secret,proof)})).ok,true);
 const pending=api.verifySessionActive({
  ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId,serverSessionId:'server-world-session-180',
  actionSessionId});
 await waiting;
 worldActive=false;release(true);
 assert.equal(await pending,false);
});
