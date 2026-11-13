// The plaza tree: removes the model's own blossom tree from its gold-ringed
// planter and stands the owner's ancient tree there instead.
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS} from './WolfveilOwnerLandscapeAssets.mjs';
import {WOLFVEIL_IMPORTED_TOWN_TREE as TREE} from './WolfveilImportedTownLayout.mjs';

/** Meshes of the town model that the old plaza tree was merged into. */
export const isWolfveilTownTreeMesh=name=>/^(pink|pinklight|wood)$/.test(name);

/** Drops the old tree's triangles; the rest of the merged mesh is untouched. */
export function removeWolfveilTownCentreTree(mesh){
  const geometry=mesh.geometry,position=geometry.attributes.position;
  const index=geometry.index?geometry.index.array:Uint32Array.from({length:position.count},(_,i)=>i);
  const kept=[],radius=mesh.name==='wood'?TREE.trunkSourceRadius:TREE.sourceRadius;
  for(let t=0;t<index.length;t+=3){
    let x=0,z=0;
    for(let k=0;k<3;k++){x+=position.getX(index[t+k])/3;z+=position.getZ(index[t+k])/3;}
    if(Math.hypot(x-TREE.sourceX,z-TREE.sourceZ)>radius)kept.push(index[t],index[t+1],index[t+2]);
  }
  geometry.setIndex(kept);
}

export function installWolfveilTownTree(parent){
  const asset=WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS.tree;
  const holder=new THREE.Group();holder.name='Wolfveil_Town_Plaza_Ancient_Tree';
  holder.position.set(TREE.x,TREE.y,TREE.z);
  parent.add(holder);
  let active=true;
  const textures=[];
  const place=(tree,texture)=>{
    if(!active)return;
    tree.traverse(node=>{
      if(!node.isMesh)return;
      node.castShadow=true;node.receiveShadow=true;
      for(const m of (Array.isArray(node.material)?node.material:[node.material])){
        if(!m)continue;
        m.side=THREE.DoubleSide;
        if(texture&&!m.map){m.map=texture;m.color?.set(0xffffff);m.needsUpdate=true;}
      }
    });
    tree.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(tree),size=box.getSize(new THREE.Vector3());
    if(!(size.y>0))return;
    // Stand the trunk, not the lopsided canopy, on the centre of the plaza.
    const centre=box.getCenter(new THREE.Vector3()),v=new THREE.Vector3();
    let trunkX=0,trunkZ=0,count=0;
    tree.traverse(node=>{
      if(!node.isMesh)return;
      const p=node.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);
        const up=(v.y-box.min.y)/size.y;
        if(up>.1&&up<.25){trunkX+=v.x;trunkZ+=v.z;count++;}
      }
    });
    tree.position.x-=count?trunkX/count:centre.x;tree.position.y-=box.min.y;
    tree.position.z-=count?trunkZ/count:centre.z;
    holder.scale.setScalar(Math.min(TREE.height/size.y,TREE.maxWidth/Math.max(size.x,size.z,1e-5)));
    holder.add(tree);
  };
  const load=texture=>new FBXLoader().load(asset.url,tree=>place(tree,texture),undefined,
    error=>console.warn('[Game 3D town] plaza tree failed to load',error));
  new THREE.TextureLoader().load(asset.basecolor,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);load(texture);
  },undefined,()=>load(null));
  return {dispose(){
    active=false;parent.remove(holder);
    holder.traverse(node=>{
      if(!node.isMesh)return;
      node.geometry?.dispose();
      for(const m of (Array.isArray(node.material)?node.material:[node.material]))m?.dispose();
    });
    for(const texture of textures)texture.dispose();
    holder.clear();
  }};
}