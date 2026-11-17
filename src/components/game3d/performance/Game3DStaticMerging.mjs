// Game 3D static merging: thousands of small motionless parts -> one draw
// per material.
//
// Scenery assembled in code from many small pieces (a town of beams, tiles,
// posts and bricks) hands the browser one draw call per piece. This module
// bakes every piece that never moves into a few large meshes, one per
// material, so the same triangles with the same materials reach the screen
// in a handful of draws.
//
// How it stays safe without knowing the scenery's code:
//  - It only merges anonymous, untagged, opaque meshes with plain vertex data
//    (see staticMergingObstacle). Everything else is left exactly as built.
//  - Before merging, the caller plays the scenery's own animation while
//    `markMoved()` watches: whatever moved is never merged.
//  - The caller also triggers everything the scenery hides on its own (roofs
//    cut away indoors, far buildings) while `noteToggles()` watches. Parts
//    are only merged with parts that are hidden and shown together, and each
//    merged mesh follows its owner's switches in the same frame.
//  - The originals stay in the scene, switched to "not drawn" (render layer
//    mask 0, the same switch the avatar draw-call merger uses), so their
//    owner can keep writing to them. A few are re-checked every frame; one
//    that later moves or is hidden by its owner is handed back and drawn
//    as its own mesh again (self-healing).
//  - `setEnabled(false)` restores the scene exactly as it was built.
//
// No Three.js import: the caller passes the constructors it needs.

const noRaycast=()=>{};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const LIT=['isMeshStandardMaterial','isMeshPhysicalMaterial','isMeshBasicMaterial',
  'isMeshLambertMaterial','isMeshPhongMaterial','isMeshToonMaterial'];
// Vertex data this module knows how to bake, with the item size it expects.
const ATTRIBUTE_SIZES={position:[3],normal:[3],uv:[2],uv1:[2],uv2:[2],color:[3,4]};
export const GAME3D_MERGED_BATCH_FLAG='game3dMergedBatch';

/** Why a mesh must be left alone, or null when it may be merged. */
export function staticMergingObstacle(mesh){
  if(!mesh?.isMesh)return 'not a mesh';
  if(mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.isBatchedMesh)return 'already a special mesh';
  // A name or a tag means some other system may look this mesh up later.
  if(mesh.name)return 'named';
  if(mesh.userData&&Object.keys(mesh.userData).length)return 'tagged';
  if(own(mesh,'onBeforeRender')||own(mesh,'onAfterRender')||
     mesh.customDepthMaterial||mesh.customDistanceMaterial)return 'has its own render hook';
  if(mesh.layers&&mesh.layers.mask!==1)return 'on a special render layer';
  const material=mesh.material;
  if(!material||Array.isArray(material))return 'several materials';
  // Merged see-through parts could no longer be sorted back to front.
  if(material.transparent||Number(material.opacity??1)<1)return 'see-through';
  if(!LIT.some(flag=>material[flag]))return 'custom shader';
  const geometry=mesh.geometry;
  if(!geometry?.attributes?.position)return 'no geometry';
  if(geometry.morphAttributes&&Object.keys(geometry.morphAttributes).length)return 'morph targets';
  const range=geometry.drawRange;
  if(range&&(range.start>0||Number.isFinite(range.count)))return 'draws only part of its geometry';
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const sizes=ATTRIBUTE_SIZES[name];
    if(!sizes||!sizes.includes(attribute?.itemSize)||!attribute.array||
       attribute.isInterleavedBufferAttribute)return 'unusual vertex data';
    if((name==='position'||name==='normal')&&!(attribute.array instanceof Float32Array))
      return 'unusual vertex data';
  }
  if(!geometry.attributes.position.count)return 'no geometry';
  return null;
}

const IDENTITY=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
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
const determinant=e=>e[0]*(e[5]*e[10]-e[6]*e[9])-e[4]*(e[1]*e[10]-e[2]*e[9])+e[8]*(e[1]*e[6]-e[2]*e[5]);

/**
 * Bake meshes into one geometry description, in the space of `home` matrices.
 * Pure arithmetic: returns typed arrays, builds no Three.js object.
 * @param {Array<{mesh:object,home:number[]}>} entries all sharing one vertex layout
 */
