import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WOLFVEIL_SUIGEN_REUSE_ASSET_URL,WOLFVEIL_SUIGEN_REUSE_TYPES,
 WOLFVEIL_SUIGEN_REUSE_PLACEMENTS,eligibleWolfveilSuigenReusePlacement,
} from '../src/components/game3d/worlds/WolfveilSuigenReusePlan.mjs';
import {
 WORLD_VARIANT_CLASSIC,WORLD_VARIANT_SUIGEN,
 WORLD_VARIANT_STORAGE_KEY,WORLD_VARIANT_LEGACY_STORAGE_KEY,
 readWolfveilWorldVariant,saveWolfveilWorldVariant,
} from '../src/components/game3d/worlds/WolfveilWorldVariants.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Classic defaults again, even for users who previously opted into Suigen v1',()=>{
  const data=new Map([[WORLD_VARIANT_LEGACY_STORAGE_KEY,'suigen']]);
  const storage={getItem:key=>data.get(key)??null,
    setItem:(key,value)=>data.set(key,value)};
  assert.notEqual(WORLD_VARIANT_LEGACY_STORAGE_KEY,WORLD_VARIANT_STORAGE_KEY);
  assert.equal(readWolfveilWorldVariant(storage),WORLD_VARIANT_CLASSIC);
  saveWolfveilWorldVariant('suigen',storage);
  assert.equal(readWolfveilWorldVariant(storage),WORLD_VARIANT_SUIGEN);
  saveWolfveilWorldVariant('classic',storage);
  assert.equal(readWolfveilWorldVariant(storage),WORLD_VARIANT_CLASSIC);
  assert.equal(data.get(WORLD_VARIANT_LEGACY_STORAGE_KEY),'suigen');
});

test('Extracted Suigen GLB has six authentic source prefab families',()=>{
  assert(WOLFVEIL_SUIGEN_REUSE_ASSET_URL.startsWith('https://media.base44.com/files/public/'));
  assert(WOLFVEIL_SUIGEN_REUSE_ASSET_URL.endsWith('.glb'));
  assert.equal(Object.keys(WOLFVEIL_SUIGEN_REUSE_TYPES).length,6);
  assert.equal(Object.values(WOLFVEIL_SUIGEN_REUSE_TYPES).reduce((n,t)=>n+t.parts,0),18);
  for(const type of ['CherryTree','OakTree','MapleTree','Bamboo','MossRock','BasaltRock'])
    assert(WOLFVEIL_SUIGEN_REUSE_TYPES[type],type);
});

test('The 30 world-space accents stay optional, original and bounded',()=>{
  assert.equal(WOLFVEIL_SUIGEN_REUSE_PLACEMENTS.length,30);
  const ids=new Set(WOLFVEIL_SUIGEN_REUSE_PLACEMENTS.map(x=>x.id));
  assert.equal(ids.size,26);
  for(const candidate of WOLFVEIL_SUIGEN_REUSE_PLACEMENTS){
    assert(WOLFVEIL_SUIGEN_REUSE_TYPES[candidate.type]);
    assert(candidate.scale>.5&&candidate.scale<2);
    assert(Math.abs(candidate.x)<528);
    assert(Math.abs(candidate.z-70)<528);
  }
});

test('Roads, rivers, reserved tiles, towns and quest landmarks reject placements',()=>{
  const item=WOLFVEIL_SUIGEN_REUSE_PLACEMENTS[0];
  const permit={sampleGroundY:()=>15,insideTravel:()=>true,
    routeDistance:()=>Infinity,riverDistance:()=>Infinity,
    protectedTile:()=>false,insideTown:()=>false,
    nearGameplaySite:()=>false};
  assert(eligibleWolfveilSuigenReusePlacement(item,permit));
  for(const override of [
    {insideTravel:()=>false},{routeDistance:()=>0},{riverDistance:()=>0},
    {protectedTile:()=>true},{insideTown:()=>true},
    {nearGameplaySite:()=>true},{sampleGroundY:()=>null},
  ])assert(!eligibleWolfveilSuigenReusePlacement(item,{...permit,...override}));
  assert(!eligibleWolfveilSuigenReusePlacement({...item,type:'unknown'},permit));
});

test('The imported asset layer has NO terrain, building, nav or collision replacement',()=>{
  const runtime=read('src/components/game3d/worlds/WolfveilSuigenReuseAssets.mjs');
  assert(runtime.includes("new THREE.Group()"));
  assert(runtime.includes("loadAsync(WOLFVEIL_SUIGEN_REUSE_ASSET_URL)"));
  assert(runtime.includes("node=asset.scene.getObjectByName(type+'_Part_'+i)"));
  assert(runtime.includes("noGameplayCollision=true"));
  assert(runtime.includes("mesh.raycast=()=>[]"));
  assert(runtime.includes("root.userData.decorativeOnly=true"));
  assert(runtime.includes("setVisible(visible)"));
  assert(runtime.includes("scene.remove(root)"));
  assert(runtime.includes("disposeImportedPack(asset.scene)"));
  assert(!runtime.includes("Map_Terrain_2400m"));
});

test('Game World selects Classic with source accents and retains full Suigen option',()=>{
  const world=read('src/components/game3d/GameWorld3D.jsx');
  assert(world.includes("loadClassicWolfveilSuigenAccents({"));
  assert(world.includes("classicSuigenAccents?.setVisible(true)"));
  assert(world.includes("classicSuigenAccents?.setVisible(false)"));
  assert(world.includes("classicAccentAbort.abort()"));
  assert(world.includes("classicSuigenAccents?.dispose()"));
  assert(world.includes("loadSuigenWorld({scene,signal:worldMapAbort.signal})"));
  assert(world.includes("for(const root of classicWorldRoots)root.visible=false"));
  assert(world.includes("originalVisibility.get(root)??true"));
  assert(world.includes("wolfveilIsProtectedSWTile"));
  assert(world.includes("insideWolfveilImportedTown"));
  assert(world.includes("wolfveilDistanceToRiver"));
  assert(world.includes("wolfveilRouteClearance"));
});

test('Settings describe Classic as primary while retaining Suigen as archive',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  assert(pause.includes('Classic Wolfveil · Main Map'));
  assert(pause.includes('Dominion of Suigen · Archive'));
  assert(pause.includes('selected'));
  assert(pause.includes('saveWolfveilWorldVariant(next)'));
});
