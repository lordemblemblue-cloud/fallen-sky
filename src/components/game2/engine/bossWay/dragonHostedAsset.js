// Game 2 Dragon is a platform-hosted asset, never a per-player IndexedDB upload.
// Admin > 3D Models registers the original FBX/GLB using category game2_boss_dragon.
// An optional deploy-bundled static GLB is supported for non-Base44 builds.
export const DRAGON_MODEL_CATEGORY = 'game2_boss_dragon';
export const DRAGON_STATIC_FILE = 'bossway/dragon.glb';

export function dragonFormat(model) {
  const type=String(model?.file_type||'').toLowerCase();
  if(type==='fbx'||type==='glb'||type==='gltf')return type;
  const pathname=String(model?.file_url||model?.url||'').split('?')[0].toLowerCase();
  if(/\.fbx$/.test(pathname))return 'fbx';
  if(/\.gltf$/.test(pathname))return 'gltf';
  return 'glb';
}

export function selectHostedDragon(models) {
  if(!Array.isArray(models))return null;
  // Never permit a random unrelated 3D model to replace the encounter boss.
  const candidates=models.filter(m=>
    m?.file_url && (/^https:\/\//i.test(m.file_url)||m.file_url.startsWith('/')) &&
    (m.category===DRAGON_MODEL_CATEGORY || (m.tags||[]).includes('game2_dragon_boss')) &&
    m.is_public===true
  );
  const selected=candidates.sort((a,b)=>String(b.updated_date||'').localeCompare(String(a.updated_date||'')))[0];
  return selected ? {url:selected.file_url,format:dragonFormat(selected),source:'base44'} : null;
}

export async function resolveHostedDragonAsset(client, assetBase) {
  try {
    const models=await client.entities.Model3D.filter({category:DRAGON_MODEL_CATEGORY},'-updated_date',50);
    const selected=selectHostedDragon(models);
    if(selected)return selected;
  }catch(err){
    // Static deployment is still an option when public Model3D metadata is not readable.
    console.warn('Dragon asset registry unavailable, checking bundled asset',err);
  }
  return {url:`${assetBase}${DRAGON_STATIC_FILE}`,format:'glb',source:'static'};
}
