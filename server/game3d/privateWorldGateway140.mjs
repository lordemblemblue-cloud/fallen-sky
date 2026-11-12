// Combat Foundation 14.0 — opt-in, LOOPBACK-ONLY authenticated private
// world gateway. Not imported by index.mjs, never bound to a public interface.
// The only combat engine is the 13.6 simulation under 13.7/13.9 ownership.
import http from 'node:http';
import {createGame3DPrivateWorldRecovery139} from './privateWorldRecovery139.mjs';

const ROUTE='/private-game3d/140/';
const actions=new Set(['connect','poll','input','intent','disconnect']);
const str=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
const int=x=>Number.isSafeInteger(x)&&x>=0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
const validAction=(name,x)=>{
 if(!obj(x))return false;
 switch(name){
 case 'connect':return exact(x,[]);
 case 'poll':return exact(x,['connectionId','afterSeq'])&&
  str(x.connectionId)&&int(x.afterSeq)&&Object.keys(x).length===2;
 case 'disconnect':return exact(x,['connectionId'])&&str(x.connectionId)&&
  Object.keys(x).length===1;
 case 'input':return exact(x,['connectionId','input'])&&str(x.connectionId)&&
  Object.keys(x).length===2&&exact(x.input,['seq','x','z','facing'])&&
  Object.keys(x.input).length===4&&int(x.input.seq)&&x.input.seq>0&&
  finite(x.input.x)&&Math.abs(x.input.x)<=1&&
  finite(x.input.z)&&Math.abs(x.input.z)<=1&&
  finite(x.input.facing)&&Math.abs(x.input.facing)<=Math.PI*2;
 case 'intent':return exact(x,['connectionId','intent'])&&
  str(x.connectionId)&&Object.keys(x).length===2&&
  exact(x.intent,['action','intentId','intentSeq','targetId','weaponPath'])&&
  Object.keys(x.intent).length===5&&x.intent.action==='basic'&&
  typeof x.intent.intentId==='string'&&
  /^[A-Za-z0-9_-]{8,72}$/.test(x.intent.intentId)&&
  Number.isSafeInteger(x.intent.intentSeq)&&x.intent.intentSeq>0&&
  typeof x.intent.targetId==='string'&&
  /^[A-Za-z0-9_.:-]{1,160}$/.test(x.intent.targetId)&&
  ['damage','defense','ranged'].includes(x.intent.weaponPath);
 default:return false;
 }
};
const refusal=reason=>({ok:false,reason,rewardsIssued:false,
 productionReady:false});
const status=reason=>reason==='invalid_request'?400:
 reason==='unauthenticated_world_gateway'?401:
 reason==='origin_denied'?403:
 reason==='gateway_busy'?503:
 reason==='method_not_allowed'?405:
 reason==='unknown_private_action'?404:
 reason==='request_too_large'?413:400;
