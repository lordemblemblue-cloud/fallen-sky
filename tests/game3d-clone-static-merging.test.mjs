// Static merging: thousands of motionless parts become one draw per material,
// and anything that later moves is handed back. Runs without Three.js.
/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GAME3D_MERGED_BATCH_FLAG,bakeMergedGeometry,createStaticMeshMerger,staticMergingObstacle}
  from '../src/components/game3d/performance/Game3DStaticMerging.mjs';

class Node{
  constructor(name=''){
    this.name=name;this.children=[];this.parent=null;this.visible=true;this.userData={};
    this.position={x:0,y:0,z:0};this.scale={x:1,y:1,z:1};this.turn=0;
    this.matrix={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};this.layers={mask:1};
  }
  add(child){child.parent?.remove(child);child.parent=this;this.children.push(child);return this;}
  remove(child){
    const index=this.children.indexOf(child);
    if(index>=0){this.children.splice(index,1);child.parent=null;}
    return this;
  }
  at(x,y,z){this.position={x,y,z};return this;}
  sized(x,y=x,z=x){this.scale={x,y,z};return this;}
  updateMatrix(){
    const c=Math.cos(this.turn),s=Math.sin(this.turn),{x:sx,y:sy,z:sz}=this.scale;
    this.matrix.elements=[c*sx,0,-s*sx,0, 0,sy,0,0, s*sz,0,c*sz,0,
      this.position.x,this.position.y,this.position.z,1];
  }
}
class Attribute{
  constructor(array,itemSize,normalized=false){
    this.array=array;this.itemSize=itemSize;this.normalized=normalized;
    this.count=array.length/itemSize;this.version=0;
  }
}
class Geometry{
  constructor(){this.attributes={};this.index=null;this.disposed=false;this.bounded=false;}
  setAttribute(name,attribute){this.attributes[name]=attribute;return this;}
  setIndex(attribute){this.index=attribute;return this;}
  computeBoundingSphere(){this.bounded=true;}
  dispose(){this.disposed=true;}
}
// One triangle in the ground plane facing up: (0,0,0) (0,0,1) (1,0,0).
function triangle({indexed=true}={}){
  const geometry=new Geometry();
  geometry.setAttribute('position',new Attribute(new Float32Array([0,0,0, 0,0,1, 1,0,0]),3));
  geometry.setAttribute('normal',new Attribute(new Float32Array([0,1,0, 0,1,0, 0,1,0]),3));
  geometry.setAttribute('uv',new Attribute(new Float32Array([0,0, 0,1, 1,0]),2));
  if(indexed)geometry.setIndex(new Attribute(new Uint16Array([0,1,2]),1));
  return geometry;
}
const stone=()=>({isMeshStandardMaterial:true,opacity:1,transparent:false});
class Mesh extends Node{
  constructor(geometry,material){
    super();this.isMesh=true;this.geometry=geometry;this.material=material;
    this.castShadow=false;this.receiveShadow=false;this.renderOrder=0;this.frustumCulled=true;
  }
}
const types={BufferGeometry:Geometry,BufferAttribute:Attribute,Mesh};
const part=(parent,material,x,y,z)=>{const mesh=new Mesh(triangle(),material).at(x,y,z);parent.add(mesh);return mesh;};
const round=list=>[...list].map(value=>Math.round(value*1e6)/1e6+0);

