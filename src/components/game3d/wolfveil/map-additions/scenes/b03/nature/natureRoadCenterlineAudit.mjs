/**
 * WS08 source-only exact road-centerline vs natural reference AABB audit.
 * No mesh, travelable width, physics or terrain Y claims; the reference
 * rectangle can be artistically hollow/soft, so overlap is a HOLD for solid
 * placement and review, not proof that a runtime collider already blocks.
 */
import { TARGETS } from './referenceTargets.mjs';

const finite = Number.isFinite;
const coordinates = p => Array.isArray(p) && p.length>=2 && finite(p[0]) && finite(p[1]);
const safe = x => Number.isSafeInteger(x) && Math.abs(x)<=100000000;

export function natureRectangleLocalMeters(target) {
 if(!target || ![target.xMm,target.zMm,target.widthMm,target.depthMm].every(safe)
     || target.widthMm<=0 || target.depthMm<=0)
  throw new TypeError('Requires valid unshifted WS08 rectangle in integer mm');
 return {
  minX:(target.xMm-target.widthMm/2)/1000,
  maxX:(target.xMm+target.widthMm/2)/1000,
  minZ:(target.zMm-target.depthMm/2)/1000,
  maxZ:(target.zMm+target.depthMm/2)/1000,
 };
}

/**
 * Liang-Barsky exact parametric clipping. Returns null if a 2D polyline
 * segment misses a nature-source AABB, including zero-length contact.
 * True corner/edge tangencies return null; segment on a boundary may report
 * positive overlap conservatively, subject to subsequent 3D QA.
 */
export function clipNatureRoadSegment(a,b,rect) {
 if(!coordinates(a)||!coordinates(b)||!rect||![rect.minX,rect.maxX,rect.minZ,rect.maxZ].every(finite)
 || !(rect.minX<rect.maxX && rect.minZ<rect.maxZ))
  throw new TypeError('Invalid road segment or nature rectangle');
 const x=b[0]-a[0], z=b[1]-a[1],dist=Math.hypot(x,z);
 if(!(dist>0))return null;
 let lo=0,hi=1;
 for(const [p,q] of [
  [-x,a[0]-rect.minX],[x,rect.maxX-a[0]],
  [-z,a[1]-rect.minZ],[z,rect.maxZ-a[1]],
 ]) {
  if(Math.abs(p)<1e-12) {
   if(q<0)return null;
  } else {
   const t=q/p;
   if(p<0)lo=Math.max(lo,t);
   else hi=Math.min(hi,t);
   if(lo>hi)return null;
  }
 }
 if(hi-lo<=1e-12)return null;
 const point=t=>Object.freeze([
  Math.round((a[0]+x*t)*1e6)/1e6,
  Math.round((a[1]+z*t)*1e6)/1e6,
 ]);
 return Object.freeze({
  entry:point(lo), exit:point(hi),
  segmentDistanceM:Math.round(dist*(hi-lo)*1e6)/1e6,
  entryFraction:lo, exitFraction:hi,
 });
}

/**
 * Caller injects current WOLFVEIL_ROUTES. This is read-only source review:
 * zero intersection does NOT imply actor-width clearance. All existing road
 * and nature IDs, transforms and Y remain untouched.
 */
export function auditNatureRoadCenterlines({routes,targets=TARGETS}={}) {
 if(!Array.isArray(routes)||routes.length===0||!Array.isArray(targets))
  throw new TypeError('Require complete existing road and WS08 proposed catalogs');
 const byRoute=new Set(),byTarget=new Set();
 for(const r of routes){
  if(typeof r?.id!=='string'||!r.id||byRoute.has(r.id)||!finite(r.width)||r.width<=0
   ||!Array.isArray(r.points)||r.points.length<2||!r.points.every(coordinates))
   throw new TypeError('Invalid or duplicated existing Wolfveil road');
  byRoute.add(r.id);
 }
 const conflicts=[];
 for(const target of targets) {
  if(typeof target?.id!=='string'||byTarget.has(target.id))
   throw new TypeError('Invalid or duplicated WS08 nature ID');
  byTarget.add(target.id);
  const bounds=natureRectangleLocalMeters(target);
  for(const r of routes){
   const segments=[];
   for(let i=1;i<r.points.length;i++) {
    const clipped=clipNatureRoadSegment(r.points[i-1],r.points[i],bounds);
    if(clipped)segments.push(Object.freeze({segmentIndex:i-1,...clipped}));
   }
   if(segments.length) {
    const distanceM=Math.round(segments.reduce((s,c)=>s+c.segmentDistanceM,0)*1e6)/1e6;
    conflicts.push(Object.freeze({
     sourceId:target.sourceId,natureId:target.id,
     routeId:r.id,nominalRoadWidthM:r.width,
     totalCenterlineIntersectionM:distanceM,
     segments:Object.freeze(segments),
     sourceRectangle: Object.freeze(bounds),
     status:'SOURCE_AABB_CROSSES_EXISTING_ROUTE_CENTERLINE',
     solidColliderAuthorized:false,
    }));
   }
  }
 }
 return Object.freeze({
  status:'EXACT_PLAN_VIEW_ONLY_NOT_COLLISION_OR_CLEARANCE',
  routesReviewed:routes.length,targetsReviewed:targets.length,
  centerlineIntersectionCount:conflicts.length,
  conflicts:Object.freeze(conflicts),
  geometryActivated:false,routeModified:false,centerShiftApplied:false,
  actorTravelVerified:false,
 });
}
