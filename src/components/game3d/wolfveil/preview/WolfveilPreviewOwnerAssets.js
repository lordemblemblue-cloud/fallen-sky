import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TextureLoader } from 'three';
import { COMPACT_TOWN, WOLFVEIL_MEADOW } from './WolfveilCompactTownDesign.mjs';

// Original creator-owned assets uploaded to Atom X Eve's existing Base44
// asset library. Do NOT use these as entire terrain meshes or copy into Play.
export const WOLFVEIL_OWNER_PREVIEW_ASSETS=Object.freeze({
  ancientTree:'https://media.base44.com/files/public/6876751a602125f45f1861b9/f05e0d662_ancient_tree_3d_model.fbx',
  grass:'https://media.base44.com/files/public/6876751a602125f45f1861b9/d18181d28_realistics_grass_06.glb',
  plants:'https://media.base44.com/files/public/6876751a602125f45f1861b9/25be82c39_stylized_plant_pack.glb',
  dirtTexture:'https://media.base44.com/images/public/6876751a602125f45f1861b9/07252ce5b_Realistic_Fantasy_Dirt_Terrain_Tile-1.png',
});
const countTriangles=mesh=>mesh.geometry?.index
  ?mesh.geometry.index.count/3
  :(mesh.geometry?.attributes?.position?.count||0)/3;
