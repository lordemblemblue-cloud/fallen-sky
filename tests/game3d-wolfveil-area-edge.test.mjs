// The far side of a Wolfveil border is unloaded, not hidden behind a wall
// (owner, 2026-11-21: the veil's "teeth-like rippling effect ... we have to
// make it to where that side of the map is unloaded"), bridges let a walker
// pass under them, and paving stops at the top of a river bank.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import * as THREE from 'three';
import {clipGeometryToWolfveilArea,clipWolfveilSceneToArea,createWolfveilAreaScope,wolfveilAreaClipPlanes}
  from '../src/components/game3d/wolfveil/streaming/WolfveilAreaClip.mjs';
import {wolfveilAreaScenesEnabled,WOLFVEIL_WHOLE_WORLD_STORAGE_KEY}
  from '../src/components/game3d/wolfveil/streaming/WolfveilAreaScenes.mjs';
import {createWolfveilTerrainAreaStream,WOLFVEIL_WHOLE_TERRAIN,WOLFVEIL_AREA_EDGE_SKIRT}
  from '../src/components/game3d/wolfveil/WolfveilTerrainAreaStream.mjs';
import {WOLFVEIL_AREA_IDS,wolfveilAreaRect}
  from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {resolveWolfveilBridgeRailing,WOLFVEIL_BRIDGE_UNDER_METERS}
  from '../src/components/game3d/wolfveil/WolfveilBridgeProfile.mjs';
import {createWolfveilPavingCollector,wolfveilPavingNearRiver,WOLFVEIL_PAVING_RIVER_CLEARANCE}
  from '../src/components/game3d/wolfveil/WolfveilPavedRoads.js';
import {WOLFVEIL_BRIDGES,WOLFVEIL_ROUTES,wolfveilDistanceToRiver} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {createWolfveilAreaGates} from '../src/components/game3d/wolfveil/WolfveilAreaGates.js';

const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const areaXZ=geometry=>{
  const p=geometry.attributes.position;let sum=0;
  for(let i=0;i+2<p.count;i+=3){
    const ux=p.getX(i+1)-p.getX(i),uz=p.getZ(i+1)-p.getZ(i),vx=p.getX(i+2)-p.getX(i),vz=p.getZ(i+2)-p.getZ(i);
    sum+=Math.abs(ux*vz-uz*vx)/2;
  }
  return sum;
};
// A flat valley in LOCAL coordinates (like the terrain source), with colours and uvs.
const valley=(half=550,segments=44)=>{
  const g=new THREE.PlaneGeometry(half*2,half*2,segments,segments).rotateX(-Math.PI/2);
  const colors=new Float32Array(g.attributes.position.count*3).fill(.5);
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return g;
};

test('a straddling surface is cut exactly at the border; the two sides tile it with no gap or overlap',()=>{
  // 40 m wide strip across the town/east border at x=122 (WORLD z = local + 70).
  const strip=new THREE.PlaneGeometry(40,10,4,1).rotateX(-Math.PI/2).translate(122,0,-28);
  const town=clipGeometryToWolfveilArea(strip,'town'),east=clipGeometryToWolfveilArea(strip,'east');
  const xs=g=>Array.from({length:g.attributes.position.count},(_,i)=>g.attributes.position.getX(i));
  assert.equal(Math.max(...xs(town.geometry)),122);
  assert.equal(Math.min(...xs(east.geometry)),122);
  assert.ok(Math.abs(areaXZ(town.geometry)+areaXZ(east.geometry)-400)<1e-6);
  assert.ok(town.cut>0&&town.dropped>0&&town.kept>0);
  // Attributes ride along: uvs interpolated on the cut, normals stay unit length.
  const uv=town.geometry.attributes.uv,n=town.geometry.attributes.normal;
  for(let i=0;i<uv.count;i++){
    assert.ok(uv.getX(i)>=-1e-9&&uv.getX(i)<=.5+1e-9,'left half of the strip uvs');
    assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
  }
  // Wholly inside: nothing to do.
  assert.equal(clipGeometryToWolfveilArea(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2).translate(0,0,70),'town'),null);
  // A placed mesh is tested in world space and cut in its own space.
  const placed=new THREE.Mesh(new THREE.PlaneGeometry(40,10,4,1).rotateX(-Math.PI/2));
  placed.position.set(122,0,-28);placed.updateMatrixWorld(true);
  const local=clipGeometryToWolfveilArea(placed.geometry,'town',{matrixWorld:placed.matrixWorld});
  const lx=xs(local.geometry);
  assert.equal(Math.max(...lx),0,'cut at the border, in the mesh\'s own x');
  // Groups survive.
  const grouped=new THREE.BoxGeometry(30,4,4).translate(122,0,-28);
  const cutBox=clipGeometryToWolfveilArea(grouped,'town');
  assert.ok(cutBox.geometry.groups.length>=4);
  assert.equal(cutBox.geometry.groups.reduce((s,g)=>s+g.count,0),cutBox.geometry.attributes.position.count);
});

