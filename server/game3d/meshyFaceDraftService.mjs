/**
 * Preview-only opt-in Meshy face-head draft. No public/production use.
 *
 * API key and HMAC secret stay SERVER-SIDE. The photo data is forwarded only
 * after a signed-in, explicitly allowlisted visitor consents. Do not publish
 * generated heads as playable Game 3D bodies: they require topology, neck,
 * scale, skin and facial-rig/animation compatibility checks first.
 */
const API = 'https://api.meshy.ai/openapi/v1';
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_TTL_MS = 45 * 60 * 1000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1_400_000;
const MAX_BODY_BYTES = 8_000_000;
const providerModels = Object.freeze({
  single: 'image-to-3d',
  multi: 'multi-image-to-3d',
});

const error = (code, status = 400) => Object.freeze({ok:false,code,status});
const userIdOf = user => typeof user?.id === 'string' || typeof user?.id === 'number'
  ? String(user.id) : '';
const envText = (env, key) => String(env?.[key] || '').trim();

export function faceDraftEnabled(env, user) {
  const ids = envText(env,'GAME3D_MESHY_FACE_ALLOWED_USERS').split(',').map(x=>x.trim());
  return envText(env,'GAME3D_MESHY_FACE_ENABLED')==='true' &&
    envText(env,'GAME3D_MESHY_FACE_SERVER_ENV')==='test' &&
    envText(env,'MESHY_API_KEY').length>=12 &&
    envText(env,'GAME3D_MESHY_FACE_SIGNING_SECRET').length>=32 &&
    userIdOf(user).length>0 && ids.includes(userIdOf(user));
}

export function validateFaceDraftImages(input) {
  if(input?.consent!==true) return error('photo-consent-required');
  if(!Array.isArray(input.images)||input.images.length<1||input.images.length>MAX_IMAGES)
    return error('provide-one-to-four-images');
  const total = input.images.reduce((n,v)=>n+(typeof v==='string'?v.length:0),0);
  if(total>MAX_BODY_BYTES)return error('photos-too-large',413);
  for(const value of input.images){
    if(typeof value!=='string'||value.length>MAX_IMAGE_BYTES*1.36+70)
      return error('invalid-photo-format-or-size',413);
    const match=DATA_URL.exec(value);
    if(!match||match[2].length<100||match[2].length*3/4>MAX_IMAGE_BYTES+3)
      return error('invalid-photo-format-or-size',400);
  }
  return Object.freeze({ok:true,images:input.images});
}
const toBase64Url = string => {
  const bytes=new TextEncoder().encode(string);
  let output='';
  for(const b of bytes)output+=String.fromCharCode(b);
  return btoa(output).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
const fromBase64Url = string => {
  const data=atob(string.replace(/-/g,'+').replace(/_/g,'/'));
  return new TextDecoder().decode(Uint8Array.from(data,c=>c.charCodeAt(0)));
};
const hmac = async (payload, secret) => {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
};
export async function issueFaceDraftTicket({taskId,mode,user,secret,now=Date.now()}) {
  if(!UUID.test(taskId)||!Object.values(providerModels).includes(mode)||!userIdOf(user))
    throw Error('Cannot sign an unknown Meshy task');
  const encoded=toBase64Url(JSON.stringify({
    taskId,mode,userId:userIdOf(user),expiresAt:now+TICKET_TTL_MS,
  }));
  return encoded+'.'+await hmac(encoded,secret);
}
export async function verifyFaceDraftTicket(ticket,{user,secret,now=Date.now()}) {
  if(typeof ticket!=='string'||ticket.length>768||!ticket.includes('.'))return null;
  const [encoded,signature,...rest]=ticket.split('.');
  if(rest.length||!/^[0-9a-f]{64}$/.test(signature))return null;
  const expected=await hmac(encoded,secret);
  // Constant-length comparison without early exits (prevents simple prefix leaks).
  let mismatch=0;
  for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);
  if(mismatch)return null;
  try{
    const data=JSON.parse(fromBase64Url(encoded));
    if(!UUID.test(data.taskId)||!Object.values(providerModels).includes(data.mode)||
      data.userId!==userIdOf(user)||!Number.isSafeInteger(data.expiresAt)||
      data.expiresAt<now || data.expiresAt>now+TICKET_TTL_MS)return null;
    return data;
  }catch{return null}
}
const safeAsset = uri => {
  if(typeof uri!=='string')return null;
  try{
    const u=new URL(uri);
    return u.protocol==='https:' && (u.hostname==='assets.meshy.ai'||u.hostname.endsWith('.assets.meshy.ai'))
      ?u.href:null;
  }catch{return null}
};
export function publicFaceDraftStatus(task) {
  const status=['PENDING','IN_PROGRESS','SUCCEEDED','FAILED','CANCELED'].includes(task?.status)
    ? task.status:'UNKNOWN';
  return {
    status,progress:Math.max(0,Math.min(100,Number(task?.progress)||0)),
    glb:status==='SUCCEEDED'?safeAsset(task?.model_urls?.glb):null,
    thumbnail:status==='SUCCEEDED'?safeAsset(task?.thumbnail_url):null,
    error:status==='FAILED'?'Meshy could not reconstruct the face. Try clearer photos.':null,
  };
}

