// Game 3D Wolfveil: review-only simplification plan. No scene/server imports.
// Canonical Play main footprint is 1,100 x 1,100m in Wolfveil-local coords;
// the Game 3D renderer applies the +70m world-Z shift elsewhere exactly once.
export const WOLFVEIL_NW_QUARTER = Object.freeze({
  xMin: -550, xMax: 0, zMin: 0, zMax: 550, areaM2: 302500,
});

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const inBounds = (p, b) => p.x >= b.xMin && p.x < b.xMax &&
  p.z >= b.zMin && p.z < b.zMax;
const validBounds = (b) => b && [b.xMin,b.xMax,b.zMin,b.zMax].every(finite) &&
  b.xMin < b.xMax && b.zMin < b.zMax;
const overlaps=(a,b)=>a.xMin<b.xMax&&a.xMax>b.xMin&&a.zMin<b.zMax&&a.zMax>b.zMin;
function validateReviewZones(zones){
  if(!Array.isArray(zones)||!zones.every(validBounds))
    throw new TypeError('Invalid approvedReviewZones');
  const aligned=n=>Math.abs((n+550)/5-Math.round((n+550)/5))<1e-9;
  for(const b of zones){
    if(b.xMin<WOLFVEIL_NW_QUARTER.xMin||b.xMax>WOLFVEIL_NW_QUARTER.xMax||
       b.zMin<WOLFVEIL_NW_QUARTER.zMin||b.zMax>WOLFVEIL_NW_QUARTER.zMax||
       b.xMax-b.xMin!==5||b.zMax-b.zMin!==5||
       !aligned(b.xMin)||!aligned(b.zMin))
      throw new RangeError('Only aligned 5m Play-editor squares may be reviewed');
  }
  if(zones.some((b,i)=>zones.slice(i+1).some(c=>overlaps(b,c))))
    throw new RangeError('Review squares must not overlap');
}