test('the scene cut: straddlers cut, far-side pieces emptied, the gates and excluded parts left whole',()=>{
  const root=new THREE.Group();root.position.z=70;
  const road=new THREE.Mesh(new THREE.PlaneGeometry(100,6,10,1).rotateX(-Math.PI/2).translate(122,0,-98),new THREE.MeshBasicMaterial());
  const far=new THREE.Mesh(new THREE.BoxGeometry(4,4,4).translate(300,0,0),new THREE.MeshBasicMaterial());
  const near=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial());
  const gate=new THREE.Mesh(new THREE.BoxGeometry(6,6,1).translate(122,0,-98),new THREE.MeshBasicMaterial());
  const shared=new THREE.BoxGeometry(2,2,2).translate(118,0,0);
  const a=new THREE.Mesh(shared),b=new THREE.Mesh(shared);b.position.x=4; // b straddles x=122, a does not
  b.name='b';
  road.name='road';far.name='far';near.name='near';
  root.add(road,far,near,gate,a,b);root.updateMatrixWorld(true);
  const before=near.geometry;
  const report=clipWolfveilSceneToArea(root,'town',{exclude:[gate]});
  assert.ok(report.clipped.some(c=>c.name==='road'));
  assert.deepEqual(report.emptied,['far']);
  assert.equal(far.visible,false);
  assert.equal(near.geometry,before,'inside: untouched');
  assert.equal(gate.geometry.attributes.position.count,24,'excluded: whole');
  const box=new THREE.Box3().setFromObject(road);
  assert.ok(box.max.x<=122+1e-6);
  assert.ok(report.clipped.some(c=>c.name==='b'));
  assert.notEqual(b.geometry,shared);
  assert.equal(a.geometry,shared,'the other user of a shared geometry keeps it');
  // Done once: a second pass changes nothing.
  const again=clipWolfveilSceneToArea(root,'town',{exclude:[gate]});
  assert.equal(again.clipped.length+again.emptied.length,0);
});

test('the area scope hides instances outside the area whenever their owner rewrites them',()=>{
  const root=new THREE.Group();
  const tufts=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial(),3);
  const at=(i,x,z)=>tufts.setMatrixAt(i,new THREE.Matrix4().makeTranslation(x,0,z));
  at(0,0,70);at(1,200,70);at(2,121,70); // town, east, town
  root.add(tufts);root.updateMatrixWorld(true);
  let clock=0;
  const scope=createWolfveilAreaScope({area:'town',roots:()=>[root],rescanMs:1000});
  const scale=i=>{const m=new THREE.Matrix4();tufts.getMatrixAt(i,m);return m.elements[0];};
  assert.equal(scale(0),1);assert.equal(scale(1),0);assert.equal(scale(2),1);
  // The owner streams new placements: filtered again on the next update.
  at(0,250,70);tufts.instanceMatrix.needsUpdate=true;
  scope.update(clock+=16);
  assert.equal(scale(0),0);
  // Unchanged instances cost nothing: no new version, no new pass.
  const version=tufts.instanceMatrix.version;scope.update(clock+=16);
  assert.equal(tufts.instanceMatrix.version,version);
  // A mesh added later (an async model) is cut on the next rescan.
  const late=new THREE.Mesh(new THREE.BoxGeometry(4,4,4).translate(400,0,0));
  root.add(late);root.updateMatrixWorld(true);
  scope.update(clock+=2000);
  assert.equal(late.visible,false);
  assert.ok(scope.report.instancesHidden>=2);
});

