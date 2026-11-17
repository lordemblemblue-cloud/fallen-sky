// Wolfveil caves: stop paying for what is under the ground.
//
// The four caves and their tunnels are built from hundreds of small props
// (ribs, braziers, lanterns, crystals, crates). Measured on the real valley
// they cost about 790 draw calls for only 53,000 triangles, and they were
// drawn all the time, also while the player stood in the town square with
// solid ground between them and every cave.
//
// Two measures, neither of which changes how anything looks:
//
//  1. BURIED PARTS ARE ONLY DRAWN UNDERGROUND. Every object whose top lies
//     under the turf (and that is not near a cave mouth) moves into one
//     "interior" group. That group is drawn while the player is in a cave
//     and switched off while they are on the surface, where the solid roof
//     hides it anyway.
//  2. IDENTICAL PROPS SHARE ONE DRAW. Props with the same shape and material
//     are merged into instanced batches (see Game3DStaticInstancing.mjs), so
//     being inside a cave is cheap as well.
//
// No Three.js import: the caller hands in the two constructors it needs.
import {instanceStaticMeshes} from '../performance/Game3DStaticInstancing.mjs';

export const WOLFVEIL_CAVE_DRAW_BUDGET=Object.freeze({
  buriedMarginMeters:1,   // an object's top must be at least this far under the turf
  mouthClearMeters:12,    // nothing this close to a cave mouth is ever hidden
  sampleStepMeters:3,     // how finely the ground above an object is probed
  maxSamplesPerSide:14,
  playerBuriedMeters:2.5, // a body this far under the turf counts as underground
});
export const WOLFVEIL_CAVE_INTERIOR_NAME='SWV_FourCave_Interconnected_TunnelSystem_Interior';

// Column-major 4x4 product, as Three.js stores matrices.
function multiply(a,b){
  const out=new Array(16);
  for(let column=0;column<4;column++)for(let row=0;row<4;row++){
    let sum=0;
    for(let k=0;k<4;k++)sum+=a[k*4+row]*b[column*4+k];
    out[column*4+row]=sum;
  }
  return out;
}
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function grow(box,x,y,z){
  if(x<box.minX)box.minX=x;if(x>box.maxX)box.maxX=x;
  if(y<box.minY)box.minY=y;if(y>box.maxY)box.maxY=y;
  if(z<box.minZ)box.minZ=z;if(z>box.maxZ)box.maxZ=z;
}
function collect(object,parentMatrix,box){
  object.updateMatrix?.();
  const local=object.matrix?.elements;
  if(!local)return false;
  const matrix=multiply(parentMatrix,local);
  let complete=true;
  if(object.isSprite){
    // A sprite always faces the camera: allow for it in every direction.
    const reach=Math.max(Math.abs(object.scale?.x||1),Math.abs(object.scale?.y||1))*.75;
    grow(box,matrix[12]-reach,matrix[13]-reach,matrix[14]-reach);
    grow(box,matrix[12]+reach,matrix[13]+reach,matrix[14]+reach);
  }else if(object.isInstancedMesh||object.isSkinnedMesh){
    complete=false; // placed per instance or per bone: never guess
  }else if(object.geometry){
    const geometry=object.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox?.();
    const bounds=geometry.boundingBox;
    if(!bounds||![bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z]
      .every(Number.isFinite))complete=false;
    else for(const x of [bounds.min.x,bounds.max.x])
      for(const y of [bounds.min.y,bounds.max.y])
        for(const z of [bounds.min.z,bounds.max.z])
          grow(box,
            matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
            matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
            matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]);
  }
  for(const child of object.children||[])
    if(!collect(child,matrix,box))complete=false;
  return complete;
}
/** Bounds of an object and everything under it, in its parent's space. */
export function wolfveilCaveObjectBox(object){
  const box={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
  if(!object||!collect(object,IDENTITY,box))return null;
  return Object.values(box).every(Number.isFinite)?box:null;
}

/**
 * True when the whole box lies under the ground and away from every mouth,
 * so that nobody standing on the surface could possibly see it.
 */
export function isWolfveilCaveBoxBuried(box,{heightAt,mouths=[],
  options=WOLFVEIL_CAVE_DRAW_BUDGET}={}){
  if(!box||typeof heightAt!=='function')return false;
  for(const mouth of mouths){
    const dx=Math.max(box.minX-mouth[0],0,mouth[0]-box.maxX);
    const dz=Math.max(box.minZ-mouth[1],0,mouth[1]-box.maxZ);
    if(Math.hypot(dx,dz)<options.mouthClearMeters)return false;
  }
  const steps=span=>Math.min(options.maxSamplesPerSide,
    Math.max(1,Math.ceil(span/options.sampleStepMeters)));
  const nx=steps(box.maxX-box.minX),nz=steps(box.maxZ-box.minZ);
  let lowest=Infinity;
  for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
    const ground=heightAt(box.minX+(box.maxX-box.minX)*i/nx,box.minZ+(box.maxZ-box.minZ)*j/nz);
    if(!Number.isFinite(ground))return false;
    if(ground<lowest)lowest=ground;
  }
  return box.maxY<=lowest-options.buriedMarginMeters;
}

