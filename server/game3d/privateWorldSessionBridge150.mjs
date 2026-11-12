// Combat 15.0 — server-held session bridge for ONE private Game 3D world.
// No HTTP listener, browser route, public credential endpoint or reward writer.
// The only world simulation remains 13.6 behind the 14.0 loopback gateway.
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const bearer=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{43}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const actions=new Set(['connect','poll','input','intent','disconnect']);
const refusal=reason=>Object.freeze({ok:false,reason,
 privateServerOnly:true,rewardsIssued:false,productionReady:false});
function validAction(action,x){
 switch(action){
 case 'connect':return exact(x,[]);
 case 'poll':return exact(x,['connectionId','afterSeq'])&&
  id(x.connectionId)&&integer(x.afterSeq);
 case 'disconnect':return exact(x,['connectionId'])&&id(x.connectionId);
 case 'input':return exact(x,['connectionId','input'])&&
  id(x.connectionId)&&exact(x.input,['seq','x','z','facing'])&&
  integer(x.input.seq)&&x.input.seq>0&&finite(x.input.x)&&
  Math.abs(x.input.x)<=1&&finite(x.input.z)&&
  Math.abs(x.input.z)<=1&&finite(x.input.facing)&&
  Math.abs(x.input.facing)<=Math.PI*2;
 case 'intent':return exact(x,['connectionId','intent'])&&
  id(x.connectionId)&&
  exact(x.intent,['action','intentId','intentSeq','targetId','weaponPath'])&&
  x.intent.action==='basic'&&
  typeof x.intent.intentId==='string'&&
  /^[A-Za-z0-9_-]{8,72}$/.test(x.intent.intentId)&&
  integer(x.intent.intentSeq)&&x.intent.intentSeq>0&&
  typeof x.intent.targetId==='string'&&
  /^[A-Za-z0-9_.:-]{1,160}$/.test(x.intent.targetId)&&
  ['damage','defense','ranged'].includes(x.intent.weaponPath);
 default:return false;
 }
}
// Deliberately fixed host, method, prefix and action. Caller cannot supply
// URLs, ports, authorization headers, routes or transport redirects.
async function postPrivate({port,origin,token,action,payload,timeoutMs}){
 const body=JSON.stringify(payload);
 if(Buffer.byteLength(body)>4096)throw Error('oversized_protocol_request');
 return await new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',family:4,port,
   method:'POST',path:'/private-game3d/140/'+action,
   agent:false,headers:{'authorization':'Bearer '+token,
    'origin':origin,'content-type':'application/json',
    'content-length':Buffer.byteLength(body)}},res=>{
   let length=0,chunks=[];
   res.on('data',chunk=>{
    length+=chunk.length;
    if(length>131072){req.destroy(Error('oversized_private_response'));return}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    try{
     const response=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(!obj(response)||typeof response.ok!=='boolean'||
        !Number.isInteger(res.statusCode))throw Error('invalid_private_response');
     resolve({status:res.statusCode,response});
    }catch{reject(Error('invalid_private_response'))}
   });
   res.on('error',reject);
  });
  req.setTimeout(timeoutMs,()=>req.destroy(Error('private_timeout')));
  req.on('error',reject);
  req.end(body);
 });
}
export function createGame3DServerHeldWorldBridge150({
 scope,authority149,resolveTrustedPlayerSession,
 loopbackPort,origin,now=Date.now,ttlSeconds=120,
 timeoutMs=4000
}={}){
 if(!scope||!id(scope.instanceId)||!who(scope.ownerId)||
    !who(scope.characterId)||authority149?.version!=='14.9'||
    authority149?.privateServerOnly!==true||
    typeof authority149.issue!=='function'||
    typeof authority149.revoke!=='function'||
    typeof resolveTrustedPlayerSession!=='function'||
    !Number.isInteger(loopbackPort)||loopbackPort<1||loopbackPort>65535||
    typeof origin!=='string'||!/^https?:\/\/[^/]+$/.test(origin)||
    typeof now!=='function'||!Number.isInteger(ttlSeconds)||
    ttlSeconds<30||ttlSeconds>900||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
  throw Error('15.0 requires pinned private world and privileged dependencies');
 const pinned=Object.freeze({ownerId:scope.ownerId,
  characterId:scope.characterId,instanceId:scope.instanceId});
 const sessions=new Map();
 let stopped=false,queue=Promise.resolve();
 const sequential=fn=>{
  const run=queue.then(fn,fn);
  queue=run.then(()=>undefined,()=>undefined);
  return run;
 };
 const principal=async context=>{
  let p=null;
  try{p=await resolveTrustedPlayerSession(context)}catch{}
  return p?.authenticated===true&&
   p.identitySource==='trusted-server-session'&&
   p.accountId===pinned.ownerId&&
   p.characterId===pinned.characterId&&
   id(p.serverSessionId)&&Number.isSafeInteger(p.expiresAtMs)&&
   p.expiresAtMs>now()?p:null;
 };
 const open=({serverRequestContext}={})=>sequential(async()=>{
  if(stopped)return refusal('bridge_closed');
  const p=await principal(serverRequestContext);
  if(!p)return refusal('trusted_login_required');
  let issued;
  try{issued=await authority149.issue({...pinned,ttlSeconds})}
  catch{return refusal('private_issue_denied')}
  if(issued?.ok!==true||issued.ownerId!==pinned.ownerId||
     issued.characterId!==pinned.characterId||
     issued.instanceId!==pinned.instanceId||
     !bearer(issued.token)||!sha(issued.tokenSha256)||
     createHash('sha256').update(issued.token).digest('hex')!==
      issued.tokenSha256)
   return refusal('invalid_private_issue');
  // 14.9 atomically revokes older world bearers on issue. Invalidate
  // older in-memory handles too; no revoked token may be reused here.
  sessions.clear();
  const handle=randomUUID();
  sessions.set(handle,{token:issued.token,digest:issued.tokenSha256,
   serverSessionId:p.serverSessionId,
   expiresAtMs:Math.min(now()+ttlSeconds*1000,p.expiresAtMs)});
  return Object.freeze({ok:true,handle,worldInstanceId:pinned.instanceId,
   sessionExpiresAtMs:sessions.get(handle).expiresAtMs,
   credentialDeliveredToBrowser:false,privateServerOnly:true,
   rewardsIssued:false,productionReady:false});
 });
 const send=async({handle,action,payload,serverRequestContext}={})=>{
  if(stopped)return refusal('bridge_closed');
  if(typeof handle!=='string'||!sessions.has(handle)||
     !actions.has(action)||!validAction(action,payload))
   return refusal('invalid_private_action');
  const p=await principal(serverRequestContext),s=sessions.get(handle);
  if(!p||!s||p.serverSessionId!==s.serverSessionId||
     now()>=s.expiresAtMs)return refusal('private_session_expired_or_denied');
  try{
   const result=await postPrivate({port:loopbackPort,origin,
    token:s.token,action,payload,timeoutMs});
   if(result.status===401)sessions.delete(handle);
   // This is a SERVER-ONLY raw protocol reply, not a browser-safe public
   // response. A future player route requires independent response projection.
   return Object.freeze({ok:result.response.ok,
    protocolStatus:result.status,privateProtocolReply:result.response,
    privateServerOnly:true,publicPlayerRouteInstalled:false,
    rewardsIssued:false,productionReady:false});
  }catch{return refusal('private_gateway_unavailable')}
 };
 const close=({handle,serverRequestContext}={})=>sequential(async()=>{
  if(stopped)return refusal('bridge_closed');
  const p=await principal(serverRequestContext),s=sessions.get(handle);
  if(!p||!s||p.serverSessionId!==s.serverSessionId)
   return refusal('private_session_expired_or_denied');
  sessions.delete(handle);
  try{
   const r=await authority149.revoke({...pinned,tokenSha256:s.digest});
   return Object.freeze({ok:r?.ok===true,serverRevocationConfirmed:
    r?.ok===true,privateServerOnly:true,rewardsIssued:false,
    productionReady:false});
  }catch{return refusal('private_revoke_unconfirmed')}
 });
 // Trusted worker shutdown only. Never expose as an HTTP or browser action.
 const shutdown=()=>sequential(async()=>{
  if(stopped)return {ok:true,alreadyClosed:true};
  stopped=true;
  const all=[...sessions.values()];
  sessions.clear();
  let confirmed=true;
  for(const s of all){
   try{
    const r=await authority149.revoke({...pinned,tokenSha256:s.digest});
    if(r?.ok!==true)confirmed=false;
   }catch{confirmed=false}
  }
  return Object.freeze({ok:confirmed,serverRevocationConfirmed:confirmed,
   privateServerOnly:true,rewardsIssued:false,productionReady:false});
 });
 return Object.freeze({version:'15.0',open,send,close,shutdown,
  worldInstanceId:pinned.instanceId,loopbackOnly:true,
  credentialDeliveredToBrowser:false,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,serverOnlyRawProtocol:true,
  rewardsIssued:false,productionReady:false});
}