test('each area\'s ground ends in a straight edge with an earth face; the areas tile the valley',()=>{
  const sourceGeometry=valley();
  const parent=new THREE.Group();
  let total=0;
  for(const area of WOLFVEIL_AREA_IDS){
    const stream=createWolfveilTerrainAreaStream({source:sourceGeometry,material:new THREE.MeshBasicMaterial(),parent,initialArea:area});
    const floor=parent.children.at(-1);
    const rect=wolfveilAreaRect(area);
    const p=floor.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      assert.ok(p.getX(i)>=rect.minX-1e-6&&p.getX(i)<=rect.maxX+1e-6,area+' x');
      assert.ok(p.getZ(i)>=rect.minZ-1e-6&&p.getZ(i)<=rect.maxZ+1e-6,area+' z');
    }
    total+=areaXZ(floor.geometry);
    assert.ok(floor.geometry.boundsTree,'raycast tree for the ground');
    // The earth face hangs from the cut edges only, never from the valley's outer rim.
    const skirt=floor.children.find(c=>c.name==='SWV_ActiveAreaEdgeSkirt_'+area);
    assert.ok(skirt,area+' has an edge face');
    const planes=wolfveilAreaClipPlanes(area,{offsetZ:0});
    const s=skirt.geometry.attributes.position;
    let bottom=Infinity;
    for(let i=0;i<s.count;i++){
      assert.ok(planes.some(pl=>Math.abs((pl.axis===0?s.getX(i):s.getZ(i))-pl.value)<1e-4),'on a border line');
      bottom=Math.min(bottom,s.getY(i));
    }
    assert.ok(Math.abs(bottom-(0-WOLFVEIL_AREA_EDGE_SKIRT.depth))<1e-6);
    assert.equal(skirt.raycast.length,0,'decorative: no raycast hits');
    stream.dispose();
    assert.equal(parent.children.length,0);
  }
  assert.ok(Math.abs(total-1100*1100)<1e-3,'five sections cover the valley exactly');
});

test('the whole-world switch builds the whole ground once and never swaps it',()=>{
  const sourceGeometry=valley(550,10),parent=new THREE.Group();
  const stream=createWolfveilTerrainAreaStream({source:sourceGeometry,material:new THREE.MeshBasicMaterial(),parent,initialArea:WOLFVEIL_WHOLE_TERRAIN});
  assert.equal(stream.activeArea,WOLFVEIL_WHOLE_TERRAIN);
  const floor=parent.children[0];
  assert.ok(Math.abs(areaXZ(floor.geometry.toNonIndexed())-1100*1100)<1e-3);
  assert.equal(floor.children.length,0,'no edge face');
  assert.equal(stream.update({x:300,z:70},'east'),false);
  assert.equal(parent.children[0],floor);
  stream.dispose();
  const win=(search='',stored=null)=>({location:{search},localStorage:{getItem:key=>key===WOLFVEIL_WHOLE_WORLD_STORAGE_KEY?stored:null}});
  assert.equal(wolfveilAreaScenesEnabled(win()),true,'portal scenes by default');
  assert.equal(wolfveilAreaScenesEnabled(win('?wholeWorld=1')),false);
  assert.equal(wolfveilAreaScenesEnabled(win('',"1")),false);
  assert.equal(wolfveilAreaScenesEnabled(win('?wholeWorld=0','1')),true,'the URL wins for this tab');
  assert.equal(wolfveilAreaScenesEnabled({get location(){throw Error('blocked');}}),true);
});

test('portal scenes draw no veil wall; the membranes still follow the camera',()=>{
  const world={group:new THREE.Group()};
  const plain=createWolfveilAreaGates(world,{labels:false,area:'town',heightAt:()=>0,veil:false});
  assert.equal(plain.root.getObjectByName('WV_SpiritVeil_AreaBorders'),undefined);
  const membranes=plain.root.getObjectByName('WV_ToriiGate_Membranes');
  assert.equal(typeof membranes.onBeforeRender,'function');
  const camera=new THREE.PerspectiveCamera();camera.position.set(5,6,7);camera.updateMatrixWorld(true);
  world.group.updateMatrixWorld(true);
  membranes.onBeforeRender(null,null,camera);
  // The veil collision is unchanged: off a gate, the border still holds.
  const pos={x:121,z:-150+70},prev={x:118,z:-150+70};
  assert.equal(plain.resolveCollision({...pos,x:125},prev),true);
  plain.dispose();
  const withVeil=createWolfveilAreaGates({group:new THREE.Group()},{labels:false,area:'town',heightAt:()=>0});
  assert.ok(withVeil.root.getObjectByName('WV_SpiritVeil_AreaBorders'),'the veil stays available');
  withVeil.dispose();
});

