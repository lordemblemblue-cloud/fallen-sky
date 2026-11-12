// Game 3D Combat / Quest 17.0 — opt-in authenticated read relay.
// Authenticated Base44 -> signed fixed-path server request -> canonical
// PostgreSQL 16.7/16.8/16.9 read. Never relay browser quest progress or XP.
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';
import {inspectStoredCharacterEvidence}
 from '../../shared/duelCharacterProvenance.mjs';

const PATH='/internal/game3d/questbook';
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const exactly=(x:unknown,keys:string[])=>object(x)&&
 Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const hex=(bytes:Uint8Array)=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async(raw:string)=>{
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 return hex(new Uint8Array(bytes));
};
const mac=async(secret:string,value:string)=>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(value))));
};
const validId=(x:unknown)=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__'].includes(x);
const json=(body:unknown,status=200,origin='')=>new Response(JSON.stringify(body),{
 status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'vary':'Origin',
  ...(origin?{'access-control-allow-origin':origin}:{})
 }
});
const refused=(error:string,code:string,status:number,origin:string)=>
 json({error,code,readOnly:true,rewardsIssued:false},status,origin);
const readInput=async(req:Request)=>{
 const len=Number(req.headers.get('content-length')||0);
 if(!Number.isFinite(len)||len>2048)throw Error('too_large');
 const reader=req.body?.getReader();
 if(!reader)throw Error('missing_body');
 let size=0;
 const chunks:Uint8Array[]=[];
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  size+=value.byteLength;
  if(size>2048){await reader.cancel().catch(()=>{});throw Error('too_large');}
  chunks.push(value);
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const item of chunks){bytes.set(item,offset);offset+=item.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
};
Deno.serve(async req=>{
 const origin=Deno.env.get('GAME3D_QUESTBOOK_APP_ORIGIN')||'';
 const requestOrigin=req.headers.get('origin')||'';
 if(!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin))
  return refused('Questbook configuration unavailable','not_configured',503,'');
 if(requestOrigin&&requestOrigin!==origin)
  return refused('Origin denied','forbidden',403,'');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'access-control-allow-origin':origin,
  'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'cache-control':'no-store','vary':'Origin'
 }});
 if(req.method!=='POST')
  return refused('Method not allowed','method_not_allowed',405,origin);
 if(Deno.env.get('GAME3D_QUESTBOOK_ENABLED')!=='true')
  return refused('Verified Questbook is disabled','not_configured',503,origin);
 const secret=Deno.env.get('GAME3D_QUESTBOOK_SECRET')||'';
 const target=Deno.env.get('GAME3D_QUESTBOOK_URL')||'';
 if(secret.length<32||!/^https:\/\/[^?#\s]+\/internal\/game3d\/questbook$/.test(target))
  return refused('Verified Questbook configuration unavailable','not_configured',503,origin);
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._~+\/-]{16,8192}$/.test(authorization))
  return refused('Authenticated login required','unauthorized',401,origin);
 let actor:Record<string,unknown>;
 try{
  const sdk=createClientFromRequest(req);
  const me=await sdk.auth.me();
  if(!validId(me?.id))
   return refused('Authenticated login required','unauthorized',401,origin);
  let input:unknown;
  try{input=await readInput(req)}
  catch{return refused('Invalid Questbook request','invalid',422,origin);}
  if(!exactly(input,['action','data'])||input.action!=='read'||
     !exactly(input.data,['characterId','knownRevision','knownViewId']))
   return refused('Invalid Questbook read command','invalid',422,origin);
  const info=input.data as Record<string,unknown>;
  if(!validId(info.characterId)||
     !(info.knownRevision===null||
      typeof info.knownRevision==='string'&&SHA.test(info.knownRevision))||
     !(info.knownViewId===null||
      typeof info.knownViewId==='string'&&UUID.test(info.knownViewId)))
   return refused('Invalid Questbook request','invalid',422,origin);
  // Character selector is browser-supplied but verified against an exact,
  // unique, server-read owner/character record. This is OWNERSHIP ONLY:
  // saved progress/rewards are not accepted as authoritative evidence.
  let rows:unknown;
  try{rows=await sdk.asServiceRole.entities.Game3DCharacterSave.filter({
   owner_id:String(me.id),character_id:info.characterId
  },'-created_date',2)}
  catch{return refused('Character lookup unavailable','vault_unavailable',503,origin);}
  const stored=inspectStoredCharacterEvidence({
   ownerId:String(me.id),characterId:info.characterId,rows
  });
  if(stored?.ok!==true||stored.ownerBindingVerified!==true||
     stored.combatStatsVerified!==false||stored.eligible!==false)
   return refused('Character ownership not verified','character_unverified',403,origin);
  const sessionDigest=await mac(secret,'questbook-session-v1\n'+authorization);
  const issuedAtMs=Date.now(),expiresAtMs=issuedAtMs+25000;
  actor={
   v:1,proof:'base44-auth-me-character-vault',
   ownerId:String(me.id),characterId:info.characterId,
   sessionId:'qb170-'+sessionDigest,
   issuedAtMs,expiresAtMs,nonce:crypto.randomUUID(),
   knownRevision:info.knownRevision,knownViewId:info.knownViewId
  };
  const raw=JSON.stringify(actor);
  const signature=await mac(secret,String(issuedAtMs)+'\nPOST\n'+PATH+
   '\n'+await hash(raw));
  const remote=await fetch(target,{
   method:'POST',redirect:'error',headers:{
    'content-type':'application/json',
    'x-game3d-questbook-time':String(issuedAtMs),
    'x-game3d-questbook-signature':signature
   },body:raw,signal:AbortSignal.timeout(7000)
  });
  if(remote.status!==200)
   return refused('Authoritative Questbook unavailable',
    'questbook_authority_unavailable',503,origin);
  const result=await remote.json();
  if(!object(result)||result.ok!==true||result.version!=='16.9'||
     result.readOnly!==true||result.rewardsIssued!==false||
     !UUID.test(result.viewId as string)||!SHA.test(result.revision as string)||
     !Number.isSafeInteger(result.sequence)||
     typeof result.unchanged!=='boolean'||
     (result.unchanged===true&&Object.hasOwn(result,'snapshot'))||
     (result.unchanged===false&&!object(result.snapshot)))
   return refused('Authoritative Questbook response invalid',
    'unverified_questbook_reply',503,origin);
  // Any body from the signed private transport is still treated as
  // untrusted by the client 16.9 reconciler. No local XP or rewards emitted.
  return json(result,200,origin);
 }catch{
  return refused('Verified Questbook temporarily unavailable',
   'questbook_backend_unavailable',503,origin);
 }
});
