/**
 * LAND-WS12 / Wolfveil PLAY: first square of the owner's ~25% scenic quality audit.
 * SOURCE-ONLY, not mounted by GameWorld3D. No terrain, physics, server, tree
 * placements, live actor objects, or surrounding tile transforms are changed.
 * All positions accepted here are *local* Wolfveil X/Z, not the +70 m world Z.
 */
export const WOLFVEIL_R08_C06 = Object.freeze({
  id: 'WV-R08-C06',
  minX: -50, maxX: 50,
  minZ: -250, maxZ: -150,
  playZOffset: 70,
  worldMinZ: -180, worldMaxZ: -80,
  targetDecorativeReduction: .5,
});

// Thirty distinct 100 m editor sections out of 121 (~24.79%) for READ-ONLY
// initial audit. No changes to these other 29 sections are authorized here.
export const WOLFVEIL_25_PERCENT_AUDIT_IDS = Object.freeze(
  Array.from({length: 5}, (_, row) =>
    Array.from({length: 6}, (_, col) =>
      'WV-R' + String(row + 5).padStart(2, '0') +
      '-C' + String(col + 4).padStart(2, '0')))
    .flat(),
);

/**
 * Source-stage adapter for the upstream southwest-quarter quality pass.
 * Running the GLOBAL SW pass does NOT mean this tile was thinned: current
 * WolfveilSWQuarterQuality protects WV-R08-C06 explicitly. Probe the west
 * half (the only part in the SW quadrant), then pass the resulting per-tile
 * boolean into planWolfveilR08C06Declutter.
 *
 * Never guess for partial/changed exclusion footprints. Mixed coverage fails
 * closed until WS15 inspects the upstream stage; no placements are mutated.
 */
export function resolveWolfveilR08C06SWStage({qualityPassRan, isProtectedAt} = {}) {
  if (typeof qualityPassRan !== 'boolean' || typeof isProtectedAt !== 'function')
    throw new TypeError('South Gate SW stage requires qualityPassRan and a tile protection predicate');
  const probes = [
    [-49.5,-249.5],[-.5,-249.5],[-49.5,-150.5],[-.5,-150.5],
    [-25,-200],
  ];
  const protection=probes.map(([x,z])=>isProtectedAt(x,z));
  if (!protection.every(value=>typeof value==='boolean') ||
      !protection.every(value=>value===protection[0]))
    throw new Error('Mixed or unknown South Gate southwest protection coverage; refusing stage inference');
  return Object.freeze({
    alreadySWQualityApplied: qualityPassRan && !protection[0],
    squareProtectedFromSWQuality: protection[0],
    qualityPassRan,
  });
}

// Non-enumerable array marker prevents silently optimizing the same list
// twice (50% + 50% = 75%). Rebuild from the untouched source each time.
const WV_R08_C06_RESULT_MARKER=Symbol.for('Wolfveil.R08C06.decorations-optimized');

const finite = Number.isFinite;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const APPROACH_RENDER = Object.freeze({
  dirtColors: Object.freeze([0x645441, 0x79634a, 0x554b3c]),
  roughness: .96, metalness: 0, decorativeOnly: true,
  raycast: false, collisionsAdded: 0,
});
export const WOLFVEIL_R08_C06_DIRT_STYLE = APPROACH_RENDER;

export function inWolfveilR08C06(x, z) {
  return finite(x) && finite(z) &&
    x >= WOLFVEIL_R08_C06.minX && x < WOLFVEIL_R08_C06.maxX &&
    z >= WOLFVEIL_R08_C06.minZ && z < WOLFVEIL_R08_C06.maxZ;
}
export function distanceToWolfveilRouteEdge(x, z, routes = []) {
  if (!finite(x) || !finite(z)) return Infinity;
  let shortest = Infinity;
  for (const route of routes) {
    if (!Array.isArray(route?.points) || !finite(route?.width) || route.width <= 0) continue;
    for (let i = 0; i + 1 < route.points.length; i++) {
      const a = route.points[i], b = route.points[i + 1];
      if (!Array.isArray(a) || !Array.isArray(b) ||
          ![a[0], a[1], b[0], b[1]].every(finite)) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x-a[0])*dx + (z-a[1])*dz) / (dx*dx + dz*dz || 1), 0, 1);
      shortest = Math.min(shortest, Math.hypot(x - a[0] - t*dx, z - a[1] - t*dz) - route.width*.5);
    }
  }
  return shortest;
}
/** Account for the object's full horizontal footprint, not only its center.
 * This is visual/route clearance only; physical trunk colliders are unchanged.
 */
