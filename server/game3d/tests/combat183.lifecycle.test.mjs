import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateWorldLeaseLifecycle183}
 from '../privateWorldLeaseLifecycle183.mjs';

const contextA=Object.freeze({private:'first-183'});
const contextB=Object.freeze({private:'second-183'});
const withStaging=async fn=>{
 const original=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  await fn();
 }finally{
  if(original===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=original;
 }
};
function fixture({revokeFailure=false,activationFailure=false,
 pauseRevoke=false,pauseActivation=false}={}){
 const events=[];
 let activeContext=null,handleNumber=0;
 let releasedRevoke,revokeEntered;
 let releasedActivation,activationEntered;
 const waitRevoke=new Promise(r=>{releasedRevoke=r});
 const enteredRevoke=new Promise(r=>{revokeEntered=r});
 const waitActivation=new Promise(r=>{releasedActivation=r});
 const enteredActivation=new Promise(r=>{activationEntered=r});
 const stage={version:'18.0',privateServerOnly:true,
  async open(){events.push('world.open');
   return {ok:true,handle:'world-handle-183-'+(++handleNumber)};},
  async close(){events.push('world.close');return {ok:true}},
  async beginWorldPairing(){events.push('world.begin');return {ok:true}},
  async completeWorldPairing(){events.push('world.complete');return {ok:true}},
  async revokeWorldPairing(){events.push('world.revoke');return {ok:true}},
  async sendWorldAction(){return {ok:true}},
  async recordNpcInteraction(){return {ok:true}},
  async shutdown(){events.push('world.shutdown');return {ok:true}},
 };
 const issuer={version:'18.3',privateServerOnly:true,publicRouteInstalled:false,
  async activate({serverRequestContext}){
   events.push('lease.activate');
   if(pauseActivation){activationEntered();await waitActivation;}
   if(activationFailure)return {ok:false};
   activeContext=serverRequestContext;
   return {ok:true};
  },
  async revoke({serverRequestContext}){
   events.push('lease.revoke');
   if(pauseRevoke){revokeEntered();await waitRevoke;}
   if(revokeFailure)return {ok:false};
   if(activeContext!==null)
    assert.equal(serverRequestContext,activeContext);
   activeContext=null;
   return {ok:true};
  },
  async shutdown(){events.push('lease.shutdown');activeContext=null;
   return {ok:true}},
 };
 const route={handle:async()=>{},async shutdown(){
  events.push('route.shutdown');
 }};
 const life=createGame3DPrivateWorldLeaseLifecycle183({
  worldStage180:stage,leaseIssuer183:issuer,route,enabled:true,
 });
 return {life,events,enteredRevoke,releaseRevoke:releasedRevoke,
  enteredActivation,releaseActivation:releasedActivation};
}
test('18.3 lifecycle fails closed outside the private staging environment',()=>{
 assert.throws(()=>createGame3DPrivateWorldLeaseLifecycle183(),/18\.3 lifecycle requires/);
});
test('18.3 replacing an open world revokes the old lease before world mutation',async()=>{
 await withStaging(async()=>{
  const f=fixture();
  const first=await f.life.openWorld({serverRequestContext:contextA});
  assert.equal(first.ok,true);
  f.events.length=0;
  const next=await f.life.openWorld({serverRequestContext:contextB});
  assert.equal(next.ok,true);
  assert.notEqual(next.handle,first.handle);
  assert.deepEqual(f.events,['lease.revoke','world.open','lease.activate']);
  await f.life.shutdown();
 });
});
test('18.3 failed DB revocation blocks world replacement and pairing changes',async()=>{
 await withStaging(async()=>{
  const f=fixture({revokeFailure:true});
  const open=await f.life.openWorld({serverRequestContext:contextA});
  assert.equal(open.ok,false);
  f.events.length=0;
  const attempted=await f.life.beginWorldPairing({
   serverRequestContext:contextB});
  assert.equal(attempted.ok,false);
  assert.equal(attempted.reason,'database_lease_revocation_unconfirmed');
  assert.deepEqual(f.events,['lease.revoke']);
  await f.life.shutdown();
 });
});
test('18.3 a slow revoke serializes a new open and pairing completion',async()=>{
 await withStaging(async()=>{
  const f=fixture({pauseRevoke:true});
  const retiring=f.life.beginWorldPairing({
   serverRequestContext:contextA});
  await f.enteredRevoke;
  const opening=f.life.openWorld({serverRequestContext:contextB});
  const completion=f.life.completeWorldPairing({
   serverRequestContext:contextB,proof:{},signature:'test'});
  // Neither operation can pass the still-unconfirmed DB revocation.
  assert.deepEqual(f.events,['lease.revoke']);
  f.releaseRevoke();
  assert.equal((await retiring).ok,true);
  assert.equal((await opening).ok,true);
  assert.equal((await completion).ok,true);
  assert.deepEqual(f.events,[
   'lease.revoke','world.begin',
   'lease.revoke','world.open','lease.activate',
   'world.complete']);
  await f.life.shutdown();
 });
});
test('18.3 a failed lease publication closes the world instead of returning a handle',async()=>{
 await withStaging(async()=>{
  const f=fixture({activationFailure:true});
  const response=await f.life.openWorld({serverRequestContext:contextA});
  assert.equal(response.ok,false);
  assert.equal(response.reason,'session_lease_not_published');
  assert.deepEqual(f.events,['lease.revoke','world.open',
   'lease.activate','world.close']);
  await f.life.shutdown();
 });
});
test('18.3 shutdown during a pending lease publication returns no usable world',async()=>{
 await withStaging(async()=>{
  const f=fixture({pauseActivation:true});
  const pending=f.life.openWorld({serverRequestContext:contextA});
  await f.enteredActivation;
  const finishing=f.life.shutdown();
  f.releaseActivation();
  const opened=await pending;
  assert.equal(opened.ok,false);
  assert.equal(opened.reason,'staging_closed');
  assert.equal((await finishing).ok,true);
  assert.deepEqual(f.events,[
   'lease.revoke','world.open','lease.activate','world.close',
   'lease.shutdown','route.shutdown','world.shutdown']);
 });
});
