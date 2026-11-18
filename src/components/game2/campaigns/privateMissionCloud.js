import { privateUploadUri } from './privateUpload.js';
// Owner-controlled transfer of extracted Jedi Academy BSP files into
// Base44 PRIVATE storage, replacing the Azure/Drive runtime dependency.
// Records use existing admin-only RLS entities, never a public game asset URL.
import { GAME2_MISSION_ARCHIVE, archiveByFileName } from '../engine/missionArchive.js';
import { validateArchiveFile, validateArchiveHeader } from '../engine/missionArchiveStorage.js';

const GAME_KEY='jedi_academy';
const CHUNK_SIZE=4*1024*1024;
const sourcePath=name=>'mission-archive/bsp/'+name;
const hashBlob=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),
  n=>n.toString(16).padStart(2,'0')).join('');
const sourceMatches=(row,record)=>row.game_key===GAME_KEY&&
  row.path===sourcePath(record.filename)&&Number(row.byte_size)===record.bytes;
const chunksExpected=size=>Math.ceil(size/CHUNK_SIZE);

async function rows(client) {
  const [files,chunks]=await Promise.all([
    client.entities.GameReconstructionFile.filter({game_key:GAME_KEY,area:'original_asset'},'path',1000),
    client.entities.JediPakChunk.filter({game_key:GAME_KEY,status:'cached'},'archive_name',1000),
  ]);
  return {files,chunks};
}
function complete(record,listing) {
  const source=listing.files.find(x=>sourceMatches(x,record));
  if(!source)return false;
  for(let i=0;i<chunksExpected(record.bytes);i++){
    const offset=i*CHUNK_SIZE,size=Math.min(CHUNK_SIZE,record.bytes-offset);
    if(!listing.chunks.some(x=>x.archive_asset_id===source.id&&
       x.archive_name===record.filename&&Number(x.chunk_index)===i&&
       Number(x.offset)===offset&&Number(x.byte_size)===size&&
       Number(x.source_size)===record.bytes&&
       /^private\//.test(x.storage_url||'')&&/^[0-9a-f]{64}$/.test(x.sha256||'')))
      return false;
  }
  return true;
}
export async function storedMissionIds(client){
  const listing=await rows(client);
  return new Set(Object.values(GAME2_MISSION_ARCHIVE).filter(r=>complete(r,listing)).map(r=>r.id));
}
export async function importPrivateMissionBsp(client,files,progress=()=>{}){
  const results=[],failures=[];
  const listing=await rows(client);
  for(const file of Array.from(files||[])){
    const record=archiveByFileName(file.name);
    if(!record||!file.name.toLowerCase().endsWith('.bsp')){failures.push({file:file.name,error:'Unknown BSP filename'});continue;}
    try{
      await validateArchiveFile(file,record);
      let source=listing.files.find(x=>sourceMatches(x,record));
      if(!source){
        source=await client.entities.GameReconstructionFile.create({
          game_key:GAME_KEY,area:'original_asset',path:sourcePath(record.filename),
          display_name:record.filename,byte_size:record.bytes,canonical:true,editable:false,
          status:'catalogued',source_origin:'owner_private_import',
          metadata:{private:true,chunk_bytes:CHUNK_SIZE,chunk_count:chunksExpected(record.bytes)},
        });
        listing.files.push(source);
      }
      for(let i=0;i<chunksExpected(record.bytes);i++){
        const offset=i*CHUNK_SIZE,size=Math.min(CHUNK_SIZE,record.bytes-offset);
        const part=file.slice(offset,offset+size);
        const sha256=await hashBlob(part);
        const exists=listing.chunks.find(x=>x.archive_asset_id===source.id&&x.chunk_index===i&&
          x.archive_name===record.filename&&x.sha256===sha256&&
          Number(x.byte_size)===size&&Number(x.offset)===offset&&/^private\//.test(x.storage_url||''));
        if(exists)continue;
        progress('Storing '+record.filename+' · part '+(i+1)+' / '+chunksExpected(record.bytes));
        const uploadResponse=await client.integrations.Core.UploadPrivateFile({file:
          new File([part],record.filename+'.'+i+'.part',{type:'application/octet-stream'})});
        const file_uri=privateUploadUri(uploadResponse);
        const row=await client.entities.JediPakChunk.create({
          game_key:GAME_KEY,archive_name:record.filename,archive_asset_id:source.id,
          chunk_index:i,offset,byte_size:size,source_size:record.bytes,
          sha256,storage_url:file_uri,status:'cached',metadata:{private:true,missionMap:true},
        });
        listing.chunks.push(row);
      }
      await client.entities.GameReconstructionFile.update(source.id,{status:'stored'});
      results.push(record.id);
    }catch(error){failures.push({file:file.name,error:String(error?.message||error)});}
  }
  return {stored:results,errors:failures,ready:new Set(Object.values(GAME2_MISSION_ARCHIVE)
    .filter(record=>complete(record,listing)).map(record=>record.id))};
}
export async function readStoredMissionBsp(client,id,fetcher=fetch) {
  const record=GAME2_MISSION_ARCHIVE[id];
  if(!record)throw Error('Unknown mission BSP '+id);
  const listing=await rows(client);
  if(!complete(record,listing))return null;
  const source=listing.files.find(x=>sourceMatches(x,record));
  const output=new Uint8Array(record.bytes);
  for(let i=0;i<chunksExpected(record.bytes);i++){
    const part=listing.chunks.find(x=>x.archive_asset_id===source.id&&x.archive_name===record.filename&&
      Number(x.chunk_index)===i&&Number(x.offset)===i*CHUNK_SIZE);
    if(!part||!part.storage_url?.startsWith('private/'))throw Error(record.filename+': private chunk missing');
    const signed=await client.integrations.Core.CreateFileSignedUrl({file_uri:part.storage_url,expires_in:900});
    if(!/^https:\/\//.test(signed?.signed_url||''))throw Error('Base44 did not issue a signed private map URL');
    const res=await fetcher(signed.signed_url);
    if(!res.ok||res.headers?.get?.('content-type')?.includes('text/html'))throw Error('Private mission download rejected');
    const buf=await res.arrayBuffer();
    if(buf.byteLength!==part.byte_size)throw Error(record.filename+': incomplete private chunk '+i);
    const found=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),
      n=>n.toString(16).padStart(2,'0')).join('');
    if(found!==part.sha256)throw Error(record.filename+': corrupt private chunk '+i);
    output.set(new Uint8Array(buf),i*CHUNK_SIZE);
  }
  validateArchiveHeader(output.buffer.slice(0,152),record.bytes);
  return output.buffer;
}
