import { privateUploadUri } from './privateUpload.js';
import retailCatalog from './retailCatalog.js';
export const CAMPAIGNS = retailCatalog;
export const CHUNK_BYTES = 16 * 1024 * 1024;
export const campaignRecordPath = name => 'original-campaign/base/' + name;

const matchingChunk = (chunks, gameKey, source, expected, part, index) => chunks.find(row =>
  row.game_key === gameKey && row.archive_asset_id === source.id && row.status === 'cached' &&
  row.archive_name === expected.name && Number(row.chunk_index) === index &&
  Number(row.offset) === part.offset && Number(row.byte_size) === part.size &&
  Number(row.source_size) === expected.bytes && row.sha256 === part.sha256 &&
  typeof row.storage_url === 'string' && /^(private\/.+|https:\/\/.+)$/.test(row.storage_url));

export function campaignChunks(gameKey, records, chunks) {
  const game = CAMPAIGNS[gameKey];
  if (!game) throw new Error('Unknown original campaign');
  return game.archives.map(expected => {
    const candidates = records.filter(row => row.game_key === gameKey &&
      (row.path === campaignRecordPath(expected.name) || row.path === expected.name) && Number(row.byte_size) === expected.bytes);
    // Reimports and the legacy source catalog can contain multiple records for
    // one archive. Never let an incomplete first record mask a complete copy.
    const source = candidates.find(candidate => expected.chunks.every((part, index) =>
      matchingChunk(chunks, gameKey, candidate, expected, part, index))) || candidates[0];
    if (!source) throw new Error(game.title + ': import ' + expected.name + ' in Original Campaigns first.');
    const parts = expected.chunks.map((part, index) => {
      const row = matchingChunk(chunks, gameKey, source, expected, part, index);
      if (!row) throw new Error(expected.name + ': verified chunk ' + (index + 1) + ' is missing. Import the archive again to resume.');
      return {index, ...part, url: row.storage_url};
    });
    return {name: expected.name, size: expected.bytes, chunks: parts};
  });
}

export async function loadCampaignSources(client, gameKey) {
  const [files, sources, chunks] = await Promise.all([
    client.entities.GameReconstructionFile.filter({game_key: gameKey, area: 'original_asset'}, 'path', 1000),
    client.entities.JediSourceAsset.filter({game_key: gameKey, category: 'retail_archive'}, 'path', 100),
    client.entities.JediPakChunk.filter({game_key: gameKey, status: 'cached'}, 'archive_name', 1000),
  ]);
  return {files, sources, chunks};
}

export async function signedCampaignManifest(client, gameKey, rows) {
  const manifest = campaignChunks(gameKey, [...rows.files, ...rows.sources], rows.chunks);
  for (const pak of manifest) for (const chunk of pak.chunks) {
    if (chunk.url.startsWith('private/')) {
      const {signed_url} = await client.integrations.Core.CreateFileSignedUrl({file_uri: chunk.url, expires_in: 3600});
      if (!/^https:\/\//.test(signed_url || '')) throw new Error('Could not authorize a campaign chunk.');
      chunk.url = signed_url;
    } else if (!/^https:\/\//.test(chunk.url)) throw new Error('Invalid campaign storage location.');
  }
  return manifest;
}

export async function importCampaignFiles(client, gameKey, files, progress = () => {}) {
  const game = CAMPAIGNS[gameKey];
  if (!game) throw new Error('Unknown original campaign');
  const rows = await loadCampaignSources(client, gameKey);
  for (const file of files) {
    const expected = game.archives.find(a => a.name === file.name.toLowerCase());
    if (!expected || file.size !== expected.bytes) throw new Error('Select the original Steam ' + game.title + ' assets*.pk3 files. Wrong archive: ' + file.name);
  }
  for (const file of files) {
    const expected = game.archives.find(a => a.name === file.name.toLowerCase());
    let source = rows.files.find(r => r.path === campaignRecordPath(expected.name) && r.sha256 === expected.sha256);
    if (!source) source = await client.entities.GameReconstructionFile.create({game_key:gameKey,area:'original_asset',path:campaignRecordPath(expected.name),display_name:expected.name,byte_size:expected.bytes,sha256:expected.sha256,canonical:true,editable:false,status:'catalogued',source_origin:'owner_steam_install',metadata:{private_chunks:true,chunk_count:expected.chunks.length}});
    for (let index = 0; index < expected.chunks.length; index++) {
      const part = expected.chunks[index];
      progress(expected.name + ' · verifying chunk ' + (index + 1) + ' / ' + expected.chunks.length);
      const blob = file.slice(part.offset, part.offset + part.size);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n=>n.toString(16).padStart(2,'0')).join('');
      if (hash !== part.sha256) throw new Error(expected.name + ': contents differ from the audited Steam copy at chunk ' + (index + 1));
      const existing = matchingChunk(rows.chunks, gameKey, source, expected, part, index);
      if (existing) continue;
      progress(expected.name + ' · storing private chunk ' + (index + 1) + ' / ' + expected.chunks.length);
      const uploadResponse = await client.integrations.Core.UploadPrivateFile({file:new File([blob], gameKey+'-'+expected.name+'.'+index+'.bin',{type:'application/octet-stream'})});
      const file_uri = privateUploadUri(uploadResponse);
      await client.entities.JediPakChunk.create({game_key:gameKey,archive_name:expected.name,archive_asset_id:source.id,chunk_index:index,offset:part.offset,byte_size:part.size,source_size:expected.bytes,sha256:hash,storage_url:file_uri,status:'cached',metadata:{private:true}});
    }
    await client.entities.GameReconstructionFile.update(source.id,{status:'stored'});
  }
  return loadCampaignSources(client, gameKey);
}
