import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateReconnectBackend189,
 RECONNECT_TICKET_READ_189}
 from '../privateReconnectBackend189.mjs';

const at=1793668000000;
const originalContext=Object.freeze({originalWorld:'server-context-189'});
const issuerContext=Object.freeze({privateAuth:'issuer-189'});
const reconnectContext=Object.freeze({privateAuth:'consumer-189'});
const scope=Object.freeze({
 ownerId:'owner189',characterId:'hero189',
 instanceId:'world-instance-189',instanceEpoch:'world-epoch-189',
 mapFingerprint:'a'.repeat(64),
});
const lease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-189',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'18918918-1891-4189-8189-189189189189',
 expiresAtMs:at+90000,
});
const uuid='18918918-1891-4189-8189-189189189188';
const principal=()=>({
 authenticated:true,identitySource:'trusted-server-session',
 accountId:scope.ownerId,characterId:scope.characterId,
 serverSessionId:lease.serverSessionId,expiresAtMs:at+60000,
});
const action=()=>({
 authenticated:true,identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldSessionId:lease.serverSessionId,
 actionSessionId:lease.actionSessionId,expiresAtMs:at+45000,
});
function fixture({wrongPrincipal=false,wrongAction=false,
 inactiveBase44=false,worldRevoked=false,
 pgUnavailable=false,dupTickets=false,missingTicket=false,
 lateExpiry=false}={}){
 const state={clock:at,principalActive:!wrongPrincipal,
  actionActive:!wrongAction,base44Active:!inactiveBase44,
  worldActive:!worldRevoked,pgUnavailable,dupTickets,
  missingTicket,lateExpiry,worldLease:{...lease},
  reads:0,releases:0,claims:[]};
 const pairing180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(context){
   return [issuerContext,reconnectContext].includes(context)&&
    state.principalActive&&state.worldActive?principal():null;
  },
  async resolveVerifiedBase44ActionSession(context){
   return [issuerContext,reconnectContext].includes(context)&&
    state.actionActive&&state.base44Active?action():null;
  },
  async verifySessionActive(claim){
   state.claims.push(claim);
   return state.base44Active&&state.worldActive&&
    claim.ownerId===scope.ownerId&&
    claim.characterId===scope.characterId&&
    claim.instanceId===scope.instanceId&&
    claim.serverSessionId===lease.serverSessionId&&
    claim.actionSessionId===lease.actionSessionId;
  },
 };
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===originalContext&&
    state.worldActive?state.worldLease:null;
  },
 };
 const ticketReaderPool={async connect(){
  if(state.pgUnavailable)throw Error('PG down');
  return {async query(sql,params){
   assert.equal(sql,RECONNECT_TICKET_READ_189);
   assert.deepEqual(params,[
    scope.ownerId,scope.characterId,scope.instanceId,
    scope.instanceEpoch,lease.serverSessionId,
    lease.actionSessionId,lease.leaseNonce,
   ]);
   state.reads++;
   if(state.missingTicket)return {rowCount:0,rows:[]};
   const row={ticket_id:uuid,
    expires_at_ms:String(at+(state.lateExpiry?61000:15000))};
   if(state.dupTickets)return {rowCount:2,rows:[row,{
    ...row,ticket_id:'28918918-1891-4189-8189-189189189188',
   }]};
   return {rowCount:1,rows:[row]};
  },release(){state.releases++}};
 }};
 const create=()=>createGame3DPrivateReconnectBackend189({
  enabled:true,pairing180,worldStage180,
  serverRequestContext:originalContext,scope,
  ticketReaderPool,now:()=>state.clock,
 });
 return {state,create,pairing180,worldStage180,ticketReaderPool};
}
async function staging(fn){
 const value=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  await fn();
 }finally{
  if(value===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=value;
 }
}
const issued=()=>({serverAuthContext:issuerContext,
 ticketId:uuid,expiresAtMs:at+15000});
