// Local mission archive installer. Owner-supplied BSPs stay in the browser's
// IndexedDB: no private game assets are sent to Base44 or other players.
// When the actual files are installed under public/game2/maps/archive/, the
// same Game 2 loader can fetch them directly without browser import.
import { GAME2_MISSION_ARCHIVE, archiveByFileName } from './missionArchive.js';

const DB_NAME = 'atomxe-game2-bsp-archive-v1';
const STORE = 'mission-map-files';
const HEADER_BYTES = 152;

export function validateArchiveHeader(buffer, fileSize) {
  const d = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(
    buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  if (d.byteLength < HEADER_BYTES || d.getUint32(0,true) !== 0x50534252 ||
      d.getUint32(4,true) !== 1) throw new Error('Not a Raven RBSP v1 map');
  const lumps=[];
  for (let i=0;i<18;i++) {
    const offset=d.getUint32(8+i*8,true), length=d.getUint32(12+i*8,true);
    if (offset<HEADER_BYTES || offset>fileSize || length>fileSize-offset)
      throw new Error('Corrupt Raven BSP section ' + i);
    lumps.push({offset,length});
  }
  if (lumps[1].length%72 || lumps[10].length%80 ||
      lumps[11].length%4 || lumps[13].length%148 ||
      lumps[10].length===0 || lumps[13].length===0)
    throw new Error('Unexpected BSP surface geometry');
  return lumps;
}

export async function validateArchiveFile(file, record) {
  if (!file || !record) throw new Error('Unknown Game 2 mission file');
  if (file.name.toLowerCase() !== record.filename.toLowerCase() &&
      file.name.toLowerCase() !== record.sourceAlias?.toLowerCase() &&
      file.name.toLowerCase() !== record.weather?.toLowerCase())
    throw new Error('File name does not match selected mission');
  if (file.name.toLowerCase().endsWith('.weather')) {
    if (file.size !== (record.weatherBytes ?? (record.id ? 58763 : record.bytes)) || file.size < 12)
      throw new Error('Unexpected weather file size');
    const d=new DataView(await file.slice(0,4).arrayBuffer());
    if (d.getUint32(0,true)!==1) throw new Error('Unexpected weather file version');
    return 'weather';
  }
  if (file.size !== record.bytes)
    throw new Error('Wrong binary size for '+record.filename+' (expected '+record.bytes+' bytes)');
  const lumps=validateArchiveHeader(await file.slice(0,HEADER_BYTES).arrayBuffer(),file.size);
  if (lumps[0].length<20 || lumps[0].length>2_000_000) throw new Error('Invalid BSP entity data');
  const text=new TextDecoder().decode(await file.slice(lumps[0].offset,lumps[0].offset+lumps[0].length).arrayBuffer());
  if (!/"classname"\s*"info_player_start"/.test(text))
    throw new Error('Mission archive needs an authored single-player start');
  return 'bsp';
}

function openDB() {
  if (typeof indexedDB==='undefined') throw new Error('Browser storage unavailable; use the installed public map assets');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open browser map storage'));
    request.onblocked=()=>reject(new Error('Close other Game 2 tabs and try importing again'));
  });
}
async function withStore(mode,callback) {
  const db=await openDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const store=tx.objectStore(STORE);
      let value;
      const request=callback(store);
      if(request) {
        request.onsuccess=()=>{value=request.result;};
        request.onerror=()=>reject(request.error||new Error('Browser map storage failed'));
      }
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error||new Error('Browser map storage failed'));
      tx.onabort=()=>reject(tx.error||new Error('Browser map storage cancelled'));
    });
  } finally {db.close();}
}

export async function importMissionArchive(files, onProgress=()=>{}) {
  const imported=[], errors=[], ignored=[];
  for (const file of Array.from(files||[])) {
    const record=archiveByFileName(file?.name);
    if (!record) {ignored.push(file?.name||'Unnamed file');continue;}
    try {
      const type=await validateArchiveFile(file,record);
      // The owner's t3_stamp(1).bsp is the canonical t3_stamp.bsp map:
      // save aliases under the canonical key so launch lookup finds them.
      await withStore('readwrite',store=>store.put(file,type==='bsp'?record.filename.toLowerCase():file.name.toLowerCase()));
      imported.push({id:record.id||record.mapId||null,name:file.name,type});
      onProgress({completed:imported.length,filename:file.name});
    } catch(e) {errors.push({file:file.name,error:String(e?.message||e)});}
  }
  return {imported,errors,ignored};
}