function stableHash(p) {
  // Deterministic and order-independent. Quantized-centimeter input makes
  // consecutive frame/array reorderings retain the same decorative anchors.
  let x = (Math.round(p.x * 100) | 0) * 73856093 ^
          (Math.round(p.z * 100) | 0) * 19349663;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Plan a density reduction only for explicitly non-physical decoration.
 * Does not mount or modify meshes. Protected claims, authored path/landmark
 * detail, tree trunks, collision owners and physical rocks are never removed.
 * Default fail-closed: 0 approved 5m review squares means no candidate
 * removals. Missing authored path clearance is also a no-op.
 * A renderer must separately prove actual draw/GPU budget improvement and
 * preserve independent 5m square acceptance before integration.
 */
export function planWolfveilNWQuarterAssetBudget({
  grass = [], shrubs = [], stones = [], trees = [],
  protectedZones = [], approvedReviewZones = [],
  pathAndLandmarkClearance = null,
  targetDecorativeReduction = 0.5,
} = {}) {
  if (![grass,shrubs,stones,trees,protectedZones].every(Array.isArray))
    throw new TypeError('Wolfveil quarter budget expects placement arrays');
  if (!finite(targetDecorativeReduction) || targetDecorativeReduction < 0 ||
      targetDecorativeReduction > 0.7)
    throw new RangeError('Target density reduction must be 0..0.7');
  if(!Array.isArray(protectedZones)||!protectedZones.every(validBounds))
    throw new TypeError('Invalid protected zones');
  validateReviewZones(approvedReviewZones);
  if(pathAndLandmarkClearance!=null &&
     typeof pathAndLandmarkClearance!=='function')
    throw new TypeError('Invalid authored-route clearance');

  const report = {quarter: WOLFVEIL_NW_QUARTER, sourceFrame: 'wolfveil-local',
    game3DWorldOffsetZ: 70, targetDecorativeReduction,
    before: {}, after: {}, removed: {}, eligible: {},
    protectedClaims: protectedZones.length,
    approvedReviewSquares: approvedReviewZones.length,
    approvedAreaM2: approvedReviewZones.length*25,
    simulatedOnly: true, actualGpuDrawCallsMeasured: false,
    collisionsChanged: false, terrainChanged: false,
    pathsChanged: false, treeAnchorsChanged: false};

  function reduceDecorative(items, family) {
    const keep = [], eligible = new Map();
    let eligibleCount=0;
    for (const p of items) {
      if (!p || !finite(p.x) || !finite(p.z))
        throw new TypeError('Placement has invalid coordinates');
      const reviewedSquareIndex=approvedReviewZones.findIndex(b=>inBounds(p,b));
      const protectedSpot = !inBounds(p, WOLFVEIL_NW_QUARTER) ||
        reviewedSquareIndex === -1 ||
        protectedZones.some(b => inBounds(p,b)) ||
        p.decorativeOnly !== true || p.nonCollider !== true ||
        p.protected === true || p.routeDetail === true ||
        p.landmarkDetail === true ||
        typeof pathAndLandmarkClearance !== 'function' ||
        pathAndLandmarkClearance(p) !== false;
      if (protectedSpot) {keep.push(p); continue;}
      eligibleCount++;
      // Twenty-metre local buckets keep the reduction evenly distributed
      // rather than clearing entire vistas or planting in a uniform grid.
      const cellX = Math.floor(p.x / 20), cellZ = Math.floor(p.z / 20);
      // Keep one accent in EACH approved 5m square, even when neighboring
      // squares fall into one larger 20m visual-density pocket.
      const key = `${family}:${reviewedSquareIndex}:${cellX}:${cellZ}`;
      if (!eligible.has(key)) eligible.set(key, []);
      eligible.get(key).push(p);
    }
    for (const cell of eligible.values()) {
      cell.sort((a,b) => stableHash(a)-stableHash(b) || a.x-b.x || a.z-b.z);
      // Preserve at least one accent per occupied cell to avoid bald patches.
      const n = Math.max(1,Math.ceil(cell.length*(1-targetDecorativeReduction)));
      keep.push(...cell.slice(0,n));
    }
    report.before[family] = items.length;
    report.after[family] = keep.length;
    report.removed[family] = items.length-keep.length;
    report.eligible[family] = eligibleCount;
    return keep;
  }

  const result = {
    grass: reduceDecorative(grass,'grass'),
    shrubs: reduceDecorative(shrubs,'shrubs'),
    // Never thin stones without verifying collision/seat/walkability semantics.
    stones: stones.slice(),
    // Tree roots/trunk positions are shared with multiplayer collision.
    trees: trees.slice(),
  };
  for (const family of ['stones','trees']) {
    report.before[family]=result[family].length;
    report.after[family]=result[family].length;
    report.removed[family]=0;
    report.eligible[family]=0;
  }
  const prior=grass.length+shrubs.length;
  report.decorativeReduction=prior ?
    (prior-result.grass.length-result.shrubs.length)/prior:0;
  report.totalPlacedReduction = (prior+stones.length+trees.length) ?
    (prior-result.grass.length-result.shrubs.length)/
      (prior+stones.length+trees.length):0;
  // An acceptance ledger for EACH explicitly reviewed editor square.
  // Counts are planning data only: no check may silently become certified.
  report.squareBudgets=approvedReviewZones.map((zone,index)=>{
    const count=(items)=>items.filter(p=>inBounds(p,zone)).length;
    const before={
      grass:count(grass),shrubs:count(shrubs),
      stones:count(stones),trees:count(trees),
    };
    const after={
      grass:count(result.grass),shrubs:count(result.shrubs),
      stones:count(result.stones),trees:count(result.trees),
    };
    const removedDecorative=(before.grass+before.shrubs)-
      (after.grass+after.shrubs);
    return {index,zone,areaM2:25,before,after,removedDecorative,
      aestheticStatus:'UNVERIFIED',
      terrainContactVerified:false,treeCollidersVerified:false,
      rockTraversalVerified:false,pathContinuityVerified:false,
      gpuPerformanceVerified:false,multiplayerVerified:false,
      acceptedPercent:0};
  });
  report.requiresEditorVisualAndCollisionQA=true;
  return {placements: result, report};
}

// Read-only scene diagnostics: counts actual InstancedMesh transforms in the
// north-west quarter. Does NOT estimate GPU FPS, memory or actual draw calls.
// Pass WolfveilBuilder.meshes; group +70m Z must NOT be applied a second time.
const WOLFVEIL_AUDIT_FAMILIES=[
  [/^SWV_Natural_3D_Grass_/,'grass'],
  [/^SWV_RiverFlow_RouteGrass$/,'grass'],
  [/^SWV_RiverFlow_BlueCyan_Understory$/,'shrubs'],
  [/^SWV_Natural_Path_Edge_Weathered_Stones$/,'stones'],
  [/^SWV_.*(?:Trunks|BarkTrunks)$/,'trees'],
];
export function inventoryWolfveilNWQuarterInstances(meshes=[]){
  if(!Array.isArray(meshes))throw new TypeError('meshes must be an array');
  const families={grass:0,shrubs:0,stones:0,trees:0},rows=[];
  let uninspectedBatches=0, unclassifiedInstancedBatches=0;
  let hiddenKnownBatches=0, hiddenAllocatedInstances=0;
  for(const mesh of meshes){
    if(!mesh||typeof mesh.name!=='string')continue;
    const family=WOLFVEIL_AUDIT_FAMILIES.find(([pattern])=>pattern.test(mesh.name))?.[1];
    if(!family){
      if(Number.isInteger(mesh.count)&&mesh.count>=0 &&
        mesh.instanceMatrix?.array){
        unclassifiedInstancedBatches++;
        rows.push({name:mesh.name,family:'unclassified',status:'unknown-category',
          allInstances:mesh.count});
      }
      continue;
    }
    const n=mesh.count, arr=mesh.instanceMatrix?.array;
    // A visible child can still be hidden by its parent (for example
    // imported fallback trees while the owner FBX loads). Follow ancestors
    // without mutating them, and reject malformed cyclic graphs.
    let ancestor=mesh,hidden=false,invalidTree=false;
    const visited=new Set();
    while(ancestor){
      if(visited.has(ancestor)){invalidTree=true;break;}
      visited.add(ancestor);
      if(ancestor.visible===false){hidden=true;break;}
      ancestor=ancestor.parent??null;
    }
    if(invalidTree){
      uninspectedBatches++;
      rows.push({name:mesh.name,family,status:'cyclic-parent',
        allInstances:Number.isInteger(n)?n:null});
      continue;
    }
    if(hidden){
      hiddenKnownBatches++;
      if(Number.isInteger(n)&&n>=0)hiddenAllocatedInstances+=n;
      rows.push({name:mesh.name,family,status:'hidden',
        allInstances:Number.isInteger(n)?n:null});
      continue;
    }
    // Local per-mesh transforms would invalidate local terrain coordinates.
    // Refuse a quarter count rather than silently ignoring extra transforms.
    const at=mesh.position??{x:0,y:0,z:0};
    const sc=mesh.scale??{x:1,y:1,z:1};
    const q=mesh.quaternion??{x:0,y:0,z:0,w:1};
    if([at.x,at.y,at.z,sc.x,sc.y,sc.z,q.x,q.y,q.z,q.w]
        .some(v=>!finite(v))||
       at.x!==0||at.y!==0||at.z!==0||
       sc.x!==1||sc.y!==1||sc.z!==1||
       q.x!==0||q.y!==0||q.z!==0||q.w!==1){
      uninspectedBatches++;
      rows.push({name:mesh.name,family,status:'transformed-mesh',
        allInstances:Number.isInteger(n)?n:null});
      continue;
    }
    if(!Number.isInteger(n)||n<0||!arr||arr.length<n*16){
      uninspectedBatches++;
      rows.push({name:mesh.name,family,status:'uninspected'});
      continue;
    }
    let quarter=0;
    for(let i=0;i<n;i++){
      // instanceMatrix (column-major) local translation is elements 12 & 14.
      const x=arr[i*16+12],z=arr[i*16+14];
      if(!finite(x)||!finite(z)){quarter=null;break;}
      if(inBounds({x,z},WOLFVEIL_NW_QUARTER))quarter++;
    }
    if(quarter===null){
      uninspectedBatches++;
      rows.push({name:mesh.name,family,status:'nonfinite-transform'});
      continue;
    }
    families[family]+=quarter;
    // Potential triangle workload = geometry faces times placed instances,
    // NOT renderer triangles submitted after GPU culling, LOD or material passes.
    const geometry=mesh.geometry;
    const faces=geometry?.index?.count!=null
      ?geometry.index.count/3
      :geometry?.attributes?.position?.count!=null
        ?geometry.attributes.position.count/3:null;
    const nominalTriangles=finite(faces)&&faces>=0&&
      Number.isInteger(faces)?faces*quarter:null;
    rows.push({name:mesh.name,family,status:'counted',
      allInstances:n,nwQuarterInstances:quarter,
      nominalTriangles,
      knownDecorativeNonCollider:mesh.userData?.decorativeOnly===true &&
        mesh.userData?.nonCollider===true});
  }
  return {quarter:WOLFVEIL_NW_QUARTER,sourceFrame:'wolfveil-local',
    families,observedInstances:Object.values(families).reduce((a,b)=>a+b,0),
    countedBatches:rows.filter(r=>r.status==='counted').length,
    knownNominalTriangles:rows.filter(r=>r.status==='counted'&&
      r.nominalTriangles!=null).reduce((total,r)=>total+r.nominalTriangles,0),
    unmeasuredGeometryBatches:rows.filter(r=>r.status==='counted'&&
      r.nominalTriangles==null).length,
    uninspectedBatches,unclassifiedInstancedBatches,
    hiddenKnownBatches,hiddenAllocatedInstances,rows,
    // Deliberately incomplete until all scene batches, assets and parent
    // transforms have been reviewed by the authenticated Editor.
    completeLiveAssetInventory:false,approvedRuntimeCoverageM2:0,
    actualGpuDrawCallsMeasured:false,actualGpuFpsMeasured:false,
    includesUnrecognizedMeshes:unclassifiedInstancedBatches>0,
    readOnly:true};
}

// Compare two observed inventory snapshots without inferring genuine render,
// collision or multiplayer acceptance. Actual reduction percentages apply
// ONLY to recognized, counted InstancedMesh instances.
export function compareWolfveilNWQuarterInventories(baseline,candidate){
  const valid=s=>s&&s.sourceFrame==='wolfveil-local'&&
    s.quarter?.xMin===WOLFVEIL_NW_QUARTER.xMin&&
    s.quarter?.xMax===WOLFVEIL_NW_QUARTER.xMax&&
    s.quarter?.zMin===WOLFVEIL_NW_QUARTER.zMin&&
    s.quarter?.zMax===WOLFVEIL_NW_QUARTER.zMax&&
    ['grass','shrubs','stones','trees'].every(k=>
      Number.isSafeInteger(s.families?.[k])&&s.families[k]>=0)&&
    ['uninspectedBatches','unclassifiedInstancedBatches',
      'hiddenKnownBatches'].every(k=>
      Number.isSafeInteger(s[k])&&s[k]>=0);
  if(!valid(baseline)||!valid(candidate))
    throw new TypeError('Expected two NW-quarter scene inventory snapshots');
  const counts={};
  for(const family of ['grass','shrubs','stones','trees']){
    counts[family]={
      baseline:baseline.families[family],
      candidate:candidate.families[family],
      delta:candidate.families[family]-baseline.families[family],
    };
  }
  const decorativeBefore=counts.grass.baseline+counts.shrubs.baseline;
  const decorativeAfter=counts.grass.candidate+counts.shrubs.candidate;
  const knownBefore=Object.values(counts).reduce((n,r)=>n+r.baseline,0);
  const knownAfter=Object.values(counts).reduce((n,r)=>n+r.candidate,0);
  const risks=[];
  if(counts.trees.delta!==0)risks.push('TREE_INSTANCE_COUNT_CHANGED');
  if(counts.stones.delta!==0)risks.push('STONE_INSTANCE_COUNT_CHANGED');
  if(decorativeAfter>decorativeBefore)
    risks.push('DECORATIVE_INSTANCES_INCREASED');
  if([baseline,candidate].some(s=>s.uninspectedBatches>0||
       s.unclassifiedInstancedBatches>0))
    risks.push('INCOMPLETE_INSTANCE_CLASSIFICATION');
  if([baseline,candidate].some(s=>s.hiddenKnownBatches>0))
    risks.push('HIDDEN_FALLBACKS_EXCLUDED');
  // Even a clean source comparison cannot establish signed-in runtime and
  // physics acceptance. This boolean remains false by design.
  return {
    sourceFrame:'wolfveil-local',quarter:WOLFVEIL_NW_QUARTER,
    counts,baselineKnownInstances:knownBefore,candidateKnownInstances:knownAfter,
    knownInstanceReductionFraction:knownBefore>0
      ?(knownBefore-knownAfter)/knownBefore:null,
    knownDecorativeReductionFraction:decorativeBefore>0
      ?(decorativeBefore-decorativeAfter)/decorativeBefore:null,
    risks,collisionParityCertified:false,visualQualityCertified:false,
    gameplayTraversabilityCertified:false,multiplayerParityCertified:false,
    actualGpuFpsMeasured:false,actualDrawCallsMeasured:false,
    approvedRuntimeCoverageM2:0,acceptedPercent:0,
    safeToMergeOrPublish:false,
  };
}

// Source-coordinate parity survey for existing owner FBX/GLB tree trunks.
// Inputs should be the actual combined wolfveilTreePlacements() and
// wolfveilNativeElmPlacements() lists, plus shared
// wolfveilForestTrunkColliders(). No simulator/physics inference is made.
export function auditWolfveilNWQuarterTreeColliders({
  visualTreeAnchors=[],authoritativeTrunks=[],toleranceM=0.02,
}={}){
  if(!Array.isArray(visualTreeAnchors)||!Array.isArray(authoritativeTrunks)||
     !finite(toleranceM)||toleranceM<0||toleranceM>.1)
    throw new TypeError('Tree parity requires two arrays and <=0.1m tolerance');
  const checkAnchor=(p,collider=false)=>{
    if(!p||!finite(p.x)||!finite(p.z)||
       (collider&&(!finite(p.radius)||p.radius<=0||p.radius>5)))
      throw new TypeError('Invalid tree anchor/trunk collider');
  };
  visualTreeAnchors.forEach(p=>checkAnchor(p));
  authoritativeTrunks.forEach(p=>checkAnchor(p,true));
  const visual=visualTreeAnchors.filter(p=>inBounds(p,WOLFVEIL_NW_QUARTER));
  const colliders=authoritativeTrunks.filter(p=>inBounds(p,WOLFVEIL_NW_QUARTER));
  // Missing data MUST NOT be accepted as an empty forest. A no-tree region
  // needs its own explicit signed-in Play evidence, not an empty source list.
  const inputCoverageComplete=visualTreeAnchors.length>0&&
    authoritativeTrunks.length>0;
  // Intentionally constrain matching to tree root centers; collision capsule
  // radii are validated above, but actual solid movement needs live testing.
  const used=new Set(),unmatchedVisual=[],duplicateVisual=[],kindMismatch=[];
  const colliderKind={ancient:'owner_fbx_ancient',native_elm:'owner_glb_elm'};
  for(const p of visual){
    const matches=colliders.map((t,i)=>({
      i,distance:Math.hypot(p.x-t.x,p.z-t.z),
    })).filter(q=>q.distance<=toleranceM)
      .sort((a,b)=>a.distance-b.distance||a.i-b.i);
    if(matches.length>1)duplicateVisual.push({x:p.x,z:p.z,ambiguous:matches.length});
    const match=matches.find(q=>!used.has(q.i));
    if(!match){unmatchedVisual.push({x:p.x,z:p.z,kind:p.kind??null});continue;}
    used.add(match.i);
    const expected=colliderKind[p.kind];
    if(expected&&colliders[match.i].kind!==expected)
      kindMismatch.push({x:p.x,z:p.z,
        visualKind:p.kind,colliderKind:colliders[match.i].kind??null});
  }
  const orphanColliders=colliders.filter((_,i)=>!used.has(i))
    .map(t=>({x:t.x,z:t.z,radius:t.radius,kind:t.kind??null}));
  return {
    sourceFrame:'wolfveil-local',
    reviewedQuarter:WOLFVEIL_NW_QUARTER,
    visualTreeCount:visual.length,registeredTrunkCount:colliders.length,
    matchedTrunks:used.size,unmatchedVisual,orphanColliders,duplicateVisual,
    kindMismatch,inputCoverageComplete,
    sourceCoordinateParity:inputCoverageComplete&&
      unmatchedVisual.length===0&&orphanColliders.length===0&&
      duplicateVisual.length===0&&kindMismatch.length===0,
    // Source alignment cannot prove walk/physics parity or visual FBX load.
    playerCollisionTested:false,serverParityTested:false,
    ownerAssetVisualLoadTested:false,acceptedForGameplay:false,
  };
}

// Read-only exact-spatial comparison for owner-reserved squares. Exposes any
// removed, moved, or added decoration within protected squares; the WS15
// optimizer must not change those independent art tiles. Keys preserve both
// location and visual signature, so equal counts cannot conceal substitutions.
export function auditWolfveilNWProtectedDecorations({
  baseline=[],candidate=[],protectedZones=[],precisionM=0.001,
}={}){
  if(!Array.isArray(baseline)||!Array.isArray(candidate)||
     !Array.isArray(protectedZones)||!protectedZones.every(validBounds)||
     !finite(precisionM)||precisionM<=0||precisionM>.01)
    throw new TypeError('Protected square parity requires valid placements and bounds');
  for(const arr of [baseline,candidate]){
    for(const p of arr)
      if(!p||!finite(p.x)||!finite(p.z))
        throw new TypeError('Invalid protected placement');
  }
  const inputCoverageComplete=protectedZones.length>0;
  const changes=[];
  for(const zone of protectedZones){
    const serialize=(items)=>{
      const found=new Map();
      for(const p of items){
        if(!inBounds(p,zone))continue;
        const q=n=>Math.round(n/precisionM);
        const signature=(p.assetId??p.kind??p.name??p.id??'unspecified');
        if(typeof signature!=='string'&&typeof signature!=='number')
          throw new TypeError('Invalid asset signature');
        // Detect changes that retain the exact same number of instances
        // but alter their actual 3D height, density, scale, rotation, tint
        // or material. Do NOT flatten away artist-authored distinctions.
        const numericKeys=['y','height','width','size','scale','yaw','rot','shade'];
        const numericStyle=numericKeys.map(k=>{
          const value=p[k];
          if(value===undefined||value===null)return '-';
          if(!finite(value))throw new TypeError('Invalid protected visual value: '+k);
          return k==='shade'?String(value):String(q(value));
        }).join(',');
        const textKeys=['materialId','textureId'];
        const textStyle=textKeys.map(k=>{
          const v=p[k];
          if(v===undefined||v===null)return '-';
          if(typeof v!=='string'&&typeof v!=='number')
            throw new TypeError('Invalid protected material value: '+k);
          return String(v);
        }).join(',');
        const key=JSON.stringify([q(p.x),q(p.z),String(signature),
          numericStyle,textStyle]);
        found.set(key,(found.get(key)??0)+1);
      }
      return found;
    };
    const a=serialize(baseline),b=serialize(candidate);
    const removed=[],added=[];
    for(const [key,n] of a){
      const difference=n-(b.get(key)??0);
      if(difference>0)removed.push({key,count:difference});
    }
    for(const [key,n] of b){
      const difference=n-(a.get(key)??0);
      if(difference>0)added.push({key,count:difference});
    }
    if(removed.length||added.length)
      changes.push({zone,removed,added});
  }
  return {
    inspectedZones:protectedZones.length,changes,inputCoverageComplete,
    protectedArtworkUnchanged:inputCoverageComplete&&changes.length===0,
    // This is only a placement comparison, not image or collision acceptance.
    verifiedInPlay:false,acceptedPercent:0,readOnly:true,
  };
}

// Source-level ground contact QA against the SAME visible terrain sampler
// used by the Game 3D decoration planner. This is NOT a runtime raycast,
// player collision, or rock-seat test. Never mutate placement coordinates.
export function auditWolfveilNWDecorationGrounding({
  grass=[],stones=[],sampleVisibleGround=null,
  grassRootToleranceM=0.16,stoneCenterToleranceM=0.16,
}={}){
  if(!Array.isArray(grass)||!Array.isArray(stones)||
     (sampleVisibleGround!=null&&typeof sampleVisibleGround!=='function')||
     !finite(grassRootToleranceM)||grassRootToleranceM<0||grassRootToleranceM>.6||
     !finite(stoneCenterToleranceM)||stoneCenterToleranceM<0||
     stoneCenterToleranceM>.6)
    throw new TypeError('Grounding QA needs placements and an optional finite terrain sampler');
  const anomalies=[],stats={grass:{sampled:0,uninspected:0},
    stones:{sampled:0,uninspected:0}};
  for(const [family,items] of [['grass',grass],['stones',stones]]){
    for(const [index,p] of items.entries()){
      if(!p||!finite(p.x)||!finite(p.z)||!finite(p.y))
        throw new TypeError('Nonfinite grounding placement');
      if(!inBounds(p,WOLFVEIL_NW_QUARTER))continue;
      const isStone=family==='stones';
      if(!sampleVisibleGround||(isStone&&(!finite(p.size)||p.size<=0))){
        stats[family].uninspected++;
        continue;
      }
      const ground=sampleVisibleGround(p.x,p.z);
      if(!finite(ground)){
        stats[family].uninspected++;
        anomalies.push({family,index,x:p.x,z:p.z,kind:'UNSAMPLED_GROUND'});
        continue;
      }
      stats[family].sampled++;
      // The authoritative WolfveilPathStones planner places its stone center
      // at the terrain surface plus size*0.13. Grass roots use surface Y.
      const expected=ground+(isStone?p.size*.13:0);
      const deltaM=p.y-expected;
      const tolerance=isStone?stoneCenterToleranceM:grassRootToleranceM;
      if(Math.abs(deltaM)>tolerance)
        anomalies.push({family,index,x:p.x,z:p.z,
          kind:deltaM>0?'FLOATING_DECORATION':'BURIED_DECORATION',
          deltaM,expectedY:expected,actualY:p.y});
    }
  }
  const terrainSamplerAvailable=typeof sampleVisibleGround==='function';
  return {quarter:WOLFVEIL_NW_QUARTER,stats,anomalies,
    sourceContactWithinTolerance:terrainSamplerAvailable&&
      stats.grass.sampled+stats.stones.sampled>0&&
      stats.grass.uninspected===0&&stats.stones.uninspected===0&&
      anomalies.length===0,
    terrainSamplerAvailable,actualPlayRaycastTested:false,
    rockWalkClimbSitTested:false,playerPhysicsVerified:false,
    acceptedPercent:0,readOnly:true};
}
