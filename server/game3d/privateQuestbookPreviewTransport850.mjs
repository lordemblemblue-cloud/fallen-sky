// Game 3D Combat / Quest 85.0 — gated loopback-only Node HTTP response adapter.
// It NEVER creates or listens on a server. A trusted owner must mount it privately.
// No public routing, tokens, combat commands, rewards, or database changes here.
import {cloneGame3DPrivatePreviewPayload862}
 from './privateImmutablePreviewProjection862.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const alive=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const originOK=x=>x==='127.0.0.1'||x==='::1'||x==='::ffff:127.0.0.1';
const hostOK=x=>typeof x==='string'&&
 /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?$/i.test(x)&&
 (!x.includes(':')||Number(x.slice(x.lastIndexOf(':')+1))<=65535||x==='[::1]');
const paths=Object.freeze({open:'/_internal/game3d/questbook-preview/open',
 poll:'/_internal/game3d/questbook-preview/frame'});
export const GAME3D_PREVIEW_HTTP_LIMITS_850=Object.freeze({
 maxInflight:2,maxResponseBytes:65536,defaultRequestTimeoutMs:2500,
 defaultIdleTimeoutMs:30000,maxSessionAgeMs:900000,
});
const headers=Object.freeze({
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Expires':'0',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin',
 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
 'Vary':'Origin','Connection':'close',
});
const refusal=(status,code,retryAfterMs=0)=>({status,body:{
 ok:false,version:'85.0',code,retryAfterMs,
 rewardsIssued:false,rewardAuthorized:false,productionReady:false,
 }});
const proofOK=(v,s,at)=>object(v)&&v.authenticated===true&&
 v.identitySource==='trusted-private-http-preview-850'&&
 v.gatewayVerified===true&&v.sessionActive===true&&
 v.readOnly===true&&v.method==='GET'&&
 v.accountId===s.ownerId&&v.characterId===s.characterId&&
 v.worldInstanceId===s.instanceId&&v.worldEpoch===s.instanceEpoch&&
 typeof v.worldSessionId==='string'&&KEY.test(v.worldSessionId)&&
 typeof v.actionSessionId==='string'&&ACTION.test(v.actionSessionId)&&
 typeof v.leaseNonce==='string'&&UUID.test(v.leaseNonce)&&
 positive(v.expiresAtMs)&&v.expiresAtMs>at&&
 v.expiresAtMs<=at+GAME3D_PREVIEW_HTTP_LIMITS_850.maxSessionAgeMs&&
 object(v.edgeContext);
const sessionOf=v=>Object.freeze({accountId:v.accountId,
 characterId:v.characterId,worldInstanceId:v.worldInstanceId,
 worldEpoch:v.worldEpoch,worldSessionId:v.worldSessionId,
 actionSessionId:v.actionSessionId,leaseNonce:v.leaseNonce,
 edgeContext:v.edgeContext});
const same=(a,b)=>a!==null&&b!==null&&Object.keys(a).every(k=>a[k]===b[k]);