function staticGeometry(mesh){
  mesh.updateWorldMatrix(true,false);
  const geom=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geom.computeBoundingBox();
  let box=geom.boundingBox,dim=box.getSize(new THREE.Vector3());
  // Some user-supplied Tripo GLBs are Z-up despite the glTF Y-up convention.
  if(dim.z>dim.y*1.4&&dim.z>dim.x*.7){
    geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI/2));
    geom.computeBoundingBox();box=geom.boundingBox;dim=box.getSize(new THREE.Vector3());
  }
  geom.translate(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
  geom.computeBoundingSphere();
  return {geometry:geom,width:Math.max(dim.x,dim.z,0.01),height:Math.max(dim.y,.01)};
}
function treePlacements(){
  const placements=[];
  const zones=[
    {x:-310,z:55,r:165,n:26},
    {x:-270,z:-250,r:175,n:22},
    {x:8,z:90,r:140,n:20},
  ];
  for(const [zoneIndex,zone] of zones.entries()){
    for(let i=0;i<zone.n;i++){
      const a=i*2.3999632297+zoneIndex*.93,r=zone.r*Math.sqrt((i+.5)/zone.n);
      const x=zone.x+Math.cos(a)*r,z=zone.z+Math.sin(a)*r;
      // Leave meadow path, houses, town exit approaches and river unobstructed.
      if(x>COMPACT_TOWN.minX-16&&x<COMPACT_TOWN.maxX+16&&
          z>COMPACT_TOWN.minZ-16&&z<COMPACT_TOWN.maxZ+16)continue;
      if(x<WOLFVEIL_MEADOW.minX||x>520||z< -570||z>535)continue;
      const riverX=123+21*Math.sin((z+60)/105);
      if(Math.abs(x-riverX)<23)continue;
      placements.push({x,z,height:13+(i%8)*.82,rotation:i*2.11});
    }
  }
  return placements.slice(0,60);
}
function instancedGeometry(world,source,material,places,prefix,height,heightAt){
  const {geometry,height:sourceHeight}=staticGeometry(source);
  const mesh=new THREE.InstancedMesh(geometry,material,places.length);
  const dummy=new THREE.Object3D();
  places.forEach((place,i)=>{
    const scale=height/sourceHeight * (place.height||height)/height;
    dummy.position.set(place.x,heightAt(place.x,place.z)+.04,place.z);
    dummy.rotation.set(0,place.rotation||0,0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true;
  mesh.computeBoundingSphere();
  mesh.castShadow=false;mesh.receiveShadow=true;
  mesh.name=prefix;mesh.userData={creatorProvided:true,visualOnly:true,nonAuthoritative:true};
  world.group.add(mesh);
  return mesh;
}
/**
 * Loads original user models into independent editing-preview scene only.
 * The procedural meadow stays inexpensive and wind-responsive. Do not
 * repeat the 6552-triangle high-detail grass GLB thousands of times.
 */
export function installWolfveilOwnerPreviewAssets(world,workstreamPreviewHeight,onStatus=()=>{}){
  let disposed=false;
  const added=[];
  const status={tree:'loading',grass:'loading',plants:'loading',soil:'loading',treeCount:0,grassCount:0,plantCount:0};
  const update=(key,value)=>{status[key]=value;if(!disposed)onStatus({...status});};
  const loadTree=async()=>{
    try{
      const fbx=await new FBXLoader().loadAsync(WOLFVEIL_OWNER_PREVIEW_ASSETS.ancientTree);
      if(disposed)return;
      fbx.updateMatrixWorld(true);
      const source=[];
      fbx.traverse(node=>{if(node.isMesh&&node.geometry)source.push(node);});
      if(source.length!==1)throw new Error('Tree requires one recoverable static mesh');
      const mesh=source[0];
      const places=treePlacements();
      if(!places.length)throw new Error('No safe tree placements');
      const mat=mesh.material?.map||mesh.material?.color
        ?mesh.material:new THREE.MeshStandardMaterial({color:0x667b5c,roughness:.9});
      const created=instancedGeometry(world,mesh,mat,places,'WV_OWNER_AncientTree_FBX_Instanced',12,workstreamPreviewHeight);
      added.push(created);
      const fallback=world.group.getObjectByName('WV_WIP_ProceduralTree_Fallback');
      if(fallback)fallback.visible=false;
      status.treeCount=places.length;
      // Keep fallback trees for background forest: only real FBX close to
      // the player is approved; missing source bark JPG remains a QA concern.
      update('tree','loaded');
    }catch(e){update('tree','fallback ('+String(e?.message||e).slice(0,90)+')');}
  };
  const loadGrass=async()=>{
    try{
      const gltf=await new GLTFLoader().loadAsync(WOLFVEIL_OWNER_PREVIEW_ASSETS.grass);
      if(disposed)return;
      gltf.scene.updateMatrixWorld(true);
      const meshes=[];gltf.scene.traverse(obj=>{if(obj.isMesh&&obj.geometry)meshes.push(obj);});
      const source=meshes.sort((a,b)=>countTriangles(a)-countTriangles(b))[0];
      if(!source)throw new Error('No grass mesh');
      const patches=[[-180,-174],[-244,-210],[-310,-260],[-340,-310],[-425,-190]];
      const placements=patches.map(([x,z],i)=>({x,z,height:1.4,rotation:i*1.3}));
      const inst=instancedGeometry(world,source,source.material,placements,'WV_OWNER_HighDetail_Grass_Reference',1.4,workstreamPreviewHeight);
      added.push(inst);status.grassCount=placements.length;update('grass','loaded');
    }catch(e){update('grass','fallback ('+String(e?.message||e).slice(0,90)+')');}
  };
  const loadPlants=async()=>{
    try{
      const gltf=await new GLTFLoader().loadAsync(WOLFVEIL_OWNER_PREVIEW_ASSETS.plants);
      if(disposed)return;
      gltf.scene.updateMatrixWorld(true);
      const meshes=[];gltf.scene.traverse(obj=>{if(obj.isMesh&&obj.geometry)meshes.push(obj);});
      // User supplied pack contains several meshes; use only two smallest
      // instead of replicating the 10k+ triangle plants in a web MMO.
      const candidates=meshes.filter(obj=>countTriangles(obj)<=2000)
        .sort((a,b)=>countTriangles(a)-countTriangles(b)).slice(0,2);
      if(!candidates.length)throw new Error('No reasonably lightweight plant mesh');
      for(const [index,source] of candidates.entries()){
        const placements=[];
        for(let i=0;i<14;i++){
          const x=-165-(i%7)*39,z=-150-Math.floor(i/7)*110-index*10;
          placements.push({x,z,height:.6+(i%3)*.13,rotation:i*.97});
        }
        const inst=instancedGeometry(world,source,source.material,placements,
          'WV_OWNER_Plant_Pack_Separated_'+index,.8,workstreamPreviewHeight);
        added.push(inst);status.plantCount+=placements.length;
      }
      update('plants','loaded');
    }catch(e){update('plants','fallback ('+String(e?.message||e).slice(0,90)+')');}
  };
  const loadSoil=async()=>{
    try {
      const texture=await new TextureLoader().loadAsync(WOLFVEIL_OWNER_PREVIEW_ASSETS.dirtTexture);
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.repeat.set(35,38);
      texture.anisotropy=4;
      const terrain=world.group.getObjectByName('WV_30_Scene_Workstream_Terrain_BLOCKOUT');
      if(!terrain||!terrain.material){texture.dispose();throw Error('No preview terrain material');}
      terrain.material.map=texture;
      terrain.material.needsUpdate=true;
      update('soil','loaded');
    }catch(e){update('soil','fallback ('+String(e?.message||e).slice(0,90)+')');}
  };
  const ready=Promise.allSettled([loadTree(),loadGrass(),loadPlants(),loadSoil()]);
  // Let the existing world dispose() walk all mounted resources; removing them
  // early would otherwise leak GPU geometries and images.
  return {status,ready,dispose(){disposed=true;}};
}