export async function installedMissionArchiveIds(base = '', request = (...a) => fetch(...a)) {
  const result=new Set();
  if(typeof indexedDB!=='undefined') {
    try {
      await Promise.all(Object.values(GAME2_MISSION_ARCHIVE).map(async record=>{
        const key=await withStore('readonly',store=>store.getKey(record.filename.toLowerCase()));
        if(key)result.add(record.id);
      }));
    } catch { /* private mode or quota error; local asset path may still work */ }
  }
  // Developer-only file overlay: assets extracted to public/game2/maps/archive/
  // can be played without an additional browser upload. HEAD validates exact
  // Content-Length and rejects Vite's index.html SPA fallback.
  if(base) await Promise.all(Object.values(GAME2_MISSION_ARCHIVE).map(async record=>{
    if(result.has(record.id))return;
    try {
      const response=await request(base+'maps/archive/'+encodeURIComponent(record.filename),{method:'HEAD'});
      const len=Number(response.headers?.get?.('content-length'));
      const type=response.headers?.get?.('content-type')||'';
      if(response.ok && !type.includes('text/html') && len===record.bytes)result.add(record.id);
    } catch { /* map not installed locally */ }
  }));
  return result;
}

export async function readMissionArchive(id,base,request=(...args)=>fetch(...args),options={}) {
  const record=Object.hasOwn(GAME2_MISSION_ARCHIVE,id)?GAME2_MISSION_ARCHIVE[id]:null;
  if (!record) throw new Error('Unknown Game 2 mission archive: '+id);
  let file=null;
  try { file=await withStore('readonly',store=>store.get(record.filename.toLowerCase())); }
  catch { /* fetch the installed public map if browser storage is unavailable */ }
  if(file) {
    // Re-validate before parsing to catch corrupt or partial IndexedDB records.
    await validateArchiveFile(file,record);
    return file.arrayBuffer();
  }
  const url=base+'maps/archive/'+encodeURIComponent(record.filename);
  // Prefer the locally installed static asset (if present). If missing,
  // transparently fetch this specific map through the authenticated Azure
  // Google Drive bridge. Neither Google OAuth tokens nor Drive IDs live here.
  let response=null;
  try { response=await request(url,{signal:options.signal}); }
  catch { /* backend may still have the owner's BSP */ }
  if (response?.ok && !response.headers?.get?.('content-type')?.includes('text/html')) {
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength!==record.bytes)throw new Error('Unexpected map length: '+record.filename);
    validateArchiveHeader(buffer.slice(0,HEADER_BYTES),buffer.byteLength);
    return buffer;
  }
  // All authenticated players consume the administrator-imported Base44
  // mission through the hosted manifest; underlying private entities remain
  // admin-only. Player sessions never need a Google sign-in or local BSP.
  if(options.cloudClient){
    const {downloadHostedMissionBsp,hostedMissionFunctionUnavailable}=await import('./missionArchiveHosted.js');
    if(typeof options.cloudClient.functions?.invoke==='function') {
      try{return await downloadHostedMissionBsp(options.cloudClient,id,request,{signal:options.signal});}
      catch(error){
        if(!hostedMissionFunctionUnavailable(error))throw error;
      }
    }
    // Backward-compatible admin import reader on deployments that have not
    // yet deployed the hosted function. Non-admin RLS may deny this path.
    try{
      const {readStoredMissionBsp}=await import('../campaigns/privateMissionCloud.js');
      const stored=await readStoredMissionBsp(options.cloudClient,id,request);
      if(stored)return stored;
    }catch{/* Only the optional legacy admin reader failed; try Azure next. */}
  }
  const {archiveRemoteConfigured,downloadDriveArchiveBsp}=await import('./missionArchiveRemote.js');
  const remoteBase=options.remoteBase;
  if (remoteBase!==undefined ? archiveRemoteConfigured(remoteBase) : archiveRemoteConfigured()) {
    return downloadDriveArchiveBsp(id,{
      ...(remoteBase!==undefined?{base:remoteBase}:{}),
      request:options.remoteRequest||fetch,signal:options.signal,
    });
  }
  throw new Error('This mission is not installed on the game server: '+record.filename+
    '. The app administrator must restore its verified original game data. ' +
    'Players never need to upload game files. No substitute mission is loaded.');
}

export async function clearMissionArchive(id) {
  const record=GAME2_MISSION_ARCHIVE[id];
  if(!record)throw new Error('Unknown archive map');
  await withStore('readwrite',store=>store.delete(record.filename.toLowerCase()));
}
