// Combat / Quest 18.0 — Base44 auth.me() signs one server-issued private
// world challenge. It does not create world sessions or grant quest rewards.
// Opt-in STAGING ONLY; the separate private worker validates this HMAC and
// independently checks that both actual login sessions are still active.
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';
import {inspectStoredCharacterEvidence}
 from '../../shared/duelCharacterProvenance.mjs';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const CHALLENGE=/^[a-f0-9]{64}$/;
const validId=(v:unknown)=>typeof v==='string'&&ID.test(v)&&
 !['__anon__','__default__','__dev_test__'].includes(v);
const object=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:string[])=>object(v)&&
 Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const hex=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const sign=async(secret:string,text:string)=>{
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(text))));
};
const reply=(body:unknown,status:number,origin:string)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store','x-content-type-options':'nosniff',
 'vary':'Origin',...(origin?{'access-control-allow-origin':origin}:{})}
});
const deny=(reason:string,status:number,origin:string)=>reply({
 ok:false,version:'18.0',reason,rewardsIssued:false,productionReady:false},status,origin);
const fields=['v','purpose','ownerId','characterId','challenge',
 'actionSessionId','issuedAtMs','expiresAtMs'] as const;
const readSmallBody=async(req:Request)=>{
 const reader=req.body?.getReader();
 if(!reader)throw Error('missing_body');
 const chunks:Uint8Array[]=[];let total=0;
 for(;;){
  const {value,done}=await reader.read();
  if(done)break;
  total+=value.byteLength;
  if(total>512){await reader.cancel().catch(()=>{});throw Error('oversized_body')}
  chunks.push(value);
 }
 const bytes=new Uint8Array(total);let offset=0;
 for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
};
Deno.serve(async(req:Request)=>{
 const origin=Deno.env.get('GAME3D_QUESTBOOK_APP_ORIGIN')||'';
 const caller=req.headers.get('origin')||'';
 if(!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin))
  return deny('staging_origin_not_configured',503,'');
 if(caller&&caller!==origin)return deny('staging_origin_denied',403,'');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'cache-control':'no-store','vary':'Origin'}});
 if(req.method!=='POST')return deny('method_not_allowed',405,origin);
 if(Deno.env.get('GAME3D_WORLD_PAIRING_180_ENABLED')!=='true'||
    Deno.env.get('GAME3D_PRIVATE_STAGING_ENV')!=='staging')
  return deny('staging_pairing_disabled',503,origin);
 const pairingSecret=Deno.env.get('GAME3D_WORLD_PAIRING_180_SECRET')||'';
 const actionSecret=Deno.env.get('GAME3D_QUEST_ACTION_174_SECRET')||'';
 if(pairingSecret.length<32||actionSecret.length<32||pairingSecret===actionSecret)
  return deny('independent_backend_signers_required',503,origin);
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._~+\/-]{16,8192}$/.test(authorization))
  return deny('authenticated_login_required',401,origin);
 if(Number(req.headers.get('content-length')||0)>512)
  return deny('oversized_request',413,origin);
 try{
  const client=createClientFromRequest(req),me=await client.auth.me();
  if(!validId(me?.id))return deny('authenticated_login_required',401,origin);
  // Fixed small request shape. The browser cannot choose account/world IDs.
  let raw:string;
  try{raw=await readSmallBody(req)}catch{return deny('oversized_or_invalid_request',413,origin)}
  let data:unknown;
  try{data=JSON.parse(raw)}catch{return deny('invalid_request',422,origin)}
  if(!exact(data,['characterId','challenge'])||
     !validId(data.characterId)||typeof data.challenge!=='string'||
     !CHALLENGE.test(data.challenge))return deny('invalid_challenge_request',422,origin);
  let rows:unknown;
  try{rows=await client.asServiceRole.entities.Game3DCharacterSave.filter({
   owner_id:String(me.id),character_id:data.characterId
  },'-created_date',2)}catch{return deny('staging_vault_unavailable',503,origin)}
  const owned=inspectStoredCharacterEvidence({
   ownerId:String(me.id),characterId:data.characterId,rows});
  if(owned?.ok!==true||owned.ownerBindingVerified!==true||
     owned.combatStatsVerified!==false||owned.eligible!==false)
   return deny('character_not_owned',403,origin);
  const issuedAtMs=Date.now(),expiresAtMs=issuedAtMs+10000;
  const actionSessionId='qb174-'+await sign(actionSecret,
    'quest-action-session-v1\n'+authorization);
  const proof={v:1,purpose:'base44-auth-me-world-pairing-180',
   ownerId:String(me.id),characterId:String(data.characterId),
   challenge:String(data.challenge),actionSessionId,issuedAtMs,expiresAtMs};
  const canonical=JSON.stringify(fields.map(k=>proof[k]));
  const signature=await sign(pairingSecret,'game3d-world-pairing-180\n'+canonical);
  return reply({ok:true,version:'18.0',proof,signature,
   rewardsIssued:false,productionReady:false},200,origin);
 }catch{return deny('staging_pairing_unavailable',503,origin)}
});
