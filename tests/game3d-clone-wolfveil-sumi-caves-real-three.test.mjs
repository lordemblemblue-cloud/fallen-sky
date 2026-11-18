// The owner's cave kit under the real Three.js: every piece builds, bakes to a
// handful of draw calls, and stays inside its triangle budget. Skipped where
// Three.js is not installed; the workflow installs it.
import test from 'node:test';
import assert from 'node:assert/strict';

/* global console */
let THREE=null;
try{THREE=await import('three');}catch{THREE=null;}
const skip=THREE?false:'Three.js is not installed here';

// A canvas that accepts any drawing: the kit paints its textures on these.
function fakeDocument(){
  const context=canvas=>new Proxy({canvas},{
    get(target,key){
      if(key in target)return target[key];
      if(key==='getImageData'||key==='createImageData')
        return (x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(1,(w||1)*(h||1)*4)),width:w,height:h});
      if(key==='createLinearGradient'||key==='createRadialGradient'||key==='createPattern')return ()=>({addColorStop(){}});
      if(key==='measureText')return ()=>({width:0});
      return ()=>{};
    },
    set(target,key,value){target[key]=value;return true;}});
  return {createElement:()=>{const canvas={width:300,height:150,style:{}};let made=null;
    canvas.getContext=()=>made||(made=context(canvas));return canvas;}};
}
const count=object=>{
  let meshes=0,triangles=0,lights=0;
  object.traverse(node=>{
    if(node.isLight)lights++;
    if(!node.isMesh)return;
    meshes++;
    triangles+=(node.geometry.index?node.geometry.index.count:node.geometry.attributes.position.count)/3;
  });
  return {meshes,triangles,lights};
};
const n=value=>Math.round(value).toLocaleString('en-US');

test('the owner\'s hallway as written is far too heavy; the light one is not',{skip},async()=>{
  const {createSumiCorridorKit}=await import('../src/components/game3d/wolfveil/caves/SumiCorridorKit.js');
  const {createLightSumiCorridorKit}=await import('../src/components/game3d/wolfveil/caves/SumiCaveLightKit.js');
  const asWritten=count(createSumiCorridorKit({THREE,document:fakeDocument()}).createHallwayStandaloneModule());
  const light=count(createLightSumiCorridorKit({THREE,document:fakeDocument()}).createHallwayStandaloneModule());
  console.log('24 m hallway as written: '+n(asWritten.meshes)+' meshes, '+n(asWritten.triangles)+' triangles; light: '+
    n(light.meshes)+' meshes, '+n(light.triangles)+' triangles');
  assert.ok(asWritten.triangles>100000,'as written: '+asWritten.triangles);
  assert.ok(light.triangles<2500,'light: '+light.triangles);
  assert.ok(asWritten.triangles/light.triangles>50);
});

