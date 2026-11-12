/**
 * Wolfveil WS08: nonactivated 19-feature natural asset art-direction contract.
 * Categories are anchored to XLSX/DOCX source reference kinds; all visual
 * techniques remain PROPOSED (not approved geometry, LOD, surveyed terrain).
 * No THREE, engine registration, mesh generation, physics or scene changes.
 */
import {TARGETS} from './referenceTargets.mjs';

// kind, visual class, proposed construction, proposed fidelity direction.
// These design choices do NOT override WS01 coordinates, WS02 water,
// WS07 constructed elements, WS09 atmosphere or WS10 collision ownership.
const profileRows=[
 ['cedar','tree','multi-part-tree','weathered cedar bark, irregular branches and full needle crown'],
 ['moss-boulder','rock','unique-rock','eroded stone silhouette, rock crevices and layered moss'],
 ['ferns','groundcover','instanced-patch','volumetric fronds with varied soil contact'],
 ['fractured-granite','rock','unique-rock','faceted fracture planes, cracks and mineral wear'],
 ['alpine-pines','tree','instanced-trees','wind-swept asymmetrical needle crowns'],
 ['bamboo','plant','instanced-stems','jointed individual culms and dimensional leaf clusters'],
 ['lichen-log','wood','unique-wood','curving deadwood grain and natural lichen patches'],
 ['meadow-grass','groundcover','instanced-patch','mixed blade clusters and low meadow diversity'],
 ['herbs','groundcover','instanced-patch','recognizable plants with layered leaves'],
 ['black-pine','tree','multi-part-tree','rugged bark and uneven highland crown'],
 ['wetland-reeds','wetland-plant','instanced-patch','individual marsh reed stalks at river edge'],
 ['pebble-bank','rock','instanced-stones','irregular natural pebbles and wet/dry transitions'],
 ['maple','tree','multi-part-tree','individually branching deciduous tree and dimensional leaves'],
 ['stalagmites','cave-decor','instanced-stone','varied pointed cave mineral deposits'],
 ['cavern-roots','cave-decor','multi-part-root','twisting wood-root silhouette and complex bark'],
 ['ore-seam','cave-decor','surface-detail','wall-bound exposed mineral vein, not a mine tunnel'],
 ['windswept-pines','tree','instanced-trees','high-ridge wind-pruned pine silhouettes'],
 ['geothermal-rock','geothermal-decor','unique-rock','mineral-encrusted rocks, no steam physics'],
 ['maple-grove-canopy','tree','instanced-trees','leafy maple crowns, no built lantern objects'],
];
export const NATURE_ART_PROFILES=Object.freeze(Object.fromEntries(
 profileRows.map(([kind,category,strategy,direction])=>[
  kind,Object.freeze({category,strategy,direction}),
 ]),
));
const externalDependencies=Object.freeze({
 'wetland-reeds':['WS02_WATER','WS10_SHORE_TRAVERSAL'],
 'pebble-bank':['WS02_WATER','WS10_SHORE_TRAVERSAL'],
 'stalagmites':['WS07_CAVE_FLOOR','WS10_TWO_WAY_ACCESS'],
 'cavern-roots':['WS07_CAVERN_SHELL','WS10_TWO_WAY_ACCESS'],
 'ore-seam':['WS07_CAVERN_SHELL'],
 'geothermal-rock':['WS02_HOT_POOL','WS09_STEAM_FX'],
 'maple-grove-canopy':['WS07_BUILT_LANTERNS','WS07_BATHHOUSE'],
 'meadow-grass':['WS07_TRAIL_STEPS','WS10_ROUTE_CLEARANCE'],
});

export function planNatureVisualContracts({targets=TARGETS,profiles=NATURE_ART_PROFILES}={}){
 if(!Array.isArray(targets)||!profiles||typeof profiles!=='object')
  throw new TypeError('Explicit proposed nature profiles and references required');
 const seen=new Set();
 const contracts=targets.map(t=>{
  if(typeof t?.id!=='string'||seen.has(t.id))
   throw new TypeError('Duplicate or missing WS08 nature ID');
  seen.add(t.id);
  const art=profiles[t.kind];
  if(!art||[art.category,art.strategy,art.direction].some(s=>typeof s!=='string'||!s.trim()))
   throw new Error('Missing reviewed feature art direction: '+t.kind);
  if(t.evidence!=='REFERENCE_PROPOSED'||t.runtimeVerified!==false)
   throw new Error('Reference or runtime evidence changed; re-audit before use');
  return Object.freeze({
   id:t.id,sourceId:t.sourceId,sceneId:t.sceneId,kind:t.kind,
   localXmm:t.xMm,localZmm:t.zMm,
   sourceEnvelopeMm:Object.freeze([t.widthMm,t.depthMm,t.heightMm]),
   visualClass:art.category,proposedAssetMethod:art.strategy,
   proposedDetailDirection:art.direction,
   appearanceGoal:'CONTEMPORARY_REALISM_WITH_SUBTLE_SUMI_E_SPIRITUAL_ACCENTS',
   dependencies:Object.freeze([...(externalDependencies[t.kind]||[])]),
   approvalPending:t.ownershipGate||null,
   referenceEvidence:'REFERENCE_PROPOSED_NOT_SURVEYED',
   scene26ImageUnverified:t.sceneId===26,
   geometryCreated:false,collisionCreated:false,liveVisualVerified:false,
  });
 });
 return Object.freeze({
  status:'UNAPPROVED_ART_DIRECTION_ONLY',
  contracts:Object.freeze(contracts),targetCount:contracts.length,
  geometryActivated:false,assetsMounted:false,viewerShiftApplied:false,
 });
}