test('the railing holds a walker on a bridge deck, not one passing under it',()=>{
  const bridge=WOLFVEIL_BRIDGES.find(b=>b.id==='market_bridge');
  const deckY=21;const deckHeightAt=()=>deckY;
  // From the middle of the deck sideways past the rail line.
  const previous={x:90,z:-98+70},position={x:90,y:deckY,z:-98+70+4};
  assert.equal(resolveWolfveilBridgeRailing({...position},previous,[bridge],.62,70,{deckHeightAt}),true,'on the deck');
  const below={x:90,y:deckY-WOLFVEIL_BRIDGE_UNDER_METERS-.5,z:-98+70+4};
  const moved={...below};
  assert.equal(resolveWolfveilBridgeRailing(moved,previous,[bridge],.62,70,{deckHeightAt}),false,'under the deck');
  assert.deepEqual(moved,below);
  // Without deck heights the old 2D rule is unchanged.
  assert.equal(resolveWolfveilBridgeRailing({...below},previous,[bridge],.62,70),true);
  const scene=source('src/components/game3d/wolfveil/WolfveilScene.js');
  assert.match(scene,/deckHeightAt:\(bridge,t,lateral\)=>world\.bridgeDecks\?\.\[bridge\.id\]\?\.heightAt\(t,lateral\)/);
  assert.match(source('src/components/game3d/wolfveil/WolfveilTown.js'),/world\.bridgeDecks\[b\.id\]=deck;/);
});

test('the player stands on the floor within a step of the feet, so a deck overhead never lifts them',()=>{
  const world=source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world,/const WOLFVEIL_FLOOR_STEP_UP = 1\.1;/);
  assert.match(world,/if\(!suigenActive&&Number\.isFinite\(referenceY\)\)\s*floorY=\(hits\.find\(hit=>hit\.point\.y<=referenceY\+WOLFVEIL_FLOOR_STEP_UP\)\?\?hits\[hits\.length-1\]\)\.point\.y;/);
  assert.match(world,/Math\.max\(floorY, importedSpawnTown\?\.groundY\(x, z\) \?\? -Infinity\)/);
  // The feet glue passes the feet; the swim state keeps reading what it returns.
  assert.match(world,/sampleGroundY\(model\.position\.x,model\.position\.z,model\.position\.y\)/);
});

test('paving stops at the top of a river bank (the brick lane beside the Market Stone Bridge)',()=>{
  const lane=WOLFVEIL_ROUTES.find(r=>r.id==='river_housing_loop');
  assert.equal(lane.kind,'residential');
  const collector=createWolfveilPavingCollector({terrainSpan:1100,terrainSegments:310});
  const strip=(x,z,w=4.9)=>[[x-1,z-w/2],[x-1,z+w/2],[x+1,z+w/2],[x+1,z-w/2]];
  // Along the lane from (72,-105) down the bank to the water.
  for(const [x,z] of [[84.6,-108.2],[92.9,-110.3],[101.3,-112.4]]){
    assert.ok(wolfveilDistanceToRiver(x,z)<WOLFVEIL_PAVING_RIVER_CLEARANCE);
    assert.equal(collector.add(lane,strip(x,z),1.4),false,'no paving down the bank at '+x);
  }
  assert.equal(collector.add(lane,strip(60,-101.5),1.4),true,'paved on the town terrace');
  assert.equal(wolfveilPavingNearRiver([[0,-70]]),false);
});

test('the live world: portal scenes cut to the area, no veil, and a switch back to the whole valley',()=>{
  const world=source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world,/const areaScenes=region==='wolfveil'&&wolfveilAreaScenesEnabled\(window\);/);
  assert.match(world,/initialArea:areaScenes\?worldArea:WOLFVEIL_WHOLE_TERRAIN/);
  assert.match(world,/if\(!areaScenes\)regionStream\.setEnabled\(false\);/);
  assert.match(world,/createWolfveilAreaGates\(wolfveilVillage\.world,\{area:areaScenes\?worldArea:null,veil:false\}\)/);
  assert.match(world,/areaScope=createWolfveilAreaScope\(\{area:worldArea,/);
  assert.equal(world.match(/keepToArea\(\);/g).length,2,'title screen and live play');
  assert.match(world,/if\(!areaScenes\|\|!areaPortals\?\.resolveCollision/);
  assert.match(world,/const gateTravelOpen=actor=>Boolean\(areaScenes&&/);
  assert.match(world,/if\(!areaScenes\|\|entryModeRef\.current\|\|areaTravelStarted/);
});
