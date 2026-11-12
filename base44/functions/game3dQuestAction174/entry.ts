// Game 3D 17.4: authenticated explicit NPC quest / Rival consent intent.
// This Base44 function authenticates each request and binds a saved
// character to its account before signing a SHORT-LIVED, exact action.
// A browser cannot sign the private worker request or issue rewards.
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';
import {inspectStoredCharacterEvidence}
 from '../../shared/duelCharacterProvenance.mjs';

const PATH='/internal/game3d/quest-action';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const QUEST=/^[A-Za-z0-9_.:-]{1,160}$/;
const LEAD=/^[A-Za-z0-9_.:-]{8,128}$/;
const choices=new Set(['rival','friendly_rival','decline']);
const object=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x:unknown,keys:string[])=>object(x)&&
 Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const validId=(x:unknown)=>typeof x==='string'&&ID.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const hex=(bytes:Uint8Array)=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const mac=async(secret:string,value:string)=>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(value))));
};
const hash=async(raw:string)=>hex(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(raw))));
const json=(body:unknown,status:number,origin:string)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store','x-content-type-options':'nosniff',
 'vary':'Origin',...(origin?{'access-control-allow-origin':origin}:{})}
});
const denied=(reason:string,status:number,origin:string)=>json({
 ok:false,version:'17.4',reason,accepted:false,choiceRecorded:false,
 rewardsIssued:false,productionReady:false},status,origin);
const readBody=async(req:Request)=>{
 if(Number(req.headers.get('content-length')||0)>2048)throw Error('oversized');
 const reader=req.body?.getReader();if(!reader)throw Error('missing_body');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>2048){await reader.cancel().catch(()=>{});throw Error('oversized')}
  chunks.push(value);
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
};
Deno.serve(async(req:Request)=>{
 const origin=Deno.env.get('GAME3D_QUESTBOOK_APP_ORIGIN')||'';
 const requester=req.headers.get('origin')||'';
 if(!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin))
  return denied('origin_not_configured',503,'');
 if(requester&&requester!==origin)return denied('origin_denied',403,'');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'access-control-allow-origin':origin,
  'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'cache-control':'no-store','vary':'Origin'
 }});
 if(req.method!=='POST')return denied('method_not_allowed',405,origin);
 if(Deno.env.get('GAME3D_QUEST_ACTION_174_ENABLED')!=='true'||
    Deno.env.get('GAME3D_QUESTBOOK_ENABLED')!=='true')
  return denied('intent_feature_disabled',503,origin);
 const secret=Deno.env.get('GAME3D_QUEST_ACTION_174_SECRET')||'';
 const target=Deno.env.get('GAME3D_QUEST_ACTION_174_URL')||'';
 if(secret.length<32||!/^https:\/\/[^?#\s]+\/internal\/game3d\/quest-action$/.test(target))
  return denied('intent_backend_not_configured',503,origin);
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._~+\/-]{16,8192}$/.test(authorization))
  return denied('authenticated_login_required',401,origin);
 try{
  const sdk=createClientFromRequest(req);
  const me=await sdk.auth.me();
  if(!validId(me?.id))return denied('authenticated_login_required',401,origin);
  let input:unknown;
  try{input=await readBody(req)}catch{return denied('invalid_intent_request',422,origin)}
  if(!exact(input,['action','data'])||input.action!=='commit'||
     !exact(input.data,['characterId','intent','questId','leadId','choice','confirmed']))
   return denied('invalid_intent_command',422,origin);
  const data=input.data as Record<string,unknown>;
  if(!validId(data.characterId)||data.confirmed!==true)
   return denied('explicit_confirmation_required',422,origin);
  const accept=data.intent==='accept_quest'&&
   typeof data.questId==='string'&&QUEST.test(data.questId)&&
   data.leadId===null&&data.choice===null;
  const rival=data.intent==='choose_rival'&&data.questId===null&&
   typeof data.leadId==='string'&&LEAD.test(data.leadId)&&
   choices.has(data.choice as string);
  if(!accept&&!rival)return denied('invalid_intent_command',422,origin);
  // Character ownership lookup is NOT proof of earned quest progress.
  // Private PG services separately verify catalog, prerequisites and votes.
  let rows:unknown;
  try{rows=await sdk.asServiceRole.entities.Game3DCharacterSave.filter({
   owner_id:String(me.id),character_id:data.characterId
  },'-created_date',2)}catch{return denied('vault_unavailable',503,origin)}
  const owned=inspectStoredCharacterEvidence({
   ownerId:String(me.id),characterId:data.characterId,rows
  });
  if(owned?.ok!==true||owned.ownerBindingVerified!==true||
     owned.combatStatsVerified!==false||owned.eligible!==false)
   return denied('character_ownership_not_verified',403,origin);
  const issuedAtMs=Date.now(),expiresAtMs=issuedAtMs+25000;
  const sessionId='qb174-'+await mac(secret,'quest-action-session-v1\n'+authorization);
  const proof={v:1,proof:'base44-auth-me-explicit-quest-action',
   ownerId:String(me.id),characterId:data.characterId,sessionId,
   issuedAtMs,expiresAtMs,nonce:crypto.randomUUID(),
   intent:data.intent,questId:data.questId,leadId:data.leadId,choice:data.choice};
  const raw=JSON.stringify(proof);
  const signature=await mac(secret,String(issuedAtMs)+'\nPOST\n'+PATH+'\n'+await hash(raw));
  const remote=await fetch(target,{method:'POST',redirect:'error',headers:{
   'content-type':'application/json',
   'x-game3d-quest-action-time':String(issuedAtMs),
   'x-game3d-quest-action-signature':signature
  },body:raw,signal:AbortSignal.timeout(7000)});
  if(remote.status!==200)return denied('intent_authority_unavailable',503,origin);
  const answer=await remote.json();
  if(!object(answer)||answer.ok!==true||answer.version!=='17.4'||
     answer.intent!==data.intent||answer.rewardsIssued!==false||
     answer.productionReady!==false)return denied('unverified_intent_reply',503,origin);
  if(accept){
   if(answer.questId!==data.questId||answer.accepted!==true||
      answer.questCompleted!==false)return denied('unverified_acceptance',503,origin);
   return json({ok:true,version:'17.4',intent:'accept_quest',
    questId:data.questId,accepted:true,questCompleted:false,
    rewardsIssued:false,productionReady:false},200,origin);
  }
  const statuses=['pending','declined','disputed','rival','friendly_rival'];
  if(answer.leadId!==data.leadId||answer.choiceRecorded!==true||
     !statuses.includes(answer.status as string)||
     typeof answer.mutualConsent!=='boolean'||
     answer.mutualConsent!==['rival','friendly_rival'].includes(answer.status as string))
   return denied('unverified_rival_reply',503,origin);
  return json({ok:true,version:'17.4',intent:'choose_rival',leadId:data.leadId,
   choiceRecorded:true,status:answer.status,mutualConsent:answer.mutualConsent,
   meetingScheduled:false,rewardsIssued:false,productionReady:false},200,origin);
 }catch{return denied('intent_backend_unavailable',503,origin)}
});
