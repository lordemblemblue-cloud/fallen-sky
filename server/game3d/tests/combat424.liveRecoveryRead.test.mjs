// Combat / Quest 41.4–42.4: private recovery live-world tests, mock-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateRecoveryAdmission383} from '../privateRecoveryAdmission383.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const step=()=>new Promise(resolve=>setImmediate(resolve));
async function entered(check){
 for(let i=0;i<120&&!check();i++)await step();
 assert.ok(check(),'expected original operation');
}
function fixture(){
 const context={worker:'original-424'},request={original:'node-upgrade'};
 const scope={ownerId:'ownerA',characterId:'heroA',
  instanceId:'instance-424',instanceEpoch:'original-epoch-424'};
 let current=T,checks=0,auth=0,closed=0,revoked=0;
 let rotated=false,loggedOut=false,holdAt=Infinity,release;
 let authHeld=false,releaseAuth,denyOriginal=false;
 const admission={scope,ingress211:{version:'21.1',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,bind:async()=>({ok:true}),
  receive:async()=>({ok:true}),close(){closed++}},
  authenticateUpgrade:async incoming=>{
   auth++;
   if(authHeld)await new Promise(resolve=>releaseAuth=resolve);
   return incoming===request&&!denyOriginal?{verified:true}:null;
  }};
 const verifyOriginalReplacement383=async incoming=>{
  checks++;
  if(checks===holdAt)await new Promise(resolve=>release=resolve);
  if(incoming!==request||loggedOut)return null;
  return {authenticated:true,identitySource:'trusted-original-worker-recovery-383',
   ...scope,instanceEpoch:rotated?'rotated-epoch-424':scope.instanceEpoch,
   expiresAtMs:T+25000,serverWorkerContext:context};
 };
 const options=(extra={})=>({enabled:true,serverWorkerContext:context,
  verifyOriginalReplacement383,resolveOriginalBackendAdmission:async()=>admission,
  revokeOriginalAdmission:()=>{revoked++},now:()=>current,
  timeoutMs:300,liveCheckTimeoutMs:200,...extra});
 return {request,scope,options,
  get checks(){return checks},get auth(){return auth},
  get closed(){return closed},get revoked(){return revoked},
  rotate(){rotated=true},logout(){loggedOut=true},
  move(t){current=t},holdAt(n){holdAt=n},resume(){release?.()},
  blockOriginal(){authHeld=true},resumeOriginal(){releaseAuth?.()},
  rejectOriginal(){denyOriginal=true}};
}
async function open(f=fixture(),extra={}){
 const recovery=createPrivateRecoveryAdmission383(f.options(extra));
 const auth=await recovery.resolveBackendAdmission(f.request);
 assert.ok(auth);assert.equal(f.checks,2);
 return {f,recovery,auth};
}
test('41.4 every original auth revalidates world before and after',async()=>{
 const {f,recovery,auth}=await open();
 assert.deepEqual(await auth.authenticateUpgrade(f.request),{verified:true});
 assert.equal(f.checks,4);assert.equal(f.auth,1);
 assert.deepEqual(await auth.authenticateUpgrade(f.request),{verified:true});
 assert.equal(f.checks,6);
 recovery.shutdown();
});
test('41.5 world rotation and logout revoke original read access',async()=>{
 for(const action of ['rotate','logout']){
  const {f,recovery,auth}=await open();
  f[action]();
  assert.equal(await auth.authenticateUpgrade(f.request),null);
  assert.equal(recovery.inspect().active,0);
  assert.equal(f.closed,1);assert.equal(f.revoked,1);
  recovery.shutdown();
 }
});
test('41.6 changed request identity never reuses an earlier session',async()=>{
 const {f,recovery,auth}=await open();
 assert.equal(await auth.authenticateUpgrade({...f.request}),null);
 assert.equal(await auth.authenticateUpgrade(f.request),null);
 assert.equal(f.auth,0);
 assert.equal(recovery.inspect().active,0);
 recovery.shutdown();
});
test('41.7 server rollback fails closed after earlier authenticated read',async()=>{
 const {f,recovery,auth}=await open();
 assert.deepEqual(await auth.authenticateUpgrade(f.request),{verified:true});
 f.move(T-1);
 assert.equal(await auth.authenticateUpgrade(f.request),null);
 assert.equal(recovery.inspect().active,0);
 recovery.shutdown();
});
test('41.8 parallel live verification attempts revoke the guarded read',async()=>{
 const {f,recovery,auth}=await open();
 f.holdAt(3);
 const pending=auth.authenticateUpgrade(f.request);
 await entered(()=>f.checks===3);
 assert.equal(await auth.authenticateUpgrade(f.request),null);
 f.resume();
 assert.equal(await pending,null);
 assert.equal(f.closed,1);assert.equal(f.revoked,1);
 recovery.shutdown();
});
test('41.9 bounded live verification timeout never authorizes a late response',async()=>{
 const {f,recovery,auth}=await open(fixture(),{liveCheckTimeoutMs:100});
 f.holdAt(3);
 const pending=auth.authenticateUpgrade(f.request);
 await entered(()=>f.checks===3);
 assert.equal(await pending,null);
 assert.ok(recovery.inspect().liveTimeouts>=1);
 f.resume();await step();
 assert.equal(recovery.inspect().active,0);
 recovery.shutdown();
});

