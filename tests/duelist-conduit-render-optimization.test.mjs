import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitBoxCache,batchConduitStaticBoxes,conduitSceneInventory,conduitTextureResolution,estimatedRGBA8MipBytes} from '../src/components/duelist/client/maps/conduitRenderOptimization.mjs';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';

test('exact-size geometry sharing, local transforms, flags and exclusions',()=>{
  const root=new THREE.Group(),parent=new THREE.Group(),other=new THREE.Group();
  root.add(parent,other);parent.position.set(8,-5,1);parent.rotation.y=.75;
  const cache=createConduitBoxCache(THREE),geo=cache.get(2,.5,1),mat=new THREE.MeshStandardMaterial(),transparent=new THREE.MeshStandardMaterial({transparent:true});
  assert.equal(cache.get(2,.5,1),geo);assert.notEqual(cache.get(2,1,.5),geo);
  const boxes=[];
  function add(group,material=mat,shadow=true){const m=new THREE.Mesh(geo,material);m.position.set(boxes.length,1,2);m.rotation.y=.25*boxes.length;m.castShadow=shadow;m.receiveShadow=true;group.add(m);boxes.push(m);return m;}
  for(let i=0;i<4;i++)add(parent);
  const roof=add(parent),glass=add(parent,transparent),unshadowed=add(parent,mat,false),separate=add(other);
  root.updateMatrixWorld(true);
  const expected=boxes.slice(0,4).map(m=>m.matrixWorld.clone());
  const before=conduitSceneInventory(root),result=batchConduitStaticBoxes(THREE,boxes,{exclude:[roof]});
  root.updateMatrixWorld(true);
  assert.equal(result.batchCount,1);assert.equal(result.batched,4);assert.equal(result.removedMeshSubmissions,3);
  const batch=result.batches[0];
  assert.equal(batch.castShadow,true);assert.equal(batch.receiveShadow,true);
  assert.ok([roof,glass,unshadowed,separate].every(m=>m.parent));
  const matrix=new THREE.Matrix4();
  for(let i=0;i<4;i++){batch.getMatrixAt(i,matrix);matrix.premultiply(batch.matrixWorld);assert.ok(matrix.elements.every((v,j)=>Math.abs(v-expected[i].elements[j])<1e-6));}
  const after=conduitSceneInventory(root);
  assert.equal(after.instances,before.instances);assert.equal(after.triangles,before.triangles);assert.equal(after.meshes,before.meshes-3);
  batch.dispose();geo.dispose();cache.get(2,1,.5).dispose();mat.dispose();transparent.dispose();
});

test('only low and medium bump textures shrink; RGBA8 estimates include full mip chain',()=>{
  for(const [quality,color,bump] of [['low',256,128],['medium',512,256],['high',1024,1024]]){
    assert.equal(conduitTextureResolution(quality,true),color);
    assert.equal(conduitTextureResolution(quality,false),bump);
  }
  assert.equal(estimatedRGBA8MipBytes(4,4),84);
  assert.equal(estimatedRGBA8MipBytes(4,2),44);
  assert.equal(estimatedRGBA8MipBytes(0,4),0);
});

test('actual arena A/B keeps all collision and visual triangle instances while reducing static submissions',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let before,after;
  try{
    before=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false,optimizeRendering:false});
    after=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    const a=before.renderOptimization.afterBatch,b=after.renderOptimization.afterBatch;
    console.log('CONDUIT_RENDER_INVENTORY '+JSON.stringify({baseline:a,optimized:b,batches:after.renderOptimization.batchCount,removed:after.renderOptimization.removedMeshSubmissions}));
    assert.equal(b.instances,a.instances);assert.equal(b.triangles,a.triangles);
    assert.ok(b.meshes<a.meshes);assert.ok(b.uniqueGeometries<a.uniqueGeometries);
    assert.ok(b.shadowMeshSubmissions<a.shadowMeshSubmissions);
    assert.ok(b.textureRGBA8MipBytes<a.textureRGBA8MipBytes);
    assert.equal(a.materials,b.materials);assert.equal(a.textures,b.textures);
    assert.equal(b.meshes,a.meshes-after.renderOptimization.removedMeshSubmissions);
    for(const key of ['obbs','ramps','discs','annuli','cylinders','shaftOpenings','jumpPads'])assert.deepEqual(after.world[key],before.world[key],key);
    assert.deepEqual(after.spawnCandidates,before.spawnCandidates);
    assert.deepEqual(after.pickups,before.pickups);
    assert.deepEqual([...after.navGraph.nodes],[...before.navGraph.nodes]);
    assert.equal(after.buildingRoofs.length,4);
    assert.ok(after.buildingRoofs.every(m=>m.parent&&!m.isInstancedMesh));
    const geo=after.root.getObjectByName('CON_StaticBoxBatch').geometry;
    let disposed=0;geo.addEventListener('dispose',()=>disposed++);
    after.updateVisuals(1);after.dispose();after.dispose();
    assert.equal(disposed,1);
  }finally{before?.dispose();after?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