test('only anonymous, opaque meshes with plain vertex data may be merged',()=>{
  const fresh=()=>new Mesh(triangle(),stone());
  assert.equal(staticMergingObstacle(fresh()),null);
  const withChild=fresh();withChild.add(new Node());
  assert.equal(staticMergingObstacle(withChild),null,'the original stays in the scene, so it may carry children');
  const cases=[
    [mesh=>{mesh.name='Door';},'named'],
    [mesh=>{mesh.userData.speed=1;},'tagged'],
    [mesh=>{mesh.material={...stone(),transparent:true};},'see-through'],
    [mesh=>{mesh.material={isShaderMaterial:true};},'custom shader'],
    [mesh=>{mesh.material=[stone()];},'several materials'],
    [mesh=>{mesh.isInstancedMesh=true;},'already a special mesh'],
    [mesh=>{mesh.layers.mask=2;},'on a special render layer'],
    [mesh=>{mesh.onBeforeRender=()=>{};},'has its own render hook'],
    [mesh=>{mesh.geometry.morphAttributes={position:[1]};},'morph targets'],
    [mesh=>{mesh.geometry.drawRange={start:0,count:3};},'draws only part of its geometry'],
    [mesh=>{mesh.geometry.setAttribute('aWind',new Attribute(new Float32Array(3),1));},'unusual vertex data'],
    [mesh=>{mesh.geometry.setAttribute('normal',new Attribute(new Int8Array(9),3,true));},'unusual vertex data'],
    [mesh=>{mesh.geometry.attributes.uv.isInterleavedBufferAttribute=true;},'unusual vertex data'],
    [mesh=>{mesh.geometry=new Geometry();},'no geometry'],
  ];
  for(const [change,reason] of cases){const mesh=fresh();change(mesh);assert.equal(staticMergingObstacle(mesh),reason);}
  assert.equal(staticMergingObstacle(new Node()),'not a mesh');
});

test('baking moves, turns, scales and mirrors each part into one vertex list',()=>{
  const move=[1,0,0,0, 0,1,0,0, 0,0,1,0, 10,2,-3,1];
  const quarter=[0,0,-1,0, 0,1,0,0, 1,0,0,0, 0,0,0,1];   // local +x -> world -z
  const squash=[2,0,0,0, 0,.5,0,0, 0,0,1,0, 0,0,0,1];
  const mirror=[-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const tilted=[1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1];    // local +y -> world +z
  const baked=bakeMergedGeometry([move,quarter,squash,mirror,tilted].map((home,i)=>(
    {mesh:new Mesh(triangle({indexed:i!==2}),stone()),home})));
  assert.equal(baked.vertices,15);assert.equal(baked.triangles,5);
  assert.ok(baked.index instanceof Uint16Array);
  const p=baked.arrays.position,n=baked.arrays.normal;
  assert.deepEqual(round(p.slice(0,9)),[10,2,-3, 10,2,-2, 11,2,-3]);
  assert.deepEqual(round(p.slice(9,18)),[0,0,0, 1,0,0, 0,0,-1]);
  assert.deepEqual(round(p.slice(18,27)),[0,0,0, 0,0,1, 2,0,0]);
  assert.deepEqual(round(p.slice(27,36)),[0,0,0, 0,0,1, -1,0,0]);
  // Normals stay unit length and perpendicular under a squash, and follow a tilt.
  assert.deepEqual(round(n.slice(18,21)),[0,1,0]);
  assert.deepEqual(round(n.slice(27,30)),[0,1,0],'a mirror must not turn the normal inside out');
  assert.deepEqual(round(n.slice(36,39)),[0,0,1]);
  assert.deepEqual([...baked.index],[0,1,2, 3,4,5, 6,7,8, 9,11,10, 12,13,14],
    'the mirrored part is wound the other way so it still faces out');
  assert.deepEqual(round(baked.arrays.uv.slice(6,12)),[0,0, 0,1, 1,0]);
  // Facing check from the winding itself: every baked triangle agrees with its normal.
  for(let t=0;t<5;t++){
    const [a,b,c]=[0,1,2].map(k=>[0,1,2].map(axis=>p[baked.index[t*3+k]*3+axis]));
    const u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);
    const face=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    const normal=[0,1,2].map(axis=>n[baked.index[t*3]*3+axis]);
    assert.ok(face[0]*normal[0]+face[1]*normal[1]+face[2]*normal[2]>0,'triangle '+t+' faces away from its normal');
  }
});

