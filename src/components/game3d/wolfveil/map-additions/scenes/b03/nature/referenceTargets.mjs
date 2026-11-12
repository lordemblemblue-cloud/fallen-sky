/**
 * Workstream 08: source-matched, UNAPPROVED natural landmark envelopes.
 * Coordinates and shape bounds are from individual Batch03 XLSX and DOCX.
 * This is data-only: importing this module creates zero geometry/colliders.
 * WS01 must publish a reviewed global-coordinate spec before integration.
 */
export const APPROVED_WS01_SPEC_SHA=null;
export const COORDINATES=Object.freeze({
  axes:'X east, Z north, Y up',
  local:'signed millimeters',
  viewerZOffsetMmWhenOriginAtMarket:70000,
  applyViewerOffset:'scene root only; never shift placements inside the root',
  evidence:'SOURCE REFERENCE AUTHORING TARGET / not runtime surveyed',
  tileSideMm:10000,
});
const sceneRows=[
  [21,'Western Cedar Forest',-320000,65000,135223],
  [22,'Wind-Carved Wolfstone Highlands',-325000,235000,110446],
  [23,'Whispering Bamboo Valley',-360000,-40000,98293],
  [24,'Alpine Meadow & Harvesting Grounds',-45000,370000,122297],
  [25,'Southern Farm Exit & Terraced Fields',-255000,-278000,23803],
  [26,'Eastern Riverbank Wetlands',123000,75000,10900],
  [27,'First Discovery Cave Mouth',-224000,74000,96073],
  [28,'Western Root Cavern Interior',-324000,140000,124677],
  [29,'Twin Peaks Ascent & Cliff Scramble',2000,470000,175186],
  [30,'Mountain Hot Springs & Cedar Bathhouse',-105000,330000,102466],
];
export const SCENES=Object.freeze(sceneRows.map(
  ([id,name,centerXmm,centerZmm,analyticalYmm])=>Object.freeze({
    id,name,centerXmm,centerZmm,analyticalYmm,numberOf10mTiles:100,halfExtentMm:50000,
  }),
));
// [scene, source ID, kind, X/Z/Y in mm, bounding W/D/H in mm].
// These 19 source targets are WS08's proposed nature-only references; architecture, ground, hydrology,
// portals, and cave floors are expressly excluded.
const objectRows=[
 [21,'S21-CEDAR_01','cedar',-327000,73000,135798,3200,3400,24300],
 [21,'S21-MOSS_BOULDER','moss-boulder',-310000,56000,133010,5200,3900,2900],
 [21,'S21-FERN_PATCH','ferns',-340000,50000,126567,9600,6400,750],
 [22,'S22-WOLF_STONE','fractured-granite',-327000,241000,109574,9000,7400,16900],
 [22,'S22-PINE_RIDGE','alpine-pines',-349000,254000,106366,12500,9100,11400],
 [23,'S23-BAMBOO_C01','bamboo',-366000,-37000,102064,9100,7800,9200],
 [23,'S23-LICHEN_LOG','lichen-log',-354000,-63000,91378,8700,2300,2200],
 [24,'S24-WILD_GRASS','meadow-grass',-47000,366000,120474,14500,10500,980],
 [24,'S24-HERB_CLUSTER','herbs',-33000,385000,129111,3500,2400,680],
 [24,'S24-BLACK_PINE','black-pine',-72000,375000,124930,6800,5100,10400],
 [26,'S26-REED_CLUSTER','wetland-reeds',121000,84000,11800,8200,5100,2300],
 [26,'S26-PEBBLE_BANK','pebble-bank',132000,72000,11875,10900,6100,680],
 [26,'S26-JAPANESE_MAPLE','maple',146000,89000,38033,6100,6000,8900],
 [27,'S27-STALAGMITES','stalagmites',-230000,84000,102598,4300,3100,2200],
 [28,'S28-ROOT_ARCH','cavern-roots',-324000,140000,124677,11800,9700,8700],
 [28,'S28-ORE_VEIN','ore-seam',-314000,145000,118890,6200,3300,3900],
 [29,'S29-PINE_CLUSTER','windswept-pines',-15000,490000,183714,10900,6700,9700],
 [30,'S30-STEAM_VENTS','geothermal-rock',-121000,342000,107685,7600,4200,2300],
 // Reference source S30-LANTERN_GROVE; only natural canopy is WS08 scope.
 // Individual lantern structures / path are reserved to WS07, no mesh enabled.
 [30,'S30-LANTERN_GROVE','maple-grove-canopy',-88000,337000,106696,8300,7200,8700],
];
export const TARGETS=Object.freeze(objectRows.map(
 ([sceneId,sourceId,kind,xMm,zMm,analyticalYmm,widthMm,depthMm,heightMm])=>Object.freeze({
  id:'WV-S'+String(sceneId).padStart(2,'0')+'-WS08-'+sourceId.split('-').slice(1).join('-').replaceAll('_','-'),
  sceneId,sourceId,kind,xMm,zMm,analyticalYmm,widthMm,depthMm,heightMm,
  evidence:'REFERENCE_PROPOSED',runtimeVerified:false,
  ownershipGate:sourceId==='S30-LANTERN_GROVE'?'WS07_LANTERN_STRUCTURE_SPLIT_PENDING':null,
 }),
));
export function viewerPosition(target,originAtMarket=false){
 if(!Number.isInteger(target.xMm)||!Number.isInteger(target.zMm))
   throw new TypeError('Required local integer millimeter coordinates');
 return Object.freeze({xMm:target.xMm,zMm:target.zMm+(originAtMarket?70000:0)});
}
/**
 * Dry-run check only. All required callbacks must be supplied by the approved
 * real Wolfveil runtime adapter; no guessed ground, path, water or cave state.
 */
export function planNatureAnchors({heightAt,clearanceAt}={}){
 if(typeof heightAt!=='function'||typeof clearanceAt!=='function')
   throw Error('Requires authoritative real terrain elevation and clearance callbacks');
 const safe=[],blocked=[];
 for(const t of TARGETS){
   const x=t.xMm/1000,z=t.zMm/1000;
   const y=heightAt(x,z);
   if(!Number.isFinite(y))throw Error('Invalid sampled height at '+t.sourceId);
   const clearance=clearanceAt(x,z,Math.max(t.widthMm,t.depthMm)/2000);
   if(typeof clearance!=='boolean')
     throw new TypeError('Authoring clearance callback must return a boolean for '+t.sourceId);
   // A spatial callback cannot override the WS07/WS11 ownership approval gate.
   const awaitingOwner=Boolean(t.ownershipGate);
   const proposed=Object.freeze({...t,localX:x,localZ:z,groundY:y,
     clearanceCallbackPassed:clearance,
     blockedReason:awaitingOwner?'OWNERSHIP_APPROVAL_PENDING':
       clearance?null:'SPATIAL_CLEARANCE_REJECTED',
     evidenceStatus:'SOURCE_ONLY_NOT_RUNTIME_APPROVED'});
   (clearance&&!awaitingOwner?safe:blocked).push(proposed);
 }
 return {safe,blocked,activated:false,worldTransformApplied:false,
   runtimeAuthorized:false,sourceClearanceOnly:true,
   approvedWs01SpecSha:APPROVED_WS01_SPEC_SHA};
}