test('42.0 original backend denial is never masked by valid current world',async()=>{
 const {f,recovery,auth}=await open();
 f.rejectOriginal();
 assert.equal(await auth.authenticateUpgrade(f.request),null);
 assert.equal(f.checks,3);assert.equal(f.auth,1);
 assert.equal(recovery.inspect().active,0);recovery.shutdown();
});
test('42.1 world rotation DURING original authenticateUpgrade is rejected',async()=>{
 const {f,recovery,auth}=await open();
 f.blockOriginal();const pending=auth.authenticateUpgrade(f.request);
 await entered(()=>f.auth===1);f.rotate();f.resumeOriginal();
 assert.equal(await pending,null);
 assert.equal(f.checks,4);
 assert.equal(recovery.inspect().active,0);recovery.shutdown();
});
test('42.2 shutdown during pending verification cannot restore original transport',async()=>{
 const {f,recovery,auth}=await open();
 f.holdAt(3);const pending=auth.authenticateUpgrade(f.request);
 await entered(()=>f.checks===3);
 assert.equal(recovery.shutdown(),true);
 f.resume();assert.equal(await pending,null);
 assert.equal(f.closed,1);assert.equal(f.revoked,1);
});
test('42.3 recovery metrics contain counts, never original player identities',async()=>{
 const {f,recovery,auth}=await open();
 await auth.authenticateUpgrade(f.request);
 const metrics=recovery.inspect();
 assert.equal(metrics.liveChecks,1);
 assert.equal(metrics.liveDenials,0);
 assert.equal(metrics.liveInFlight,0);
 assert.equal(JSON.stringify(metrics).includes('ownerA'),false);
 recovery.shutdown();
});
test('42.4 losing private staging environment permanently revokes a read',async()=>{
 const {f,recovery,auth}=await open();
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(await auth.authenticateUpgrade(f.request),null)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(recovery.inspect().active,0);
 assert.equal(await auth.authenticateUpgrade(f.request),null);
 assert.equal(f.revoked,1);recovery.shutdown();
});

test('42.3 two authenticated local users keep separate live recovery scopes',async()=>{
 const worker={role:'two-user-424'},rows=new Map();
 function user(ownerId){
  const request={ownerId};
  const row={request,scope:{ownerId,characterId:ownerId+'Hero',
   instanceId:'same-world-424',instanceEpoch:'same-epoch-424'},
   revoked:false,reads:0,closes:0};
  rows.set(request,row);return row;
 }
 const a=user('ownerA'),b=user('ownerB');
 const gate=createPrivateRecoveryAdmission383({enabled:true,
  serverWorkerContext:worker,now:()=>T,timeoutMs:300,
  resolveOriginalBackendAdmission:async request=>{
   const row=rows.get(request);if(!row)return null;
   return {scope:row.scope,ingress211:{
    version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
    transportBindingCreated:false,resumeCombatAuthorized:false,
    bind:async()=>({ok:true}),receive:async()=>({ok:true}),
    close(){row.closes++}},
    authenticateUpgrade:async()=>{row.reads++;return {owner:row.scope.ownerId}}};
  },
  verifyOriginalReplacement383:async request=>{
   const row=rows.get(request);
   return !row||row.revoked?null:{authenticated:true,
    identitySource:'trusted-original-worker-recovery-383',...row.scope,
    expiresAtMs:T+25000,serverWorkerContext:worker};
  },
 });
 const aAuth=await gate.resolveBackendAdmission(a.request);
 const bAuth=await gate.resolveBackendAdmission(b.request);
 assert.ok(aAuth&&bAuth);
 a.revoked=true;
 assert.equal(await aAuth.authenticateUpgrade(a.request),null);
 assert.deepEqual(await bAuth.authenticateUpgrade(b.request),{owner:'ownerB'});
 assert.equal(gate.inspect().active,1);
 assert.equal(a.closes,1);assert.equal(b.closes,0);
 gate.shutdown();assert.equal(b.closes,1);
});
