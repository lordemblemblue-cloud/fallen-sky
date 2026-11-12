// Combat / Quest 17.4: signed, single-worker, private intentional actions.
// No browser tokens reach this route. Only the authenticated Base44 signer
// may request an explicit accept-quest or Rival consent operation.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createGame3DPrivateQuestAcceptance154} from './privateQuestAcceptance154.mjs';
import {createGame3DPrivateEchoQuest165,PRIVATE_ECHO_QUESTS_165} from './privateEchoQuest165.mjs';
import {createGame3DPrivateStoryRivalConsent164} from './privateStoryRivalConsent164.mjs';
import {PRIVATE_QUEST_CATALOG_154} from './privateQuestCatalog154.mjs';
import {createGame3DTrustedNpcWorldBridge177} from './trustedNpcWorldBridge177.mjs';
import {createGame3DNpcInteractionGate175} from './privateNpcInteractionGate175.mjs';

export const GAME3D_QUEST_ACTION_PATH_174='/internal/game3d/quest-action';
const SESSION=/^qb174-[a-f0-9]{64}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const LEAD=/^[A-Za-z0-9_.:-]{8,128}$/;
const CHOICES=new Set(['rival','friendly_rival','decline']);
const KEYS=['v','proof','ownerId','characterId','sessionId','issuedAtMs',
 'expiresAtMs','nonce','intent','questId','leadId','choice'];
const validWho=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(obj,keys)=>object(obj)&&Object.keys(obj).length===keys.length&&
 Object.keys(obj).every(k=>keys.includes(k));
