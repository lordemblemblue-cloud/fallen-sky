// Combat 14.4: explicit opt-in LOOPBACK transport for 14.0's existing
// private gateway. No automatic mount, timers, localStorage, WebSocket,
// state mutation of the live GameWorld3D, or currency/loot/quest grants.
// A browser can only use this with a trusted same-origin/private proxy setup;
// the 14.0 gateway intentionally does not add public CORS headers.
import {createPrivateWorldViewStore144}
 from './privateWorldViewModel144.mjs';

const uuid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
const posInt=x=>Number.isSafeInteger(x)&&x>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const weapon=x=>['damage','defense','ranged'].includes(x);
const target=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const fail=reason=>{throw Error('14.4 '+reason)};
export function createPrivateWorldClient144({
 port,tokenProvider,fetchImpl=globalThis.fetch,
 createIntentId=()=>globalThis.crypto.randomUUID(),
 view=createPrivateWorldViewStore144(),
}={}){
 if(!Number.isInteger(port)||port<1||port>65535||
    typeof tokenProvider!=='function'||typeof fetchImpl!=='function'||
    typeof createIntentId!=='function'||
    typeof view?.connected!=='function'||
    typeof view?.received!=='function'||
    typeof view?.stop!=='function')
  fail('requires private loopback settings and view store');
 const base='http://127.0.0.1:'+port+'/private-game3d/140/';
 let tail=Promise.resolve(),closed=false;
 const serial=fn=>{
  const result=tail.then(fn,fn);
  tail=result.catch(()=>{});
  return result;
 };
 const request=async(action,payload)=>{
  const token=await tokenProvider();
  if(typeof token!=='string'||token.length<32||
     token.length>512||!/^[A-Za-z0-9_-]+$/.test(token))
   fail('missing_trusted_private_bearer');
  const response=await fetchImpl(base+action,{
   method:'POST',cache:'no-store',
   headers:{'content-type':'application/json',
    authorization:'Bearer '+token},
   body:JSON.stringify(payload),
  });
  if(!response||typeof response.json!=='function')
   fail('invalid_private_response');
  const result=await response.json();
  if(response.ok!==true||result?.ok!==true)
   fail(typeof result?.reason==='string'&&
        /^[a-z0-9_]{3,72}$/.test(result.reason)?
        result.reason:'private_request_denied');
  return result;
 };
 // Network disconnect and uncertain write receipts are always handled by
 // forcing a new full server snapshot. Do not retry an attack with a new ID.
 const safe=async fn=>{
  try{return await fn()}
  catch(error){
   view.stop('private_world_connection_lost');
   throw error;
  }
 };
 const connect=()=>serial(async()=>{
  if(closed)fail('client_closed');
  return safe(async()=>{
   const response=await request('connect',{});
   return view.connected(response);
  });
 });
 const poll=()=>serial(async()=>{
  if(closed)fail('client_closed');
  const state=view.getState();
  if(state.mode!=='connected'||!uuid(state.connectionId))
   fail('not_connected');
  return safe(async()=>{
   const reply=await request('poll',{
    connectionId:state.connectionId,afterSeq:state.cursor,
   });
   // Never project or award events twice, even after repeated polls.
   return view.received(reply);
  });
 });
 const input=({x,z,facing}={})=>serial(async()=>{
  if(closed)fail('client_closed');
  const state=view.getState();
  if(state.mode!=='connected')fail('not_connected');
  if(!finite(x)||Math.abs(x)>1||!finite(z)||Math.abs(z)>1||
     !finite(facing)||Math.abs(facing)>2*Math.PI)
   fail('invalid_input');
  const seq=state.nextInputSeq;
  if(!posInt(seq))fail('input_sequence_exhausted');
  return safe(async()=>{
   await request('input',{
    connectionId:state.connectionId,
    input:{seq,x,z,facing},
   });
   return view.sentInput(seq);
  });
 });
 const attack=({targetId,weaponPath='damage'}={})=>serial(async()=>{
  if(closed)fail('client_closed');
  const state=view.getState();
  if(state.mode!=='connected')fail('not_connected');
  if(!target(targetId)||!weapon(weaponPath))fail('invalid_attack');
  if(!posInt(state.nextIntentSeq))fail('intent_sequence_exhausted');
  const intentId=createIntentId().replaceAll('-','');
  if(!/^[A-Za-z0-9_-]{8,72}$/.test(intentId))
   fail('invalid_intent_id');
  return safe(async()=>{
   const reply=await request('intent',{
    connectionId:state.connectionId,
    intent:{action:'basic',intentId,intentSeq:state.nextIntentSeq,
     targetId,weaponPath},
   });
   // 'queued' means the server acknowledged receipt, NOT damage/hit/kill.
   if(reply.queued!==true)fail('uncommitted_private_attack');
   view.sentIntent(state.nextIntentSeq);
   return Object.freeze({
    ok:true,queued:true,intentId,
    rewardsAuthorized:false,hitConfirmed:false,
   });
  });
 });
 const disconnect=()=>serial(async()=>{
  const state=view.getState();
  if(closed||state.mode!=='connected')return view.stop('disconnected');
  try{
   await request('disconnect',{connectionId:state.connectionId});
  }finally{view.stop('disconnected')}
  return view.getState();
 });
 const close=()=>serial(async()=>{
  // A closing client drops visual ownership, not the server lease. If the
  // connection is still alive, callers should use disconnect() beforehand.
  closed=true;view.stop('client_closed');
  return true;
 });
 return Object.freeze({
  connect,poll,input,attack,disconnect,close,
  getState:view.getState,subscribe:view.subscribe,
  view,privateLoopbackOnly:true,
  automaticPollingEnabled:false,
  publicWorldMounted:false,
  mutatesPlayerHUD:false,
  rewardWriterEnabled:false,
  productionReady:false,
 });
}
