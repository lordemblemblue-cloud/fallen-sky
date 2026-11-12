// Game 3D Wolfveil: bounded ~25% of the 1,100m core, never Game 1.
// This is an art-only reduction pass. It creates NO collision or terrain mesh.
// Coordinates are Wolfveil-local: the renderer's +70m z offset is not applied here.
export const WOLFVEIL_SW_QUALITY=Object.freeze({
  id:'wolfveil-southwest-quarter-v1',
  minX:-550,maxX:0,minZ:-550,maxZ:0,
  originalCoreAreaFraction:.25,
  targetDecorReduction:.50,
  // Other LAND-WS workstreams own these exact independently reviewed tiles.
  // Keep this southwest-quarter pass out of their vegetation/path footprints.
  protectedTiles:Object.freeze([
    Object.freeze({id:'X87-Z70',minX:-115.4,maxX:-109.6,minZ:-200.4,maxZ:-194.6}),
    // Full reserved 100m forest square; 5m safety feather protects edges.
    Object.freeze({id:'WV-R06-C02',minX:-455,maxX:-345,minZ:-55,maxZ:55}),
    // LAND-WS12 South Gate. World Z [-180,-80), +70 world offset
    // implies Wolfveil local Z [-250,-150); half the tile overlaps SW.
    Object.freeze({id:'WV-R08-C06',minX:-50,maxX:50,minZ:-250,maxZ:-150}),
  ]),
});

export function wolfveilIsSWQualityQuarter(x,z){
  return Number.isFinite(x)&&Number.isFinite(z)&&
    x>=WOLFVEIL_SW_QUALITY.minX&&x<WOLFVEIL_SW_QUALITY.maxX&&
    z>=WOLFVEIL_SW_QUALITY.minZ&&z<WOLFVEIL_SW_QUALITY.maxZ;
}

export function wolfveilIsProtectedSWTile(x,z,padding=0){
  // Used for route-color footprints as well as plant anchors. A road quad
  // whose centre is outside the reservation may still overlap its boundary.
  const pad=Number.isFinite(padding)?Math.max(0,padding):0;
  return WOLFVEIL_SW_QUALITY.protectedTiles.some(q=>
    x>=q.minX-pad&&x<q.maxX+pad&&z>=q.minZ-pad&&z<q.maxZ+pad);
}

function spatialHash(ix,iz,salt){
  let n=(Math.imul(ix,0x45d9f3b)^Math.imul(iz,0x27d4eb2d)^salt)>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d)>>>0;
  n=Math.imul(n^(n>>>15),0x846ca68b)>>>0;
  return ((n^(n>>>16))>>>0)/4294967296;
}

/** Conservative footprint including the grass tip bend, stone width or the
 * full shrub icosahedron. The *whole* decoration must stay in our workstream.
 * This only chooses which instances to thin/batch; it moves no physical object.
 */
export function wolfveilSWDecorFootprintRadius(p,kind='grass',alreadyRendered=false){
  const size=kind==='shrub'?p?.scale:kind==='stone'?p?.size:p?.width;
  const safeSize=Number.isFinite(size)&&size>0?size:0;
  return kind==='shrub'?Math.max(1.25,safeSize*1.15+.40):
    kind==='stone'?Math.max(1.25,safeSize*.65+.30):
    // Surviving generic grass gains 10% width *after* the thinning decision.
    // Reserve its final grown footprint now, or tufts at a protected boundary
    // can spill across another owner's square despite passing the initial gate.
    Math.max(1.25,safeSize*(alreadyRendered?1:1.10)*.80+.40);
}

/** A point on the southwest side is not ours if its *rendered footprint*
 * enters another quadrant or a reserved 5m/100m terrain square.
 */
export function wolfveilIsEligibleSWDecoration(p,kind='grass',alreadyRendered=false){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
  // Planner: anticipate 10% widened surviving grass. Read-only mesh audit:
  // inspect actual already-rendered width without applying growth twice.
  const {x,z}=p,margin=wolfveilSWDecorFootprintRadius(p,kind,alreadyRendered);
  return wolfveilIsSWQualityQuarter(x,z)&&
    x>=WOLFVEIL_SW_QUALITY.minX+margin&&
    x<WOLFVEIL_SW_QUALITY.maxX-margin&&
    z>=WOLFVEIL_SW_QUALITY.minZ+margin&&
    z<WOLFVEIL_SW_QUALITY.maxZ-margin&&
    !wolfveilIsProtectedSWTile(x,z,margin);
}

/** Cluster-aware, reproducible thinning: planted roots, lanes and owned squares
 * don't move. Coherent 14m patches read as landscaped fields, not deleted pixels.
 */
export function wolfveilRetainSWDecoration(p,kind='grass'){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
  const {x,z}=p;
  if(!wolfveilIsEligibleSWDecoration(p,kind))return true;
  const type=kind==='stone'?0x76d319:kind==='shrub'?0x1328ac:0x58b107;
  const cluster=spatialHash(Math.floor(x/14),Math.floor(z/14),type);
  const local=spatialHash(Math.floor(x*5),Math.floor(z*5),type^0x6937f);
  return cluster*.67+local*.33<.50;
}

