// Wolfveil caves: buried parts are only drawn underground, and identical
// props share one draw. Runs without Three.js: small stand-in classes follow
// the same contract (children, matrix.elements, geometry.boundingBox).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {instanceStaticMeshes,staticInstancingObstacle}
  from '../src/components/game3d/performance/Game3DStaticInstancing.mjs';
import {WOLFVEIL_CAVE_DRAW_BUDGET,WOLFVEIL_CAVE_INTERIOR_NAME,installWolfveilCaveDrawBudget,
  isWolfveilCaveBoxBuried,wolfveilCaveObjectBox}
  from '../src/components/game3d/wolfveil/WolfveilCaveDrawBudget.mjs';

class Node{
  constructor(name=''){
    this.name=name;this.children=[];this.parent=null;this.visible=true;this.userData={};
    this.position={x:0,y:0,z:0};this.scale={x:1,y:1,z:1};this.turn=0; // yaw, radians
    this.matrix={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
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
class Group extends Node{constructor(){super();this.isGroup=true;}}
const unitGeometry=()=>({attributes:{position:{count:24}},
  boundingBox:{min:{x:-1,y:-1,z:-1},max:{x:1,y:1,z:1}}});
const stone=()=>({isMeshStandardMaterial:true,opacity:1,transparent:false});
class Mesh extends Node{
  constructor(geometry,material){
    super();this.isMesh=true;this.geometry=geometry;this.material=material;
    this.castShadow=false;this.receiveShadow=true;this.layers={mask:1};
    this.renderOrder=0;this.frustumCulled=true;
  }
  decorative(){this.raycast=()=>{};return this;}
}
class Instanced extends Mesh{
  constructor(geometry,material,count){
    super(geometry,material);this.isInstancedMesh=true;this.count=count;
    this.instanceMatrix={array:new Float32Array(count*16),needsUpdate:false};
    this.bounded=false;this.disposed=false;
  }
  computeBoundingSphere(){this.bounded=true;}
  dispose(){this.disposed=true;}
}
const prop=(parent,geometry,material,x,y,z)=>{
  const mesh=new Mesh(geometry,material).decorative().at(x,y,z);parent.add(mesh);return mesh;
};

// ------------------------------------------------------- static instancing
test('only motionless, anonymous decoration may be merged',()=>{
  const root=new Node('root'),geometry=unitGeometry(),material=stone();
  const good=prop(root,geometry,material,0,0,0);
  assert.equal(staticInstancingObstacle(good),null);
  const cases=[
    [mesh=>{mesh.name='Lever';},'named'],
    [mesh=>{mesh.userData.quest=1;},'tagged'],
    [mesh=>{delete mesh.raycast;},'can be clicked or stood on'],
    [mesh=>{mesh.visible=false;},'hidden by its owner'],
    [mesh=>{mesh.add(new Node());},'carries other objects'],
    [mesh=>{mesh.material={...stone(),transparent:true};},'see-through'],
    [mesh=>{mesh.material={...stone(),opacity:.5};},'see-through'],
    [mesh=>{mesh.material={isShaderMaterial:true};},'custom shader'],
    [mesh=>{mesh.material=[stone(),stone()];},'several materials'],
    [mesh=>{mesh.isSkinnedMesh=true;},'already a special mesh'],
    [mesh=>{mesh.onBeforeRender=()=>{};},'has its own render hook'],
    [mesh=>{mesh.geometry={attributes:{position:{}},morphAttributes:{position:[]}};},'morph targets'],
    [mesh=>{root.remove(mesh);},'not in the scene'],
  ];
  for(const [change,reason] of cases){
    const mesh=prop(root,geometry,material,1,0,0);change(mesh);
    assert.equal(staticInstancingObstacle(mesh),reason);
  }
  assert.equal(staticInstancingObstacle(new Node()),'not a mesh');
});

test('props with the same shape and material become one draw, in the same places',()=>{
  const root=new Node('caves'),rib=unitGeometry(),crate=unitGeometry();
  const basalt=stone(),timber=stone();
  const ribs=[[0,-10,0],[4,-10,0],[8,-11,2]].map(([x,y,z])=>prop(root,rib,basalt,x,y,z).sized(2,3,1));
  ribs[1].turn=Math.PI/2;ribs[2].castShadow=false;
  const crates=[[1,-9,1],[2,-9,1]].map(([x,y,z])=>prop(root,crate,timber,x,y,z));
  const only=prop(root,crate,basalt,5,-9,5);                 // one of a kind
  const mirrored=prop(root,rib,basalt,6,-9,6).sized(-1,1,1); // would draw inside out
  const lever=prop(root,rib,basalt,7,-9,7);lever.name='Lever';
  const result=instanceStaticMeshes([...ribs,...crates,only,mirrored,lever,ribs[0]],
    {InstancedMesh:Instanced,tag:'caveBatch'});

  assert.equal(result.batches.length,2);
  const [ribBatch,crateBatch]=result.batches;
  assert.equal(ribBatch.count,3);assert.equal(crateBatch.count,2);
  assert.equal(ribBatch.geometry,rib);assert.equal(ribBatch.material,basalt);
  assert.equal(ribBatch.parent,root);
  assert.equal(ribBatch.name,'','a batch must not introduce a name that material rules react to');
  assert.equal(ribBatch.userData.caveBatch,true);
  assert.equal(ribBatch.receiveShadow,true);assert.equal(ribBatch.castShadow,false);
  assert.equal(ribBatch.bounded,true,'culling bounds must cover every instance');
  assert.equal(ribBatch.instanceMatrix.needsUpdate,true);
  assert.equal(typeof ribBatch.raycast,'function');
  ribs.forEach((mesh,i)=>{
    assert.equal(mesh.parent,null,'the original is no longer drawn');
    assert.deepEqual([...ribBatch.instanceMatrix.array.slice(i*16,i*16+16)],
      mesh.matrix.elements.map(Math.fround));
  });
  // Rotated a quarter turn: local +x now points along -z.
  assert.ok(Math.abs(ribBatch.instanceMatrix.array[16+2]+2)<1e-6);
  for(const mesh of [only,mirrored,lever])assert.equal(mesh.parent,root);
  assert.deepEqual(result.stats(),{active:true,candidates:8,replaced:5,batches:2,drawCallsSaved:3,
    leftAlone:{'one of a kind':1,'mirrored or flattened':1,named:1}});
});

test('different parents, shadow flags or layers never share a batch',()=>{
  const a=new Node('a'),b=new Node('b'),geometry=unitGeometry(),material=stone();
  const meshes=[prop(a,geometry,material,0,0,0),prop(a,geometry,material,1,0,0),
    prop(b,geometry,material,2,0,0),prop(b,geometry,material,3,0,0),
    prop(a,geometry,material,4,0,0),prop(a,geometry,material,5,0,0)];
  meshes[4].castShadow=meshes[5].castShadow=true;
  const result=instanceStaticMeshes(meshes,{InstancedMesh:Instanced});
  assert.deepEqual(result.batches.map(batch=>[batch.parent.name,batch.count,batch.castShadow]),
    [['a',2,false],['b',2,false],['a',2,true]]);
});

test('the A/B switch puts every original mesh back and merges again on request',()=>{
  const root=new Node('caves'),geometry=unitGeometry(),material=stone();
  const meshes=[0,1,2,3].map(i=>prop(root,geometry,material,i,0,0));
  const result=instanceStaticMeshes(meshes,{InstancedMesh:Instanced});
  const [batch]=result.batches;
  assert.equal(root.children.length,1);
  assert.equal(result.setEnabled(false),false);
  assert.equal(batch.disposed,true);assert.equal(batch.parent,null);
  assert.deepEqual(root.children,meshes);
  assert.equal(result.stats().replaced,0);
  assert.equal(result.setEnabled(true),true);
  assert.equal(root.children.length,1);assert.equal(root.children[0].count,4);
  result.dispose();
  assert.equal(root.children.length,0,'teardown removes the batches with the scene');
  assert.throws(()=>instanceStaticMeshes(meshes,{}),/InstancedMesh constructor/);
});

// ------------------------------------------------- what counts as buried
test('bounds follow position, size, turn and nesting',()=>{
  const holder=new Group().at(10,-20,5);
  const mesh=new Mesh(unitGeometry(),stone()).at(3,0,0).sized(2,1,4);
  mesh.turn=Math.PI/2;holder.add(mesh);
  const box=wolfveilCaveObjectBox(holder);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' vs '+b);
  // Turned a quarter: the 2 m half-width lies along z, the 4 m half-depth along x.
  near(box.minX,9);near(box.maxX,17);near(box.minY,-21);near(box.maxY,-19);
  near(box.minZ,3);near(box.maxZ,7);
  const sprite=new Node();sprite.isSprite=true;sprite.at(0,-5,0).sized(2,1,1);
  assert.deepEqual(wolfveilCaveObjectBox(sprite),
    {minX:-1.5,maxX:1.5,minY:-6.5,maxY:-3.5,minZ:-1.5,maxZ:1.5});
  assert.equal(wolfveilCaveObjectBox(new Group()),null,'nothing to measure');
  assert.equal(wolfveilCaveObjectBox(new Instanced(unitGeometry(),stone(),2)),null,
    'instanced decoration is never guessed at');
});

test('buried means: wholly under the lowest turf above it and away from every mouth',()=>{
  const flat=()=>10,slope=x=>x; // ground rises to the east
  const box={minX:0,maxX:6,minY:-4,maxY:8.9,minZ:0,maxZ:6};
  const rule={heightAt:flat,mouths:[[100,100]]};
  assert.equal(isWolfveilCaveBoxBuried(box,rule),true);
  assert.equal(isWolfveilCaveBoxBuried({...box,maxY:9.2},rule),false,'within a metre of the turf');
  assert.equal(isWolfveilCaveBoxBuried({...box,maxY:12},rule),false,'pokes out of the ground');
  assert.equal(isWolfveilCaveBoxBuried(box,{heightAt:flat,mouths:[[17.5,3]]}),false,'at a cave mouth');
  assert.equal(isWolfveilCaveBoxBuried(box,{heightAt:flat,mouths:[[18.5,3]]}),true);
  // On a slope the LOWEST ground over the footprint decides.
  assert.equal(isWolfveilCaveBoxBuried({...box,minX:9.5,maxX:20,maxY:8.4},{heightAt:slope}),true);
  assert.equal(isWolfveilCaveBoxBuried({...box,minX:9,maxX:20,maxY:8.4},{heightAt:slope}),false);
  assert.equal(isWolfveilCaveBoxBuried(box,{heightAt:()=>NaN}),false,'unknown ground: keep it drawn');
  assert.equal(isWolfveilCaveBoxBuried(null,rule),false);
  assert.equal(WOLFVEIL_CAVE_DRAW_BUDGET.mouthClearMeters>=10,true);
});

// ---------------------------------------------------- the caves themselves
function buildCaves(){
  const group=new Group();group.name='SWV_FourCave_Interconnected_TunnelSystem';
  const rib=unitGeometry(),basalt=stone(),bronze=stone();
  const staticProps=[];
  const add=(geometry,material,x,y,z)=>{const mesh=prop(group,geometry,material,x,y,z);staticProps.push(mesh);return mesh;};
  // Deep gallery under flat ground at y=10; mouth at (0,0).
  const deep=[[60,-8,0],[64,-8,0],[68,-8,0],[72,-8,0]].map(p=>add(rib,basalt,...p));
  const braziers=[[60,-9,4],[70,-9,4]].map(p=>add(rib,bronze,...p));
  const flame=add(rib,bronze,60,-7,4);                   // animated: never merged
  const teeth=[[1,11,0],[-1,11,0],[0,12,0]].map(p=>add(rib,basalt,...p)); // above ground at the mouth
  const justInside=add(rib,basalt,5,2,0);                // buried but at the mouth
  const floor=new Mesh(unitGeometry(),stone()).at(40,-10,0).sized(40,1,6);floor.name='Floor';group.add(floor);
  const shell=new Mesh(unitGeometry(),stone()).at(40,-4,0).sized(40,6,6);shell.name='Shell';group.add(shell);
  const occluder=new Mesh(unitGeometry(),stone()).at(2,9,0);group.add(occluder);
  const light=new Node('Light');light.isLight=true;light.at(60,-6,0);group.add(light);
  const mural=new Mesh(unitGeometry(),{isMeshBasicMaterial:true,transparent:true}).at(66,-7,-3);
  mural.name='Mural';group.add(mural);
  const torch=new Node('Torch');torch.isSprite=true;torch.at(66,-6,3);torch.visible=false;group.add(torch);
  const decor=new Instanced(unitGeometry(),stone(),3);decor.name='EntranceFerns';group.add(decor);
  const budget=installWolfveilCaveDrawBudget({Group,InstancedMesh:Instanced,group,
    heightAt:()=>10,mouths:[[0,0]],keep:[floor,shell,occluder,light],
    staticProps:staticProps.filter(mesh=>mesh!==flame)});
  return {group,budget,deep,braziers,flame,teeth,justInside,floor,shell,occluder,light,mural,torch,decor};
}

test('buried cave parts move into one interior group; the rest stays put',()=>{
  const c=buildCaves(),inside=c.budget.interior;
  assert.equal(inside.name,WOLFVEIL_CAVE_INTERIOR_NAME);
  assert.equal(inside.parent,c.group);
  for(const kept of [c.floor,c.shell,c.occluder,c.light,c.decor])
    assert.equal(kept.parent,c.group,(kept.name||'prop')+' must stay where it was built');
  for(const buried of [c.flame,c.mural,c.torch])assert.equal(buried.parent,inside);
  assert.equal(c.torch.visible,false,'its owner still decides whether the torch burns');
  // Four ribs and two braziers became two draws under the interior group.
  // The three teeth and the rib just inside the mouth (buried, but too close
  // to the opening to hide) became one draw that is always shown.
  const batches=c.budget.instancing.batches;
  assert.deepEqual(batches.map(batch=>[batch.parent===inside,batch.count]).sort(),
    [[false,4],[true,2],[true,4]]);
  assert.deepEqual(c.budget.stats().objects,{underground:9,surface:9});
  assert.deepEqual(c.budget.stats().props,{before:10,merged:10,batches:3,drawCallsSaved:7,
    leftAlone:{}});
});

test('the interior is drawn underground and switched off on the surface',()=>{
  const c=buildCaves(),b=c.budget;
  assert.equal(b.isInteriorShown(),true,'before the first update nothing is hidden');
  assert.equal(b.update({inside:false,player:{x:5,y:10,z:5}}),false);
  assert.equal(c.budget.interior.visible,false);
  assert.equal(b.stats().reason,'player is on the surface');
  assert.equal(b.update({inside:true,player:{x:60,y:-9,z:0}}),true);
  assert.equal(b.stats().reason,'inside a cave');
  // No cave session but the body is far under the turf (fall-through, server-moved).
  assert.equal(b.update({inside:false,player:{x:60,y:7.4,z:0}}),true);
  assert.equal(b.stats().reason,'player is under the ground');
  assert.equal(b.update({inside:false,player:{x:60,y:7.6,z:0}}),false);
  // Nobody to hide it from: draw it rather than guess.
  assert.equal(b.update({inside:false,player:null}),true);
  assert.equal(b.update({inside:false,player:{x:NaN,y:0,z:0}}),true);
  assert.equal(b.update({inside:false,player:{x:5,y:10,z:5}}),false);
});

test('a map export sees the whole network; the A/B switch restores the built caves',async()=>{
  const c=buildCaves(),b=c.budget;
  b.update({inside:false,player:{x:5,y:10,z:5}});
  let during=null;
  assert.equal(await b.withInteriorShown(async()=>{during=b.isInteriorShown();return 'exported';}),'exported');
  assert.equal(during,true);assert.equal(b.isInteriorShown(),false);
  await assert.rejects(b.withInteriorShown(async()=>{throw new Error('disk full');}),/disk full/);
  assert.equal(b.isInteriorShown(),false,'a failed export still hides the interior again');

  assert.equal(b.setEnabled(false),false);
  assert.equal(b.isInteriorShown(),true);
  assert.equal(b.instancing.batches.length,0);
  for(const mesh of [...c.deep,...c.braziers])assert.equal(mesh.parent,b.interior);
  for(const mesh of [...c.teeth,c.justInside])assert.equal(mesh.parent,c.group);
  assert.equal(b.setEnabled(true),true);
  assert.equal(b.isInteriorShown(),false,'it remembers where the player was');
  assert.equal(b.instancing.batches.length,3);
  assert.throws(()=>installWolfveilCaveDrawBudget({Group,InstancedMesh:Instanced,group:c.group}),
    /ground height/);
});

// ------------------------------------------------------------------ wiring
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('the cave system installs the draw budget, fails open and keeps exports whole',()=>{
  const caves=source('src/components/game3d/wolfveil/WolfveilCaveSystem.js');
  assert.match(caves,/installWolfveilCaveDrawBudget\(\{/);
  assert.match(caves,/staticProps\.push\(m\)/);
  assert.match(caves,/keep: \[floorMesh, shellMesh, pavementMesh, \.\.\.entranceOccluders, \.\.\.lightPool\]/);
  assert.match(caves,/staticProps\.filter\(mesh => !flameMeshes\.has\(mesh\)\)/);
  assert.match(caves,/catch \(error\) \{\s*console\.warn\('\[Wolfveil caves\] draw budget unavailable/);
  // The interior is updated in the same call that teleports the player.
  assert.match(caves,/worldPos\.z=travel\.z\+offsetZ;\s*syncDrawBudget\(worldPos\);/);
  assert.match(caves,/mesh\.visible = !hideOccluders;\s*\}\s*syncDrawBudget\(playerWorldPos\);/);
  assert.match(caves,/drawBudget\?\.dispose\(\);/);
  const world=source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world,/caves\.withInteriorShown\(exportScene\)/);
  for(const file of ['src/components/game3d/wolfveil/WolfveilCaveDrawBudget.mjs',
    'src/components/game3d/performance/Game3DStaticInstancing.mjs'])
    assert.doesNotMatch(source(file),/from ['"]three['"]/,file+' must stay testable without Three.js');
});