function footprintRadius(item, kind) {
  // A grass clump may provide both a small contact radius and a much larger
  // rendered width. Protect the *largest* finite declared footprint, not just
  // the first field, so its visible geometry cannot intrude on a trail/trunk.
  // Do not clamp wide clumps to 2m (or generic radius to 4m): that incorrectly
  // allowed oversized vegetation to overhang physical paths.
  const radius=Number(item?.radius);
  const width=Number(item?.width);
  const size=Number(item?.size);
  return Math.max(
    Number.isFinite(radius) && radius>0 ? radius : 0,
    (kind==='grass'||kind==='shrubs') && Number.isFinite(width) && width>0 ? width*.5 : 0,
    Number.isFinite(size) && size>0 ? size*.5 : 0,
  );
}
function clearOfTrunks(x, z, trunks, margin = .45) {
  return trunks.every(trunk => !finite(trunk?.x) || !finite(trunk?.z) ||
    Math.hypot(x-trunk.x, z-trunk.z) >= Math.max(0, Number(trunk.radius) || 0) + margin);
}
function stableHash(p, kind) {
  const key = kind + ':' + p.x.toFixed(4) + ':' + p.z.toFixed(4) + ':' + String(p.id || '');
  let h = 2166136261 >>> 0;
  for (let i=0; i<key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const isProtected = p => Boolean(p?.protected || p?.landmark || p?.solid ||
  p?.walkable || p?.physicsRole === 'solid' || p?.physicsRole === 'walkable');
const validPlacement = p => p && finite(p.x) && finite(p.z);

/** Stable, spatially balanced exact half-selection of otherwise safe cosmetic
 * candidates. Keep one half per 12.5 m microcell first, then allocate the
 * remaining quota by stable hash; the output does not depend on input order.
 */
function halfByMicrocell(candidates, kind) {
  const groups = new Map();
  for (const p of candidates) {
    const bx = Math.floor((p.x - WOLFVEIL_R08_C06.minX) / 12.5);
    const bz = Math.floor((p.z - WOLFVEIL_R08_C06.minZ) / 12.5);
    const key = bx + ':' + bz;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const eligible = [];
  const remainder = [];
  for (const group of groups.values()) {
    group.sort((a,b) => stableHash(a,kind) - stableHash(b,kind) ||
      a.x - b.x || a.z - b.z);
    const n = Math.floor(group.length / 2);
    eligible.push(...group.slice(0, n));
    remainder.push(...group.slice(n));
  }
  const wanted = Math.floor(candidates.length / 2);
  remainder.sort((a,b)=>stableHash(a,kind)-stableHash(b,kind) ||
    a.x-b.x || a.z-b.z);
  eligible.push(...remainder.slice(0, Math.max(0, wanted-eligible.length)));
  return eligible;
}
function thinningPass(items, kind, routes, trunks, alreadySWQualityApplied) {
  if (!Array.isArray(items)) throw new TypeError(kind + ' must be an array');
  if(items[WV_R08_C06_RESULT_MARKER] === true)
    throw new Error('WV-R08-C06 cosmetics already optimized; use original source placements instead of applying a second thinning pass');
  const outside = [], invalidItems = [], protectedInside = [], previouslyThinnedInside = [], candidates = [];
  let pathCleared = 0, trunkCleared = 0, protectedPathObstructions = 0;
  for (const item of items) {
    // Never drop an unlocated/invalid record. It cannot be assigned to this
    // square, so the only safe operation is to pass it through by identity and
    // flag it for upstream placement-data correction.
    if (!validPlacement(item)) { invalidItems.push(item); continue; }
    if (!inWolfveilR08C06(item.x,item.z)) { outside.push(item); continue; }
    // An edge-hanging blade clump or boulder can intrude on the trail even
    // when its center lies outside the corridor. Leave clearance for its
    // footprint; keep all protected rocks and record their obstruction.
    const footprint=footprintRadius(item,kind);
    const nearRoad = distanceToWolfveilRouteEdge(item.x,item.z,routes) < .45 + footprint;
    const nearTrunk = !clearOfTrunks(item.x,item.z,trunks,.45 + footprint);
    // Large outcrops must survive even if older asset records lack a physics tag.
    // Their real walkability/step/sit collision is a separate WS15/server QA gate.
    if (isProtected(item) || ((kind === 'rocks' || kind === 'stones') &&
      (Number(item.size) >= .85 || Number(item.radius) >= .85))) {
      protectedInside.push(item);
      if (nearRoad) protectedPathObstructions++;
      continue;
    }
    if (nearRoad) { pathCleared++; continue; }
    if (nearTrunk) { trunkCleared++; continue; }
    // Existing WolfveilGroundCover already invokes its independent southwest
    // quarter quality pass for x<0,z<0. Never apply another 50% random cut to
    // that same surviving stock when the caller provides post-pass instances.
    if (alreadySWQualityApplied && (kind === 'grass' || kind === 'shrubs' || kind === 'stones') &&
        item.x < 0 && item.z < 0) {
      previouslyThinnedInside.push(item);
      continue;
    }
    candidates.push(item);
  }
  const selected = halfByMicrocell(candidates,kind);
  // Rendering code may attach per-instance metadata to the source sequence.
  // Keep survivors in their ORIGINAL order; do not group outside/invalid/
  // protected/selected records into unrelated batches.
  // Count occurrences rather than using Set, because an input can reuse one
  // object reference for two distinct placement instances.
  const keptCounts=new Map(), selectedCounts=new Map();
  for(const group of [outside,invalidItems,protectedInside,previouslyThinnedInside,selected]) {
    for(const item of group) keptCounts.set(item,(keptCounts.get(item)||0)+1);
  }
  for(const item of selected) selectedCounts.set(item,(selectedCounts.get(item)||0)+1);
  const ordered=[];
  for(const item of items) {
    const count=keptCounts.get(item)||0;
    if(count<=0) continue;
    keptCounts.set(item,count-1);
    const selectedCount=selectedCounts.get(item)||0;
    if(selectedCount>0) {
      selectedCounts.set(item,selectedCount-1);
      ordered.push(kind === 'stones' || kind === 'rocks'
        ? {...item, decorativeOnly:true, nonCollider:true, physicsIntent:'pass-through'}
        : item);
    } else ordered.push(item);
  }
  // Mark only the newly built result array; never mutate the caller input.
  // This is intentionally absent from JSON and ordinary property enumeration.
  Object.defineProperty(ordered,WV_R08_C06_RESULT_MARKER,{value:true});
  return {
    placements:ordered,
    measured: {
      input:items.length,
      outside:outside.length,
      protected:protectedInside.length,
      previouslyThinnedRetained:previouslyThinnedInside.length,
      candidates:candidates.length,
      retainedCandidates:selected.length,
      pathCleared, trunkCleared, invalid:invalidItems.length, protectedPathObstructions,
      inputInside:items.length-outside.length-invalidItems.length,
      retainedInside:protectedInside.length+previouslyThinnedInside.length+selected.length,
      // Precisely reported, never assume 50% if preservation/paths skew it.
      reductionInside:items.length-outside.length-invalidItems.length
        ? 1-(protectedInside.length+previouslyThinnedInside.length+selected.length)/(items.length-outside.length-invalidItems.length)
        : 0,
    },
  };
}
/** A conservative, strictly source-only scene planning pass. Existing bridge,
 * road mesh, heightfield, BVH and server trunk colliders are untouched.
 * The caller must provide authoritative local routes and exactly the same
 * ground-height sampler as the current visual terrain.
 */
export function planWolfveilR08C06Declutter({
  grass=[],shrubs=[],stones=[],rocks=[],routes=[],trunks=[],heightAt,
  alreadySWQualityApplied,
} = {}) {
  if (typeof alreadySWQualityApplied !== 'boolean')
    throw new Error('Declare whether Wolfveil southwest quality thinning has already run');
  if (!Array.isArray(routes) || !routes.some(r=>r?.id==='public_gate_market_sanctuary'))
    throw new Error('Missing the canonical South Gate–Market route; refusing terrain/path planning');
  if (!Array.isArray(trunks) || typeof heightAt !== 'function')
    throw new Error('Trunks and an authoritative rendered-ground sampler are required');
  const grassPass=thinningPass(grass,'grass',routes,trunks,alreadySWQualityApplied);
  const shrubPass=thinningPass(shrubs,'shrubs',routes,trunks,alreadySWQualityApplied);
  const stonePass=thinningPass(stones,'stones',routes,trunks,alreadySWQualityApplied);
  const rockPass=thinningPass(rocks,'rocks',routes,trunks,alreadySWQualityApplied);
  const dirt=planWolfveilR08C06DirtPath({routes,heightAt});
  if (!dirt.ribbons.some(ribbon => ribbon.routeId === 'public_gate_market_sanctuary'))
    throw new Error('Canonical South Gate dirt road does not intersect the claimed square');
  const passes={grass:grassPass,shrubs:shrubPass,stones:stonePass,rocks:rockPass};
  let before=0,after=0,protectedObstructions=0;
  for (const key of Object.keys(passes)) {
    before+=passes[key].measured.inputInside;
    after+=passes[key].measured.retainedInside;
    protectedObstructions+=passes[key].measured.protectedPathObstructions;
  }
  return {
    id: WOLFVEIL_R08_C06.id,
    bounds:WOLFVEIL_R08_C06, auditCohortSize: WOLFVEIL_25_PERCENT_AUDIT_IDS.length,
    placements:Object.fromEntries(Object.entries(passes).map(([key,p])=>[key,p.placements])),
    perKind:Object.fromEntries(Object.entries(passes).map(([key,p])=>[key,p.measured])),
    dirtPath:dirt,
    measured:{
      before,after,removed:before-after,
      reduction:before ? (before-after)/before : 0,
      protectedPathObstructions:protectedObstructions,
    },
    // Neither large walkable rocks nor tree trunks should disappear or lose collision.
    alreadySWQualityApplied,
    // Post-pass reduction is relative to survivors, NOT the original raw count.
    // This alone must not be used to claim a 50% map-wide reduction.
    measuredAgainstPreviouslyThinnedInputs:alreadySWQualityApplied,
    treeTrunkCountUnchanged:trunks.length, collidersAdded:0,
    serverCollisionChanged:false, terrainHeightChanged:false,
    liveMounted:false, certifiedPlay:false,
  };
}
// Liang-Barsky clipping of a CENTERLINE to the single authored tile.
function clipSegmentToTile(ax, az, bx, bz) {
  let enter=0, leave=1;
  const dx=bx-ax, dz=bz-az, pad=.001;
  const tests=[
    [-dx,ax-WOLFVEIL_R08_C06.minX],
    [dx,WOLFVEIL_R08_C06.maxX-pad-ax],
    [-dz,az-WOLFVEIL_R08_C06.minZ],
    [dz,WOLFVEIL_R08_C06.maxZ-pad-az],
  ];
  for (const [p,q] of tests) {
    if (Math.abs(p)<1e-12) { if (q<0) return null; continue; }
    const u=q/p;
    if (p<0) enter=Math.max(enter,u);
    else leave=Math.min(leave,u);
    if (enter>leave) return null;
  }
  return [[ax+dx*enter,az+dz*enter],[ax+dx*leave,az+dz*leave]];
}
function clampTile(x, z) {
  return {
    x:clamp(x,WOLFVEIL_R08_C06.minX+.001,WOLFVEIL_R08_C06.maxX-.001),
    z:clamp(z,WOLFVEIL_R08_C06.minZ+.001,WOLFVEIL_R08_C06.maxZ-.001),
  };
}
export function planWolfveilR08C06DirtPath({routes=[],heightAt,spacing=2} = {}) {
  if(typeof heightAt!=='function') throw new TypeError('Ground sampler required');
  if(!finite(spacing)||spacing<.5||spacing>5) throw new RangeError('Invalid dirt path spacing');
  const ribbons=[];
  for(const route of routes) {
    if(!Array.isArray(route?.points)||!finite(route?.width)||route.width<=0)continue;
    // Primary approach is a continuous compacted-earth path; secondary paths
    // remain recognized but their existing authored route is never replaced.
    if(route.id!=='public_gate_market_sanctuary'&&route.id!=='south_residential') continue;
    for(let i=0;i<route.points.length-1;i++){
      const a=route.points[i], b=route.points[i+1];
      if(![a?.[0],a?.[1],b?.[0],b?.[1]].every(finite))continue;
      const clipped=clipSegmentToTile(a[0],a[1],b[0],b[1]);
      if(!clipped)continue;
      const [start,end]=clipped;
      const dx=end[0]-start[0],dz=end[1]-start[1],len=Math.hypot(dx,dz);
      if(len<.01)continue;
      const nx=-dz/len,nz=dx/len;
      const points=[];
      const segments=Math.max(1,Math.ceil(len/spacing));
      for(let j=0;j<=segments;j++){
        const t=j/segments, x=start[0]+dx*t,z=start[1]+dz*t;
        const wave=.13*Math.sin((x+z)*.075+i*.3);
        const half=Math.max(.7,route.width*.5-.12+wave);
        const left=clampTile(x+nx*half,z+nz*half);
        const right=clampTile(x-nx*half,z-nz*half);
        const ly=heightAt(left.x,left.z),ry=heightAt(right.x,right.z);
        if(!finite(ly)||!finite(ry)) throw new Error('Ground sampler returned invalid height');
        points.push({
          left:{...left,y:ly+.012},
          right:{...right,y:ry+.012},
        });
      }
      ribbons.push({
        id:route.id+':'+i, routeId:route.id, points, triangles:(points.length-1)*2,
        surface:'compacted-dirt', nonCollider:true, decorativeOnly:true,
      });
    }
  }
  return {ribbons, style:WOLFVEIL_R08_C06_DIRT_STYLE,
    sourceFrame:true, playZOffsetApplied:false, collisionsAdded:0,
    triangles:ribbons.reduce((n,r)=>n+r.triangles,0)};
}