test('18.9 requires original 18.0 paired server and private staging',async()=>{
 await assert.rejects(createGame3DPrivateReconnectBackend189(),
  /18\.9 requires/);
 await staging(async()=>{
  const h=fixture();
  await assert.rejects(createGame3DPrivateReconnectBackend189({
   enabled:true,pairing180:{...h.pairing180,
    publicPlayerRouteInstalled:true},
   worldStage180:h.worldStage180,
   serverRequestContext:originalContext,scope,
   ticketReaderPool:h.ticketReaderPool,
  }),/18\.9 requires/);
 });
});
test('18.9 original Base44/world pairing verifies exact durable committed ticket',async()=>{
 await staging(async()=>{
  const h=fixture(),backend=await h.create();
  assert.equal(backend.publicRouteInstalled,false);
  assert.equal(backend.ticketIdsDeliveredToBrowser,false);
  assert.equal(backend.usesExistingDurableTicket188,true);
  assert.equal(await backend.storeIssuedReconnectTicket188(issued()),true);
  const p=await backend.resolveTrustedBase44Action188({
   serverReconnectContext:reconnectContext,
  });
  assert.equal(p.authenticated,true);
  assert.equal(p.identitySource,
   'base44-verified-action-session-179');
  const resolved=await backend.resolveTrustedReconnectTicket188({
   serverReconnectContext:reconnectContext,
  });
  assert.deepEqual(resolved,{
   source:'trusted-backend-ticket-188',ticketId:uuid,
  });
  assert.equal(h.state.reads,2);
  assert.equal(h.state.releases,2);
  assert(h.state.claims.length>=5);
  backend.shutdown();
 });
});
test('18.9 browser-supplied token and unauthenticated contexts cannot resolve a ticket',async()=>{
 await staging(async()=>{
  const h=fixture(),backend=await h.create();
  for(const bad of [
   {ticketId:uuid},{ownerId:scope.ownerId},undefined,null,
   {serverRequestContext:reconnectContext},
  ]){
   assert.equal(await backend.resolveTrustedReconnectTicket188({
    serverReconnectContext:bad,
   }),null);
  }
  assert.equal(await backend.resolveTrustedBase44Action188({
   serverAuthContext:issuerContext,
   serverReconnectContext:reconnectContext,
  }),null);
  assert.equal(h.state.reads,0);
  backend.shutdown();
 });
});
test('18.9 two pending tickets fail closed rather than guessing or replaying old evidence',async()=>{
 await staging(async()=>{
  const h=fixture({dupTickets:true}),backend=await h.create();
  assert.equal(await backend.storeIssuedReconnectTicket188(issued()),false);
  assert.equal(await backend.resolveTrustedReconnectTicket188({
   serverReconnectContext:reconnectContext,
  }),null);
  assert.equal(h.state.releases,2);
  backend.shutdown();
 });
});
test('18.9 missing, expired or mismatched backend ticket refuses durable handoff',async()=>{
 await staging(async()=>{
  for(const options of [
   {missingTicket:true},{lateExpiry:true},
  ]){
   const h=fixture(options),backend=await h.create();
   assert.equal(await backend.storeIssuedReconnectTicket188(issued()),false);
   assert.equal(await backend.resolveTrustedReconnectTicket188({
    serverReconnectContext:reconnectContext,
   }),null);
   backend.shutdown();
  }
  const h=fixture(),backend=await h.create();
  assert.equal(await backend.storeIssuedReconnectTicket188({
   ...issued(),ticketId:'28918918-1891-4189-8189-189189189188',
  }),false);
  backend.shutdown();
 });
});
test('18.9 Base44 logout, world replacement and character revocation deny handoff',async()=>{
 await staging(async()=>{
  for(const modify of [
   state=>{state.base44Active=false},
   state=>{state.worldActive=false},
   state=>{state.worldLease={...lease,
    leaseNonce:'28918918-1891-4189-8189-189189189189'}},
   state=>{state.clock=lease.expiresAtMs+1},
  ]){
   const h=fixture(),backend=await h.create();
   modify(h.state);
   assert.equal(await backend.storeIssuedReconnectTicket188(issued()),false);
   assert.equal(await backend.resolveTrustedReconnectTicket188({
    serverReconnectContext:reconnectContext,
   }),null);
   backend.shutdown();
  }
 });
});
test('18.9 database error and shutdown never return an unchecked ticket',async()=>{
 await staging(async()=>{
  const h=fixture({pgUnavailable:true}),backend=await h.create();
  assert.equal(await backend.storeIssuedReconnectTicket188(issued()),false);
  assert.equal(await backend.resolveTrustedReconnectTicket188({
   serverReconnectContext:reconnectContext,
  }),null);
  h.state.pgUnavailable=false;
  backend.shutdown();
  assert.equal(await backend.storeIssuedReconnectTicket188(issued()),false);
  assert.equal(await backend.resolveTrustedReconnectTicket188({
   serverReconnectContext:reconnectContext,
  }),null);
 });
});
