import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  WORLD_VARIANT_CLASSIC,WORLD_VARIANT_SUIGEN,
  WORLD_VARIANT_STORAGE_KEY,WORLD_VARIANT_LEGACY_STORAGE_KEY,
  SUIGEN_ASSET_PARTS,SUIGEN_WORLD_METADATA,
  readWolfveilWorldVariant,saveWolfveilWorldVariant,
  normalizeWolfveilWorldVariant,
} from '../src/components/game3d/worlds/WolfveilWorldVariants.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('All saved old map selections are overridden by an actual Classic-only rollback',()=>{
  const data=new Map([
    ['game3d_saved_character','unchanged'],
    [WORLD_VARIANT_LEGACY_STORAGE_KEY,'suigen'],
    ['game3d_clone_world_variant_v2','suigen'],
    [WORLD_VARIANT_STORAGE_KEY,'suigen'],
  ]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,val)=>data.set(key,val)};
  for(const v of [null,undefined,'classic','suigen','Dominion','bad-value'])
    assert.equal(normalizeWolfveilWorldVariant(v),WORLD_VARIANT_CLASSIC);
  assert.equal(readWolfveilWorldVariant(storage),WORLD_VARIANT_CLASSIC);
  assert.equal(saveWolfveilWorldVariant(WORLD_VARIANT_SUIGEN,storage),WORLD_VARIANT_CLASSIC);
  assert.equal(data.get(WORLD_VARIANT_STORAGE_KEY),'classic');
  assert.equal(data.get(WORLD_VARIANT_LEGACY_STORAGE_KEY),'suigen');
  assert.equal(data.get('game3d_clone_world_variant_v2'),'suigen');
  assert.equal(data.get('game3d_saved_character'),'unchanged');
});

test('Complete original 2400 m Suigen GLBs are still archived, not deleted',()=>{
  assert.equal(SUIGEN_ASSET_PARTS.length,2);
  assert.equal(new Set(SUIGEN_ASSET_PARTS).size,2);
  for(const url of SUIGEN_ASSET_PARTS){
    assert(url.startsWith('https://media.base44.com/files/public/'));
    assert(url.endsWith('.glb'));
  }
  assert.equal(SUIGEN_WORLD_METADATA.sideMeters,2400);
  assert.equal(SUIGEN_WORLD_METADATA.sourceMeshCount,928);
  assert.deepEqual([SUIGEN_WORLD_METADATA.bounds.minX,
    SUIGEN_WORLD_METADATA.bounds.maxX],[-1200,1200]);
  const archivedLoader=read('src/components/game3d/worlds/loadSuigenWorld.mjs');
  assert(archivedLoader.includes('Promise.all(SUIGEN_ASSET_PARTS.map'));
});

test('Escape graphics settings cannot reactivate the new Dominion scene',()=>{
  const menu=read('src/components/game3d/PauseMenu.jsx');
  assert(menu.includes('label="World map"'));
  assert(menu.includes('Classic Wolfveil · Restored'));
  assert(!menu.includes("id:'suigen',text:"));
  assert(menu.includes('saved character'));
});

test('Active Game 3D renderer contains NO full Suigen map loader or scene switch',()=>{
  const world=read('src/components/game3d/GameWorld3D.jsx');
  assert(!world.includes("from './worlds/loadSuigenWorld.mjs'"));
  assert(!world.includes('loadSuigenWorld('));
  assert(!world.includes('suigenRuntime.setVisible(true)'));
  assert(!world.includes('root.visible=false'));
  assert(!world.includes('for(const root of classicWorldRoots)root.visible=false'));
  assert(world.includes('const applyWorldVariant=()=>'));
  assert(world.includes('showClassic()'));
  assert(world.includes('saveWolfveilWorldVariant(WORLD_VARIANT_CLASSIC)'));
  assert(world.includes('root.visible=originalVisibility.get(root)??true'));
  assert(world.includes('const activeGroundMeshes=()=>suigenActive'));
  assert(world.includes('removeEventListener(WORLD_VARIANT_EVENT,onWorldVariantChange)'));
  for(const expected of ['createVortexLakeLandmark(scene','createLunarMountainEntrance(scene',
    'createAstralMountainGate(scene','createWolfveilVillage(scene'])
    assert(world.includes(expected),expected);
});

test('Only the source-derived trees, rocks and bamboo enter Classic Wolfveil',()=>{
  const world=read('src/components/game3d/GameWorld3D.jsx');
  const accents=read('src/components/game3d/worlds/WolfveilSuigenReuseAssets.mjs');
  assert(world.includes('loadClassicWolfveilSuigenAccents({'));
  assert(world.includes('classicSuigenAccents?.setVisible(true)'));
  assert(accents.includes("root.userData.decorativeOnly=true"));
  assert(accents.includes("root.userData.noGameplayCollision=true"));
  assert(!accents.includes('Map_Terrain_2400m'));
});
