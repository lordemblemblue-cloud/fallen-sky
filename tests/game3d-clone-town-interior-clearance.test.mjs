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

test('clone clearance removes center and perimeter beams, houses, bridge and extra trees',()=>{
  const roof=fakeMesh('roof',[tri(0,0),tri(62,0)]);
  const bridge=fakeMesh('Red_Arch_Bridge',[tri(10,10)]);
  const extraTree=fakeMesh('pink',[tri(30,10)]);
  const result=clearWolfveilImportedTownInterior(root(roof,bridge,extraTree));
  assert.equal(result.removedFaces,4);
  assert.equal(result.removedPerimeterStructureFaces,1);
  assert.equal(roof.geometry.index.count,0,'outer-edge roof remains must be removed');
  assert.equal(bridge.geometry.index.count,0,'bridge cannot remain as an invisible collider');
  assert.equal(extraTree.geometry.index.count,0,'extra tree foliage must be gone');
});

test('keep all town paver, grass flooring, stone and tiles, not just mesh visibility',()=>{
  const floorNames=['Tile_01','Tile_80','grass','Expansion_grass','paving','Expansion_paving','stone','water'];
  const meshes=floorNames.map(name=>fakeMesh(name,[tri(0,0,floorY)]));
  const result=clearWolfveilImportedTownInterior(root(...meshes));
  assert.equal(result.removedFaces,0);
  assert.equal(result.protectedFloorMeshes,floorNames.length-1,'stone is inspected by face height');
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
  const gold=fakeMesh('gold',[tri(0,0,floorY+.02),tri(61,0),tri(0,5,floorY+.02),tri(-62,0)]);
  gold.geometry.groups=[{start:0,count:6,materialIndex:1},{start:6,count:6,materialIndex:2}];
  const out=clearWolfveilImportedTownInterior(root(gold));
  assert.equal(out.removedFaces,2);
  assert.deepEqual(gold.geometry.groups,
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


test('real gate and narrow outer paving survive, even where unwanted beams do not',()=>{
  const gate=fakeMesh('South_Gate_Entry',[tri(0,-68,floorY+3)]);
  const border=fakeMesh('Perimeter_Brick_Ring',[tri(63,0,floorY+.04)]);
  const houseBeam=fakeMesh('house_beam',[tri(63,3,floorY+2.5)]);
  const result=clearWolfveilImportedTownInterior(root(gate,border,houseBeam));
  assert.equal(gate.geometry.index,null);
  assert.equal(border.geometry.index,null);
  assert.equal(houseBeam.geometry.index.count,0);
  assert.ok(result.preservedGateFaces>0);
  assert.ok(result.removedPerimeterStructureFaces>0);
});

test('blue ground fixtures and stray tree parts are removed; approved warm lamps remain',()=>{
  const cyan=fakeMesh('Blue_Cyan_Pedestal',[tri(2,16,floorY+.5)]);
  const foliage=fakeMesh('pinklight',[tri(-30,12,floorY+8)]);
  const warm=fakeMesh('Warm_Lantern',[tri(6,24,floorY+1.5)]);
  warm.material={color:{r:1,g:.78,b:.32}};
  const cold=fakeMesh('Blue_Light',[tri(8,22,floorY+1.5)]);
  cold.material={emissive:{r:.1,g:.8,b:1,getHex:()=>0x11cfff}};
  const result=clearWolfveilImportedTownInterior(root(cyan,foliage,warm,cold));
  assert.equal(cyan.geometry.index.count,0);
  assert.equal(foliage.geometry.index.count,0);
  assert.equal(cold.geometry.index.count,0);
  assert.equal(warm.geometry.index,null);
  assert.ok(result.preservedWarmLampFaces>0);
  assert.ok(result.removedTreeFaces>0);
});

test('stone floor remains walkable while a raised stone stair wall is removed',()=>{
  const stone=fakeMesh('stone',[tri(8,8,floorY),tri(9,9,floorY+2)]);
  const result=clearWolfveilImportedTownInterior(root(stone));
  assert.equal(result.removedFaces,1);
  assert.equal(result.removedStoneStructureFaces,1);
  assert.equal(stone.geometry.index.count,3);
});

test('the remaining canopy creates one southern gate, and the imported green lawn uses stone texture',()=>{
  const source=readFileSync(new URL('../src/components/game3d/wolfveil/WolfveilImportedTownCritique.mjs',import.meta.url),'utf8');
  const gates=source.split('const gates = [')[1]?.split('];')[0]||'';
  assert.equal((gates.match(/span:/g)||[]).length,1);
  assert.match(gates,/centerZ - halfD - 2\.2/);
  assert.match(source,/const turfTex = tex\(suite\.stone, 1\.4, 1\.4\)/);
  assert.match(source,/m\.color\?\.setHex\(0xc6c1b6\)/);
});
