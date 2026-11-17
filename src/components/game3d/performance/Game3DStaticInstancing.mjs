// Game 3D static instancing: many identical, motionless meshes -> one draw.
//
// A browser pays for every separate object it draws, far more than for the
// triangles inside it. Scenery built from a few shapes placed hundreds of
// times (cave ribs, boulders, posts, braziers) therefore costs hundreds of
// draw calls for a few thousand triangles. This module replaces each set of
// meshes that share the same geometry and the same material with one
// instanced mesh that draws all of them at once. Nothing is re-modelled: the
// same triangles appear in the same places with the same material.
//
// It only ever touches meshes that are safe to merge and leaves everything
// else exactly as its owner built it (see staticInstancingObstacle). It has
// no Three.js import: the caller passes the InstancedMesh constructor, so the
// rules can be tested anywhere.

const noRaycast=()=>{};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const LIT=['isMeshStandardMaterial','isMeshPhysicalMaterial','isMeshBasicMaterial',
  'isMeshLambertMaterial','isMeshPhongMaterial','isMeshToonMaterial'];

/** Why a mesh must be left alone, or null when it can join a batch. */
export function staticInstancingObstacle(mesh){
  if(!mesh?.isMesh)return 'not a mesh';
  if(mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.isBatchedMesh)return 'already a special mesh';
  if(!mesh.parent)return 'not in the scene';
  if(mesh.visible===false)return 'hidden by its owner';
  if((mesh.children||[]).length)return 'carries other objects';
  // A name or a tag means some other system may look this mesh up later.
  if(mesh.name)return 'named';
  if(mesh.userData&&Object.keys(mesh.userData).length)return 'tagged';
  // Only decoration that already opted out of clicks and ground rays.
  if(!own(mesh,'raycast'))return 'can be clicked or stood on';
  if(own(mesh,'onBeforeRender')||own(mesh,'onAfterRender')||mesh.customDepthMaterial)
    return 'has its own render hook';
  const material=mesh.material;
  if(!material||Array.isArray(material))return 'several materials';
  // Merged see-through objects could no longer be sorted back to front.
  if(material.transparent||Number(material.opacity??1)<1)return 'see-through';
  if(!LIT.some(flag=>material[flag]))return 'custom shader';
  const geometry=mesh.geometry;
  if(!geometry?.attributes?.position)return 'no geometry';
  if(geometry.morphAttributes&&Object.keys(geometry.morphAttributes).length)return 'morph targets';
  return null;
}

// Column-major 4x4: a negative determinant is a mirrored object, which an
// instanced batch would draw inside out.
const determinant=e=>e[0]*(e[5]*e[10]-e[6]*e[9])-e[4]*(e[1]*e[10]-e[2]*e[9])+e[8]*(e[1]*e[6]-e[2]*e[5]);

function sortIntoGroups(meshes,skipped){
  const byParent=new Map(),seen=new Set(),groups=[];
  const skip=reason=>skipped.set(reason,(skipped.get(reason)||0)+1);
  for(const mesh of meshes){
    if(!mesh||seen.has(mesh))continue;
    seen.add(mesh);
    const obstacle=staticInstancingObstacle(mesh);
    if(obstacle){skip(obstacle);continue;}
    mesh.updateMatrix?.();
    const e=mesh.matrix?.elements;
    if(!e||e.length<16||!Array.prototype.every.call(e,Number.isFinite)){skip('unreadable placement');continue;}
    if(!(determinant(e)>1e-12)){skip('mirrored or flattened');continue;}
    const flags=[mesh.castShadow?1:0,mesh.receiveShadow?1:0,mesh.layers?.mask??1,
      mesh.renderOrder||0,mesh.frustumCulled===false?0:1].join('|');
    let level=byParent;
    for(const key of [mesh.parent,mesh.geometry,mesh.material,flags]){
      if(!level.has(key))level.set(key,key===flags?[]:new Map());
      level=level.get(key);
    }
    if(!level.length)groups.push(level);
    level.push(mesh);
  }
  return groups;
}

/**
 * Replace every set of mergeable meshes that share parent, geometry and
 * material with one instanced mesh.
 *
 * @param {Iterable<object>} meshes  candidates; anything unsafe is skipped
 * @param {object} options
 * @param {Function} options.InstancedMesh  THREE.InstancedMesh
 * @param {number} [options.minInstances=2] smaller sets are left as they are
 * @param {string} [options.tag]            userData flag set on each batch
 */
export function instanceStaticMeshes(meshes,{InstancedMesh,minInstances=2,
  tag='game3dStaticBatch'}={}){
  if(typeof InstancedMesh!=='function')
    throw new TypeError('An InstancedMesh constructor is required');
  const candidates=[...new Set(meshes||[])];
  const skipped=new Map();
  const built=[]; // {batch, parent, members}
  let active=false;

  function build(){
    if(active)return;
    skipped.clear();
    for(const members of sortIntoGroups(candidates,skipped)){
      if(members.length<Math.max(2,minInstances)){
        skipped.set('one of a kind',(skipped.get('one of a kind')||0)+members.length);
        continue;
      }
      const first=members[0],parent=first.parent;
      const batch=new InstancedMesh(first.geometry,first.material,members.length);
      const out=batch.instanceMatrix.array;
      members.forEach((mesh,i)=>{
        const e=mesh.matrix.elements;
        for(let k=0;k<16;k++)out[i*16+k]=e[k];
      });
      batch.instanceMatrix.needsUpdate=true;
      // The batch keeps the (empty) name of the meshes it stands in for, so
      // name-based material and effect rules treat it exactly as before.
      batch.name=first.name||'';
      batch.castShadow=first.castShadow;
      batch.receiveShadow=first.receiveShadow;
      if(batch.layers&&first.layers)batch.layers.mask=first.layers.mask;
      batch.renderOrder=first.renderOrder||0;
      batch.frustumCulled=first.frustumCulled!==false;
      batch.raycast=noRaycast;
      batch.userData={[tag]:true,instances:members.length,renderOnly:true};
      parent.add(batch);
      for(const mesh of members)parent.remove(mesh);
      // Culling must cover every instance, not only the template shape.
      batch.computeBoundingBox?.();
      batch.computeBoundingSphere?.();
      built.push({batch,parent,members});
    }
    active=true;
  }
  function restore(){
    if(!active)return;
    for(const {batch,parent,members} of built.splice(0)){
      const home=batch.parent||parent;
      home.remove(batch);
      batch.dispose?.();
      for(const mesh of members)home.add(mesh);
    }
    active=false;
  }
  build();

  return {
    get active(){return active;},
    get batches(){return built.map(entry=>entry.batch);},
    /** Plain numbers for reports: what was merged and what was left alone. */
    stats(){
      const replaced=built.reduce((total,entry)=>total+entry.members.length,0);
      return {
        active,candidates:candidates.length,replaced,batches:built.length,
        drawCallsSaved:replaced-built.length,
        leftAlone:Object.fromEntries(skipped),
      };
    },
    /** A/B switch: false puts every original mesh back, true merges again. */
    setEnabled(next){if(next)build();else restore();return active;},
    restore,
    /** Teardown with the scene: frees the batches' instance buffers. */
    dispose(){
      for(const {batch} of built.splice(0)){batch.parent?.remove(batch);batch.dispose?.();}
      active=false;candidates.length=0;
    },
  };
}
