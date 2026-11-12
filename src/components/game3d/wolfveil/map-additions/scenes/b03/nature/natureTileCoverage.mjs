/**
 * WS08 provisional 10m global-local tile and scene-view coverage audit.
 * No tile streamer, world geometry, coordinate origin, or collision is created.
 * The injected WS01 map is a PROVISIONAL source-plan snapshot, not approval.
 * Inputs/outputs remain unshifted Wolfveil local signed integer millimetres.
 */
import {SCENES, TARGETS} from './referenceTargets.mjs';
import {natureFootprint} from './architectureSeamAudit.mjs';

export const PROVISIONAL_WS01_MAP_BLOB_SHA='d84b129f97b2ac23b5d1cfecd0faf9e787a1dbac';
const TILE_MM=10000, CORE_HALF_MM=250000, PREVIEW_HALF_MM=550000;
const safe=n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000;
const keyPart=n=>(n<0?'-':'+')+String(Math.abs(n)).padStart(3,'0');

export function globalNatureTileKey(xMm,zMm){
 if(!safe(xMm)||!safe(zMm))throw new TypeError('Global nature tiles require signed integer local mm');
 return 'G-X'+keyPart(Math.floor(xMm/TILE_MM))+'-Z'+keyPart(Math.floor(zMm/TILE_MM));
}

function boundsOf(target){
 const p=natureFootprint(target);
 return {minXmm:p.xMm-p.widthMm/2,maxXmm:p.xMm+p.widthMm/2,
  minZmm:p.zMm-p.depthMm/2,maxZmm:p.zMm+p.depthMm/2};
}
function tileKeys(bounds){
 const x0=Math.floor(bounds.minXmm/TILE_MM),x1=Math.ceil(bounds.maxXmm/TILE_MM)-1;
 const z0=Math.floor(bounds.minZmm/TILE_MM),z1=Math.ceil(bounds.maxZmm/TILE_MM)-1;
 const count=(x1-x0+1)*(z1-z0+1);
 if(count<1||count>4096)throw new RangeError('Nature proposal exceeds tile audit budget');
 const result=[];
 for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)
  result.push('G-X'+keyPart(x)+'-Z'+keyPart(z));
 return result;
}
function overlapAreaMm2(a,b){
 return Math.max(0,Math.min(a.maxXmm,b.maxXmm)-Math.max(a.minXmm,b.minXmm))*
  Math.max(0,Math.min(a.maxZmm,b.maxZmm)-Math.max(a.minZmm,b.minZmm));
}
function sceneBounds(scene){
 if(!Number.isInteger(scene?.id)||!Array.isArray(scene.bbox_local_m)||
    scene.bbox_local_m.length!==4||!scene.bbox_local_m.every(Number.isFinite))
  throw new TypeError('Require WS01 canonical local scene view rectangles');
 const [west,east,south,north]=scene.bbox_local_m;
 if(!(west<east&&south<north))throw new RangeError('Invalid scene-view rectangle');
 return {minXmm:west*1000,maxXmm:east*1000,minZmm:south*1000,maxZmm:north*1000};
}
const contained=(a,b)=>a.minXmm>=b.minXmm&&a.maxXmm<=b.maxXmm&&
 a.minZmm>=b.minZmm&&a.maxZmm<=b.maxZmm;

/**
 * Pin the *unapproved* WS01 coordinate-map blob used for this source audit.
 * This function explicitly DOES NOT interpret study rectangles as chunks.
 */
export function auditNatureStudyTiles({
  coordinateMap,coordinateMapBlobSha,targets=TARGETS,sourceScenes=SCENES,
}={}){
 if(coordinateMapBlobSha!==PROVISIONAL_WS01_MAP_BLOB_SHA)
  throw new Error('WS01 source-plan blob changed; re-review before using provisional scene coverage');
 if(coordinateMap?.status!=='SOURCE_DERIVED_WITH_PROPOSED_SCENE_BOUNDS'
    ||!Array.isArray(coordinateMap.scenes)||!Array.isArray(targets)||!Array.isArray(sourceScenes))
  throw new TypeError('Require provisional WS01 study map and WS08 inventory');
 const scenes=new Map();
 for(const s of coordinateMap.scenes){
  if(scenes.has(s.id))throw new TypeError('Duplicate WS01 scene ID');
  scenes.set(s.id,sceneBounds(s));
 }
 const declared=new Map();
 for(const s of sourceScenes){
  if(declared.has(s.id)||!safe(s.centerXmm)||!safe(s.centerZmm))
   throw new TypeError('Invalid or duplicate WS08 scene center');
  declared.set(s.id,s);
 }
 const seen=new Set(),findings=[];
 for(const t of targets){
  if(seen.has(t.id))throw new TypeError('Duplicate WS08 nature ID');
  seen.add(t.id);
  const home=declared.get(t.sceneId),mapScene=coordinateMap.scenes.find(s=>s.id===t.sceneId);
  if(!home||!mapScene)throw new Error('Nature target has no canonical scene-view record: '+t.id);
  if(mapScene.canonical_center_xz_m?.[0]*1000!==home.centerXmm||
     mapScene.canonical_center_xz_m?.[1]*1000!==home.centerZmm)
   throw new Error('WS08 local center differs from provisional WS01 map for scene '+t.sceneId);
  const box=boundsOf(t),own=contained(box,scenes.get(t.sceneId));
  const otherDetailedSceneIds=coordinateMap.scenes.filter(s=>s.id>=11&&s.id!==t.sceneId&&
   overlapAreaMm2(box,scenes.get(s.id))>0).map(s=>s.id).sort((a,b)=>a-b);
  const beyondCore=box.minXmm < -CORE_HALF_MM||box.maxXmm > CORE_HALF_MM||
   box.minZmm < -CORE_HALF_MM||box.maxZmm > CORE_HALF_MM;
  const beyondPreview=box.minXmm < -PREVIEW_HALF_MM||box.maxXmm > PREVIEW_HALF_MM||
   box.minZmm < -PREVIEW_HALF_MM||box.maxZmm > PREVIEW_HALF_MM;
  findings.push(Object.freeze({
   sourceId:t.sourceId,natureId:t.id,sceneId:t.sceneId,
   centerGlobalTile:globalNatureTileKey(t.xMm,t.zMm),
   touchedGlobalTiles:Object.freeze(tileKeys(box)),
   containedInHomeStudyView:own,
   intersectsOtherDetailedStudySceneIds:Object.freeze(otherDetailedSceneIds),
   outside500mAuthoringCore:beyondCore,outside1100mPreview:beyondPreview,
   status:'UNAPPROVED_SOURCE_VIEW_ONLY',
  }));
 }
 return Object.freeze({
  status:'PROVISIONAL_WS01_SOURCE_PLANNING_ONLY',coordinateMapBlobSha,
  checkedTargets:findings.length,
  homeStudyViewWarnings:findings.filter(f=>!f.containedInHomeStudyView).map(f=>f.sourceId),
  outside500mAuthoringCoreCount:findings.filter(f=>f.outside500mAuthoringCore).length,
  outside1100mPreviewCount:findings.filter(f=>f.outside1100mPreview).length,
  crossDetailedSceneViews:findings.filter(f=>f.intersectsOtherDetailedStudySceneIds.length),
  findings:Object.freeze(findings),
  geometryActivated:false,chunkInstantiation:false,viewerTransformApplied:false,
 });
}
