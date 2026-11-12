/**
 * Wolfveil WS08: candidate-only clearance against the EXISTING source layout.
 * Pure deterministic arithmetic; does not import other owners' modules,
 * register graphics, alter terrain, authorize navigation, or open caves.
 * Coordinate inputs are unshifted source-local metres for the source layout
 * and signed integer millimetres for WS08 candidates. Viewer +70m is NEVER
 * applied in this module. Proximity is a review signal, not physical proof.
 */
import { TARGETS } from './referenceTargets.mjs';
import { natureFootprint, rectangleOverlapM2 } from './architectureSeamAudit.mjs';

const positive = n => Number.isFinite(n) && n > 0;
const finite2 = p => Array.isArray(p) && p.length >= 2 &&
  Number.isFinite(p[0]) && Number.isFinite(p[1]);

const rectFromSource = item => {
  if (typeof item?.id !== 'string' || ![item.x,item.z,item.w,item.d].every(Number.isFinite)
      || !positive(item.w) || !positive(item.d)) {
    throw new TypeError('Invalid source building or housing rectangle');
  }
  return { xMm:Math.round(item.x*1000), zMm:Math.round(item.z*1000),
    widthMm:Math.round(item.w*1000), depthMm:Math.round(item.d*1000) };
};

// Liang-Barsky clipping against the axis-aligned, conservatively inflated
// nature envelope. This checks an entire route/water segment, not just nodes.
export function lineTouchesRectangleMeters(a,b,rect) {
  if (![a,b].every(finite2) || ![rect?.x,rect?.z,rect?.w,rect?.d].every(Number.isFinite)
      || !positive(rect.w) || !positive(rect.d)) {
    throw new TypeError('Invalid segment or rectangle');
  }
  let lo=0, hi=1;
  for (const [p0,p1,min,max] of [
    [a[0],b[0],rect.x-rect.w/2,rect.x+rect.w/2],
    [a[1],b[1],rect.z-rect.d/2,rect.z+rect.d/2],
  ]) {
    const d=p1-p0;
    if (Math.abs(d)<1e-12) {
      if (p0<min || p0>max) return false;
    } else {
      const t0=(min-p0)/d,t1=(max-p0)/d;
      lo=Math.max(lo,Math.min(t0,t1));
      hi=Math.min(hi,Math.max(t0,t1));
      if(lo>hi) return false;
    }
  }
  return true;
}

const corridorTouches = (points, box, radius) => {
  const inflated = {
    x:box.xMm/1000,z:box.zMm/1000,
    w:box.widthMm/1000+2*radius,d:box.depthMm/1000+2*radius,
  };
  return points.slice(1).some((p,i)=>lineTouchesRectangleMeters(points[i],p,inflated));
};

export function auditWs08SourceClearance({
  natureTargets=TARGETS, routes, buildings, housingPlots, river,
  planningSetbackM=2,
}={}) {
  if (![routes,buildings,housingPlots].every(Array.isArray)
      || !river || !Array.isArray(river.points) || !positive(river.width)) {
    throw new TypeError('Requires verified existing routes, buildings, housing and river inputs');
  }
  if (!Number.isFinite(planningSetbackM) || planningSetbackM<0 || planningSetbackM>100)
    throw new RangeError('Invalid planning setback (metres)');
  if (!Array.isArray(natureTargets)) throw new TypeError('Nature targets must be an array');
  for(const route of routes) {
    if(typeof route?.id !== 'string' || !positive(route.width) ||
      !Array.isArray(route.points) || route.points.length<2 || !route.points.every(finite2))
      throw new TypeError('Invalid existing Wolfveil route');
  }
  if(river.points.length<2 || !river.points.every(finite2))
    throw new TypeError('Invalid existing river centerline');
  const sourceBuildings=buildings.map(x=>({id:x.id,box:rectFromSource(x)}));
  const sourcePlots=housingPlots.map(x=>({id:x.id,box:rectFromSource(x)}));
  const findings=[];
  for(const t of natureTargets){
    const box=natureFootprint(t);
    const buildingOverlaps=sourceBuildings.flatMap(x=>{
      const area=rectangleOverlapM2(box,x.box);
      return area>0?[{id:x.id,areaM2:area}]:[];
    });
    const housingOverlaps=sourcePlots.flatMap(x=>{
      const area=rectangleOverlapM2(box,x.box);
      return area>0?[{id:x.id,areaM2:area}]:[];
    });
    const routeReviews=routes.filter(route=>
      corridorTouches(route.points,box,route.width/2+planningSetbackM)).map(x=>x.id);
    const riverReview=corridorTouches(river.points,box,river.width/2+planningSetbackM);
    if(buildingOverlaps.length||housingOverlaps.length||routeReviews.length||riverReview){
      findings.push({natureId:t.id,sourceId:t.sourceId,sceneId:t.sceneId,
        buildingOverlaps,housingOverlaps,routeReviews,riverReview,
        status:'AUTHORING_CLEARANCE_REVIEW_ONLY'});
    }
  }
  return {
    status:'SOURCE_ONLY_NO_RUNTIME_COLLISION_EVIDENCE',
    checkedTargets:natureTargets.length,
    checkedRoutes:routes.length,checkedBuildings:sourceBuildings.length,
    checkedHousingPlots:sourcePlots.length,
    planningSetbackM,findings,
    activation:false,coordinateShiftApplied:false,
  };
}