export function bakeMergedGeometry(entries){
  const layout=Object.entries(entries[0].mesh.geometry.attributes)
    .map(([name,attribute])=>({name,itemSize:attribute.itemSize,
      normalized:Boolean(attribute.normalized),Type:attribute.array.constructor}));
  let vertices=0,indices=0;
  for(const {mesh} of entries){
    const count=mesh.geometry.attributes.position.count;
    vertices+=count;
    indices+=mesh.geometry.index?mesh.geometry.index.count:count;
  }
  const arrays=Object.fromEntries(layout.map(part=>[part.name,new part.Type(vertices*part.itemSize)]));
  const index=vertices>65535?new Uint32Array(indices):new Uint16Array(indices);
  let vertexOffset=0,indexOffset=0;
  for(const {mesh,home:m} of entries){
    const geometry=mesh.geometry,count=geometry.attributes.position.count;
    const det=determinant(m),flip=det<0?-1:1;
    // Normals follow the cofactor matrix (inverse transpose without the divide).
    const c=[m[5]*m[10]-m[6]*m[9],m[6]*m[8]-m[4]*m[10],m[4]*m[9]-m[5]*m[8],
      m[9]*m[2]-m[10]*m[1],m[10]*m[0]-m[8]*m[2],m[8]*m[1]-m[9]*m[0],
      m[1]*m[6]-m[2]*m[5],m[2]*m[4]-m[0]*m[6],m[0]*m[5]-m[1]*m[4]];
    for(const part of layout){
      const from=geometry.attributes[part.name].array,to=arrays[part.name];
      const size=part.itemSize,start=vertexOffset*size;
      if(part.name==='position'){
        for(let i=0;i<count;i++){
          const x=from[i*3],y=from[i*3+1],z=from[i*3+2],o=start+i*3;
          to[o]=m[0]*x+m[4]*y+m[8]*z+m[12];
          to[o+1]=m[1]*x+m[5]*y+m[9]*z+m[13];
          to[o+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
        }
      }else if(part.name==='normal'){
        for(let i=0;i<count;i++){
          const x=from[i*3],y=from[i*3+1],z=from[i*3+2],o=start+i*3;
          let nx=c[0]*x+c[3]*y+c[6]*z,ny=c[1]*x+c[4]*y+c[7]*z,nz=c[2]*x+c[5]*y+c[8]*z;
          const length=Math.hypot(nx,ny,nz)||1;
          nx*=flip/length;ny*=flip/length;nz*=flip/length;
          to[o]=nx;to[o+1]=ny;to[o+2]=nz;
        }
      }else to.set(from.subarray(0,count*size),start);
    }
    const source=geometry.index?.array;
    const total=source?geometry.index.count:count;
    for(let i=0;i+2<total;i+=3){
      const a=source?source[i]:i,b=source?source[i+1]:i+1,d=source?source[i+2]:i+2;
      index[indexOffset+i]=a+vertexOffset;
      // A mirrored part is wound the other way round: swap to keep it facing out.
      index[indexOffset+i+1]=(flip<0?d:b)+vertexOffset;
      index[indexOffset+i+2]=(flip<0?b:d)+vertexOffset;
    }
    vertexOffset+=count;indexOffset+=total-total%3;
  }
  return {layout,arrays,index:indexOffset===index.length?index:index.subarray(0,indexOffset),
    vertices,triangles:indexOffset/3};
}

/**
 * @param {object} config
 * @param {object} config.root  scenery root; batches become its children
 * @param {Function} config.BufferGeometry  THREE.BufferGeometry
 * @param {Function} config.BufferAttribute THREE.BufferAttribute
 * @param {Function} config.Mesh            THREE.Mesh
 * @param {(batch:object)=>void} [config.accelerateRaycast] e.g. build a BVH
 */
export function createStaticMeshMerger({root,BufferGeometry,BufferAttribute,Mesh,
  minMeshes=2,tag=GAME3D_MERGED_BATCH_FLAG,accelerateRaycast=null,
  auditPerFrame=240,tolerance=1e-4,hiddenGraceSeconds=2}={}){
  if(!root?.add||!Array.isArray(root.children))throw new TypeError('A scenery root is required');
  if([BufferGeometry,BufferAttribute,Mesh].some(type=>typeof type!=='function'))
    throw new TypeError('BufferGeometry, BufferAttribute and Mesh constructors are required');

  const entries=new Map();   // mesh -> {mesh,home,state,batch,hiddenFor}
  const wasVisible=new Map();// every node under the root -> visible at the snapshot
  const toggles=new Set();   // nodes the owner was seen hiding or showing
  const leftAlone=new Map(); // reason -> count
  const batches=new Map();   // key -> {key,mesh,members:Set<entry>,dirty}
  let enabled=true,built=false,cursor=0,queue=[],handedBack=0;
  const note=reason=>leftAlone.set(reason,(leftAlone.get(reason)||0)+1);
  const isBatch=object=>Boolean(object?.userData?.[GAME3D_MERGED_BATCH_FLAG]);

  // Placement relative to the root, composed from the local matrices so a
  // root that itself moves (or a stale world matrix) never looks like motion.
  function relative(node,cache){
    if(node===root)return IDENTITY;
    const known=cache.get(node);
    if(known)return known;
    if(!node.parent)return null;
    const above=relative(node.parent,cache);
    if(!above)return null;
    if(node.matrixAutoUpdate!==false)node.updateMatrix?.();
    const local=node.matrix?.elements;
    if(!local)return null;
    const matrix=multiply(above,local);
    cache.set(node,matrix);
    return matrix;
  }
  function shown(node){
    for(let at=node;at&&at!==root;at=at.parent)if(at.visible===false)return false;
    return true;
  }
  const moved=(a,b)=>{
    for(let i=0;i<16;i++)if(Math.abs(a[i]-b[i])>tolerance*Math.max(1,Math.abs(b[i])))return true;
    return false;
  };

  /** Phase 1: remember where every mergeable mesh stands right now. */
  function snapshot(){
    if(built)return 0;
    entries.clear();leftAlone.clear();wasVisible.clear();toggles.clear();
    const cache=new Map();
    const walk=node=>{
      if(isBatch(node))return;
      if(node!==root)wasVisible.set(node,node.visible!==false);
      if(node!==root&&node.isMesh){
        const obstacle=staticMergingObstacle(node);
        if(obstacle)note(obstacle);
        else if(!shown(node))note('hidden by its owner');
        else{
          const home=relative(node,cache);
          if(home&&home.every(Number.isFinite))entries.set(node,{mesh:node,home,state:'static',
            batch:null,hiddenFor:0,geometry:node.geometry,
            version:node.geometry.attributes.position.version|0});
          else note('unreadable placement');
        }
      }
      for(const child of node.children||[])walk(child);
    };
    walk(root);
    return entries.size;
  }
  /** Phase 2 (repeatable): whatever moved since the snapshot is dynamic. */
  function markMoved(){
    if(built)return 0;
    const cache=new Map();
    let found=0;
    for(const entry of entries.values()){
      if(entry.state!=='static')continue;
      const now=relative(entry.mesh,cache);
      if(!now||moved(now,entry.home)){entry.state='dynamic';note('moves');found++;}
    }
    return found;
  }
  /**
   * Phase 2 (repeatable): remember every node whose owner has just hidden or
   * shown it. Call it while a roof is cut away, a far building is culled...
   */
  function noteToggles(){
    if(built)return 0;
    const before=toggles.size;
    for(const [node,visible] of wasVisible)
      if((node.visible!==false)!==visible)toggles.add(node);
    return toggles.size-before;
  }
  // The owner's switches above a mesh, nearest first: parts sharing them are
  // hidden and shown together.
  function scopeOf(mesh){
    const scope=[];
    for(let at=mesh;at&&at!==root;at=at.parent)if(toggles.has(at))scope.push(at);
    return scope;
  }

  function keyOf(mesh,ids){
    const id=object=>{if(!ids.has(object))ids.set(object,ids.size);return ids.get(object);};
    const geometry=mesh.geometry;
    const layout=Object.entries(geometry.attributes).map(([name,attribute])=>
      name+attribute.itemSize+(attribute.normalized?'n':'')+attribute.array.constructor.name).sort().join(',');
    return [id(mesh.material),mesh.castShadow?1:0,mesh.receiveShadow?1:0,mesh.renderOrder||0,
      mesh.frustumCulled===false?0:1,own(mesh,'raycast')?'decor':'solid',layout,
      scopeOf(mesh).map(id).join('+')].join('|');
  }
  function fill(batch){
    const members=[...batch.members];
    const baked=bakeMergedGeometry(members);
    const geometry=new BufferGeometry();
    for(const part of baked.layout)
      geometry.setAttribute(part.name,new BufferAttribute(baked.arrays[part.name],part.itemSize,part.normalized));
    geometry.setIndex(new BufferAttribute(baked.index,1));
    geometry.computeBoundingBox?.();geometry.computeBoundingSphere?.();
    const first=members[0].mesh;
    if(!batch.mesh){
      const mesh=new Mesh(geometry,first.material);
      // No name: name-based material and effect rules see it like its parts.
      mesh.name='';
      mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;
      mesh.renderOrder=first.renderOrder||0;mesh.frustumCulled=first.frustumCulled!==false;
      mesh.userData={[GAME3D_MERGED_BATCH_FLAG]:true,[tag]:true,renderOnly:true};
      batch.mesh=mesh;
      root.add(mesh);
    }else{
      const old=batch.mesh.geometry;
      batch.mesh.geometry=geometry;
      old?.dispose?.();
    }
    batch.mesh.userData.meshes=members.length;
    batch.mesh.userData.triangles=baked.triangles;
    if(own(first,'raycast'))batch.mesh.raycast=noRaycast;
    else accelerateRaycast?.(batch.mesh);
    batch.dirty=false;
  }
  function dropBatch(batch){
    for(const entry of batch.members){entry.mesh.layers.mask=1;entry.batch=null;}
    batch.members.clear();
    if(batch.mesh){batch.mesh.parent?.remove(batch.mesh);batch.mesh.geometry?.dispose?.();batch.mesh=null;}
    batches.delete(batch.key);
  }

  /** Phase 3: merge everything that stayed still. */
  function build(){
    if(built||!enabled)return 0;
    const ids=new Map(),groups=new Map();
    for(const entry of entries.values()){
      if(entry.state!=='static')continue;
      const key=keyOf(entry.mesh,ids);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(entry);
    }
    for(const [key,members] of groups){
      if(members.length<Math.max(2,minMeshes)){
        for(const entry of members){entry.state='single';note('one of a kind');}
        continue;
      }
      const batch={key,mesh:null,members:new Set(members),dirty:false,
        scope:scopeOf(members[0].mesh),shown:true};
      fill(batch);
      follow(batch);
      for(const entry of members){entry.batch=batch;entry.state='merged';entry.mesh.layers.mask=0;}
      batches.set(key,batch);
    }
    built=true;queue=[];cursor=0;
    return batches.size;
  }

  // A merged mesh is drawn exactly when its owner's switches say so.
  function follow(batch){
    const show=batch.scope.every(node=>node.visible!==false);
    if(show!==batch.shown){batch.shown=show;batch.mesh.visible=show;}
  }
  function handBack(entry,reason){
    const batch=entry.batch;
    if(!batch)return;
    batch.members.delete(entry);batch.dirty=true;
    entry.batch=null;entry.state='dynamic';entry.mesh.layers.mask=1;
    note(reason);handedBack++;
  }
  /** Every frame: re-check a few originals; hand back any that changed. */
  function update(dt=1/60){
    if(!built||!enabled||!batches.size)return;
    for(const batch of batches.values())follow(batch);
    if(cursor>=queue.length){queue=[...entries.values()].filter(entry=>entry.state==='merged');cursor=0;}
    const stop=Math.min(queue.length,cursor+auditPerFrame);
    // One full pass takes this long; hidden time is counted pass by pass.
    const passSeconds=Math.max(dt,dt*Math.ceil(queue.length/Math.max(1,auditPerFrame)));
    const cache=new Map();
    for(;cursor<stop;cursor++){
      const entry=queue[cursor];
      if(entry.state!=='merged'||!entry.batch)continue;
      const mesh=entry.mesh;
      if(!mesh.parent||!relative(mesh,cache)){handBack(entry,'removed by its owner');continue;}
      if(mesh.geometry!==entry.geometry||mesh.material!==entry.batch.mesh.material||
         (mesh.geometry.attributes.position.version|0)!==entry.version){
        handBack(entry,'changed by its owner');continue;
      }
      if(moved(relative(mesh,cache),entry.home)){handBack(entry,'moves');continue;}
      // Hidden together with its batch (a known switch, or the whole area
      // being unloaded): nothing to hand back.
      if(entry.batch.mesh.visible===false||!shown(entry.batch.mesh)){entry.hiddenFor=0;continue;}
      if(shown(mesh))entry.hiddenFor=0;
      else if((entry.hiddenFor+=passSeconds)>=hiddenGraceSeconds)handBack(entry,'hidden by its owner');
    }
    for(const batch of [...batches.values()]){
      if(!batch.dirty)continue;
      if(batch.members.size<Math.max(2,minMeshes))dropBatch(batch);
      else{fill(batch);batch.mesh.visible=batch.shown;}
    }
  }

  function restore(){
    for(const batch of [...batches.values()]){
      for(const entry of batch.members)entry.state='static';
      dropBatch(batch);
    }
    built=false;
  }

  return {
    snapshot,markMoved,noteToggles,build,update,
    get batches(){return [...batches.values()].map(batch=>batch.mesh);},
    /** A/B switch: false restores the scenery exactly as built. */
    setEnabled(next){
      enabled=Boolean(next);
      if(!enabled)restore();else build();
      return enabled;
    },
    stats(){
      let merged=0,triangles=0;
      for(const batch of batches.values()){merged+=batch.members.size;triangles+=batch.mesh.userData.triangles;}
      return {
        enabled,built,candidates:entries.size,merged,batches:batches.size,
        drawCallsSaved:merged-batches.size,triangles,handedBack,
        switches:toggles.size,
        leftAlone:Object.fromEntries(leftAlone),
      };
    },
    dispose(){restore();entries.clear();enabled=false;},
  };
}
