import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  WOLFVEIL_STREAM_REGIONS,WOLFVEIL_STREAM_GATEWAYS,
  regionAtWolfveilWorld,stableWolfveilStreamRegion,
  nearWolfveilStreamRegions,crossedWolfveilGateway,
} from '../src/components/game3d/wolfveil/streaming/WolfveilFourRegionPlan.mjs';
import {createWolfveilFourRegionRuntime}
  from '../src/components/game3d/wolfveil/streaming/WolfveilFourRegionRuntime.mjs';

const local=(x,z)=>({x,z:z+70});
test('four real Wolfveil zones, including market, western forest, eastern river, north highlands',()=>{
  assert.equal(WOLFVEIL_STREAM_REGIONS.length,4);
  assert.equal(regionAtWolfveilWorld(local(0,-70)),'town');
  assert.equal(regionAtWolfveilWorld(local(-240,65)),'west');
  assert.equal(regionAtWolfveilWorld(local(350,-40)),'east');
  assert.equal(regionAtWolfveilWorld(local(-105,330)),'north');
});
test('bridge and trail transitions are local +70m aligned, invisible and direction independent',()=>{
  assert.equal(WOLFVEIL_STREAM_GATEWAYS.length,5);
  assert.equal(crossedWolfveilGateway(local(119,-98),local(125,-98))?.id,'market_bridge');
  assert.equal(crossedWolfveilGateway(local(125,35),local(120,35))?.id,'residential_footbridge');
  assert.equal(crossedWolfveilGateway(local(118,205),local(128,205))?.id,'outer_trail_bridge');
  assert.equal(crossedWolfveilGateway(local(-185,65),local(-195,65))?.id,'cedar_forest_trail');
  assert.equal(crossedWolfveilGateway(local(4,233),local(4,246))?.id,'sanctuary_north_pass');
  assert.equal(crossedWolfveilGateway(local(0,0),local(340,0)),null);
});
test('prewarm the destination bank; hysteresis prevents bridge-boundary thrashing',()=>{
  assert.ok(nearWolfveilStreamRegions(local(80,-98)).includes('east'));
  assert.equal(stableWolfveilStreamRegion(local(125,-98),'town'),'town');
  assert.equal(stableWolfveilStreamRegion(local(141,-98),'town'),'east');
  assert.equal(stableWolfveilStreamRegion(local(117,-98),'east'),'east');
});
function buildWorld(){
  const group=new THREE.Group();
  group.position.z=70;
  group.name='WolfveilOriginalRoot';
  const geometry=new THREE.BoxGeometry(1,1,1);
  const material=new THREE.MeshStandardMaterial();
  const points=[[0,-70],[0,0],[15,20],[-240,65],[-310,90],
    [200,-98],[350,-40],[0,330],[-105,340]];
  const inst=new THREE.InstancedMesh(geometry,material,points.length);
  inst.name='SWV_Instanced_cedar';
  const matrix=new THREE.Matrix4();
  points.forEach(([x,z],i)=>{matrix.makeTranslation(x,0,z);inst.setMatrixAt(i,matrix);});
  inst.instanceMatrix.needsUpdate=true;
  group.add(inst);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());
  ground.name='SWV_RealWalkableContouredTerrain';
  group.add(ground);
  return {world:{group,meshes:[inst,ground]},original:inst,ground,geometry,material};
}
test('static GPU instance buffers load, prewarm, unload; original collision floor stays',()=>{
  const {world,original,ground,geometry,material}=buildWorld();
  const events=[];
  const runtime=createWolfveilFourRegionRuntime({world,position:local(0,-70),
    onTransition:event=>events.push(event),batchesPerFrame:1});
  assert.equal(runtime.getStats().loadedInstances,3);
  assert.equal(original.visible,false);
  assert.equal(ground.visible,true);
  for(let i=0;i<8;i++)runtime.update(local(80,-98));
  assert.ok(runtime.getStats().loadedRegions.includes('east'));
  runtime.update(local(119,-98));
  runtime.update(local(125,-98));
  assert.equal(runtime.getRegion(),'town');
  runtime.update(local(141,-98));
  assert.equal(runtime.getRegion(),'east');
  assert.ok(events.some(event=>event.gateway==='market_bridge'));
  runtime.update(local(350,-40));
  assert.deepEqual(runtime.getStats().loadedRegions,['east']);
  assert.equal(runtime.getStats().loadedInstances,2);
  assert.equal(ground.visible,true,'never stream away the real floor');
  runtime.dispose();
  assert.equal(original.visible,true);
  assert.equal(world.group.children.filter(n=>n.name.startsWith('WV_Stream_')).length,0);
  geometry.dispose();material.dispose();ground.geometry.dispose();ground.material.dispose();
});
test('full-map exports show original instances and hide chunks, then recover on failure',async()=>{
  const {world,original,ground,geometry,material}=buildWorld();
  const runtime=createWolfveilFourRegionRuntime({world,position:local(0,-70)});
  const sample=()=>({
    original:original.visible,
    clones:world.group.children.filter(obj=>obj.name.startsWith('WV_Stream_'))
      .map(obj=>obj.visible),
  });
  assert.equal(original.visible,false);
  const result=await runtime.withFullMapExport(async()=>sample());
  assert.equal(result.original,true);
  assert.deepEqual(result.clones,[false]);
  assert.equal(original.visible,false);
  await assert.rejects(runtime.withFullMapExport(async()=>{throw Error('export failed');}),/export failed/);
  assert.equal(original.visible,false);
  assert.ok(sample().clones.every(Boolean));
  runtime.dispose();
  geometry.dispose();material.dispose();ground.geometry.dispose();ground.material.dispose();
});