const json=(res,code,payload)=>{
 if(res.writableEnded||res.destroyed)return;
 res.writeHead(code,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'});
 res.end(JSON.stringify(payload));
};
async function decode(req,maxBodyBytes){
 const type=req.headers['content-type'];
 if(typeof type!=='string'||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type))
  throw Error('invalid_request');
 const declared=Number(req.headers['content-length']);
 if(Number.isFinite(declared)&&declared>maxBodyBytes)
  throw Error('request_too_large');
 let bytes=0,chunks=[];
 for await(const chunk of req){
  bytes+=chunk.length;
  if(bytes>maxBodyBytes)throw Error('request_too_large');
  chunks.push(chunk);
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{throw Error('invalid_request')}
}

// Calling this function is itself a trusted in-process server decision.
// The HTTP listener can ONLY bind 127.0.0.1, including when PORT is supplied.
// No client may construct world instances, renew leases, advance simulation,
// issue rewards or select a different player identity.
export async function createGame3DPrivateWorldGateway140({
 pool,scope,createEncounter,authorizeServerOperation,
 authenticateRequest,allowedOrigins,
 createOwner=createGame3DPrivateWorldRecovery139,
 now=Date.now,leaseMs=10000,maxBodyBytes=4096,maxActiveRequests=24
}={}){
 if(typeof authenticateRequest!=='function'||
    typeof createOwner!=='function'||typeof createEncounter!=='function'||
    typeof authorizeServerOperation!=='function'||!pool||
    !scope||!Array.isArray(allowedOrigins)||allowedOrigins.length===0||
    allowedOrigins.some(x=>typeof x!=='string'||!/^https?:\/\/[^/]+$/.test(x))||
    !Number.isInteger(maxBodyBytes)||maxBodyBytes<256||maxBodyBytes>8192||
    !Number.isInteger(maxActiveRequests)||maxActiveRequests<1||
    maxActiveRequests>128)
  throw Error('14.0 requires trusted worker dependencies and an origin allowlist');
 // Pin the identity used by admission, lease ownership and the new
 // worker. Do not read a mutable caller object on later HTTP requests.
 scope=Object.freeze({
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  holderId:scope.holderId,ownerId:scope.ownerId,
  characterId:scope.characterId,mapFingerprint:scope.mapFingerprint
 });
 const origins=new Set(allowedOrigins);
 const gate=Symbol('server-only-game3d-140');
 const authenticated=context=>{
  if(context?.gatewayProof!==gate||!obj(context.session))return null;
  return context.session;
 };
 const owner=await createOwner({
  pool,scope,createEncounter,authorizeServerOperation,
  resolveAuthenticatedSubject:authenticated,now,leaseMs
 });
 if(owner?.version!=='13.9'||owner.privateServerOnly!==true||
    owner.rewardWriterEnabled!==false||
    owner.publicTransportInstalled!==false||
    owner.productionReady!==false||
    !['connect','poll','setInput','submit','disconnect','advance','release']
      .every(k=>typeof owner[k]==='function'))
  throw Error('14.0 requires the private 13.9 owner contract');
 let active=0,closed=false,server=null;
 const handler=async(req,res)=>{
  if(closed){json(res,503,refusal('gateway_closed'));return}
  if(active>=maxActiveRequests){
   json(res,503,refusal('gateway_busy'));return;
  }
  active++;
  try{
   const origin=req.headers.origin;
   if(typeof origin==='string'&&!origins.has(origin)){
    json(res,403,refusal('origin_denied'));return;
   }
   if(req.method!=='POST'){
    json(res,405,refusal('method_not_allowed'));return;
   }
   // The service must not be made into a generic URL proxy or query API.
   const action=typeof req.url==='string'&&req.url.startsWith(ROUTE)
    ?req.url.slice(ROUTE.length):'';
   if(!actions.has(action)){
    json(res,404,refusal('unknown_private_action'));return;
   }
   let payload;
   try{payload=await decode(req,maxBodyBytes)}
   catch(e){
    const reason=e.message==='request_too_large'?'request_too_large':'invalid_request';
    json(res,status(reason),refusal(reason));return;
   }
   if(!validAction(action,payload)){
    json(res,400,refusal('invalid_request'));return;
   }
   let subject=null;
   try{subject=await authenticateRequest(req)}
   catch{}
   if(subject?.authenticated!==true||
      subject.identitySource!=='trusted-server-session'||
      subject.accountId!==scope.ownerId||
      subject.characterId!==scope.characterId){
    json(res,401,refusal('unauthenticated_world_gateway'));return;
   }
   const context=Object.freeze({
    gatewayProof:gate,session:Object.freeze({
     authenticated:true,identitySource:'trusted-server-session',
     accountId:subject.accountId,characterId:subject.characterId
    })
   });
   const args={...payload,serverRequestContext:context};
   const method={
    connect:'connect',poll:'poll',input:'setInput',
    intent:'submit',disconnect:'disconnect'
   }[action];
   let outcome;
   try{outcome=await owner[method](args)}
   catch{json(res,503,refusal('private_world_unavailable'));return}
   if(!obj(outcome)||typeof outcome.ok!=='boolean'){
    json(res,503,refusal('private_world_invalid_result'));return;
   }
   // Server origin and session identity never get serialized.
   json(res,outcome.ok?200:409,{...outcome,
    rewardsIssued:false,productionReady:false});
  }finally{active--}
 };
 const scheduleTick=async()=>{
  if(closed)return refusal('gateway_closed');
  try{return await owner.advance()}
  catch{return refusal('private_world_unavailable')}
 };
 const listen=async({port=0}={})=>{
  if(server||closed)throw Error('14.0 gateway already started or closed');
  if(!Number.isInteger(port)||port<0||port>65535)
   throw Error('14.0 invalid loopback port');
  server=http.createServer((req,res)=>{
   handler(req,res).catch(()=>json(res,503,refusal('private_world_unavailable')));
  });
  server.requestTimeout=5000;
  server.headersTimeout=6000;
  server.maxRequestsPerSocket=100;
  try{
   await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
   });
   return {host:'127.0.0.1',port:server.address().port,
    loopbackOnly:true,publicTransportInstalled:false};
  }catch(error){server=null;throw error}
 };
 const close=async()=>{
  if(closed)return false;
  closed=true;
  if(server){
   await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  }
  await owner.release().catch(()=>false);
  return true;
 };
 return Object.freeze({
  version:'14.0',listen,close,scheduleTick,
  privateServerOnly:true,loopbackOnly:true,
  worldInstanceId:scope.instanceId,
  sessionRequired:true,
  publicTransportInstalled:false,
  publicWorldConnected:false,
  rewardsIssued:false,rewardWriterEnabled:false,
  multiplayerReplicationEnabled:false,
  productionReady:false
 });
}