const safeHeaders={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const send=(res,status,body)=>{
 if(res.writableEnded||res.destroyed)return;
 const raw=JSON.stringify(body);
 res.writeHead(status,{...safeHeaders,'content-length':Buffer.byteLength(raw)});
 res.end(raw);
};
const denied=(res,status,reason)=>send(res,status,{ok:false,version:'17.4',
 reason,accepted:false,choiceRecorded:false,rewardsIssued:false,
 productionReady:false});
const readBody=async req=>{
 const parts=[];let size=0;
 for await(const p of req){size+=p.length;if(size>2048)throw Error('oversized');parts.push(p);}
 return Buffer.concat(parts).toString('utf8');
};
const validProof=(p,at,now)=>{
 if(!exact(p,KEYS)||p.v!==1||p.proof!=='base44-auth-me-explicit-quest-action'||
    !validWho(p.ownerId)||!validWho(p.characterId)||!SESSION.test(p.sessionId)||
    !Number.isSafeInteger(p.issuedAtMs)||p.issuedAtMs!==at||
    !Number.isSafeInteger(p.expiresAtMs)||p.expiresAtMs<=now||
    p.expiresAtMs>at+25000||!UUID.test(p.nonce))return false;
 if(p.intent==='accept_quest')return typeof p.questId==='string'&&
   (Object.hasOwn(PRIVATE_QUEST_CATALOG_154,p.questId)||
     Object.hasOwn(PRIVATE_ECHO_QUESTS_165,p.questId))&&
   p.leadId===null&&p.choice===null;
 return p.intent==='choose_rival'&&p.questId===null&&
   typeof p.leadId==='string'&&LEAD.test(p.leadId)&&CHOICES.has(p.choice);
};
export function signGame3DQuestAction174({secret,at,rawBody}){
 if(typeof secret!=='string'||secret.length<32||
    !Number.isSafeInteger(at)||typeof rawBody!=='string')
  throw Error('Invalid 17.4 signing inputs');
 const digest=createHash('sha256').update(rawBody,'utf8').digest('hex');
 return createHmac('sha256',secret).update(
  String(at)+'\nPOST\n'+GAME3D_QUEST_ACTION_PATH_174+'\n'+digest,'utf8').digest('hex');
}
export function createGame3DQuestActionRoute174({
 pool,secret,appOrigin,now=Date.now,
 createStarter=createGame3DPrivateQuestAcceptance154,
 createEcho=createGame3DPrivateEchoQuest165,
 createRival=createGame3DPrivateStoryRivalConsent164,
 validateNpcInteraction=null,trustedNpcWorldHost177=null,
 verifyWorldActionSession=null,transactionSessionFence183=null,
}={}){
 if(typeof pool?.connect!=='function'||typeof secret!=='string'||secret.length<32||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(appOrigin)||
    typeof now!=='function'||[createStarter,createEcho,createRival].some(x=>typeof x!=='function')||
    verifyWorldActionSession!==null&&typeof verifyWorldActionSession!=='function'||
    transactionSessionFence183!==null&&typeof transactionSessionFence183!=='function')
  throw Error('17.4 requires separate private PG writer, backend signer and HTTPS origin');
 if(transactionSessionFence183!==null&&
    (trustedNpcWorldHost177===null||verifyWorldActionSession===null||
     validateNpcInteraction!==null))
  throw Error('18.3 transactional session fence requires real private 17.7 world evidence and active session authority');
 // Stage-only world handoff. No browser-origin events can be injected here.
 // The deployed worker presently supplies neither option and therefore keeps
 // NPC quest acceptance DENIED. The world host must be a genuine server host.
 if(trustedNpcWorldHost177!==null&&validateNpcInteraction!==null)
  throw Error('Cannot combine test NPC validation with trusted world host');
 const npcWorldBridge=trustedNpcWorldHost177===null?null:
  createGame3DTrustedNpcWorldBridge177(trustedNpcWorldHost177);
 const npcValidator=npcWorldBridge?
  createGame3DNpcInteractionGate175({
   resolveTrustedInteraction:npcWorldBridge.resolveTrustedInteraction,now
  }).validate:validateNpcInteraction;
 // Single replica only: the nonce fence MUST be distributed before >1 replicas.
 const nonces=new Map();let stopped=false,queue=Promise.resolve();
 const serialize=fn=>{const x=queue.then(fn,fn);queue=x.then(()=>{},()=>{});return x;};
 const processRequest=async(req,res)=>{
  if(stopped){denied(res,503,'intent_route_closed');return true;}
  if(req.url!==GAME3D_QUEST_ACTION_PATH_174){denied(res,404,'route_not_found');return true;}
  if(req.method!=='POST'){denied(res,405,'post_required');return true;}
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')){
   denied(res,415,'json_required');return true;
  }
  if(Number(req.headers['content-length']||0)>2048){denied(res,413,'request_too_large');return true;}
  const ts=req.headers['x-game3d-quest-action-time'];
  const mac=req.headers['x-game3d-quest-action-signature'];
  if(typeof ts!=='string'||!/^[0-9]{13}$/.test(ts)||
     typeof mac!=='string'||!SHA.test(mac)){
   denied(res,401,'missing_backend_signature');return true;
  }
  const at=Number(ts),current=now();
  if(!Number.isSafeInteger(at)||Math.abs(current-at)>15000){
   denied(res,401,'stale_backend_signature');return true;
  }
  let raw;
  try{raw=await readBody(req)}catch{denied(res,413,'invalid_request_body');return true;}
  const wanted=signGame3DQuestAction174({secret,at,rawBody:raw});
  if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(wanted,'hex'))){
   denied(res,401,'invalid_backend_signature');return true;
  }
  let proof;
  try{proof=JSON.parse(raw)}catch{}
  if(!validProof(proof,at,now())){denied(res,422,'invalid_explicit_intent');return true;}
  for(const [nonce,until] of nonces)if(until<=now())nonces.delete(nonce);
  if(nonces.has(proof.nonce)){denied(res,409,'intent_replay');return true;}
  if(nonces.size>=4096){denied(res,503,'nonce_capacity');return true;}
  nonces.set(proof.nonce,proof.expiresAtMs);
  // Independent, exact-op callback. Neither the browser nor a generic
  // authenticated read route can authorize another player's server writes.
  const operation=proof.intent==='choose_rival'?'respond_private_rival_lead':
    Object.hasOwn(PRIVATE_QUEST_CATALOG_154,proof.questId)
      ?'accept_private_server_quest':'accept_private_echo_quest';
  // An optional *server-only* 18.2 world-session liveness callback is checked
  // again at the actual quest service authorization boundary. The signed
  // HMAC and NPC receipt alone must not authorize a write after logout.
  // Legacy Rival consent remains independently authorized.
  const authorizeServerOperation=async({operation:op,ownerId,characterId,questId,leadId})=>{
   if(op!==operation||ownerId!==proof.ownerId||
      characterId!==proof.characterId||proof.expiresAtMs<=now()||
      !(proof.intent==='choose_rival'?leadId===proof.leadId:questId===proof.questId))
    return false;
   if(proof.intent!=='accept_quest'||verifyWorldActionSession===null)return true;
   try{return await verifyWorldActionSession(Object.freeze({
    ownerId:proof.ownerId,characterId:proof.characterId,
    questId:proof.questId,sessionId:proof.sessionId
   }))===true}catch{return false}
  };
  // 17.5: no NPC quest acceptance without an INDEPENDENT trusted world
  // interaction within range. No coordinates or proximity proofs in the
  // Base44/browser payload are accepted here.
  if(proof.intent==='accept_quest'){
   if(typeof npcValidator!=='function'){
    denied(res,503,'trusted_npc_world_not_connected');return true;
   }
   let world;
   try{
    world=await npcValidator({ownerId:proof.ownerId,
     characterId:proof.characterId,questId:proof.questId,
     sessionId:proof.sessionId});
   }catch{
    denied(res,503,'trusted_npc_world_unavailable');return true;
   }
   if(world?.ok!==true||world.worldAttested!==true||
      world.questId!==proof.questId||world.rewardsIssued!==false){
    denied(res,403,'trusted_npc_interaction_required');return true;
   }
  }
  // The 18.3 hook is bound to this exact authenticated, signed action proof.
  // The 15.4/16.5 transaction will call it using its own PG client so
  // SELECT FOR SHARE stays held until quest COMMIT or ROLLBACK.
  const transactionFence=proof.intent==='accept_quest'&&
   transactionSessionFence183!==null?
   (db,claim)=>transactionSessionFence183(db,Object.freeze({
    ownerId:claim.ownerId,characterId:claim.characterId,
    questId:claim.questId,operation:claim.operation,sessionId:proof.sessionId,
   })):null;
  const ctx={pool,authorizeServerOperation,transactionFence};
  let result;
  try{
   if(proof.intent==='choose_rival'){
    result=await createRival(ctx).respond({ownerId:proof.ownerId,
     characterId:proof.characterId,leadId:proof.leadId,choice:proof.choice});
   }else if(operation==='accept_private_server_quest'){
    result=await createStarter(ctx).accept({ownerId:proof.ownerId,
     characterId:proof.characterId,questId:proof.questId});
   }else{
    result=await createEcho(ctx).accept({ownerId:proof.ownerId,
     characterId:proof.characterId,questId:proof.questId});
   }
  }catch{denied(res,503,'private_intent_authority_unavailable');return true;}
  if(proof.expiresAtMs<=now()){
   denied(res,401,'intent_proof_expired');return true;
  }
  if(!object(result)||result.ok!==true||result.rewardsIssued===true||
     result.rewardAuthorized===true){
   denied(res,result?.ok===false?409:503,'private_intent_not_committed');return true;
  }
  if(proof.intent==='accept_quest'){
   if(result.questId!==proof.questId||result.accepted!==true||
      (operation==='accept_private_server_quest'&&
        (result.rewardAuthorized!==false||result.questProgressCommitted!==false))||
      (operation==='accept_private_echo_quest'&&
        (result.rewardsIssued!==false||result.questCompleted!==false))){
    denied(res,503,'unexpected_acceptance_result');return true;
   }
   send(res,200,{ok:true,version:'17.4',intent:proof.intent,questId:proof.questId,
    accepted:true,questCompleted:false,rewardsIssued:false,productionReady:false});
  }else{
   if(result.leadId!==proof.leadId||result.rewardsIssued!==false||
      result.questAccepted!==false||result.meeting!=='neutral_zone_not_scheduled'||
      !['pending','declined','disputed','rival','friendly_rival'].includes(result.status)||
      typeof result.mutualConsent!=='boolean'||
      result.mutualConsent!==['rival','friendly_rival'].includes(result.status)){
    denied(res,503,'unexpected_rival_result');return true;
   }
   send(res,200,{ok:true,version:'17.4',intent:proof.intent,leadId:proof.leadId,
    choiceRecorded:true,status:result.status,mutualConsent:result.mutualConsent,
    meetingScheduled:false,rewardsIssued:false,productionReady:false});
  }
  return true;
 };
 const handle=(req,res)=>serialize(()=>processRequest(req,res));
 const shutdown=()=>serialize(async()=>{
  stopped=true;nonces.clear();npcWorldBridge?.shutdown();
 });
 return Object.freeze({version:'17.4',handle,shutdown,requiresSignedBackend:true,
  publicBrowserCredentialAccepted:false,rewardsIssued:false,
  privateServerOnly:true,productionReady:false});
}
