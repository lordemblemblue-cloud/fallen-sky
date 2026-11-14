import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clearWolfveilImportedTownInterior} from '../src/components/game3d/wolfveil/WolfveilImportedTownInteriorClearance.mjs';
import {WOLFVEIL_IMPORTED_TOWN,WOLFVEIL_IMPORTED_TOWN_FLOOR_Y}
  from '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';

const floorY=WOLFVEIL_IMPORTED_TOWN_FLOOR_Y+WOLFVEIL_IMPORTED_TOWN.floorLiftMeters;
const identity={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
function fakeMesh(name,faces){
  const flat=faces.flat().flat();
  const position={
    count:flat.length/3,
    getX:i=>flat[i*3],getY:i=>flat[i*3+1],getZ:i=>flat[i*3+2],
  };
  const geometry={
    attributes:{position},groups:[],index:null,drawRange:null,
    setIndex(indices){this.index={array:indices,count:indices.length,getX:i=>indices[i]};},
    clearGroups(){this.groups=[];},addGroup(start,count,materialIndex){this.groups.push({start,count,materialIndex});},
    setDrawRange(start,count){this.drawRange={start,count};},
    computeBoundingBox(){},computeBoundingSphere(){},
  };
  return {isMesh:true,name,geometry,matrixWorld:identity,userData:{}};
}
const tri=(x,z,y=floorY+2)=>[[x,y,z],[x+1,y,z],[x,y,z+1]];
const root=(...meshes)=>({
  userData:{},updateMatrixWorld(){},
  traverse(fn){for(const m of meshes)fn(m);},
});

test('clone-only clearance removes town house/bridge/tree geometry but not perimeter',()=>{
  const roof=fakeMesh('roof',[tri(0,0),tri(62,0)]);
  const bridge=fakeMesh('Red_Arch_Bridge',[tri(10,10)]);
  const extraTree=fakeMesh('pink',[tri(30,10)]);
  const result=clearWolfveilImportedTownInterior(root(roof,bridge,extraTree));
  assert.equal(result.removedFaces,3);
  assert.equal(result.preservedPerimeterFaces,1);
  assert.equal(roof.geometry.index.count,3,'the perimeter roof face must remain');
  assert.equal(bridge.geometry.index.count,0,'bridge cannot remain as an invisible collider');
  assert.equal(extraTree.geometry.index.count,0,'extra tree foliage must be gone');
});

test('keep all town paver, grass flooring, stone and tiles, not just mesh visibility',()=>{
  const floorNames=['Tile_01','Tile_80','grass','Expansion_grass','paving','Expansion_paving','stone','water'];
  const meshes=floorNames.map(name=>fakeMesh(name,[tri(0,0,floorY)]));
  const result=clearWolfveilImportedTownInterior(root(...meshes));
  assert.equal(result.removedFaces,0);
  assert.equal(result.protectedFloorMeshes,floorNames.length);
  for(const m of meshes)assert.equal(m.geometry.index,null,m.name+' should be untouched');
});

test('preserve near-ground gold floor motif, but remove raised gold and bridge deck',()=>{
  const gold=fakeMesh('gold',[tri(0,0,floorY+0.02),tri(4,0,floorY+0.8)]);
  const bridge=fakeMesh('Bridge_Deck',[tri(10,10,floorY+0.02)]);
  const result=clearWolfveilImportedTownInterior(root(gold,bridge));
  assert.equal(result.removedFaces,2);
  assert.equal(result.preservedFloorArtFaces,1);
  assert.equal(gold.geometry.index.count,3);
  assert.equal(bridge.geometry.index.count,0);
});

test('multi-material groups retain correct face ranges after removal',()=>{
  const roof=fakeMesh('roof',[tri(0,0),tri(61,0),tri(0,5),tri(-62,0)]);
  roof.geometry.groups=[{start:0,count:6,materialIndex:1},{start:6,count:6,materialIndex:2}];
  const out=clearWolfveilImportedTownInterior(root(roof));
  assert.equal(out.removedFaces,2);
  assert.deepEqual(roof.geometry.groups,
    [{start:0,count:3,materialIndex:1},{start:3,count:3,materialIndex:2}]);
});

test('centre tree and planter are separate from GLB cleanup and protected in scene wiring',()=>{
  const src=readFileSync(
    new URL('../src/components/game3d/wolfveil/WolfveilImportedTownScene.mjs',import.meta.url),'utf8');
  const clear=src.indexOf('clearWolfveilImportedTownInterior(town)');
  const bake=src.indexOf('collision=bakeWolfveilTownCollision');
  assert.ok(clear>0 && bake>clear,'collision bake must use the already-cleared geometry');
  assert.match(src,/const tree=installWolfveilTownTree\(root\)/);
  assert.match(src,/const canopyDressing=buildWolfveilTownCanopyDressing\(root\)/);
  assert.doesNotMatch(src,/if\(!plazaTreeClearOfHouses\)tree\.dispose\(\)/);
  assert.doesNotMatch(src,/plantTownLawnGrassBlades\(town,root\)/);
});
