// Combat / Quest 17.0 — opt-in, signed Base44-to-PostgreSQL Questbook relay.
// The handler is never browser-authenticated: only an independently signed
// Base44 backend request may create a short-lived trusted read scope.
// No quest writes, reward settlement, migrations, or unsanctioned game authority.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {createGame3DPrivateQuestbookProjection167}
 from './privateQuestbookProjection167.mjs';
import {createGame3DPrivateQuestbookSessionBridge168}
 from './privateQuestbookSessionBridge168.mjs';
import {createGame3DQuestbookReadTransport169}
 from './privateQuestbookTransport169.mjs';

export const GAME3D_QUESTBOOK_READ_PATH_170='/internal/game3d/questbook';
export const GAME3D_QUESTBOOK_PROOF_170='base44-auth-me-character-vault';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const SESSION=/^qb170-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const cleanId=x=>typeof x==='string'&&ID.test(x)&&
 !['__anon__','__default__'].includes(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exactly=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
const canonicalRevision=x=>x===null||(typeof x==='string'&&SHA.test(x));
const canonicalView=x=>x===null||(typeof x==='string'&&UUID.test(x));
const MAX_BODY=2048, MAX_NONCES=4096, MAX_SESSIONS=128;
const safeHeaders=Object.freeze({
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store',
 'x-content-type-options':'nosniff'
});
const respond=(res,status,body)=>{
 if(res.writableEnded||res.destroyed)return;
 const message=JSON.stringify(body);
 res.writeHead(status,{...safeHeaders,'content-length':Buffer.byteLength(message)});
 res.end(message);
};
const refuse=(res,status,reason)=>respond(res,status,{
 ok:false,version:'17.0',reason,readOnly:true,rewardsIssued:false,
 productionReady:false
});
const readBody=async req=>{
 let size=0,parts=[];
 for await(const part of req){
  size+=part.length;
  if(size>MAX_BODY)throw Error('oversized_request');
  parts.push(part);
 }
 return Buffer.concat(parts).toString('utf8');
};
function verifiedPayload(x,at,now){
 if(!exactly(x,['v','proof','ownerId','characterId','sessionId',
    'issuedAtMs','expiresAtMs','nonce','knownRevision','knownViewId'])||
   x.v!==1||x.proof!==GAME3D_QUESTBOOK_PROOF_170||
   !cleanId(x.ownerId)||!cleanId(x.characterId)||
   typeof x.sessionId!=='string'||!SESSION.test(x.sessionId)||
   !Number.isSafeInteger(x.issuedAtMs)||x.issuedAtMs!==at||
   !Number.isSafeInteger(x.expiresAtMs)||
   x.expiresAtMs<=now||x.expiresAtMs>at+30000||
   !UUID.test(x.nonce)||!canonicalRevision(x.knownRevision)||
   !canonicalView(x.knownViewId))return false;
 return true;
}
export function signGame3DQuestbookRequest170({secret,at,rawBody}){
 if(typeof secret!=='string'||secret.length<32||
    !Number.isSafeInteger(at)||typeof rawBody!=='string')
  throw Error('Invalid 17.0 signing inputs');
 const digest=createHash('sha256').update(rawBody,'utf8').digest('hex');
 const message=String(at)+'\nPOST\n'+GAME3D_QUESTBOOK_READ_PATH_170+
  '\n'+digest;
 return createHmac('sha256',secret).update(message,'utf8').digest('hex');
}
export function createGame3DQuestbookRelay170({
 pool,secret,appOrigin,now=Date.now
}={}){
 if(typeof pool?.connect!=='function'||typeof secret!=='string'||
    secret.length<32||typeof appOrigin!=='string'||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(appOrigin)||
    typeof now!=='function')
  throw Error('17.0 requires a private Questbook PostgreSQL pool, secret and HTTPS app origin');
 let stopped=false,queue=Promise.resolve();
 const nonces=new Map(),sessions=new Map();
 const serialize=fn=>{
  const next=queue.then(fn,fn);
  queue=next.then(()=>undefined,()=>undefined);
  return next;
 };
 const purge=async()=>{
  const t=now(),removed=[];
  for(const [nonce,expiry] of nonces)
   if(expiry<=t)nonces.delete(nonce);
  for(const [key,entry] of sessions)
   if(entry.expiresAtMs<=t){
    sessions.delete(key);
    removed.push(entry);
   }
  await Promise.all(removed.map(async entry=>{
   await entry.transport.shutdown();
   await entry.bridge.shutdown();
  }));
 };
 const cacheKey=proof=>[proof.ownerId,proof.characterId,
  proof.sessionId].join('\0');
 const trustedEntry=proof=>{
  const context=Object.freeze({token:Symbol('trusted-signed-questbook-proof')});
  const entry={
   context,ownerId:proof.ownerId,characterId:proof.characterId,
   sessionId:proof.sessionId,expiresAtMs:proof.expiresAtMs
  };
  const resolveTrustedPlayerSession=async supplied=>{
   if(supplied!==context||entry.expiresAtMs<=now())return null;
   return Object.freeze({
    authenticated:true,identitySource:'trusted-server-session',
    accountId:entry.ownerId,characterId:entry.characterId,
    serverSessionId:entry.sessionId,expiresAtMs:entry.expiresAtMs
   });
  };
  // Separately pin the 16.7 reader to the same signed account and
  // character. No generic "authorize everyone" backend callback.
  const projection=createGame3DPrivateQuestbookProjection167({
   pool,authorizeServerOperation:async({operation,ownerId,characterId})=>
    operation==='read_private_questbook_projection'&&
    ownerId===entry.ownerId&&characterId===entry.characterId&&
    entry.expiresAtMs>now()
  });
  entry.bridge=createGame3DPrivateQuestbookSessionBridge168({
   projection167:projection,resolveTrustedPlayerSession,now,
   leaseMs:30000,maxHandles:1
  });
  entry.transport=createGame3DQuestbookReadTransport169({
   bridge168:entry.bridge,resolveTrustedPlayerSession,
   allowedOrigins:[appOrigin],now,maxSessions:1
  });
  return entry;
 };
 const handleRequest=async(req,res)=>{
  if(stopped){refuse(res,503,'questbook_relay_closed');return true;}
  if(req.url!==GAME3D_QUESTBOOK_READ_PATH_170){
   refuse(res,404,'questbook_route_not_found');return true;
  }
  if(req.method!=='POST'){refuse(res,405,'questbook_post_required');return true;}
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
       req.headers['content-type']||'')){
   refuse(res,415,'questbook_json_required');return true;
  }
  if(Number(req.headers['content-length']||0)>MAX_BODY){
   refuse(res,413,'questbook_body_too_large');return true;
  }
  const headerTs=req.headers['x-game3d-questbook-time'];
  const headerSignature=req.headers['x-game3d-questbook-signature'];
  if(typeof headerTs!=='string'||!/^[0-9]{13}$/.test(headerTs)||
     typeof headerSignature!=='string'||!SHA.test(headerSignature)){
   refuse(res,401,'missing_questbook_backend_signature');return true;
  }
  const at=Number(headerTs);
  if(!Number.isSafeInteger(at)||Math.abs(now()-at)>15000){
   refuse(res,401,'stale_questbook_backend_signature');return true;
  }
  let raw;
  try{raw=await readBody(req)}
  catch{refuse(res,413,'invalid_or_oversized_questbook_request');return true;}
  const wanted=signGame3DQuestbookRequest170({secret,at,rawBody:raw});
  if(!timingSafeEqual(Buffer.from(wanted,'hex'),
      Buffer.from(headerSignature,'hex'))){
   refuse(res,401,'invalid_questbook_backend_signature');return true;
  }
  let proof;
  try{proof=JSON.parse(raw)}catch{}
  if(!verifiedPayload(proof,at,now())){
   refuse(res,422,'invalid_questbook_backend_proof');return true;
  }
  await purge();
  if(nonces.has(proof.nonce)){
   refuse(res,409,'replayed_questbook_backend_proof');return true;
  }
  if(nonces.size>=MAX_NONCES){
   refuse(res,503,'questbook_nonce_capacity');return true;
  }
  nonces.set(proof.nonce,proof.expiresAtMs);
  const key=cacheKey(proof);
  let entry=sessions.get(key);
  if(!entry){
   // Switching characters or signing into a new session invalidates the
   // previous view generation for this account.
   for(const [oldKey,s] of sessions){
    if(s.ownerId===proof.ownerId){
     sessions.delete(oldKey);
     await s.transport.shutdown();
     await s.bridge.shutdown();
    }
   }
   if(sessions.size>=MAX_SESSIONS){
    refuse(res,503,'questbook_session_capacity');return true;
   }
   entry=trustedEntry(proof);
   sessions.set(key,entry);
  }else entry.expiresAtMs=proof.expiresAtMs;
  let result;
  try{
   result=await entry.transport.handle({
    method:'POST',origin:appOrigin,contentType:'application/json',
    serverRequestContext:entry.context,
    body:{action:'read',knownRevision:proof.knownRevision,
     knownViewId:proof.knownViewId}
   });
  }catch{
   refuse(res,503,'questbook_authority_unavailable');return true;
  }
  if(entry.expiresAtMs<=now()){
   sessions.delete(key);
   refuse(res,401,'questbook_backend_proof_expired');return true;
  }
  if(!result||!Number.isInteger(result.status)||!object(result.body)){
   refuse(res,503,'unverified_questbook_transport');return true;
  }
  respond(res,result.status,result.body);
  return true;
 };
 const handle=(req,res)=>serialize(()=>handleRequest(req,res));
 const shutdown=()=>serialize(async()=>{
  stopped=true;
  const entries=[...sessions.values()];
  sessions.clear();nonces.clear();
  await Promise.all(entries.map(async x=>{
   await x.transport.shutdown();await x.bridge.shutdown();
  }));
 });
 return Object.freeze({version:'17.0',handle,shutdown,
  readOnly:true,requiresSignedBackend:true,
  publicBrowserCredentialAccepted:false,questWritesEnabled:false,
  rewardsIssued:false,productionReady:false});
}
