/**
 * WS08 source-only: evaluate hypothetical S21/S24 site moves against the
 * existing nature catalog, WS07 structure proposals and ANALYTICAL height.
 * Geometry/physics never mounts, and candidate Y is intentionally NULL.
 *
 * WS07 architecture records and live source height callback are injected;
 * no direct cross-owner file imports or writes.
 */
import {SCENES,TARGETS} from './referenceTargets.mjs';
import {natureFootprint,architectureFootprint,rectangleOverlapM2} from './architectureSeamAudit.mjs';
import {natureFootprintSurveyPoints} from './natureAnalyticalGroundSurvey.mjs';

const mm=n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000;
const round=n=>Math.round(n*1000)/1000;

export function reviewNatureAlternativeNeighborhood({
 siteStudy,architectureTargets,heightAt,originalTargets=TARGETS,sceneViews=SCENES,
 reviewSetbackMm=2000,
}={}){
 if(!Array.isArray(siteStudy?.sites)||siteStudy.geometryAuthorized!==false
    ||siteStudy.status!=='REFERENCE_PRESERVING_SITE_STUDY_ONLY'
    ||!Array.isArray(architectureTargets)||architectureTargets.length===0
    ||typeof heightAt!=='function'||!Array.isArray(originalTargets)
    ||!Array.isArray(sceneViews))
  throw new TypeError('Require source-only site study, WS07 architecture and analytic terrain function');
 if(!mm(reviewSetbackMm)||reviewSetbackMm<0||reviewSetbackMm>1000000)
  throw new RangeError('Invalid provisional architecture setback');
 const sceneById=new Map(sceneViews.map(s=>[s.id,s]));
 const targetById=new Map(originalTargets.map(t=>[t.sourceId,t]));
 if(sceneById.size!==sceneViews.length||targetById.size!==originalTargets.length)
  throw new Error('Duplicated source views or original nature IDs');
 const architectureIds=new Set();
 const built=architectureTargets.map(a=>{
  if(architectureIds.has(a.id))throw new Error('Duplicate WS07 proposed object');
  architectureIds.add(a.id);
  return {id:a.id,box:architectureFootprint(a)};
 });
 const found=new Set();
 const reports=siteStudy.sites.map(site=>{
  if(found.has(site.key)||!site.key||!mm(site.candidateXmm)||!mm(site.candidateZmm))
   throw new Error('Duplicate or invalid site-study key/coordinate');
  found.add(site.key);
  const original=targetById.get(site.sourceId);
  if(!original||original.xMm!==site.originalXmm||original.zMm!==site.originalZmm)
   throw new Error('Site is not pinned to an existing source nature anchor');
  const frame=sceneById.get(original.sceneId);
  if(!frame||!mm(frame.centerXmm)||!mm(frame.centerZmm)||!mm(frame.halfExtentMm))
   throw new Error('No validated original source study rectangle');
  const candidate={...original,xMm:site.candidateXmm,zMm:site.candidateZmm};
  const box=natureFootprint(candidate);
  const withinHomeView=Math.abs(candidate.xMm-frame.centerXmm)+candidate.widthMm/2<=frame.halfExtentMm
   &&Math.abs(candidate.zMm-frame.centerZmm)+candidate.depthMm/2<=frame.halfExtentMm;
  const builtExact=[],builtBuffer=[],natureExact=[];
  for(const a of built) {
   if(rectangleOverlapM2(box,a.box)>0)builtExact.push(a.id);
   else if(rectangleOverlapM2(box,a.box,reviewSetbackMm)>0)builtBuffer.push(a.id);
  }
  for(const n of originalTargets){
   if(n.id===original.id)continue;
   if(rectangleOverlapM2(box,natureFootprint(n))>0)natureExact.push(n.id);
  }
  const samples=natureFootprintSurveyPoints(candidate).map(([x,z])=>heightAt(x,z));
  if(!samples.every(Number.isFinite))throw new Error('Analytical terrain produced nonfinite source Y');
  const gradeMm=Math.round((Math.max(...samples)-Math.min(...samples))*1000);
  const centerYm=Math.round(samples[0]*1000);
  const reasons=[];
  if(!withinHomeView)reasons.push('CANDIDATE_OUTSIDE_ORIGINAL_STUDY_VIEW');
  if(builtExact.length)reasons.push('WS07_ARCHITECTURE_EXACT_SOURCE_OVERLAP');
  if(builtBuffer.length)reasons.push('WS07_PROVISIONAL_SOURCE_MARGIN_REVIEW');
  if(natureExact.length)reasons.push('WS08_OTHER_NATURE_SOURCE_OVERLAP');
  if(gradeMm>2000)reasons.push('SOURCE_ANALYTIC_GROUND_RANGE_GT2M');
  if(site.nominalRoadRibbonReviewIds?.length)reasons.push('EXISTING_NOMINAL_ROAD_RIBBON_CONTACT');
  if(site.provisionalExtraBufferReviewIds?.length)reasons.push('PROPOSED_2M_ROAD_MARGIN_REVIEW');
  reasons.push('WS01_WS10_WS11_WS12_RUNTIME_APPROVAL_MISSING');
  return Object.freeze({
   key:site.key,sourceId:site.sourceId,role:site.role,
   sourceXmm:original.xMm,sourceZmm:original.zMm,
   reviewXmm:candidate.xMm,reviewZmm:candidate.zMm,
   candidateAnalyticalCenterYmm:centerYm,
   candidateAnalyticalRangeMm:gradeMm,
   sourceAnalyticalReferenceYmm:original.analyticalYmm,
   // Crucial: this is NOT a real ground contact or relocation pivot.
   proposedBaseYmm:null,
   withinHomeStudyView:withinHomeView,
   existingArchitectureExactIds:Object.freeze(builtExact),
   architectureMarginReviewIds:Object.freeze(builtBuffer),
   otherNatureSourceOverlapIds:Object.freeze(natureExact),
   ownerReviewReasons:Object.freeze(reasons),
   sourceStatus:'ALTERNATIVE_DESIGN_REVIEW_NOT_RUNTIME_APPROVAL',
   physicalFootingVerified:false,authoritativeHeightVerified:false,
   geometryInstantiated:false,roadModified:false,approved:false,
  });
 });
 return Object.freeze({
  status:'UNAPPROVED_NEIGHBORHOOD_AND_ANALYTIC_GRADE_SCREEN',
  reviewedSites:reports.length,readArchitectureProposals:built.length,
  reports:Object.freeze(reports),
  geometryAuthorized:false,sourceCoordinatesModified:false,
  physicalTerrainRaycastVerified:false,ws10MovementValidated:false,
 });
}
