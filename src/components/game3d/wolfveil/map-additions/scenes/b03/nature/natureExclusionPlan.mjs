/**
 * Wolfveil Workstream 08, Batch 03: unactivated nature-footprint design options.
 *
 * All bounds remain in ORIGINAL Wolfveil local millimetres. The input WS07
 * rectangles are design proposals, not installed geometry. No coordinate
 * recentering, THREE imports, terrain modifications, or colliders occur here.
 *
 * This returns hypothetical nature-footprint cutouts, NOT permission to render.
 */
import {TARGETS} from './referenceTargets.mjs';
import {natureFootprint,architectureFootprint} from './architectureSeamAudit.mjs';

const validSetback = x => Number.isSafeInteger(x) && x >= 0 && x <= 100000;
const boundsOf = (footprint, extraMm = 0) => Object.freeze({
  minXmm:footprint.xMm-footprint.widthMm/2-extraMm,
  maxXmm:footprint.xMm+footprint.widthMm/2+extraMm,
  minZmm:footprint.zMm-footprint.depthMm/2-extraMm,
  maxZmm:footprint.zMm+footprint.depthMm/2+extraMm,
});
const nonempty = b => b.maxXmm > b.minXmm && b.maxZmm > b.minZmm;
const intersect = (a,b) => {
  const shared={
    minXmm:Math.max(a.minXmm,b.minXmm),maxXmm:Math.min(a.maxXmm,b.maxXmm),
    minZmm:Math.max(a.minZmm,b.minZmm),maxZmm:Math.min(a.maxZmm,b.maxZmm),
  };
  return nonempty(shared)?shared:null;
};
const area = b => (b.maxXmm-b.minXmm)*(b.maxZmm-b.minZmm)/1000000;

/** Partition a rectangle minus another one into nonoverlapping rectangles. */
export function subtractProposedEnvelope(source, exclusion) {
  for(const box of [source,exclusion]){
    if(!box||![box.minXmm,box.maxXmm,box.minZmm,box.maxZmm].every(Number.isFinite)
        ||!nonempty(box))throw new TypeError('Requires nonempty local-mm bounds');
  }
  const shared=intersect(source,exclusion);
  if(!shared)return [Object.freeze({...source})];
  const out=[
    {minXmm:source.minXmm,maxXmm:shared.minXmm,minZmm:source.minZmm,maxZmm:source.maxZmm},
    {minXmm:shared.maxXmm,maxXmm:source.maxXmm,minZmm:source.minZmm,maxZmm:source.maxZmm},
    {minXmm:shared.minXmm,maxXmm:shared.maxXmm,minZmm:source.minZmm,maxZmm:shared.minZmm},
    {minXmm:shared.minXmm,maxXmm:shared.maxXmm,minZmm:shared.maxZmm,maxZmm:source.maxZmm},
  ];
  return out.filter(nonempty).map(b=>Object.freeze(b));
}

/**
 * For each original WS08 nature envelope, propose how much area would remain
 * if the independently authored WS07 envelopes were excluded. This is review
 * information only: do not feed it directly into a live scene builder.
 *
 * Optional setback in millimetres expands *architecture* boundaries only.
 * It is a hypothetical margin and is not a navmesh or physics requirement.
 */
export function proposeNatureExclusionPlan({
  architectureTargets,natureTargets=TARGETS,reviewSetbackMm=2000,
}={}){
  if(!Array.isArray(architectureTargets)||!architectureTargets.length)
    throw new TypeError('WS07 architecture inventory must be supplied');
  if(!Array.isArray(natureTargets))throw new TypeError('Nature inventory must be an array');
  if(!validSetback(reviewSetbackMm))throw new RangeError('Invalid proposed setback');
  const built=architectureTargets.map(x=>({id:x.id,bounds:boundsOf(architectureFootprint(x),reviewSetbackMm)}));
  if(new Set(built.map(x=>x.id)).size!==built.length)
    throw new TypeError('Duplicate WS07 proposal ID');
  const nature=natureTargets.map(n=>{
    const original=boundsOf(natureFootprint(n));
    let remaining=[original];
    const contacts=[];
    for(const a of built){
      if(!intersect(original,a.bounds))continue;
      contacts.push(a.id);
      remaining=remaining.flatMap(fragment=>subtractProposedEnvelope(fragment,a.bounds));
    }
    const sourceAreaM2=area(original);
    const retainedAreaM2=remaining.reduce((sum,box)=>sum+area(box),0);
    const excludedAreaM2=Math.max(0,sourceAreaM2-retainedAreaM2);
    // Samples and source dimensions are never relocated or mutated.
    return Object.freeze({
      sourceId:n.sourceId,natureId:n.id,sceneId:n.sceneId,
      sourceBoundsMm:original,originalAreaM2:sourceAreaM2,
      hypotheticalRetainedAreaM2:Math.round(retainedAreaM2*1000000)/1000000,
      hypotheticalExcludedAreaM2:Math.round(excludedAreaM2*1000000)/1000000,
      reviewContactIds:Object.freeze(contacts),
      fragments:Object.freeze(remaining),
      requiresExternalApproval:contacts.length>0,
      status:'UNAPPROVED_PLAN_VIEW_OPTION',
    });
  });
  if(new Set(nature.map(x=>x.natureId)).size!==nature.length)
    throw new TypeError('Duplicate WS08 nature ID');
  return Object.freeze({
    status:'UNAPPROVED_SOURCE_ONLY_NOT_RUNTIME_GEOMETRY',
    reviewSetbackMm,sourceNatureTargetCount:nature.length,
    architectureTargetCount:built.length,
    pairCount:nature.length*built.length,
    reviewCount:nature.filter(n=>n.requiresExternalApproval).length,
    proposals:Object.freeze(nature),
    activated:false,meshCreated:false,worldTransformApplied:false,
  });
}
