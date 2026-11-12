/**
 * READ ONLY instance inventory for the canonical Game 3D northeast Wolfveil core.
 * Pass createWolfveilVillage(...).world (WolfveilBuilder). Does not mount,
 * mutate, dispose, raycast, or alter any InstancedMesh or collision record.
 * No imported THREE/DOM requirement; fails explicitly on unsupported transforms.
 */
import {WOLFVEIL_QUARTER_NE} from './WolfveilQuarterLandscapeBudget.mjs';

const finite=Number.isFinite;
const close=(a,b)=>Math.abs(a-b)<1e-6;
const inside=(x,z,q)=>x>=q.minX&&x<q.maxX&&z>=q.minZ&&z<q.maxZ;
const label=(x,z)=>'X'+Math.floor((x+550)/5)+'-Z'+Math.floor((z+550)/5);
function untransformed(o) {
  const p=o.position??{},r=o.rotation??{},s=o.scale??{},q=o.quaternion??{};
  return close(p.x??0,0)&&close(p.y??0,0)&&close(p.z??0,0)&&
    close(r.x??0,0)&&close(r.y??0,0)&&close(r.z??0,0)&&
    close(s.x??1,1)&&close(s.y??1,1)&&close(s.z??1,1)&&
    close(q.x??0,0)&&close(q.y??0,0)&&close(q.z??0,0)&&close(q.w??1,1);
}
function role(mesh) {
  const name=String(mesh.name??'');
  if (/^SWV_Natural_3D_Grass_|SWV_RiverFlow_RouteGrass|SWV_SWQuarter_Consolidated_Grass_Batch/.test(name))
    return 'grass';
  if (/SWV_Natural_Path_Edge_Weathered_Stones/.test(name))return 'microStone';
  if (/SWV_RiverFlow_BlueCyan_Understory/.test(name))return 'understory';
  return 'unclassified';
}
// Non-cryptographic, order-independent *warning* fingerprint per tile.
// Includes all 16 transform matrix components and 3 optional instance tints.
// It detects common same-count moves/repaints but is NOT an authenticity proof.
function instanceFingerprint(matrices, offset, colors, colorOffset) {
  let hash=2166136261>>>0;
  for(let j=0;j<16;j++){
    const value=matrices[offset+j];
    if(!finite(value))return null;
    const quantized=Math.round(value*10000);
    hash=Math.imul(hash^(quantized|0),16777619)>>>0;
  }
  if(colors){
    for(let j=0;j<3;j++){
      const value=colors[colorOffset+j];
      if(!finite(value))return null;
      hash=Math.imul(hash^(Math.round(value*10000)|0),16777619)>>>0;
    }
  }
  return hash;
}
function trisPerInstance(mesh) {
  const geometry=mesh.geometry;
  const count=geometry?.index?.count??geometry?.attributes?.position?.count;
  return finite(count)&&count>=0?Math.floor(count/3):null;
}

/**
 * The only trustworthy output here is a CPU census of inspectable DIRECT
 * InstancedMesh children in an originAtMarket (+70m Z) Wolfveil group.
 * It is NOT a GPU benchmark, whole-scene census, collider QA, or authorization.
 */