export function createGame3DPrivateQuestbookPreviewTransport850({
 delivery,scope,serverRequestContext,verifyGatewayRequest,
 now=Date.now,enabled=false,requestTimeoutMs=2500,idleTimeoutMs=30000,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850!=='enabled'||
    delivery?.version!=='84.9'||delivery.privateServerOnly!==true||
    delivery.publicPlayerRouteInstalled!==false||
    delivery.publicTransportInstalled!==false||
    delivery.credentialDeliveredToBrowser!==false||
    delivery.featureEnabledInLiveGame!==false||
    ['open','poll','shutdown'].some(k=>typeof delivery[k]!=='function')||
    !object(scope)||!alive(scope.ownerId)||!alive(scope.characterId)||
    typeof scope.instanceId!=='string'||!KEY.test(scope.instanceId)||
    typeof scope.instanceEpoch!=='string'||!KEY.test(scope.instanceEpoch)||
    typeof scope.mapFingerprint!=='string'||!HASH.test(scope.mapFingerprint)||
    !object(serverRequestContext)||typeof verifyGatewayRequest!=='function'||
    typeof now!=='function'||!Number.isInteger(requestTimeoutMs)||
    requestTimeoutMs<50||requestTimeoutMs>5000||
    !Number.isInteger(idleTimeoutMs)||idleTimeoutMs<100||idleTimeoutMs>120000)
  throw Error('85.0 requires an explicit private staging world and independently verified gateway');
 const pinned=Object.freeze({...scope});
 let opened=false,opening=false,closed=false,closing=null,active=0,idleTimer=null;
 let boundSession=null,lastNow=-1;
 const time=()=>{
  let t;try{t=now()}catch{return null}
  if(!positive(t)||t<lastNow)return null;
  lastNow=t;return t;
 };
 const shutdown=()=>{
  if(idleTimer!==null){clearTimeout(idleTimer);idleTimer=null}
  closed=true;opened=false;boundSession=null;
  if(!closing){closing=Promise.resolve().then(()=>delivery.shutdown())
   .then(x=>x===true,()=>false)}
  return closing;
 };
 const idle=()=>{
  if(closed||active!==0)return;
  if(idleTimer!==null)clearTimeout(idleTimer);
  idleTimer=setTimeout(()=>{idleTimer=null;void shutdown()},idleTimeoutMs);
  idleTimer.unref?.();
 };
 const authorize=async(req,operation)=>{
  const before=time();if(before===null)return null;
  let evidence;
  try{evidence=await verifyGatewayRequest(Object.freeze({
   request:req,serverRequestContext,operation,
  }))}catch{return null}
  const after=time();
  if(after===null||!proofOK(evidence,pinned,after))return null;
  return sessionOf(evidence);
 };
 const send=(res,status,body,retryAfterMs=0)=>{
  if(res.destroyed||res.writableEnded)return;
  let wire;
  try{wire=JSON.stringify(body)}catch{
   void shutdown();status=502;wire=JSON.stringify(
    refusal(502,'preview_invalid_json').body);
  }
  if(Buffer.byteLength(wire,'utf8')>GAME3D_PREVIEW_HTTP_LIMITS_850.maxResponseBytes){
   void shutdown();status=502;wire=JSON.stringify(
    refusal(502,'preview_response_limit').body);
  }
  const h={...headers,'Content-Length':String(Buffer.byteLength(wire,'utf8'))};
  if(status===429&&positive(retryAfterMs))
   h['Retry-After']=String(Math.max(1,Math.ceil(retryAfterMs/1000)));
  try{res.writeHead(status,h);res.end(wire)}catch{void shutdown()}
 };
 const handle=async(req,res)=>{
  if(!object(req)||!object(res)||typeof res.writeHead!=='function'||
     typeof res.end!=='function')return false;
  const bad=(status,reason)=>{const r=refusal(status,reason);
   send(res,r.status,r.body);return true};
  if(closed)return bad(410,'preview_closed');
  // This guard is in addition to independent real authentication, not a
  // substitute for an authenticated reverse proxy or private network ACL.
  if(!originOK(req.socket?.remoteAddress)||!hostOK(req.headers?.host)||
     req.headers?.forwarded!==undefined||
     Object.keys(req.headers||{}).some(k=>k.startsWith('x-forwarded-')))
   return bad(403,'preview_loopback_only');
  if(req.method!=='GET')return bad(405,'preview_get_only');
  let operation=null;
  if(req.url===paths.open)operation='open';
  else if(req.url===paths.poll)operation='poll';
  else return bad(404,'preview_not_found');
  if(req.headers?.['transfer-encoding']!==undefined||
     (req.headers?.['content-length']!==undefined&&
      req.headers['content-length']!=='0'))
   return bad(400,'preview_request_body_forbidden');
  if(active>=GAME3D_PREVIEW_HTTP_LIMITS_850.maxInflight)
   return bad(429,'preview_concurrency_limited');
  active++;
  if(idleTimer!==null){clearTimeout(idleTimer);idleTimer=null}
  let completed=false,timer=null,peerClosed=false,authorized=false;
  res.once?.('close',()=>{
   if(!res.writableFinished){
    peerClosed=true;
    // Only an already verified, bound owner's disconnect may close the view.
    // A foreign/anonymous abandoned request must not evict an active player.
    if(authorized)void shutdown();
   }
  });
  const task=(async()=>{
   const first=await authorize(req,operation);
   // A timed-out or closed request must never open the original world later.
   if(closed)return refusal(410,'preview_closed');
   if(!first)return refusal(403,'preview_gateway_auth_failed');
   if(boundSession&&!same(boundSession,first)){
    // A verified same-player session rotation revokes the old generation.
    void shutdown();return refusal(403,'preview_session_rotated');
   }
   authorized=true;
   if(peerClosed){void shutdown();return refusal(410,'preview_peer_disconnected')}
   if((operation==='open'&&(opened||opening))||(operation==='poll'&&!opened))
    return refusal(409,'preview_lifecycle_conflict');
   if(operation==='open')opening=true;
   if(closed)return refusal(410,'preview_closed');
   let response;
   try{response=await delivery[operation]({edgeContext:first.edgeContext})}
   catch{void shutdown();return refusal(502,'preview_delivery_failed')}
   if(closed||peerClosed)return refusal(410,'preview_closed');
   const last=await authorize(req,operation);
   if(closed||!same(first,last)||boundSession&&!same(boundSession,last)){
    void shutdown();return refusal(403,'preview_session_rotated')
   }
   if(response?.ok!==true){
    if(response?.reason==='private_delivery_rate_limited'||
       response?.reason==='private_delivery_budget_exhausted')
     return refusal(429,'preview_rate_limited',response.retryAfterMs||0);
    if(response?.reason==='private_view_not_ready')
     return refusal(503,'preview_not_ready');
    // All other denied delivery states are treated as terminal, including
    // auth/session rotation and failed immutable frame verification.
    void shutdown();return refusal(403,'preview_private_delivery_denied');
   }
   if(response.version!=='84.9'||response.privateServerOnly!==true||
      response.productionReady!==false||response.rewardsIssued!==false||
      response.rewardAuthorized!==false||response.cacheControl!=='no-store'||
      response.contentType!=='application/json'||
      !object(response.payload)){
    void shutdown();return refusal(502,'preview_delivery_payload_invalid')
   }
   // Materialize a deep, null-prototype, frozen copy. Even if a private
   // upstream module attaches a custom toJSON hook, getter or prototype,
   // nothing from that object is passed into HTTP serialization.
   const safeData=cloneGame3DPrivatePreviewPayload862(response.payload);
   if(!safeData){
    void shutdown();return refusal(502,'preview_delivery_payload_invalid');
   }
   if(operation==='open'){boundSession=first;opened=true}
   return {status:200,body:Object.freeze(Object.assign(
    Object.create(null),{ok:true,version:'85.0',
     data:safeData,rewardsIssued:false,rewardAuthorized:false,
     productionReady:false}))};
  })();
  if(operation==='open')void task.then(()=>{opening=false},()=>{opening=false});
  const expired=Symbol('preview_request_timeout');
  const timeout=new Promise(resolve=>{
   timer=setTimeout(()=>resolve(expired),requestTimeoutMs);
   timer.unref?.();
  });
  try{
   const result=await Promise.race([task,timeout]);
   if(result===expired){void shutdown();
    const r=refusal(504,'preview_upstream_timeout');
    send(res,r.status,r.body);
   }else if(!closed||result.status!==200){
    send(res,result.status,result.body,result.body.retryAfterMs||0);
   }else bad(410,'preview_closed');
   completed=true;
   return true;
  }finally{
   if(timer!==null)clearTimeout(timer);
   active--;
   if(!closed&&completed)idle();
  }
 };
 idle();
 return Object.freeze({version:'85.0',handle,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,listenerInstalled:false,
  credentialDeliveredToBrowser:false,featureEnabledInLiveGame:false,
  rewardWriterInstalled:false,productionReady:false});
}
