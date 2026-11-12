/**
 * WS08 source-only S21 rock + S24 pine alternative planning.
 *
 * Original ring rows are from the user-supplied 21_western_cedar_forest.xlsx
 * and 24_highland_meadow.xlsx, sheet "3D Shape Sections". These are explicitly
 * DESIGN_TARGET / artist-GLB-unverified, NOT a loaded collision mesh.
 * Original reference anchors and authored Wolfveil roads are never changed.
 */
import {TARGETS} from './referenceTargets.mjs';
import {lineTouchesRectangleMeters} from './sourceClearanceAudit.mjs';
import {clipNatureRoadSegment,natureRectangleLocalMeters} from './natureRoadCenterlineAudit.mjs';

// [section Y, source local curve X/Z, design ellipse radii X/Z] integer mm.
export const NATURE_DESIGN_PROFILE_RINGS=Object.freeze({
 'S21-MOSS_BOULDER':Object.freeze([
  [0,0,0,1760,1320],[232,160,85,1958,1468],
  [580,366,194,2254,1691],[1160,520,276,2452,1839],
  [1798,344,182,1908,1431],[2378,-29,-16,1414,1061],
  [2900,-358,-190,970,727],
 ].map(row=>Object.freeze(row))),
 'S24-BLACK_PINE':Object.freeze([
  [0,0,0,3400,2550],[832,162,86,3182,2387],
  [2080,392,208,2856,2142],[4160,703,373,2312,1734],
  [6448,875,464,1714,1285],[8528,840,445,1170,877],
  [10400,659,349,680,510],
 ].map(row=>Object.freeze(row))),
});

// Review-only site shifts; source xMm/zMm remain untouched in TARGETS.
// Even the preliminary 2m planning margin is NOT a WS10 physical rule.
export const NATURE_SITE_ALTERNATIVES=Object.freeze([
 {key:'S21_REFERENCE',sourceId:'S21-MOSS_BOULDER',xMm:-310000,zMm:56000,role:'ORIGINAL_UNCHANGED'},
 {key:'S21_NEAR_TRAIL_CLEARING',sourceId:'S21-MOSS_BOULDER',xMm:-307000,zMm:59000,role:'ALTERNATIVE_STUDY'},
 {key:'S21_EASTERN_CLEARING',sourceId:'S21-MOSS_BOULDER',xMm:-303000,zMm:59000,role:'ALTERNATIVE_STUDY'},
 {key:'S24_REFERENCE',sourceId:'S24-BLACK_PINE',xMm:-72000,zMm:375000,role:'ORIGINAL_UNCHANGED'},
 {key:'S24_WESTERN_SLOPE',sourceId:'S24-BLACK_PINE',xMm:-77000,zMm:378000,role:'ALTERNATIVE_STUDY'},
 {key:'S24_UPHILL_PINE',sourceId:'S24-BLACK_PINE',xMm:-79000,zMm:380000,role:'ALTERNATIVE_STUDY'},
].map(row=>Object.freeze(row)));

const finite=Number.isFinite;
const safe=n=>Number.isSafeInteger(n)&&Math.abs(n)<100000000;
const coord=p=>Array.isArray(p)&&p.length>=2&&finite(p[0])&&finite(p[1]);
const round6=n=>Math.round(n*1000000)/1000000;

// Intersects a 2D route line with an X/Z ellipse section, not a 3D mesh.
// A positive length at height Y is a silhouette/source design warning only.
export function clipSegmentToDesignEllipse(a,b,{cx,cz,rx,rz}){
 if(!coord(a)||!coord(b)||![cx,cz,rx,rz].every(finite)||!(rx>0&&rz>0))
  throw new TypeError('Valid finite line and ellipse required');
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
 if(length===0)return 0;
 const px=(a[0]-cx)/rx,pz=(a[1]-cz)/rz,vx=dx/rx,vz=dz/rz;
 const A=vx*vx+vz*vz,B=2*(px*vx+pz*vz),C=px*px+pz*pz-1;
 const disc=B*B-4*A*C;
 if(disc<=0)return 0;
 const rt=Math.sqrt(disc);
 const lo=Math.max(0,(-B-rt)/(2*A)),hi=Math.min(1,(-B+rt)/(2*A));
 return hi>lo?length*(hi-lo):0;
}

function sourceProfile(target,rows,roads,atXmm,atZmm){
 const byRoad=[];
 const sections=rows.map(([y,offsetX,offsetZ,rx,rz])=>{
  if(![y,offsetX,offsetZ,rx,rz].every(safe)||y<0||rx<=0||rz<=0)
   throw new TypeError('Invalid source-design ring values');
  const ellipse={cx:(atXmm+offsetX)/1000,cz:(atZmm+offsetZ)/1000,rx:rx/1000,rz:rz/1000};
  let distance=0;
  for(const road of roads)for(let i=1;i<road.points.length;i++)
   distance+=clipSegmentToDesignEllipse(road.points[i-1],road.points[i],ellipse);
  return Object.freeze({sectionYmm:y,roadCenterlineCrossingM:round6(distance)});
 });
 for(const road of roads){
  const lengths=rows.map(([,ox,oz,rx,rz])=>{
   let total=0;
   const ellipse={cx:(atXmm+ox)/1000,cz:(atZmm+oz)/1000,rx:rx/1000,rz:rz/1000};
   for(let i=1;i<road.points.length;i++)total+=clipSegmentToDesignEllipse(road.points[i-1],road.points[i],ellipse);
   return total;
  });
  if(lengths.some(x=>x>1e-9))byRoad.push(road.id);
 }
 return {sections:Object.freeze(sections),roadIdsWithSectionOverlap:Object.freeze(byRoad),
  maxSectionCenterlineCrossingM:Math.max(...sections.map(x=>x.roadCenterlineCrossingM))};
}