export function inventoryWolfveilNEQuarterInstances({world,bounds=WOLFVEIL_QUARTER_NE,
  maxInstances=1000000}={}) {
  const group=world?.group;
  if(!group||!Array.isArray(group.children)||!group.position||
    !close(group.position.x??0,0)||!close(group.position.y??0,0)||
    !close(group.position.z,70)||!close(group.scale?.x??1,1)||
    !close(group.scale?.y??1,1)||!close(group.scale?.z??1,1)||
    !close(group.rotation?.x??0,0)||!close(group.rotation?.y??0,0)||
    !close(group.rotation?.z??0,0)||
    !close(group.quaternion?.x??0,0)||!close(group.quaternion?.y??0,0)||
    !close(group.quaternion?.z??0,0)||!close(group.quaternion?.w??1,1))
    throw new RangeError('Expected untouched canonical Wolfveil Game 3D root with +70m Z');
  if(!bounds||![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(finite)||
    bounds.minX<0||bounds.maxX>550||bounds.minZ<0||bounds.maxZ>550||
    bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)
    throw new RangeError('Inventory bounds must remain inside NE quarter');
  if(!Number.isSafeInteger(maxInstances)||maxInstances<=0)
    throw new RangeError('Invalid inventory scan budget');

  const stats={scannedDirectChildren:group.children.length,
    instanceBatches:0,unclassifiedBatches:0,unsupportedBatches:0,
    scannedInstanceMatrices:0,uninspectedInstances:0,
    insideInstances:0,visibleInstances:0,
    hiddenInstances:0,explicitDecorativeNonColliders:0,
    missingInstanceColorBatches:0,
    unverifiedColliderStatus:0,nominalGeometryTriangles:0,
    nominalTrianglesIncomplete:false,byCategory:{
      grass:0,microStone:0,understory:0,unclassified:0,
    },tiles:{},batches:[],warnings:[]};
  const visited=new Set();
  for(const mesh of group.children){
    if(!mesh?.isInstancedMesh||visited.has(mesh))continue;
    visited.add(mesh);
    const name=String(mesh.name||'(unnamed)'),family=role(mesh);
    const n=mesh.count,arr=mesh.instanceMatrix?.array;
    const unsupported=!Number.isSafeInteger(n)||n<0||
      !arr||arr.length<n*16||mesh.parent!==group||
      !untransformed(mesh);
    if(unsupported||n>maxInstances-stats.scannedInstanceMatrices){
      stats.unsupportedBatches++;
      stats.uninspectedInstances+=Number.isSafeInteger(n)&&n>=0?n:0;
      stats.warnings.push(name+': cannot reliably transform or scan instances');
      continue;
    }
    stats.instanceBatches++;
    stats.scannedInstanceMatrices+=n;
    if(family==='unclassified')stats.unclassifiedBatches++;
    const perTriangle=trisPerInstance(mesh),visible=
      group.visible!==false&&mesh.visible!==false;
    const colors=mesh.instanceColor?.array??null;
    const hasColors=colors?.length>=n*3;
    if(!hasColors)stats.missingInstanceColorBatches++;
    const declared=mesh.userData?.decorativeOnly===true&&
      mesh.userData?.nonCollider===true;
    let insideCount=0,skippedInvalid=0;
    for(let i=0;i<n;i++){
      const k=i*16,x=arr[k+12],z=arr[k+14];
      if(!finite(x)||!finite(z)){skippedInvalid++;continue;}
      if(!inside(x,z,bounds))continue;
      const hash=instanceFingerprint(arr,k,hasColors?colors:null,i*3);
      if(hash===null){skippedInvalid++;continue;}
      insideCount++;
      const tile=label(x,z);
      if(!stats.tiles[tile])stats.tiles[tile]={grass:0,microStone:0,
        understory:0,unclassified:0,
        signatures:{grass:{sum:0,xor:0},microStone:{sum:0,xor:0},
          understory:{sum:0,xor:0},unclassified:{sum:0,xor:0}}};
      stats.tiles[tile][family]++;
      const signature=stats.tiles[tile].signatures[family];
      signature.sum=(signature.sum+hash)>>>0;
      signature.xor=(signature.xor^hash)>>>0;
    }
    if(skippedInvalid){
      stats.uninspectedInstances+=skippedInvalid;
      stats.warnings.push(name+': '+skippedInvalid+' nonfinite instance matrices');
    }
    stats.insideInstances+=insideCount;
    stats.byCategory[family]+=insideCount;
    stats[visible?'visibleInstances':'hiddenInstances']+=insideCount;
    stats[declared?'explicitDecorativeNonColliders':'unverifiedColliderStatus']+=insideCount;
    if(perTriangle===null)stats.nominalTrianglesIncomplete=true;
    else stats.nominalGeometryTriangles+=insideCount*perTriangle;
    stats.batches.push({name,family,insideCount,visible,
      declaredDecorativeNonCollider:declared,nominalTrisPerInstance:perTriangle});
  }
  return {region:'canonicalWolfveilPlayNEQuarter',
    coordinateFrame:'wolfveil-local',worldRootOffsetZ:70,
    readOnly:true,completeSceneCensus:false,
    actualGpuDrawCallsMeasured:false,realEditorPlayCertified:false,
    playerPhysicsVerified:false,ownerApproved:false,
    stats};
}


/**
 * Compare two read-only CPU inventories; report unauthorized scene changes.
 * Counts alone cannot certify quality. Matrix+tint signatures catch common
 * same-count placement/material drift in neighboring or owner-locked tiles.
 * No user-supplied approval list, complete scene or actual Play evidence is
 * manufactured here. It deliberately NEVER reports merge readiness.
 */
export function compareWolfveilNEQuarterInventories({
  before, after, authorizedReviewSquares = [], protectedSquares = [],
} = {}) {
  if(!before||!after||
    before.region!=='canonicalWolfveilPlayNEQuarter'||
    after.region!=='canonicalWolfveilPlayNEQuarter'||
    before.worldRootOffsetZ!==70||after.worldRootOffsetZ!==70||
    before.coordinateFrame!=='wolfveil-local'||
    after.coordinateFrame!=='wolfveil-local'||
    !Array.isArray(authorizedReviewSquares)||!Array.isArray(protectedSquares))
    throw new RangeError('Expected two comparable canonical NE quarter inventories');

  const parseSquare=s=>{
    if(!s||![s.minX,s.maxX,s.minZ,s.maxZ].every(finite)||
      s.maxX-s.minX!==5||s.maxZ-s.minZ!==5||
      !Number.isInteger(s.minX/5)||!Number.isInteger(s.minZ/5)||
      s.minX<0||s.maxX>550||s.minZ<0||s.maxZ>550)
      throw new RangeError('Only exact 5m Game 3D NE quarter squares are accepted');
    return label(s.minX,s.minZ);
  };
  const approved=authorizedReviewSquares.map(parseSquare);
  if(new Set(approved).size!==approved.length)
    throw new RangeError('Duplicate authorized review square');
  const reserved=protectedSquares.map(parseSquare);
  const approvedSet=new Set(approved),reservedSet=new Set(reserved);
  const issues=[];
  if(approvedSet.size===0)
    issues.push('No owner-authorized 5m squares supplied for comparison');
  for(const tile of approvedSet){
    if(reservedSet.has(tile))issues.push('Owner-reserved square is also authorized: '+tile);
  }
  const baseline=before.stats??{},candidate=after.stats??{};
  for(const [tag,s] of [['before',baseline],['after',candidate]]){
    if(!s.tiles||!Number.isSafeInteger(s.insideInstances)||
       !Number.isSafeInteger(s.uninspectedInstances)||
       !Number.isSafeInteger(s.unsupportedBatches)||
       !Number.isSafeInteger(s.unclassifiedBatches))
      throw new RangeError('Incomplete '+tag+' inventory schema');
    if(s.uninspectedInstances>0||s.unsupportedBatches>0)
      issues.push(tag+': scene census incomplete or transform unsupported');
    if(s.unclassifiedBatches>0)
      issues.push(tag+': unclassified instanced batches present');
    if(s.missingInstanceColorBatches>0)
      issues.push(tag+': some instance colors unavailable for fingerprint');
    if(s.unverifiedColliderStatus>0)
      issues.push(tag+': unverified collider status for '+s.unverifiedColliderStatus+' instances');
    if(s.hiddenInstances>0)
      issues.push(tag+': hidden fallback instances are not a measured visible-scene saving');
    if(s.nominalTrianglesIncomplete===true)
      issues.push(tag+': some mesh triangle counts are unavailable');
  }
  const tileNames=new Set([...Object.keys(baseline.tiles),...Object.keys(candidate.tiles)]);
  const categories=['grass','microStone','understory','unclassified'];
  const changes=[];
  for(const tile of [...tileNames].sort()){
    const old=baseline.tiles[tile]??{},now=candidate.tiles[tile]??{};
    const oldSig=old.signatures,nowSig=now.signatures;
    if((Object.keys(old).length&&!oldSig)||(Object.keys(now).length&&!nowSig)){
      issues.push('Missing instance-placement signatures in '+tile);
      continue;
    }
    const detail={tile,authorized:approvedSet.has(tile),protected:reservedSet.has(tile),
      before:0,after:0,delta:0,changedKinds:[],sameCountMovedOrRecolored:false};
    let altered=false;
    for(const kind of categories){
      const a=old[kind]??0,b=now[kind]??0;
      detail.before+=a;detail.after+=b;
      const p=oldSig?.[kind]??{sum:0,xor:0};
      const q=nowSig?.[kind]??{sum:0,xor:0};
      const transformed=p.sum!==q.sum||p.xor!==q.xor;
      if(a!==b||transformed){
        altered=true;detail.changedKinds.push(kind);
        if(a===b&&transformed)detail.sameCountMovedOrRecolored=true;
      }
    }
    if(!altered)continue;
    detail.delta=detail.after-detail.before;
    changes.push(detail);
    if(!detail.authorized||detail.protected)
      issues.push('Unapproved or locked square changed: '+tile);
    if(detail.changedKinds.includes('unclassified'))
      issues.push('Unknown/solid prop batch changed: '+tile);
    if(detail.delta>0)
      issues.push('Added assets rather than simplifying: '+tile);
  }
  const rawBefore=baseline.insideInstances,rawAfter=candidate.insideInstances;
  if(rawBefore===0||rawAfter===0)
    issues.push('No comparable populated before/after scene census');
  return {
    status:'CPU_SCENE_COMPARE_ONLY_NO_PLAY_OR_MERGE_PROOF',
    authorizedFiveMetreSquares:approvedSet.size,
    changes,issues,
    protectedSquaresUnchanged:!issues.some(s=>s.startsWith('Unapproved or locked square')),
    rawBefore,rawAfter,rawDelta:rawAfter-rawBefore,
    rawInstanceReduction:rawBefore?Math.max(0,(rawBefore-rawAfter)/rawBefore):0,
    countAndSignatureReviewClean:issues.length===0,
    independentlyVerifiedPlay:false,actualGpuFpsMeasured:false,
    treeAndRockCollisionVerified:false,ownerApproved:false,mergeReady:false,
  };
}
