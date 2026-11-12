// PREVIEW-ONLY SOURCE SNAPSHOT from PR #1037 (unmerged WIP), 010371c8afc4edfaa3b58e9c51cd3d2cb37e0c03.
// Visual staging does not establish collision or production approval.
/**
 * Wolfveil Batch 01 / Scene 08: reversible volumetric South Gate art pass.
 * The picture is visual art direction, not a texture-plane terrain shortcut.
 * No new walkable surfaces, collision, terrain deformation, game awards,
 * triggers, lighting state, or quest objects are registered.
 */
import * as THREE from 'three';
// The same draft South Gate shapes are placed against the *preview* terrain.
// Do not sample the original Play terrain height here.
import {getScene08LocalAdditions,validateScene08Source} from './WolfveilPreviewScene08Coordinates.mjs';

function makeGateArtRenderer() {
const GRANITE = new THREE.MeshStandardMaterial({color:0x707b7a,roughness:.93,metalness:.02});
const GRANITE_DARK = new THREE.MeshStandardMaterial({color:0x404d55,roughness:.91,metalness:.04});
const GRANITE_LIGHT = new THREE.MeshStandardMaterial({color:0xa9ada5,roughness:.9});
const MOSS = new THREE.MeshStandardMaterial({color:0x4d7352,roughness:1});
const GOLD = new THREE.MeshStandardMaterial({color:0x99825a,roughness:.51,metalness:.42});
const CEDAR = new THREE.MeshStandardMaterial({color:0x4d3029,roughness:.77});
const ROOF = new THREE.MeshStandardMaterial({color:0x263749,roughness:.62});
const SPIRIT = new THREE.MeshStandardMaterial({
  color:0x81c3c9,emissive:0x26434d,emissiveIntensity:.38,roughness:.26,
});

function part(parent,name,geometry,material,position,scale=null,rotation=null) {
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;
  mesh.position.set(...position);
  if(scale)mesh.scale.set(...scale);
  if(rotation)mesh.rotation.set(...rotation);
  mesh.castShadow=material!==SPIRIT;
  mesh.receiveShadow=true;
  mesh.userData={decorativeOnly:true,nonCollider:true,referenceScene:'wolfveil-b01-scene08'};
  // Player/camera ground probes must continue to hit the original BVH.
  mesh.raycast=()=>{};
  parent.add(mesh);
  return mesh;
}
function box(parent,name,size,at,mat,rot=null) {
  return part(parent,name,new THREE.BoxGeometry(...size),mat,at,null,rot);
}
function sphere(parent,name,radius,at,scale,mat,segments=18) {
  return part(parent,name,new THREE.SphereGeometry(radius,segments,12),mat,at,scale);
}
function stonePlinth(root,prefix) {
  part(root,prefix+'-pedestal-foot',
    new THREE.CylinderGeometry(2.05,2.17,.38,12),GRANITE_DARK,[0,.19,0]);
  part(root,prefix+'-pedestal-base',
    new THREE.CylinderGeometry(1.89,1.98,.65,12),GRANITE,[0,.66,0]);
  part(root,prefix+'-pedestal-crown',
    new THREE.CylinderGeometry(1.86,1.92,.17,12),GRANITE_LIGHT,[0,1.055,0]);
  for(let n=0;n<8;n++) {
    const a=n*Math.PI/4;
    sphere(root,prefix+'-edge-moss-'+n,.26,
      [Math.cos(a)*1.79,.44,Math.sin(a)*1.79],[1,.20,.63],MOSS,10);
  }
}
/** Sculpted single-piece impression using volumetric stone components.
 * This is original preliminary geometry, not a claimed high-resolution GLB.
 */
function guardian(root,object,terrainY) {
  const prefix=object.assetId;
  const statue=new THREE.Group();
  statue.name=prefix;
  statue.userData={stableAssetId:prefix,sourceId:object.id,tileId:object.tileId,
    decorativeOnly:true,nonCollider:true,provisionalGeometry:true};
  statue.position.set(object.localX,terrainY(object.localX,object.localZ),object.localZ);
  statue.rotation.y=object.localX<0?-.13:.13;
  stonePlinth(statue,prefix);
  for(const side of [-1,1]) {
    sphere(statue,prefix+'-haunch-'+side,.79,[side*.73,2.13,.50],
      [.77,1.22,1.14],GRANITE);
    sphere(statue,prefix+'-front-leg-'+side,.41,[side*.62,1.77,-.80],
      [.8,1.85,1],GRANITE_LIGHT);
    for(let toe=0;toe<3;toe++)sphere(statue,prefix+'-paw-'+side+'-'+toe,.16,
      [side*.62+(toe-1)*.17,1.17,-1.11],[1,.52,1.85],GRANITE_LIGHT,12);
  }
  sphere(statue,prefix+'-torso',1.16,[0,3.18,.35],
    [1.22,1.38,.91],GRANITE,24);
  sphere(statue,prefix+'-neck',.78,[0,4.63,-.28],
    [.93,1.48,1],GRANITE_LIGHT,20);
  sphere(statue,prefix+'-jackal-head',.79,[0,5.66,-.55],
    [1,.98,1.05],GRANITE,24);
  sphere(statue,prefix+'-long-muzzle',.39,[0,5.42,-1.24],
    [.84,.65,1.65],GRANITE_LIGHT,16);
  sphere(statue,prefix+'-nose',.19,[0,5.32,-1.78],
    [1,.6,.78],GRANITE_DARK,14);
  for(const side of [-1,1]) {
    part(statue,prefix+'-ear-'+side,new THREE.ConeGeometry(.35,1.34,12),
      GRANITE_DARK,[side*.48,6.90,-.48],null,[0,0,-side*.09]);
    sphere(statue,prefix+'-eye-'+side,.10,[side*.47,5.73,-1.11],
      [1,.63,.38],SPIRIT,12);
    sphere(statue,prefix+'-collar-boss-'+side,.18,[side*.70,4.65,-.64],
      [1,.65,.45],GOLD,12);
  }
  part(statue,prefix+'-collar',new THREE.TorusGeometry(.76,.085,8,30),
    GOLD,[0,4.80,-.35],null,[Math.PI/2,0,0]);
  box(statue,prefix+'-chest-inlay',[.16,.66,.09],[0,4.21,-.99],GOLD);
  root.add(statue);
  return statue;
}
function outerTorii(root,object,terrainY) {
  const prefix=object.assetId;
  const torii=new THREE.Group();
  torii.name=prefix;
  torii.userData={stableAssetId:prefix,sourceId:object.id,tileId:object.tileId,
    decorativeOnly:true,nonCollider:true,provisionalGeometry:true};
  const x=object.localX,z=object.localZ,ground=terrainY(x,z);
  torii.position.set(x,ground,z);
  // Leave >9m between the posts, wider than the existing 6m public road.
  for(const side of [-1,1]) {
    const postX=side*5.13,relativeY=terrainY(x+postX,z)-ground;
    part(torii,prefix+'-post-'+side,
      new THREE.CylinderGeometry(.27,.42,6.32,12),
      CEDAR,[postX,relativeY+3.16,0]);
    part(torii,prefix+'-foot-'+side,
      new THREE.CylinderGeometry(.59,.65,.20,12),
      GRANITE_DARK,[postX,relativeY+.10,0]);
    box(torii,prefix+'-post-bracket-'+side,[1.02,.29,1.05],
      [postX,relativeY+6.17,0],GOLD);
  }
  box(torii,prefix+'-cross-beam',[10.9,.37,.65],[0,5.55,0],CEDAR);
  box(torii,prefix+'-upper-crown',[11,.63,1.05],[0,6.55,0],ROOF);
  box(torii,prefix+'-curved-lintel-middle',[5.4,.23,1.09],
    [0,6.92,0],ROOF);
  for(const side of [-1,1]) {
    box(torii,prefix+'-swept-tip-'+side,[2.25,.24,1.1],
      [side*4.3,6.87,0],ROOF,[0,0,side*.075]);
    box(torii,prefix+'-end-cap-'+side,[.27,.38,1.10],
      [side*5.42,6.58,0],GOLD);
  }
  box(torii,prefix+'-carved-center',[1.36,.73,.15],[0,5.58,-.40],GOLD);
  box(torii,prefix+'-inlay',[.81,.47,.06],[0,5.58,-.49],GRANITE_DARK);
  root.add(torii);
  return torii;
}

/**
 * Attach only when GameWorld3D explicitly opts in. All measurements remain
 * target design geometry; the older 19m entrance lintel is deliberately NOT
 * replaced because its actual mesh bounds have not been surveyed.
 *
 * Existing WolfveilBuilder disposal owns the group and all primitive
 * geometries. Materials are dedicated to this layer and do not own textures.
 */
function renderGateArt(world,{originOffsetZM=70,terrainHeight}={}) {
  if(!world?.mesh || !world?.group) throw new TypeError('Expected a WolfveilBuilder');
  validateScene08Source();
  if(typeof terrainHeight!=='function')throw new TypeError('Preview stage requires its own illustrative terrainHeight');
  const root=new THREE.Group();
  root.name='SWV_B01_S08_SouthGate_DecorativeGeometry';
  root.userData={decorativeOnly:true,nonCollider:true,source:'08_gate_detail.png',
    assetBatch:'B01',sceneNumber:8,collisionAuthority:false};
  const entries=getScene08LocalAdditions(originOffsetZM);
  const added=[];
  for(const object of entries) {
    const child=object.kind==='guardian'
      ?guardian(root,object,terrainHeight)
      :outerTorii(root,object,terrainHeight);
    added.push({assetId:child.userData.stableAssetId,sourceId:object.id,tileId:object.tileId});
  }
  world.mesh(root);
  // The source draft allocates shared primitive materials. Register them with
  // the existing WolfveilBuilder disposal ledger so preview re-entry does not
  // leak GPU material resources.
  world.ownedMaterials.push(GRANITE, GRANITE_DARK, GRANITE_LIGHT, MOSS, GOLD, CEDAR, ROOF, SPIRIT);
  return {root,added,unmodified:['P_GATE_BEAM'],decorativeOnly:true};
}
return renderGateArt;
}

// Each mounted scene owns independent PBR materials. Disposing one village
// cannot invalidate another preview or a later renderer re-entry.
export function addWolfveilScene08GateArt(world,options={}) {
  if(!world?.mesh || !world?.group)throw new TypeError('Expected a WolfveilBuilder');
  validateScene08Source();
  return makeGateArtRenderer()(world,options);
}
