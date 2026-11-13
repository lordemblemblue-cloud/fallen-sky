import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {removeWolfveilTownRaisedTileBodies,WOLFVEIL_TOWN_TILE_CLEANUP} from '../src/components/game3d/wolfveil/WolfveilTownTileBodyRemoval.mjs';
import {flattenWolfveilTownFloorLevels} from '../src/components/game3d/wolfveil/WolfveilTownFloorLevel.mjs';
import {WOLFVEIL_IMPORTED_TOWN} from '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';

const F=WOLFVEIL_IMPORTED_TOWN.floorSourceY;
function box(name,top,bottom,x=6,z=6) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([
    x,bottom,z, x+1,bottom,z, x+1,bottom,z+1, x,bottom,z+1,
    x,top,z, x+1,top,z, x+1,top,z+1, x,top,z+1,
  ],3));
  g.setIndex([
    4,5,6,4,6,7, 0,1,2,0,2,3,
    0,1,5,0,5,4, 1,2,6,1,6,5,
    2,3,7,2,7,6, 3,0,4,3,4,7,
  ]);
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());
  mesh.name=name;
  return mesh;
}
const scene=(...meshes)=>{const root=new THREE.Group();for(const m of meshes)root.add(m);root.updateMatrixWorld(true);return root;};

test('a synthetic shallow secondary face cannot survive the narrow top-skin filter',()=>{
  assert.ok(WOLFVEIL_TOWN_TILE_CLEANUP.topBandMeters<0.029*12.44);
  const m=box('Tile_12',0.691,0.662);
  m.scale.setScalar(12.44);m.updateMatrixWorld(true);
  const r=removeWolfveilTownRaisedTileBodies(m);
  assert.equal(r.keptFaces,2);
  assert.equal(r.removedFaces,10);
  assert.equal(m.geometry.attributes.position.count,4);
  assert.equal(m.geometry.index.count,6);
});
test('three separate raised park tiles become one seamless walkable elevation',()=>{
  const tiles=[box('Tile_08',0.691,0.662),box('Tile_09',0.89,0.861),box('Tile_10',0.98,0.951)];
  const root=scene(...tiles);
  for(const m of tiles){const r=removeWolfveilTownRaisedTileBodies(m);assert.equal(r.keptFaces,2);}
  const receipt=flattenWolfveilTownFloorLevels(root);
  assert.equal(receipt.tileVertices,12);
  for(const m of tiles){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-F)<1e-6);}
});
test('raised bridge-adjacent flat paving is seated; bridge rails and canal bed are not flattened',()=>{
  const landing=box('paving',0.93,0.69,0,0);
  const redBridge=box('Red_Arch_Bridge',1.16,0.86,0,0);
  const canalBed=box('grass',0.68,0.62,0,0);
  const root=scene(landing,redBridge,canalBed);
  const report=flattenWolfveilTownFloorLevels(root);
  assert.equal(report.raisedSurfaceVertices,4);
  for(let i=4;i<8;i++)assert.ok(Math.abs(landing.geometry.attributes.position.getY(i)-(F-0.0012))<1e-6);
  assert.equal(redBridge.geometry.attributes.position.getY(4),1.16);
  assert.equal(canalBed.geometry.attributes.position.getY(4),0.68);
});
test('only real water-covered tiles remain recessed inside the broad canal rectangle',()=>{
  const water=box('water',0.708,0.705,0,0);
  const submerged=box('Tile_01',0.691,0.662,0,0);
  const dryPark=box('Tile_02',0.691,0.662,2,0);
  const root=scene(water,submerged,dryPark);
  removeWolfveilTownRaisedTileBodies(submerged);
  removeWolfveilTownRaisedTileBodies(dryPark);
  const result=flattenWolfveilTownFloorLevels(root);
  assert.equal(result.verifiedWaterFootprint,true);
  assert.equal(result.protectedWaterTileVertices,4);
  assert.ok(Math.abs(submerged.geometry.attributes.position.getY(0)-0.691)<1e-5);
  assert.ok(Math.abs(dryPark.geometry.attributes.position.getY(0)-F)<1e-5);
});
test('already-grounded park lawn remains just above paving',()=>{
  const lawn=box('grass',0.719,0.50,6,6),paving=box('paving',0.72,0.5,8,6);
  flattenWolfveilTownFloorLevels(scene(lawn,paving));
  assert.ok(Math.abs(lawn.geometry.attributes.position.getY(4)-(F+0.0015))<1e-6);
  assert.ok(Math.abs(paving.geometry.attributes.position.getY(4)-(F-0.0012))<1e-6);
});
