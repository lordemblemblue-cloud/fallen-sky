// Player-facing Base44 cloud manifest + short-lived chunk stream for
// administrator-installed original mission geometry. There is never a player
// file picker, Google Drive authorization prompt or private storage URI here.
import { GAME2_MISSION_ARCHIVE } from './missionArchive.js';
import { validateArchiveHeader } from './missionArchiveStorage.js';

const CHUNK = 4 * 1024 * 1024;
const DATA_TYPE='application/octet-stream';
const realError = (error) => String(error?.message || error || 'Mission server unavailable');

function dataOf(response) {
  const body=response?.data ?? response;
  if (!body || typeof body !== 'object') throw new Error('Invalid mission cloud response');
  if (body.error || body.success===false) throw new Error(String(body.error||'Mission cloud request rejected'));
  return body;
}

function checkManifestEntry(entry) {
  const record=GAME2_MISSION_ARCHIVE[entry?.id];
  return !!(record && entry.filename===record.filename &&
    entry.bytes===record.bytes && entry.available===true);
}

export async function hostedMissionIds(client) {
  const manifest=dataOf(await client.functions.invoke('game2MissionArchive',{action:'list'}));
  if(!Array.isArray(manifest.missions))throw Error('Invalid hosted mission list');
  return new Set(manifest.missions.filter(checkManifestEntry).map(entry=>entry.id));
}

function validDownloadMeta(manifest,record) {
  if(manifest.id!==record.id || manifest.filename!==record.filename ||
     manifest.bytes!==record.bytes || !Array.isArray(manifest.parts) ||
     manifest.parts.length!==Math.ceil(record.bytes/CHUNK)) {
    throw Error('Hosted mission manifest does not match the selected original map');
  }
  const byIndex=new Map(manifest.parts.map(p=>[p.index,p]));
  if(byIndex.size!==manifest.parts.length)throw Error('Duplicate mission part');
  const ordered=[];
  for(let index=0;index<manifest.parts.length;index++){
    const part=byIndex.get(index),offset=index*CHUNK,expected=Math.min(CHUNK,record.bytes-offset);
    if(!part||part.offset!==offset||part.bytes!==expected||
       typeof part.url!=='string'||!/^https:\/\/[^\s]+$/.test(part.url)||
       !/^[a-f0-9]{64}$/.test(part.sha256||''))throw Error('Invalid hosted mission part');
    ordered.push(part);
  }
  return ordered;
}

export async function downloadHostedMissionBsp(client,id,request=(...a)=>fetch(...a),{signal}={}) {
  const record=Object.hasOwn(GAME2_MISSION_ARCHIVE,id)?GAME2_MISSION_ARCHIVE[id]:null;
  if(!record)throw Error('Unknown archive map');
  const result=dataOf(await client.functions.invoke('game2MissionArchive',{action:'download',id}));
  const parts=validDownloadMeta(result,record);
  const output=new Uint8Array(record.bytes);
  for(const part of parts) {
    const response=await request(part.url,{signal,headers:{Accept:DATA_TYPE}});
    if(!response.ok || /text\/html|application\/json/i.test(response.headers?.get?.('content-type')||''))
      throw Error('The game server could not deliver an original mission asset');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==part.bytes)throw Error('Incomplete mission asset: '+record.filename);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
      byte=>byte.toString(16).padStart(2,'0')).join('');
    if(hash!==part.sha256)throw Error('Mission chunk integrity check failed');
    output.set(new Uint8Array(bytes),part.offset);
  }
  validateArchiveHeader(output.buffer.slice(0,152),record.bytes);
  return output.buffer;
}

// Transport can be absent on older deploys. The same Game2 file reader then
// tries the administrator-only legacy path or the authenticated Azure bridge.
export function hostedMissionFunctionUnavailable(error) {
  const status=error?.response?.status ?? error?.status ?? 0;
  return [404,405,501].includes(Number(status)) ||
    /function (?:not found|does not exist|unavailable|not deployed)|mission data is not installed on the game server/i.test(realError(error));
}
