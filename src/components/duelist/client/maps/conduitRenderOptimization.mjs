// Exact-dimension static box batching. No renderer ownership, scene unloading,
// geometry simplification, gameplay collision or per-frame work.
export function createConduitBoxCache(THREE){
  const cache=new Map();
  return {
    get(x,y,z){
      const key=[x,y,z].join('|');
      if(!cache.has(key))cache.set(key,new THREE.BoxGeometry(x,y,z));
      return cache.get(key);
    },
    get size(){return cache.size;},
    // The arena owns these geometries and disposes them once on scene teardown.
  };
}
export function conduitTextureResolution(quality,isColor=true){
  const base=quality==='low'?256:quality==='high'?1024:512;
  return !isColor&&quality!=='high'?base/2:base;
}
export function estimatedRGBA8MipBytes(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)return 0;
  let n=0;
  for(;;){n+=width*height*4;if(width===1&&height===1)return n;width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));}
}
export function batchConduitStaticBoxes(THREE,boxes,{exclude=[]}={}){
  const excluded=new Set(exclude),groups=new Map(),batches=[];
  let eligible=0,batched=0;
  for(const mesh of boxes){
    // Only explicit addBox products, local transforms preserved. Keep roof
    // handles, transparent meshes, custom draw ordering and special meshes.
    if(!mesh?.isMesh||mesh.isInstancedMesh||!mesh.parent||excluded.has(mesh)||!mesh.visible||
      mesh.children.length||Array.isArray(mesh.material)||mesh.material.transparent||
      mesh.material.alphaTest>0||mesh.renderOrder!==0||!mesh.matrixAutoUpdate||
      mesh.geometry.type!=='BoxGeometry'||mesh.customDepthMaterial||mesh.customDistanceMaterial)continue;
    const parent=mesh.parent;
    if(!groups.has(parent))groups.set(parent,new Map());
    const key=[mesh.geometry.uuid,mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.layers.mask,mesh.frustumCulled].join('|');
    const map=groups.get(parent);if(!map.has(key))map.set(key,[]);
    map.get(key).push(mesh);eligible++;
  }
  for(const [parent,map] of groups)for(const list of map.values()){
    if(list.length<3)continue;
    const first=list[0],batch=new THREE.InstancedMesh(first.geometry,first.material,list.length);
    batch.name='CON_StaticBoxBatch';
    batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
    batch.layers.mask=first.layers.mask;batch.frustumCulled=first.frustumCulled;
    list.forEach((m,i)=>{m.updateMatrix();batch.setMatrixAt(i,m.matrix);});
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();
    parent.add(batch);for(const m of list)parent.remove(m);
    batches.push(batch);batched+=list.length;
  }
  return {eligible,batched,batchCount:batches.length,removedMeshSubmissions:batched-batches.length,batches};
}
// CPU-side scene statistics, not actual GPU draw-call or allocation metrics.
export function conduitSceneInventory(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  let meshes=0,instances=0,triangles=0,shadowMeshSubmissions=0;
  root.traverse(o=>{
    if(!o.isMesh)return;
    meshes++;const count=o.isInstancedMesh?o.count:1;instances+=count;
    if(o.castShadow)shadowMeshSubmissions++;
    const g=o.geometry;geometries.add(g);
    const vertices=g.index?.count??g.attributes.position?.count??0;
    triangles+=Math.floor(vertices/3)*count;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);
    }
  });
  let textureRGBA8MipBytes=0;
  for(const t of textures)textureRGBA8MipBytes+=estimatedRGBA8MipBytes(t.image?.width,t.image?.height);
  return {meshes,instances,triangles,uniqueGeometries:geometries.size,materials:materials.size,textures:textures.size,textureRGBA8MipBytes,shadowMeshSubmissions};
}