function buildTown(){
  const root=new Node('Town').at(0,5,70);
  const shops=new Node().at(10,0,0);root.add(shops);
  const sandstone=stone(),timber=stone();
  const walls=[[0,0,0],[2,0,0],[4,0,0]].map(p=>part(shops,sandstone,...p));
  walls[2].castShadow=true;                                 // different shadow flag: own batch
  const beams=[[0,3,0],[2,3,0]].map(p=>part(shops,timber,...p));
  const lantern=new Node().at(1,2,1);shops.add(lantern);
  const lanternParts=[part(lantern,timber,0,0,0),part(lantern,timber,0,-.3,0)];
  const door=part(shops,timber,1,0,2);                      // slides when the doors open
  const roofs=new Node();root.add(roofs);
  const tiles=[[0,6,0],[1,6,0],[2,6,0]].map(p=>part(roofs,sandstone,...p));
  const water=part(root,{...stone(),transparent:true},0,0,0);
  const sign=part(root,sandstone,5,1,5);sign.name='ShopSign';
  const decor=part(root,sandstone,6,0,6);decor.raycast=()=>{};
  const decor2=part(root,sandstone,7,0,6);decor2.raycast=()=>{};
  const accelerated=[];
  const merger=createStaticMeshMerger({root,...types,tag:'townBatch',auditPerFrame:100,
    accelerateRaycast:batch=>accelerated.push(batch)});
  return {root,shops,walls,beams,lantern,lanternParts,door,roofs,tiles,water,sign,decor,decor2,
    merger,accelerated,sandstone,timber};
}
const probe=(t,frames)=>{for(let i=0;i<frames;i++){t.lantern.turn=.03*Math.sin(i+1);t.merger.markMoved();}};

test('whatever stays still while the scenery animates is merged, one draw per material',()=>{
  const t=buildTown();
  assert.equal(t.merger.snapshot(),13);
  probe(t,3);
  t.door.position.z=3.7;t.merger.markMoved();t.door.position.z=2;   // doors opened and closed again
  assert.equal(t.merger.build(),3);
  const batches=t.merger.batches;
  // sandstone walls+tiles (5), timber beams (2), non-clickable decor (2).
  assert.deepEqual(batches.map(batch=>batch.userData.meshes).sort(),[2,2,5]);
  const big=batches.find(batch=>batch.userData.meshes===5);
  assert.equal(big.material,t.sandstone);assert.equal(big.parent,t.root);
  assert.equal(big.name,'');assert.equal(big.userData[GAME3D_MERGED_BATCH_FLAG],true);
  assert.equal(big.userData.townBatch,true);assert.equal(big.geometry.bounded,true);
  // Positions are relative to the town root: wall 2 stands at shops(10) + 2.
  assert.deepEqual(round(big.geometry.attributes.position.array.slice(9,12)),[12,0,0]);
  for(const mesh of [...t.walls.slice(0,2),...t.tiles,...t.beams,t.decor,t.decor2])
    assert.equal(mesh.layers.mask,0,'a merged original is no longer drawn');
  for(const mesh of [...t.lanternParts,t.door,t.water,t.sign,t.walls[2]]){
    assert.equal(mesh.layers.mask,1);assert.equal(mesh.parent!==null,true);
  }
  assert.equal(t.accelerated.length,2,'clickable batches get a fast ray test');
  assert.equal(typeof batches.find(batch=>batch.material===t.sandstone&&batch.userData.meshes===2).raycast,'function');
  assert.deepEqual(t.merger.stats(),{enabled:true,built:true,candidates:13,merged:9,batches:3,
    drawCallsSaved:6,triangles:9,handedBack:0,
    leftAlone:{'see-through':1,named:1,moves:3,'one of a kind':1}});
});