const requests = new Map(); // best-effort preview-only guard, NOT distributed billing enforcement
function previewRateLimit(user,now=Date.now()){
  const key=userIdOf(user),times=(requests.get(key)||[]).filter(t=>now-t<86400000);
  if(times.length>=2)return false;
  times.push(now);requests.set(key,times);
  if(requests.size>80)for(const [id,hits] of requests)if(hits.every(t=>now-t>86400000))requests.delete(id);
  return true;
}
export function resetFaceDraftRateLimitForTests(){requests.clear();}

const callMeshy=async({env,fetcher,path,method='GET',body})=>{
  const response=await fetcher(API+'/'+path,{
    method,headers:{
      Authorization:'Bearer '+envText(env,'MESHY_API_KEY'),
      ...(body?{'Content-Type':'application/json'}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(20000),
  });
  let json={};try{json=await response.json()}catch{/* provider can return an empty error */}
  if(!response.ok)return {ok:false,code:'meshy-provider-error',status:response.status===429?429:502};
  return {ok:true,json};
};

export async function createFaceDraft({env,user,input,fetcher=fetch}) {
  if(!faceDraftEnabled(env,user))return error('face-draft-disabled-or-not-authorized',403);
  const validated=validateFaceDraftImages(input);
  if(!validated.ok)return validated;
  if(!previewRateLimit(user))return error('face-draft-daily-preview-limit',429);
  const mode=validated.images.length===1?providerModels.single:providerModels.multi;
  const body={
    ai_model:'meshy-7.1',should_texture:true,texture_model:'meshy-n1',
    texture_resolution:'2k',target_formats:['glb'],
    ...(mode===providerModels.single?{image_url:validated.images[0]}:{image_urls:validated.images}),
  };
  let response;
  try{response=await callMeshy({env,fetcher,path:mode,method:'POST',body})}
  catch{return error('meshy-unavailable',502)}
  if(!response.ok)return response;
  const taskId=response.json?.result;
  if(!UUID.test(taskId))return error('meshy-invalid-task',502);
  const ticket=await issueFaceDraftTicket({
    taskId,mode,user,secret:envText(env,'GAME3D_MESHY_FACE_SIGNING_SECRET')});
  return Object.freeze({ok:true,ticket,status:'PENDING',mode});
}

export async function getFaceDraft({env,user,ticket,fetcher=fetch,remove=false}) {
  if(!faceDraftEnabled(env,user))return error('face-draft-disabled-or-not-authorized',403);
  const signed=await verifyFaceDraftTicket(ticket,{
    user,secret:envText(env,'GAME3D_MESHY_FACE_SIGNING_SECRET')});
  if(!signed)return error('face-draft-ticket-invalid',403);
  let response;
  try{response=await callMeshy({env,fetcher,
    path:signed.mode+'/'+signed.taskId,method:remove?'DELETE':'GET'})}
  catch{return error('meshy-unavailable',502)}
  if(!response.ok)return response;
  return Object.freeze({ok:true,...(remove?{deleted:true}:publicFaceDraftStatus(response.json))});
}
