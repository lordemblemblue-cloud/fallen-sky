// Browser half of the authenticated Azure/Google Drive Mission Archive.
// Only the Azure backend handles OAuth; the browser never sees Drive file IDs
// or Google tokens. Entering the archive reads a small manifest; choosing a
// map fetches only that one validated BSP file.
import { GAME2_MISSION_ARCHIVE } from './missionArchive.js';
import { validateArchiveHeader } from './missionArchiveStorage.js';

const compiledApi = import.meta.env?.VITE_GAME2_MISSION_ARCHIVE_API || '';
export function archiveApiBase(value=compiledApi) {
  const base=String(value||'').trim().replace(/\/+$/,'');
  if(!base)return null;
  try {
    const url=new URL(base);
    if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))
      throw new Error('Mission Archive API must use HTTPS');
    if(url.username||url.password||url.search||url.hash)throw new Error('Mission Archive API must not contain credentials');
    return url.toString().replace(/\/+$/,'');
  }catch(error){throw new Error('Mission Archive Azure URL is invalid: '+(error?.message||error));}
}
export function archiveRemoteConfigured(value=compiledApi) {return !!archiveApiBase(value);}
export class MissionArchiveRemoteError extends Error {
  constructor(message,status=0) {super(message);this.name='MissionArchiveRemoteError';this.status=status;}
}
export async function fetchDriveArchiveManifest({base=compiledApi,request=fetch,signal}={}) {
  const api=archiveApiBase(base);
  if(!api)return {connected:false,status:'unconfigured',missions:[],message:'Azure Google Drive gateway is not configured yet.'};
  let response;
  try{response=await request(api+'/manifest',{method:'GET',credentials:'include',signal,headers:{Accept:'application/json'}});}
  catch(e){throw new MissionArchiveRemoteError('Cannot reach the Azure Mission Archive gateway. '+String(e?.message||e));}
  if(!response.ok){
    let detail='';
    try{detail=(await response.json())?.error||'';}catch{ /* Azure may return a sign-in HTML redirect */ }
    throw new MissionArchiveRemoteError(detail||(response.status===401||response.status===403?
      'Sign in to the connected Azure/Google Drive archive first.':
      'Azure Mission Archive unavailable, HTTP '+response.status),response.status);
  }
  if(response.headers?.get?.('content-type')?.includes('text/html'))
    throw new MissionArchiveRemoteError('Azure returned a sign-in page rather than a mission inventory',401);
  const data=await response.json();
  if(!Array.isArray(data?.missions))throw new MissionArchiveRemoteError('Invalid Azure mission catalog');
  const checked=data.missions.filter(m=>GAME2_MISSION_ARCHIVE[m?.id])
    .map(m=>({id:m.id,available:m.available===true,status:String(m.status||'missing'),
      missionPlayable:false,weatherAvailable:m.weatherAvailable===true}));
  return {connected:true,status:'connected',available:checked.filter(m=>m.available).length,
    missions:checked,message:String(data.notice||'Mission maps only; full original scripts are not yet playable.')};
}
export async function downloadDriveArchiveBsp(id,{base=compiledApi,request=fetch,signal}={}) {
  const record=GAME2_MISSION_ARCHIVE[id];
  if(!record)throw new MissionArchiveRemoteError('Unknown original mission '+id,404);
  const api=archiveApiBase(base);
  if(!api)throw new MissionArchiveRemoteError('Azure Google Drive gateway is not configured',503);
  const url=api+'/maps/'+encodeURIComponent(id);
  let response;
  try{response=await request(url,{method:'GET',credentials:'include',signal,headers:{Accept:'application/octet-stream'}});}
  catch(e){throw new MissionArchiveRemoteError('Could not download original mission BSP: '+String(e?.message||e));}
  if(!response.ok) {
    let message='Mission missing from Google Drive ('+response.status+')';
    try{message=(await response.json())?.error||message;}catch{}
    throw new MissionArchiveRemoteError(message,response.status);
  }
  const type=response.headers?.get?.('content-type')||'';
  if(type.includes('text/html')||type.includes('application/json'))
    throw new MissionArchiveRemoteError('Azure returned non-BSP content');
  const reported=Number(response.headers?.get?.('content-length'))||0;
  if(reported && reported!==record.bytes)throw new MissionArchiveRemoteError('Original mission size mismatch: '+record.filename);
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength!==record.bytes)throw new MissionArchiveRemoteError('Original mission download incomplete: '+record.filename);
  validateArchiveHeader(buffer.slice(0,152),buffer.byteLength);
  return buffer;
}
