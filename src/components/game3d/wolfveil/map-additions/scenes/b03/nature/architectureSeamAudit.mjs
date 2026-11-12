/**
 * Workstream 08 — static, UNAPPROVED nature/architecture footprint audit.
 *
 * Pure geometry arithmetic in unshifted Wolfveil local integer millimetres.
 * Callers must provide the WS07 proposal inventory explicitly; this file does
 * not import or modify another workstream's code and never mounts scene assets.
 * Intersection is plan-view AABB only, not mesh, terrain-Y or physics evidence.
 */
import { TARGETS } from './referenceTargets.mjs';

const isMm = n => Number.isSafeInteger(n) && Math.abs(n) <= 100000000;
const hasId = o => typeof o?.id === 'string' && o.id.trim().length > 0;

export function natureFootprint(target) {
  if (!hasId(target) || ![target.xMm, target.zMm].every(isMm)
      || ![target.widthMm, target.depthMm].every(isMm)
      || target.widthMm <= 0 || target.depthMm <= 0) {
    throw new TypeError('WS08 target requires an ID and unshifted local millimetre footprint');
  }
  return { xMm: target.xMm, zMm: target.zMm,
    widthMm: target.widthMm, depthMm: target.depthMm };
}

export function architectureFootprint(proposal) {
  const envelope = proposal?.targetEnvelopeMm;
  if (!hasId(proposal) || ![proposal.xMm, proposal.zMm].every(isMm)
      || !Array.isArray(envelope) || envelope.length !== 3
      || !envelope.every(isMm) || envelope.some(n => n <= 0)) {
    throw new TypeError('WS07 proposal requires an ID and unshifted local millimetre envelope');
  }
  return { xMm: proposal.xMm, zMm: proposal.zMm,
    widthMm: envelope[0], depthMm: envelope[1] };
}

export function rectangleOverlapM2(left, right, setbackMm = 0) {
  if (!Number.isSafeInteger(setbackMm) || setbackMm < 0 || setbackMm > 1000000)
    throw new RangeError('Setback must be a nonnegative integer millimetre distance');
  for (const box of [left, right]) {
    if (![box?.xMm, box?.zMm, box?.widthMm, box?.depthMm].every(isMm)
        || box.widthMm <= 0 || box.depthMm <= 0)
      throw new TypeError('Invalid local-millimetre rectangle');
  }
  // Expand the architectural envelope by setbackMm on each side. Do not
  // grow or reposition the nature footprint or alter either source object.
  const x = Math.max(0, Math.min(left.xMm + left.widthMm/2,
    right.xMm + right.widthMm/2 + setbackMm)
    - Math.max(left.xMm - left.widthMm/2,
      right.xMm - right.widthMm/2 - setbackMm));
  const z = Math.max(0, Math.min(left.zMm + left.depthMm/2,
    right.zMm + right.depthMm/2 + setbackMm)
    - Math.max(left.zMm - left.depthMm/2,
      right.zMm - right.depthMm/2 - setbackMm));
  return Math.round(x * z) / 1000000;
}

/**
 * Compare WS08 reference-only targets with explicitly supplied WS07 drafts.
 * architectureTargets is the flattened WS07 architecture records.
 * reviewSetbackMm is a provisional buffer, NOT navigation authority.
 */
export function auditWs08ArchitectureSeams({
  architectureTargets, natureTargets = TARGETS, reviewSetbackMm = 2000,
} = {}) {
  if (!Array.isArray(architectureTargets) || architectureTargets.length === 0)
    throw new TypeError('Supply a nonempty WS07 architecture proposal inventory');
  if (!Array.isArray(natureTargets))
    throw new TypeError('Supply WS08 nature targets');
  if (!Number.isSafeInteger(reviewSetbackMm) || reviewSetbackMm < 0 || reviewSetbackMm > 1000000)
    throw new RangeError('Invalid proposed setback');
  const natural = natureTargets.map(n => ({ source: n, footprint: natureFootprint(n) }));
  const built = architectureTargets.map(a => ({ source: a, footprint: architectureFootprint(a) }));
  const exactOverlaps = [], proximityReviews = [];
  for (const n of natural) for (const a of built) {
    const overlapM2 = rectangleOverlapM2(n.footprint, a.footprint);
    const expandedOverlapM2 = rectangleOverlapM2(n.footprint, a.footprint, reviewSetbackMm);
    const record = {
      natureId: n.source.id, architectureId: a.source.id,
      natureSceneId: n.source.sceneId,
      architectureSceneId: a.source.scene ?? Number(String(a.source.id).match(/S(\d\d)/)?.[1]),
      overlapM2,
      reviewBufferMm: reviewSetbackMm,
      expandedOverlapM2,
      evidence: 'REFERENCE_PROPOSED_NOT_RUNTIME_COLLISION',
    };
    if (overlapM2 > 0) exactOverlaps.push(record);
    else if (expandedOverlapM2 > 0) proximityReviews.push(record);
  }
  return {
    status: 'SOURCE_ONLY_UNAPPROVED_NOT_PHYSICS_QA',
    natureCount: natural.length, architectureCount: built.length,
    pairsExamined: natural.length * built.length,
    exactOverlaps, proximityReviews,
    requiresApproval: exactOverlaps.length > 0 || proximityReviews.length > 0,
    geometryActivated: false,
    sceneTransformApplied: false,
  };
}