test('every piece of the kit builds light and bakes to a handful of draw calls',{skip},async()=>{
  const {createLightSumiCorridorKit,bakeSumiPiece}=await import('../src/components/game3d/wolfveil/caves/SumiCaveLightKit.js');
  const kit=createLightSumiCorridorKit({THREE,document:fakeDocument()});
  const pieces=[
    ['hallway','createHallwayStandaloneModule',2500,14],
    ['hallway with vault','createHallwayAttachedModule',16000,30],
    ['T-junction','createDetachedTJunctionModule',7000,16],
    ['cave and canyon','createDetachedCaveCanyonModule',48000,30],
    ['sunken sanctuary','createDetachedSunkenSanctuaryCaveModule',58000,90],
  ];
  let total=0;
  for(const [name,method,triangleBudget,drawBudget] of pieces){
    const group=kit[method]();
    group.updateMatrixWorld(true);
    const before=new THREE.Box3().setFromObject(group),built=count(group);
    const baked=bakeSumiPiece(kit,group,{THREE,name});
    const after=count(baked.object);
    console.log(name+': built '+n(built.meshes)+' meshes, '+n(built.triangles)+' triangles, '+built.lights+' lights; baked '+
      baked.stats.drawCalls+' draw calls, '+n(baked.stats.triangles)+' triangles, '+baked.stats.movingMeshes+' moving meshes');
    total+=baked.stats.triangles;
    assert.equal(after.meshes,baked.stats.drawCalls,name+': what is left in the piece is what the bake reports');
    assert.equal(after.triangles,baked.stats.triangles);
    assert.equal(after.lights,0,name+': lights are listed, not left in the piece');
    assert.equal(baked.lights.length,built.lights);
    assert.ok(baked.stats.triangles<=triangleBudget,name+' triangles: '+baked.stats.triangles);
    assert.ok(baked.stats.triangles<=built.triangles,'baking never adds triangles');
    assert.ok(baked.stats.drawCalls<=drawBudget,name+' draw calls: '+baked.stats.drawCalls);
    assert.ok(baked.stats.drawCalls<built.meshes/4,name+' is merged');
    // The baked piece occupies the space the built piece did.
    baked.object.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(baked.object);
    for(const axis of ['x','y','z']){
      assert.ok(Math.abs(box.min[axis]-before.min[axis])<.02,name+' moved on '+axis);
      assert.ok(Math.abs(box.max[axis]-before.max[axis])<.02,name+' moved on '+axis);
    }
    baked.object.traverse(node=>{
      if(!node.isMesh||!node.userData.sumiBaked)return;
      const {position,normal,uv}=node.geometry.attributes;
      assert.equal(normal.count,position.count);assert.equal(uv.count,position.count);
      assert.equal(node.castShadow,false);
      assert.ok(!node.material.bumpMap,'no bump maps underground');
      assert.ok(node.material.metalness<=.5,'gold and silver hold their colour without reflections');
    });
  }
  console.log('all five pieces, baked: '+n(total)+' triangles; walls painted: '+kit.light.walls+' ('+n(kit.light.wallMeters)+' m)');
  assert.ok(total<170000,'all five pieces: '+total);
  // What the owner's file animates is still there to animate.
  assert.ok(kit.gyroRings.length>0&&kit.waterfallColumns.length>0,'the sanctuary keeps its rings and waterfalls');
  assert.equal(kit.light.pictures.size,4,'one wall picture for each wall height in the kit');
});

test('the hallway along the cave tunnels is one small baked piece',{skip},async()=>{
  const {buildWolfveilSumiHalls}=await import('../src/components/game3d/wolfveil/caves/WolfveilSumiCaveHalls.js');
  const {planWolfveilSumiHalls}=await import('../src/components/game3d/wolfveil/caves/WolfveilSumiHallPlan.mjs');
  const halls=buildWolfveilSumiHalls({THREE,document:fakeDocument()});
  console.log('cave hallway: '+halls.stats.runs+' runs, '+halls.stats.meters+' m; built '+n(halls.stats.meshesBefore)+' meshes, '+
    n(halls.stats.trianglesBefore)+' triangles; baked '+halls.stats.drawCalls+' draw calls, '+n(halls.stats.triangles)+' triangles');
  assert.equal(halls.stats.runs,planWolfveilSumiHalls().runs.length);
  assert.ok(halls.stats.drawCalls<=12,'draw calls: '+halls.stats.drawCalls);
  assert.ok(halls.stats.triangles<14000,'triangles: '+halls.stats.triangles);
  assert.equal(halls.stats.lights,0);
  assert.equal(halls.stats.movingMeshes,0);
  halls.object.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(halls.object);
  assert.ok(box.min.y>-8.4&&box.max.y<-3.5,'between the cave floor and its ceiling: '+box.min.y.toFixed(2)+' to '+box.max.y.toFixed(2));
  assert.ok(box.min.x>-50.5&&box.max.x<44&&box.min.z>-148&&box.max.z<-21,'inside the tunnels\' footprint');
  let painted=0;
  halls.object.traverse(node=>{
    if(!node.isMesh)return;
    assert.equal(typeof node.raycast,'function');
    if(node.material.map?.isDataTexture)painted++;
  });
  assert.equal(painted,1,'every wall of the hallway is one painted batch');
  halls.dispose();
});