export function studyNatureSiteAlternatives({
 routes,targets=TARGETS,sites=NATURE_SITE_ALTERNATIVES,profiles=NATURE_DESIGN_PROFILE_RINGS,
 provisionalExtraBufferM=2,
}={}){
 if(!Array.isArray(routes)||routes.length===0||!Array.isArray(targets)||!Array.isArray(sites))
  throw new TypeError('Existing routes, original nature references and explicit study sites required');
 if(!finite(provisionalExtraBufferM)||provisionalExtraBufferM<0||provisionalExtraBufferM>20)
  throw new RangeError('Invalid proposed extra margin');
 const targetById=new Map(targets.map(t=>[t.sourceId,t]));
 if(targetById.size!==targets.length)throw new Error('Ambiguous reference source IDs');
 const routeIds=new Set();
 for(const road of routes){
  if(typeof road?.id!=='string'||!road.id||routeIds.has(road.id)
    ||!finite(road.width)||road.width<=0
    ||!Array.isArray(road.points)||road.points.length<2||!road.points.every(coord))
   throw new Error('Invalid or duplicated existing road');
  routeIds.add(road.id);
 }
 const keys=new Set();
 const results=sites.map(site=>{
  if(typeof site?.key!=='string'||keys.has(site.key))throw new Error('Duplicate/missing site key');
  keys.add(site.key);
  if(!safe(site.xMm)||!safe(site.zMm))throw new TypeError('Site centers must be unshifted integer mm');
  const source=targetById.get(site.sourceId),rows=profiles?.[site.sourceId];
  if(!source||!Array.isArray(rows)||rows.length!==7
    ||source.evidence!=='REFERENCE_PROPOSED'||source.runtimeVerified!==false)
   throw new Error('Unreviewed reference or missing seven source design rings');
  const sourceRole=site.role==='ORIGINAL_UNCHANGED',alternateRole=site.role==='ALTERNATIVE_STUDY';
  if(!sourceRole&&!alternateRole)throw new Error('Unrecognized candidate role');
  const shiftM=Math.hypot(site.xMm-source.xMm,site.zMm-source.zMm)/1000;
  if(sourceRole&&shiftM!==0)throw new Error('Original reference anchor was changed');
  if(alternateRole&&(shiftM<=0||shiftM>20))throw new Error('Review alternative exceeds 20m source-local study radius');
  const candidate={...source,xMm:site.xMm,zMm:site.zMm};
  const bounds=natureRectangleLocalMeters(candidate),width=source.widthMm/1000,depth=source.depthMm/1000;
  const planCenterline=[],nominalRibbon=[],proposedMargin=[];
  for(const road of routes){
   let centerCrossing=0,nominal=false,buffered=false;
   for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i];
    const cut=clipNatureRoadSegment(a,b,bounds);
    if(cut)centerCrossing+=cut.segmentDistanceM;
    const hasRibbon=m=>lineTouchesRectangleMeters(a,b,{
      x:site.xMm/1000,z:site.zMm/1000,
      w:width+2*m,d:depth+2*m,
    });
    if(hasRibbon(road.width/2))nominal=true;
    if(hasRibbon(road.width/2+provisionalExtraBufferM))buffered=true;
   }
   if(centerCrossing>0)planCenterline.push(Object.freeze({routeId:road.id,lengthM:round6(centerCrossing)}));
   if(nominal)nominalRibbon.push(road.id);
   if(buffered)proposedMargin.push(road.id);
  }
  const profile=sourceProfile(source,rows,routes,site.xMm,site.zMm);
  return Object.freeze({
   key:site.key,sourceId:site.sourceId,role:site.role,
   originalXmm:source.xMm,originalZmm:source.zMm,
   candidateXmm:site.xMm,candidateZmm:site.zMm,
   distanceFromSourceM:round6(shiftM),sourceFootprintMm:Object.freeze([source.widthMm,source.depthMm]),
   // These are competing 2D study outcomes, NOT walkable-space certification.
   exactAabbCenterlineCrossings:Object.freeze(planCenterline),
   nominalRoadRibbonReviewIds:Object.freeze(nominalRibbon),
   provisionalExtraBufferReviewIds:Object.freeze(proposedMargin),
   ringSourceEvidence:'XLSX_DESIGN_TARGET_ARTIST_GLB_UNVERIFIED',
   proposedProfileCenterlineCrossings:profile.sections,
   profileRoutesWithCrossings:profile.roadIdsWithSectionOverlap,
   maximumRingCrossingM:profile.maxSectionCenterlineCrossingM,
   proposedBaseYmm:null,terrainRaycastVerified:false,approved:false,
   geometryCreated:false,worldTransformApplied:false,
   status:'UNAPPROVED_OWNER_AND_PHYSICS_REVIEW_REQUIRED',
  });
 });
 return Object.freeze({
  status:'REFERENCE_PRESERVING_SITE_STUDY_ONLY',
  existingRoutesChecked:routes.length,sourceReferencesChecked:targets.length,
  extraPlanningBufferM:provisionalExtraBufferM,
  sites:Object.freeze(results),geometryAuthorized:false,physicsApproved:false,
 });
}