export function wolfveilThinSWDecorations(items,kind='grass'){
  if(!Array.isArray(items))throw new TypeError('Expected decoration array');
  let before=0,after=0;
  const kept=[];
  for(const p of items){
    const inScope=wolfveilIsEligibleSWDecoration(p,kind);
    if(inScope)before++;
    if(!wolfveilRetainSWDecoration(p,kind))continue;
    if(inScope)after++;
    if(kind==='grass'&&inScope){
      // Recover the perceived grass silhouette without increasing instances.
      // Existing wind and 3D blade shaders remain the same.
      kept.push({...p,width:Number.isFinite(p.width)?p.width*1.10:p.width,
        height:Number.isFinite(p.height)?p.height*1.045:p.height});
    }else kept.push(p);
  }
  return {items:kept,before,after,removed:before-after,
    reduction:before?1-after/before:0};
}

/** Tint the existing SINGLE physical route network; add zero geometry/assets.
 * Brown earth, natural mineral variation, no bright synthetic paint.
 */
export function wolfveilSWDirtPathTint(x,z,baseTint,footprintRadius=0){
  // Paths are wider than their centreline. Both the route strip and its
  // conservative half-length must fit the southwest work area. Return the
  // *original* tint array for all unowned / out-of-scope strips.
  const pad=Number.isFinite(footprintRadius)?Math.max(0,footprintRadius):0;
  if(!wolfveilIsSWQualityQuarter(x,z)||wolfveilIsProtectedSWTile(x,z,pad))
    return baseTint;
  const outerClearance=Math.min(
    x-WOLFVEIL_SW_QUALITY.minX,WOLFVEIL_SW_QUALITY.maxX-x,
    z-WOLFVEIL_SW_QUALITY.minZ,WOLFVEIL_SW_QUALITY.maxZ-z);
  // Distance to each claimed tile includes the rounded corners of the
  // rectangular safety envelope; there are no extra meshes or colliders.
  const ownerClearance=Math.min(...WOLFVEIL_SW_QUALITY.protectedTiles.map(q=>
    Math.hypot(Math.max(q.minX-x,0,x-q.maxX),
      Math.max(q.minZ-z,0,z-q.maxZ))));
  const clearance=Math.min(outerClearance,ownerClearance)-pad;
  if(clearance<=0)return baseTint;
  // Eight metres of gentle material feathering avoids a sudden dirt-color
  // seam at the exact square boundary without painting inside another lane.
  const t=Math.max(0,Math.min(1,clearance/8));
  const blend=t*t*(3-2*t);
  const low=Math.sin(x*.071+z*.052)*.035+
    Math.cos(x*.27-z*.18)*.018;
  const tint=[.57+low,.475+low*.76,.375+low*.55];
  return tint.map((v,i)=>baseTint[i]+
    (Math.max(.18,Math.min(.82,v))-baseTint[i])*blend);
}

/**
 * Move only ordinary numeric-id grass *instances* from the quality quarter
 * into one renderer batch. No coordinates/UVs/material colors are modified;
 * plants on independently owned squares and outside the region remain in
 * their original patches. If compacting would add draw calls, do nothing.
 * This is a pure planning operation; the real THREE mesh is created elsewhere.
 */
export function wolfveilPlanSWGrassDrawBatch(patches){
  if(!Array.isArray(patches))throw new TypeError('Expected patch array');
  const oldDrawCalls=patches.filter(p=>p&&Array.isArray(p.plants)&&p.plants.length>0&&
    /^-?[0-9]+:-?[0-9]+$/.test(String(p.id))).length;
  const next=[],mergedPlants=[];
  let contributors=0;
  for(const patch of patches){
    if(!patch||!Array.isArray(patch.plants)||!patch.plants.length||
       !/^-?[0-9]+:-?[0-9]+$/.test(String(patch.id))){
      next.push(patch);continue;
    }
    const remaining=[],grouped=[];
    for(const plant of patch.plants){
      if(wolfveilIsEligibleSWDecoration(plant,'grass'))grouped.push(plant);
      else remaining.push(plant);
    }
    if(!grouped.length){next.push(patch);continue;}
    contributors++;
    mergedPlants.push(...grouped);
    if(remaining.length)next.push({...patch,plants:remaining});
  }
  const keptDrawCalls=next.filter(p=>p&&Array.isArray(p.plants)&&p.plants.length>0&&
    /^-?[0-9]+:-?[0-9]+$/.test(String(p.id))).length;
  const newDrawCalls=keptDrawCalls+(mergedPlants.length?1:0);
  if(newDrawCalls>=oldDrawCalls)return {
    patches,mergedPlants:[],originalDrawCalls:oldDrawCalls,
    resultingDrawCalls:oldDrawCalls,savedDrawCalls:0,
    originalContributors:0,instancedGrassBatched:0,
  };
  return {
    patches:next,mergedPlants,originalDrawCalls:oldDrawCalls,
    resultingDrawCalls:newDrawCalls,savedDrawCalls:oldDrawCalls-newDrawCalls,
    originalContributors:contributors,
    instancedGrassBatched:mergedPlants.length,
  };
}
