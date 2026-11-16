import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CAVE_RIM_BUFFER_METRES,MAX_SAFE_CAVE_STEP_METRES,
  SUIGEN_ABYSS_CUT,isInsideSuigenAbyssCut,
  shouldCarveSuigenAbyssTriangle,nearSuigenAbyssRim,
  nearSuigenCaveGround,nearClassicCaveRim,shouldRejectCaveGroundStep,
} from '../src/components/game3d/dungeons/CaveRimSafety.mjs';
import {
  LUNAR_CAVE_CHAMBERS,LUNAR_CAVE_TRAINING_SPAWNS,
  LUNAR_CAVE_TREASURE_SITES,isInsideDungeonWalkway,
} from '../src/components/game3d/dungeons/LunarCaveLayout.mjs';

const read=path=>readFileSync('src/components/game3d/'+path,'utf8');

test('seven-foot cave-rim safety is bounded to actual cave approaches',()=>{
  assert.equal(CAVE_RIM_BUFFER_METRES,2.1336);
  assert.equal(MAX_SAFE_CAVE_STEP_METRES,1.1);
  assert(nearSuigenAbyssRim(-440,405));
  assert(nearSuigenAbyssRim(-440+SUIGEN_ABYSS_CUT.halfWidth+2.1,405));
  assert(!nearSuigenAbyssRim(-440+SUIGEN_ABYSS_CUT.halfWidth+6,405));
  assert(nearSuigenCaveGround(197,224));
  assert(nearSuigenCaveGround(171,222));
  assert(!nearSuigenCaveGround(0,0));
  assert(nearClassicCaveRim(171,225));
  assert(nearClassicCaveRim(-216,146));
  assert(!nearClassicCaveRim(0,0));
});

test('Suigen terrain cut cannot delete a triangle with any vertex in protected outside bank',()=>{
  const v=(x,z)=>({x,z});
  assert(isInsideSuigenAbyssCut(-440,380));
  assert(shouldCarveSuigenAbyssTriangle([v(-440,375),v(-438,375),v(-439,382)]));
  assert(!shouldCarveSuigenAbyssTriangle([v(-440,375),v(-428,375),v(-454,382)]),
    'crossing lip triangles must survive intact');
  assert(!shouldCarveSuigenAbyssTriangle([v(-440,420),v(-440,430),v(-441,422)]),
    'triangle that crosses north rim must survive');
  assert(!shouldCarveSuigenAbyssTriangle([v(-500,375),v(-505,382),v(-502,370)]));
  const source=read('worlds/SuigenMountainWayfinding.mjs');
  assert.match(source,/shouldCarveSuigenAbyssTriangle\(\[vertex\(a\),vertex\(b\),vertex\(c\)\]\)/);
  assert.doesNotMatch(source,/inside\(a\)\|\|inside\(b\)\|\|inside\(c\)/);
  assert.match(source,/let localCarved=0/);
  assert.match(source,/mesh\.userData\.suigenAbyssCarvedTriangles=localCarved/);
});

test('floor void or cliff-height discontinuity is blocked but real cave stairs and distant routes remain walkable',()=>{
  const from={x:-440,z:399},to={x:-440,z:398.6};
  const make=(fromGroundY,toGroundY,variant='suigen')=>
    shouldRejectCaveGroundStep({from,to,fromGroundY,toGroundY,variant});
  assert.equal(make(0,-.17),false,'fine stair riser remains walkable');
  assert.equal(make(-21,-21.2),false);
  assert.equal(make(-21,null),true,'unregistered floor void is blocked');
  assert.equal(make(2,-2),true,'sudden plunge is blocked');
  assert.equal(make(2,5),true,'sudden roof snap is blocked');
  assert.equal(make(2,2),false);
  assert.equal(shouldRejectCaveGroundStep({
    from:{x:0,z:0},to:{x:1,z:1},fromGroundY:30,toGroundY:null,
    variant:'suigen',
  }),false,'outside cave band the game retains its existing terrain rules');
  assert.equal(shouldRejectCaveGroundStep({
    from:{x:171,z:221},to:{x:171,z:221.5},fromGroundY:80,toGroundY:60,
    variant:'classic',
  }),true);
  assert.match(read('GameWorld3D.jsx'),/shouldRejectCaveGroundStep\(\{/);
  assert.match(read('GameWorld3D.jsx'),/!dedicatedMode && mapReady/);
});

test('five increasingly difficult Lunar Cave halls keep genuine enemies and one server-gated cache each',()=>{
  assert.equal(LUNAR_CAVE_CHAMBERS.length,5);
  assert.equal(LUNAR_CAVE_TREASURE_SITES.length,5);
  assert.equal(LUNAR_CAVE_TRAINING_SPAWNS.length,25);
  for(const chamber of LUNAR_CAVE_CHAMBERS){
    assert(LUNAR_CAVE_TRAINING_SPAWNS.some(spawn=>spawn.chamber===chamber.index));
    assert(LUNAR_CAVE_TREASURE_SITES.some(cache=>cache.chamberId===chamber.id));
  }
  for(const cache of LUNAR_CAVE_TREASURE_SITES){
    assert.equal(cache.rewardAuthority,'server-required');
    assert(isInsideDungeonWalkway(cache.x,cache.z,.62),
      'treasure cache outside reachable cave: '+cache.id);
  }
  const scene=read('dungeons/LunarCaveScene.js');
  assert.match(scene,/addLunarTreasureCaches\(root\)/);
  assert.match(scene,/inspectTreasure\(position,radius=3\.1\)/);
  assert.match(scene,/lastSafe=\{x:0,z:0\}/);
  assert.match(scene,/if\(isInsideDungeonWalkway\(position\.x,position\.z,\.62\)\)/);
  assert.match(scene,/rewardStatus:'sealed'/);
  assert.doesNotMatch(scene,/grantQuestReward|grantLoot|giveSilver|bankXP|awardExperience/);
  assert.match(read('GameWorld3D.jsx'),/lunarDungeon\?\.inspectTreasure\(model\.position\)/);
  assert.match(read('GameWorld3D.jsx'),/Rewards require verified dungeon completion/);
});