/**
 * @param {object} config
 * @param {Function} config.Group          THREE.Group
 * @param {Function} config.InstancedMesh  THREE.InstancedMesh
 * @param {object} config.group            the cave system's root group
 * @param {(x:number,z:number)=>number} config.heightAt  turf height, cave-local metres
 * @param {Array<[number,number]>} config.mouths         cave mouths as [x,z]
 * @param {object[]} [config.keep]         objects that must stay where they are
 * @param {object[]} [config.staticProps]  props that never move after building
 */
export function installWolfveilCaveDrawBudget({Group,InstancedMesh,group,heightAt,
  mouths=[],keep=[],staticProps=[],options:overrides={}}={}){
  if(typeof Group!=='function'||typeof InstancedMesh!=='function')
    throw new TypeError('Group and InstancedMesh constructors are required');
  if(!group?.add||!Array.isArray(group.children))throw new TypeError('The cave group is required');
  if(typeof heightAt!=='function')throw new TypeError('A ground height function is required');
  const options={...WOLFVEIL_CAVE_DRAW_BUDGET,...overrides};
  const fixed=new Set(keep);
  const interior=new Group();
  interior.name=WOLFVEIL_CAVE_INTERIOR_NAME;
  interior.userData={wolfveilCaveInterior:true};

  // ---- 1. what is under the ground --------------------------------------
  const moved=[];
  let surfaceObjects=0;
  for(const child of [...group.children]){
    if(fixed.has(child)||child.isLight||child.isInstancedMesh){surfaceObjects++;continue;}
    const box=wolfveilCaveObjectBox(child);
    if(isWolfveilCaveBoxBuried(box,{heightAt,mouths,options}))moved.push(child);
    else surfaceObjects++;
  }
  // Same position, same rotation: the interior group sits exactly on the
  // cave group, so moving an object into it does not move it in the world.
  for(const child of moved)interior.add(child);
  group.add(interior);

  // ---- 2. identical props share one draw -------------------------------
  const before=staticProps.filter(mesh=>mesh?.parent).length;
  const instancing=instanceStaticMeshes(staticProps,{InstancedMesh,tag:'wolfveilCavePropBatch'});

  let enabled=true,shownDepth=0,lastReason='not updated yet';
  function decide({inside=false,player=null}={}){
    if(!enabled)return 'switched off';
    if(shownDepth>0)return 'full-map export';
    if(inside)return 'inside a cave';
    const x=Number(player?.x),y=Number(player?.y),z=Number(player?.z);
    // Nobody to hide it from (menus, spectating): draw it rather than guess.
    if(![x,y,z].every(Number.isFinite))return 'no player position';
    const ground=heightAt(x,z);
    if(!Number.isFinite(ground))return 'unknown ground';
    if(y<ground-options.playerBuriedMeters)return 'player is under the ground';
    return null;
  }
  let last={inside:false,player:null};
  function update(state=last){
    last={inside:Boolean(state?.inside),player:state?.player||null};
    const reason=decide(last);
    lastReason=reason||'player is on the surface';
    const show=reason!==null;
    if(interior.visible!==show)interior.visible=show;
    return show;
  }

  return {
    interior,instancing,
    /** Call whenever the player moves, enters or leaves a cave. */
    update,
    isInteriorShown(){return interior.visible!==false;},
    /** A/B switch: false draws the caves exactly as they were built. */
    setEnabled(next){
      enabled=Boolean(next);
      instancing.setEnabled(enabled);
      update();
      return enabled;
    },
    /** Keeps the interior drawn while `task` runs (the full-map exporter). */
    async withInteriorShown(task){
      shownDepth++;update();
      try{return await task();}
      finally{shownDepth=Math.max(0,shownDepth-1);update();}
    },
    stats(){
      const merged=instancing.stats();
      return {
        enabled,interiorShown:interior.visible!==false,reason:lastReason,
        objects:{underground:moved.length,surface:surfaceObjects},
        props:{before,merged:merged.replaced,batches:merged.batches,
          drawCallsSaved:merged.drawCallsSaved,leftAlone:merged.leftAlone},
      };
    },
    dispose(){instancing.dispose();},
  };
}
