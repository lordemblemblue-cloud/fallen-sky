import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {purgeWolfveilTownLegacyStructures,WOLFVEIL_TOWN_LEGACY_PURGE}
  from '../src/components/game3d/wolfveil/WolfveilTownLegacyMeshPurge.mjs';
import {WOLFVEIL_IMPORTED_TOWN,WOLFVEIL_IMPORTED_TOWN_FLOOR_Y}
  from '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';

const y=WOLFVEIL_IMPORTED_TOWN_FLOOR_Y+WOLFVEIL_IMPORTED_TOWN.floorLiftMeters;
const identity={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
const floor=(x=0,z=0,h=y)=>[[x,h,z],[x+1,h,z],[x,h,z+1]];
const wall=(x=0,z=0)=>[[x,y,z],[x,y+2,z],[x,y+4,z+1]];
const roof=(x=0,z=0)=>floor(x,z,y+7);
function mesh(name,triangles,opts={}){
  const flat=triangles.flat().flat();
  const position={count:flat.length/3,
    getX:i=>flat[i*3],getY:i=>flat[i*3+1],getZ:i=>flat[i*3+2]};
  const geometry={
    attributes:{position},index:null,groups:opts.groups||[],drawRange:null,
    setIndex(values){this.index={array:values,count:values.length,getX:i=>values[i]};},
    clearGroups(){this.groups=[];},
    addGroup(start,count,materialIndex){this.groups.push({start,count,materialIndex});},
    setDrawRange(start,count){this.drawRange={start,count};},
    computeBoundingBox(){},computeBoundingSphere(){},
  };
  return {isMesh:true,name,geometry,matrixWorld:identity,userData:{},visible:true};
}
const scene=(...meshes)=>({
  userData:{},updateMatrixWorld(){},
  traverse(visit){for(const m of meshes)visit(m);}
});

test('removed attached stacked step walls even if the mesh is named paving',()=>{
  const paving=mesh('paving',[floor(0,0),wall(2,0),roof(5,4)]);
  const r=purgeWolfveilTownLegacyStructures(scene(paving));
  assert.equal(r.removedFaces,2);
  assert.equal(r.removedAttachedFaces,2);
  assert.equal(r.preservedFloorFaces,1);
  assert.equal(paving.geometry.index.array.length,3);
  assert.equal(paving.geometry.drawRange.count,3);
  assert.equal(paving.visible,true);
});

test('all floor-named vertical skins removed, not merely roof names',()=>{
  for(const name of ['Tile_01','Tile_80','stone','grass','Expansion_paving',
                      'Expansion_grass','roof','house','red_brick']){
    const sample=mesh(name,[wall(10,15),roof(10,18)]);
    const output=purgeWolfveilTownLegacyStructures(scene(sample));
    assert.equal(output.removedFaces,2,name);
    assert.equal(sample.geometry.index.count,0,name);
    assert.equal(sample.visible,false,name+' no longer renders');
  }
});

test('giant roof crossing the protected perimeter is removed when it spans the interior',()=>{
  const giant=mesh('roof',[[[-66,y+8,-7],[66,y+8,-7],[0,y+8,30]]]);
  const r=purgeWolfveilTownLegacyStructures(scene(giant));
  assert.equal(r.removedFaces,1);
  assert.equal(giant.geometry.index.count,0);
});

test('perimeter square geometry outside the inner band is preserved',()=>{
  const frame=mesh('Outer_Square_Perimeter',[roof(63,0),wall(63,5)]);
  const r=purgeWolfveilTownLegacyStructures(scene(frame));
  assert.equal(r.protectedPerimeterFaces,2);
  assert.equal(r.removedFaces,0);
  assert.equal(frame.geometry.index,null);
});

test('surviving flat floor, low stone paving and canal water are untouched',()=>{
  const names=['Tile_01','paving','stone','grass','Expansion_paving'];
  const floors=names.map(n=>mesh(n,[floor(1,1)]));
  const water=mesh('canal_water',[floor(3,3,y+.1),wall(5,6)]);
  const r=purgeWolfveilTownLegacyStructures(scene(...floors,water));
  assert.equal(r.preservedFloorFaces,names.length);
  assert.equal(r.protectedWaterMeshes,1);
  assert.equal(r.removedFaces,0);
  for(const m of [...floors,water])assert.equal(m.geometry.index,null);
});

test('recessed flat canal bed remains, but knee-height horizontal steps disappear',()=>{
  const paver=mesh('paving',[
    floor(5,5,y-1.3),floor(8,8,y+0.7),wall(10,10)
  ]);
  const r=purgeWolfveilTownLegacyStructures(scene(paver));
  assert.equal(r.preservedFloorFaces,1);
  assert.equal(r.removedFaces,2);
  assert.equal(paver.geometry.index.count,3);
});

test('material groups are still bounded correctly after removing attachments',()=>{
  const mixed=mesh('stone',[
    floor(1,1),wall(2,2),roof(5,5),floor(6,6)
  ],{groups:[{start:0,count:6,materialIndex:1},{start:6,count:6,materialIndex:2}]});
  const r=purgeWolfveilTownLegacyStructures(scene(mixed));
  assert.equal(r.removedFaces,2);
  assert.deepEqual(mixed.geometry.groups,[
    {start:0,count:3,materialIndex:1},{start:3,count:3,materialIndex:2}
  ]);
});

test('town tree and perimeter are outside purge, and no houses respawn afterward',()=>{
  const source=readFileSync(
    new URL('../src/components/game3d/wolfveil/WolfveilImportedTownScene.mjs',import.meta.url),'utf8');
  const repair=source.indexOf('clearWolfveilTownCenterRisers(town)');
  const final=source.indexOf('purgeWolfveilTownLegacyStructures(town)');
  const bake=source.indexOf('collision=bakeWolfveilTownCollision');
  assert.ok(repair>=0&&final>repair&&bake>final);
  assert.match(source,/const tree=installWolfveilTownTree\(root\)/);
  assert.match(source,/const canopyDressing=buildWolfveilTownCanopyDressing\(root\)/);
  assert.match(source,/livingQuarter=buildWolfveilTownLivingQuarter\(root/);
  assert.match(source,/architectureEnabled:false/);
  const housing=readFileSync(
    new URL('../src/components/game3d/wolfveil/WolfveilTownLivingQuarterScene.mjs',import.meta.url),'utf8');
  assert.match(housing,/const layout=architectureEnabled\?planned:\{\.\.\.planned,accepted:\[\]\}/);
  assert.match(housing,/for\(const def of CLONE_TOWN_GUARDS\)/);
  assert.ok(WOLFVEIL_TOWN_LEGACY_PURGE.perimeterBandMeters>0);
});