test('a part that later moves, changes or is removed is handed back and redrawn',()=>{
  const t=buildTown();t.merger.snapshot();probe(t,2);t.merger.build();
  const solid=batch=>!Object.prototype.hasOwnProperty.call(batch,'raycast');
  const big=()=>t.merger.batches.find(batch=>batch.material===t.sandstone&&solid(batch));
  const first=big().geometry;
  t.merger.update(1/60);
  assert.equal(t.merger.stats().handedBack,0,'nothing changed: nothing is handed back');
  t.tiles[0].position.y=9;                     // a roof tile starts to move
  t.merger.update(1/60);
  assert.equal(t.tiles[0].layers.mask,1);
  assert.equal(big().userData.meshes,4);
  assert.equal(first.disposed,true,'the old merged geometry is freed');
  assert.equal(big().geometry.attributes.position.count,12);
  t.tiles[1].material=stone();                 // repainted by its owner
  t.walls[0].geometry.attributes.position.version++; // reshaped in place
  t.merger.update(1/60);t.merger.update(1/60);
  assert.equal(t.tiles[1].layers.mask,1);assert.equal(t.walls[0].layers.mask,1);
  assert.equal(big().userData.meshes,2);
  // The timber batch holds two beams and the door: delete one, slide another.
  t.shops.remove(t.beams[0]);t.door.position.z=3.7;
  t.merger.update(1/60);t.merger.update(1/60);
  assert.equal(t.door.layers.mask,1);
  assert.equal(t.beams[1].layers.mask,1,'a batch of one is dissolved');
  assert.equal(t.merger.batches.length,2,'sandstone and decoration remain');
  assert.equal(t.merger.stats().handedBack,5);
});

test('hidden by its owner is handed back; a whole area being unloaded is not',()=>{
  const t=buildTown();t.merger.snapshot();t.merger.build();
  const frames=seconds=>{for(let i=0;i<seconds*10;i++)t.merger.update(.1);};
  // The area loader hides batch and parts together when the town unloads.
  for(const node of [...t.merger.batches,...t.tiles,...t.walls])node.visible=false;
  frames(5);
  assert.equal(t.merger.stats().handedBack,0);
  for(const node of [...t.merger.batches,...t.tiles,...t.walls])node.visible=true;
  // The owner hides the roofs (setRoofsVisible(false)): a blink is tolerated...
  t.roofs.visible=false;frames(1);
  assert.equal(t.merger.stats().handedBack,0);
  t.roofs.visible=true;frames(1);t.roofs.visible=false;
  // ...but not two seconds of it.
  frames(3);
  assert.equal(t.merger.stats().handedBack,3);
  for(const tile of t.tiles)assert.equal(tile.layers.mask,1);
  assert.equal(t.merger.stats().leftAlone['hidden by its owner'],3);
});

test('the A/B switch restores the scenery exactly as built and merges again on request',()=>{
  const t=buildTown();t.merger.snapshot();t.merger.build();
  const before=t.root.children.length;
  assert.equal(t.merger.setEnabled(false),false);
  assert.equal(t.root.children.length,before-3);
  for(const mesh of [...t.walls,...t.tiles,...t.beams,t.decor])assert.equal(mesh.layers.mask,1);
  assert.equal(t.merger.stats().merged,0);
  t.merger.update(.1);
  assert.equal(t.merger.setEnabled(true),true);
  assert.equal(t.merger.stats().merged,12);
  t.merger.dispose();
  assert.equal(t.merger.batches.length,0);
  assert.throws(()=>createStaticMeshMerger({root:t.root}),/constructors are required/);
  assert.throws(()=>createStaticMeshMerger({...types}),/scenery root/);
});

const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('material effects ignore merged batches; the merger needs no Three.js',()=>{
  const blaze=source('src/components/game3d/render/BlazeOfGrassWorld.mjs');
  assert.equal((blaze.match(/userData\?\.game3dMergedBatch/g)||[]).length,2,
    'a merged batch must neither protect nor receive a material effect');
  assert.doesNotMatch(source('src/components/game3d/performance/Game3DStaticMerging.mjs'),/from ['"]three['"]/);
});
